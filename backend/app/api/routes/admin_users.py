import logging
import re
from typing import Any, List, Optional, Dict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson.objectid import ObjectId

from app.db.database import get_db, db_instance
from app.models.user import (
    UserInDB,
    UserRole,
    AdminCreateUserRequest,
    AdminUpdateUserRequest,
)
from app.models.session import SessionCreate
from app.api.dependencies import RequireRole
from app.core import security
from app.core.config import settings
from app.services.audit import log_audit_action
from app.services.email_provider_registry import build_user_provider_snapshot, build_user_provider_snapshot_async

logger = logging.getLogger(__name__)

router = APIRouter()
require_admin = RequireRole(["admin", "ADMIN"])


def get_raw_db() -> AsyncIOMotorDatabase:
    """Ensure admin queries bypass tenant isolation and access full database."""
    if db_instance.db is not None:
        return db_instance.db
    db = get_db()
    if hasattr(db, "_db"):
        return db._db
    return db


def sanitize_doc(doc: Any) -> Any:
    """Recursively convert ObjectIds to strings and datetimes to ISO strings for safe JSON serialization."""
    if isinstance(doc, dict):
        cleaned = {}
        for k, v in doc.items():
            if isinstance(v, ObjectId):
                cleaned[k] = str(v)
            elif isinstance(v, datetime):
                cleaned[k] = v.isoformat()
            elif isinstance(v, (dict, list)):
                cleaned[k] = sanitize_doc(v)
            else:
                cleaned[k] = v
        return cleaned
    elif isinstance(doc, list):
        return [sanitize_doc(item) for item in doc]
    elif isinstance(doc, ObjectId):
        return str(doc)
    elif isinstance(doc, datetime):
        return doc.isoformat()
    return doc


def build_user_filter(user_id: str) -> Dict[str, Any]:
    """Match user_id whether stored as string or ObjectId in Mongo documents."""
    conditions = [{"user_id": user_id}]
    if ObjectId.is_valid(user_id):
        conditions.append({"user_id": ObjectId(user_id)})
        conditions.append({"created_by": user_id})
        conditions.append({"created_by": ObjectId(user_id)})
    return {"$or": conditions}


