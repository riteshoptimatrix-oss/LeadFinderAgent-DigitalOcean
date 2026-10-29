import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.logger import logger
from .ai_service import AIService

class AIQueueWorker:
    def __init__(self, db: AsyncIOMotorDatabase, batch_size: int = 5, concurrency: int = 3):
        self.db = db
        self.batch_size = batch_size
        self.concurrency = concurrency
        self.is_running = False
        self._task = None

    async def start(self):
        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self._run_loop())
            logger.info("AI Queue Worker started.")

    async def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("AI Queue Worker stopped.")

    async def _run_loop(self):
        ai_service = AIService(self.db)
        while self.is_running:
            try:
                # Find queued items
                items = await self.db["ai_jobs"].find(
                    {"status": "QUEUED"}
                ).limit(self.batch_size).to_list(length=None)

                if not items:
                    await asyncio.sleep(5)
                    continue
                    
                # Mark as processing
                item_ids = [item["_id"] for item in items]
                await self.db["ai_jobs"].update_many(
                    {"_id": {"$in": item_ids}},
                    {"$set": {"status": "PROCESSING", "updated_at": datetime.utcnow()}}
                )

                # Process concurrently
                semaphore = asyncio.Semaphore(self.concurrency)
                async def process_with_sema(item):
                    async with semaphore:
                        try:
                            await ai_service.analyze_lead(item["lead_id"], item["user_id"])
                            await self.db["ai_jobs"].update_one(
                                {"_id": item["_id"]},
                                {"$set": {"status": "SUCCESS", "updated_at": datetime.utcnow()}}
                            )
                        except Exception as e:
                            logger.error(f"[AIQueueWorker] Failed item {item['_id']}: {str(e)}")
                            await self.db["ai_jobs"].update_one(
                                {"_id": item["_id"]},
                                {"$set": {"status": "FAILED", "error": str(e), "updated_at": datetime.utcnow()}}
                            )

                tasks = [asyncio.create_task(process_with_sema(item)) for item in items]
                await asyncio.gather(*tasks, return_exceptions=True)
                
            except Exception as e:
                logger.error(f"AI Queue Worker Error: {str(e)}")
                await asyncio.sleep(5)

async def process_ai_queue():
    # Helper for APScheduler if needed, though we run this as a long-lived task in lifespan
    pass
