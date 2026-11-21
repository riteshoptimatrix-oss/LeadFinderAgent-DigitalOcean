import logging
import re
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import httpx
from bson.objectid import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

EASYADSERVER_API_URL = "https://easyadserver.com/api/lead_finder.php"


def extract_phone_components(raw_phone: str, default_country: str = "India") -> Tuple[str, str, str]:
    """
    Parse a raw phone string into (country_code, number, mobile).
    Mobile is formatted as +<country_code><number>.
    """
    if not raw_phone:
        return ("", "", "")
    
    raw = str(raw_phone).strip()
    # Normalize digits and leading +
    has_plus = raw.startswith("+")
    digits = re.sub(r"\D", "", raw)
    
    if not digits:
        return ("", "", "")
    
    if has_plus:
        # e.g. +919876543210
        if digits.startswith("91") and len(digits) >= 12:
            cc = "+91"
            num = digits[2:]
            return (cc, num, f"{cc}{num}")
        elif len(digits) > 10:
            # First 1 to 3 digits as country code
            cc_len = len(digits) - 10
            cc = f"+{digits[:cc_len]}"
            num = digits[cc_len:]
            return (cc, num, f"{cc}{num}")
        else:
            return ("+91", digits, f"+91{digits}")
            
    # No leading plus
    if len(digits) == 10:
        return ("+91", digits, f"+91{digits}")
    elif len(digits) == 11 and digits.startswith("0"):
        num = digits[1:]
        return ("+91", num, f"+91{num}")
    elif len(digits) == 12 and digits.startswith("91"):
        num = digits[2:]
        return ("+91", num, f"+91{num}")
    elif len(digits) > 10:
        cc_len = len(digits) - 10
        cc = f"+{digits[:cc_len]}"
        num = digits[cc_len:]
        return (cc, num, f"{cc}{num}")
    else:
        return ("+91", digits, f"+91{digits}")


def extract_pincode(address: Optional[str], lead: Dict[str, Any]) -> str:
    """Extract 6-digit postal code from lead or address."""
    if lead.get("pincode"):
        return str(lead.get("pincode")).strip()
    if address:
        match = re.search(r"\b([1-9][0-9]{5})\b", address)
        if match:
            return match.group(1)
    return ""


def map_lead_to_easyadserver_payload(lead: Dict[str, Any]) -> Dict[str, Any]:
    """
    Dynamically map a database lead document to the exact JSON payload format
    expected by https://easyadserver.com/api/lead_finder.php.
    """
    # Name mapping
    contact_disc = lead.get("contact_discovery") if isinstance(lead.get("contact_discovery"), dict) else {}
    name = (
        lead.get("name") or 
        lead.get("business_name") or 
        contact_disc.get("name") or 
        lead.get("category") or 
        "Business Lead"
    ).strip()

    # Phone mapping
    raw_phone = (
        lead.get("phone") or 
        lead.get("primary_phone") or 
        (lead.get("phones", [None])[0] if lead.get("phones") else None) or 
        lead.get("whatsapp_number") or 
        ""
    )
    country_code, number, mobile = extract_phone_components(raw_phone, default_country=lead.get("country", "India"))

    # Email mapping
    all_emails = lead.get("all_emails") or []
    email = (
        lead.get("email") or 
        lead.get("primary_email") or 
        (all_emails[0] if all_emails else "") or 
        ""
    ).strip()

    # Business / Company Name
    company_name = (lead.get("company_name") or lead.get("business_name") or lead.get("name") or "").strip()
    business_name = (lead.get("business_name") or lead.get("company_name") or lead.get("name") or "").strip()
    
    # Category / Keyword
    business_category = (lead.get("category") or lead.get("business_category") or lead.get("search_keyword") or "").strip()
    
    # Designation / Role
    designation = (lead.get("designation") or contact_disc.get("role") or "").strip()
    if not designation:
        designation = "Managing Director" if "director" in name.lower() else "Owner"

    # Website
    website = (lead.get("website") or "").strip()
    if website and not website.startswith("http"):
        website = f"https://{website}"

    # Address & Location
    address = (lead.get("address") or "").strip()
    city = (lead.get("city") or lead.get("area") or "").strip()
    state = (lead.get("state") or "").strip()
    country = (lead.get("country") or "India").strip()
    pincode = extract_pincode(address, lead)

    # Coordinates (supports top-level latitude/longitude or nested coordinates dict)
    coords = lead.get("coordinates") if isinstance(lead.get("coordinates"), dict) else {}
    lat_val = lead.get("latitude") or coords.get("latitude") or coords.get("lat")
    lng_val = lead.get("longitude") or coords.get("longitude") or coords.get("lng")
    lat_str = str(lat_val).strip() if lat_val is not None else ""
    lng_str = str(lng_val).strip() if lng_val is not None else ""

    # Google Location Map Link
    google_location = (lead.get("google_maps_url") or lead.get("source_url") or "").strip()
    if not google_location and lat_str and lng_str:
        google_location = f"https://maps.google.com/?q={lat_str},{lng_str}"

    return {
        "name": name,
        "country_code": country_code,
        "number": number,
        "mobile": mobile,
        "email": email,
        "company_name": company_name,
        "business_name": business_name,
        "business_category": business_category,
        "designation": designation,
        "website": website,
        "DOB": lead.get("DOB", ""),
        "address": address,
        "city": city,
        "state": state,
        "country": country,
        "pincode": pincode,
        "google_location": google_location,
        "latitude": lat_str,
        "longitude": lng_str,
        "status": "Active"
    }


