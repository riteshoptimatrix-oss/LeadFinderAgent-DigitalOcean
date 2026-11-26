"""
Media Upload & Management API Routes
Allows uploading images and videos for Email Templates and Campaigns,
serving them with secure HMAC cryptographic signatures, token validation,
and preventing unauthorized public URL direct access.
"""

from datetime import datetime, timezone
import hashlib
import hmac
import os
from pathlib import Path
import re
import time
from typing import Any, Dict, List, Optional
import uuid

import aiofiles
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from jose import jwt
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.core.config import settings
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

# Default signature validity: 7 days (604,800 seconds)
DEFAULT_SIGNATURE_TTL_SECONDS = 7 * 24 * 3600


def generate_media_signature(subfolder: str, filename: str, expires_at: int) -> str:
    """Generate an HMAC-SHA256 signature for secure, tamper-proof media access."""
    secret = settings.SECRET_KEY.encode("utf-8")
    message = f"{subfolder}:{filename}:{expires_at}".encode("utf-8")
    return hmac.new(secret, message, hashlib.sha256).hexdigest()[:32]


def verify_media_signature(subfolder: str, filename: str, expires_at: int, token: str) -> bool:
    """Verify that an HMAC signature matches and the timestamp has not expired."""
    current_ts = int(time.time())
    if expires_at < current_ts:
        return False
    expected = generate_media_signature(subfolder, filename, expires_at)
    return hmac.compare_digest(expected, token)


def build_secure_media_url(subfolder: str, filename: str, expires_in: int = DEFAULT_SIGNATURE_TTL_SECONDS) -> str:
    """Build a secure, signed media streaming URL with HMAC signature and expiry."""
    base_url = get_tracking_base_url()
    exp = int(time.time()) + expires_in
    sig = generate_media_signature(subfolder, filename, exp)
    return f"{base_url}/api/v1/media/stream/{subfolder}/{filename}?exp={exp}&sig={sig}"


async def _serve_secure_media(
    subfolder: str,
    filename: str,
    request: Request,
    exp: Optional[int] = None,
    sig: Optional[str] = None,
):
    """
    Validates HMAC signature or active JWT token before streaming requested media.
    Blocks any raw unauthenticated direct URL access (HTTP 403 Forbidden).
    """
    if subfolder not in ("images", "videos"):
        raise HTTPException(status_code=400, detail="Invalid media folder")

    # Path traversal protection
    clean_filename = Path(filename).name
    if not clean_filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    target_path = UPLOAD_DIR / subfolder / clean_filename
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")

    # 1. Verify HMAC cryptographic signature
    is_authorized = False
    if exp is not None and sig:
        if verify_media_signature(subfolder, clean_filename, exp, sig):
            is_authorized = True

    # 2. Check JWT Bearer token from request headers or cookies (for logged-in dashboard users)
    if not is_authorized:
        auth_header = request.headers.get("Authorization") or ""
        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        elif "access_token" in request.cookies:
            token = request.cookies.get("access_token") or ""

        if token:
            try:
                jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
                is_authorized = True
            except Exception:
                pass

    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Direct storage access is prohibited. Valid signature or authentication token required.",
        )

    ext = target_path.suffix.lower()
    if ext == ".mp4":
        mime = "video/mp4"
    elif ext == ".webm":
        mime = "video/webm"
    elif ext in (".jpg", ".jpeg"):
        mime = "image/jpeg"
    elif ext == ".png":
        mime = "image/png"
    elif ext == ".gif":
        mime = "image/gif"
    elif ext == ".webp":
        mime = "image/webp"
    else:
        mime = f"{subfolder}/{ext.lstrip('.')}" if ext else f"{subfolder}/*"

    return FileResponse(
        path=str(target_path),
        media_type=mime,
        filename=clean_filename,
        headers={
            "Cache-Control": "private, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        },
    )


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

    secure_url = build_secure_media_url(subfolder, unique_filename)
    now = datetime.now(timezone.utc)

    doc = {
        "user_id": str(current_user.id),
        "filename": unique_filename,
        "original_name": orig_name,
        "media_type": media_type,
        "mime_type": file.content_type or (f"{media_type}/{ext.lstrip('.')}" if ext else f"{media_type}/*"),
        "size_bytes": total_bytes,
        "url": secure_url,
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
        url=secure_url,
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

    secure_url = build_secure_media_url(subfolder, unique_filename)
    now = datetime.now(timezone.utc)

    doc = {
        "user_id": str(current_user.id),
        "filename": unique_filename,
        "original_name": orig_name,
        "media_type": media_type,
        "mime_type": f"{media_type}/{ext.lstrip('.')}" if ext else f"{media_type}/*",
        "size_bytes": len(file_bytes),
        "url": secure_url,
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
        url=secure_url,
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

    results = []
    for d in docs:
        subfolder = d.get("subfolder") or ("images" if d.get("media_type") == "image" else "videos")
        fname = d.get("filename")
        # Generate fresh secure signed URL for each listed item
        effective_url = build_secure_media_url(subfolder, fname) if fname else d.get("url", "")
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


@router.get("/stream/{subfolder}/{filename}")
async def stream_media(
    subfolder: str,
    filename: str,
    request: Request,
    exp: Optional[int] = Query(None, description="Signature expiration timestamp"),
    sig: Optional[str] = Query(None, description="HMAC-SHA256 authorization signature"),
):
    """Secure streaming endpoint for uploaded images and videos with signature & token verification."""
    return await _serve_secure_media(subfolder, filename, request, exp=exp, sig=sig)


@router.get("/uploads/{subfolder}/{filename}")
async def secure_media_legacy(
    subfolder: str,
    filename: str,
    request: Request,
    exp: Optional[int] = Query(None, description="Signature expiration timestamp"),
    sig: Optional[str] = Query(None, description="HMAC-SHA256 authorization signature"),
):
    """Protected endpoint for uploads path to prevent direct unauthenticated browser access."""
    return await _serve_secure_media(subfolder, filename, request, exp=exp, sig=sig)

