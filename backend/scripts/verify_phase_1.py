import asyncio
import sys
import os
from bson import ObjectId
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

# Add backend to Python path
sys.path.insert(0, os.getcwd())

from app.core.config import settings
from app.db.database import connect_to_mongo, close_mongo_connection, get_db
from app.services.scraper.search_state_machine import SearchStateMachine, SearchState, StateMachineError
from app.services.scraper.event_bus import event_bus, SearchEventType
from app.services.scraper.browser_pool import browser_pool
from app.services.scraper.job_queue import job_queue
from app.services.scraper.worker_manager import scraper_worker_manager
from app.services.scraper.search_orchestrator import search_orchestrator

async def run_verification():
    print("====================================================")
    print("RUNNING VERIFICATION FOR SEARCH ENGINE MODULES")
    print("====================================================")
    
    # Configure and connect database
    settings.DATABASE_NAME = "lead_finder_test_db"
    await connect_to_mongo()
    db = get_db()
    
    # Clear collections
    await db["queue_status"].delete_many({})
    await db["worker_status"].delete_many({})
    await db["search_jobs"].delete_many({})
    await db["search_sessions"].delete_many({})

    # 1. Verify State Machine
    print("[1] Verifying State Machine...")
    sm = SearchStateMachine(SearchState.CREATED)
    sm.transition_to(SearchState.QUEUED)
    sm.transition_to(SearchState.INITIALIZING)
    try:
        sm.transition_to(SearchState.COMPLETED)
        print("[FAIL]: Invalid transition allowed")
        sys.exit(1)
    except StateMachineError:
        print("[PASS]: State Machine transitions validated")

    # 2. Verify Event Bus
    print("[2] Verifying Event Bus...")
    await event_bus.emit(
        job_id="test_job_123",
        event_type=SearchEventType.SEARCH_PROGRESS,
        message="Verifying progress emission",
        data={"progress": 42}
    )
    print("[PASS]: Event Bus enqueued/sent successfully")

    # 3. Verify Job Queue
    print("[3] Verifying Job Queue...")
    job_queue._get_collection = lambda: db["queue_status"]
    job_id = str(ObjectId())
    await job_queue.enqueue(job_id=job_id, keyword="Plumbers", location="London", priority=10)
    
    metrics = await job_queue.get_metrics()
    if metrics["PENDING"] != 1:
        print(f"[FAIL]: Pending count is {metrics['PENDING']}, expected 1")
        sys.exit(1)
        
    job = await job_queue.dequeue("worker_test_val")
    if not job or job["job_id"] != job_id:
        print("[FAIL]: Dequeue failed to retrieve job")
        sys.exit(1)
        
    await job_queue.mark_complete(job_id)
    metrics = await job_queue.get_metrics()
    if metrics["COMPLETED"] != 1:
        print("[FAIL]: Completed status update failed")
        sys.exit(1)
    print("[PASS]: Job Queue operations verified")

    # 4. Verify Worker Manager
    print("[4] Verifying Worker Manager...")
    scraper_worker_manager._get_collection = lambda: db["worker_status"]
    worker_id = "worker_test_val"
    await scraper_worker_manager.register_worker(worker_id)
    await scraper_worker_manager.emit_heartbeat(worker_id, current_job_id=job_id, current_stage="SEARCHING")
    
    worker = await db["worker_status"].find_one({"worker_id": worker_id})
    if not worker or worker["status"] != "BUSY":
        print("[FAIL]: Worker status update failed")
        sys.exit(1)
    print("[PASS]: Worker Manager heartbeats verified")

    # 5. Verify Browser Pool
    print("[5] Verifying Playwright Browser Pool...")
    await browser_pool.initialize()
    page = await browser_pool.get_page()
    if not page:
        print("[FAIL]: Page acquisition failed")
        sys.exit(1)
    await browser_pool.release_page(page)
    await browser_pool.shutdown()
    print("[PASS]: Playwright Browser Pool lifecycle verified")

    # 6. Verify Orchestrator
    print("[6] Verifying Orchestrator...")
    search_orchestrator._get_jobs_collection = lambda: db["search_jobs"]
    search_orchestrator._get_sessions_collection = lambda: db["search_sessions"]
    
    created_job = await search_orchestrator.create_session(
        user_id="user_test_val",
        keyword="Dentists",
        country="USA",
        city="Chicago",
        max_leads=5
    )
    test_job_id = created_job["_id"]
    await search_orchestrator.allocate_worker(test_job_id, worker_id) # Transitions to INITIALIZING
    await search_orchestrator.update_progress(test_job_id, SearchState.STARTING_BROWSER, 20)
    await search_orchestrator.update_progress(test_job_id, SearchState.LOADING_GOOGLE_MAPS, 35)
    await search_orchestrator.update_progress(test_job_id, SearchState.SEARCHING, 50)
    
    job_db = await db["search_jobs"].find_one({"_id": ObjectId(test_job_id)})
    if job_db["status"] != "SEARCHING" or job_db["progress"] != 50:
        print("[FAIL]: Orchestrator failed to update status")
        sys.exit(1)
    print("[PASS]: Orchestrator verified")
    
    print("====================================================")
    print("ALL Foundation VERIFICATIONS PASSED SUCCESSFULLY")
    print("====================================================")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(run_verification())
