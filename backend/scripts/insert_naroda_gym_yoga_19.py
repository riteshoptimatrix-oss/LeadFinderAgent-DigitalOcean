import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "lead_finder_agent"

leads_data = [
    {"name": "Lifeline Fitness Gym Nava Naroda", "phone": "+91 99047 72240", "website": "https://lifelinefitnessgym.in/", "google_rating": 4.9, "address": "6th & 7th floor, naroda business point, Vasant Vihar 2, Nava Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "ASSURE FITNESS CLUB LLP", "phone": "+91 98989 89533", "website": "", "google_rating": 4.7, "address": "J-601 WHITE BUSINESS HUB NR HANSPURA GAM,DEGAM, ROAD, Vasant Vihar 2, NARODA, Ahmedabad, Gujarat 382330"},
    {"name": "The Gym World", "phone": "+91 98795 79797", "website": "", "google_rating": 4.5, "address": "3rd Floor, near Emerald Restaurant, Kapdi Vas, Makarpura, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Fitness Fuel", "phone": "+91 95582 25511", "website": "", "google_rating": 4.7, "address": "7th Floor, Naroda Business Hub, Naroda - Dehgam Rd, Hanspura, GIDC Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Shree Red Bull Gym", "phone": "+91 70696 97070", "website": "https://www.instagram.com/shreeredbullgym/", "google_rating": 4.7, "address": "A-Block 3rd Floor, Pushpak Corner, nr. Navyug School Road, Krishnanagar, Naroda, Ahmedabad, Gujarat 382345"},
    {"name": "THE FAIM GYM", "phone": "+91 63598 05667", "website": "http://www.thefaimgym.com/", "google_rating": 4.8, "address": "6TH FLOOR, SHREEMAD BUISNESS POINT, Dehgam Rd, nr. STAR ICON, Hanspura, GIDC Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Shree Golden Fitness Health Club", "phone": "+91 99798 72829", "website": "", "google_rating": 4.5, "address": "1st Floor, Dipika Towers, Makarpura, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Champions Wellness & Fitness Club", "phone": "", "website": "", "google_rating": 4.9, "address": "Shop No, 3rd floor, Vitthal Plaza, 324, opp. Sadhimata Temple, Vasant Vihar 2, Nava Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Mindmuscle fitness", "phone": "+91 81530 28923", "website": "https://www.mindmusclefitness.in/", "google_rating": 5.0, "address": "SHYAM ENCLAVE, 4th, plot, opp. mevada green party, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Everyday Fitness Gym", "phone": "+91 83201 73270", "website": "", "google_rating": 4.9, "address": "216, 217 & 218 2nd Floor Sahitya Arcade Prime Hospital, Haridarshan Cross Road, near Shallby Hospital, Vasant Vihar 2, Nava Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Tiger Gym Power is Back", "phone": "+91 97143 53351", "website": "http://snazzy-pegasus-5c7404.netlify.app/", "google_rating": 4.9, "address": "Shivaji Chowk, Parshwanath Township, Thakkarbapanagar, Nava Naroda, Ahmedabad, Gujarat 382345"},
    {"name": "BEAST FOREVER GYM", "phone": "+91 91044 61415", "website": "", "google_rating": 5.0, "address": "TH FLOOR, Galaxy Avenue, E-4, opp. GALAXY CINEMA, Chandresh Society, Makarpura, Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "ANANTA FITNESS HANSPURA", "phone": "+91 93131 19439", "website": "", "google_rating": 4.6, "address": "Galaxy Central, 207, Sardar Patel Ring Rd, opp. Dmart, Hanspura, Vasant Vihar 2, Nava Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "UPF - The GYM", "phone": "+91 92270 01415", "website": "https://theupf.in/", "google_rating": 4.7, "address": "sahitya icon, above Blue Buddha Store, Vasant Vihar 2, Nava Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Om Divine Yoga Studio", "phone": "+91 97256 33261", "website": "https://omdivineyogastudio.in/", "google_rating": 5.0, "address": "515, naroda business point, nr. Ms school, opp. swaminarayan park, Vasant Vihar 2, Nava Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Kaivalya Yoga Center", "phone": "+91 99253 83215", "website": "https://kaivalyayogacenternaroda.in/", "google_rating": 5.0, "address": "312, Sahitya Arcade, Haridarshan Cross Road, near Prime Hospital, Vasant Vihar 2, Nava Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "Aturyam Yoga Studio", "phone": "+91 96010 81128", "website": "", "google_rating": 5.0, "address": "215, Ayushman plaza, opp. Vitthal Plaza, near Sadhi mata mandir, Vasant Vihar 2, Nava Naroda, Ahmedabad, Gujarat 382330"},
    {"name": "SHIV SHAMBHU YOGCLASSES", "phone": "+91 84016 00261", "website": "", "google_rating": 4.8, "address": "Ozone City, O BLOCK 303, ITI ROAD, Naroda, Ahmedabad, Gujarat 382340"},
    {"name": "OZONE YOGA HUB", "phone": "+91 70484 84558", "website": "", "google_rating": 5.0, "address": "Keshav Galaxy, E.203, New India Colony, Nava Naroda, Ahmedabad, Gujarat 382330"},
]


def build_lead_doc(data):
    now = datetime.now(timezone.utc)
    phone_clean = data["phone"].replace("+91 ", "").replace(" ", "") if data["phone"] else ""
    name_lower = data["name"].lower().strip()
    fingerprint = f"{name_lower}__{phone_clean}" if phone_clean else name_lower

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
        "tags": ["gym", "fitness", "yoga", "naroda", "ahmedabad"],
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
    print(f"  Naroda Gym & Yoga Leads Import - {total} leads")
    print(f"{'='*60}\n")

    for i, data in enumerate(leads_data, 1):
        phone_clean = data["phone"].replace("+91 ", "").replace(" ", "") if data["phone"] else ""

        query = {"$or": [{"name": data["name"]}]}
        if phone_clean:
            query["$or"].append({"phone": {"$regex": phone_clean}})

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
    print(f"  Total leads in DB: {await leads_col.count_documents({})}")
    print(f"{'='*60}\n")
    client.close()


asyncio.run(main())
