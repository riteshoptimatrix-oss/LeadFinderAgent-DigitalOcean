import asyncio
import pprint
from motor.motor_asyncio import AsyncIOMotorClient

async def run():
    db = AsyncIOMotorClient('mongodb://127.0.0.1:27017')['lead_finder_agent']
    job = await db['search_jobs'].find_one({'keyword': 'Restaurants in Ahmedabad'})
    if job:
        print(f"Status: {job.get('status')}")
        print(f"Error: {job.get('error_message')}")
        print(f"Failure Reason: {job.get('failure_reason')}")
        print("Logs:")
        for log in job.get('logs', []):
            print(log)
    else:
        print("Job not found.")

if __name__ == '__main__':
    asyncio.run(run())
