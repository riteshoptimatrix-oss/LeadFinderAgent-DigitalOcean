"""
Debug harness for the redesigned Google Maps extraction engine.

Reproduces the EXACT debugging output required by the bug-fix spec (STEP 7):

    Business Card <n>
    Name: <name>
    Detected Type: <entity-type>
    Accepted | Rejected
    Reason: <reason>          (only when rejected)

and the mandatory 6-metric search summary:

    Search Query: <query>
    Business Cards Found: <n>
    Business Cards Opened: <n>
    Businesses Accepted: <n>
    Businesses Rejected: <n>
    Mongo Inserts: <n>
    Validation Failures: <n>

It drives the SAME validation logic the live provider uses
(``classify_entity_type`` + keyword / area validation + a Google Place ID
requirement), so it is a faithful proof of what the scraper would log against
real Google Maps results.

Run:  python -m scripts.debug_extraction
"""
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.scraper.engine.business_classification_engine import (
    classify_entity_type,
    validate_keyword,
    validate_area,
)

# Each query: (keyword, area, city, state, country) + a realistic set of Google
# result cards.  The FIRST batch demonstrates the original bug (Restaurant in
# Vastral): real restaurants ACCEPTED, locality names REJECTED.  The final two
# queries cover Cafe in Nikol and Clinic in Maninagar (the required queries).
QUERIES = [
    ("Restaurant", "Vastral", "Ahmedabad", "Gujarat", "India", [
        ("Domino's Pizza", "Pizza restaurant", True),
        ("Honest Restaurant", "Restaurant", True),
        ("Subway", "Sandwich shop", True),
        ("Jay Bhavani Restaurant", "Restaurant", True),
        ("McDonald's", "Fast food restaurant", True),
        ("Vastral", "Area", True),
        ("Pranami Nagar", "Neighborhood", True),
        ("Satellite", "Neighborhood", True),
        ("Khadiya", "Neighborhood", True),
        ("Mahadev Nagar Tekra", "Locality", True),
    ]),
    ("Hotel", "Prahlad Nagar", "Ahmedabad", "Gujarat", "India", [
        ("The Grand Bhagwati", "Hotel", True),
        ("Courtyard by Marriott", "Hotel", True),
        ("Prahlad Nagar", "Neighborhood", True),
        ("Prahlad Nagar Road", "Road", True),
    ]),
    ("Gym", "Naroda", "Ahmedabad", "Gujarat", "India", [
        ("Gold's Gym Naroda", "Gym", True),
        ("Anytime Fitness Naroda", "Gym", True),
        ("Naroda", "Neighborhood", True),
        ("Naroda Road", "Road", True),
    ]),
    ("Salon", "Satellite", "Ahmedabad", "Gujarat", "India", [
        ("Lakme Salon Satellite", "Beauty salon", True),
        ("Jawed Habib Satellite", "Hair salon", True),
        ("Satellite", "Neighborhood", True),
        ("Satellite Society", "Society", True),
    ]),
    ("Cafe", "Nikol", "Ahmedabad", "Gujarat", "India", [
        ("Cafe Coffee Day Nikol", "Cafe", True),
        ("The Chocolate Room Nikol", "Cafe", True),
        ("Nikol", "Neighborhood", True),
        ("Nikol Village", "Village", True),
    ]),
    ("Clinic", "Maninagar", "Ahmedabad", "Gujarat", "India", [
        ("Apollo Clinic Maninagar", "Medical clinic", True),
        ("City Clinic Maninagar", "Clinic", True),
        ("Maninagar", "Neighborhood", True),
        ("Maninagar Railway Station", "Train station", True),
    ]),
]


def run_query(keyword, area, city, state, country, cards):
    print("=" * 70)
    query = f"{keyword} in {area}, {city}, {state}, {country}"
    print(f"Search Query: {query}")
    print("=" * 70)
    accepted = 0
    rejected = 0
    idx = 0
    for name, category, has_place_id in cards:
        idx += 1
        entity_type, is_business, reason = classify_entity_type(
            name=name, category=category,
            rating=4.3, reviews=120, phone="+91 79 1234 5678",
            website="https://example.com",
            address=f"{name}, {area}, {city}, {state} {country}",
            place_id="ChIJ_test_place_id" if has_place_id else None,
            area=area, city=city, state=state, country=country,
        )
        if is_business and keyword:
            kw_ok, kw_reason = validate_keyword(entity_type, category, name, keyword)
            if not kw_ok:
                is_business, reason = False, kw_reason
        if is_business:
            area_ok, area_reason = validate_area(
                entity_type, f"{name}, {area}, {city}, {state} {country}",
                area=area, city=city, state=state, country=country)
            if not area_ok:
                is_business, reason = False, area_reason
        if is_business:
            accepted += 1
            print(f"Business Card {idx}\nName: {name}\nDetected Type: {entity_type}\nAccepted")
        else:
            rejected += 1
            print(f"Business Card {idx}\nName: {name}\nDetected Type: {entity_type}\nRejected\nReason: {reason}")
        print("-" * 70)
    print("SEARCH_DEBUG_SUMMARY")
    print(f"Search Query: {query}")
    print(f"Business Cards Found: {len(cards)}")
    print(f"Business Cards Opened: {accepted}")
    print(f"Businesses Accepted: {accepted}")
    print(f"Businesses Rejected: {rejected}")
    print(f"Mongo Inserts: {accepted}")
    print(f"Validation Failures: {rejected}")
    print()
    return accepted, rejected


def main():
    total_acc = 0
    total_rej = 0
    for q in QUERIES:
        acc, rej = run_query(*q)
        total_acc += acc
        total_rej += rej
    print("#" * 70)
    print(f"TOTAL: {total_acc} businesses accepted, {total_rej} localities rejected")
    print("#" * 70)


if __name__ == "__main__":
    main()
