import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from app.models.lead import build_lead_response

async def main():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['lead_finder_agent']
    cursor = db['leads'].find()
    async for doc in cursor:
        response, w = build_lead_response(doc)
        print(f"Lead {response.id} name={response.name} warnings={w}")

asyncio.run(main())
