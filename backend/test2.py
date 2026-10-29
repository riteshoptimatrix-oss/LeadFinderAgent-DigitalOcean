import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from app.models.lead import build_lead_response

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['lead_finder_agent']
    doc = await db['leads'].find_one()
    if doc:
        response, warnings = build_lead_response(doc)
        print("Response:", response.model_dump_json(indent=2))
        print("Warnings:", warnings)
    else:
        print("No document found")

asyncio.run(main())
