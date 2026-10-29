"""
Backup & Restore API
One-click MongoDB export/import for critical collections.
"""
import json
import os
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId, json_util
from app.db.database import get_db
from app.api.dependencies import get_current_superuser

logger = logging.getLogger(__name__)
router = APIRouter()

# Collections to back up
BACKUP_COLLECTIONS = [
    "leads",
    "users",
    "user_settings",
    "campaigns",
    "campaign_templates",
    "email_templates",
    "wa_templates",
    "wa_campaigns",
    "search_jobs",
    "ai_analysis",
    "website_audits",
    "seo_audits",
    "design_audits",
    "contact_discoveries",
    "reports",
    "crm_tasks",
    "crm_activities",
]

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "backups")


def _ensure_backup_dir():
    os.makedirs(BACKUP_DIR, exist_ok=True)


@router.post("/export")
async def export_backup(db: AsyncIOMotorDatabase = Depends(get_db), current_user=Depends(get_current_superuser)):
    """Export all critical MongoDB collections to a timestamped JSON archive."""
    _ensure_backup_dir()

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"backup_{timestamp}.json"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)

    backup_data = {
        "metadata": {
            "created_at": datetime.utcnow().isoformat(),
            "created_by": current_user.id if hasattr(current_user, 'id') else str(current_user.get("_id", "unknown")),
            "collections": [],
            "total_documents": 0,
        },
        "collections": {},
    }

    try:
        for collection_name in BACKUP_COLLECTIONS:
            try:
                documents = await db[collection_name].find({}).to_list(length=None)
                # Serialize using bson json_util to handle ObjectId, datetime, etc.
                serialized = json.loads(json_util.dumps(documents))
                backup_data["collections"][collection_name] = serialized
                backup_data["metadata"]["collections"].append(collection_name)
                backup_data["metadata"]["total_documents"] += len(serialized)
                logger.info(f"Backed up {len(serialized)} documents from {collection_name}")
            except Exception as e:
                logger.warning(f"Failed to backup collection {collection_name}: {e}")
                backup_data["collections"][collection_name] = []

        with open(backup_path, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, indent=2, default=str)

        file_size_mb = os.path.getsize(backup_path) / (1024 * 1024)
        logger.info(f"Backup created: {backup_filename} ({file_size_mb:.2f} MB)")

        return {
            "status": "success",
            "message": "Backup created successfully",
            "filename": backup_filename,
            "file_size_mb": round(file_size_mb, 2),
            "total_documents": backup_data["metadata"]["total_documents"],
            "collections_backed_up": len(backup_data["metadata"]["collections"]),
        }

    except Exception as e:
        logger.error(f"Backup export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")


@router.post("/import")
async def import_backup(
    filename: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user=Depends(get_current_superuser),
):
    """Restore from a JSON archive. Inserts documents that don't already exist (by _id)."""
    _ensure_backup_dir()

    backup_path = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail=f"Backup file '{filename}' not found.")

    try:
        with open(backup_path, "r", encoding="utf-8") as f:
            backup_data = json.load(f)

        restore_results = {}
        total_restored = 0

        for collection_name, documents in backup_data.get("collections", {}).items():
            if not documents:
                restore_results[collection_name] = {"inserted": 0, "skipped": 0}
                continue

            # Deserialize bson types
            deserialized = json_util.loads(json_util.dumps(documents))

            inserted = 0
            skipped = 0
            for doc in deserialized:
                try:
                    doc_id = doc.get("_id")
                    if doc_id:
                        existing = await db[collection_name].find_one({"_id": doc_id})
                        if existing:
                            skipped += 1
                            continue
                    await db[collection_name].insert_one(doc)
                    inserted += 1
                except Exception as e:
                    logger.warning(f"Failed to restore document in {collection_name}: {e}")
                    skipped += 1

            restore_results[collection_name] = {"inserted": inserted, "skipped": skipped}
            total_restored += inserted

        logger.info(f"Restore completed from {filename}: {total_restored} documents inserted.")

        return {
            "status": "success",
            "message": "Restore completed",
            "filename": filename,
            "total_restored": total_restored,
            "details": restore_results,
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid backup file format.")
    except Exception as e:
        logger.error(f"Backup import failed: {e}")
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")


@router.get("/list")
async def list_backups(current_user=Depends(get_current_superuser)):
    """List all available backup files."""
    _ensure_backup_dir()

    backups = []
    try:
        for filename in sorted(os.listdir(BACKUP_DIR), reverse=True):
            if filename.endswith(".json") and filename.startswith("backup_"):
                filepath = os.path.join(BACKUP_DIR, filename)
                stat = os.stat(filepath)
                backups.append({
                    "filename": filename,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                    "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                })
    except Exception as e:
        logger.error(f"Failed to list backups: {e}")

    return {"status": "success", "backups": backups, "total": len(backups)}
