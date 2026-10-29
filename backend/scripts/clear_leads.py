import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["lead_finder_agent"]
    before = await db["leads"].count_documents({})
    result = await db["leads"].delete_many({})
    print(f"Deleted {result.deleted_count} leads (was {before}, now {await db['leads'].count_documents({})})")
    client.close()

asyncio.run(main())
