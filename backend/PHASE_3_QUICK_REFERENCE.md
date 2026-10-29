# Phase 3 Quick Reference Guide

## Quick Start

### Import Components
```python
from app.services.scraper.extraction_scheduler import ExtractionScheduler
from app.services.scraper.business_detail_loader import BusinessDetailLoader
from app.services.scraper.dom_analyzer import DOMAnalyzer
from app.services.scraper.contact_extractor_enhanced import ContactExtractorEnhanced
from app.services.scraper.location_extractor import LocationExtractor
from app.services.scraper.lead_builder_enhanced import LeadBuilderEnhanced
from app.services.scraper.extraction_engine import ExtractionEngine
from app.services.scraper.lead_schema import LeadObject
```

### Basic Usage

#### Extract a Single Business
```python
from playwright.async_api import async_playwright

async def extract_business(maps_url: str):
    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(headless=True)
    context = await browser.new_context()
    page = await context.new_page()
    
    engine = ExtractionEngine(
        page=page,
        job_id="job_123",
        session_id="session_456",
        worker_id="worker_1"
    )
    
    lead = await engine.extract_details(
        maps_url=maps_url,
        discovery_position=1,
        discovery_timestamp=datetime.utcnow(),
        search_keyword="coffee shop"
    )
    
    await browser.close()
    await playwright.stop()
    
    return lead
```

#### Initialize Extraction Scheduler
```python
from app.db.database import get_db

db = get_db()
scheduler = ExtractionScheduler(
    db=db,
    job_id="job_123",
    session_id="session_456"
)

await scheduler.initialize()

# Assign next business to worker
business = await scheduler.assign_next_business(worker_id="worker_1")

# Mark completed
await scheduler.mark_completed(
    maps_url=business["maps_url"],
    worker_id="worker_1",
    lead_object=lead
)

# Get progress
progress = await scheduler.get_progress()
print(f"Progress: {progress['progress_pct']}%")
```

## Component APIs

### ExtractionScheduler

```python
# Initialize
scheduler = ExtractionScheduler(db, job_id, session_id)
await scheduler.initialize()

# Assign work
business = await scheduler.assign_next_business(worker_id)

# Mark outcomes
await scheduler.mark_completed(maps_url, worker_id, lead_object)
await scheduler.mark_failed(maps_url, worker_id, error, retry=True)

# Monitor
await scheduler.recover_stale_assignments(timeout_seconds=300)
progress = await scheduler.get_progress()
await scheduler.wait_for_completion()

# Check duplicates
is_duplicate = scheduler.is_duplicate(maps_url)
```

### BusinessDetailLoader

```python
loader = BusinessDetailLoader(page)

# Load page
success, error = await loader.load_business_page(maps_url, business_name)

# Helper methods
await loader.handle_overlays()
await loader.scroll_to_load_lazy_content()
found = await loader.wait_for_specific_element(selector, timeout, required)
```

### DOMAnalyzer

```python
analyzer = DOMAnalyzer(page)

# Extract fields
name = await analyzer.extract_business_name()
primary, secondary = await analyzer.extract_categories()
rating, reviews = await analyzer.extract_rating_and_reviews()
description = await analyzer.extract_description()
hours = await analyzer.extract_working_hours()
status = await analyzer.extract_business_status()
claimed = await analyzer.extract_owner_claimed_status()
amenities, services = await analyzer.extract_amenities_and_services()
accessibility = await analyzer.extract_accessibility_features()
opening_date = await analyzer.extract_opening_date()
place_id = await analyzer.extract_place_id()
```

### ContactExtractorEnhanced

```python
extractor = ContactExtractorEnhanced(page)

# Extract contacts
phone = await extractor.extract_phone()
additional_phones = await extractor.extract_additional_phones()
website = await extractor.extract_website()
email = await extractor.extract_email()

# Extract URLs
booking = await extractor.extract_booking_url()
reservation = await extractor.extract_reservation_url()
menu = await extractor.extract_menu_url()
order = await extractor.extract_order_url()
directions = await extractor.extract_directions_url()

# Social media
social_links = await extractor.extract_social_media_links()
```

### LocationExtractor

```python
extractor = LocationExtractor(page)

# Extract address
address = await extractor.extract_address()

# Parse components
street, area, city, district, state, country, postal = \
    extractor.parse_address_components(address)

# Extract coordinates
lat, lng = extractor.extract_coordinates_from_url(page.url)
valid = extractor.validate_coordinates(lat, lng)

# Normalize
country_normalized = extractor.normalize_country_name(country)
state_normalized = extractor.normalize_state_name(state)
```

### LeadBuilderEnhanced

```python
builder = LeadBuilderEnhanced(job_id, session_id, worker_id)

# Build lead
lead = builder.build_lead(
    name=name,
    primary_category=primary_cat,
    secondary_categories=secondary_cats,
    description=description,
    # ... all other fields
)

# Calculate score
score = builder.calculate_lead_score(lead)

# Validation is automatic
print(lead.is_valid)
print(lead.validation_reason)
```

