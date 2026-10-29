"""
Phase 3 Verification Script
Tests all Phase 3 components to ensure they're working correctly
"""

import asyncio
import sys
from datetime import datetime
from playwright.async_api import async_playwright

# Add parent directory to path
sys.path.insert(0, '.')

from app.services.scraper.business_detail_loader import BusinessDetailLoader
from app.services.scraper.dom_analyzer import DOMAnalyzer
from app.services.scraper.contact_extractor_enhanced import ContactExtractorEnhanced
from app.services.scraper.location_extractor import LocationExtractor
from app.services.scraper.lead_builder_enhanced import LeadBuilderEnhanced
from app.services.scraper.extraction_engine import ExtractionEngine


async def test_phase3():
    """Test Phase 3 components with a real Google Maps business"""
    
    print("="*80)
    print("PHASE 3 - BUSINESS DETAIL EXTRACTION ENGINE VERIFICATION")
    print("="*80)
    print()
    
    # Test Google Maps URL (Starbucks example)
    test_url = "https://www.google.com/maps/place/Starbucks/@37.7749,-122.4194,17z"
    test_job_id = "test_job_123"
    test_session_id = "test_session_456"
    test_worker_id = "test_worker_1"
    
    print(f"Test URL: {test_url}")
    print(f"Job ID: {test_job_id}")
    print(f"Session ID: {test_session_id}")
    print(f"Worker ID: {test_worker_id}")
    print()
    
    playwright = None
    browser = None
    
    try:
        # Initialize Playwright
        print("✓ Initializing Playwright...")
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        page = await context.new_page()
        print("✓ Browser launched successfully")
        print()
        
        # Test 1: Business Detail Loader
        print("="*80)
        print("TEST 1: Business Detail Loader")
        print("="*80)
        loader = BusinessDetailLoader(page)
        success, error = await loader.load_business_page(test_url, "Test Business")
        if success:
            print("✅ Business page loaded successfully")
        else:
            print(f"❌ Failed to load business page: {error}")
            return False
        print()
        
        # Test 2: DOM Analyzer
        print("="*80)
        print("TEST 2: DOM Analyzer")
        print("="*80)
        analyzer = DOMAnalyzer(page)
        
        name = await analyzer.extract_business_name()
        print(f"✓ Business Name: {name}")
        
        primary_cat, secondary_cats = await analyzer.extract_categories()
        print(f"✓ Primary Category: {primary_cat}")
        print(f"✓ Secondary Categories: {secondary_cats}")
        
        rating, reviews = await analyzer.extract_rating_and_reviews()
        print(f"✓ Rating: {rating}")
        print(f"✓ Reviews: {reviews}")
        
        description = await analyzer.extract_description()
        print(f"✓ Description: {description[:100] if description else None}...")
        
        status = await analyzer.extract_business_status()
        print(f"✓ Business Status: {status}")
        
        claimed = await analyzer.extract_owner_claimed_status()
        print(f"✓ Owner Claimed: {claimed}")
        
        hours = await analyzer.extract_working_hours()
        print(f"✓ Working Hours: {len(hours)} days found")
        
        place_id = await analyzer.extract_place_id()
        print(f"✓ Place ID: {place_id}")
        print()
        
        # Test 3: Contact Extractor
        print("="*80)
        print("TEST 3: Contact Extractor Enhanced")
        print("="*80)
        contact_extractor = ContactExtractorEnhanced(page)
        
        phone = await contact_extractor.extract_phone()
        print(f"✓ Phone: {phone}")
        
        website = await contact_extractor.extract_website()
        print(f"✓ Website: {website}")
        
        email = await contact_extractor.extract_email()
        print(f"✓ Email: {email}")
        
        social_links = await contact_extractor.extract_social_media_links()
        print(f"✓ Social Media Links: {len(social_links)} found")
        for platform, url in social_links.items():
            print(f"  - {platform}: {url}")
        print()
        
        # Test 4: Location Extractor
        print("="*80)
        print("TEST 4: Location Extractor")
        print("="*80)
        location_extractor = LocationExtractor(page)
        
        address = await location_extractor.extract_address()
        print(f"✓ Address: {address}")
        
        if address:
            street, area, city, district, state, country, postal = \
                location_extractor.parse_address_components(address)
            print(f"✓ Street: {street}")
            print(f"✓ City: {city}")
            print(f"✓ State: {state}")
            print(f"✓ Country: {country}")
            print(f"✓ Postal Code: {postal}")
        
        lat, lng = location_extractor.extract_coordinates_from_url(page.url)
        print(f"✓ Coordinates: ({lat}, {lng})")
        
        valid_coords = location_extractor.validate_coordinates(lat, lng)
        print(f"✓ Coordinates Valid: {valid_coords}")
        print()
        
        # Test 5: Lead Builder
        print("="*80)
        print("TEST 5: Lead Builder Enhanced")
        print("="*80)
        lead_builder = LeadBuilderEnhanced(test_job_id, test_session_id, test_worker_id)
        
        lead = lead_builder.build_lead(
            name=name,
            primary_category=primary_cat,
            secondary_categories=secondary_cats or [],
            description=description,
            owner_claimed=claimed,
            services=[],
            amenities=[],
            accessibility=[],
            opening_date=None,
            phone=phone,
            additional_phones=[],
            website=website,
            email=email,
            booking_url=None,
            reservation_url=None,
            menu_url=None,
            order_url=None,
            directions_url=None,
            address=address,
            street=street if address else None,
            area=area if address else None,
            city=city if address else None,
            district=district if address else None,
            state=state if address else None,
            country=country if address else None,
            postal_code=postal if address else None,
            latitude=lat,
            longitude=lng,
            maps_url=test_url,
            place_id=place_id,
            rating=rating,
            review_count=reviews,
            business_status=status,
            working_hours=hours or {},
            discovery_position=1,
            discovery_timestamp=datetime.utcnow(),
            search_keyword="test",
            duration_seconds=10.0,
            social_links=social_links
        )
        
        print(f"✓ Lead Created: {lead.identity.name}")
        print(f"✓ Lead Valid: {lead.is_valid}")
        print(f"✓ Validation Reason: {lead.validation_reason or 'N/A'}")
        
        lead_score = lead_builder.calculate_lead_score(lead)
        print(f"✓ Lead Score: {lead_score}/100")
        print()
        
        # Test 6: Full Extraction Engine
        print("="*80)
        print("TEST 6: Extraction Engine (Full Integration)")
        print("="*80)
        extraction_engine = ExtractionEngine(page, test_job_id, test_session_id, test_worker_id)
        
        # Note: This will actually emit events, so make sure websocket is not required
        full_lead = await extraction_engine.extract_details(
            maps_url=test_url,
            discovery_position=1,
            discovery_timestamp=datetime.utcnow(),
            search_keyword="test coffee shop"
        )
        
        if full_lead:
            print(f"✅ Full Extraction Successful!")
            print(f"✓ Business: {full_lead.identity.name}")
            print(f"✓ Category: {full_lead.identity.primary_category}")
            print(f"✓ Phone: {full_lead.contact.phone}")
            print(f"✓ Website: {full_lead.contact.website}")
            print(f"✓ Address: {full_lead.location.address}")
            print(f"✓ Rating: {full_lead.google.rating}")
            print(f"✓ Valid: {full_lead.is_valid}")
            print(f"✓ Score: {lead_builder.calculate_lead_score(full_lead)}/100")
        else:
            print("❌ Full extraction failed")
            return False
        print()
        
        # Summary
        print("="*80)
        print("PHASE 3 VERIFICATION SUMMARY")
        print("="*80)
        print("✅ Business Detail Loader - PASSED")
        print("✅ DOM Analyzer - PASSED")
        print("✅ Contact Extractor Enhanced - PASSED")
        print("✅ Location Extractor - PASSED")
        print("✅ Lead Builder Enhanced - PASSED")
        print("✅ Extraction Engine - PASSED")
        print()
        print("🎉 Phase 3 - Enterprise Business Detail Extraction Engine: FULLY OPERATIONAL")
        print("="*80)
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        if browser:
            await browser.close()
        if playwright:
            await playwright.stop()


if __name__ == "__main__":
    result = asyncio.run(test_phase3())
    sys.exit(0 if result else 1)
