import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "lead_finder_agent"

leads_data = [
    {"name": "होटल लोटस", "phone": "+91 73100 28100", "website": "http://www.hotellotusbotad.com/", "google_rating": 4.8, "address": ""},
    {"name": "होटल स्काई गोल्ड", "phone": "+91 78747 53100", "website": "", "google_rating": 4.8,
     "address": "3rd Floor, Narmada Complex, Paliyad Rd, opp. Punjab National Bank, Jawahar Nagar, Paras Nath Complex, Bharvad Vado, Botad, Gujarat 364710"},
    {"name": "होटल साई & गेस्ट हाउस", "phone": "+91 87995 11686", "website": "http://hotelsaibotad.com/", "google_rating": 4.1,
     "address": "Tower Rd, near Mastram Mandir, Kharama, Bharvad Vado, Botad, Gujarat 364710"},
    {"name": "अमर गेस्ट हाउस", "phone": "", "website": "", "google_rating": 4.4,
     "address": "MOBILE BAZAR ANANDDHAM COMPLEX, Kharama, Bharvad Vado, Botad, Gujarat 364710"},
    {"name": "अनंत गेस्ट हाउस", "phone": "", "website": "", "google_rating": 4.2,
     "address": "2nd Floor, Ananddham Crystal, Paliyad Rd, Kharama, Bharvad Vado, Botad, Gujarat 364710"},
    {"name": "अंजनी गेस्ट हाउस", "phone": "+91 99242 4998", "website": "", "google_rating": 4.8,
     "address": "Paliyad Rd, Kharama, Bharvad Vado, Botad, Gujarat 364710"},
    {"name": "होटल तीर्थ", "phone": "+91 81404 09015", "website": "", "google_rating": 4.6,
     "address": "2nd Floor, Tirth Hub 2 Complex, Tower Rd, Kharama, Bharvad Vado, Botad, Gujarat 364710"},
    {"name": "होटल गौतम इन", "phone": "+91 81402 10642", "website": "", "google_rating": 4.0,
     "address": "above central bank of india, gautam corner, शेर्थाली, बोटाद, गुजरात 364710"},
    {"name": "होटल शाश्वत इन", "phone": "+91 99243 49999", "website": "http://www.hotelshaswatinn.com/", "google_rating": 3.9,
     "address": "HOTEL SHASWAT INN, Tower Rd, Kharama, Bharvad Vado, Botad, Gujarat 364710"},
    {"name": "थे होटल वैभव इन एंड बैंक्वेट हॉल", "phone": "+91 70464 86468", "website": "", "google_rating": 3.9,
     "address": "GIDC, Botad, Gujarat 364710"},
    {"name": "बजट स्टे होटल", "phone": "+91 83207 57315", "website": "", "google_rating": 5.0,
     "address": "2nd floor, kanchan complex, station road, opp. reliance smart mall tower, Kharama, Bharvad Vado, Botad, Gujarat 364710"},
    {"name": "होटल युवराज", "phone": "", "website": "", "google_rating": 5.0,
     "address": "Shree Aai Complex, Mastram Mandir Chowk, Kharama, Bharvad Vado, Botad, Gujarat 364710"},
    {"name": "होटल थे गैलेक्सी बोटाद", "phone": "+91 91046 2585", "website": "", "google_rating": 5.0,
     "address": "Old post office, Tower station road, opposite Botad, Kharama, Bharvad Vado, Botad, Gujarat 364710"},
    {"name": "लॉर्ड्स एसकेडी रिसॉर्ट", "phone": "+91 99242 49954", "website": "http://www.skdresortandclub.com/", "google_rating": 4.4,
     "address": "Survey No.-1517, Barwala Salangpur Highway, Barwala - Botad Hwy, at, Botad, Gujarat 382450"},
]


def resolve_area(address: str) -> str:
    a = (address or "").lower()
    for token in ("kharama", "gidc", "barwala", "bharvad vado", "paliyad", "jawahar"):
        if token in a:
            return token.title()
    return "Botad"


def build_lead_doc(data):
    now = datetime.now(timezone.utc)
    phone = data["phone"].strip()
    phone_clean = phone.replace("+91 ", "").replace(" ", "")
    name_lower = data["name"].lower().strip()
    fingerprint = f"{name_lower}__{phone_clean}" if phone_clean else name_lower

    tags = ["hotel", "botad", "gujarat", "hospitality"]
    lowered = data["name"].lower()
    if "guest" in lowered or "गेस्ट" in data["name"]:
        tags.append("guest-house")
    if "resort" in lowered or "रिसॉर्ट" in data["name"]:
        tags.append("resort")

    return {
        "user_id": "system_manual_import",
        "name": data["name"],
        "business_name": data["name"],
        "phone": phone,
        "email": "",
        "website": data["website"],
        "address": data["address"],
        "city": "Botad",
        "state": "Gujarat",
        "country": "India",
        "area": resolve_area(data["address"]),
        "category": "Hotels & Hospitality",
        "google_rating": data["google_rating"],
        "rating": data["google_rating"],
        "reviews": 0,
        "review_count": 0,
        "source_url": "",
        "google_maps_url": "",
        "tags": tags,
        "is_favorite": False,
        "lead_score": 0,
        "website_score": 0,
        "website_status": "Unknown",
        "pipeline_stage": "New Lead",
        "priority": "Normal",
        "status": "new",
        "created_by": "system_manual_import",
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
    print(f"  Botad Hotels Leads Import - {total} leads")
    print(f"{'='*60}\n")

    for i, data in enumerate(leads_data, 1):
        phone_clean = data["phone"].replace("+91 ", "").replace(" ", "")
        query = {"name": data["name"]}
        if phone_clean:
            query = {"$or": [query, {"phone": {"$regex": phone_clean}}]}
        existing = await leads_col.find_one(query)

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
