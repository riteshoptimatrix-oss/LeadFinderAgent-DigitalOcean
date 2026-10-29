import asyncio
import sys
import os
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout
)

# Add backend to Python path
sys.path.insert(0, os.getcwd())

from app.db.database import connect_to_mongo, close_mongo_connection, get_db
from app.services.scraper.browser_pool import browser_pool
from app.services.scraper.checkpoint_engine import checkpoint_engine
from app.services.scraper.worker_manager import scraper_worker_manager

async def run_verification():
    print("====================================================")
    print("RUNNING VERIFICATION FOR HIGH-PERFORMANCE OPTIMIZATIONS")
    print("====================================================")
    
    # 1. Test Browser Pool checkout/return
    print("[1] Initializing Browser Pool...")
    await browser_pool.initialize()
    
    print("[2] Checking out a page...")
    page = await browser_pool.get_page()
    print(f"    Active pages: {len(browser_pool.active_pages)} | Idle pages: {len(browser_pool.idle_pages)}")
    if len(browser_pool.active_pages) != 1 or len(browser_pool.idle_pages) != 0:
        print("[FAIL] Active/Idle page counts are incorrect after checkout!")
        sys.exit(1)
        
    print("[PASS] Page checked out successfully.")
    
    print("[3] Returning the page to pool...")
    await browser_pool.release_page(page)
    print(f"    Active pages: {len(browser_pool.active_pages)} | Idle pages: {len(browser_pool.idle_pages)}")
    if len(browser_pool.active_pages) != 0 or len(browser_pool.idle_pages) != 1:
        print("[FAIL] Active/Idle page counts are incorrect after return!")
        sys.exit(1)
        
    print("[PASS] Page returned successfully.")
    
    # 2. Test Checkpoint Engine
    print("[4] Testing Checkpoint Engine...")
    await connect_to_mongo()
    db = get_db()
    
    job_id = "verify_checkpoint_job"
    await db["search_checkpoints"].delete_many({"job_id": job_id})
    
    print("    Saving checkpoint...")
    await checkpoint_engine.save_checkpoint(
        db=db,
        job_id=job_id,
        scroll_position=42,
        discovered_urls=["https://maps.google.com/place_1", "https://maps.google.com/place_2"],
        progress=50,
        stage="DISCOVERING"
    )
    
    print("    Restoring checkpoint...")
    checkpoint = await checkpoint_engine.get_checkpoint(db, job_id)
    if not checkpoint or checkpoint.get("scroll_position") != 42 or len(checkpoint.get("discovered_urls", [])) != 2:
        print("[FAIL] Checkpoint not saved or restored correctly!")
        sys.exit(1)
    print("    Checkpoint values match.")
    
    print("    Cleaning up checkpoint...")
    await checkpoint_engine.delete_checkpoint(db, job_id)
    deleted = await checkpoint_engine.get_checkpoint(db, job_id)
    if deleted is not None:
        print("[FAIL] Checkpoint not deleted successfully!")
        sys.exit(1)
        
    print("[PASS] Checkpoint Engine validated successfully.")
    
    # 3. Test Adaptive Scaling
    print("[5] Testing Adaptive Worker Scaling...")
    target = await scraper_worker_manager.evaluate_scaling(current_concurrency=1, max_concurrency=4)
    print(f"    Adaptive Concurrency Target Suggestion: {target}")
    if target < 1 or target > 4:
        print(f"[FAIL] Scaling suggestion {target} is out of bounds [1, 4]!")
        sys.exit(1)
    print("[PASS] Adaptive Worker scaling suggestions are healthy.")

    print("====================================================")
    print("ALL HIGH-PERFORMANCE OPTIMIZATIONS VERIFICATIONS PASSED")
    print("====================================================")
    
    # Teardown
    await browser_pool.shutdown()
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(run_verification())
