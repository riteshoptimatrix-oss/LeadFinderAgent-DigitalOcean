"""
Media Upload & Management API Routes
Allows uploading images and videos for Email Templates and Campaigns,
serving them publicly with CORS and cache headers for email clients.
"""

from datetime import datetime, timezone
import os
from pathlib import Path
import re
from typing import Any, Dict, List, Optional
import uuid

import aiofiles
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.core.logger import logger
from app.db.database import get_db
from app.models.user import UserInDB
from app.services.email_ai.tracking_utils import get_tracking_base_url

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "images").mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "videos").mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".ogg", ".m4v"}

MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
MAX_VIDEO_SIZE_BYTES = 60 * 1024 * 1024  # 60 MB


class MediaItemResponse(BaseModel):
    id: str
    filename: str
    original_name: str
    media_type: str  # "image" or "video"
    mime_type: str
    size_bytes: int
    url: str
    created_at: str


class MediaBase64UploadRequest(BaseModel):
    filename: str
    content_base64: str
    media_type: Optional[str] = "image"


@router.post("/upload", response_model=MediaItemResponse)
async def upload_media(
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db),
):
    """Upload an image or video file, store it locally and return public URL."""
    orig_name = file.filename or "uploaded_media"
    ext = Path(orig_name).suffix.lower()

    if ext in ALLOWED_IMAGE_EXTENSIONS:
        media_type = "image"
        subfolder = "images"
        max_size = MAX_IMAGE_SIZE_BYTES
    elif ext in ALLOWED_VIDEO_EXTENSIONS:
        media_type = "video"
        subfolder = "videos"
        max_size = MAX_VIDEO_SIZE_BYTES
    else:
        allowed = list(ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed extensions: {', '.join(allowed)}",
        )

    # Sanitize stem
    safe_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", Path(orig_name).stem)[:30] or "media"
    unique_filename = f"{uuid.uuid4().hex[:10]}_{safe_stem}{ext}"
    target_path = UPLOAD_DIR / subfolder / unique_filename

    total_bytes = 0
    try:
        async with aiofiles.open(target_path, "wb") as out_f:
            while chunk := await file.read(1024 * 64):  # 64KB chunks
                total_bytes += len(chunk)
                if total_bytes > max_size:
                    # Clean up partial file
                    if target_path.exists():
                        try:
                            os.remove(target_path)
                        except Exception:
                            pass
                    max_mb = max_size // (1024 * 1024)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds maximum allowed size of {max_mb}MB for {media_type}s",
                    )
                await out_f.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[MediaUpload] Error saving file {orig_name}: {exc}")
        if target_path.exists():
            try:
                os.remove(target_path)
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save uploaded file on server",
        )

    base_url = get_tracking_base_url()
    public_url = f"{base_url}/api/v1/uploads/{subfolder}/{unique_filename}"
    now = datetime.now(timezone.utc)

    doc = {
        "user_id": str(current_user.id),
        "filename": unique_filename,
        "original_name": orig_name,
        "media_type": media_type,
        "mime_type": file.content_type or (f"{media_type}/{ext.lstrip('.')}" if ext else f"{media_type}/*"),
        "size_bytes": total_bytes,
        "url": public_url,
        "subfolder": subfolder,
        "created_at": now,
    }

    result = await db["media_uploads"].insert_one(doc)

    return MediaItemResponse(
        id=str(result.inserted_id),
        filename=unique_filename,
        original_name=orig_name,
        media_type=media_type,
        mime_type=doc["mime_type"],
        size_bytes=total_bytes,
        url=public_url,
        created_at=now.isoformat(),
    )


