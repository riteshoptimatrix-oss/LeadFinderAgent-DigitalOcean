"""
End-to-end verification script for AI Content Generator API and Gemini Playwright service.
"""

import sys
import os
import asyncio
import pytest
from fastapi.testclient import TestClient

# Ensure backend root is in sys.path
backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from app.main import app


def test_ai_content_routes_exist():
    client = TestClient(app)
    
    # 1. Test Session Status
    res_status = client.get("/api/ai-content/session/status")
    print(f"GET /api/ai-content/session/status: {res_status.status_code}")
    print(res_status.json())
    assert res_status.status_code == 200
    assert res_status.json()["success"] is True

    # Also test /api/v1/ai-content/session/status
    res_status_v1 = client.get("/api/v1/ai-content/session/status")
    assert res_status_v1.status_code == 200
    assert res_status_v1.json()["success"] is True
    print("Session status endpoint verified successfully!")

    # 2. Test Empty Query Validation on Generate
    res_empty = client.post("/api/ai-content/generate", json={"user_query": ""})
    print(f"POST /api/ai-content/generate (empty): {res_empty.status_code}")
    assert res_empty.status_code in [400, 422]
    print("Empty validation verified!")

    # 3. Test Empty Query Validation on Modify
    res_empty_mod = client.post("/api/ai-content/modify", json={"response": "", "user_query": ""})
    print(f"POST /api/ai-content/modify (empty): {res_empty_mod.status_code}")
    assert res_empty_mod.status_code in [400, 422]
    print("Empty modify validation verified!")


@pytest.mark.anyio
async def test_full_playwright_e2e():
    from app.services.ai_content.gemini_service import gemini_service

    status = await gemini_service.get_status()
    if not status.get("is_logged_in"):
        pytest.skip("Gemini Web session requires active Google account login. Skipping live browser E2E in non-interactive test.")

    print("\n--- Testing Gemini Playwright Content Generation ---")
    query = "Autonomous AI agents revolutionizing B2B sales lead generation"
    result = await gemini_service.generate_social_media_post(query)
    print("\nGenerated Post:")
    print("="*60)
    print(result)
    print("="*60)
    assert result and len(result) > 50
    assert "#" in result, "Generated post should contain hashtags"

    print("\n--- Testing Gemini Playwright Content Modification ---")
    mod_query = "Emphasize 24/7 automated qualification and add a strong call-to-action to book a live demo"
    modified = await gemini_service.modify_content(result, mod_query)
    print("\nModified Post:")
    print("="*60)
    print(modified)
    print("="*60)
    assert modified and len(modified) > 50

    print("\n--- Testing Consecutive Modification ---")
    mod_query_2 = "Add 2 more hashtags for #SalesAutomation and #B2BGrowth"
    consecutive_modified = await gemini_service.modify_content(modified, mod_query_2)
    print("\nConsecutive Modified Post:")
    print("="*60)
    print(consecutive_modified)
    print("="*60)
    assert consecutive_modified and len(consecutive_modified) > 50
    assert "#" in consecutive_modified

    print("\nALL PLAYWRIGHT TESTS PASSED SUCCESSFULLY!")
    await gemini_service.close()


if __name__ == "__main__":
    print("Running Route Verification...")
    test_ai_content_routes_exist()

    print("\nRunning End-to-End Gemini Playwright Verification...")
    asyncio.run(test_full_playwright_e2e())
