import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["lead_finder_agent"]
    col = db["leads"]

    naroda_count = await col.count_documents({"area": "Naroda", "category": "Gym & Fitness"})
    print(f"Naroda Gym leads in DB: {naroda_count}")

    total = await col.count_documents({})
    print(f"Total leads in DB: {total}")

    cursor = col.find({"area": "Naroda", "category": "Gym & Fitness"}).limit(5)
    async for doc in cursor:
        print(f"  - {doc.get('name')} | {doc.get('phone')} | Rating: {doc.get('google_rating')}")

    client.close()

asyncio.run(check())