### ExtractionEngine

```python
engine = ExtractionEngine(page, job_id, session_id, worker_id)

# Extract complete business
lead = await engine.extract_details(
    maps_url=maps_url,
    discovery_position=position,
    discovery_timestamp=timestamp,
    search_keyword=keyword
)

if lead and lead.is_valid:
    print(f"✅ Extracted: {lead.identity.name}")
    print(f"Score: {builder.calculate_lead_score(lead)}/100")
```

## Event Emission

### Emit Custom Events
```python
from app.services.scraper.event_bus import event_bus

await event_bus.emit(
    job_id="job_123",
    event_type="CUSTOM_EVENT",
    message="Custom message",
    data={"key": "value"},
    error=None
)
```

### Standard Phase 3 Events
```python
# Business opened
await event_bus.emit(job_id, "BUSINESS_OPENED", "Opening business", data={"url": url})

# Field found
await event_bus.emit(job_id, "PHONE_FOUND", f"Found: {phone}", data={"phone": phone})
await event_bus.emit(job_id, "WEBSITE_FOUND", f"Found: {website}", data={"website": website})
await event_bus.emit(job_id, "EMAIL_FOUND", f"Found: {email}", data={"email": email})
await event_bus.emit(job_id, "ADDRESS_FOUND", f"Found: {address}", data={"address": address})
await event_bus.emit(job_id, "SOCIAL_FOUND", "Found social", data={"social": {platform: url}})

# Lead created
await event_bus.emit(job_id, "LEAD_CREATED", f"Created: {name}", data={
    "name": name,
    "is_valid": lead.is_valid,
    "lead_score": score
})

# Extraction complete
await event_bus.emit(job_id, "EXTRACTION_COMPLETED", f"Finished: {name}", data={
    "name": name,
    "is_valid": lead.is_valid,
    "duration_seconds": duration
})
```

## Data Models

### LeadObject Structure
```python
lead = LeadObject(
    identity=BusinessIdentity(
        name="Coffee Shop",
        primary_category="Cafe",
        secondary_categories=["Restaurant", "Bakery"],
        description="Great coffee shop",
        owner_claimed=True,
        services=["Dine-in", "Takeout"],
        amenities=["WiFi", "Parking"],
        accessibility=["Wheelchair accessible"],
        opening_date="2020"
    ),
    contact=ContactInfo(
        phone="+1234567890",
        additional_phones=[],
        website="https://example.com",
        email="info@example.com",
        booking_url="https://example.com/book",
        # ... other URLs
    ),
    location=LocationInfo(
        address="123 Main St, City, State 12345",
        street="123 Main St",
        city="City",
        state="State",
        country="USA",
        postal_code="12345",
        latitude=37.7749,
        longitude=-122.4194
    ),
    google=GoogleMetadata(
        rating=4.5,
        review_count=100,
        business_status="OPERATIONAL",
        working_hours={"Monday": "9:00 AM – 5:00 PM"},
        popular_times=[]
    ),
    metadata=ExtractionMetadata(
        discovery_position=1,
        discovery_timestamp=datetime.utcnow(),
        search_keyword="coffee shop",
        search_session_id="session_456",
        worker_id="worker_1",
        duration_seconds=6.5
    ),
    is_valid=True,
    validation_reason=None
)
```

## Common Patterns

### Worker Loop
```python
async def worker_loop(worker_id: str, scheduler: ExtractionScheduler, engine: ExtractionEngine):
    while True:
        # Get next business
        business = await scheduler.assign_next_business(worker_id)
        if not business:
            break
        
        try:
            # Extract
            lead = await engine.extract_details(
                maps_url=business["maps_url"],
                discovery_position=business["discovery_position"],
                discovery_timestamp=business["discovery_timestamp"],
                search_keyword=business.get("search_keyword", "")
            )
            
            # Mark completed
            await scheduler.mark_completed(
                maps_url=business["maps_url"],
                worker_id=worker_id,
                lead_object=lead
            )
            
        except Exception as e:
            # Mark failed (will retry if applicable)
            await scheduler.mark_failed(
                maps_url=business["maps_url"],
                worker_id=worker_id,
                error=str(e),
                retry=True
            )
```

### Batch Processing
```python
async def process_batch(job_id: str, session_id: str, num_workers: int = 3):
    db = get_db()
    scheduler = ExtractionScheduler(db, job_id, session_id)
    await scheduler.initialize()
    
    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(headless=True)
    
    workers = []
    for i in range(num_workers):
        context = await browser.new_context()
        page = await context.new_page()
        engine = ExtractionEngine(page, job_id, session_id, f"worker_{i}")
        workers.append(worker_loop(f"worker_{i}", scheduler, engine))
    
    # Run all workers
    await asyncio.gather(*workers)
    
    await browser.close()
    await playwright.stop()
    
    # Get final stats
    progress = await scheduler.get_progress()
    print(f"✅ Completed: {progress['completed']}/{progress['total']}")
```

## Validation Rules

