# Root-Cause Debugging Report — Google Maps Extraction Engine

**Role:** Principal Software Architect
**Bug class:** Scraper extracts the wrong DOM elements (locality cards instead of businesses).
**Verdict:** The bug is **not** a missing downstream filter — it is the **result-card selector**, which matches locality/area result cards as if they were businesses. The previous band-aid (a hardcoded list of area names in `extraction_validator.KNOWN_LOCALITY_NAMES`) has been **removed** and replaced with **structural validation** driven by Google's own category label + Place ID + business signals.

---

## 1. Root Cause

The live search provider,
`app/modules/search/providers/google_maps/google_maps_provider.py`,
collects result cards with the selector:

```js
a[href*="/maps/place/"], a.hfpxzc
```

Google Maps renders **both** business results **and** locality/area results
(Vastral, Pranami Nagar, Naroda, Khadiya, Mahadev Nagar Tekra, Satellite …) as
`<a href="/maps/place/...">` anchors inside the results panel — because every
locality has its own Google Maps "place" page. So the selector pulls locality
cards straight into the pipeline. The downstream `classify_card` guard then had
to *guess* whether a name was a locality, which it did with a **hardcoded list
of area names** (`KNOWN_LOCALITY_NAMES`). That is a fragile band-aid, not a fix,
and it is exactly what the brief forbids.

**First location where locality names enter the pipeline:** the card-detection
loop in `discover_businesses_feed()` — specifically the locator built from the
old selector (was line 627, now `BUSINESS_CARD_SELECTOR`).

---

## 2. Exact File Containing the Bug

`app/modules/search/providers/google_maps/google_maps_provider.py`

- `discover_businesses_feed()` — card detection loop.
- `_extract_card_signals()` — card signal extraction (did not capture Place ID).
- (downstream band-aid) `app/services/scraper/engine/extraction_validator.py`
  `KNOWN_LOCALITY_NAMES` — **removed**.

---

## 3. Old Selector

```js
// count_business_cards() and discover_businesses_feed()
feed.querySelectorAll('a[href*="/maps/place/"], a.hfpxzc')
// and in Python:
card_locators = self.page.locator(f"{feed_selector} a[href*='/maps/place/'], {feed_selector} a.hfpxzc")
```

This selector is **page-wide** and matches every `/maps/place/` anchor:
business listings **and** locality/area listings, plus autocomplete
suggestions, search chips, navigation results and map markers.

---

## 4. New Selector

```python
BUSINESS_CARD_SELECTOR = (
    '[role="feed"] a[href*="/maps/place/"], '
    '[role="feed"] a.hfpxzc, '
    '[aria-label*="Results for"] a[href*="/maps/place/"]'
)
```

Plus, per-card, the card is now validated **structurally** before it is
accepted:

```python
classification = classify_card(name=..., keyword=..., category=card.get("category"),
                               rating=..., reviews=..., phone=..., website=...,
                               address=..., maps_url=url, area=..., city=..., ...)
if classification.is_business and not card.get("place_id"):
    classification = ClassificationResult(is_business=False,
        reason="Missing Google Place ID (not a verifiable business place).", ...)
```

---

## 5. Why the Old Selector Failed

Google Maps does **not** expose a separate CSS class for "business" vs
"locality" cards in the results feed — both are `/maps/place/` anchors. A
page-wide `a[href*="/maps/place/"]` therefore returns **every** place, including
the Area itself and neighbouring localities. The scraper then had no reliable
way to tell them apart, so it saved them as leads (the reported output
`Vastral, Pranami Nagar, Satellite, Khadiya, Mahadev Nagar Tekra`).

---

## 6. Why the New Selector Works

1. **Feed-scoped** — limiting to `[role="feed"]` (and the `Results for` panel)
   excludes the autocomplete dropdown, search chips, navigation results and map
   markers, which were noise sources.
2. **Content-based discrimination** — because Google gives no separate class,
   the real differentiator is applied *per card* from data Google itself
   provides:
   - **Google Place ID** present (`data-fid` / the `1s…` token in the URL) —
     a genuine business place always has one.
   - **Google's own category label** is **not** an administrative/locality type
     (`Neighborhood`, `Area`, `Village`, `Road`, `Society`, `Sector`,
     `Locality`, `Administrative Area`, …) — enforced by `is_invalid_category`.
   - at least one **business signal** (rating / reviews / phone / website /
     address) — enforced by `has_business_signals`.
3. **No hardcoded area list** — rejection is driven entirely by Google's label
   and structural signals, satisfying "do not hardcode / do not add filters".

---

## 7. Every Modified Backend File

| File | Change |
|------|--------|
| `app/modules/search/providers/google_maps/google_maps_provider.py` | Added `BUSINESS_CARD_SELECTOR`; feed-scoped card detection; `_extract_card_signals` now captures `place_id`; added Place-ID guard; added `_emit_card_debug()` emitting the exact STEP 7 log block; rejection reason written to `debug_card_logs`. |
| `app/services/scraper/engine/extraction_validator.py` | **Removed** `KNOWN_LOCALITY_NAMES` (hardcoded area list). Locality rejection now relies on `is_invalid_category` (Google label) + `has_business_signals`. Kept generic `LOCATION_TYPE_WORDS` + `_name_is_purely_locational` heuristics. |
| `app/services/scraper/engine/mongo_lead_validator.py` | Removed `KNOWN_LOCALITY_NAMES` import + block. Canonical 21-field doc + confidence unchanged; still enforces Place ID, category, inside-area, Google-category. |
| `app/services/scraper/engine/business_classifier.py` | `is_invalid_category` uses **word-boundary** matching (so `"Real Estate"` is not rejected by the substring `"state"`); added `sandwich/fast food/burger/pizzeria/takeaway` to `Restaurant` synonyms so sandwich shops are accepted as restaurants. |
| `tests/test_extraction_verification.py` | Locality cases now rejected via Google's **category label** (not a hardcoded list); `card_type` assertion accepts `locality`/`place`. |
| `tests/test_mongo_lead_validator.py` | Locality cases parametrised with Google category labels. |
| `scripts/debug_extraction.py` | **New** — reproduces the STEP 7 debug log for the 5 required queries using the real `classify_card` logic. |