def clean_api_token(token: str) -> str:
    """Ensure token is stripped of 'Bearer ' prefix if accidentally included."""
    if not token:
        return ""
    t = token.strip()
    if t.lower().startswith("bearer "):
        return t[7:].strip()
    return t


async def send_single_lead_to_easyadserver(
    lead: Dict[str, Any],
    token: str,
    db: AsyncIOMotorDatabase,
    user_id: str,
    user_email: str,
    client: Optional[httpx.AsyncClient] = None
) -> Dict[str, Any]:
    """
    Send one lead to the EasyAdServer API, record audit log, and update lead status.
    """
    lead_id_str = str(lead.get("_id", lead.get("id", "")))
    lead_name = lead.get("name") or lead.get("business_name") or "Unnamed Lead"
    
    cleaned_token = clean_api_token(token)
    if not cleaned_token:
        return {
            "success": False,
            "lead_id": lead_id_str,
            "name": lead_name,
            "error": "Missing EasyAdServer API token. Admin must configure token."
        }

    payload = map_lead_to_easyadserver_payload(lead)

    # Basic client-side check to provide helpful error
    if not payload["mobile"] and not payload["number"]:
        err_msg = "Lead does not have a valid mobile or phone number"
        logger.warning(f"EasyAdServer skip lead {lead_id_str}: {err_msg}")
        return {
            "success": False,
            "lead_id": lead_id_str,
            "name": lead_name,
            "error": err_msg
        }

    headers = {
        "Authorization": f"Bearer {cleaned_token}",
        "X-API-Key": cleaned_token,
        "Content-Type": "application/json",
        "User-Agent": "LeadFinderAgent/1.0"
    }

    should_close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=20.0)
        should_close_client = True

    now = datetime.now(timezone.utc)
    log_doc: Dict[str, Any] = {
        "lead_id": lead_id_str,
        "lead_name": lead_name,
        "user_id": str(user_id),
        "user_email": str(user_email),
        "api_endpoint": EASYADSERVER_API_URL,
        "timestamp": now,
    }

    try:
        response = await client.post(EASYADSERVER_API_URL, headers=headers, json=payload)
        status_code = response.status_code
        log_doc["status_code"] = status_code
        
        try:
            res_json = response.json()
        except Exception:
            res_json = {"raw": response.text}

        log_doc["response_body"] = res_json

        if status_code in (200, 201) and res_json.get("success") is True:
            action = res_json.get("action", "inserted")
            contact_id = res_json.get("contact_id")
            group_id = res_json.get("group_id")

            log_doc["status"] = "SUCCESS"
            log_doc["action"] = action
            log_doc["contact_id"] = contact_id

            # Update lead in database
            target_lead_query = {"_id": ObjectId(lead_id_str)} if ObjectId.is_valid(lead_id_str) else {"_id": lead_id_str}
            await db["leads"].update_one(
                target_lead_query,
                {"$set": {
                    "easyadserver_sent": True,
                    "easyadserver_sent_at": now,
                    "easyadserver_contact_id": contact_id,
                    "easyadserver_group_id": group_id,
                    "easyadserver_action": action,
                    "easyadserver_status": "SUCCESS",
                    "easyadserver_last_error": None
                }}
            )

            await db["easyadserver_logs"].insert_one(log_doc)

            return {
                "success": True,
                "lead_id": lead_id_str,
                "name": lead_name,
                "action": action,
                "contact_id": contact_id,
                "group_id": group_id,
                "message": f"Successfully {action} contact #{contact_id} in EasyAdServer"
            }
        else:
            err_msg = res_json.get("error") or res_json.get("message") or f"HTTP {status_code}: {response.text[:200]}"
            if "errors" in res_json and isinstance(res_json["errors"], dict):
                sub_errors = ", ".join(f"{k}: {v}" for k, v in res_json["errors"].items())
                err_msg = f"{err_msg} ({sub_errors})"

            log_doc["status"] = "FAILED"
            log_doc["error"] = err_msg

            target_lead_query = {"_id": ObjectId(lead_id_str)} if ObjectId.is_valid(lead_id_str) else {"_id": lead_id_str}
            await db["leads"].update_one(
                target_lead_query,
                {"$set": {
                    "easyadserver_status": "FAILED",
                    "easyadserver_last_error": err_msg,
                    "easyadserver_last_attempt": now
                }}
            )

            await db["easyadserver_logs"].insert_one(log_doc)

            return {
                "success": False,
                "lead_id": lead_id_str,
                "name": lead_name,
                "error": err_msg,
                "status_code": status_code
            }

    except Exception as exc:
        err_msg = str(exc)
        logger.exception(f"Error sending lead {lead_id_str} to EasyAdServer: {exc}")
        log_doc["status"] = "ERROR"
        log_doc["error"] = err_msg

        target_lead_query = {"_id": ObjectId(lead_id_str)} if ObjectId.is_valid(lead_id_str) else {"_id": lead_id_str}
        await db["leads"].update_one(
            target_lead_query,
            {"$set": {
                "easyadserver_status": "ERROR",
                "easyadserver_last_error": err_msg,
                "easyadserver_last_attempt": now
            }}
        )

        await db["easyadserver_logs"].insert_one(log_doc)

        return {
            "success": False,
            "lead_id": lead_id_str,
            "name": lead_name,
            "error": f"Network/Connection error: {err_msg}"
        }
    finally:
        if should_close_client and client:
            await client.aclose()


