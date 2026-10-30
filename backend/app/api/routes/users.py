from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
import json
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB, UserUpdate, ChangePassword, UserResponse, UserRole
from app.services.audit import log_audit_action
from app.core.security import get_password_hash, verify_password

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def read_user_me(current_user: UserInDB = Depends(get_current_user)):
    return UserResponse(**current_user.model_dump(by_alias=True))

@router.put("/me", response_model=UserResponse)
async def update_user_me(
    user_in: UserUpdate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    update_data = user_in.model_dump(exclude_unset=True)
    if not update_data:
        return UserResponse(**current_user.model_dump(by_alias=True))

    # Prevent non-admin users from changing their role
    if current_user.role != UserRole.ADMIN and "role" in update_data:
        del update_data["role"]

    collection_name = "admins" if current_user.role == UserRole.ADMIN else "users"
    await db[collection_name].update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": update_data}
    )

    updated_user = await db[collection_name].find_one({"_id": ObjectId(current_user.id)})
    if updated_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    updated_user["_id"] = str(updated_user["_id"])
    if isinstance(updated_user.get("role"), str):
        updated_user["role"] = updated_user["role"].upper()
    return UserResponse(**updated_user)

@router.post("/change-password")
async def change_password(
    request: Request,
    data: ChangePassword,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")
        
    hashed_password = get_password_hash(data.new_password)
    await db["users"].update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": {"hashed_password": hashed_password}}
    )
    
    ip_address = request.client.host if request.client else "Unknown"
    await log_audit_action(
        action="Password Changed",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=ip_address
    )
    
    return {"message": "Password updated successfully"}

@router.get("/me/export")
async def export_user_data(
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    leads_cursor = db["leads"].find({"user_id": current_user.id})
    leads = await leads_cursor.to_list(length=None)
    for lead in leads:
        lead["_id"] = str(lead["_id"])
        
    ip_address = request.client.host if request.client else "Unknown"
    await log_audit_action(
        action="Workspace Data Exported",
        user_id=current_user.id,
        user_email=current_user.email,
        ip_address=ip_address
    )
    
    return Response(content=json.dumps(leads, default=str), media_type="application/json")

@router.delete("/me")
async def delete_user_account(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    user_id = current_user.id
    await db["leads"].delete_many({"user_id": user_id})
    await db["search_jobs"].delete_many({"user_id": user_id})
    await db["users"].delete_one({"_id": ObjectId(user_id)})
    
    return {"message": "Account and all associated data deleted successfully."}

@router.get("/me/security-logs")
async def get_security_logs(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    logs_cursor = db["audit_logs"].find({"user_id": current_user.id}).sort("created_at", -1).limit(20)
    logs = await logs_cursor.to_list(length=None)
    for log in logs:
        log["_id"] = str(log["_id"])
    return logs