@router.post("/upload-base64", response_model=MediaItemResponse)
async def upload_media_base64(
    payload: MediaBase64UploadRequest,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db),
):
    """Upload media as base64-encoded string (JSON payload, bypasses multipart issues)."""
    import base64
    raw_b64 = payload.content_base64 or ""
    if "," in raw_b64:
        _, raw_b64 = raw_b64.split(",", 1)

    try:
        file_bytes = base64.b64decode(raw_b64)
    except Exception as b64_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 payload: {b64_err}",
        )

    orig_name = (payload.filename or "uploaded_media").strip()
    ext = Path(orig_name).suffix.lower()

    if ext in ALLOWED_IMAGE_EXTENSIONS:
        media_type = "image"
        subfolder = "images"
        max_size = MAX_IMAGE_SIZE_BYTES
    elif ext in ALLOWED_VIDEO_EXTENSIONS:
        media_type = "video"
        subfolder = "videos"
        max_size = MAX_VIDEO_SIZE_BYTES
    else:
        media_type = "video" if payload.media_type == "video" else "image"
        subfolder = "videos" if media_type == "video" else "images"
        max_size = MAX_VIDEO_SIZE_BYTES if media_type == "video" else MAX_IMAGE_SIZE_BYTES
        ext = ".mp4" if media_type == "video" else ".png"

    if len(file_bytes) > max_size:
        max_mb = max_size // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {max_mb}MB for {media_type}s",
        )

    safe_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", Path(orig_name).stem)[:30] or "media"
    unique_filename = f"{uuid.uuid4().hex[:10]}_{safe_stem}{ext}"
    target_path = UPLOAD_DIR / subfolder / unique_filename

    async with aiofiles.open(target_path, "wb") as out_f:
        await out_f.write(file_bytes)

    base_url = get_tracking_base_url()
    public_url = f"{base_url}/api/v1/uploads/{subfolder}/{unique_filename}"
    now = datetime.now(timezone.utc)

    doc = {
        "user_id": str(current_user.id),
        "filename": unique_filename,
        "original_name": orig_name,
        "media_type": media_type,
        "mime_type": f"{media_type}/{ext.lstrip('.')}" if ext else f"{media_type}/*",
        "size_bytes": len(file_bytes),
        "url": public_url,
        "subfolder": subfolder,
        "created_at": now,
    }

    result = await db["media_uploads"].insert_one(doc)

    return MediaItemResponse(
        id=str(result.inserted_id),
        filename=unique_filename,
        original_name=orig_name,
        media_type=media_type,
        mime_type=doc["mime_type"],
        size_bytes=len(file_bytes),
        url=public_url,
        created_at=now.isoformat(),
    )


@router.get("", response_model=List[MediaItemResponse])
async def list_media(
    media_type: Optional[str] = Query(None, description="Filter by 'image' or 'video'"),
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db),
):
    """List uploaded media files for the current user."""
    query: Dict[str, Any] = {"user_id": str(current_user.id)}
    if media_type in ("image", "video"):
        query["media_type"] = media_type

    cursor = db["media_uploads"].find(query).sort("created_at", -1).limit(100)
    docs = await cursor.to_list(100)

    base_url = get_tracking_base_url()
    results = []
    for d in docs:
        subfolder = d.get("subfolder") or ("images" if d.get("media_type") == "image" else "videos")
        fname = d.get("filename")
        # Ensure URL always matches the current base_url
        effective_url = f"{base_url}/api/v1/uploads/{subfolder}/{fname}" if fname else d.get("url", "")
        results.append(
            MediaItemResponse(
                id=str(d["_id"]),
                filename=d.get("filename", ""),
                original_name=d.get("original_name", "media"),
                media_type=d.get("media_type", "image"),
                mime_type=d.get("mime_type", ""),
                size_bytes=int(d.get("size_bytes", 0)),
                url=effective_url,
                created_at=(d.get("created_at") or datetime.now(timezone.utc)).isoformat(),
            )
        )
    return results


@router.delete("/{media_id}")
async def delete_media(
    media_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db),
):
    """Delete an uploaded media file."""
    if not ObjectId.is_valid(media_id):
        raise HTTPException(status_code=400, detail="Invalid media_id")

    doc = await db["media_uploads"].find_one({"_id": ObjectId(media_id), "user_id": str(current_user.id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Media file not found")

    subfolder = doc.get("subfolder") or ("images" if doc.get("media_type") == "image" else "videos")
    fname = doc.get("filename")
    if fname:
        fpath = UPLOAD_DIR / subfolder / fname
        if fpath.exists():
            try:
                os.remove(fpath)
            except Exception as e:
                logger.warning(f"[MediaDelete] Could not delete file {fpath}: {e}")

    await db["media_uploads"].delete_one({"_id": ObjectId(media_id)})
    return {"status": "success", "message": "Media file deleted successfully"}