async def send_leads_batch(
    leads: List[Dict[str, Any]],
    token: str,
    db: AsyncIOMotorDatabase,
    user_id: str,
    user_email: str,
    skip_already_sent: bool = False
) -> Dict[str, Any]:
    """
    Send a batch of leads to EasyAdServer with concurrency control and duplicate prevention.
    """
    if not leads:
        return {
            "success": True,
            "total_requested": 0,
            "successful_count": 0,
            "failed_count": 0,
            "skipped_count": 0,
            "results": [],
            "message": "No leads provided to send."
        }

    leads_to_send = []
    skipped_leads = []

    for l in leads:
        if skip_already_sent and l.get("easyadserver_sent") is True:
            skipped_leads.append({
                "lead_id": str(l.get("_id", l.get("id"))),
                "name": l.get("name") or l.get("business_name") or "Lead",
                "status": "SKIPPED",
                "message": "Already sent to EasyAdServer previously."
            })
        else:
            leads_to_send.append(l)

    results: List[Dict[str, Any]] = []
    success_count = 0
    failed_count = 0

    semaphore = asyncio.Semaphore(5)

    async with httpx.AsyncClient(timeout=25.0) as client:
        async def _worker(lead_doc: Dict[str, Any]):
            nonlocal success_count, failed_count
            async with semaphore:
                res = await send_single_lead_to_easyadserver(
                    lead=lead_doc,
                    token=token,
                    db=db,
                    user_id=user_id,
                    user_email=user_email,
                    client=client
                )
                if res.get("success"):
                    success_count += 1
                else:
                    failed_count += 1
                return res

        batch_tasks = [_worker(lead) for lead in leads_to_send]
        sent_results = await asyncio.gather(*batch_tasks)
        results.extend(sent_results)

    # Append skipped
    results.extend(skipped_leads)

    return {
        "success": failed_count == 0,
        "total_requested": len(leads),
        "successful_count": success_count,
        "failed_count": failed_count,
        "skipped_count": len(skipped_leads),
        "results": results,
        "message": (
            f"Successfully processed {len(leads)} lead(s): "
            f"{success_count} sent successfully, {failed_count} failed"
            f"{f', {len(skipped_leads)} skipped' if skipped_leads else ''}."
        )
    }


