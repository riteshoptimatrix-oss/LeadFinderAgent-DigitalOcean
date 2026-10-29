# Phase 3 - Business Detail Extraction Flow Diagram

## Complete Extraction Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PHASE 2 OUTPUT                              │
│                    Business URL Queue (MongoDB)                      │
│  {job_id, session_id, maps_url, name, position, status: PENDING}   │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                      EXTRACTION SCHEDULER                            │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ RESPONSIBILITIES:                                           │    │
│  │ • Assign businesses to workers                             │    │
│  │ • Prevent duplicate extraction                             │    │
│  │ • Manage retries (max 3)                                   │    │
│  │ • Track progress                                           │    │
│  │ • Recover stale assignments (300s timeout)                 │    │
│  │ • Balance workload                                         │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  assign_next_business(worker_id) → business or None                │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │   Worker assigned          │
                    │   Status: IN_PROGRESS      │
                    └─────────────┬──────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    BUSINESS DETAIL LOADER                            │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ LOADING STRATEGY:                                          │    │
│  │ 1. Navigate to Google Maps business URL                   │    │
│  │ 2. Wait for business panel (h1, div[role='main'])        │    │
│  │ 3. Wait for images to load                                │    │
│  │ 4. Wait for contact section                               │    │
│  │ 5. Ensure DOM stability (networkidle)                     │    │
│  │ 6. Dismiss overlays/popups                                │    │
│  │ 7. Scroll to trigger lazy loading                         │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  RETRY LOGIC: 3 attempts with exponential backoff (2s, 4s, 6s)     │
│                                                                      │
│  ✅ Success → Continue                                              │
│  ❌ Failure → Mark failed, retry if < 3 attempts                   │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │   Page loaded successfully │
                    │   Event: BUSINESS_OPENED   │
                    └─────────────┬──────────────┘
                                  ↓
        ┌─────────────────────────┴──────────────────────────┐
        │                                                      │
        ↓                                                      ↓
┌────────────────────┐                             ┌────────────────────┐
│   DOM ANALYZER     │                             │ CONTACT EXTRACTOR  │
│                    │                             │     ENHANCED       │
├────────────────────┤                             ├────────────────────┤
│ EXTRACTS:          │                             │ EXTRACTS:          │
│ • Name (4 strats)  │                             │ • Primary Phone    │
│ • Categories       │                             │ • Additional Phones│
│ • Rating & Reviews │                             │ • Website URL      │
│ • Description      │                             │ • Email Address    │
│ • Working Hours    │                             │ • Booking URL      │
│ • Business Status  │                             │ • Reservation URL  │
│ • Owner Claimed    │                             │ • Menu URL         │
│ • Opening Date     │                             │ • Order URL        │
│ • Services         │                             │ • Directions URL   │
│ • Amenities        │                             │ • Social Media     │
│ • Accessibility    │                             │   - Facebook       │
│ • Place ID         │                             │   - Instagram      │
│                    │                             │   - LinkedIn       │
│ EVENTS:            │                             │   - Twitter/X      │
│ • DETAILS_LOADING  │                             │   - YouTube        │
│                    │                             │   - Pinterest      │
│                    │                             │   - TikTok         │
│                    │                             │   - WhatsApp       │
│                    │                             │   - Telegram       │
│                    │                             │                    │
│                    │                             │ EVENTS:            │
│                    │                             │ • PHONE_FOUND      │
│                    │                             │ • WEBSITE_FOUND    │
│                    │                             │ • EMAIL_FOUND      │
│                    │                             │ • SOCIAL_FOUND     │
└────────────────────┘                             └────────────────────┘
        │                                                      │
        └─────────────────────────┬──────────────────────────┘
                                  ↓
                    ┌──────────────────────────┐
                    │   LOCATION EXTRACTOR     │
                    ├──────────────────────────┤
                    │ EXTRACTS:                │
                    │ • Full Address           │
                    │ • Street                 │
                    │ • Area                   │
                    │ • City                   │
                    │ • District               │
                    │ • State                  │
                    │ • Country                │
                    │ • Postal Code            │
                    │ • Latitude               │
                    │ • Longitude              │
                    │                          │
                    │ PARSES:                  │
                    │ • US ZIP codes           │
                    │ • UK Postcodes           │
                    │ • Canadian Postal        │
                    │                          │
                    │ VALIDATES:               │
                    │ • Coord ranges           │
                    │   Lat: -90 to 90        │
                    │   Lng: -180 to 180      │
                    │                          │
                    │ EVENTS:                  │
                    │ • ADDRESS_FOUND          │
                    └──────────────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │   All data extracted       │
                    └─────────────┬──────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    LEAD BUILDER ENHANCED                             │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ ASSEMBLY:                                                  │    │