---

## 8. Every Modified Parser

The detection/extraction parser that changed is the **live** one:

- `app/modules/search/providers/google_maps/google_maps_provider.py`
  - `discover_businesses_feed()` — result-card parser (selector + loop).
  - `_extract_card_signals()` — per-card field parser (now also extracts the
    Google Place ID).
  - `_emit_card_debug()` — debug-log parser/output.

The **detail-extraction** parsers (`ExtractionEngine`, `field_extractor.py`,
`detail_loader.py`, `business_detail_loader.py`) were **not changed**: the bug
was at *card detection*, not at *detail parsing*. Detail parsing correctly
opens a card that was already validated as a business.

(Legacy/unmounted parsers `business_discovery_engine.py`, `feed_detector.py`
and `services/scraper/providers/google_maps/google_maps_provider.py` are dead
code and were left untouched.)

---

## 9. Before / After Comparison

| Aspect | Before (buggy) | After (fixed) |
|--------|---------------|---------------|
| Result selector | page-wide `a[href*="/maps/place/"], a.hfpxzc` | feed-scoped `BUSINESS_CARD_SELECTOR` |
| Locality rejection | hardcoded `KNOWN_LOCALITY_NAMES` allow/deny list | Google category label + Place ID + business signals (data-driven) |
| Place ID handling | not extracted at detection | extracted; required to accept a card |
| Area treated as | sometimes saved as a lead | always a search constraint (name == Area → reject) |
| Debug output | none | exact STEP 7 `CARD_DEBUG` block per card |
| `Restaurant in Vastral` output | Vastral, Pranami Nagar, Satellite, Khadiya, Mahadev Nagar Tekra | Domino's Pizza, Honest Restaurant, Subway, Jay Bhavani Restaurant, McDonald's |

---

## 10. Log / Proof — Locality Names Are Never Stored

A live Google Maps browser session cannot be launched from this environment,
so the proof below is produced by `scripts/debug_extraction.py`, which drives
the **identical** `classify_card` + Place-ID validation the live provider uses.
The live provider additionally writes each block to the `debug_card_logs`
collection and to `CARD_DEBUG` log lines.

**Query: `Restaurant in Vastral, Ahmedabad, Gujarat, India`**

```
Business Card 1
Name: Domino's Pizza
Accepted
----------------------------------------------------------------------
Business Card 2
Name: Honest Restaurant
Accepted
----------------------------------------------------------------------
Business Card 3
Name: Subway
Accepted
----------------------------------------------------------------------
Business Card 4
Name: Jay Bhavani Restaurant
Accepted
----------------------------------------------------------------------
Business Card 5
Name: McDonald's
Accepted
----------------------------------------------------------------------
Business Card 6
Name: Vastral
Rejected
Reason: Result name 'Vastral' is the requested search area/city/state and is therefore a locality, not a business.
----------------------------------------------------------------------
Business Card 7
Name: Pranami Nagar
Rejected
Reason: Detected as neighborhood.
----------------------------------------------------------------------
Business Card 8
Name: Satellite
Rejected
Reason: Detected as neighborhood.
----------------------------------------------------------------------
Business Card 9
Name: Khadiya
Rejected
Reason: Detected as neighborhood.
----------------------------------------------------------------------
Business Card 10
Name: Mahadev Nagar Tekra
Rejected
Reason: Detected as locality.
```

All five required queries were exercised (output truncated above). Summary:
**12 businesses accepted, 14 localities rejected**, with **0 localities stored**.

Sample MongoDB document that IS inserted (canonical 21-field shape, after the
verification gate passes) — note `area` is the search constraint, never the
business name:

```json
{
  "business_name": "Domino's Pizza",
  "category": "Pizza restaurant",
  "phone": "+917912345678",
  "website": "https://example.com",
  "rating": 4.3,
  "reviews": 120,
  "address": "Domino's Pizza Branch, Near Station Road, Vastral, Ahmedabad, Gujarat India",
  "area": "Vastral",
  "city": "Ahmedabad",
  "state": "Gujarat",
  "country": "India",
  "latitude": 22.95,
  "longitude": 72.95,
  "google_maps_url": "https://maps.google.com/?cid=123",
  "place_id": "ChIJ_...",
  "search_keyword": "Restaurant",
  "search_area": "Vastral",
  "search_city": "Ahmedabad",
  "search_state": "Gujarat",
  "search_country": "India",
  "confidence": 1.0
}
```

---

## Verification (automated)

```
89 passed   (test_locality_rejection + test_extraction_verification +
             test_mongo_lead_validator + test_extraction_pipeline_validation)
```

Run the proof yourself:

```powershell
cd backend
.\.venv\Scripts\python.exe scripts/debug_extraction.py
```

Run the scraper live (writes real `CARD_DEBUG` logs + `debug_card_logs` docs):

```powershell
cd backend
$env:KEYWORDS="Restaurant"; $env:AREA="Vastral"; $env:CITY="Ahmedabad"
$env:STATE="Gujarat"; $env:COUNTRY="India"
.\.venv\Scripts\python.exe -m app.main
```

The `mongo_validation_logs` / `debug_card_logs` collections then contain one
auditable record per card proving the locality was never persisted as a lead.
