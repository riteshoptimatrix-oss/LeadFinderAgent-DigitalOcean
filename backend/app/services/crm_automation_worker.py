import asyncio
import logging
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.services.worker_manager import emit_heartbeat, shutdown_event

logger = logging.getLogger(__name__)

class CRMAutomationWorker:
    def __init__(self, db: AsyncIOMotorDatabase, check_interval: int = 60):
        self.db = db
        self.check_interval = check_interval
        self.running = False
        self.task = None

    def start(self):
        if self.running:
            return
        self.running = True
        self.task = asyncio.create_task(self._worker_loop())
        logger.info("CRMAutomationWorker started")

    async def stop(self):
        if not self.running:
            return
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("CRMAutomationWorker stopped")

    async def _worker_loop(self):
        watchdog_counter = 0
        while self.running and not shutdown_event.is_set():
            try:
                watchdog_counter += self.check_interval
                if watchdog_counter >= 60:
                    watchdog_counter = 0
                    await emit_heartbeat("crm_automation_worker")
                await self._process_overdue_tasks()
                await self._process_ai_followups()
            except Exception as e:
                logger.error(f"Error in CRMAutomationWorker: {e}", exc_info=True)
            
            await asyncio.sleep(self.check_interval)

    async def _process_overdue_tasks(self):
        """Find pending tasks that are overdue and not yet marked as overdue"""
        now = datetime.utcnow()
        # Find tasks where due_date < now, status="Pending", and no overdue activity logged recently
        cursor = self.db.crm_tasks.find({
            "status": "Pending",
            "due_date": {"$lt": now}
        }).limit(50)
        
        async for task in cursor:
            # Check if we already logged an overdue activity in the last 24h to avoid spam
            recent_overdue = await self.db.crm_activities.find_one({
                "lead_id": task.get("lead_id"),
                "activity_type": "Task Overdue",
                "metadata_info.task_id": str(task["_id"]),
                "created_at": {"$gt": now - timedelta(hours=24)}
            })
            
            if not recent_overdue:
                activity = {
                    "lead_id": task.get("lead_id"),
                    "user_id": task.get("user_id"),
                    "activity_type": "Task Overdue",
                    "description": f"Task '{task.get('title')}' is overdue",
                    "metadata_info": {"task_id": str(task["_id"])},
                    "created_at": now
                }
                await self.db.crm_activities.insert_one(activity)
                # Could also dispatch a WebSocket event here or send a reminder email to the owner

    async def _process_ai_followups(self):
        """Suggest follow-ups based on AI Business Opportunity scores"""
        now = datetime.utcnow()
        # Find recently completed AI analyses (last 24h)
        cursor = self.db.ai_analysis_jobs.find({
            "status": "completed",
            "completed_at": {"$gt": now - timedelta(hours=24)}
        }).sort("completed_at", -1).limit(50)
        
        async for ai_job in cursor:
            score = ai_job.get("business_opportunity_score", 0)
            if score >= 80: # High opportunity
                lead_id = ai_job.get("lead_id")
                # Check if we already created an AI suggested task for this lead
                existing_task = await self.db.crm_tasks.find_one({
                    "lead_id": lead_id,
                    "task_type": "AI Follow-up"
                })
                
                if not existing_task:
                    # Create a follow up task
                    task = {
                        "lead_id": lead_id,
                        "user_id": ai_job.get("user_id"),
                        "task_type": "AI Follow-up",
                        "title": "High Value Lead Follow-up",
                        "description": "AI detected a high business opportunity. Follow up immediately.",
                        "due_date": now + timedelta(days=1),
                        "priority": "High",
                        "status": "Pending",
                        "is_recurring": False,
                        "created_at": now,
                        "completed_at": None
                    }
                    result = await self.db.crm_tasks.insert_one(task)
                    
                    activity = {
                        "lead_id": lead_id,
                        "user_id": ai_job.get("user_id"),
                        "activity_type": "Task Created",
                        "description": "AI suggested a high-priority follow-up task",
                        "metadata_info": {"task_id": str(result.inserted_id), "ai_score": score},
                        "created_at": now
                    }
                    await self.db.crm_activities.insert_one(activity)
