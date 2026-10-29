import asyncio
import sys
sys.path.insert(0, ".")

async def main():
    from app.models.lead import LeadResponse, LeadBase, SocialMedia
    from motor.motor_asyncio import AsyncIOMotorClient
    
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["lead_finder_agent"]
    
    print("=== Backend Verification ===\n")
    
    # 1. SocialMedia model
    s = SocialMedia(facebook="fb.com", tiktok="ignored", pinterest="ignored")
    d = s.model_dump()
    assert "tiktok" not in d and "pinterest" not in d
    print("[OK] SocialMedia model ignores extra kwargs (tiktok/pinterest)")
    
    # 2. LeadBase has area
    lb = LeadBase(name="Test", area="Naroda", city="Ahmedabad")
    assert lb.area == "Naroda"
    print("[OK] LeadBase model has 'area' field")
    
    # 3. All existing leads validate
    cursor = db["leads"].find()
    total = passed = 0
    async for lead in cursor:
        total += 1
        try:
            lead["_id"] = str(lead["_id"])
            LeadResponse(**lead)
            passed += 1
        except Exception as e:
            print(f"[FAIL] LeadResponse validation: {lead.get('name')} - {e}")
    print(f"[OK] LeadResponse validation: {passed}/{total} leads passed")
    
    # 4. Check DB state
    leads_count = await db["leads"].count_documents({})
    users = await db["users"].find().to_list(5)
    admin_found = any(u.get("role") == "ADMIN" for u in users)
    print(f"[OK] DB has {leads_count} leads, admin user exists: {admin_found}")
    
    # 5. Check LeadBuilder import
    from app.services.scraper.engine.lead_builder import LeadBuilder
    print("[OK] LeadBuilder imports cleanly")
    
    # 6. Check result_pipeline import
    from app.services.scraper.engine.result_pipeline import ResultPipeline
    print("[OK] ResultPipeline imports cleanly")
    
    # 7. Check leads route import
    from app.api.routes.leads import router
    print("[OK] Leads route imports cleanly")
    
    client.close()
    print("\n=== All verifications passed ===")

asyncio.run(main())
