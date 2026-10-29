import asyncio
import sys
import os
import logging
from datetime import datetime
from bson import ObjectId

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout
)

# Add backend to Python path
sys.path.insert(0, os.getcwd())

from app.db.database import connect_to_mongo, close_mongo_connection, get_db
from app.services.scraper.lead_schema import (
    LeadObject,
    BusinessIdentity,
    ContactInfo,
    LocationInfo,
    GoogleMetadata,
    ExtractionMetadata
)
from app.services.scraper.persistence_engine import persistence_engine

async def run_verification():
    print("====================================================")
    print("RUNNING VERIFICATION FOR PERSISTENCE & DEDUPLICATION")
    print("====================================================")
    
    # Connect to MongoDB
    await connect_to_mongo()
    db = get_db()
    
    # Clean previous run data
    await db["leads"].delete_many({"metadata.search_session_id": "verify_session_p4"})
    await db["search_jobs"].delete_many({"_id": ObjectId("6a505b837434497cb13015ff")})
    await db["statistics"].delete_many({"key": {"$in": ["general", "countries", "categories"]}})

    # Create dummy search job for stats updates
    await db["search_jobs"].insert_one({
        "_id": ObjectId("6a505b837434497cb13015ff"),
        "status": "ACTIVE",
        "stats": {
            "lead_count": 0,
            "success_count": 0,
            "duplicate_count": 0
        }
    })

    # 1. Build Mock Lead
    identity = BusinessIdentity(
        name="Snap Fitness Winton",
        primary_category="Gym",
        secondary_categories=["Fitness Center"]
    )
    contact = ContactInfo(
        phone="+44 1202 794735",
        website="https://www.snapfitness.com/uk/gyms/winton"
    )
    location = LocationInfo(
        address="Unit 2, 447-457 Wimborne Rd, Bournemouth BH9 2AN, United Kingdom",
        country="United Kingdom",
        city="Bournemouth",
        postal_code="BH9 2AN",
        latitude=50.7438,
        longitude=-1.8784
    )
    google = GoogleMetadata(
        rating=4.9,
        review_count=145,
        business_status="OPERATIONAL"
    )
    meta = ExtractionMetadata(
        discovery_position=1,
        discovery_timestamp=datetime.utcnow(),
        search_keyword="Gym",
        search_session_id="verify_session_p4",
        worker_id="verify_worker"
    )
    
    lead = LeadObject(
        identity=identity,
        contact=contact,
        location=location,
        google=google,
        metadata=meta,
        is_valid=True
    )

    # 2. Persist Lead (Insert)
    print("[1] Persisting Lead for the first time (should INSERT)...")
    res1 = await persistence_engine.persist_lead(db, lead, "6a505b837434497cb13015ff")
    print(f"    Result: lead_id={res1['lead_id']}, is_update={res1['is_update']}")
    if res1["is_update"]:
        print("[FAIL] First write was flagged as an update!")
        sys.exit(1)
    print("[PASS] First write inserted successfully.")

    # 3. Persist Lead Again (Deduplication check)
    print("[2] Persisting matching Lead (should DEDUPLICATE & MERGE)...")
    # Modify a secondary list to test merging
    lead.identity.secondary_categories.append("Health Club")
    res2 = await persistence_engine.persist_lead(db, lead, "6a505b837434497cb13015ff")
    print(f"    Result: lead_id={res2['lead_id']}, is_update={res2['is_update']}")
    if not res2["is_update"]:
        print("[FAIL] Second write did not trigger deduplication!")
        sys.exit(1)
    if res1["lead_id"] != res2["lead_id"]:
        print("[FAIL] Duplicate lead generated a different document ID!")
        sys.exit(1)
    print("[PASS] Duplicate detection and merging successfully completed.")

    # 4. Check Database count
    print("[3] Checking Lead collection counts...")
    count = await db["leads"].count_documents({"metadata.search_session_id": "verify_session_p4"})
    print(f"    Document count: {count}")
    if count != 1:
        print(f"[FAIL] Expected 1 document but found {count}!")
        sys.exit(1)
    print("[PASS] No duplicate document created in collection.")

    # 5. Check statistics update
    print("[4] Checking statistics collection update...")
    stats = await db["statistics"].find_one({"key": "general"})
    if not stats or stats.get("total_leads", 0) < 1:
        print("[FAIL] Statistics document not generated or counters incorrect!")
        sys.exit(1)
    print(f"    Total Leads Stat: {stats.get('total_leads')}")
    print("[PASS] Statistics updated successfully.")

    print("====================================================")
    print("ALL PERSISTENCE VERIFICATIONS PASSED SUCCESSFULLY")
    print("====================================================")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(run_verification())