│  │ 1. Create BusinessIdentity                                 │    │
│  │ 2. Create ContactInfo                                      │    │
│  │ 3. Create LocationInfo                                     │    │
│  │ 4. Create GoogleMetadata                                   │    │
│  │ 5. Create ExtractionMetadata                               │    │
│  │ 6. Assemble LeadObject                                     │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ VALIDATION (7 RULES):                                      │    │
│  │ 1. ✓ Business name required                                │    │
│  │ 2. ✓ At least one contact method                           │    │
│  │ 3. ✓ Valid website URL format                              │    │
│  │ 4. ✓ Valid rating range (1.0-5.0)                          │    │
│  │ 5. ✓ Valid coordinates                                     │    │
│  │ 6. ✓ Valid phone format                                    │    │
│  │ 7. ✓ Valid email format                                    │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ SCORING (0-100):                                           │    │
│  │ • Business Identity: 30 points                             │    │
│  │   - Name: 10, Category: 5, Description: 5,                │    │
│  │     Secondary Cats: 5, Owner Claimed: 5                   │    │
│  │ • Contact Info: 40 points                                  │    │
│  │   - Phone: 15, Website: 15, Email: 10                     │    │
│  │ • Location Info: 20 points                                 │    │
│  │   - Address: 10, Coordinates: 10                           │    │
│  │ • Google Metadata: 10 points                               │    │
│  │   - Rating: 5, Reviews > 0: 5                             │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  EVENTS:                                                            │
│  • VALIDATION_PENDING                                               │
│  • LEAD_CREATED (with score & validation status)                   │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │   Lead object complete     │
                    │   Event: LEAD_CREATED      │
                    └─────────────┬──────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    VALIDATED LEAD OBJECT                             │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ LeadObject (Pydantic Model)                                │    │
│  │ {                                                          │    │
│  │   identity: BusinessIdentity,                              │    │
│  │   contact: ContactInfo,                                    │    │
│  │   location: LocationInfo,                                  │    │
│  │   google: GoogleMetadata,                                  │    │
│  │   metadata: ExtractionMetadata,                            │    │
│  │   is_valid: bool,                                          │    │
│  │   validation_reason: Optional[str]                         │    │
│  │ }                                                          │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  STRONGLY TYPED ✓                                                   │
│  VALIDATED ✓                                                        │
│  SCORED ✓                                                           │
│  COMPLETE ✓                                                         │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │   Update scheduler         │
                    │   Event: EXTRACTION_       │
                    │          COMPLETED         │
                    └─────────────┬──────────────┘
                                  ↓
        ┌───────────────────────────────────────────────┐
        │                                               │
        ↓                                               ↓
┌────────────────┐                           ┌────────────────────┐
│  SUCCESS PATH  │                           │   FAILURE PATH     │
├────────────────┤                           ├────────────────────┤
│ • Mark as      │                           │ • Mark as FAILED   │
│   COMPLETED    │                           │ • Log error        │
│ • Store lead   │                           │ • Retry if < 3     │
│ • Update stats │                           │ • Update stats     │
│ • Emit events  │                           │ • Emit events      │
└────────────────┘                           └────────────────────┘
        │                                               │
        └───────────────────────┬───────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────────┐
