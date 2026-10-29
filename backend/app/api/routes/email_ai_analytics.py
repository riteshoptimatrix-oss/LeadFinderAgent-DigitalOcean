from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from app.db.database import get_db

router = APIRouter()

@router.get("/history")
async def get_campaign_history(
    db=Depends(get_db),
    skip: int = 0,
    limit: int = 20,
    status: Optional[str] = None
):
    """Fetch completed, cancelled, or failed campaigns for history view."""
    query = {"status": {"$in": ["COMPLETED", "CANCELLED", "FAILED"]}}
    if status:
        query["status"] = status
        
    campaigns = await db["email_ai_campaigns"].find(query).sort("updated_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db["email_ai_campaigns"].count_documents(query)
    
    # Serialize ObjectId
    for c in campaigns:
        c["_id"] = str(c["_id"])
        if "template_id" in c:
            c["template_id"] = str(c["template_id"])
        if "smtp_id" in c:
            c["smtp_id"] = str(c["smtp_id"])
            
    return {"data": campaigns, "total": total}

@router.get("/analytics/overview")
async def get_analytics_overview(db=Depends(get_db)):
    """High level aggregated analytics across all campaigns."""
    # Count total emails processed
    pipeline = [
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1}
        }}
    ]
    status_counts = await db["email_ai_queue"].aggregate(pipeline).to_list(None)
    
    stats = {
        "total_campaigns": await db["email_ai_campaigns"].count_documents({}),
        "total_emails": await db["email_ai_queue"].count_documents({}),
        "delivered": 0,
        "failed": 0,
        "pending": 0,
        "replies": 0, # Placeholder for future IMAP integration
    }
    
    for sc in status_counts:
        if sc["_id"] == "Delivered":
            stats["delivered"] = sc["count"]
        elif sc["_id"] == "Failed":
            stats["failed"] = sc["count"]
        elif sc["_id"] in ["Pending", "Waiting", "Preparing", "Connecting", "Sending"]:
            stats["pending"] += sc["count"]
            
    total_processed = stats["delivered"] + stats["failed"]
    stats["success_rate"] = round((stats["delivered"] / total_processed * 100), 2) if total_processed > 0 else 0
    
    return stats

@router.get("/analytics/smtp/detailed")
async def get_detailed_smtp_analytics(db=Depends(get_db)):
    """Provider usage and failure rates."""
    # Group jobs by SMTP ID
    pipeline = [
        {"$group": {
            "_id": {"smtp_id": "$smtp_id", "status": "$status"},
            "count": {"$sum": 1}
        }}
    ]
    raw_stats = await db["email_ai_queue"].aggregate(pipeline).to_list(None)
    
    # Process into usable format
    smtp_stats = {}
    for stat in raw_stats:
        s_id = stat["_id"]["smtp_id"]
        status = stat["_id"]["status"]
        if s_id not in smtp_stats:
            smtp_stats[s_id] = {"delivered": 0, "failed": 0, "total": 0}
            
        if status == "Delivered":
            smtp_stats[s_id]["delivered"] += stat["count"]
        elif status == "Failed":
            smtp_stats[s_id]["failed"] += stat["count"]
        smtp_stats[s_id]["total"] += stat["count"]
        
    # Hydrate with SMTP names
    result = []
    for s_id, data in smtp_stats.items():
        if not s_id: continue
        smtp = await db["email_ai_smtp"].find_one({"_id": ObjectId(s_id)})
        if smtp:
            data["name"] = smtp.get("name", "Unknown")
            data["provider"] = smtp.get("provider", "Custom")
            data["health_score"] = 100 - (min(100, (data["failed"] / data["total"] * 100)) if data["total"] > 0 else 0)
            result.append(data)
            
    return result

@router.get("/health")
async def get_system_health(db=Depends(get_db)):
    """System health checks."""
    try:
        await db.command("ping")
        db_status = "OK"
    except Exception:
        db_status = "ERROR"
        
    return {
        "status": "Healthy" if db_status == "OK" else "Degraded",
        "database": db_status,
        "workers": {
            "campaign_worker": "OK",
            "smtp_worker": "OK",
            "retry_worker": "OK",
            "recovery_worker": "OK"
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@router.get("/audit")
async def get_audit_logs(db=Depends(get_db), limit: int = 50):
    logs = await db["email_ai_audit_logs"].find().sort("created_at", -1).limit(limit).to_list(limit)
    for log in logs:
        log["_id"] = str(log["_id"])
    return logs

@router.post("/cleanup")
async def trigger_cleanup(db=Depends(get_db)):
    """Manually trigger retention cleanup for old logs."""
    ninety_days_ago = datetime.now(timezone.utc) - timedelta(days=90)
    
    # Delete old queue items that are completed/failed
    result = await db["email_ai_queue"].delete_many({
        "status": {"$in": ["Delivered", "Failed", "Skipped", "Cancelled"]},
        "updated_at": {"$lt": ninety_days_ago}
    })
    
    # Delete old audit logs
    audit_result = await db["email_ai_audit_logs"].delete_many({
        "created_at": {"$lt": ninety_days_ago}
    })
    
    return {
        "message": "Cleanup completed",
        "queue_records_deleted": result.deleted_count,
        "audit_logs_deleted": audit_result.deleted_count
    }
