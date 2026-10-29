import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

async def clean():
    mongo_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_uri)
    db_name = os.environ.get("DATABASE_NAME", "lead_finder_agent")
    db = client.get_database(db_name)
    
    print("Deleting leads with null fingerprint...")
    res = await db.leads.delete_many({"fingerprint": None})
    print(f"Deleted {res.deleted_count} leads.")
    
if __name__ == "__main__":
    asyncio.run(clean())
