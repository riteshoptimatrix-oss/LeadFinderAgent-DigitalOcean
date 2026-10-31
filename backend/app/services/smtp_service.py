import smtplib
import ssl
import socket
import re
import asyncio
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, Optional
from bson import ObjectId

from app.core.logger import logger
from app.core.security_crypto import encrypt_string, decrypt_string

# Mask placeholder used to indicate a password is configured without revealing it
MASKED_PASSWORD = "••••••••••••••••"


def clean_app_password(password: Optional[str], host: Optional[str] = None) -> str:
    """Normalize password, auto-removing whitespace from 16-character Google App Passwords."""
    raw = str(password or "").strip()
    if not raw:
        return ""
    host_str = str(host or "").lower()
    # Google App Passwords are 16 lowercase characters often formatted as 'xxxx xxxx xxxx xxxx'
    no_spaces = raw.replace(" ", "")
    if "gmail" in host_str and len(no_spaces) == 16:
        return no_spaces
    return raw


def is_masked_or_empty(password: Optional[str]) -> bool:
    """Check if the provided password string is blank, None, or a mask placeholder."""
    if not password:
        return True
    trimmed = str(password).strip()
    if not trimmed or trimmed == MASKED_PASSWORD or all(c in "•*" for c in trimmed):
        return True
    return False


