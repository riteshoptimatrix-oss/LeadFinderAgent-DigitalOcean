from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import pandas as pd
import tempfile
import os
import re
from urllib.parse import unquote_plus
import asyncio
import smtplib
import ssl
import socket
from app.db.database import get_db
from app.api.dependencies import get_current_user, require_email_automation_access
from app.models.user import UserInDB
from app.core.websocket import manager
from app.core.logger import logger
from app.core.security_crypto import encrypt_string, decrypt_string
from app.services.smtp_service import run_smtp_verification_sync, get_user_smtp_config, save_user_smtp_config
from app.models.email_ai import (
    EmailAISmtpCreate, EmailAISmtpUpdate,
    EmailAITemplateCreate, EmailAITemplateUpdate,
    EmailAICampaignCreate
)

router = APIRouter()

def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    d = dict(doc)
    if "_id" in d:
        d["_id"] = str(d["_id"])
    if "password" in d:
        d["has_password"] = bool(d["password"])
        d["password"] = "••••••••••••••••" if d["password"] else ""
    return d

def get_user_match_filter(current_user: UserInDB) -> List[Dict[str, Any]]:
    uid = str(current_user.id)
    match_list: List[Dict[str, Any]] = [{"user_id": uid}]
    if ObjectId.is_valid(uid):
        match_list.append({"user_id": ObjectId(uid)})
    if getattr(current_user, "email", None):
        match_list.append({"user_id": current_user.email})
    return match_list


