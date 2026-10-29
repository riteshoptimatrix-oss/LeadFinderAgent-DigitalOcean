import asyncio
import sys
import os
import logging
from bson import ObjectId
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout
)

# Add backend to Python path
sys.path.insert(0, os.getcwd())

from app.core.config import settings
from app.db.database import connect_to_mongo, close_mongo_connection, get_db
from app.services.scraper.search_orchestrator import search_orchestrator
from app.services.scraper.search_worker import SearchQueueWorker

async def run_verification():
    print("====================================================")
    print("RUNNING VERIFICATION FOR GOOGLE MAPS DISCOVERY ENGINE")
    print("====================================================")
    
    settings.DATABASE_NAME = "lead_finder_test_db"
    await connect_to_mongo()
    db = get_db()
    
    # Clear collections
    await db["queue_status"].delete_many({})
    await db["worker_status"].delete_many({})
    await db["search_jobs"].delete_many({})
    await db["search_sessions"].delete_many({})
    await db["business_queue"].delete_many({})

    # 1. Create a search job with limit 3 (small limit for quick test)
    print("[1] Creating Search Job...")
    created_job = await search_orchestrator.create_session(
        user_id="user_test_val",
        keyword="Gym",
        country="Bournemouth UK",
        city="Winton",
        max_leads=3
    )
    job_id = created_job["_id"]
    print(f"[PASS] Search Job created: {job_id}")

    # 2. Start Search Queue Worker
    print("[2] Initializing and starting worker...")
    worker = SearchQueueWorker(db, max_concurrent=1)
    await worker.start()

    # 3. Wait for the job to complete
    print("[3] Monitoring discovery execution (timeout 120s)...")
    success = False
    for i in range(60):
        await asyncio.sleep(2)
        job = await db["search_jobs"].find_one({"_id": ObjectId(job_id)})
        if not job:
            print("[FAIL] Job record disappeared!")
            break
            
        status = job.get("status")
        progress = job.get("progress", 0)
        
        # Count discovered items in queue
        queue_count = await db["business_queue"].count_documents({"job_id": job_id})
        print(f"    Status: {status} | Progress: {progress}% | Discovered: {queue_count}/3", end="\r")
        
        if status == "COMPLETED":
            print(f"\n[PASS] Search completed with status: {status}")
            success = True
            break
        elif status in ["FAILED", "CANCELLED", "TIMEOUT"]:
            print(f"\n[FAIL] Job stopped prematurely with status: {status}")
            break
            
    # Stop worker
    await worker.stop()

    if not success:
        print("[FAIL] Job did not complete successfully in time.")
        await close_mongo_connection()
        sys.exit(1)

    # 4. Validate Business Queue content
    print("[4] Validating business queue persistence...")
    items = await db["business_queue"].find({"job_id": job_id}).to_list(length=10)
    if len(items) == 0:
        print("[FAIL] Business queue is empty!")
        sys.exit(1)
        
    print(f"[PASS] Discovered {len(items)} items in the queue.")
    
    # 5. Check limit constraint and fields
    print("[5] Validating queue item constraints...")
    for idx, item in enumerate(items):
        print(f"    Item {idx+1}: Name='{item.get('name')}', URL='{item.get('maps_url')}'")
        if not item.get("maps_url") or not item.get("temporary_id") or not item.get("discovery_position"):
            print("[FAIL] Required fields (maps_url, temporary_id, discovery_position) missing!")
            sys.exit(1)

    # Honor limit check
    if len(items) > 3:
        print(f"[FAIL] Requested limit was 3 but enqueued {len(items)} items!")
        sys.exit(1)
        
    # Check duplicate prevention
    urls = [item.get("maps_url") for item in items]
    if len(urls) != len(set(urls)):
        print("[FAIL] Duplicate maps URLs found in the queue!")
        sys.exit(1)

    print("[PASS] Duplicate prevention and requested limit validated successfully.")

    print("====================================================")
    print("ALL DISCOVERY VERIFICATIONS PASSED SUCCESSFULLY")
    print("====================================================")
    await close_mongo_connection()
    sys.exit(0)

if __name__ == "__main__":
    asyncio.run(run_verification())
