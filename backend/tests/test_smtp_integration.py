import asyncio
import sys
import os
import unittest
from bson import ObjectId
from datetime import datetime, timezone

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.security_crypto import encrypt_string, decrypt_string
from app.services.smtp_service import (
    run_smtp_verification_sync,
    get_user_smtp_config,
    save_user_smtp_config,
    clean_app_password,
    is_masked_or_empty,
    MASKED_PASSWORD
)
from motor.motor_asyncio import AsyncIOMotorClient


class TestSMTPIntegration(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.client = AsyncIOMotorClient("mongodb://localhost:27017")
        self.db = self.client["lead_finder_agent_test_smtp"]
        self.test_user_id = str(ObjectId())
        self.other_user_id = str(ObjectId())

    def tearDown(self):
        async def cleanup():
            await self.client.drop_database("lead_finder_agent_test_smtp")
            self.client.close()
        self.loop.run_until_complete(cleanup())
        self.loop.close()

    def test_app_password_cleaning(self):
        # 16 char Gmail app password with spaces
        raw = "abcd efgh ijkl mnop"
        cleaned = clean_app_password(raw, "smtp.gmail.com")
        self.assertEqual(cleaned, "abcdefghijklmnop")

        # Non-gmail password unchanged
        raw_non_gmail = "my secret password"
        self.assertEqual(clean_app_password(raw_non_gmail, "smtp.office365.com"), raw_non_gmail)

    def test_password_encryption_and_decryption(self):
        pwd = "test_app_password_123"
        encrypted = encrypt_string(pwd)
        self.assertNotEqual(encrypted, pwd)
        decrypted = decrypt_string(encrypted)
        self.assertEqual(decrypted, pwd)

    def test_verification_invalid_host(self):
        res = run_smtp_verification_sync(
            host="invalid-nonexistent-host-xyz-999.com",
            port=587,
            encryption="TLS",
            username="test@example.com",
            password="fake_password_123",
            timeout=3
        )
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], "CONNECTION_FAILED")
        self.assertIn("host", res["message"].lower())

    def test_verification_auth_failure(self):
        # Attempt real connection to smtp.gmail.com with bogus credentials
        res = run_smtp_verification_sync(
            host="smtp.gmail.com",
            port=587,
            encryption="TLS",
            username="nonexistent_test_user_99999@gmail.com",
            password="badpassword1234",
            timeout=8
        )
        self.assertFalse(res["success"])
        self.assertEqual(res["status"], "AUTH_FAILED")
        self.assertTrue("authentication" in res["message"].lower() or "rejected" in res["message"].lower())

    def test_save_and_retrieve_smtp_configuration(self):
        async def run_test():
            smtp_input = {
                "smtp_host": "smtp.gmail.com",
                "smtp_port": 587,
                "smtp_user": "marketing@company.com",
                "smtp_pass": "abcd efgh ijkl mnop",
                "smtp_encryption": "TLS",
                "smtp_from_email": "marketing@company.com",
                "smtp_sender_name": "OptiMatrix Marketing",
                "daily_limit": 300,
                "signature": "Best regards",
                "track_opens": True
            }

            # 1. Save settings
            saved = await save_user_smtp_config(self.db, self.test_user_id, smtp_input, verified_status="CONNECTED")
            self.assertEqual(saved["smtp_host"], "smtp.gmail.com")
            self.assertEqual(saved["smtp_user"], "marketing@company.com")
            self.assertEqual(saved["smtp_status"], "CONNECTED")
            self.assertTrue(saved["has_password"])
            self.assertEqual(saved["smtp_pass"], MASKED_PASSWORD)

            # 2. Verify password encrypted in database (never plain)
            raw_db = await self.db["settings"].find_one({"user_id": self.test_user_id})
            self.assertIsNotNone(raw_db)
            self.assertNotEqual(raw_db["smtp_pass"], "abcd efgh ijkl mnop")
            self.assertNotEqual(raw_db["smtp_pass"], "abcdefghijklmnop")

            # 3. Retrieve for frontend (password masked)
            frontend_view = await get_user_smtp_config(self.db, self.test_user_id, decrypt_pwd=False)
            self.assertEqual(frontend_view["smtp_pass"], MASKED_PASSWORD)

            # 4. Retrieve for worker dispatch (password decrypted in memory)
            worker_view = await get_user_smtp_config(self.db, self.test_user_id, decrypt_pwd=True)
            self.assertEqual(worker_view["smtp_pass"], "abcdefghijklmnop")

            # 5. Verify Email AI sync (email_ai_smtp collection populated)
            ai_smtp = await self.db["email_ai_smtp"].find_one({"user_id": self.test_user_id, "is_default": True})
            self.assertIsNotNone(ai_smtp)
            self.assertEqual(ai_smtp["username"], "marketing@company.com")
            self.assertTrue(ai_smtp["is_active"])

            # 6. Test update without re-entering password
            update_input = {
                "smtp_host": "smtp.gmail.com",
                "smtp_port": 587,
                "smtp_user": "marketing@company.com",
                "smtp_pass": "••••••••••••••••", # User left password unchanged
                "smtp_sender_name": "Updated Marketing Name",
                "daily_limit": 600
            }
            updated = await save_user_smtp_config(self.db, self.test_user_id, update_input)
            self.assertEqual(updated["smtp_sender_name"], "Updated Marketing Name")
            self.assertEqual(updated["daily_limit"], 600)
            # Verify password still exists and decrypts to original
            worker_view2 = await get_user_smtp_config(self.db, self.test_user_id, decrypt_pwd=True)
            self.assertEqual(worker_view2["smtp_pass"], "abcdefghijklmnop")

            # 7. User isolation check: Other user has empty/separate config
            other_view = await get_user_smtp_config(self.db, self.other_user_id, decrypt_pwd=False)
            self.assertFalse(other_view["has_password"])
            self.assertEqual(other_view["smtp_status"], "NOT_CONFIGURED")

        self.loop.run_until_complete(run_test())


if __name__ == "__main__":
    unittest.main()