def run_smtp_verification_sync(
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
    """
    Perform a real SMTP connection, SSL/TLS handshake, EHLO greeting, and AUTH login.
    Optionally dispatches a test message if send_test is explicitly True and recipient is provided.
    Returns a structured dictionary with success, status, message, and diagnostic error.
    """
    host = str(host or "").strip()
    username = str(username or "").strip()
    raw_pwd = str(password or "").strip()
    clean_pwd = clean_app_password(raw_pwd, host)
    encryption = str(encryption or "TLS").upper().strip()
    if encryption == "STARTTLS":
        encryption = "TLS"

    timeout = int(timeout or 15)
    eff_from = str(from_email or username).strip()
    target_recipient = str(recipient or username).strip()

    # Pre-validation
    if not host:
        return {
            "success": False,
            "status": "CONNECTION_FAILED",
            "message": "SMTP Host is required.",
            "error": "Missing host"
        }
    if not username:
        return {
            "success": False,
            "status": "AUTH_FAILED",
            "message": "SMTP Username (Email) is required.",
            "error": "Missing username"
        }
    if not clean_pwd:
        return {
            "success": False,
            "status": "AUTH_FAILED",
            "message": "SMTP App Password is required.",
            "error": "Missing password"
        }

    # Step 1: DNS Resolution Check
    try:
        addr_info = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
        if not addr_info:
            return {
                "success": False,
                "status": "CONNECTION_FAILED",
                "message": f"DNS resolution failed: Host '{host}' could not be resolved. Please verify the SMTP host address.",
                "error": f"Unable to resolve host {host}"
            }
    except socket.gaierror as dns_err:
        logger.warning(f"[SMTP-Verify] DNS error for {host}: {dns_err}")
        return {
            "success": False,
            "status": "CONNECTION_FAILED",
            "message": f"Invalid SMTP host: Unable to resolve hostname '{host}'. Please verify the host address.",
            "error": str(dns_err)
        }
    except Exception as e:
        logger.warning(f"[SMTP-Verify] Host lookup error for {host}: {e}")

    # Build TLS/SSL context
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
    connected_strategy = None
    last_error_message = None
    last_status = "CONNECTION_FAILED"

    for strat in strategies:
        strat_mode = strat["mode"]
        strat_port = strat["port"]
        server = None
        try:
            logger.info(f"[SMTP-Verify] Connecting to {host}:{strat_port} ({strat_mode}, timeout={timeout}s)...")
            
            # Step 2: Establish TCP & SSL connection
            if strat_mode == "SSL":
                server = smtplib.SMTP_SSL(host, strat_port, timeout=timeout, context=context)
                server.ehlo()
            else:
                server = smtplib.SMTP(host, strat_port, timeout=timeout)
                server.ehlo()
                if encryption != "NONE":
                    server.starttls(context=context)
                    server.ehlo()

            # Step 3: Authenticate
            logger.info(f"[SMTP-Verify] Authenticating as {username} on {host}:{strat_port}...")
            try:
                server.login(username, clean_pwd)
            except smtplib.SMTPServerDisconnected:
                # If disconnected and clean_pwd was used, retry with raw_pwd
                if clean_pwd != raw_pwd:
                    try:
                        server = (smtplib.SMTP_SSL(host, strat_port, timeout=timeout, context=context)
                                  if strat_mode == "SSL" else smtplib.SMTP(host, strat_port, timeout=timeout))
                        server.ehlo()
                        if strat_mode != "SSL" and encryption != "NONE":
                            server.starttls(context=context)
                            server.ehlo()
                        server.login(username, raw_pwd)
                    except Exception as retry_err:
                        last_status = "AUTH_FAILED"
                        last_error_message = (
                            "Google/Gmail rejected credentials and closed the connection. "
                            "Please verify: 1) You have 2-Step Verification ON in your Google Account. "
                            "2) You generated and used a 16-character Google App Password (not your Gmail account password) from Google Security settings."
                        )
                        break
                else:
                    last_status = "AUTH_FAILED"
                    last_error_message = (
                        "Google/Gmail rejected credentials and closed the connection. "
                        "Please verify: 1) You have 2-Step Verification ON in your Google Account. "
                        "2) You generated and used a 16-character Google App Password (not your Gmail account password) from Google Security settings."
                    )
                    break

            connected_strategy = strat
            logger.info(f"[SMTP-Verify] Authentication SUCCESS for {username} on {host}:{strat_port}")
            break

        except smtplib.SMTPAuthenticationError as auth_err:
            logger.warning(f"[SMTP-Verify] Authentication failed for {username}: {auth_err}")
            last_status = "AUTH_FAILED"
            msg = str(auth_err)
            if "gmail" in host.lower() or "535" in msg:
                last_error_message = (
                    f"SMTP Authentication Failed (535): Invalid username or app password. "
                    f"For Gmail accounts, you must use a 16-character Google App Password generated at: "
                    f"myaccount.google.com/apppasswords with 2-Step Verification enabled."
                )
            else:
                last_error_message = f"SMTP Authentication Failed: {auth_err}. Please check your username and password."
            break  # Do not attempt port fallback if authentication credentials were fundamentally rejected

        except (ConnectionRefusedError, ConnectionResetError) as conn_err:
            logger.warning(f"[SMTP-Verify] Connection refused/reset on {host}:{strat_port}: {conn_err}")
            last_status = "CONNECTION_FAILED"
            last_error_message = f"Connection refused on {host}:{strat_port}. Please check if the port is correct and open."
            continue

        except (TimeoutError, socket.timeout) as timeout_err:
            logger.warning(f"[SMTP-Verify] Timeout connecting to {host}:{strat_port}: {timeout_err}")
            last_status = "CONNECTION_FAILED"
            last_error_message = f"Connection timed out connecting to {host}:{strat_port} after {timeout} seconds. Check host, port, or firewall restrictions."
            continue

        except ssl.SSLError as ssl_err:
            logger.warning(f"[SMTP-Verify] SSL/TLS handshake failed on {host}:{strat_port}: {ssl_err}")
            last_status = "CONNECTION_FAILED"
            last_error_message = f"SSL/TLS handshake failed on {host}:{strat_port}: {ssl_err}. Verify encryption mode."
            continue

        except smtplib.SMTPServerDisconnected as disc_err:
            logger.warning(f"[SMTP-Verify] Server disconnected on {host}:{strat_port}: {disc_err}")
            last_status = "CONNECTION_FAILED"
            last_error_message = f"SMTP server {host}:{strat_port} disconnected unexpectedly. Verify your port and security settings."
            continue

        except Exception as e:
            logger.warning(f"[SMTP-Verify] Failed on {host}:{strat_port}: {e}")
            last_status = "CONNECTION_FAILED"
            last_error_message = str(e)
            continue
        finally:
            if not connected_strategy and server:
                try:
                    server.quit()
                except Exception:
                    pass

    if not connected_strategy or not server:
        return {
            "success": False,
            "status": last_status,
            "message": last_error_message or f"SMTP connection failed for {host}:{port}.",
            "error": last_error_message or "Connection failed"
        }

    result = {
        "success": True,
        "status": "CONNECTED",
        "host": host,
        "port": connected_strategy["port"],
        "mode": connected_strategy["mode"],
        "message": f"SMTP Connection & Authentication Verified on port {connected_strategy['port']} ({connected_strategy['mode']})!",
        "test_email_sent": False
    }

    # Step 4: Optional sample test email dispatch
    if send_test and target_recipient:
        try:
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
                    Hello! This test email confirms that your outbound SMTP dispatch relay is operational and authenticated.
                </p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; font-size: 13px; color: #475569; line-height: 1.8;">
                    <div><strong>SMTP Relay:</strong> {host}:{connected_strategy['port']} ({connected_strategy['mode']})</div>
                    <div><strong>Authenticated Sender:</strong> {eff_from}</div>
                    <div><strong>Target Recipient:</strong> {target_recipient}</div>
                    <div><strong>Dispatch Timestamp:</strong> {now_str}</div>
                    <div><strong>Status:</strong> <span style="color: #16a34a; font-weight: bold;">Verified & Operational</span></div>
                </div>
                <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
                    Your email configuration is complete and ready to dispatch Email AI campaigns.
                </p>
            </div>
            """
            test_msg.attach(MIMEText(html_content, "html", "utf-8"))
            envelope_sender = eff_from.split("<")[-1].split(">")[0].strip() if "<" in eff_from else eff_from
            server.sendmail(envelope_sender, [target_recipient], test_msg.as_string())
            result["test_email_sent"] = True
            result["recipient"] = target_recipient
            result["message"] = f"SMTP verified! Test email successfully delivered to {target_recipient}."
            logger.info(f"[SMTP-Verify] Test email successfully delivered to {target_recipient}")
        except Exception as send_err:
            logger.warning(f"[SMTP-Verify] Test email send failed: {send_err}")
            result["test_email_sent"] = False
            result["message"] = f"SMTP connected and authenticated, but test email delivery to {target_recipient} failed: {send_err}"
            result["error"] = str(send_err)

    try:
        server.quit()
    except Exception:
        pass

    return result


async def get_user_smtp_config(db, user_id: str, decrypt_pwd: bool = False) -> Dict[str, Any]:
    """
    Retrieve SMTP configuration for a user.
    Prioritizes db['settings'], then falls back to db['email_ai_smtp'], then users.email_settings.
    If decrypt_pwd is True, returns plaintext password for in-memory dispatch;
    otherwise, masks password and adds has_password boolean for frontend.
    """
    uid_str = str(user_id)
    settings_doc = await db["settings"].find_one({"user_id": uid_str})
    
    # Fallback to email_ai_smtp if settings collection is empty
    if not settings_doc or not settings_doc.get("smtp_host"):
        ai_smtp = await db["email_ai_smtp"].find_one({
            "user_id": uid_str,
            "is_active": {"$ne": False}
        })
        if ai_smtp:
            settings_doc = {
                "user_id": uid_str,
                "smtp_host": ai_smtp.get("host"),
                "smtp_port": ai_smtp.get("port", 587),
                "smtp_user": ai_smtp.get("username"),
                "smtp_pass": ai_smtp.get("password"),
                "smtp_encryption": ai_smtp.get("encryption", "TLS"),
                "smtp_from_email": ai_smtp.get("from_email") or ai_smtp.get("username"),
                "smtp_sender_name": ai_smtp.get("from_name") or ai_smtp.get("name"),
                "smtp_status": "CONNECTED",
                "daily_limit": ai_smtp.get("daily_limit", 500)
            }
        else:
            # Fallback to users collection
            try:
                user_doc = await db["users"].find_one({"_id": ObjectId(uid_str)})
            except Exception:
                user_doc = None
            if user_doc and user_doc.get("email_settings"):
                es = user_doc["email_settings"]
                if es.get("smtp_host"):
                    settings_doc = {
                        "user_id": uid_str,
                        "smtp_host": es.get("smtp_host"),
                        "smtp_port": es.get("smtp_port", 587),
                        "smtp_user": es.get("smtp_user"),
                        "smtp_pass": es.get("smtp_pass"),
                        "smtp_encryption": es.get("smtp_encryption", "TLS"),
                        "smtp_from_email": es.get("from_email") or es.get("smtp_user"),
                        "smtp_sender_name": es.get("smtp_sender_name", ""),
                        "daily_limit": es.get("daily_limit", 500),
                        "signature": es.get("signature", ""),
                        "track_opens": es.get("track_opens", True)
                    }

    if not settings_doc:
        settings_doc = {
            "user_id": uid_str,
            "smtp_host": "smtp.gmail.com",
            "smtp_port": 587,
            "smtp_user": "",
            "smtp_pass": "",
            "smtp_encryption": "TLS",
            "smtp_from_email": "",
            "smtp_sender_name": "",
            "smtp_status": "NOT_CONFIGURED",
            "daily_limit": 500,
            "signature": "Best regards,\nThe Growth Team\nwww.example.com",
            "track_opens": True
        }

    raw_pass = settings_doc.get("smtp_pass") or ""
    has_pwd = bool(raw_pass and not is_masked_or_empty(raw_pass))

    res = dict(settings_doc)
    res["has_password"] = has_pwd

    if decrypt_pwd:
        if raw_pass:
            res["smtp_pass"] = clean_app_password(decrypt_string(raw_pass), res.get("smtp_host"))
        else:
            res["smtp_pass"] = ""
    else:
        # Mask password for frontend
        res["smtp_pass"] = MASKED_PASSWORD if has_pwd else ""

    # Ensure status is accurate
    if not res.get("smtp_user") or not has_pwd:
        res["smtp_status"] = "NOT_CONFIGURED"
    elif not res.get("smtp_status"):
        res["smtp_status"] = "NOT_CONFIGURED"

    return res


async def save_user_smtp_config(db, user_id: str, data: Dict[str, Any], verified_status: Optional[str] = None) -> Dict[str, Any]:
    """
    Securely saves SMTP settings for a user.
    - Encrypts password at rest with Fernet.
    - Preserves existing password if the new value is blank/masked.
    - Syncs to db['settings'], db['email_ai_smtp'], and db['users'].
    - Broadcasts real-time synchronization so Email AI updates without reload.
    """
    uid_str = str(user_id)
    existing_settings = await db["settings"].find_one({"user_id": uid_str})
    existing_pass = existing_settings.get("smtp_pass") if existing_settings else ""

    incoming_pass = data.get("smtp_pass")
    
    # Check if incoming password is new or needs preservation
    if is_masked_or_empty(incoming_pass):
        # Keep existing encrypted password
        encrypted_pass = existing_pass or ""
    else:
        # Normalize and encrypt new password
        cleaned = clean_app_password(incoming_pass, data.get("smtp_host"))
        encrypted_pass = encrypt_string(cleaned)

    host = (data.get("smtp_host") or "smtp.gmail.com").strip()
    port = int(data.get("smtp_port") or 587)
    user = (data.get("smtp_user") or "").strip()
    encryption = (data.get("smtp_encryption") or "TLS").upper().strip()
    if encryption == "STARTTLS":
        encryption = "TLS"
    from_email = (data.get("smtp_from_email") or user).strip()
    from_name = (data.get("smtp_sender_name") or "").strip()
    daily_limit = int(data.get("daily_limit") or 500)
    signature = str(data.get("signature") or "Best regards,\nThe Growth Team\nwww.example.com")
    track_opens = bool(data.get("track_opens", True))

    status = verified_status or (existing_settings.get("smtp_status") if existing_settings else None)
    if not status:
        status = "CONNECTED" if (user and encrypted_pass) else "NOT_CONFIGURED"

    now = datetime.now(timezone.utc)

    # 1. Update db['settings']
    settings_payload = {
        "user_id": uid_str,
        "smtp_host": host,
        "smtp_port": port,
        "smtp_user": user,
        "smtp_pass": encrypted_pass,
        "smtp_encryption": encryption,
        "smtp_from_email": from_email,
        "smtp_sender_name": from_name,
        "smtp_status": status,
        "daily_limit": daily_limit,
        "signature": signature,
        "track_opens": track_opens,
        "updated_at": now
    }
    if verified_status == "CONNECTED":
        settings_payload["last_tested_at"] = now
        settings_payload["last_test_error"] = None

    await db["settings"].update_one(
        {"user_id": uid_str},
        {"$set": settings_payload},
        upsert=True
    )

    # 2. Sync to db['email_ai_smtp'] for seamless Email AI dispatch
    # Find existing primary/default profile for this user
    existing_profile = await db["email_ai_smtp"].find_one({
        "user_id": uid_str,
        "is_default": True
    })
    if not existing_profile:
        existing_profile = await db["email_ai_smtp"].find_one({
            "user_id": uid_str,
            "is_active": {"$ne": False}
        })

    profile_payload = {
        "user_id": uid_str,
        "name": f"Default Relay ({user or host})",
        "host": host,
        "port": port,
        "username": user,
        "password": encrypted_pass,
        "encryption": encryption,
        "timeout": 15,
        "daily_limit": daily_limit,
        "hourly_limit": 50,
        "priority": 1,
        "is_active": True,
        "is_default": True,
        "from_email": from_email,
        "from_name": from_name,
        "updated_at": now
    }

    if existing_profile:
        await db["email_ai_smtp"].update_one(
            {"_id": existing_profile["_id"]},
            {"$set": profile_payload}
        )
    else:
        profile_payload["created_at"] = now
        await db["email_ai_smtp"].insert_one(profile_payload)

    # 3. Backward compatibility sync to db['users'].email_settings
    try:
        if ObjectId.is_valid(uid_str):
            await db["users"].update_one(
                {"_id": ObjectId(uid_str)},
                {"$set": {
                    "email_settings": {
                        "smtp_host": host,
                        "smtp_port": port,
                        "smtp_user": user,
                        "smtp_pass": encrypted_pass,
                        "from_email": from_email,
                        "daily_limit": daily_limit,
                        "signature": signature,
                        "track_opens": track_opens
                    }
                }}
            )
    except Exception as e:
        logger.warning(f"[SMTP-Save] user update error: {e}")

    # 4. Real-time WebSocket broadcast for open tabs (Email AI)
    try:
        from app.services.ws_manager import ws_manager
        sync_payload = {
            "type": "SMTP_SETTINGS_UPDATED",
            "event_type": "SMTP_SETTINGS_UPDATED",
            "user_id": uid_str,
            "status": status,
            "host": host,
            "user": user,
            "timestamp": now.isoformat()
        }
        await ws_manager.broadcast(sync_payload)
    except Exception as ws_err:
        logger.warning(f"[SMTP-Save] Broadcast warning: {ws_err}")

    # Return safe masked settings for API response
    return await get_user_smtp_config(db, uid_str, decrypt_pwd=False)

