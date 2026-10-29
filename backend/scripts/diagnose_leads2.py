import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["lead_finder_agent"]
    
    bq = await db["business_queue"].count_documents({})
    dlq = await db["persistence_dlq"].count_documents({})
    fl = await db["failed_leads"].count_documents({})
    
    print(f"business_queue: {bq}")
    print(f"persistence_dlq: {dlq}")
    print(f"failed_leads: {fl}")
    
    if bq > 0:
        pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        async for doc in db["business_queue"].aggregate(pipeline):
            print(f"  queue status={doc['_id']}: {doc['count']}")
    
    # Check LeadResponse validation by simulating the endpoint
    from app.models.lead import LeadResponse
    cursor = db["leads"].find()
    errors = 0
    count = 0
    async for lead in cursor:
        count += 1
        try:
            lead["_id"] = str(lead["_id"])
            LeadResponse(**lead)
        except Exception as e:
            errors += 1
            print(f"VALIDATION ERROR on lead '{lead.get('name')}': {e}")
    
    print(f"\nLeadResponse validation: {count} leads checked, {errors} errors")
    
    client.close()

asyncio.run(main())
