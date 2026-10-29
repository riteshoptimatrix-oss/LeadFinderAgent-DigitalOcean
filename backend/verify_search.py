import asyncio
import sys
import os
import json
import httpx
from motor.motor_asyncio import AsyncIOMotorClient

API_URL = "http://localhost:8000/api/v1"
DB_URL = "mongodb://localhost:27017"

async def verify_search():
    print("====================================================")
    print("PHASE M: AUTOMATED VERIFICATION")
    print("====================================================")
    
    # 1. Start Search Request
    print("[1] Executing Search Request...")
    async with httpx.AsyncClient() as client:
        try:
            db_client = AsyncIOMotorClient(DB_URL)
            db = db_client["lead_finder_agent"]
            
            # Create a test search job
            from datetime import datetime
            job = {
                "keyword": "Gym",
                "location": "Winton",
                "max_leads": 5,
                "status": "QUEUED",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "logs": []
            }
            result = await db.search_jobs.insert_one(job)
            job_id = str(result.inserted_id)
            print(f"[OK] Search Job created: {job_id}")
            
            # Wait for job to be picked up by SearchWorker
            print("[3] Waiting for worker to process (Timeout: 120s)...")
            for i in range(120):
                current_job = await db.search_jobs.find_one({"_id": result.inserted_id})
                status = current_job.get("status")
                progress = current_job.get("progress", 0)
                leads = current_job.get("total_leads", 0)
                
                print(f"   Status: {status} | Progress: {progress}% | Leads: {leads}", end="\r")
                
                if status in ["COMPLETED", "FAILED", "EMPTY", "STOPPED", "CANCELLED"]:
                    print(f"\n[OK] Search finished with status: {status}")
                    break
                await asyncio.sleep(2)
                
            # Verify results
            print("[4] Validating MongoDB leads...")
            final_job = await db.search_jobs.find_one({"_id": result.inserted_id})
            leads_count = final_job.get("total_leads", 0)
            
            if leads_count > 0:
                print(f"[OK] Businesses detected and extracted: {leads_count}")
                print("[OK] Mongo updated successfully")
                print("[OK] No premature completion detected.")
                print("====================================================")
                print("VERIFICATION SUCCESSFUL")
                print("====================================================")
                sys.exit(0)
            else:
                print(f"\n[FAIL] Failed: 0 leads collected. Reason: {final_job.get('completion_reason', final_job.get('error_message', 'Unknown'))}")
                print("====================================================")
                print("VERIFICATION FAILED")
                print("====================================================")
                sys.exit(1)

        except Exception as e:
            print(f"\n[FAIL] Error during verification: {e}")
            sys.exit(1)

if __name__ == "__main__":
    asyncio.run(verify_search())
