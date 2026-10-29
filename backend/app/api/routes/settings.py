from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.settings import UserSettingsResponse, UserSettingsUpdate

router = APIRouter()

@router.get("/", response_model=UserSettingsResponse)
async def get_settings(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    settings = await db["settings"].find_one({"user_id": current_user.id})
    if not settings:
        # Return default empty settings
        return UserSettingsResponse(id=str(ObjectId()), user_id=current_user.id)
        
    settings["id"] = str(settings["_id"])
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
        
    await db["settings"].update_one(
        {"user_id": current_user.id},
        {"$set": update_data},
        upsert=True
    )
    
    settings = await db["settings"].find_one({"user_id": current_user.id})
    settings["id"] = str(settings["_id"])
    return UserSettingsResponse(**settings)
