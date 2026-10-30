from typing import Any, List
from pydantic import BaseModel, EmailStr
import random
import secrets
import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from motor.motor_asyncio import AsyncIOMotorDatabase
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import timedelta, datetime

limiter = Limiter(key_func=get_remote_address)

from app.core import security
from app.core.config import settings
from app.api import dependencies
from app.db.database import get_db
from app.services.audit import log_audit_action
from app.services.auth_email_service import send_password_reset_email
from app.models.token import Token
from app.models.user import UserInDB, UserCreate, UserResponse
from app.models.session import SessionCreate, SessionResponse

router = APIRouter()

@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login_access_token(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    # 1. Search Admin collection first
    admin_dict = await db["admins"].find_one({"email": form_data.username})
    if admin_dict:
        if not security.verify_password(form_data.password, admin_dict["password_hash"]):
            raise HTTPException(status_code=400, detail="Incorrect email or password")
        if not admin_dict.get("is_active"):
            raise HTTPException(status_code=400, detail="Inactive admin account")
            
        admin_dict["_id"] = str(admin_dict["_id"])
        user_id = admin_dict["_id"]
        role = "admin"
        user_email = admin_dict["email"]
    else:
        # 2. Search Users collection
        user_dict = await db["users"].find_one({"email": form_data.username})
        if not user_dict:
            raise HTTPException(status_code=400, detail="Incorrect email or password")
        
        user_dict["_id"] = str(user_dict["_id"])
        if "id" in user_dict:
            user_dict["id"] = str(user_dict["id"])
        user = UserInDB(**user_dict)
        
        if not security.verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect email or password")
        
        if not user.is_active:
            raise HTTPException(status_code=400, detail="Inactive user")
            
        user_id = user.id
        role = "user"
        user_email = user.email

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    
    # Create tokens with role in payload
    access_payload = {"sub": str(user_id), "role": role}
    refresh_payload = {"sub": str(user_id), "role": role}
    
    access_token = security.create_access_token(user_id, expires_delta=access_token_expires, additional_claims={"role": role})
    refresh_token = security.create_refresh_token(user_id, expires_delta=refresh_token_expires, additional_claims={"role": role})
    
    # Store session
    device_info = request.headers.get("user-agent", "Unknown")
    ip_address = request.client.host if request.client else "Unknown"
    
    session = SessionCreate(
        user_id=user_id,
        refresh_token=refresh_token,
        device_info=device_info,
        ip_address=ip_address,
        expires_at=datetime.utcnow() + refresh_token_expires
    )
    
    await db["sessions"].insert_one(session.model_dump())
    
    await log_audit_action(
        action="USER_LOGIN" if role == "user" else "ADMIN_LOGIN",
        user_id=str(user_id),
        user_email=user_email,
        ip_address=ip_address,
        user_agent=device_info
    )
    
    # Update last login
    collection = "admins" if role == "admin" else "users"
    from bson.objectid import ObjectId
    await db[collection].update_one(
        {"_id": ObjectId(user_id)}, 
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "role": role
    }



@router.post("/register", response_model=UserResponse)
@limiter.limit("5/minute")
async def register_user(
    request: Request,
    user_in: UserCreate,
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Any:
    # Check if email already registered
    user_dict = await db["users"].find_one({"email": user_in.email})
    if user_dict:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed_password = security.get_password_hash(user_in.password)
    user_db = {
        "email": user_in.email,
        "hashed_password": hashed_password,
        "full_name": user_in.full_name,
        "mobile_number": user_in.mobile_number,
        "country": user_in.country,
        "state": user_in.state,
        "company_name": user_in.company_name,
        "is_active": True,
        "is_superuser": False,
        "role": "USER",
        "account_status": "Active",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await db["users"].insert_one(user_db)
    created_user = await db["users"].find_one({"_id": result.inserted_id})
    
    await log_audit_action(
        action="USER_REGISTER",
        user_id=str(result.inserted_id),
        user_email=user_in.email,
        ip_address=request.client.host if request.client else None
    )
    
    return UserResponse(**created_user)

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@router.post("/refresh", response_model=Token)
@limiter.limit("5/minute")
async def refresh_token(
    request: Request,
    body: RefreshTokenRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Any:
    session_dict = await db["sessions"].find_one({"refresh_token": body.refresh_token, "is_active": True})
    if not session_dict:
        raise HTTPException(status_code=403, detail="Invalid or expired refresh token")
    
    if session_dict["expires_at"] < datetime.utcnow():
        await db["sessions"].update_one({"_id": session_dict["_id"]}, {"$set": {"is_active": False}})
        raise HTTPException(status_code=403, detail="Refresh token expired")
        
    user_id = session_dict["user_id"]
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(user_id, expires_delta=access_token_expires)
    
    return {
        "access_token": access_token,
        "refresh_token": body.refresh_token,
        "token_type": "bearer",
    }

@router.post("/logout")
async def logout(
    request: Request,
    current_user: UserInDB = Depends(dependencies.get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    return {"message": "Successfully logged out"}

@router.post("/logout-all")
async def logout_all(
    current_user: UserInDB = Depends(dependencies.get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    await db["sessions"].update_many(
        {"user_id": current_user.id, "is_active": True},
        {"$set": {"is_active": False}}
    )
    return {"message": "Successfully logged out of all devices"}

@router.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(
    current_user: UserInDB = Depends(dependencies.get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    cursor = db["sessions"].find({"user_id": current_user.id, "is_active": True})
    sessions = await cursor.to_list(length=100)
    for session in sessions:
        session["_id"] = str(session["_id"])
    return sessions

@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: UserInDB = Depends(dependencies.get_current_user)
):
    return current_user


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

@router.post("/forgot-password")
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Any:
    user_dict = await db["users"].find_one({"email": body.email})
    
    if user_dict:
        raw_token = secrets.token_urlsafe(32)
        hashed_token = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = datetime.utcnow() + timedelta(minutes=15)
        
        token_doc = {
            "user_id": str(user_dict["_id"]),
            "hashed_token": hashed_token,
            "expires_at": expires_at,
            "used": False,
            "created_at": datetime.utcnow(),
            "ip_address": request.client.host if request.client else "Unknown",
            "user_agent": request.headers.get("user-agent", "Unknown")
        }
        await db["password_reset_tokens"].insert_one(token_doc)
        
        import asyncio
        asyncio.create_task(send_password_reset_email(user_dict["email"], user_dict.get("full_name", "User"), raw_token))
        
        await log_audit_action(
            action="PASSWORD_RESET_REQUESTED",
            user_id=str(user_dict["_id"]),
            user_email=user_dict["email"],
            ip_address=request.client.host if request.client else None
        )

    return {"message": "If an account with that email exists, a password reset link has been sent."}


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.get("/validate-reset-token")
async def validate_reset_token(token: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    hashed_token = hashlib.sha256(token.encode()).hexdigest()
    token_doc = await db["password_reset_tokens"].find_one({"hashed_token": hashed_token})
    
    if not token_doc:
        raise HTTPException(status_code=400, detail="Reset link expired or invalid.")
    if token_doc.get("used"):
        raise HTTPException(status_code=400, detail="Reset link expired or invalid.")
    if token_doc.get("expires_at") and token_doc["expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset link expired or invalid.")
        
    return {"valid": True, "message": "Token is valid"}

@router.post("/reset-password")
@limiter.limit("5/hour")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Any:
    from app.models.user import UserCreate
    try:
        UserCreate.validate_password_strength(body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    hashed_token = hashlib.sha256(body.token.encode()).hexdigest()
    
    token_doc = await db["password_reset_tokens"].find_one({"hashed_token": hashed_token})
    if not token_doc or token_doc.get("used"):
        raise HTTPException(status_code=400, detail="Reset link expired or invalid.")
        
    if token_doc.get("expires_at") and token_doc["expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset link expired or invalid.")
        
    user_id = token_doc["user_id"]
    from bson.objectid import ObjectId
    user_dict = await db["users"].find_one({"_id": ObjectId(user_id) if len(user_id) == 24 else user_id})
    if not user_dict:
        raise HTTPException(status_code=400, detail="User not found.")
        
    new_hashed_password = security.get_password_hash(body.new_password)
    
    await db["users"].update_one(
        {"_id": user_dict["_id"]},
        {"$set": {"hashed_password": new_hashed_password}}
    )
    
    await db["password_reset_tokens"].update_many(
        {"user_id": user_id, "used": False},
        {"$set": {"used": True}}
    )
    
    await db["sessions"].update_many(
        {"user_id": str(user_dict.get("id", user_dict["_id"])), "is_active": True},
        {"$set": {"is_active": False}}
    )
    
    await log_audit_action(
        action="PASSWORD_UPDATED",
        user_id=str(user_dict["_id"]),
        user_email=user_dict["email"],
        ip_address=request.client.host if request.client else None
    )
    
    return {"message": "Password changed successfully."}

