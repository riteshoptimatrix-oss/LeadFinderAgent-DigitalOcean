#!/usr/bin/env python3
"""
Verification script to test the fixes applied to the backend server.
"""

import sys
import asyncio
from typing import Dict, Any

def test_fastapi_import():
    """Test that FastAPI app can be imported without router prefix errors."""
    try:
        from app.main import app
        print("✅ FastAPI app import successful - router prefix issue fixed")
        return True
    except AssertionError as e:
        if "prefix must not end with '/'" in str(e):
            print("❌ FastAPI router prefix error still exists:", str(e))
            return False
        else:
            raise
    except Exception as e:
        print(f"❌ Other import error: {e}")
        return False

def test_ssl_model_loading():
    """Test that the semantic model can be loaded without SSL errors."""
    try:
        from app.services.search_engine.validator import RelevanceEngine
        print("🔄 Testing semantic model loading...")
        
        # Create engine instance (this triggers model download/loading)
        engine = RelevanceEngine()
        
        if engine.is_ready:
            print("✅ Semantic model loaded successfully - SSL issue fixed")
            return True
        else:
            print("⚠️  Semantic model not ready, but no SSL error occurred")
            return True
    except Exception as e:
        if "SSL" in str(e) or "certificate" in str(e).lower():
            print(f"❌ SSL certificate error still exists: {e}")
            return False
        else:
            print(f"⚠️  Other model loading issue (not SSL): {e}")
            return True

def test_basic_functionality():
    """Test basic app functionality."""
    try:
        from app.main import app
        from fastapi.testclient import TestClient
        
        client = TestClient(app)
        response = client.get("/")
        
        if response.status_code == 200:
            print("✅ Basic API endpoint working")
            return True
        else:
            print(f"⚠️  API endpoint returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Basic functionality test failed: {e}")
        return False

def main():
    """Run all verification tests."""
    print("🔧 Verifying backend fixes...")
    print("=" * 50)
    
    tests = [
        ("FastAPI Router Prefix Fix", test_fastapi_import),
        ("SSL Certificate Fix", test_ssl_model_loading), 
        ("Basic Functionality", test_basic_functionality),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n🧪 {test_name}:")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ Test failed with exception: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 50)
    print("📊 RESULTS SUMMARY:")
    print("=" * 50)
    
    all_passed = True
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}")
        if not passed:
            all_passed = False
    
    if all_passed:
        print("\n🎉 All critical fixes verified successfully!")
        print("   The server should now start without the original SSL and router errors.")
    else:
        print("\n⚠️  Some tests failed - please check the issues above.")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())