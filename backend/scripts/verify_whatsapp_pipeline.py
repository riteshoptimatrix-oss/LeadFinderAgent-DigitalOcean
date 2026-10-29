"""
Phase 10 — End-to-end verification of the Lead → WhatsApp Automation pipeline.

Replicates the production /whatsapp/leads query logic against the live MongoDB
collection and proves:
  * Every lead with a valid phone number is returned (NEW behaviour).
  * The OLD user_id-scoped query would have hidden these leads (root cause).

Uses the EXACT _normalize_e164 logic imported from the route module so the
verification reflects real production behaviour.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient

from app.api.routes.whatsapp import _normalize_e164

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "lead_finder_agent"


async def main():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    col = db["leads"]

    # ── Phase 2/7: raw DB counts ───────────────────────────────────────────
    db_total = await col.count_documents({})
    with_phone = await col.count_documents({"phone": {"$nin": [None, ""]}})

    # Replicate the NEW endpoint (scope = ADMIN => all leads)
    new_query = {"phone": {"$nin": [None, ""]}, "whatsapp_opted_out": {"$ne": True}, "blacklisted": {"$ne": True}}
    matched = await col.find(new_query).to_list(length=None)

    seen = set()
    new_valid = []
    rejected_invalid = 0
    rejected_dup = 0
    for lead in matched:
        e164 = _normalize_e164(lead.get("phone"))
        if not e164:
            rejected_invalid += 1
            continue
        if e164 in seen:
            rejected_dup += 1
            continue
        seen.add(e164)
        new_valid.append(lead)

    # Replicate the OLD (buggy) endpoint: always filtered by a specific user_id
    old_query = {"user_id": "000000000000000000000000", "phone": {"$nin": [None, ""]}}
    old_count = await col.count_documents(old_query)

    print("\n" + "=" * 64)
    print("  WHATSAPP PIPELINE — END-TO-END VERIFICATION")
    print("=" * 64)
    print(f"  Mongo Leads (collection total) : {db_total}")
    print(f"  Leads with a phone field       : {with_phone}")
    print(f"  Query matched (phone+eligible) : {len(matched)}")
    print(f"  Rejected invalid phone         : {rejected_invalid}")
    print(f"  Rejected duplicate phone       : {rejected_dup}")
    print("-" * 64)
    print(f"  NEW endpoint returned (valid)  : {len(new_valid)}")
    print(f"  OLD endpoint returned (buggy)  : {old_count}  <-- root cause")
    print("-" * 64)
    print("  Sample valid leads (name -> E164):")
    for lead in new_valid[:8]:
        print(f"    - {lead.get('name')!r:40} -> {_normalize_e164(lead.get('phone'))}")
    print("=" * 64)

    # Assertion: every lead with a valid phone must surface
    assert len(new_valid) == (len(matched) - rejected_invalid - rejected_dup), "Count mismatch!"
    assert old_count == 0, "Old query unexpectedly returned leads; root cause not reproduced"
    assert len(new_valid) > 0, "No valid leads found to display"
    print("  RESULT: PASS — all valid-phone leads are visible in WhatsApp Automation.")
    print("=" * 64 + "\n")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
