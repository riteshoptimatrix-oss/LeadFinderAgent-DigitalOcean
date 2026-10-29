import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    db = AsyncIOMotorClient("mongodb://127.0.0.1:27017")["lead_finder_agent"]
    
    # Get latest search job
    job = await db["search_jobs"].find_one(sort=[("_id", -1)])
    if not job:
        print("No job found.")
        return
        
    job_id = str(job["_id"])
    print(f"Job ID: {job['_id']}")
    print(f"Status: {job.get('status', 'N/A')}")
    print(f"Error: {job.get('error_message', 'None')}")
    
    queue_count = await db["business_queue"].count_documents({"job_id": job_id})
    print(f"Business Queue items: {queue_count}")
    
    queued = await db["business_queue"].count_documents({"job_id": job_id, "status": "QUEUED"})
    processing = await db["business_queue"].count_documents({"job_id": job_id, "status": "IN_PROGRESS"})
    completed = await db["business_queue"].count_documents({"job_id": job_id, "status": "COMPLETED"})
    failed = await db["business_queue"].count_documents({"job_id": job_id, "status": "FAILED"})
    print(f"  QUEUED: {queued}, IN_PROGRESS: {processing}, COMPLETED: {completed}, FAILED: {failed}")
    
    leads = await db["leads"].count_documents({"job_id": job_id})
    print(f"Leads extracted: {leads}")
    
    logs = await db["job_logs"].find({"job_id": job_id}).to_list(100)
    print("\nLogs:")
    for log in logs:
        print(f"[{log.get('level')}] {log.get('message')} - {log.get('error')}")

asyncio.run(main())
