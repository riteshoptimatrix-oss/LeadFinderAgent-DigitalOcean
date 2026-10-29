import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.core.config import settings
from app.services.scraper.lead_parser import LeadParser

async def repair_phones():
    print("Connecting to MongoDB...")
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    
    leads_collection = db["leads"]
    total_leads = await leads_collection.count_documents({"phone": {"$nin": [None, ""]}})
    print(f"Found {total_leads} leads with phone numbers to inspect.")
    
    corrupted_count = 0
    cursor = leads_collection.find({"phone": {"$nin": [None, ""]}})
    
    async for lead in cursor:
        phone = lead.get("phone")
        validated = LeadParser.normalize_phone(phone)
        
        if not validated:
            corrupted_count += 1
            await leads_collection.update_one(
                {"_id": lead["_id"]},
                {"$set": {"phone": None}}
            )
            print(f"Repaired lead {lead['_id']}: Invalid phone '{str(phone).encode('ascii', 'ignore').decode()}' cleared to None")
        elif validated != phone:
            await leads_collection.update_one(
                {"_id": lead["_id"]},
                {"$set": {"phone": validated}}
            )
            print(f"Cleaned lead {lead['_id']}: '{str(phone).encode('ascii', 'ignore').decode()}' -> '{validated}'")

    print(f"Repair complete. Fixed {corrupted_count} corrupted phone entries.")

if __name__ == "__main__":
    asyncio.run(repair_phones())
