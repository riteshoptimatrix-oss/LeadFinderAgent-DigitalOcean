import asyncio
import sys
import os
import unittest
from bson import ObjectId
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.database import get_db, connect_to_mongo, close_mongo_connection
from app.core.security import create_access_token


class TestAPISMTPFlow(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        import uuid
        self.user_id = str(ObjectId())
        self.user_email = f"test.smtp.{uuid.uuid4().hex[:8]}@example.com"
        self.token = create_access_token(subject=self.user_id, additional_claims={"role": "USER"})

    def tearDown(self):
        self.loop.close()

    def test_settings_to_email_ai_flow(self):
        async def run_flow():
            await connect_to_mongo()
            db = get_db()

            # Create test user in DB
            await db["users"].insert_one({
                "_id": ObjectId(self.user_id),
                "email": self.user_email,
                "role": "USER",
                "is_active": True,
                "email_automation_access": True,
                "hashed_password": "test_hashed_password"
            })

            transport = ASGITransport(app=app)
            headers = {"Authorization": f"Bearer {self.token}"}

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # 1. Initial GET /api/v1/settings/smtp -> should return NOT_CONFIGURED
                res = await client.get("/api/v1/settings/smtp", headers=headers)
                self.assertEqual(res.status_code, 200)
                data = res.json()
                self.assertEqual(data["smtp_status"], "NOT_CONFIGURED")
                self.assertFalse(data["has_password"])

                # 2. Test Connection with invalid credentials via API
                test_res = await client.post("/api/v1/settings/smtp/test", headers=headers, json={
                    "smtp_host": "smtp.gmail.com",
                    "smtp_port": 587,
                    "smtp_user": "nonexistent_tester_123@gmail.com",
                    "smtp_pass": "badpassword1234",
                    "smtp_encryption": "TLS"
                })
                self.assertEqual(test_res.status_code, 200)
                test_data = test_res.json()
                self.assertFalse(test_data["success"])
                self.assertEqual(test_data["status"], "AUTH_FAILED")
                self.assertTrue("authentication" in test_data["message"].lower() or "rejected" in test_data["message"].lower())

                # 3. Save SMTP configuration via PUT /api/v1/settings/smtp
                save_res = await client.put("/api/v1/settings/smtp", headers=headers, json={
                    "smtp_host": "smtp.gmail.com",
                    "smtp_port": 587,
                    "smtp_user": "outreach.agent@company.com",
                    "smtp_pass": "abcd efgh ijkl mnop",
                    "smtp_encryption": "TLS",
                    "smtp_from_email": "outreach.agent@company.com",
                    "smtp_sender_name": "Outreach Agent",
                    "daily_limit": 450
                })
                self.assertEqual(save_res.status_code, 200)
                save_data = save_res.json()
                self.assertEqual(save_data["smtp_user"], "outreach.agent@company.com")
                self.assertTrue(save_data["has_password"])
                self.assertEqual(save_data["smtp_pass"], "••••••••••••••••")

                # 4. Verify password in DB is encrypted (never plaintext)
                saved_in_db = await db["settings"].find_one({"user_id": self.user_id})
                self.assertIsNotNone(saved_in_db)
                self.assertNotEqual(saved_in_db["smtp_pass"], "abcd efgh ijkl mnop")
                self.assertNotEqual(saved_in_db["smtp_pass"], "abcdefghijklmnop")

                # 5. Dynamic Email AI Integration Check:
                # GET /api/v1/email-ai/smtp should automatically detect the saved settings!
                ai_smtp_res = await client.get("/api/v1/email-ai/smtp", headers=headers)
                self.assertEqual(ai_smtp_res.status_code, 200)
                ai_profiles = ai_smtp_res.json()
                self.assertGreaterEqual(len(ai_profiles), 1)
                default_profile = next(p for p in ai_profiles if p.get("username") == "outreach.agent@company.com")
                self.assertIsNotNone(default_profile)
                self.assertEqual(default_profile["host"], "smtp.gmail.com")
                self.assertEqual(default_profile["password"], "••••••••••••••••") # Never exposed in API

                # 6. Test updating without clearing password:
                update_res = await client.put("/api/v1/settings/smtp", headers=headers, json={
                    "smtp_host": "smtp.gmail.com",
                    "smtp_port": 587,
                    "smtp_user": "outreach.agent@company.com",
                    "smtp_pass": "••••••••••••••••",
                    "smtp_sender_name": "Updated Outreach Team",
                    "daily_limit": 600
                })
                self.assertEqual(update_res.status_code, 200)
                self.assertEqual(update_res.json()["smtp_sender_name"], "Updated Outreach Team")
                self.assertEqual(update_res.json()["daily_limit"], 600)

            # Cleanup
            await db["users"].delete_one({"_id": ObjectId(self.user_id)})
            await db["settings"].delete_one({"user_id": self.user_id})
            await db["email_ai_smtp"].delete_many({"user_id": self.user_id})
            await close_mongo_connection()

        self.loop.run_until_complete(run_flow())


if __name__ == "__main__":
    unittest.main()
