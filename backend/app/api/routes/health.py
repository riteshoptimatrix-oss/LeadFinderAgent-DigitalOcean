from fastapi import APIRouter, Depends
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import psutil
import time
import sys
from app.db.database import get_db
from app.core.logger import logger

router = APIRouter()

# Application start time for uptime calculation
START_TIME = time.time()

@router.get("/")
async def health_check():
    """Basic health check endpoint - always returns OK"""
    return {
        "status": "ok", 
        "timestamp": datetime.utcnow().isoformat(),
        "service": "Lead Finder Agent API"
    }

@router.get("/status")
async def get_health_status(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Comprehensive health status check
    Returns overall system health including all components
    """
    status_data = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "uptime_seconds": int(time.time() - START_TIME),
        "components": {}
    }
    
    # Check MongoDB
    try:
        await db.command("ping")
        status_data["components"]["database"] = {
            "status": "healthy",
            "type": "mongodb",
            "response_time_ms": 0
        }
    except Exception as e:
        status_data["status"] = "degraded"
        status_data["components"]["database"] = {
            "status": "unhealthy",
            "error": str(e)
        }
    
    # Check system resources
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        status_data["components"]["system"] = {
            "status": "healthy",
            "cpu_percent": cpu_percent,
            "memory_percent": memory.percent,
            "memory_used_mb": memory.used // (1024 * 1024),
            "memory_total_mb": memory.total // (1024 * 1024),
            "disk_percent": disk.percent,
            "disk_free_gb": disk.free // (1024 * 1024 * 1024)
        }
    except Exception as e:
        logger.error(f"Error getting system metrics: {e}")
        status_data["components"]["system"] = {
            "status": "unknown",
            "error": str(e)
        }
    
    return status_data

@router.get("/system")
async def get_system_health():
    """
    System resource health check powered by the centralized HealthManager.
    """
    from app.services.health.manager import health_manager
    try:
        report = await health_manager.get_system_health()
        return report.dict()
    except Exception as e:
        logger.error(f"Error in system health check: {e}")
        return {
            "status": "error",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }

@router.get("/database")
async def get_database_health(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Database health check
    Returns MongoDB connection status and latency
    """
    try:
        start_time = time.time()
        await db.command("ping")
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Get database stats
        stats = await db.command("dbStats")
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "type": "mongodb",
            "connection": "active",
            "latency_ms": latency_ms,
            "database": db.name,
            "collections": stats.get("collections", 0),
            "data_size_mb": stats.get("dataSize", 0) // (1024 * 1024),
            "storage_size_mb": stats.get("storageSize", 0) // (1024 * 1024),
            "indexes": stats.get("indexes", 0)
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "type": "mongodb",
            "connection": "failed",
            "error": str(e)
        }

@router.get("/queues")
async def get_queues_health(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Background job queues health check
    Returns status of all job queues
    """
    try:
        # Check AI queue
        ai_queue_stats = await db["ai_queue"].aggregate([
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]).to_list(length=None)
        
        ai_stats = {stat["_id"]: stat["count"] for stat in ai_queue_stats}
        
        # Check search queue
        search_queue_count = await db["search_queue"].count_documents({})
        
        # Check email campaigns
        email_pending = await db["email_campaigns"].count_documents({"status": "PENDING"})
        
        # Check WhatsApp campaigns
        wa_pending = await db["wa_queue"].count_documents({"status": "PENDING"})
        
        total_queued = (
            ai_stats.get("QUEUED", 0) + 
            search_queue_count + 
            email_pending + 
            wa_pending
        )
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "queues": {
                "ai_analysis": {
                    "queued": ai_stats.get("QUEUED", 0),
                    "processing": ai_stats.get("PROCESSING", 0),
                    "completed": ai_stats.get("SUCCESS", 0),
                    "failed": ai_stats.get("FAILED", 0)
                },
                "search": {
                    "queued": search_queue_count
                },
                "email": {
                    "pending": email_pending
                },
                "whatsapp": {
                    "pending": wa_pending
                }
            },
            "total_queued": total_queued,
            "workers": {
                "ai_worker": "active",
                "search_worker": "active",
                "email_worker": "active",
                "whatsapp_worker": "active",
                "campaign_worker": "active"
            }
        }
    except Exception as e:
        logger.error(f"Queue health check failed: {e}")
        return {
            "status": "error",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e)
        }

@router.get("/enterprise")
async def get_enterprise_health(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Enterprise comprehensive health monitoring endpoint.
    Aggregates MongoDB, queues, system, and worker nodes.
    """
    now = datetime.utcnow()
    try:
        start_time = time.time()
        await db.command("ping")
        latency_ms = int((time.time() - start_time) * 1000)
        db_status = "healthy"
    except Exception as e:
        latency_ms = -1
        db_status = f"unhealthy: {str(e)}"

    # System status
    cpu_percent = psutil.cpu_percent(interval=0.1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    # Worker status
    workers = []
    try:
        cursor = db["worker_nodes"].find({})
        async for worker in cursor:
            # Check if active (heartbeat within last 2 minutes)
            last_hb = worker.get("last_heartbeat")
            is_active = False
            if last_hb:
                delta = (now - last_hb).total_seconds()
                if delta < 120:
                    is_active = True
            
            workers.append({
                "node_id": worker.get("node_id"),
                "worker_name": worker.get("worker_name"),
                "status": "ONLINE" if is_active else "OFFLINE",
                "last_heartbeat": last_hb.isoformat() if last_hb else None,
                "cpu_percent": worker.get("cpu_percent", 0),
                "memory_percent": worker.get("memory_percent", 0)
            })
    except Exception:
        pass

    # Queue status
    queues = {}
    try:
        queues["search_jobs"] = {
            "queued": await db["search_jobs"].count_documents({"status": "QUEUED"}),
            "running": await db["search_jobs"].count_documents({"status": "RUNNING"}),
            "failed": await db["search_jobs"].count_documents({"status": "FAILED"})
        }
        queues["ai_analysis"] = {
            "queued": await db["ai_analysis_queues"].count_documents({"status": "QUEUED"}),
            "running": await db["ai_analysis_queues"].count_documents({"status": "RUNNING"}),
            "failed": await db["ai_analysis_queues"].count_documents({"status": "FAILED"})
        }
        queues["email_campaigns"] = {
            "queued": await db["email_campaigns"].count_documents({"status": "QUEUED"}),
            "running": await db["email_campaigns"].count_documents({"status": "RUNNING"}),
            "failed": await db["email_campaigns"].count_documents({"status": "FAILED"})
        }
        queues["whatsapp_campaigns"] = {
            "queued": await db["whatsapp_campaigns"].count_documents({"status": "QUEUED"}),
            "running": await db["whatsapp_campaigns"].count_documents({"status": "RUNNING"}),
            "failed": await db["whatsapp_campaigns"].count_documents({"status": "FAILED"})
        }
    except Exception:
        pass

    return {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "timestamp": now.isoformat(),
        "application_status": "ONLINE",
        "python_version": sys.version,
        "mongodb": {
            "status": db_status,
            "latency_ms": latency_ms
        },
        "system": {
            "cpu_percent": cpu_percent,
            "memory_percent": memory.percent,
            "disk_percent": disk.percent
        },
        "workers": workers,
        "queues": queues
    }
