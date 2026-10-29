import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["lead_finder_agent"]
    
    total = await db["leads"].count_documents({})
    print(f"Total leads in DB: {total}")
    
    pipeline = [{"$group": {"_id": "$user_id", "count": {"$sum": 1}}}]
    async for doc in db["leads"].aggregate(pipeline):
        uid = doc["_id"]
        print(f"  user_id={uid}: {doc['count']} leads")
    
    users = await db["users"].find().to_list(10)
    print(f"\nUsers in DB: {len(users)}")
    for u in users:
        print(f"  _id={u['_id']} email={u.get('email')} role={u.get('role', 'NO_ROLE')}")
    
    jobs_total = await db["search_jobs"].count_documents({})
    print(f"\nSearch jobs: {jobs_total}")
    async for job in db["search_jobs"].find().sort("created_at", -1).limit(3):
        print(f"  job_id={job['_id']} user_id={job.get('user_id')} status={job.get('status')} keyword={job.get('keyword')}")
    
    scraper_leads = await db["leads"].count_documents({"user_id": {"$ne": "system_automated"}})
    print(f"\nScraper leads (non-system): {scraper_leads}")
    
    failed = await db["failed_leads"].count_documents({})
    print(f"Failed leads: {failed}")
    if failed > 0:
        async for fl in db["failed_leads"].find().limit(3):
            print(f"  error={fl.get('error')} business={fl.get('business_name')}")
    
    sample = await db["leads"].find_one()
    if sample:
        print(f"\nSample lead keys: {list(sample.keys())}")
        print(f"  name={sample.get('name')} user_id={sample.get('user_id')} status={sample.get('status')}")
        print(f"  google_rating={sample.get('google_rating')} type={type(sample.get('google_rating')).__name__}")
    
    client.close()

asyncio.run(main())
