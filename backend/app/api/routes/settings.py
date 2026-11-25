import asyncio
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.db.database import get_db
from app.api.dependencies import get_current_user, require_email_automation_access
from app.models.user import UserInDB
from app.models.settings import (
    UserSettingsResponse, UserSettingsUpdate,
    SMTPSettingsResponse, SMTPSettingsUpdate,
    SMTPTestRequest, SMTPTestResponse
)
from app.services.smtp_service import (
    run_smtp_verification_sync,
    run_imap_verification_sync,
    get_user_smtp_config,
    save_user_smtp_config,
    clean_app_password,
    is_masked_or_empty,
    MASKED_PASSWORD
)
from app.services.email_provider_registry import (
    detect_email_provider_async,
    list_all_providers,
    get_provider_by_id
)
from app.core.security_crypto import encrypt_string

router = APIRouter()

# ─────────────────────────────────────────────────────────────
# Email Provider Auto-Detection & Registry Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/email-provider/detect")
async def detect_provider_for_email(
    email: Optional[str] = Query(None, description="Email address to detect provider for"),
    current_user: UserInDB = Depends(require_email_automation_access)
):
    """Automatically detect email provider (including DNS MX lookup for custom domains)."""
    target_email = (email or current_user.email or "").strip().lower()
    return await detect_email_provider_async(target_email, include_details=True)


@router.get("/email-provider/registry")
async def get_email_provider_registry(
    current_user: UserInDB = Depends(require_email_automation_access)
):
    """List all supported email providers and their default configurations."""
    return {"providers": list_all_providers()}