@router.get("")
@router.get("/")
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    """
    Admin: View list of all registered users with searching, filtering, and pagination.
    """
    raw_db = get_raw_db()
    query: Dict[str, Any] = {}

    if search and search.strip():
        s = search.strip()
        query["$or"] = [
            {"full_name": {"$regex": s, "$options": "i"}},
            {"email": {"$regex": s, "$options": "i"}},
            {"company_name": {"$regex": s, "$options": "i"}},
            {"mobile_number": {"$regex": s, "$options": "i"}}
        ]

    if role and role.strip() and role.upper() != "ALL":
        query["role"] = {"$regex": f"^{role.strip()}$", "$options": "i"}

    if status and status.strip() and status.upper() != "ALL":
        query["account_status"] = {"$regex": f"^{status.strip()}$", "$options": "i"}

    cursor = raw_db["users"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    users = []
    async for user in cursor:
        user["_id"] = str(user["_id"])
        user["id"] = user["_id"]
        user.pop("hashed_password", None)
        user.pop("password_hash", None)
        if not user.get("email_provider") or user["email_provider"].get("email") != (user.get("email") or "").strip().lower():
            user["email_provider"] = build_user_provider_snapshot(user.get("email"))
        users.append(user)

    total = await raw_db["users"].count_documents(query)

    return sanitize_doc({
        "items": users,
        "users": users,
        "total": total,
        "skip": skip,
        "limit": limit
    })


@router.get("/{user_id}")
async def get_user_details(
    user_id: str,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    """
    Admin: View individual user details including stats.
    """
    raw_db = get_raw_db()
    user_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
    user = await raw_db["users"].find_one(user_query)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user["_id"] = str(user["_id"])
    user["id"] = user["_id"]
    user.pop("hashed_password", None)
    user.pop("password_hash", None)

    # On-demand email provider detection (with MX lookup) if missing, stale, or email changed
    email_clean = (user.get("email") or "").strip().lower()
    existing_ep = user.get("email_provider") or {}
    if not existing_ep or existing_ep.get("email") != email_clean or not existing_ep.get("detection_method"):
        snapshot = await build_user_provider_snapshot_async(email_clean)
        user["email_provider"] = snapshot
        await raw_db["users"].update_one(user_query, {"$set": {"email_provider": snapshot}})

    # Safe email configuration status lookup (never expose passwords/tokens)
    settings_doc = await raw_db["settings"].find_one({"user_id": user["_id"]})
    has_smtp_pass = bool(settings_doc and settings_doc.get("smtp_pass"))
    email_config_status = {
        "configured": bool(settings_doc and settings_doc.get("smtp_host") and has_smtp_pass),
        "smtp_status": (settings_doc.get("smtp_status") if settings_doc else None) or ("CONNECTED" if has_smtp_pass else "NOT_CONFIGURED"),
        "smtp_host": settings_doc.get("smtp_host") if settings_doc else None,
        "smtp_user": settings_doc.get("smtp_user") if settings_doc else None,
        "imap_status": settings_doc.get("imap_status") if settings_doc else "NOT_CONFIGURED",
        "auth_method": settings_doc.get("auth_method") if settings_doc else None,
        "last_tested_at": settings_doc.get("last_tested_at") if settings_doc else None,
    }

    user_filter = build_user_filter(user_id)
    total_searches = await raw_db["search_jobs"].count_documents(user_filter)
    total_leads = await raw_db["leads"].count_documents(user_filter)
    total_ai_analyses = await raw_db["ai_analysis_jobs"].count_documents(user_filter)
    total_emails = (await raw_db["email_ai_campaigns"].count_documents(user_filter)) + (await raw_db["email_campaigns"].count_documents(user_filter))
    total_whatsapp = (await raw_db["wa_ai_campaigns"].count_documents(user_filter)) + (await raw_db["wa_campaigns"].count_documents(user_filter))

    stats = {
        "total_searches": total_searches,
        "total_leads": total_leads,
        "total_ai_analyses": total_ai_analyses,
        "total_emails": total_emails,
        "total_whatsapp": total_whatsapp,
    }

    return sanitize_doc({
        "user": user,
        "stats": stats,
        "email_config_status": email_config_status,
    })


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(
    request: Request,
    payload: AdminCreateUserRequest,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    """
    Admin: Create a new user with all required details.
    """
    raw_db = get_raw_db()
    email_clean = payload.email.lower().strip()

    # Check for existing email in users or admins
    existing_user = await raw_db["users"].find_one({"email": email_clean})
    existing_admin = await raw_db["admins"].find_one({"email": email_clean})
    if existing_user or existing_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists."
        )

    hashed_password = security.get_password_hash(payload.password)
    now = datetime.now(timezone.utc)

    user_doc = {
        "email": email_clean,
        "hashed_password": hashed_password,
        "full_name": payload.full_name.strip(),
        "mobile_number": payload.mobile_number.strip() if payload.mobile_number else None,
        "company_name": payload.company_name.strip() if payload.company_name else None,
        "country": payload.country.strip() if payload.country else None,
        "state": payload.state.strip() if payload.state else None,
        "role": payload.role.value if hasattr(payload.role, "value") else str(payload.role).upper(),
        "account_status": payload.account_status,
        "is_active": payload.is_active,
        "is_superuser": payload.role == UserRole.ADMIN,
        "auto_leadfinder_access": bool(payload.auto_leadfinder_access) if payload.auto_leadfinder_access is not None else False,
        "auto_leadfinder_keyword": "Travel Agency" if email_clean == "kutchtourguide@gmail.com" else (payload.auto_leadfinder_keyword.strip() if payload.auto_leadfinder_keyword else None),
        "auto_leadfinder_visibility": (payload.auto_leadfinder_visibility or "visible").strip().lower(),
        "easyadserver_access": bool(payload.easyadserver_access) if payload.easyadserver_access is not None else False,
        "easyadserver_token": payload.easyadserver_token.strip() if payload.easyadserver_token else None,
        "email_automation_access": bool(payload.email_automation_access) if payload.email_automation_access is not None else False,
        "whatsapp_automation_access": bool(payload.whatsapp_automation_access) if payload.whatsapp_automation_access is not None else False,
        "email_provider": await build_user_provider_snapshot_async(email_clean),
        "created_at": now,
        "updated_at": now,
        "last_login": None,
        "created_by_admin": str(current_admin.id)
    }

    result = await raw_db["users"].insert_one(user_doc)
    created_id = str(result.inserted_id)

    # Log audit
    ip_address = request.client.host if request.client else "Unknown"
    await log_audit_action(
        action="ADMIN_USER_CREATE",
        user_id=created_id,
        user_email=email_clean,
        resource="users",
        resource_id=created_id,
        ip_address=ip_address,
        details={
            "admin_id": str(current_admin.id),
            "admin_email": current_admin.email,
            "created_user_id": created_id,
            "created_user_email": email_clean,
            "role": user_doc["role"],
        }
    )

    created_user = await raw_db["users"].find_one({"_id": result.inserted_id})
    created_user["_id"] = str(created_user["_id"])
    created_user["id"] = created_user["_id"]
    created_user.pop("hashed_password", None)
    created_user.pop("password_hash", None)

    return sanitize_doc({
        "success": True,
        "message": "User created successfully",
        "user": created_user
    })


@router.put("/{user_id}")
async def update_user(
    user_id: str,
    request: Request,
    payload: AdminUpdateUserRequest,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    """
    Admin: Update existing user information.
    """
    raw_db = get_raw_db()
    target_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
    existing_user = await raw_db["users"].find_one(target_query)
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_fields: Dict[str, Any] = {}

    # Email update check
    if payload.email is not None:
        new_email = payload.email.lower().strip()
        if new_email != existing_user.get("email"):
            conflict_user = await raw_db["users"].find_one({"email": new_email, "_id": {"$ne": existing_user["_id"]}})
            conflict_admin = await raw_db["admins"].find_one({"email": new_email})
            if conflict_user or conflict_admin:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Another account already uses this email address."
                )
            update_fields["email"] = new_email
            update_fields["email_provider"] = await build_user_provider_snapshot_async(new_email)

    if payload.full_name is not None:
        update_fields["full_name"] = payload.full_name.strip()
    if payload.mobile_number is not None:
        update_fields["mobile_number"] = payload.mobile_number.strip() if payload.mobile_number else None
    if payload.company_name is not None:
        update_fields["company_name"] = payload.company_name.strip() if payload.company_name else None
    if payload.country is not None:
        update_fields["country"] = payload.country.strip() if payload.country else None
    if payload.state is not None:
        update_fields["state"] = payload.state.strip() if payload.state else None
    if payload.role is not None:
        update_fields["role"] = payload.role.value if hasattr(payload.role, "value") else str(payload.role).upper()
        update_fields["is_superuser"] = update_fields["role"] == "ADMIN"
    if payload.account_status is not None:
        update_fields["account_status"] = payload.account_status
    if payload.is_active is not None:
        update_fields["is_active"] = payload.is_active

    if payload.auto_leadfinder_access is not None:
        update_fields["auto_leadfinder_access"] = bool(payload.auto_leadfinder_access)

    if payload.easyadserver_access is not None:
        update_fields["easyadserver_access"] = bool(payload.easyadserver_access)

    if payload.easyadserver_token is not None:
        update_fields["easyadserver_token"] = payload.easyadserver_token.strip() if payload.easyadserver_token else None

    if payload.email_automation_access is not None:
        update_fields["email_automation_access"] = bool(payload.email_automation_access)

    if payload.whatsapp_automation_access is not None:
        update_fields["whatsapp_automation_access"] = bool(payload.whatsapp_automation_access)

    effective_user_email = (new_email if payload.email is not None else existing_user.get("email", "")).strip().lower()
    is_kutch_target = effective_user_email == "kutchtourguide@gmail.com"
    if is_kutch_target:
        # kutchtourguide -> "Travel Agency" must always remain fixed and non-editable
        update_fields["auto_leadfinder_keyword"] = "Travel Agency"
    elif payload.auto_leadfinder_keyword is not None:
        update_fields["auto_leadfinder_keyword"] = payload.auto_leadfinder_keyword.strip() if payload.auto_leadfinder_keyword else None

    if payload.auto_leadfinder_visibility is not None:
        update_fields["auto_leadfinder_visibility"] = str(payload.auto_leadfinder_visibility).strip().lower()

    if payload.password and payload.password.strip():
        update_fields["hashed_password"] = security.get_password_hash(payload.password.strip())

    update_fields["updated_at"] = datetime.now(timezone.utc)

    if update_fields:
        await raw_db["users"].update_one(target_query, {"$set": update_fields})

        # Keep auto_leadfinder_settings in sync if access was modified
        if payload.auto_leadfinder_access is not None and effective_user_email:
            new_acc = bool(payload.auto_leadfinder_access)
            await raw_db["auto_leadfinder_settings"].update_one(
                {"user_email": {"$regex": f"^{re.escape(effective_user_email)}$", "$options": "i"}},
                {"$set": {
                    "is_active": new_acc,
                    "auto_leadfinder_access": new_acc,
                    "updated_at": datetime.now(timezone.utc)
                }},
                upsert=True
            )

    # Log audit
    ip_address = request.client.host if request.client else "Unknown"
    await log_audit_action(
        action="ADMIN_USER_UPDATE",
        user_id=user_id,
        user_email=update_fields.get("email", existing_user.get("email")),
        resource="users",
        resource_id=user_id,
        ip_address=ip_address,
        details={
            "admin_id": str(current_admin.id),
            "admin_email": current_admin.email,
            "updated_fields": [k for k in update_fields.keys() if k != "hashed_password"],
            "password_reset_by_admin": "hashed_password" in update_fields
        }
    )

    updated_user = await raw_db["users"].find_one(target_query)
    updated_user["_id"] = str(updated_user["_id"])
    updated_user["id"] = updated_user["_id"]
    updated_user.pop("hashed_password", None)
    updated_user.pop("password_hash", None)

    return sanitize_doc({
        "success": True,
        "message": "User updated successfully",
        "user": updated_user
    })


@router.patch("/{user_id}/toggle-auto-leadfinder")
async def toggle_auto_leadfinder_access(
    user_id: str,
    request: Request,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    """
    Admin: Instant 1-click toggle for Auto LeadFinder access for a user.
    """
    raw_db = get_raw_db()
    target_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
    existing_user = await raw_db["users"].find_one(target_query)
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")

    new_state = not existing_user.get("auto_leadfinder_access", False)
    u_email = (existing_user.get("email") or "").strip().lower()
    is_kutch = u_email == "kutchtourguide@gmail.com"

    update_doc: Dict[str, Any] = {
        "auto_leadfinder_access": new_state,
        "updated_at": datetime.now(timezone.utc)
    }

    if is_kutch:
        update_doc["auto_leadfinder_keyword"] = "Travel Agency"
    else:
        # Normal users start fresh with no hardcoded keyword
        if new_state and not existing_user.get("auto_leadfinder_keyword"):
            update_doc["auto_leadfinder_keyword"] = ""

    if new_state and not existing_user.get("auto_leadfinder_visibility"):
        update_doc["auto_leadfinder_visibility"] = "visible"

    await raw_db["users"].update_one(target_query, {"$set": update_doc})

    # Keep auto_leadfinder_settings is_active in sync with user's access state
    if u_email:
        await raw_db["auto_leadfinder_settings"].update_one(
            {"user_email": {"$regex": f"^{re.escape(u_email)}$", "$options": "i"}},
            {"$set": {
                "is_active": new_state,
                "auto_leadfinder_access": new_state,
                "updated_at": datetime.now(timezone.utc)
            }},
            upsert=True
        )

    ip_address = request.client.host if request.client else "Unknown"
    await log_audit_action(
        action="ADMIN_TOGGLE_AUTO_LEADFINDER",
        user_id=user_id,
        user_email=existing_user.get("email"),
        resource="users",
        resource_id=user_id,
        ip_address=ip_address,
        details={
            "admin_id": str(current_admin.id),
            "admin_email": current_admin.email,
            "new_auto_leadfinder_access": new_state
        }
    )

    return {
        "success": True,
        "auto_leadfinder_access": new_state,
        "message": f"Auto LeadFinder access {'enabled' if new_state else 'disabled'} for {existing_user.get('email')}"
    }


class AdminToggleEasyAdServerRequest(BaseModel):
    easyadserver_access: Optional[bool] = None
    easyadserver_token: Optional[str] = None


@router.patch("/{user_id}/toggle-easyadserver")
async def toggle_easyadserver_access(
    user_id: str,
    request: Request,
    payload: Optional[AdminToggleEasyAdServerRequest] = None,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    """
    Admin: Dynamic toggle and token management for EasyAdServer integration for a user.
    """
    raw_db = get_raw_db()
    target_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
    existing_user = await raw_db["users"].find_one(target_query)
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")

    current_access = bool(existing_user.get("easyadserver_access", False))
    if payload and payload.easyadserver_access is not None:
        new_state = bool(payload.easyadserver_access)
    else:
        new_state = not current_access

    update_doc: Dict[str, Any] = {
        "easyadserver_access": new_state,
        "updated_at": datetime.now(timezone.utc)
    }

    if payload and payload.easyadserver_token is not None:
        update_doc["easyadserver_token"] = payload.easyadserver_token.strip() if payload.easyadserver_token else None

    await raw_db["users"].update_one(target_query, {"$set": update_doc})

    ip_address = request.client.host if request.client else "Unknown"
    await log_audit_action(
        action="ADMIN_TOGGLE_EASYADSERVER",
        user_id=user_id,
        user_email=existing_user.get("email"),
        resource="users",
        resource_id=user_id,
        ip_address=ip_address,
        details={
            "admin_id": str(current_admin.id),
            "admin_email": current_admin.email,
            "easyadserver_access": new_state,
            "easyadserver_token_updated": bool(payload and payload.easyadserver_token is not None)
        }
    )

    updated_user = await raw_db["users"].find_one(target_query)

    return {
        "success": True,
        "easyadserver_access": new_state,
        "easyadserver_token": updated_user.get("easyadserver_token"),
        "message": f"EasyAdServer access {'enabled' if new_state else 'disabled'} for {existing_user.get('email')}"
    }


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    """
    Admin: Delete existing user and clean up their associated data.
    """
    raw_db = get_raw_db()

    # Prevent admin from deleting their own account via user management
    if str(current_admin.id) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own active administrator account."
        )

    target_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
    existing_user = await raw_db["users"].find_one(target_query)
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")

    user_email = existing_user.get("email", "Unknown")

    # Clean up associated records
    user_filter = build_user_filter(user_id)
    await raw_db["leads"].delete_many(user_filter)
    await raw_db["search_jobs"].delete_many(user_filter)
    await raw_db["sessions"].delete_many(user_filter)
    await raw_db["ai_analysis_jobs"].delete_many(user_filter)
    await raw_db["email_ai_campaigns"].delete_many(user_filter)
    await raw_db["wa_ai_campaigns"].delete_many(user_filter)

    # Delete user
    await raw_db["users"].delete_one(target_query)

    # Log audit
    ip_address = request.client.host if request.client else "Unknown"
    await log_audit_action(
        action="ADMIN_USER_DELETE",
        user_id=user_id,
        user_email=user_email,
        resource="users",
        resource_id=user_id,
        ip_address=ip_address,
        details={
            "admin_id": str(current_admin.id),
            "admin_email": current_admin.email,
            "deleted_user_email": user_email
        }
    )

    return {
        "success": True,
        "message": f"User {user_email} and all associated data deleted successfully."
    }


@router.post("/{user_id}/impersonate")
async def impersonate_user(
    user_id: str,
    request: Request,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    """
    Admin: Login as User (Admin Impersonation).
    Generates authenticated session tokens allowing the Admin to view the platform
    exactly from the target user's perspective, without needing the user's password.
    """
    raw_db = get_raw_db()
    target_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
    target_user = await raw_db["users"].find_one(target_query)
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    if not target_user.get("is_active", True):
        raise HTTPException(status_code=400, detail="Cannot impersonate an inactive user account.")

    target_user_id = str(target_user["_id"])
    target_email = target_user.get("email")
    target_role = (target_user.get("role") or "user").lower()

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)

    # Issue tokens with impersonation metadata
    claims = {
        "role": target_role,
        "impersonated_by": str(current_admin.id),
        "is_impersonated": True,
        "admin_email": current_admin.email
    }

    access_token = security.create_access_token(
        target_user_id,
        expires_delta=access_token_expires,
        additional_claims=claims
    )
    refresh_token = security.create_refresh_token(
        target_user_id,
        expires_delta=refresh_token_expires,
        additional_claims=claims
    )

    device_info = request.headers.get("user-agent", "Unknown")
    ip_address = request.client.host if request.client else "Unknown"

    session = SessionCreate(
        user_id=target_user_id,
        refresh_token=refresh_token,
        device_info=f"[Impersonated by {current_admin.email}] {device_info}",
        ip_address=ip_address,
        expires_at=datetime.utcnow() + refresh_token_expires
    )
    await raw_db["sessions"].insert_one(session.model_dump())

    # Log audit event
    await log_audit_action(
        action="ADMIN_IMPERSONATE_START",
        user_id=target_user_id,
        user_email=target_email,
        resource="users",
        resource_id=target_user_id,
        ip_address=ip_address,
        user_agent=device_info,
        details={
            "admin_id": str(current_admin.id),
            "admin_email": current_admin.email,
            "target_user_id": target_user_id,
            "target_user_email": target_email
        }
    )

    sanitized_user = {
        "id": target_user_id,
        "_id": target_user_id,
        "email": target_email,
        "full_name": target_user.get("full_name"),
        "role": target_user.get("role", "USER"),
        "company_name": target_user.get("company_name"),
        "is_active": target_user.get("is_active", True)
    }

    return {
        "success": True,
        "is_impersonating": True,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": sanitized_user,
        "impersonated_by": {
            "id": str(current_admin.id),
            "email": current_admin.email,
            "role": str(current_admin.role)
        }
    }


@router.post("/impersonate/stop")
async def stop_impersonation(
    request: Request,
    current_user: UserInDB = Depends(require_admin)
) -> Any:
    """
    Log audit action when Admin exits impersonation session and returns to their admin account.
    """
    ip_address = request.client.host if request.client else "Unknown"
    await log_audit_action(
        action="ADMIN_IMPERSONATE_STOP",
        user_id=str(current_user.id),
        user_email=current_user.email,
        resource="users",
        ip_address=ip_address,
        details={
            "admin_id": str(current_user.id),
            "admin_email": current_user.email
        }
    )
    return {
        "success": True,
        "message": "Impersonation session ended successfully."
    }