```python
# Rule 1: Business name required
assert lead.identity.name and len(lead.identity.name.strip()) > 0

# Rule 2: At least one contact method
assert (lead.contact.phone or lead.contact.website or 
        lead.contact.email or lead.location.address)

# Rule 3: Website URL valid
import re
if lead.contact.website:
    assert re.match(r"^https?://", lead.contact.website)

# Rule 4: Rating in range
if lead.google.rating:
    assert 1.0 <= lead.google.rating <= 5.0

# Rule 5: Coordinates valid
if lead.location.latitude and lead.location.longitude:
    assert -90 <= lead.location.latitude <= 90
    assert -180 <= lead.location.longitude <= 180

# Rule 6: Phone valid format
if lead.contact.phone:
    assert lead.contact.phone.startswith("+")
    assert len(re.sub(r"\D", "", lead.contact.phone)) >= 10

# Rule 7: Email valid format
if lead.contact.email:
    assert re.match(r'^[^@]+@[^@]+\.[^@]+$', lead.contact.email)
```

## Testing

### Unit Test Example
```python
import pytest
from app.services.scraper.lead_builder_enhanced import LeadBuilderEnhanced

@pytest.mark.asyncio
async def test_lead_builder():
    builder = LeadBuilderEnhanced("job", "session", "worker")
    
    lead = builder.build_lead(
        name="Test Business",
        primary_category="Test",
        secondary_categories=[],
        description=None,
        owner_claimed=None,
        services=[],
        amenities=[],
        accessibility=[],
        opening_date=None,
        phone="+1234567890",
        additional_phones=[],
        website="https://example.com",
        email="test@example.com",
        booking_url=None,
        reservation_url=None,
        menu_url=None,
        order_url=None,
        directions_url=None,
        address="123 Test St",
        street="123 Test St",
        area=None,
        city="City",
        district=None,
        state="State",
        country="Country",
        postal_code="12345",
        latitude=37.7749,
        longitude=-122.4194,
        maps_url="https://maps.google.com/...",
        place_id="abc123",
        rating=4.5,
        review_count=100,
        business_status="OPERATIONAL",
        working_hours={},
        discovery_position=1,
        discovery_timestamp=datetime.utcnow(),
        search_keyword="test",
        duration_seconds=5.0
    )
    
    assert lead.is_valid is True
    assert lead.identity.name == "Test Business"
    assert lead.contact.phone == "+1234567890"
```

## Debugging

### Enable Detailed Logging
```python
import logging

# Set log level
logging.getLogger("app.services.scraper").setLevel(logging.DEBUG)

# Or for specific components
logging.getLogger("app.services.scraper.dom_analyzer").setLevel(logging.DEBUG)
logging.getLogger("app.services.scraper.contact_extractor_enhanced").setLevel(logging.DEBUG)
```

### Inspect Lead Object
```python
# Print lead as dict
print(lead.model_dump())

# Print lead as JSON
print(lead.model_dump_json(indent=2))

# Access fields
print(f"Name: {lead.identity.name}")
print(f"Valid: {lead.is_valid}")
print(f"Reason: {lead.validation_reason}")
```

### Monitor Progress
```python
while True:
    progress = await scheduler.get_progress()
    print(f"Progress: {progress['progress_pct']}%")
    print(f"Pending: {progress['pending']}")
    print(f"In Progress: {progress['in_progress']}")
    print(f"Completed: {progress['completed']}")
    print(f"Failed: {progress['failed']}")
    await asyncio.sleep(5)
```

## Performance Tips

1. **Reuse browser contexts** - Don't create new browser for each extraction
2. **Use Locator API** - Avoid fixed waits
3. **Parallel workers** - Run multiple extraction workers
4. **Batch operations** - Process multiple businesses together
5. **Connection pooling** - Reuse database connections

## Common Issues

### Issue: Page won't load
```python
# Solution: Increase timeout
loader = BusinessDetailLoader(page)
# Modify _wait_for_business_panel timeout
await page.wait_for_load_state("networkidle", timeout=10000)
```

### Issue: Missing fields
```python
# Solution: Check selector compatibility
analyzer = DOMAnalyzer(page)
# Add new selectors to extraction methods
```

### Issue: Stale assignments
```python
# Solution: Adjust timeout
await scheduler.recover_stale_assignments(timeout_seconds=600)
```

## Configuration

```python
# Environment variables
EXTRACTION_MAX_RETRIES = 3
EXTRACTION_TIMEOUT = 300
EXTRACTION_PAGE_LOAD_TIMEOUT = 30

# Database collections
BUSINESS_QUEUE = "business_queue"

# Statuses
STATUS_PENDING = "PENDING"
STATUS_IN_PROGRESS = "IN_PROGRESS"
STATUS_COMPLETED = "COMPLETED"
STATUS_FAILED = "FAILED"
```

## Quick Verification

```bash
# Run verification script
cd backend
python verify_phase3.py

# Expected output:
# ✅ All components PASSED
# 🎉 Phase 3: FULLY OPERATIONAL
```

---

**Quick Reference Complete** ✅