async def resolve_effective_smtp_profile(
    db,
    current_user: UserInDB,
    smtp_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Multi-tier SMTP profile resolution:
    1. If specific smtp_id provided: check email_ai_smtp with access permission.
    2. Active default or priority profile from email_ai_smtp matching current user (or admin system profile).
    3. User Settings fallback (db['settings'], db['users.email_settings']) with decrypted password.
    4. Admin / System env fallback if SMTP_SERVER / SMTP_USERNAME / SMTP_PASSWORD configured.
    """
    from app.services.smtp_service import get_user_smtp_config, clean_app_password, is_masked_or_empty
    from app.core.security_crypto import decrypt_string
    from app.core.config import settings as app_settings

    uid_str = str(current_user.id)
    is_admin = str(getattr(current_user, "role", "")).upper() in ["ADMIN", "SUPERADMIN"]
    user_match = get_user_match_filter(current_user)

    # 1. Targeted profile by ID
    if smtp_id and ObjectId.is_valid(smtp_id):
        target_oid = ObjectId(smtp_id)
        cond: Dict[str, Any] = {"_id": target_oid, "is_active": {"$ne": False}}
        if not is_admin:
            cond["$or"] = user_match + [{"is_system": True, "user_id": None}]
        found = await db["email_ai_smtp"].find_one(cond)
        if found and found.get("password"):
            return found

    # 2. User-scoped active profile in email_ai_smtp
    query_or = list(user_match)
    if is_admin:
        query_or.extend([
            {"user_id": None},
            {"user_id": {"$exists": False}},
            {"is_system": True}
        ])
    else:
        query_or.append({"is_system": True, "user_id": None})

    active_profile = await db["email_ai_smtp"].find_one(
        {
            "is_active": {"$ne": False},
            "$or": query_or
        },
        sort=[("is_default", -1), ("priority", 1), ("updated_at", -1)]
    )
    if active_profile and active_profile.get("password"):
        p_from = (active_profile.get("from_name") or "").strip()
        p_name = (active_profile.get("name") or "").strip()
        uname = (active_profile.get("username") or "").split("@")[0].replace(".", " ").title() or getattr(current_user, "full_name", "")
        if not p_from or p_from.lower().startswith("default relay"):
            active_profile["from_name"] = uname or "Lead Finder"
        if not p_name or p_name.lower().startswith("default relay"):
            active_profile["name"] = f"{uname} Relay" if uname else "Outbound Relay"
        return active_profile

    # 3. Fallback to User Settings & Users collection via get_user_smtp_config
    cfg = await get_user_smtp_config(db, uid_str, decrypt_pwd=True)
    if cfg and cfg.get("smtp_pass") and not is_masked_or_empty(cfg.get("smtp_pass")):
        uname = (cfg.get("smtp_user") or getattr(current_user, "email", "")).split("@")[0].replace(".", " ").title()
        eff_sender = cfg.get("smtp_sender_name") or getattr(current_user, "full_name", "") or uname or "Lead Finder"
        return {
            "name": f"{eff_sender} Relay",
            "host": cfg.get("smtp_host", "smtp.gmail.com"),
            "port": int(cfg.get("smtp_port", 587) or 587),
            "username": cfg.get("smtp_user") or getattr(current_user, "email", ""),
            "password": cfg.get("smtp_pass"),
            "encryption": cfg.get("smtp_encryption", "TLS"),
            "from_email": cfg.get("smtp_from_email") or cfg.get("smtp_user") or getattr(current_user, "email", ""),
            "from_name": eff_sender,
            "timeout": 15,
            "is_active": True,
        }

    # 3b. Check db["settings"] directly for any format variations
    query_settings: List[Dict[str, Any]] = [
        {"user_id": uid_str},
    ]
    if getattr(current_user, "email", None):
        query_settings.append({"user_id": current_user.email})
    if ObjectId.is_valid(uid_str):
        query_settings.append({"user_id": ObjectId(uid_str)})
    raw_settings = await db["settings"].find_one({"$or": query_settings})
    if raw_settings and raw_settings.get("smtp_pass") and not is_masked_or_empty(raw_settings.get("smtp_pass")):
        raw_pwd = decrypt_string(raw_settings["smtp_pass"])
        clean_pwd = clean_app_password(raw_pwd, raw_settings.get("smtp_host", ""))
        uname = (raw_settings.get("smtp_user") or getattr(current_user, "email", "")).split("@")[0].replace(".", " ").title()
        eff_sender = raw_settings.get("smtp_sender_name") or getattr(current_user, "full_name", "") or uname or "Lead Finder"
        return {
            "name": f"{eff_sender} Relay",
            "host": raw_settings.get("smtp_host", "smtp.gmail.com"),
            "port": int(raw_settings.get("smtp_port", 587) or 587),
            "username": raw_settings.get("smtp_user") or getattr(current_user, "email", ""),
            "password": clean_pwd,
            "encryption": raw_settings.get("smtp_encryption", "TLS"),
            "from_email": raw_settings.get("smtp_from_email") or raw_settings.get("smtp_user") or getattr(current_user, "email", ""),
            "from_name": eff_sender,
            "timeout": 15,
            "is_active": True,
        }

    # 4. Fallback for admin or system: environment SMTP if configured
    if is_admin and app_settings.smtp_is_configured:
        env_dict = app_settings.smtp_profile_dict(name="System Outbound Relay")
        env_dict["from_name"] = app_settings.SMTP_FROM_NAME or getattr(current_user, "full_name", "") or "Lead Finder Agent"
        return env_dict

    # 5. Fallback for admin: any active SMTP profile in the database
    if is_admin:
        any_profile = await db["email_ai_smtp"].find_one(
            {"is_active": {"$ne": False}, "password": {"$exists": True, "$ne": ""}},
            sort=[("is_default", -1), ("updated_at", -1)]
        )
        if any_profile and any_profile.get("password"):
            p_from = (any_profile.get("from_name") or "").strip()
            p_name = (any_profile.get("name") or "").strip()
            uname = (any_profile.get("username") or "").split("@")[0].replace(".", " ").title() or getattr(current_user, "full_name", "")
            if not p_from or p_from.lower().startswith("default relay"):
                any_profile["from_name"] = uname or "Lead Finder"
            if not p_name or p_name.lower().startswith("default relay"):
                any_profile["name"] = f"{uname} Relay" if uname else "Outbound Relay"
            return any_profile

    return None

# ==========================================
# SMTP Profiles
# ==========================================
@router.get("/smtp", response_model=List[Dict[Any, Any]])
async def get_smtp_profiles(
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    # User-wise segregation: Users only see their own SMTP profiles or shared system profiles
    if str(current_user.role).upper() in ["ADMIN", "SUPERADMIN"]:
        query = {
            "is_active": {"$ne": False},
            "$or": user_match + [{"user_id": None}, {"user_id": {"$exists": False}}]
        }
    else:
        query = {
            "is_active": {"$ne": False},
            "$or": user_match + [{"is_system": True, "user_id": None}]
        }
    profiles = await db["email_ai_smtp"].find(query).to_list(100)
    if not profiles:
        # Fallback: check if user configured SMTP in Settings
        config = await get_user_smtp_config(db, str(current_user.id), decrypt_pwd=False)
        if config and config.get("has_password"):
            await save_user_smtp_config(db, str(current_user.id), config)
            profiles = await db["email_ai_smtp"].find(query).to_list(100)
    return [serialize_doc(p) for p in profiles]

@router.post("/smtp", response_model=Dict[Any, Any])
async def create_smtp_profile(
    profile: EmailAISmtpCreate,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    new_profile = profile.model_dump()
    new_profile["user_id"] = str(current_user.id)
    new_profile["created_at"] = datetime.now(timezone.utc)
    new_profile["updated_at"] = datetime.now(timezone.utc)
    
    # Auto-clean Google App Password spaces and encrypt at rest
    raw_pwd = str(new_profile.get("password") or "").strip()
    host = str(new_profile.get("host") or "").lower()
    clean_pwd = raw_pwd.replace(" ", "") if ("gmail" in host and len(raw_pwd.replace(" ", "")) == 16) else raw_pwd
    new_profile["password"] = encrypt_string(clean_pwd)

    if new_profile.get("is_default"):
        await db["email_ai_smtp"].update_many(
            {"user_id": str(current_user.id)},
            {"$set": {"is_default": False}}
        )
        
    result = await db["email_ai_smtp"].insert_one(new_profile)
    created = await db["email_ai_smtp"].find_one({"_id": result.inserted_id})
    return serialize_doc(created)

@router.delete("/smtp/{id}")
async def delete_smtp_profile(
    id: str,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SMTP profile id")
        
    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    res = await db["email_ai_smtp"].update_one(
        filter_q,
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="SMTP profile not found or permission denied")
    return {"message": "Deleted"}

@router.put("/smtp/{id}", response_model=Dict[Any, Any])
async def update_smtp_profile(
    id: str,
    payload: EmailAISmtpUpdate,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    """Update SMTP Relay profile including custom relay name, sender display name, and credentials."""
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SMTP profile id")

    filter_q: Dict[str, Any] = {"_id": oid, "is_active": {"$ne": False}}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "password" in update_data:
        raw_pwd = str(update_data["password"]).strip()
        from app.services.smtp_service import is_masked_or_empty, clean_app_password
        if raw_pwd and not is_masked_or_empty(raw_pwd):
            host = str(update_data.get("host") or "").lower()
            clean_pwd = clean_app_password(raw_pwd, host)
            update_data["password"] = encrypt_string(clean_pwd)
        else:
            del update_data["password"]

    if update_data.get("is_default"):
        await db["email_ai_smtp"].update_many(
            {"user_id": str(current_user.id)},
            {"$set": {"is_default": False}}
        )

    update_data["updated_at"] = datetime.now(timezone.utc)
    res = await db["email_ai_smtp"].find_one_and_update(
        filter_q,
        {"$set": update_data},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="SMTP profile not found or permission denied")
    return serialize_doc(res)

def _run_smtp_verification_sync(
    host: str,
    port: int,
    encryption: str,
    username: str,
    password: str,
    from_email: Optional[str] = None,
    from_name: Optional[str] = None,
    timeout: int = 15,
    send_test: bool = False,
    recipient: Optional[str] = None
) -> Dict[str, Any]:
    """Synchronous SMTP connect, auth, and optional test email dispatch with intelligent Google App Password handling."""
    host = host.strip()
    username = username.strip()
    raw_pwd = str(password or "").strip()
    clean_pwd = raw_pwd.replace(" ", "") if ("gmail" in host.lower() and len(raw_pwd.replace(" ", "")) == 16) else raw_pwd
    encryption = (encryption or "TLS").upper().strip()
    timeout = int(timeout or 15)
    
    eff_from = (from_email or username).strip()
    target_recipient = (recipient or username).strip()

    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    primary_is_ssl = (port == 465) or (encryption in ["SSL", "SMTPS"])
    strategies = []
    if primary_is_ssl:
        strategies.append({"mode": "SSL", "port": port})
        if port == 465:
            strategies.append({"mode": "TLS", "port": 587})
    else:
        strategies.append({"mode": "TLS", "port": port})
        if port == 587:
            strategies.append({"mode": "SSL", "port": 465})

    server = None
    last_error = None
    connected_strategy = None

    for strat in strategies:
        strat_mode = strat["mode"]
        strat_port = strat["port"]
        server = None
        try:
            logger.info(f"[EmailAI-Test] Connecting {host}:{strat_port} ({strat_mode})...")
            if strat_mode == "SSL":
                server = smtplib.SMTP_SSL(host, strat_port, timeout=timeout, context=context)
                server.ehlo()
            else:
                server = smtplib.SMTP(host, strat_port, timeout=timeout)
                server.ehlo()
                if encryption != "NONE":
                    server.starttls(context=context)
                    server.ehlo()

            # Attempt login with clean App Password
            try:
                server.login(username, clean_pwd)
            except smtplib.SMTPServerDisconnected:
                if clean_pwd != raw_pwd:
                    # Retry with raw password
                    try:
                        server = smtplib.SMTP_SSL(host, strat_port, timeout=timeout, context=context) if strat_mode == "SSL" else smtplib.SMTP(host, strat_port, timeout=timeout)
                        server.ehlo()
                        if strat_mode != "SSL" and encryption != "NONE":
                            server.starttls(context=context)
                            server.ehlo()
                        server.login(username, raw_pwd)
                    except Exception:
                        raise HTTPException(
                            status_code=400,
                            detail="Google/Gmail rejected credentials and closed the connection. "
                                   "Please verify: 1) You have 2-Step Verification ON in your Google Account. "
                                   "2) You generated and used a 16-character Google App Password (not your Gmail account password) from Google Security settings."
                        )
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="Google/Gmail rejected credentials and closed the connection. "
                               "Please verify: 1) You have 2-Step Verification ON in your Google Account. "
                               "2) You generated and used a 16-character Google App Password (not your Gmail account password) from Google Security settings."
                    )

            connected_strategy = strat
            logger.info(f"[EmailAI-Test] Authenticated successfully as {username} on {host}:{strat_port}")
            break
        except HTTPException:
            raise
        except smtplib.SMTPAuthenticationError as e:
            logger.warning(f"[EmailAI-Test] Auth failed for {username}: {e}")
            raise HTTPException(
                status_code=400,
                detail=f"SMTP Authentication Failed: {e}. If using Gmail, an App Password is required."
            )
        except (smtplib.SMTPServerDisconnected, ConnectionResetError, BrokenPipeError, TimeoutError, socket.timeout) as e:
            logger.warning(f"[EmailAI-Test] Disconnected on {host}:{strat_port}: {e}")
            last_error = f"Connection closed by {host}:{strat_port}. Please check port (465 SSL, 587 TLS), ensure your App Password is correct, and verify hosting provider does not block outbound SMTP."
            continue
        except Exception as e:
            logger.warning(f"[EmailAI-Test] Failed on {host}:{strat_port}: {e}")
            last_error = str(e)
            continue
        finally:
            if not connected_strategy and server:
                try:
                    server.quit()
                except Exception:
                    pass

    if not connected_strategy or not server:
        raise HTTPException(status_code=400, detail=last_error or f"SMTP connection failed for {host}:{port}")

    result = {
        "status": "success",
        "host": host,
        "port": connected_strategy["port"],
        "mode": connected_strategy["mode"],
        "message": f"SMTP Connection & Authentication Verified on port {connected_strategy['port']} ({connected_strategy['mode']})!"
    }

    if send_test or recipient:
        try:
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            test_msg = MIMEMultipart("alternative")
            test_msg["Subject"] = f"[LeadFinder AI] SMTP Verification Test Email ({datetime.now().strftime('%H:%M:%S')})"
            test_msg["From"] = f"{from_name} <{eff_from}>" if from_name else eff_from
            test_msg["To"] = target_recipient

            now_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
            html_content = f"""
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
                <div style="display: flex; align-items: center; margin-bottom: 20px;">
                    <h2 style="color: #4f46e5; margin: 0; font-size: 20px;">LeadFinder AI · SMTP Relay Test</h2>
                </div>
                <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
                    Hello! This is a test email sent from <strong>LeadFinder AI Email Automation Studio</strong> to verify that your outbound SMTP dispatch relay is working properly.
                </p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; font-size: 13px; color: #475569; line-height: 1.8;">
                    <div><strong>SMTP Relay:</strong> {host}:{connected_strategy['port']} ({connected_strategy['mode']})</div>
                    <div><strong>Authenticated Sender:</strong> {eff_from}</div>
                    <div><strong>Target Recipient:</strong> {target_recipient}</div>
                    <div><strong>Dispatch Timestamp:</strong> {now_str}</div>
                    <div><strong>Status:</strong> <span style="color: #16a34a; font-weight: bold;">Verified & Operational</span></div>
                </div>
                <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
                    Your email configuration is complete and ready to dispatch campaigns.
                </p>
            </div>
            """
            test_msg.attach(MIMEText(html_content, "html", "utf-8"))
            envelope_sender = eff_from.split("<")[-1].split(">")[0].strip() if "<" in eff_from else eff_from
            server.sendmail(envelope_sender, [target_recipient], test_msg.as_string())
            result["message"] = f"SMTP verified! Test email successfully sent and delivered to {target_recipient}."
            result["test_email_sent"] = True
            result["recipient"] = target_recipient
            logger.info(f"[EmailAI-Test] Test email successfully sent to {target_recipient}")
        except Exception as send_err:
            logger.warning(f"[EmailAI-Test] Test email send failed: {send_err}")
            raise HTTPException(status_code=400, detail=f"Connected and authenticated, but failed to deliver test email to {target_recipient}: {send_err}")

    try:
        server.quit()
    except Exception:
        pass

    return result

@router.get("/smtp/{id}/test")
async def test_smtp_profile(
    id: str,
    send_test: bool = Query(False, description="Also send a real test email"),
    recipient: Optional[str] = Query(None, description="Target recipient email (e.g. nikunj.optimatrix@gmail.com)"),
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    try:
        profile = await db["email_ai_smtp"].find_one({"_id": ObjectId(id), "is_active": {"$ne": False}})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SMTP profile id.")
    if not profile:
        raise HTTPException(status_code=404, detail="SMTP profile not found.")

    host = (profile.get("host") or "").strip()
    port = int(profile.get("port", 587))
    username = (profile.get("username") or "").strip()
    password = decrypt_string(str(profile.get("password") or ""))
    encryption = (profile.get("encryption") or "TLS").upper().strip()
    timeout = int(profile.get("timeout", 15) or 15)
    from_email = (profile.get("from_email") or profile.get("email") or username).strip()
    from_name = (profile.get("from_name") or profile.get("name") or "").strip()

    loop = asyncio.get_running_loop()
    res = await loop.run_in_executor(
        None,
        run_smtp_verification_sync,
        host, port, encryption, username, password, from_email, from_name, timeout, send_test, recipient
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "SMTP test failed."))
    return res

class EmailAISmtpDirectTestRequest(BaseModel):
    host: str
    port: int = 587
    encryption: str = "TLS"
    username: str
    password: str
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    timeout: int = 15
    send_test: bool = False
    recipient: Optional[str] = "nikunj.optimatrix@gmail.com"

@router.post("/smtp/test-direct")
async def test_smtp_direct(
    request: EmailAISmtpDirectTestRequest,
    current_user: UserInDB = Depends(require_email_automation_access)
):
    loop = asyncio.get_running_loop()
    res = await loop.run_in_executor(
        None,
        run_smtp_verification_sync,
        request.host,
        request.port,
        request.encryption,
        request.username,
        request.password,
        request.from_email,
        request.from_name,
        request.timeout,
        request.send_test,
        request.recipient
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "SMTP direct test failed."))
    return res

# ==========================================
# Templates
# ==========================================
@router.get("/templates", response_model=List[Dict[Any, Any]])
async def get_templates(
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query = {
        "is_active": {"$ne": False},
        "$or": user_match + [{"user_id": None}, {"user_id": {"$exists": False}}, {"user_id": "system"}]
    }
    templates = await db["email_ai_templates"].find(query).to_list(100)
    return [serialize_doc(t) for t in templates]

@router.post("/templates", response_model=Dict[Any, Any])
async def create_template(
    template: EmailAITemplateCreate,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    new_template = template.model_dump()
    new_template["user_id"] = str(current_user.id)
    new_template["created_at"] = datetime.now(timezone.utc)
    new_template["updated_at"] = datetime.now(timezone.utc)
    
    result = await db["email_ai_templates"].insert_one(new_template)
    created = await db["email_ai_templates"].find_one({"_id": result.inserted_id})
    return serialize_doc(created)

@router.delete("/templates/{id}")
async def delete_template(
    id: str,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template id")
        
    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    res = await db["email_ai_templates"].update_one(
        filter_q,
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found or permission denied")
    return {"message": "Deleted"}


@router.put("/templates/{id}", response_model=Dict[Any, Any])
async def update_template(
    id: str,
    template: EmailAITemplateUpdate,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template id")

    update_data = {k: v for k, v in template.model_dump(exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
        
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    result = await db["email_ai_templates"].update_one(
        filter_q,
        {
            "$set": update_data,
            "$inc": {"version": 1}
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found or permission denied")
        
    updated = await db["email_ai_templates"].find_one({"_id": oid})
    return serialize_doc(updated)

@router.put("/templates/{id}/favorite", response_model=Dict[Any, Any])
async def favorite_template(
    id: str,
    is_favorite: bool = Query(...),
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template id")

    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    result = await db["email_ai_templates"].update_one(
        filter_q,
        {"$set": {"is_favorite": is_favorite, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found or permission denied")
    updated = await db["email_ai_templates"].find_one({"_id": oid})
    return serialize_doc(updated)

@router.post("/templates/{id}/duplicate", response_model=Dict[Any, Any])
async def duplicate_template(
    id: str,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template id")

    template = await db["email_ai_templates"].find_one({"_id": oid})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    template.pop("_id", None)
    template["name"] = f"{template.get('name', 'Template')} (Copy)"
    template["user_id"] = str(current_user.id)
    template["created_at"] = datetime.now(timezone.utc)
    template["updated_at"] = datetime.now(timezone.utc)
    template["version"] = 1
    template["usage_count"] = 0
    
    result = await db["email_ai_templates"].insert_one(template)
    created = await db["email_ai_templates"].find_one({"_id": result.inserted_id})
    return serialize_doc(created)

class TemplateTestSendRequest(BaseModel):
    template_id: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    to_email: str
    smtp_id: Optional[str] = None
    sender_name: Optional[str] = Field(None, description="Custom sender / relay display name (e.g. 'OptiMatrix Solutions')")

@router.post("/templates/test-send")
async def send_template_test_email(
    payload: TemplateTestSendRequest,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    """Dispatch a live test email rendered from a template (or current draft) to verify visual rendering and inbox delivery."""
    from app.services.email_ai.smtp_worker import EmailAIQueueWorker
    from app.services.email_ai.tracking_utils import (
        apply_email_tracking,
        build_message_id,
        generate_tracking_id,
        get_tracking_base_url,
    )
    import uuid

    to_email = payload.to_email.strip().lower()
    if not re.match(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$', to_email):
        raise HTTPException(status_code=400, detail="Invalid recipient email address")

    uid_str = str(current_user.id)

    # 1. Resolve content: load template or use draft
    subject = payload.subject or ""
    body_html = payload.body_html or ""
    body_text = payload.body_text or ""
    template_name = "Draft Template"

    if payload.template_id and ObjectId.is_valid(payload.template_id):
        tmpl = await db["email_ai_templates"].find_one({"_id": ObjectId(payload.template_id)})
        if tmpl:
            template_name = tmpl.get("name", "Template")
            subject = subject or tmpl.get("subject", "")
            body_html = body_html or tmpl.get("body_html", "")
            body_text = body_text or tmpl.get("body_text", "")

    if not subject:
        subject = f"Test Email: {template_name}"
    if not body_html and not body_text:
        body_html = "<p>This is a test email preview from LeadFinder AI.</p>"

    # Sample variables substitution
    sample_lead = {
        "name": "Jane Doe",
        "first_name": "Jane",
        "last_name": "Doe",
        "email": to_email,
        "business_name": "Acme Innovations",
        "company": "Acme Innovations",
        "phone": "+1 555-0199",
        "city": "San Francisco",
        "state": "CA",
        "country": "United States",
        "website": "https://example.com",
    }
    for k, v in sample_lead.items():
        subject = subject.replace(f"{{{{{k}}}}}", str(v))
        if body_html:
            body_html = body_html.replace(f"{{{{{k}}}}}", str(v))
        if body_text:
            body_text = body_text.replace(f"{{{{{k}}}}}", str(v))

    # 2. Resolve SMTP Profile with multi-tier fallback (targeted ID -> active/default -> Settings -> Users -> Env)
    smtp_profile = await resolve_effective_smtp_profile(db, current_user, payload.smtp_id)

    if not smtp_profile or not smtp_profile.get("password"):
        raise HTTPException(
            status_code=400,
            detail="No active SMTP configuration found. Please configure your SMTP App Password in Settings > Email Automation or add an SMTP account in Mail Sender."
        )

    # Custom relay / sender display name override
    if payload.sender_name and payload.sender_name.strip():
        custom_sender = payload.sender_name.strip()
        smtp_profile["from_name"] = custom_sender
        smtp_profile["name"] = custom_sender

    # 3. Apply tracking & generate Message-ID
    tracking_id = generate_tracking_id(uid_str, "template_test", to_email, uuid.uuid4().hex)
    message_id = build_message_id(tracking_id)
    public_base = get_tracking_base_url()
    tracked_html = apply_email_tracking(body_html, tracking_id, open_tracking=True, click_tracking=False, base_url=public_base)

    # 4. Dispatch via worker in executor
    worker = EmailAIQueueWorker(db)
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(
            None,
            worker._send_email_sync,
            smtp_profile,
            to_email,
            subject,
            tracked_html,
            body_text,
            message_id,
        )
    except Exception as exc:
        err_msg = str(exc)
        logger.error(f"[EmailAI-TemplateTest] Dispatch failed to {to_email}: {err_msg}")
        raise HTTPException(status_code=400, detail=f"SMTP dispatch failed: {err_msg}")

    # Record in tracking collection
    now = datetime.now(timezone.utc)
    track_doc = {
        "tracking_id": tracking_id,
        "message_id": message_id,
        "user_id": uid_str,
        "campaign_id": "template_test",
        "campaign_name": f"Test: {template_name}",
        "lead_id": "test",
        "lead_name": to_email,
        "recipient_email": to_email,
        "subject": subject,
        "status": "SENT",
        "error_message": None,
        "is_test": True,
        "sent_at": now,
        "opened": False,
        "opened_at": None,
        "open_count": 0,
        "clicked": False,
        "clicked_at": None,
        "click_count": 0,
        "clicked_urls": [],
        "replied": False,
        "replied_at": None,
        "followups_paused": False,
        "created_at": now,
        "updated_at": now,
    }
    await db["email_tracking"].insert_one(track_doc)

    return {
        "status": "success",
        "message": f"Test email successfully sent to {to_email}!",
        "tracking_id": tracking_id,
        "recipient": to_email,
        "subject": subject,
    }

# ==========================================
# Campaigns
# ==========================================
@router.get("/campaigns", response_model=List[Dict[Any, Any]])
async def get_campaigns(
    status: Optional[str] = None,
    search: Optional[str] = None,
    all_users: bool = Query(False),
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query: Dict[str, Any] = {}
    if not (all_users and str(current_user.role).upper() in ["ADMIN", "SUPERADMIN"]):
        query["$or"] = user_match

    if status:
        query["status"] = status
    if search:
        search_filter = [
            {"name": {"$regex": search, "$options": "i"}},
            {"info.name": {"$regex": search, "$options": "i"}}
        ]
        if "$or" in query:
            query = {"$and": [{"$or": query["$or"]}, {"$or": search_filter}]}
            if status:
                query["status"] = status
        else:
            query["$or"] = search_filter
        
    campaigns = await db["email_ai_campaigns"].find(query).sort("created_at", -1).to_list(100)
    return [serialize_doc(c) for c in campaigns]

@router.post("/campaigns", response_model=Dict[Any, Any])
async def create_campaign(
    campaign: EmailAICampaignCreate,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    start = datetime.now(timezone.utc)
    logger.info(
        f"[EmailAI] create_campaign: user={current_user.email}, name={campaign.info.name}, "
        f"leads={len(campaign.target_leads)}, template={campaign.template_id}, smtp={campaign.smtp_id}"
    )

    # ── Step-by-Step Strict Validation ─────────────────────────────
    # Step 1: Target Leads
    if not campaign.target_leads or len(campaign.target_leads) == 0:
        raise HTTPException(
            status_code=400,
            detail="Step 1 Validation Failed: At least one targeted lead must be selected."
        )

    # Validate lead ids are valid ObjectIds (avoid queueing garbage references)
    invalid_ids = [lid for lid in campaign.target_leads if not ObjectId.is_valid(lid)]
    if invalid_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Step 1 Validation Failed: Invalid lead id(s) in target_leads: {invalid_ids[:5]}"
        )

    # Step 2: Email Template
    if not campaign.template_id or not ObjectId.is_valid(campaign.template_id):
        raise HTTPException(
            status_code=400,
            detail="Step 2 Validation Failed: Invalid or missing template_id."
        )

    try:
        template = await db["email_ai_templates"].find_one(
            {"_id": ObjectId(campaign.template_id), "is_active": {"$ne": False}}
        )
        if not template:
            raise HTTPException(status_code=400, detail="Step 2 Validation Failed: Selected template does not exist or is inactive.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Step 2 Validation Failed: Invalid template_id.")

    # Step 3: SMTP & Wizard Config
    if not campaign.smtp_id or not ObjectId.is_valid(campaign.smtp_id):
        raise HTTPException(
            status_code=400,
            detail="Step 3 Validation Failed: Invalid or missing smtp_id."
        )

    try:
        smtp_profile = await db["email_ai_smtp"].find_one(
            {"_id": ObjectId(campaign.smtp_id), "is_active": {"$ne": False}}
        )
        if not smtp_profile:
            raise HTTPException(status_code=400, detail="Step 3 Validation Failed: Selected SMTP profile does not exist or is inactive.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Step 3 Validation Failed: Invalid smtp_id.")

    if not campaign.info or not campaign.info.name or not campaign.info.name.strip():
        raise HTTPException(status_code=400, detail="Step 3 Validation Failed: Campaign name is required.")

    new_campaign = campaign.model_dump()
    new_campaign["user_id"] = str(current_user.id)
    new_campaign["name"] = campaign.info.name
    new_campaign["created_at"] = datetime.now(timezone.utc)
    new_campaign["updated_at"] = datetime.now(timezone.utc)
    new_campaign["status"] = "QUEUED"
    new_campaign["leads_processed"] = []
    new_campaign["logs"] = []

    try:
        result = await db["email_ai_campaigns"].insert_one(new_campaign)
    except Exception as e:
        logger.error(f"[EmailAI] create_campaign failed to persist campaign: {e}")
        raise HTTPException(status_code=500, detail="Failed to persist campaign. Please try again.")

    created = await db["email_ai_campaigns"].find_one({"_id": result.inserted_id})

    duration = (datetime.now(timezone.utc) - start).total_seconds()
    logger.info(
        f"[EmailAI] create_campaign SUCCESS: campaign_id={result.inserted_id}, user={current_user.email}, "
        f"status=QUEUED, leads={len(campaign.target_leads)}, duration_ms={round(duration * 1000, 2)}"
    )
    return serialize_doc(created)

@router.post("/campaigns/{campaign_id}/{action}")
async def control_campaign(
    campaign_id: str,
    action: str,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    if action not in ["pause", "resume", "cancel"]:
        raise HTTPException(status_code=400, detail="Invalid action")
        
    status_map = {
        "pause": "PAUSED",
        "resume": "RUNNING",
        "cancel": "CANCELLED"
    }

    try:
        oid = ObjectId(campaign_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign_id")

    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)
    
    result = await db["email_ai_campaigns"].update_one(
        filter_q,
        {"$set": {"status": status_map[action], "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found or permission denied")

    # Cancelling also finalizes any outstanding Pending/Waiting jobs so the
    # campaign does not remain open indefinitely.
    if action == "cancel":
        cancel_result = await db["email_ai_queue"].update_many(
            {"campaign_id": campaign_id, "status": {"$in": ["Pending", "Waiting"]}},
            {
                "$set": {"status": "Cancelled", "updated_at": datetime.now(timezone.utc)},
                "$push": {"logs": "Status changed to Cancelled: campaign cancelled"}
            }
        )
        logger.info(f"[EmailAI] control_campaign cancel: finalized {cancel_result.modified_count} pending job(s) for campaign {campaign_id}")

    return {"message": f"Campaign {action}ed successfully"}

@router.get("/campaigns/{campaign_id}/live-status")
async def get_campaign_live_status(
    campaign_id: str,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(campaign_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign_id")

    # Try to find campaign with ownership check first, fallback to global lookup for visibility
    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    campaign = await db["email_ai_campaigns"].find_one(filter_q)
    if not campaign:
        # Fallback: allow viewing if campaign exists (prevents 404 for completed campaigns/ownership edge cases)
        campaign = await db["email_ai_campaigns"].find_one({"_id": oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    # Aggregate from email_ai_queue
    pipeline = [
        {"$match": {"campaign_id": campaign_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_counts = await db["email_ai_queue"].aggregate(pipeline).to_list(None)
    
    stats = {
        "Pending": 0,
        "Waiting": 0,
        "Preparing": 0,
        "Connecting": 0,
        "Sending": 0,
        "Delivered": 0,
        "Failed": 0,
        "Skipped": 0,
        "Cancelled": 0
    }
    
    for sc in status_counts:
        status_name = sc["_id"]
        if status_name in stats:
            stats[status_name] = sc["count"]
            
    # Fetch latest active logs
    latest_jobs = await db["email_ai_queue"].find(
        {"campaign_id": campaign_id, "status": {"$ne": "Pending"}}
    ).sort("updated_at", -1).limit(20).to_list(20)
    
    recent_logs = []
    for job in latest_jobs:
        if job.get("logs"):
            recent_logs.append({
                "lead_id": str(job["lead_id"]),
                "status": job["status"],
                "last_message": job["logs"][-1],
                "updated_at": job["updated_at"].isoformat() if job.get("updated_at") else None
            })
    
    return {
        "status": campaign.get("status", "UNKNOWN"),
        "total": len(campaign.get("target_leads", [])),
        "stats": stats,
        "sent": stats["Delivered"],
        "failed": stats["Failed"],
        "logs": recent_logs
    }

# ==========================================
# WebSocket
# ==========================================
@router.websocket("/ws/{campaign_id}")
async def websocket_endpoint(websocket: WebSocket, campaign_id: str):
    await manager.connect(websocket, campaign_id)
    try:
        while True:
            await asyncio.wait_for(websocket.receive_text(), timeout=15.0)
    except asyncio.TimeoutError:
        try:
            await websocket.send_json({"type": "HEARTBEAT", "campaign_id": campaign_id})
        except Exception:
            pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, campaign_id)
    except Exception as e:
        manager.disconnect(websocket, campaign_id)

# ==========================================
# Analytics & Exports
# ==========================================
@router.get("/analytics")
async def get_analytics(
    all_users: bool = Query(False),
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query: Dict[str, Any] = {}
    if not (all_users and str(current_user.role).upper() in ["ADMIN", "SUPERADMIN"]):
        query = {"$or": user_match}

    campaigns = await db["email_ai_campaigns"].find(query).to_list(None)
    
    total_campaigns = len(campaigns)
    total_sent = 0
    total_failed = 0
    total_duration = 0.0
    valid_durations_count = 0
    
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_week = today - timedelta(days=today.weekday())
    start_of_month = today.replace(day=1)
    
    sent_today = sent_week = sent_month = 0
    daily_trends = {}
    
    for c in campaigns:
        for log in c.get("logs", []):
            status = log.get("status")
            if status == "sent":
                total_sent += 1
                log_date = log.get("processed_at")
                if log_date:
                    if isinstance(log_date, str):
                        try:
                            log_date = datetime.fromisoformat(log_date.replace('Z', '+00:00'))
                        except Exception:
                            log_date = None
                    if log_date:
                        if log_date >= today: sent_today += 1
                        if log_date >= start_of_week: sent_week += 1
                        if log_date >= start_of_month: sent_month += 1
                        
                        day_str = log_date.strftime("%Y-%m-%d")
                        if day_str not in daily_trends:
                            daily_trends[day_str] = {"date": day_str, "sent": 0, "failed": 0}
                        daily_trends[day_str]["sent"] += 1
            elif status == "failed":
                total_failed += 1
                log_date = log.get("processed_at")
                if log_date:
                    if isinstance(log_date, str):
                        try:
                            log_date = datetime.fromisoformat(log_date.replace('Z', '+00:00'))
                        except Exception:
                            log_date = None
                    if log_date:
                        day_str = log_date.strftime("%Y-%m-%d")
                        if day_str not in daily_trends:
                            daily_trends[day_str] = {"date": day_str, "sent": 0, "failed": 0}
                        daily_trends[day_str]["failed"] += 1
                        
            if (log.get("duration") or 0) > 0:
                total_duration += log["duration"]
                valid_durations_count += 1
                
    total = total_sent + total_failed
    success_rate = (total_sent / total * 100) if total > 0 else 0.0
    
    trends_list = sorted(list(daily_trends.values()), key=lambda x: x["date"])[-14:] # last 14 days
    
    return {
        "success_rate": round(success_rate, 1),
        "avg_send_time": round((total_duration / valid_durations_count), 2) if valid_durations_count > 0 else 0.0,
        "total_campaigns": total_campaigns,
        "messages_sent_today": sent_today,
        "messages_sent_week": sent_week,
        "messages_sent_month": sent_month,
        "total_sent": total_sent,
        "total_failed": total_failed,
        "daily_trends": trends_list
    }

@router.get("/analytics/smtp")
async def get_smtp_analytics(
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query_campaigns = {"$or": user_match}
    query_smtp = {
        "is_active": {"$ne": False},
        "$or": user_match + [{"user_id": None}, {"user_id": {"$exists": False}}, {"is_default": True}]
    }

    smtps = await db["email_ai_smtp"].find(query_smtp).to_list(100)
    campaigns = await db["email_ai_campaigns"].find(query_campaigns).to_list(None)
    
    stats = {}
    for smtp in smtps:
        stats[str(smtp["_id"])] = {"name": smtp.get("name", "SMTP Relay"), "sent": 0, "failed": 0}
        
    for c in campaigns:
        smtp_id = str(c.get("smtp_id"))
        if smtp_id in stats:
            for log in c.get("logs", []):
                if log.get("status") == "sent": stats[smtp_id]["sent"] += 1
                elif log.get("status") == "failed": stats[smtp_id]["failed"] += 1
                
    return list(stats.values())

@router.get("/analytics/templates")
async def get_template_analytics(
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query_campaigns = {"$or": user_match}
    query_templates = {
        "is_active": {"$ne": False},
        "$or": user_match + [{"user_id": None}, {"user_id": {"$exists": False}}, {"user_id": "system"}]
    }

    templates = await db["email_ai_templates"].find(query_templates).to_list(100)
    campaigns = await db["email_ai_campaigns"].find(query_campaigns).to_list(None)
    
    stats = {}
    for t in templates:
        stats[str(t["_id"])] = {"name": t.get("name", "Template"), "sent": 0, "failed": 0}
        
    for c in campaigns:
        t_id = str(c.get("template_id"))
        if t_id in stats:
            for log in c.get("logs", []):
                if log.get("status") == "sent": stats[t_id]["sent"] += 1
                elif log.get("status") == "failed": stats[t_id]["failed"] += 1
                
    return list(stats.values())

@router.get("/analytics/errors")
async def get_errors_center(
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    campaigns = await db["email_ai_campaigns"].find({"$or": user_match}).to_list(None)
    error_counts = {}
    
    for c in campaigns:
        for log in c.get("logs", []):
            if log.get("status") == "failed":
                err_msg = log.get("error", "Unknown Error")
                category = "Unknown"
                if "timeout" in err_msg.lower(): category = "Connection Timeout"
                elif "auth" in err_msg.lower(): category = "Authentication"
                elif "format" in err_msg.lower() or "syntax" in err_msg.lower(): category = "Validation"
                elif "closed" in err_msg.lower() or "reset" in err_msg.lower(): category = "Connection Closed"
                
                if category not in error_counts: error_counts[category] = 0
                error_counts[category] += 1
                
    return [{"category": k, "count": v} for k, v in error_counts.items()]

@router.get("/logs")
async def get_global_logs(
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    campaigns = await db["email_ai_campaigns"].find({"$or": user_match}).sort("created_at", -1).limit(20).to_list(20)
    
    logs_flat = []
    for c in campaigns:
        for log in c.get("logs", []):
            logs_flat.append({
                "campaign_name": c.get("name") or c.get("info", {}).get("name", "Campaign"),
                "lead_id": log.get("lead_id"),
                "status": log.get("status"),
                "error": log.get("error"),
                "processed_at": log.get("processed_at"),
                "duration": log.get("duration")
            })
            
    logs_flat.sort(key=lambda x: str(x.get("processed_at") or ""), reverse=True)
    return logs_flat[:100]

@router.get("/campaigns/{campaign_id}/emails")
async def get_campaign_emails(
    campaign_id: str,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    """Fetch complete list of sent/failed/processed emails and lead details for a campaign."""
    try:
        oid = ObjectId(campaign_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign_id")

    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    campaign = await db["email_ai_campaigns"].find_one(filter_q)
    if not campaign:
        campaign = await db["email_ai_campaigns"].find_one({"_id": oid})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    campaign_name = campaign.get("name") or campaign.get("info", {}).get("name") or f"Campaign {campaign_id[:8]}"
    logs = campaign.get("logs", [])
    
    # 1. Fetch any jobs from email_ai_queue
    queue_jobs = await db["email_ai_queue"].find({"campaign_id": campaign_id}).to_list(1000)
    queue_map = {str(j.get("lead_id")): j for j in queue_jobs if j.get("lead_id")}

    # 2. Collect all lead IDs preserving order
    lead_ids_ordered = []
    seen_ids = set()

    for log in logs:
        lid = str(log.get("lead_id", ""))
        if lid and lid not in seen_ids:
            lead_ids_ordered.append(lid)
            seen_ids.add(lid)

    for lid in queue_map.keys():
        if lid not in seen_ids:
            lead_ids_ordered.append(lid)
            seen_ids.add(lid)

    for lid in campaign.get("target_leads", []):
        s_lid = str(lid)
        if s_lid and s_lid not in seen_ids:
            lead_ids_ordered.append(s_lid)
            seen_ids.add(s_lid)

    # 3. Batch query lead documents
    valid_oids = [ObjectId(lid) for lid in lead_ids_ordered if ObjectId.is_valid(lid)]
    lead_doc_map = {}
    if valid_oids:
        leads_cursor = db["leads"].find(
            {"_id": {"$in": valid_oids}},
            {"business_name": 1, "name": 1, "email": 1, "emails": 1, "phone": 1, "city": 1, "state": 1, "category": 1}
        )
        leads_list = await leads_cursor.to_list(len(valid_oids) + 20)
        lead_doc_map = {str(l["_id"]): l for l in leads_list}

    # Map logs by lead_id for quick lookup
    logs_map = {}
    for log in logs:
        lid = str(log.get("lead_id", ""))
        if lid:
            logs_map[lid] = log

    # Map tracking by lead_id or recipient_email
    tracking_docs = await db["email_tracking"].find({"campaign_id": campaign_id}).to_list(1000)
    tracking_map = {}
    for td in tracking_docs:
        t_lid = str(td.get("lead_id") or "")
        t_em = (td.get("recipient_email") or "").lower().strip()
        if t_lid:
            tracking_map[t_lid] = td
        if t_em:
            tracking_map[t_em] = td

    # 4. Build consolidated email records
    email_records = []
    for lid in lead_ids_ordered:
        lead_doc = lead_doc_map.get(lid, {})
        log_entry = logs_map.get(lid, {})
        queue_entry = queue_map.get(lid, {})

        # Determine status
        raw_status = (
            log_entry.get("status")
            or queue_entry.get("status")
            or "Pending"
        )
        st_lower = str(raw_status).lower()
        if st_lower in ["sent", "delivered", "success"]:
            norm_status = "Delivered"
        elif st_lower in ["failed", "error"]:
            norm_status = "Failed"
        elif st_lower in ["skipped", "cancelled"]:
            norm_status = "Skipped"
        elif st_lower in ["sending", "processing"]:
            norm_status = "Sending"
        else:
            norm_status = "Pending"

        # Check engagement from tracking records
        tracked = tracking_map.get(lid) or tracking_map.get(str(lead_doc.get("email") or "").lower().strip())
        if tracked:
            if tracked.get("replied") or str(tracked.get("status")).upper() == "REPLIED":
                norm_status = "Replied"
            elif tracked.get("opened") or str(tracked.get("status")).upper() == "OPENED":
                norm_status = "Opened"
            elif tracked.get("clicked"):
                norm_status = "Clicked"
            elif tracked.get("bounced"):
                norm_status = "Bounced"
            elif tracked.get("unsubscribed"):
                norm_status = "Unsubscribed"

        # Determine error explanation
        error_msg = (
            log_entry.get("error")
            or queue_entry.get("error_message")
            or (queue_entry.get("logs", [-1])[-1] if queue_entry.get("logs") and norm_status == "Failed" else None)
        )

        # Recipient email
        email_addr = (
            lead_doc.get("email")
            or (lead_doc.get("emails", [None])[0] if isinstance(lead_doc.get("emails"), list) and lead_doc.get("emails") else None)
            or log_entry.get("email")
            or "No Email Found"
        )

        proc_at = (
            log_entry.get("processed_at")
            or (queue_entry.get("updated_at").isoformat() if queue_entry.get("updated_at") else None)
            or (campaign.get("completed_at").isoformat() if campaign.get("completed_at") else None)
            or (campaign.get("created_at").isoformat() if campaign.get("created_at") else None)
        )

        biz_name = (
            lead_doc.get("business_name")
            or lead_doc.get("name")
            or "Unknown Business"
        )

        duration = log_entry.get("duration", 0)

        record = {
            "lead_id": lid,
            "business_name": biz_name,
            "email": email_addr,
            "phone": lead_doc.get("phone", ""),
            "city": lead_doc.get("city", ""),
            "status": norm_status,
            "error": error_msg,
            "processed_at": proc_at,
            "duration": round(float(duration), 2) if duration else 0
        }

        # Apply search and status filters if provided
        if status and status.upper() != "ALL":
            if norm_status.upper() != status.upper():
                continue

        if search:
            search_low = search.lower()
            if (
                search_low not in biz_name.lower()
                and search_low not in email_addr.lower()
                and search_low not in str(error_msg or "").lower()
            ):
                continue

        email_records.append(record)

    total_count = len(lead_ids_ordered)
    delivered_count = sum(1 for r in email_records if r["status"] == "Delivered")
    failed_count = sum(1 for r in email_records if r["status"] == "Failed")
    skipped_count = sum(1 for r in email_records if r["status"] == "Skipped")

    return {
        "campaign_id": campaign_id,
        "campaign_name": campaign_name,
        "status": campaign.get("status", "UNKNOWN"),
        "created_at": campaign.get("created_at"),
        "completed_at": campaign.get("completed_at"),
        "total_targets": total_count,
        "sent_count": campaign.get("stats", {}).get("sent", delivered_count),
        "failed_count": campaign.get("stats", {}).get("failed", failed_count),
        "skipped_count": campaign.get("stats", {}).get("skipped", skipped_count),
        "emails": email_records
    }

@router.get("/campaigns/{campaign_id}/export")
async def export_campaign(
    campaign_id: str,
    format: str = Query("csv"),
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(campaign_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign_id")

    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    campaign = await db["email_ai_campaigns"].find_one(filter_q)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found or access denied")
        
    data = []
    for log in campaign.get("logs", []):
        lead = await db["leads"].find_one({"_id": ObjectId(log["lead_id"])}) if log.get("lead_id") and ObjectId.is_valid(log["lead_id"]) else None
        data.append({
            "Lead ID": log.get("lead_id", ""),
            "Business Name": lead.get("business_name") if lead else "Unknown",
            "Email": lead.get("email") if lead else "Unknown",
            "Status": str(log.get("status", "")).upper(),
            "Duration (s)": log.get("duration", 0),
            "Processed At": log.get("processed_at", "")
        })
        
    df = pd.DataFrame(data)
    fd, path = tempfile.mkstemp(suffix=f".{format}")
    os.close(fd)
    
    if format == "csv":
        df.to_csv(path, index=False)
        media_type = "text/csv"
    else:
        path = path.replace(".excel", ".xlsx")
        df.to_excel(path, index=False)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        
    return FileResponse(path, media_type=media_type, filename=f"EmailCampaign_{campaign_id}.{format.replace('excel', 'xlsx')}")


@router.get("/leads/select-all")
async def get_all_leads_for_email_ai(
    search: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    has_website: Optional[bool] = None,
    has_phone: Optional[bool] = None,
    has_email: Optional[bool] = None,
    min_rating: Optional[float] = None,
    status: Optional[str] = None,
    is_auto_lead: Optional[bool] = None,
    area: Optional[str] = None,
    job_id: Optional[str] = None,
    current_user=Depends(require_email_automation_access),
    db=Depends(get_db)
):
    query: Dict[str, Any] = {}
    
    has_business_name = [
        {"business_name": {"$nin": [None, ""]}},
        {"company_name": {"$nin": [None, ""]}},
        {"name": {"$nin": [None, ""]}}
    ]
    
    has_email_fields = [
        {"email": {"$nin": [None, ""]}},
        {"emails.0": {"$exists": True}},
        {"contact_discovery.primary_email": {"$nin": [None, ""]}},
        {"contact_discovery.all_emails.0": {"$exists": True}},
        {"all_emails.0": {"$exists": True}}
    ]
    
    validity_cond = {
        "$and": [
            {"$or": has_business_name},
            {"$or": has_email_fields}
        ]
    }
    
    and_conds = [validity_cond]

    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        user_match_or: List[Dict[str, Any]] = [
            {"user_id": current_user.id},
            {"assigned_to": current_user.id},
            {"assigned_user_email": current_user.email},
        ]
        if ObjectId.is_valid(str(current_user.id)):
            user_match_or.append({"user_id": ObjectId(str(current_user.id))})
            user_match_or.append({"assigned_to": ObjectId(str(current_user.id))})
        and_conds.append({"$or": user_match_or})
    
    if search:
        and_conds.append({
            "$or": [
                {"business_name": {"$regex": search, "$options": "i"}},
                {"company_name": {"$regex": search, "$options": "i"}},
                {"name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}}
            ]
        })
        
    if city:
        and_conds.append({"city": {"$regex": city, "$options": "i"}})
    if category:
        and_conds.append({"category": {"$regex": category, "$options": "i"}})
    if has_website is True:
        and_conds.append({"website": {"$nin": [None, ""]}})
    if has_website is False:
        and_conds.append({"website": {"$in": [None, ""]}})
    if has_phone is True:
        and_conds.append({"phone": {"$nin": [None, ""]}})
    if has_phone is False:
        and_conds.append({"phone": {"$in": [None, ""]}})
    if min_rating is not None:
        and_conds.append({"google_rating": {"$gte": min_rating}})
    if status and status != "ALL":
        and_conds.append({"status": status})

    if has_email is True:
        and_conds.append({"$or": has_email_fields})
    elif has_email is False:
        and_conds.append({
            "$and": [
                {"email": {"$in": [None, ""]}},
                {"emails": {"$in": [None, []]}},
                {"contact_discovery.primary_email": {"$in": [None, ""]}},
                {"all_emails": {"$in": [None, []]}},
            ]
        })
        
    if is_auto_lead is True:
        and_conds.append({
            "$or": [
                {"is_auto_lead": True},
                {"source": "auto_leadfinder"},
                {"requested_provider": "Auto LeadFinder"},
            ]
        })
    elif is_auto_lead is False:
        and_conds.append({
            "$or": [
                {"is_auto_lead": {"$ne": True}},
                {"is_auto_lead": {"$exists": False}},
            ]
        })

    if job_id and area and is_auto_lead is None:
        combined_source_or = []
        job_ids = [j.strip() for j in unquote_plus(str(job_id)).split(",") if j.strip()]
        for j in job_ids:
            combined_source_or.extend([
                {"source_job_id": j},
                {"job_id": j},
                {"search_job_id": j},
            ])
        area_list = [a.strip() for a in unquote_plus(str(area)).split(",") if a.strip()]
        for a in area_list:
            combined_source_or.extend([
                {"auto_scraped_area": {"$regex": f"^\\s*{re.escape(a)}\\s*$", "$options": "i"}},
                {"area": {"$regex": f"^\\s*{re.escape(a)}\\s*$", "$options": "i"}},
                {"search_area": {"$regex": f"^\\s*{re.escape(a)}\\s*$", "$options": "i"}},
            ])
        and_conds.append({"$or": combined_source_or})
    else:
        if area:
            area_list = [a.strip() for a in unquote_plus(str(area)).split(",") if a.strip()]
            multi_area_conds = []
            for a in area_list:
                multi_area_conds.extend([
                    {"auto_scraped_area": {"$regex": f"^\\s*{re.escape(a)}\\s*$", "$options": "i"}},
                    {"area": {"$regex": f"^\\s*{re.escape(a)}\\s*$", "$options": "i"}},
                    {"search_area": {"$regex": f"^\\s*{re.escape(a)}\\s*$", "$options": "i"}},
                ])
            if multi_area_conds:
                and_conds.append({"$or": multi_area_conds})

        if job_id:
            job_ids = [j.strip() for j in unquote_plus(str(job_id)).split(",") if j.strip()]
            multi_job_or = []
            for j in job_ids:
                multi_job_or.extend([
                    {"source_job_id": j},
                    {"job_id": j},
                    {"search_job_id": j},
                ])
            if multi_job_or:
                and_conds.append({"$or": multi_job_or})

    query["$and"] = and_conds
    query["blacklisted"] = {"$ne": True}
    
    leads_cursor = db["leads"].find(query, {"_id": 1})
    ids = [str(lead["_id"]) async for lead in leads_cursor]
    
    return {"ids": ids, "total": len(ids)}
