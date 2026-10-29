"""
Tags Management Router
Handles CRUD operations for tags across the system
"""

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from bson import ObjectId

from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.core.logger import logger

router = APIRouter()

class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: Optional[str] = Field(default="#3B82F6", pattern="^#[0-9A-Fa-f]{6}$")
    description: Optional[str] = Field(default="", max_length=200)

class TagUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    description: Optional[str] = Field(None, max_length=200)

class TagResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    name: str
    color: str
    description: str
    lead_count: int = 0
    created_at: datetime
    updated_at: datetime
    
    class Config:
        populate_by_name = True

class TagsListResponse(BaseModel):
    data: List[TagResponse]
    total: int

@router.get("/", response_model=TagsListResponse)
async def get_tags(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get all tags for the current user
    Supports pagination and search
    """
    query = {"user_id": current_user.id}
    
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    # Get tags
    cursor = db["tags"].find(query).sort("name", 1).skip(skip).limit(limit)
    tags = await cursor.to_list(length=limit)
    
    # Count leads for each tag
    for tag in tags:
        tag["_id"] = str(tag["_id"])
        # Count leads that have this tag
        tag["lead_count"] = await db["leads"].count_documents({
            "user_id": current_user.id,
            "tags": tag["name"]
        })
    
    total = await db["tags"].count_documents(query)
    
    return TagsListResponse(
        data=[TagResponse(**tag) for tag in tags],
        total=total
    )

@router.post("/", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    tag_data: TagCreate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Create a new tag
    Tag names must be unique per user
    """
    # Check if tag with same name already exists for this user
    existing_tag = await db["tags"].find_one({
        "user_id": current_user.id,
        "name": tag_data.name
    })
    
    if existing_tag:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tag '{tag_data.name}' already exists"
        )
    
    # Create tag
    now = datetime.utcnow()
    tag_doc = {
        "user_id": current_user.id,
        "name": tag_data.name,
        "color": tag_data.color,
        "description": tag_data.description,
        "created_at": now,
        "updated_at": now
    }
    
    result = await db["tags"].insert_one(tag_doc)
    tag_doc["_id"] = str(result.inserted_id)
    tag_doc["lead_count"] = 0
    
    logger.info(f"Tag created: {tag_data.name} by user {current_user.id}")
    
    return TagResponse(**tag_doc)

@router.get("/{tag_id}", response_model=TagResponse)
async def get_tag(
    tag_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get a specific tag by ID"""
    if not ObjectId.is_valid(tag_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid tag ID format"
        )
    
    tag = await db["tags"].find_one({
        "_id": ObjectId(tag_id),
        "user_id": current_user.id
    })
    
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found"
        )
    
    tag["_id"] = str(tag["_id"])
    
    # Count leads with this tag
    tag["lead_count"] = await db["leads"].count_documents({
        "user_id": current_user.id,
        "tags": tag["name"]
    })
    
    return TagResponse(**tag)

@router.put("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: str,
    tag_data: TagUpdate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Update a tag
    If name is changed, updates all leads with the old tag name
    """
    if not ObjectId.is_valid(tag_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid tag ID format"
        )
    
    # Get existing tag
    existing_tag = await db["tags"].find_one({
        "_id": ObjectId(tag_id),
        "user_id": current_user.id
    })
    
    if not existing_tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found"
        )
    
    # Prepare update data
    update_data = {"updated_at": datetime.utcnow()}
    
    if tag_data.name is not None:
        # Check if new name conflicts with another tag
        if tag_data.name != existing_tag["name"]:
            conflict = await db["tags"].find_one({
                "user_id": current_user.id,
                "name": tag_data.name,
                "_id": {"$ne": ObjectId(tag_id)}
            })
            
            if conflict:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Tag '{tag_data.name}' already exists"
                )
            
            # Update all leads with the old tag name
            await db["leads"].update_many(
                {
                    "user_id": current_user.id,
                    "tags": existing_tag["name"]
                },
                {
                    "$set": {"tags.$": tag_data.name}
                }
            )
            
            update_data["name"] = tag_data.name
            logger.info(f"Tag renamed from '{existing_tag['name']}' to '{tag_data.name}'")
    
    if tag_data.color is not None:
        update_data["color"] = tag_data.color
    
    if tag_data.description is not None:
        update_data["description"] = tag_data.description
    
    # Update tag
    await db["tags"].update_one(
        {"_id": ObjectId(tag_id)},
        {"$set": update_data}
    )
    
    # Get updated tag
    updated_tag = await db["tags"].find_one({"_id": ObjectId(tag_id)})
    updated_tag["_id"] = str(updated_tag["_id"])
    
    # Count leads
    updated_tag["lead_count"] = await db["leads"].count_documents({
        "user_id": current_user.id,
        "tags": updated_tag["name"]
    })
    
    return TagResponse(**updated_tag)

@router.patch("/{tag_id}", response_model=TagResponse)
async def patch_tag(
    tag_id: str,
    tag_data: TagUpdate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Partial update of a tag (same as PUT for this resource)"""
    return await update_tag(tag_id, tag_data, current_user, db)

@router.delete("/{tag_id}")
async def delete_tag(
    tag_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Delete a tag
    Also removes this tag from all leads
    """
    if not ObjectId.is_valid(tag_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid tag ID format"
        )
    
    # Get tag
    tag = await db["tags"].find_one({
        "_id": ObjectId(tag_id),
        "user_id": current_user.id
    })
    
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found"
        )
    
    tag_name = tag["name"]
    
    # Remove tag from all leads
    result = await db["leads"].update_many(
        {
            "user_id": current_user.id,
            "tags": tag_name
        },
        {
            "$pull": {"tags": tag_name}
        }
    )
    
    # Delete tag
    await db["tags"].delete_one({"_id": ObjectId(tag_id)})
    
    logger.info(f"Tag deleted: {tag_name}, removed from {result.modified_count} leads")
    
    return {
        "success": True,
        "message": f"Tag '{tag_name}' deleted",
        "leads_updated": result.modified_count
    }

@router.options("/")
@router.options("/{tag_id}")
async def tags_options():
    """Handle OPTIONS preflight requests for CORS"""
    return {"message": "OK"}