async def dispatch_user_leads_to_easyadserver(
    db: AsyncIOMotorDatabase,
    user_id: str,
    user_email: Optional[str] = None,
    skip_already_sent: bool = True
) -> Dict[str, Any]:
    """
    Central helper for sending all eligible leads belonging to a user to EasyAdServer.
    Reused by both the manual Send button and the Auto Send scheduled background job.
    Duplicates are skipped automatically when skip_already_sent=True.
    """
    user_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
    user_doc = await db["users"].find_one(user_query)
    if not user_doc and user_email:
        user_doc = await db["users"].find_one({"email": {"$regex": f"^{re.escape(user_email)}$", "$options": "i"}})

    if not user_doc:
        logger.warning(f"[EAS_DISPATCH] User {user_id} not found in database.")
        return {"success": False, "message": "User not found"}

    actual_user_email = user_doc.get("email") or user_email or ""
    actual_user_id = str(user_doc.get("_id", user_id))

    if not user_doc.get("easyadserver_access"):
        logger.warning(f"[EAS_DISPATCH] EasyAdServer access not enabled for user {actual_user_email}.")
        return {"success": False, "message": "EasyAdServer access not enabled"}

    raw_token = user_doc.get("easyadserver_token", "")
    token = clean_api_token(raw_token)
    if not token:
        logger.warning(f"[EAS_DISPATCH] No valid EasyAdServer token for user {actual_user_email}.")
        return {"success": False, "message": "EasyAdServer API Token not configured"}

    conditions: List[Dict[str, Any]] = [
        {"user_id": actual_user_id},
        {"assigned_to": actual_user_id},
        {"assigned_user_email": {"$regex": f"^{re.escape(actual_user_email)}$", "$options": "i"}}
    ]
    if ObjectId.is_valid(actual_user_id):
        conditions.append({"user_id": ObjectId(actual_user_id)})
        conditions.append({"created_by": actual_user_id})
        conditions.append({"created_by": ObjectId(actual_user_id)})

    query = {
        "$and": [
            {"$or": conditions},
            {"visibility": {"$ne": "hidden"}}
        ]
    }

    leads_cursor = db["leads"].find(query)
    leads = await leads_cursor.to_list(length=3000)

    if not leads:
        return {
            "success": True,
            "total_requested": 0,
            "successful_count": 0,
            "failed_count": 0,
            "skipped_count": 0,
            "results": [],
            "message": "No matching leads found to dispatch."
        }

    return await send_leads_batch(
        leads=leads,
        token=token,
        db=db,
        user_id=actual_user_id,
        user_email=actual_user_email,
        skip_already_sent=skip_already_sent
    )

