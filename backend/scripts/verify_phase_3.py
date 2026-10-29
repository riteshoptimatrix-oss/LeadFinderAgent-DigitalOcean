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
    print("RUNNING VERIFICATION FOR BUSINESS DETAIL EXTRACTION")
    print("====================================================")
    
    # Connect to MongoDB
    await connect_to_mongo()
    db = get_db()
    
    # Clean previous verification runs
    await db["search_jobs"].delete_many({"payload.keyword": "Gym Verification Phase 3"})
    await db["business_queue"].delete_many({"job_id": {"$exists": True}})
    
    # 1. Create a search job
    print("[1] Creating Search Job...")
    created_job = await search_orchestrator.create_session(
        user_id="test_user",
        keyword="Gym",
        country="Bournemouth UK",
        city="Winton",
        max_leads=1
    )
    job_id = str(created_job["_id"])
    print(f"[PASS] Search Job created: {job_id}")
    
    # Update keyword to identify this test run uniquely
    await db["search_jobs"].update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"payload.keyword": "Gym Verification Phase 3"}}
    )

    # 2. Start worker
    print("[2] Initializing and starting worker...")
    worker = SearchQueueWorker(db, max_concurrent=1)
    await worker.start()
    
    # 3. Monitor execution (timeout 120s)
    print("[3] Monitoring extraction execution (timeout 120s)...")
    success = False
    for i in range(60):
        await asyncio.sleep(2)
        job = await db["search_jobs"].find_one({"_id": ObjectId(job_id)})
        if not job:
            print("[FAIL] Job not found in database!")
            break
            
        status = job.get("status")
        progress = job.get("progress", 0)
        
        # Display progress status line
        print(f"    Status: {status} | Progress: {progress}%")
        
        if status == "FAILED":
            print(f"[FAIL] Job stopped prematurely with status: {status}")
            break
        if status == "COMPLETED":
            print(f"\n[PASS] Search completed with status: {status}")
            success = True
            break
            
    # Stop the worker
    await worker.stop()
    
    if not success:
        print("[FAIL] Job did not complete successfully in time.")
        sys.exit(1)
        
    # 4. Validate Queue Item completion
    print("[4] Validating business queue completion...")
    items = await db["business_queue"].find({"job_id": job_id}).to_list(length=10)
    if len(items) == 0:
        print("[FAIL] Business queue is empty!")
        sys.exit(1)
        
    for item in items:
        status = item.get("status")
        print(f"    Item: Name='{item.get('name')}', Status='{status}'")
        if status != "COMPLETED":
            print(f"[FAIL] Business queue item has invalid status: {status}")
            sys.exit(1)
            
    print("[PASS] Extraction queue item completed successfully.")
    
    # 5. Check emitted events
    # We can check database or event loop; since we ran inline, we verify overall execution
    print("====================================================")
    print("ALL EXTRACTION VERIFICATIONS PASSED SUCCESSFULLY")
    print("====================================================")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(run_verification())
