import asyncio
import sys
sys.path.insert(0, ".")

from app.models.lead import LeadResponse, LeadBase, SocialMedia

# Test 1: SocialMedia with extra kwargs ignored
try:
    s = SocialMedia(facebook="fb.com", tiktok="tiktok.com", pinterest="pin.com")
    d = s.model_dump()
    assert "tiktok" not in d
    assert "pinterest" not in d
    assert d["facebook"] == "fb.com"
    print("PASS: SocialMedia ignores extra kwargs")
except Exception as e:
    print(f"FAIL: SocialMedia - {e}")

# Test 2: LeadBase has area field
try:
    lb = LeadBase(name="Test", area="Naroda")
    assert lb.area == "Naroda"
    print("PASS: LeadBase has area field")
except Exception as e:
    print(f"FAIL: LeadBase area - {e}")

# Test 3: LeadResponse validates existing MongoDB docs
async def test_lead_response():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["lead_finder_agent"]
    
    cursor = db["leads"].find()
    total = 0
    passed = 0
    failed = 0
    async for lead in cursor:
        total += 1
        try:
            lead["_id"] = str(lead["_id"])
            resp = LeadResponse(**lead)
            passed += 1
        except Exception as e:
            failed += 1
            print(f"FAIL LeadResponse on '{lead.get('name')}': {e}")
    
    print(f"LeadResponse validation: {total} total, {passed} passed, {failed} failed")
    client.close()

asyncio.run(test_lead_response())
print("\nAll tests done.")