# ─────────────────────────────────────────────────────────────
# Dedicated SMTP / IMAP Configuration & Testing Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/smtp", response_model=SMTPSettingsResponse)
async def get_smtp_settings(
    current_user: UserInDB = Depends(require_email_automation_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Retrieve the current authenticated user's SMTP/IMAP configuration with masked password."""
    config = await get_user_smtp_config(db, str(current_user.id), decrypt_pwd=False)
    account_email = str(current_user.email or "").strip().lower()
    effective_user = (config.get("smtp_user") or account_email).strip().lower()
    detected = await detect_email_provider_async(effective_user, include_details=True)
    provider_info = detected.get("provider", {})

    default_imap_host = provider_info.get("imap", {}).get("host", "") if provider_info.get("imap", {}).get("supported") else ""
    default_imap_port = provider_info.get("imap", {}).get("port", 993)
    default_imap_enc = provider_info.get("imap", {}).get("encryption", "SSL")

    return SMTPSettingsResponse(
        smtp_host=config.get("smtp_host") or provider_info.get("smtp", {}).get("host") or "smtp.gmail.com",
        smtp_port=config.get("smtp_port") or provider_info.get("smtp", {}).get("port") or 587,
        smtp_user=effective_user,
        smtp_pass=config.get("smtp_pass", ""),
        smtp_encryption=config.get("smtp_encryption") or provider_info.get("smtp", {}).get("encryption") or "TLS",
        smtp_from_email=config.get("smtp_from_email") or effective_user,
        smtp_sender_name=config.get("smtp_sender_name", ""),
        smtp_status=config.get("smtp_status", "NOT_CONFIGURED"),
        imap_host=config.get("imap_host") if config.get("imap_host") is not None else default_imap_host,
        imap_port=config.get("imap_port") or default_imap_port,
        imap_encryption=config.get("imap_encryption") or default_imap_enc,
        imap_status=config.get("imap_status", "NOT_CONFIGURED"),
        auth_method=config.get("auth_method") or provider_info.get("recommended_auth", "app_password"),
        detected_provider=detected,
        last_tested_at=config.get("last_tested_at"),
        last_test_error=config.get("last_test_error"),
        daily_limit=config.get("daily_limit", 500),
        signature=config.get("signature", "Best regards,\nThe Growth Team\nwww.example.com"),
        track_opens=config.get("track_opens", True),
        has_password=config.get("has_password", False)
    )


@router.put("/smtp", response_model=SMTPSettingsResponse)
async def update_smtp_settings(
    payload: SMTPSettingsUpdate,
    current_user: UserInDB = Depends(require_email_automation_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Save SMTP/IMAP settings with provider-aware validation.
    - Encrypts password at rest.
    - Preserves existing password if new value is blank or mask placeholder.
    - Automatically syncs to Email AI module and broadcasts real-time update.
    """
    data = payload.model_dump(exclude_unset=True)
    account_email = str(current_user.email or "").strip().lower()
    effective_user = str(data.get("smtp_user") or account_email).strip().lower()
    if not effective_user:
        raise HTTPException(status_code=400, detail="Email address (Username) is required.")

    detected = await detect_email_provider_async(effective_user, include_details=True)
    provider_id = data.get("detected_provider_id") or detected.get("provider_id")
    provider_info = get_provider_by_id(provider_id)

    if provider_id == "tuta":
        raise HTTPException(
            status_code=400,
            detail="Tuta Mail does not support SMTP, IMAP, or App Passwords. Please use a supported email provider."
        )

    if not data.get("smtp_host"):
        raise HTTPException(status_code=400, detail="SMTP Host is required.")
    if not data.get("smtp_port"):
        raise HTTPException(status_code=400, detail="SMTP Port is required.")

    data["smtp_user"] = effective_user
    data["detected_provider_id"] = provider_id
    if not data.get("smtp_from_email"):
        data["smtp_from_email"] = effective_user
    if not data.get("auth_method"):
        data["auth_method"] = provider_info.get("recommended_auth", "smtp_auth")

    updated_config = await save_user_smtp_config(db, str(current_user.id), data)
    return SMTPSettingsResponse(
        smtp_host=updated_config.get("smtp_host", "smtp.gmail.com"),
        smtp_port=updated_config.get("smtp_port", 587),
        smtp_user=updated_config.get("smtp_user", effective_user),
        smtp_pass=updated_config.get("smtp_pass", ""),
        smtp_encryption=updated_config.get("smtp_encryption", "TLS"),
        smtp_from_email=updated_config.get("smtp_from_email", effective_user),
        smtp_sender_name=updated_config.get("smtp_sender_name", ""),
        smtp_status=updated_config.get("smtp_status", "NOT_CONFIGURED"),
        imap_host=updated_config.get("imap_host", ""),
        imap_port=updated_config.get("imap_port", 993),
        imap_encryption=updated_config.get("imap_encryption", "SSL"),
        imap_status=updated_config.get("imap_status", "NOT_CONFIGURED"),
        auth_method=updated_config.get("auth_method", "app_password"),
        detected_provider=detected,
        last_tested_at=updated_config.get("last_tested_at"),
        last_test_error=updated_config.get("last_test_error"),
        daily_limit=updated_config.get("daily_limit", 500),
        signature=updated_config.get("signature", ""),
        track_opens=updated_config.get("track_opens", True),
        has_password=updated_config.get("has_password", False)
    )


@router.post("/smtp/test", response_model=SMTPTestResponse)
async def test_smtp_connection(
    request: SMTPTestRequest,
    current_user: UserInDB = Depends(require_email_automation_access),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Perform a real SMTP (and optional IMAP) connection & authentication test.
    If smtp_pass is omitted or masked, loads and decrypts user's saved password.
    Updates the connection status in database and returns actionable diagnostic information.
    """
    uid_str = str(current_user.id)
    account_email = str(current_user.email or "").strip().lower()
    host = request.smtp_host
    port = request.smtp_port or 587
    user = (request.smtp_user or "").strip().lower()
    pwd = request.smtp_pass
    encryption = request.smtp_encryption or "TLS"
    from_email = request.smtp_from_email
    from_name = request.smtp_sender_name
    imap_host = request.imap_host
    imap_port = request.imap_port or 993
    imap_encryption = request.imap_encryption or "SSL"

    # If parameters missing, fall back to saved configuration
    if not host or not user or is_masked_or_empty(pwd):
        saved_config = await get_user_smtp_config(db, uid_str, decrypt_pwd=True)
        if not host:
            host = saved_config.get("smtp_host")
        if not port:
            port = saved_config.get("smtp_port", 587)
        if not user:
            user = (saved_config.get("smtp_user") or account_email).strip().lower()
        if is_masked_or_empty(pwd):
            pwd = saved_config.get("smtp_pass")
        if not from_email:
            from_email = saved_config.get("smtp_from_email") or user
        if not from_name:
            from_name = saved_config.get("smtp_sender_name")
        if not encryption:
            encryption = saved_config.get("smtp_encryption", "TLS")
        if not imap_host:
            imap_host = saved_config.get("imap_host")

    if not user:
        user = account_email
    if not from_email:
        from_email = user

    detected = await detect_email_provider_async(user, include_details=True)
    if detected.get("provider_id") == "tuta":
        raise HTTPException(
            status_code=400,
            detail="Tuta Mail does not support SMTP or IMAP connections."
        )

    if not host or not user:
        raise HTTPException(
            status_code=400,
            detail="SMTP Host and Email Address (Username) are required for testing."
        )
    if not pwd:
        raise HTTPException(
            status_code=400,
            detail="Password / App Password is required. Please enter it before testing."
        )

    # Run blocking SMTP test in executor
    loop = asyncio.get_running_loop()
    test_result = await loop.run_in_executor(
        None,
        run_smtp_verification_sync,
        host,
        port,
        encryption,
        user,
        pwd,
        from_email,
        from_name,
        15,  # timeout
        request.send_test,
        request.recipient or user
    )

    imap_tested = False
    imap_result = None
    if request.test_imap and imap_host:
        imap_tested = True
        imap_result = await loop.run_in_executor(
            None,
            run_imap_verification_sync,
            imap_host,
            imap_port,
            imap_encryption,
            user,
            pwd,
            12
        )

    # Persist the connection status in settings & email_ai_smtp
    now = datetime.now(timezone.utc)
    new_status = test_result.get("status", "CONNECTION_FAILED")
    update_fields = {
        "smtp_status": new_status,
        "last_tested_at": now,
        "last_test_error": test_result.get("error") if not test_result.get("success") else None
    }
    if imap_tested and imap_result is not None:
        update_fields["imap_status"] = imap_result.get("status", "CONNECTION_FAILED")

    await db["settings"].update_one(
        {"user_id": uid_str},
        {"$set": update_fields}
    )

    # Update email_ai_smtp status
    await db["email_ai_smtp"].update_many(
        {"user_id": uid_str, "is_default": True},
        {"$set": {"last_verified_at": now, "status": new_status}}
    )

    # Broadcast status change
    try:
        from app.services.ws_manager import ws_manager
        await ws_manager.broadcast({
            "type": "SMTP_STATUS_CHANGED",
            "event_type": "SMTP_STATUS_CHANGED",
            "user_id": uid_str,
            "status": new_status,
            "timestamp": now.isoformat()
        })
    except Exception:
        pass

    return SMTPTestResponse(
        success=bool(test_result.get("success")),
        status=new_status,
        message=test_result.get("message", ""),
        host=test_result.get("host", host),
        port=test_result.get("port", port),
        mode=test_result.get("mode", encryption),
        imap_tested=imap_tested,
        imap_success=imap_result.get("success") if imap_result else None,
        imap_status=imap_result.get("status") if imap_result else None,
        imap_message=imap_result.get("message") if imap_result else None,
        test_email_sent=bool(test_result.get("test_email_sent", False)),
        recipient=test_result.get("recipient"),
        error=test_result.get("error")
    )


# ─────────────────────────────────────────────────────────────
# General Settings Endpoints (backward-compatible)
# ─────────────────────────────────────────────────────────────

@router.get("/", response_model=UserSettingsResponse)
async def get_settings(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    settings = await db["settings"].find_one({"user_id": current_user.id})
    if not settings:
        return UserSettingsResponse(id=str(ObjectId()), user_id=current_user.id)
        
    settings["id"] = str(settings["_id"])
    # Mask password before sending
    if settings.get("smtp_pass"):
        settings["has_password"] = True
        settings["smtp_pass"] = MASKED_PASSWORD
    else:
        settings["has_password"] = False
        settings["smtp_pass"] = ""

    return UserSettingsResponse(**settings)


@router.put("/", response_model=UserSettingsResponse)
async def update_settings(
    settings_in: UserSettingsUpdate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    update_data = settings_in.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data provided")

    # If smtp_pass is provided, handle encryption
    if "smtp_pass" in update_data:
        if is_masked_or_empty(update_data["smtp_pass"]):
            # Don't overwrite existing
            del update_data["smtp_pass"]
        else:
            cleaned = clean_app_password(update_data["smtp_pass"], update_data.get("smtp_host"))
            update_data["smtp_pass"] = encrypt_string(cleaned)
        
    await db["settings"].update_one(
        {"user_id": current_user.id},
        {"$set": update_data},
        upsert=True
    )
    
    settings = await db["settings"].find_one({"user_id": current_user.id})
    settings["id"] = str(settings["_id"])
    if settings.get("smtp_pass"):
        settings["has_password"] = True
        settings["smtp_pass"] = MASKED_PASSWORD
    else:
        settings["has_password"] = False
        settings["smtp_pass"] = ""

    return UserSettingsResponse(**settings)
