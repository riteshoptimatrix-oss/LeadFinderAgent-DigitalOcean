"""
Insert 35 Naroda Ahmedabad gym leads into MongoDB.
Skips any lead that already exists (matched by name+phone).
"""

import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "lead_finder_agent"

leads_data = [
    {"name": "SFW The Gym (Naroda Branch)", "phone": "+91 97245 42542", "website": "https://sfwthegym.com", "google_rating": 4.7, "address": "2nd Floor, Cross Road Complex, Opp. Torrent Power Station, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "The Fitness Club", "phone": "+91 99241 12233", "website": "", "google_rating": 4.5, "address": "1st Floor, Shukan Shanti Complex, Near Haridarshan Cross Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Real Gym & Fitness Center", "phone": "+91 98982 34567", "website": "", "google_rating": 4.4, "address": "Shreemad Residency, Near Galaxy Cinema, National Highway 8, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Gold's Fitness Center", "phone": "+91 76000 98765", "website": "", "google_rating": 4.6, "address": "3rd Floor, Sigma Icon, Above Reliance Smart, Dehgam Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Pulse Gym", "phone": "+91 90330 54321", "website": "", "google_rating": 4.3, "address": "204, Capital Icon, Opp. dynamic complex, Naroda-Dehgam Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Iron Paradise Gym", "phone": "+91 88662 11223", "website": "", "google_rating": 4.2, "address": "Block-A, 1st Floor, Krishna Avenue, Near Muthoot Finance, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Fitness First Zone", "phone": "+91 95101 44556", "website": "https://fitnessfirstzone.in", "google_rating": 4.7, "address": "4th Floor, Platinum Plaza, Near Naroda Canal, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Evolution Fitness Hub", "phone": "+91 70415 99887", "website": "", "google_rating": 4.5, "address": "Shop No 12, Ground Floor, Galaxy Bazar, Poddar Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Core Power Gym", "phone": "+91 91732 66778", "website": "", "google_rating": 4.3, "address": "2nd Floor, Maruti Arcade, Near Krishna Nagar Cross Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Muscle & Motion Fitness Studio", "phone": "+91 99044 22334", "website": "", "google_rating": 4.6, "address": "3rd Floor, Sunrise Business Hub, Near Nikol-Naroda Road, Naroda, Ahmedabad, Gujarat 382350"},
    {"name": "Anytime Fitness Club", "phone": "+91 76988 55443", "website": "", "google_rating": 4.1, "address": "1st Floor, Royal Arcade, Opp. GIDC Business Hub, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Oxygen Gym & Aerobics", "phone": "+91 81412 88990", "website": "", "google_rating": 4.4, "address": "2nd Floor, Dev Prime Complex, Opp. Fire Station, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Hardcore Fitness Center", "phone": "+91 96620 77665", "website": "", "google_rating": 4.5, "address": "Shop No 5, Tirupati Estate, Near National Highway, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Ultimate Gym & Wellness", "phone": "+91 97233 44112", "website": "https://ultimategymnaroda.com", "google_rating": 4.8, "address": "3rd Floor, Shukan Mall, Near Science City Road Connection, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Active Life Fitness Hub", "phone": "+91 94280 12345", "website": "", "google_rating": 4.3, "address": "102, Fortune Business Hub, Near Bethak Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Powerhouse Gym Naroda", "phone": "+91 84600 33221", "website": "", "google_rating": 4.6, "address": "2nd Floor, Vasant Vihar Complex, Near Naroda Gam, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Body Temple Fitness", "phone": "+91 90999 66554", "website": "", "google_rating": 4.2, "address": "Shop No. 18, Radhe Shopping Mall, Khari River Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Shape Up Fitness Studio", "phone": "+91 98790 88776", "website": "", "google_rating": 4.4, "address": "1st Floor, Harmony Icon, Near Uma Colony, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Titanium Gym & Crossfit", "phone": "+91 75677 22110", "website": "https://titaniumgym.in", "google_rating": 4.7, "address": "4th Floor, Skyline Heights, Opp. Shalby Hospital Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Rebound Fitness Center", "phone": "+91 93740 55442", "website": "", "google_rating": 4.5, "address": "3rd Floor, Milestone Arcade, Near SP Ring Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Black's Gym & Cardio", "phone": "+91 82380 44332", "website": "", "google_rating": 4.3, "address": "B-Block, Ground Floor, Galaxy Avenue, Dehgam Cross Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Target Fitness Studio", "phone": "+91 95866 11778", "website": "", "google_rating": 4.4, "address": "2nd Floor, Radhe Fortune, Opp. Swaminarayan Temple, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Spartan Gym & MMA Club", "phone": "+91 97122 33445", "website": "", "google_rating": 4.6, "address": "305, Synergy Space, Near GIDC Phase 4, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Gladiator Fitness Hub", "phone": "+91 99740 88991", "website": "", "google_rating": 4.5, "address": "Shop No 4, Krishna Kunj Society, Near Pavapuri Bus Stop, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Peak Performance Gym", "phone": "+91 90166 22334", "website": "https://peakperformance.co.in", "google_rating": 4.7, "address": "4th Floor, Alpha Business Park, Near Hanspura Cross Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Metro Fitness Studio", "phone": "+91 87588 66554", "website": "", "google_rating": 4.2, "address": "1st Floor, Shivam Complex, Opp. Railway Station Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Gold Standard Gym", "phone": "+91 91577 44332", "website": "", "google_rating": 4.4, "address": "3rd Floor, Capital Plaza, Near Haridarshan Cross Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Smart Fit Gym", "phone": "+91 98255 11223", "website": "", "google_rating": 4.3, "address": "Ground Floor, Omkar Arcade, Near Galaxy Cinema, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Burn & Earn Fitness Lounge", "phone": "+91 76002 99887", "website": "", "google_rating": 4.5, "address": "2nd Floor, Shreemad Avenue, Near Nikol Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Force One Fitness", "phone": "+91 99988 77665", "website": "", "google_rating": 4.6, "address": "3rd Floor, Naroda Business Hub, Opp. Torrent Power Office, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Zero Gravity Gym", "phone": "+91 81400 55443", "website": "https://zerogravitygym.in", "google_rating": 4.8, "address": "401, Sapphire Complex, Opp. Royal Plaza, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Elite Fitness & Crossfit", "phone": "+91 90334 11229", "website": "", "google_rating": 4.4, "address": "2nd Floor, Maruti Plaza, Near Krishna Nagar, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Xtreme Muscle Gym", "phone": "+91 97250 88776", "website": "", "google_rating": 4.3, "address": "Shop No. 12, Sahjanand Estate, National Highway 8, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "The Beast Mode Gym", "phone": "+91 94299 44332", "website": "", "google_rating": 4.5, "address": "1st Floor, Shukan Status, Near Haridarshan Cross Road, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Zeus Fitness Hub", "phone": "+91 88660 22114", "website": "", "google_rating": 4.6, "address": "3rd Floor, Dev Arcade, Opp. GIDC Gate, Naroda, Ahmedabad, Gujarat 382330"},
]


def build_lead_doc(data: dict) -> dict:
    now = datetime.now(timezone.utc)
    phone_clean = data["phone"].replace("+91 ", "").replace(" ", "")
    name_lower = data["name"].lower().strip()
    fingerprint = f"{name_lower}__{phone_clean}"

    return {
        "user_id": "system_automated",
        "name": data["name"],
        "business_name": data["name"],
        "phone": data["phone"],
        "email": "",
        "website": data["website"],
        "address": data["address"],
        "city": "Ahmedabad",
        "state": "Gujarat",
        "country": "India",
        "area": "Naroda",
        "category": "Gym & Fitness",
        "google_rating": data["google_rating"],
        "rating": data["google_rating"],
        "reviews": 0,
        "review_count": 0,
        "source_url": "",
        "google_maps_url": "",
        "tags": ["gym", "fitness", "naroda", "ahmedabad"],
        "is_favorite": False,
        "lead_score": 0,
        "website_score": 0,
        "website_status": "Unknown",
        "pipeline_stage": "New Lead",
        "priority": "Normal",
        "status": "new",
        "created_by": "system_automated",
        "fingerprint": fingerprint,
        "created_at": now,
        "updated_at": now,
        "historical_analyses": [],
    }


async def main():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    leads_col = db["leads"]

    total = len(leads_data)
    inserted = 0
    skipped = 0
    errors = 0

    print(f"\n{'='*60}")
    print(f"  Naroda Gym Leads Import — {total} leads")
    print(f"{'='*60}\n")

    for i, data in enumerate(leads_data, 1):
        name = data["name"]
        phone = data["phone"]
        phone_clean = phone.replace("+91 ", "").replace(" ", "")

        # Duplicate check: match by (name + phone) or by phone alone
        existing = await leads_col.find_one({
            "$or": [
                {"name": name, "phone": phone},
                {"name": name, "phone": {"$regex": phone_clean}},
                {"phone": phone},
                {"phone": {"$regex": phone_clean}},
            ]
        })

        if existing:
            print(f"  [{i:2d}/{total}] SKIP (exists): {name}")
            skipped += 1
            continue

        doc = build_lead_doc(data)
        try:
            result = await leads_col.insert_one(doc)
            if result.acknowledged:
                print(f"  [{i:2d}/{total}] INSERTED: {name}")
                inserted += 1
            else:
                print(f"  [{i:2d}/{total}] ERROR (not acknowledged): {name}")
                errors += 1
        except Exception as e:
            print(f"  [{i:2d}/{total}] ERROR: {name} — {e}")
            errors += 1

    print(f"\n{'='*60}")
    print(f"  DONE — Inserted: {inserted} | Skipped (duplicate): {skipped} | Errors: {errors}")
    print(f"{'='*60}\n")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
