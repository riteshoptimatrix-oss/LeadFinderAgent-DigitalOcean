import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "lead_finder_agent"

leads_data = [
    {"name": "Jani Locho & Khaman House", "phone": "+91 98251 24785", "website": "", "google_rating": 4.4, "address": "Near Collector Office, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Zampa Rajwadi Kulfi", "phone": "+91 99244 88771", "website": "https://instagram.com/zamparajwadikulfi", "google_rating": 4.3, "address": "Chowk Bazaar Rd, Opp. Old Fort, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Dilbahar Soda Factory", "phone": "+91 261 242 3366", "website": "", "google_rating": 4.5, "address": "Near Mulla Khaja Masjid, Main Road, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "A-One Coco", "phone": "+91 98980 12345", "website": "https://aonecoco.com", "google_rating": 4.6, "address": "Near Gandhi Baug, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Surat Fort Restaurant", "phone": "+91 76000 45450", "website": "https://facebook.com/suratfortrestaurant", "google_rating": 4.2, "address": "Inside Old Fort Campus, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Madhi Ni Khamani", "phone": "+91 93747 17273", "website": "", "google_rating": 4.3, "address": "Killa Kot Road, Near Head Post Office, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Kansar Gujarati Thali", "phone": "+91 261 245 6677", "website": "https://kansarthali.com", "google_rating": 4.4, "address": "1st Floor, Heritage Square, Near Chowk Fountain, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Bismillah Boutique Ice Cream", "phone": "+91 98241 95465", "website": "https://bismillahicecream.com", "google_rating": 4.5, "address": "Main Road, Opp. Kasturba Garden, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Sabir Chicken & Biryani House", "phone": "+91 90334 77861", "website": "", "google_rating": 4.1, "address": "Near Mulla Building, Cinema Road, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Gani Dahi Vada Center", "phone": "+91 97255 11992", "website": "", "google_rating": 4.3, "address": "Near Nehru Garden, Chowk Bazaar Road, Surat, Gujarat 395003"},
    {"name": "Bhagat Tarachand", "phone": "+91 81411 99002", "website": "https://instagram.com/bhagattarachandsurat", "google_rating": 4.2, "address": "Commercial Complex, Near Andrews Library, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Real Fast Food", "phone": "+91 99799 44331", "website": "", "google_rating": 4.0, "address": "Shop No. 8, Gandhi Plaza, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Chandu Lal Kulfi Wala", "phone": "+91 94261 55664", "website": "", "google_rating": 4.4, "address": "Near Old RTO Office, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Al-Faisal Non-Veg Restaurant", "phone": "+91 88662 33441", "website": "", "google_rating": 4.2, "address": "Fort Road, Opposite Old Jail Building, Chowk Bazaar, Surat, Gujarat 395003"},
    {"name": "Jay Jalaram Khichdi Center", "phone": "+91 98795 66110", "website": "https://facebook.com/jayjalaramkhichdisurat", "google_rating": 4.3, "address": "Ground Floor, Shramik Bhavan, Chowk Bazaar, Surat, Gujarat 395003"},
]


def build_lead_doc(data):
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
        "city": "Surat",
        "state": "Gujarat",
        "country": "India",
        "area": "Chowk Bazaar",
        "category": "Restaurant & Food",
        "google_rating": data["google_rating"],
        "rating": data["google_rating"],
        "reviews": 0,
        "review_count": 0,
        "source_url": "",
        "google_maps_url": "",
        "tags": ["restaurant", "food", "surat", "chowk-bazaar"],
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

    print(f"\n{'='*60}")
    print(f"  Surat Chowk Bazaar Leads Import - {total} leads")
    print(f"{'='*60}\n")

    for i, data in enumerate(leads_data, 1):
        phone_clean = data["phone"].replace("+91 ", "").replace(" ", "")
        existing = await leads_col.find_one({
            "$or": [
                {"name": data["name"], "phone": data["phone"]},
                {"phone": {"$regex": phone_clean}},
            ]
        })

        if existing:
            print(f"  [{i:2d}/{total}] SKIP (exists): {data['name']}")
            skipped += 1
            continue

        doc = build_lead_doc(data)
        result = await leads_col.insert_one(doc)
        if result.acknowledged:
            print(f"  [{i:2d}/{total}] INSERTED: {data['name']}")
            inserted += 1
        else:
            print(f"  [{i:2d}/{total}] ERROR: {data['name']}")

    print(f"\n{'='*60}")
    print(f"  DONE - Inserted: {inserted} | Skipped: {skipped}")
    print(f"{'='*60}\n")
    client.close()


asyncio.run(main())
