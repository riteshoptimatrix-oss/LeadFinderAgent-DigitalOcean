import hashlib
import re
from app.db.database import get_db, db_instance
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

_PHONE_PLACEHOLDERS = ("null", "undefined", "n/a", "-", "unknown", "none", "--")


def _extract_phone_values(value):
    """Flatten a raw phone value (string, list, nested dict) into individual strings."""
    if isinstance(value, (list, tuple)):
        out = []
        for item in value:
            out.extend(_extract_phone_values(item))
        return out
    if isinstance(value, dict):
        out = []
        for v in value.values():
            out.extend(_extract_phone_values(v))
        return out
    if value is None:
        return []
    s = str(value).strip()
    return [s] if s else []


def _collect_phones(data: dict):
    """Collect every phone number from all phone-like keys into one list."""
    raw = []
    for k, v in data.items():
        if not isinstance(k, str):
            continue
        k_flat = k.lower().replace("_", "")
        if any(alias in k_flat for alias in ("phone", "mobile", "telephone", "tel", "whatsappnumber")):
            raw.extend(_extract_phone_values(v))
    seen = set()
    unique = []
    for v in raw:
        s = str(v).strip()
        if not s or s.lower() in _PHONE_PLACEHOLDERS:
            continue
        digits = re.sub(r"\D", "", s)
        if not digits:
            continue
        if digits.startswith("00") and len(digits) > 2:
            digits = digits[2:]
        if 7 <= len(digits) <= 15 and digits not in seen:
            seen.add(digits)
            unique.append(s)
    return unique


class Storage:
    """
    Handles database persistence for the Search Engine.
    Ensures strict deduplication and validation.
    """
    
    def _normalize_data(self, data: dict) -> dict:
        """Cleans and standardizes string fields."""
        normalized = {}
        for k, v in data.items():
            if isinstance(v, str):
                normalized[k] = v.strip()
            else:
                normalized[k] = v
        
        # Phone normalization: remove all non-digits for comparison
        if normalized.get('phone'):
            import re
            normalized['phone_digits'] = re.sub(r'\D', '', normalized['phone'])
            
        return normalized

    def _generate_fingerprint(self, data: dict) -> str:
        """Generates a stable SHA-256 fingerprint based on core identity fields."""
        core_string = f"{data.get('name', '')}|{data.get('address', '')}|{data.get('phone_digits', '')}".lower()
        return hashlib.sha256(core_string.encode('utf-8')).hexdigest()

    async def save_lead(self, job_id: str, raw_data: dict, area: str = None, city: str = None, state: str = None, country: str = None, user_id: str = None) -> str:
        """
        Saves an extracted business lead to the database.
        Returns one of: "INSERTED", "DUPLICATE", "ERROR".
        Uses MongoDB transactions if available.
        """
        db = get_db()
        if db is None:
            logger.error("[STORAGE] No database connection available.")
            return "ERROR"
            
        try:
            data = self._normalize_data(raw_data)
            fingerprint = self._generate_fingerprint(data)

            # Collect ALL discovered phone numbers into the standard `phones` array.
            phones = _collect_phones(data)
            phone = phones[0] if phones else None
            phone_digits = re.sub(r'\D', '', phone) if phone else None
            logger.info(
                f"PHONES_EXTRACTED: job={job_id} business={data.get('name')} "
                f"phones={phones} phone={phone}"
            )
            logger.info(
                f"LOCATION_EXTRACTED: job={job_id} business={data.get('name')} "
                f"location=({state} -> {city} -> {area}, {country})"
            )
            
            # Strict Deduplication Query
            # Matches against Google Maps URL, Phone (digits), Website, Coordinates, or exact Name + Address
            dup_query = {"$or": []}
            if data.get("url"): dup_query["$or"].append({"google_maps_url": data.get("url")})
            if phone_digits: dup_query["$or"].append({"phone_digits": phone_digits})
            if data.get("website"): dup_query["$or"].append({"website": data.get("website")})
            if data.get("coordinates"): dup_query["$or"].append({"coordinates": data.get("coordinates")})
            
            name = data.get("name")
            address = data.get("address")
            if name and address:
                dup_query["$or"].append({"name": name, "address": address})
                
            dup_query["$or"].append({"fingerprint": fingerprint})
            
            # Map the parsed data to the Lead model schema
            lead_doc = {
                "source_job_id": job_id,
                "user_id": user_id,
                "name": name,
                "company_name": name,
                "google_maps_url": data.get("url"),
                "category": data.get("category"),
                "rating": data.get("rating"),
                "reviews_count": data.get("reviews_count"),
                "website": data.get("website"),
                "phone": phone,
                "phones": phones,
                "phone_number": data.get("phone"),
                "phone_digits": data.get("phone_digits") or phone_digits,
                "address": address,
                "state": state,
                "city": city,
                "area": area,
                "country": country,
                "coordinates": data.get("coordinates"),
                "opening_hours": data.get("opening_hours", []),
                "images": data.get("images", []),
                "fingerprint": fingerprint,
                "source": "google_maps",
                "processing_status": "SAVED",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            
            # Execute with ClientSession (Transaction) if supported
            # For standalone mongo, this might fail, so we wrap it
            try:
                async with await db_instance.client.start_session() as session:
                    async with session.start_transaction():
                        existing = await db["leads"].find_one(dup_query, session=session)
                        if existing:
                            return "DUPLICATE"
                            
                        insert_res = await db["leads"].insert_one(lead_doc, session=session)
                        # Read-after-write verification
                        verify = await db["leads"].find_one({"_id": insert_res.inserted_id}, session=session)
                        if not verify:
                            raise Exception("Read-after-write verification failed")
                            
            except Exception as e:
                logger.debug(f"[STORAGE] Transaction failed (possible standalone DB), falling back to standard ops: {e}")
                existing = await db["leads"].find_one(dup_query)
                if existing:
                    return "DUPLICATE"
                    
                insert_res = await db["leads"].insert_one(lead_doc)
                verify = await db["leads"].find_one({"_id": insert_res.inserted_id})
                if not verify:
                    return "ERROR"
            
            logger.info(
                f"PHONES_SAVED: job={job_id} business={name} lead_id={insert_res.inserted_id} "
                f"phones={phones} phone={phone}"
            )
            logger.info(
                f"LOCATION_SAVED: job={job_id} business={name} "
                f"location=({state} -> {city} -> {area}, {country})"
            )
            
            return "INSERTED"
            
        except Exception as e:
            logger.error(f"[STORAGE] Failed to save lead: {e}")
            return "ERROR"