│                     PHASE 4 READY                                    │
│            (Normalization, Deduplication, Persistence)               │
└──────────────────────────────────────────────────────────────────────┘
```

## Event Timeline Flow

```
Time    Event                   Component              Data
────────────────────────────────────────────────────────────────────
T+0s    BUSINESS_OPENED        Scheduler              {url}
T+0s    DETAILS_LOADING        Loader                 {url}
T+3s    PHONE_FOUND            ContactExtractor       {phone}
T+3s    WEBSITE_FOUND          ContactExtractor       {website}
T+4s    EMAIL_FOUND            ContactExtractor       {email}
T+4s    ADDRESS_FOUND          LocationExtractor      {address}
T+5s    SOCIAL_FOUND           ContactExtractor       {social: {...}}
T+5s    VALIDATION_PENDING     LeadBuilder            {name}
T+6s    LEAD_CREATED           LeadBuilder            {name, is_valid, score}
T+6s    EXTRACTION_COMPLETED   Engine                 {name, duration}
```

## Worker Pool Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    EXTRACTION SCHEDULER                        │
│                  (Central Coordinator)                         │
└────────────────────────────────────────────────────────────────┘
                    │           │           │
        ┌───────────┘           │           └───────────┐
        │                       │                       │
        ↓                       ↓                       ↓
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│   WORKER 1    │       │   WORKER 2    │       │   WORKER 3    │
├───────────────┤       ├───────────────┤       ├───────────────┤
│ Browser       │       │ Browser       │       │ Browser       │
│ Context       │       │ Context       │       │ Context       │
│ Page          │       │ Page          │       │ Page          │
├───────────────┤       ├───────────────┤       ├───────────────┤
│ Extraction    │       │ Extraction    │       │ Extraction    │
│ Engine        │       │ Engine        │       │ Engine        │
└───────────────┘       └───────────────┘       └───────────────┘
        │                       │                       │
        └───────────┐           │           ┌───────────┘
                    ↓           ↓           ↓
            ┌──────────────────────────────────┐
            │    BUSINESS URL QUEUE            │
            │    (MongoDB Collection)          │
            │  • PENDING    → Assign           │
            │  • IN_PROGRESS → Processing      │
            │  • COMPLETED   → Done            │
            │  • FAILED      → Retry/Skip      │
            └──────────────────────────────────┘
```

## Retry Flow Diagram

```
┌────────────┐
│ Extraction │
│  Attempt   │
└─────┬──────┘
      │
      ↓
    Success? ─Yes→ [COMPLETED] → Phase 4
      │
      No
      ↓
  Retry < 3? ─No→ [FAILED] → Log & Continue
      │
      Yes
      ↓
┌──────────────┐
│ Wait & Retry │
│ Backoff:     │
│ • Try 1: 2s  │
│ • Try 2: 4s  │
│ • Try 3: 6s  │
└──────────────┘
      │
      ↓
  [Try Again]
```

## Data Flow Diagram

```
Google Maps                                         MongoDB
Business Page                                       Database
    │                                                  │
    ↓                                                  ↓
[DOM Content]                                   [business_queue]
    │                                           status: PENDING
    │                                                  │
    │ ┌─────────────────────────────────────────────┘
    │ │
    ↓ ↓
[Extraction Engine]
    │
    ├─→ [DOM Analyzer] ─────→ [Business Data]
    │                              │
    ├─→ [Contact Extractor] ───→ [Contact Data]
    │                              │
    ├─→ [Location Extractor] ──→ [Location Data]
    │                              │
    └────────────────┬─────────────┘
                     ↓
              [Lead Builder]
                     │
                     ↓
             [Validation Rules]
                     │
                     ↓
              [Lead Object]
              {
                identity: {...},
                contact: {...},
                location: {...},
                google: {...},
                metadata: {...},
                is_valid: true,
                validation_reason: null
              }
                     │
                     ↓
              [Ready for Phase 4]
```

---

**Phase 3 Flow Diagrams Complete** ✅
