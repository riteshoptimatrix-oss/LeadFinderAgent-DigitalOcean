"""
WhatsApp Campaign Builder — Unified API Routes

Endpoints:
  Templates   /templates            CRUD + duplicate + default toggle
  Leads       /leads                Valid-phone leads for campaign builder
  Campaigns   /campaigns            CRUD + start/pause/resume/cancel
  Preview     /preview              Live template preview
  Validation  /validate-template    Template validation
"""

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
import re

from app.db.database import get_db
from app.core.logger import logger
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.whatsapp import (
    WATemplateCreate, WATemplateUpdate, WATemplateResponse,
    WACampaignCreate, WACampaignResponse, WACampaignStatus, WAMessageStatus,
    WAMessageLogResponse, WACampaignHistoryResponse,
    WAPreviewRequest, WAPreviewResponse,
    WAValidateTemplateRequest, WAValidateTemplateResponse,
    WALeadResponse, PaginatedWALeadResponse,
    SUPPORTED_VARIABLES,
)

router = APIRouter()

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

VARIABLE_PATTERN = re.compile(r"\{\{(\w+)\}\}")
WA_MESSAGE_LIMIT = 4096

# Map template variable names → lead document fields
VARIABLE_TO_FIELD = {
    "business_name": "name",
    "owner": "name",       # falls back to business name
    "city": "city",
    "website": "website",
    "phone": "phone",
    "category": "category",
}


def _extract_variables(content: str) -> List[str]:
    """Extract all {{variable}} names from template content."""
    return list(set(VARIABLE_PATTERN.findall(content)))


def _render_template(content: str, lead: dict) -> str:
    """Replace {{variable}} placeholders with lead data."""
    def _replacer(match: re.Match) -> str:
        var_name = match.group(1)
        field_name = VARIABLE_TO_FIELD.get(var_name, var_name)
        value = lead.get(field_name)
        return str(value) if value else ""
    return VARIABLE_PATTERN.sub(_replacer, content)


def _normalize_e164(phone: Optional[str]) -> Optional[str]:
    """Normalize any phone number to E.164 (+<country><number>).

    Accepts +91XXXXXXXXXX, 91XXXXXXXXXX, XXXXXXXXXX (defaults to India +91),
    and strips spaces, hyphens, parentheses and duplicate prefixes.
    Returns None when the number cannot be a valid E.164 number.
    It NEVER rejects a valid Indian mobile number.
    """
    if not phone:
        return None
    cleaned = re.sub(r"[^\d+]", "", str(phone).strip())
    if not cleaned:
        return None
    digits = cleaned[1:] if cleaned.startswith("+") else cleaned
    # Strip international dialing prefix (00...)
    if digits.startswith("00"):
        digits = digits[2:]
    # Default India country code for 10-digit local numbers
    if len(digits) == 10:
        digits = "91" + digits
    # Valid E.164 numbers have 10-15 digits
    if not (10 <= len(digits) <= 15):
        return None
    return "+" + digits


def _is_valid_mobile(phone: Optional[str]) -> bool:
    """A phone is valid for WhatsApp if it can be normalized to E.164."""
    return _normalize_e164(phone) is not None


def _all_phones(lead: dict) -> List[str]:
    """Extract, normalize and deduplicate all valid phones for a lead."""
    raw_phones = []
    if lead.get("phone"):
        raw_phones.append(str(lead.get("phone")))
        
    cd = lead.get("contact_discovery") or {}
    if isinstance(cd, dict):
        if cd.get("primary_phone"): raw_phones.append(str(cd.get("primary_phone")))
        if isinstance(cd.get("secondary_phones"), list): raw_phones.extend([str(p) for p in cd.get("secondary_phones")])
        if isinstance(cd.get("whatsapp_numbers"), list): raw_phones.extend([str(p) for p in cd.get("whatsapp_numbers")])
        
    ai = lead.get("ai_analysis") or {}
    if isinstance(ai, dict):
        if isinstance(ai.get("phones"), list): raw_phones.extend([str(p) for p in ai.get("phones")])

    valid_phones = []
    for p in raw_phones:
        e164 = _normalize_e164(p)
        if e164 and e164 not in valid_phones:
            valid_phones.append(e164)
            
    return valid_phones


def _serialize_id(doc: dict) -> dict:
    """Convert ObjectId _id to string."""
    doc["_id"] = str(doc["_id"])
    return doc


async def _log_campaign_history(
    db: AsyncIOMotorDatabase,
    campaign_id: str,
    campaign_name: str,
    user_id: str,
    action: str,
    details: Optional[str] = None,
):
    """Write an entry to wa_campaign_history."""
    await db["wa_campaign_history"].insert_one({
        "campaign_id": campaign_id,
        "campaign_name": campaign_name,
        "user_id": user_id,
        "action": action,
        "details": details,
        "created_at": datetime.utcnow(),
    })


# ══════════════════════════════════════════════
#  TEMPLATES
# ══════════════════════════════════════════════

@router.get("/templates", response_model=List[WATemplateResponse])
async def list_templates(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = db["wa_templates"].find({"user_id": current_user.id}).sort("created_at", -1)
    templates = await cursor.to_list(length=None)
    for t in templates:
        _serialize_id(t)
        t.setdefault("variables_used", _extract_variables(t.get("content", "")))
    return templates


@router.post("/templates", response_model=WATemplateResponse)
async def create_template(
    data: WATemplateCreate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.utcnow()
    variables_used = _extract_variables(data.content)

    # If setting as default, unset any existing default
    if data.is_default:
        await db["wa_templates"].update_many(
            {"user_id": current_user.id, "is_default": True},
            {"$set": {"is_default": False}},
        )

    doc = {
        **data.model_dump(),
        "user_id": current_user.id,
        "variables_used": variables_used,
        "created_at": now,
        "updated_at": now,
    }
    result = await db["wa_templates"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return WATemplateResponse(**doc)


@router.get("/templates/{template_id}", response_model=WATemplateResponse)
async def get_template(
    template_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(template_id):
        raise HTTPException(400, "Invalid template ID")
    doc = await db["wa_templates"].find_one({"_id": ObjectId(template_id), "user_id": current_user.id})
    if not doc:
        raise HTTPException(404, "Template not found")
    _serialize_id(doc)
    doc.setdefault("variables_used", _extract_variables(doc.get("content", "")))
    return WATemplateResponse(**doc)


@router.put("/templates/{template_id}", response_model=WATemplateResponse)
async def update_template(
    template_id: str,
    data: WATemplateUpdate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(template_id):
        raise HTTPException(400, "Invalid template ID")

    update_fields: dict = {}
    for field, value in data.model_dump(exclude_unset=True).items():
        update_fields[field] = value

    if "content" in update_fields:
        update_fields["variables_used"] = _extract_variables(update_fields["content"])

    if update_fields.get("is_default"):
        await db["wa_templates"].update_many(
            {"user_id": current_user.id, "is_default": True},
            {"$set": {"is_default": False}},
        )

    update_fields["updated_at"] = datetime.utcnow()

    result = await db["wa_templates"].find_one_and_update(
        {"_id": ObjectId(template_id), "user_id": current_user.id},
        {"$set": update_fields},
        return_document=True,
    )
    if not result:
        raise HTTPException(404, "Template not found")
    _serialize_id(result)
    result.setdefault("variables_used", _extract_variables(result.get("content", "")))
    return WATemplateResponse(**result)


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(template_id):
        raise HTTPException(400, "Invalid template ID")
    result = await db["wa_templates"].delete_one(
        {"_id": ObjectId(template_id), "user_id": current_user.id}
    )
    if result.deleted_count == 0:
        raise HTTPException(404, "Template not found")
    return {"success": True}


@router.post("/templates/{template_id}/duplicate", response_model=WATemplateResponse)
async def duplicate_template(
    template_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(template_id):
        raise HTTPException(400, "Invalid template ID")
    original = await db["wa_templates"].find_one(
        {"_id": ObjectId(template_id), "user_id": current_user.id}
    )
    if not original:
        raise HTTPException(404, "Template not found")

    now = datetime.utcnow()
    new_doc = {
        "user_id": current_user.id,
        "name": f"{original['name']} (Copy)",
        "content": original["content"],
        "category": original.get("category", "General"),
        "is_default": False,
        "variables_used": original.get("variables_used", []),
        "created_at": now,
        "updated_at": now,
    }
    result = await db["wa_templates"].insert_one(new_doc)
    new_doc["_id"] = str(result.inserted_id)
    return WATemplateResponse(**new_doc)


@router.patch("/templates/{template_id}/default")
async def toggle_default_template(
    template_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(template_id):
        raise HTTPException(400, "Invalid template ID")
    doc = await db["wa_templates"].find_one(
        {"_id": ObjectId(template_id), "user_id": current_user.id}
    )
    if not doc:
        raise HTTPException(404, "Template not found")

    new_default = not doc.get("is_default", False)
    if new_default:
        await db["wa_templates"].update_many(
            {"user_id": current_user.id, "is_default": True},
            {"$set": {"is_default": False}},
        )
    await db["wa_templates"].update_one(
        {"_id": ObjectId(template_id)},
        {"$set": {"is_default": new_default, "updated_at": datetime.utcnow()}},
    )
    return {"success": True, "is_default": new_default}


# ══════════════════════════════════════════════
#  LEADS (for Campaign Builder)
# ══════════════════════════════════════════════

@router.get("/leads", response_model=PaginatedWALeadResponse)
async def get_wa_leads(
    search: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    sort_by: str = "created_at",
    sort_order: int = -1,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Return EVERY lead the caller can access that has a valid, WhatsApp-compatible
    phone number.

    Eligibility = valid phone + not opted-out + not blacklisted.
    Only leads that genuinely cannot receive WhatsApp are excluded — no lead with a
    valid phone number ever silently disappears.

    Scoping mirrors the Leads Directory: ADMIN users see all leads; other users see
    only their own. This fixes the bug where the WA module filtered by the caller's
    user_id unconditionally (so admin/imported/system leads never appeared).
    """
    # Scope identical to the Leads Directory endpoint.
    scope: dict = {} if current_user.role == "ADMIN" else {"user_id": current_user.id}

    query: dict = dict(scope)
    
    phone_cond = {
        "$or": [
            {"phone": {"$nin": [None, ""]}},
            {"contact_discovery.primary_phone": {"$nin": [None, ""]}},
            {"contact_discovery.secondary_phones.0": {"$exists": True}},
            {"contact_discovery.whatsapp_numbers.0": {"$exists": True}},
            {"ai_analysis.phones.0": {"$exists": True}},
        ]
    }
    
    and_conds = [phone_cond]

    if search:
        and_conds.append({
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"category": {"$regex": search, "$options": "i"}},
                {"address": {"$regex": search, "$options": "i"}},
            ]
        })
        
    query["$and"] = and_conds
    if status and status != "All":
        query["status"] = status
    if category:
        query["category"] = {"$regex": category, "$options": "i"}

    if date_from or date_to:
        date_filter: dict = {}
        if date_from:
            try:
                date_filter["$gte"] = datetime.fromisoformat(date_from)
            except ValueError:
                pass
        if date_to:
            try:
                date_filter["$lte"] = datetime.fromisoformat(date_to)
            except ValueError:
                pass
        if date_filter:
            query["created_at"] = date_filter

    # Hard eligibility exclusions — only explicitly opted-out / blacklisted leads.
    query["whatsapp_opted_out"] = {"$ne": True}
    query["blacklisted"] = {"$ne": True}

    # ── Diagnostics (Phase 7 & 9) ──────────────────────────────────────────
    db_total = await db["leads"].count_documents(scope)
    with_phone = await db["leads"].count_documents(
        {**scope, "phone": {"$nin": [None, ""]}}
    )

    pipeline = [
        {"$match": query},
        {"$sort": {sort_by: sort_order}},
    ]
    all_leads = await db["leads"].aggregate(pipeline).to_list(length=None)

    valid_leads: list = []
    rejected_invalid = 0
    rejected_duplicate = 0
    for lead in all_leads:
        lead_valid_phones = _all_phones(lead)
                
        if not lead_valid_phones:
            rejected_invalid += 1
            logger.warning(
                "WA_LEAD_REJECTED id=%s name=%s reason=no_valid_phones",
                lead.get("_id"), lead.get("name")
            )
            continue
            
        lead["phones"] = lead_valid_phones
        lead["phone"] = lead_valid_phones[0]  # Fallback for primary display
        valid_leads.append(lead)

    total = len(valid_leads)
    page_leads = valid_leads[skip: skip + limit]

    for lead in page_leads:
        lead["_id"] = str(lead["_id"])

    logger.info(
        "WA_LEADS_SUMMARY role=%s scope=%s db_total=%d with_phone=%d "
        "valid=%d rejected_invalid=%d rejected_duplicate=%d returned=%d",
        current_user.role, scope, db_total, with_phone,
        total, rejected_invalid, rejected_duplicate, len(page_leads),
    )

    return PaginatedWALeadResponse(
        data=[WALeadResponse(**l) for l in page_leads],
        total=total,
    )


# ══════════════════════════════════════════════
#  CAMPAIGNS
# ══════════════════════════════════════════════

@router.get("/campaigns", response_model=List[WACampaignResponse])
async def list_campaigns(
    skip: int = 0,
    limit: int = 50,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = (
        db["wa_campaigns"]
        .find({"user_id": current_user.id})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    campaigns = await cursor.to_list(length=None)
    for c in campaigns:
        _serialize_id(c)
    return campaigns


@router.post("/campaigns", response_model=WACampaignResponse)
async def create_campaign(
    data: WACampaignCreate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    # Validate template exists
    if not ObjectId.is_valid(data.template_id):
        raise HTTPException(400, "Invalid template ID")
    template = await db["wa_templates"].find_one(
        {"_id": ObjectId(data.template_id), "user_id": current_user.id}
    )
    if not template:
        raise HTTPException(404, "Template not found")

    if not data.lead_ids:
        raise HTTPException(400, "No leads selected")

    # Prevent duplicate automation jobs for the same leads
    active_jobs = await db["wa_campaigns"].find({
        "user_id": current_user.id,
        "status": {"$in": [WACampaignStatus.QUEUED, WACampaignStatus.RUNNING, "INITIALIZING"]},
    }).to_list(length=None)
    
    for job in active_jobs:
        job_leads = set(job.get("lead_ids", []))
        new_leads = set(data.lead_ids)
        if job_leads and new_leads.intersection(job_leads):
            raise HTTPException(400, "An active automation is already processing some of these leads.")

    now = datetime.utcnow()
    campaign_name = data.name if data.name else f"Automation {now.strftime('%Y-%m-%d %H:%M')}"
    
    campaign_doc = {
        "user_id": current_user.id,
        "name": campaign_name,
        "description": data.description,
        "template_id": data.template_id,
        "lead_source": data.lead_source,
        "lead_ids": data.lead_ids,
        "status": WACampaignStatus.QUEUED,
        "total_count": len(data.lead_ids),
        "sent_count": 0,
        "delivered_count": 0,
        "failed_count": 0,
        "read_count": 0,
        "created_at": now,
        "started_at": None,
        "completed_at": None,
    }
    result = await db["wa_campaigns"].insert_one(campaign_doc)
    campaign_id = str(result.inserted_id)
    campaign_doc["_id"] = campaign_id

    # Create message log entries for each lead
    log_entries = []
    for lead_id in data.lead_ids:
        if not ObjectId.is_valid(lead_id):
            continue
        lead_query: dict = {"_id": ObjectId(lead_id)}
        if current_user.role != "ADMIN":
            lead_query["user_id"] = current_user.id
        lead = await db["leads"].find_one(lead_query)
        if not lead:
            continue
        
        valid_phones = _all_phones(lead)
        if not valid_phones:
            continue
            
        e164 = valid_phones[0]

        rendered = _render_template(template["content"], lead)
        log_entries.append({
            "campaign_id": campaign_id,
            "user_id": current_user.id,
            "lead_id": lead_id,
            "lead_name": lead.get("name"),
            "recipient_phone": e164,
            "status": WAMessageStatus.PENDING,
            "rendered_message": rendered,
            "error_message": None,
            "retry_count": 0,
            "queued_at": now,
            "sent_at": None,
            "delivered_at": None,
            "read_at": None,
            "updated_at": now,
        })

    if log_entries:
        await db["wa_message_logs"].insert_many(log_entries)

    # Update actual total count (after validation)
    actual_count = len(log_entries)
    await db["wa_campaigns"].update_one(
        {"_id": ObjectId(campaign_id)},
        {"$set": {"total_count": actual_count}},
    )
    campaign_doc["total_count"] = actual_count

    await _log_campaign_history(
        db, campaign_id, data.name, current_user.id,
        "CREATED", f"Campaign created with {actual_count} leads",
    )

    return WACampaignResponse(**campaign_doc)


@router.get("/campaigns/history", response_model=List[WACampaignHistoryResponse])
async def get_campaign_history(
    skip: int = 0,
    limit: int = 50,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = (
        db["wa_campaign_history"]
        .find({"user_id": current_user.id})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    history = await cursor.to_list(length=None)
    for h in history:
        _serialize_id(h)
    return history


@router.get("/campaigns/{campaign_id}", response_model=WACampaignResponse)
async def get_campaign(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(campaign_id):
        raise HTTPException(400, "Invalid campaign ID")
    doc = await db["wa_campaigns"].find_one(
        {"_id": ObjectId(campaign_id), "user_id": current_user.id}
    )
    if not doc:
        raise HTTPException(404, "Campaign not found")
    _serialize_id(doc)
    return WACampaignResponse(**doc)


@router.get("/campaigns/{campaign_id}/logs", response_model=List[WAMessageLogResponse])
async def get_campaign_logs(
    campaign_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(campaign_id):
        raise HTTPException(400, "Invalid campaign ID")
    cursor = (
        db["wa_message_logs"]
        .find({"campaign_id": campaign_id, "user_id": current_user.id})
        .sort("queued_at", -1)
        .skip(skip)
        .limit(limit)
    )
    logs = await cursor.to_list(length=None)
    for l in logs:
        _serialize_id(l)
    return logs


@router.post("/campaigns/{campaign_id}/{action}")
async def campaign_action(
    campaign_id: str,
    action: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not ObjectId.is_valid(campaign_id):
        raise HTTPException(400, "Invalid campaign ID")

    valid_actions = {
        "start": WACampaignStatus.QUEUED,  # Changed to QUEUED, worker will change to RUNNING
        "pause": WACampaignStatus.PAUSED,
        "resume": WACampaignStatus.RUNNING,
        "cancel": WACampaignStatus.CANCELLED,
        "stop": WACampaignStatus.CANCELLED,  # Alias for cancel
    }
    if action not in valid_actions:
        raise HTTPException(400, f"Invalid action. Must be one of: {', '.join(valid_actions.keys())}")

    campaign = await db["wa_campaigns"].find_one(
        {"_id": ObjectId(campaign_id), "user_id": current_user.id}
    )
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    new_status = valid_actions[action]
    update_fields: dict = {"status": new_status}

    if action in ("start", "resume") and not campaign.get("started_at"):
        update_fields["started_at"] = datetime.utcnow()
    
    if action in ("cancel", "stop"):
        update_fields["completed_at"] = datetime.utcnow()

    await db["wa_campaigns"].update_one(
        {"_id": ObjectId(campaign_id)},
        {"$set": update_fields},
    )

    await _log_campaign_history(
        db, campaign_id, campaign["name"], current_user.id,
        action.upper(), f"Campaign status changed to {new_status}",
    )

    return {"success": True, "status": new_status}


@router.post("/campaigns/{campaign_id}/reset-queue")
async def reset_campaign_queue(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Reset campaign queue - allows all leads to be sent again.
    This resets message statuses to PENDING without deleting campaign history.
    """
    if not ObjectId.is_valid(campaign_id):
        raise HTTPException(400, "Invalid campaign ID")

    campaign = await db["wa_campaigns"].find_one(
        {"_id": ObjectId(campaign_id), "user_id": current_user.id}
    )
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    # Reset all message logs to PENDING status
    reset_result = await db["wa_message_logs"].update_many(
        {"campaign_id": campaign_id},
        {
            "$set": {
                "status": WAMessageStatus.PENDING,
                "error_message": None,
                "retry_count": 0,
                "sent_at": None,
                "delivered_at": None,
                "read_at": None,
                "updated_at": datetime.utcnow(),
            }
        }
    )

    # Reset campaign counters and set to DRAFT
    await db["wa_campaigns"].update_one(
        {"_id": ObjectId(campaign_id)},
        {
            "$set": {
                "status": WACampaignStatus.DRAFT,
                "sent_count": 0,
                "delivered_count": 0,
                "failed_count": 0,
                "read_count": 0,
                "started_at": None,
                "completed_at": None,
            }
        }
    )

    await _log_campaign_history(
        db, campaign_id, campaign["name"], current_user.id,
        "QUEUE_RESET", f"Queue reset - {reset_result.modified_count} messages reset to PENDING",
    )

    return {
        "success": True,
        "messages_reset": reset_result.modified_count,
        "status": WACampaignStatus.DRAFT
    }


@router.post("/campaigns/{campaign_id}/retry-failed")
async def retry_failed_messages(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Retry all permanently failed messages in a campaign.
    Resets their status to PENDING and clears retry count.
    """
    if not ObjectId.is_valid(campaign_id):
        raise HTTPException(400, "Invalid campaign ID")

    campaign = await db["wa_campaigns"].find_one(
        {"_id": ObjectId(campaign_id), "user_id": current_user.id}
    )
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    # Find failed messages
    await db["wa_message_logs"].count_documents({
        "campaign_id": campaign_id,
        "status": WAMessageStatus.FAILED
    })

    # Reset failed messages to PENDING
    retry_result = await db["wa_message_logs"].update_many(
        {
            "campaign_id": campaign_id,
            "status": WAMessageStatus.FAILED
        },
        {
            "$set": {
                "status": WAMessageStatus.PENDING,
                "error_message": None,
                "retry_count": 0,
                "updated_at": datetime.utcnow(),
            }
        }
    )

    # Update campaign counters
    await db["wa_campaigns"].update_one(
        {"_id": ObjectId(campaign_id)},
        {
            "$inc": {"failed_count": -retry_result.modified_count},
            "$set": {"status": WACampaignStatus.RUNNING}  # Resume if was stopped
        }
    )

    await _log_campaign_history(
        db, campaign_id, campaign["name"], current_user.id,
        "RETRY_FAILED", f"Retrying {retry_result.modified_count} failed messages",
    )

    return {
        "success": True,
        "messages_retrying": retry_result.modified_count,
        "status": WACampaignStatus.RUNNING
    }


@router.get("/campaigns/{campaign_id}/stats")
async def get_campaign_stats(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Get detailed statistics for a campaign including:
    - Message status breakdown
    - Success/failure rates
    - Average processing time
    - Estimated completion time
    """
    if not ObjectId.is_valid(campaign_id):
        raise HTTPException(400, "Invalid campaign ID")

    campaign = await db["wa_campaigns"].find_one(
        {"_id": ObjectId(campaign_id), "user_id": current_user.id}
    )
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    # Get message status breakdown
    pipeline = [
        {"$match": {"campaign_id": campaign_id}},
        {
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }
        }
    ]
    
    status_breakdown = await db["wa_message_logs"].aggregate(pipeline).to_list(length=None)
    status_counts = {item["_id"]: item["count"] for item in status_breakdown}

    # Calculate stats
    total_messages = sum(status_counts.values())
    sent_count = status_counts.get(WAMessageStatus.SENT, 0)
    failed_count = status_counts.get(WAMessageStatus.FAILED, 0)
    pending_count = sum([
        status_counts.get(WAMessageStatus.PENDING, 0),
        status_counts.get(WAMessageStatus.PREPARING, 0),
        status_counts.get(WAMessageStatus.OPENING_WHATSAPP, 0),
        status_counts.get(WAMessageStatus.SENDING, 0),
    ])
    skipped_count = status_counts.get(WAMessageStatus.SKIPPED, 0)

    # Calculate rates
    success_rate = (sent_count / total_messages * 100) if total_messages > 0 else 0
    failure_rate = (failed_count / total_messages * 100) if total_messages > 0 else 0

    # Calculate duration
    duration = None
    if campaign.get("started_at"):
        end_time = campaign.get("completed_at") or datetime.utcnow()
        duration = int((end_time - campaign["started_at"]).total_seconds())

    # Estimate completion time
    estimated_remaining = None
    if pending_count > 0 and sent_count > 0 and duration:
        avg_time_per_message = duration / sent_count
        estimated_remaining = int(avg_time_per_message * pending_count)

    return {
        "campaign_id": campaign_id,
        "campaign_name": campaign.get("name"),
        "status": campaign.get("status"),
        "total_messages": total_messages,
        "status_breakdown": status_counts,
        "sent": sent_count,
        "failed": failed_count,
        "pending": pending_count,
        "skipped": skipped_count,
        "success_rate": round(success_rate, 2),
        "failure_rate": round(failure_rate, 2),
        "duration_seconds": duration,
        "estimated_remaining_seconds": estimated_remaining,
        "started_at": campaign.get("started_at"),
        "completed_at": campaign.get("completed_at"),
    }


# ══════════════════════════════════════════════
#  PREVIEW
# ══════════════════════════════════════════════

@router.post("/preview", response_model=WAPreviewResponse)
async def preview_template(
    data: WAPreviewRequest,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    variables = _extract_variables(data.template_content)

    if data.lead_id and ObjectId.is_valid(data.lead_id):
        lead_query: dict = {"_id": ObjectId(data.lead_id)}
        if current_user.role != "ADMIN":
            lead_query["user_id"] = current_user.id
        lead = await db["leads"].find_one(lead_query)
    else:
        # Use first available lead with a phone as sample
        scope: dict = {} if current_user.role == "ADMIN" else {"user_id": current_user.id}
        lead = await db["leads"].find_one(
            {**scope, "phone": {"$nin": [None, ""]}}
        )

    if lead:
        rendered = _render_template(data.template_content, lead)
        return WAPreviewResponse(
            rendered_message=rendered,
            lead_name=lead.get("name"),
            variables_found=variables,
        )
    else:
        # No lead available – show placeholders
        sample = {
            "name": "Sample Business",
            "city": "Mumbai",
            "website": "www.example.com",
            "phone": "+91 98765 43210",
            "category": "Restaurant",
        }
        rendered = _render_template(data.template_content, sample)
        return WAPreviewResponse(
            rendered_message=rendered,
            lead_name="Sample Business",
            variables_found=variables,
        )


# ══════════════════════════════════════════════
#  VALIDATION
# ══════════════════════════════════════════════

@router.post("/validate-template", response_model=WAValidateTemplateResponse)
async def validate_template(
    data: WAValidateTemplateRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    errors: list = []
    warnings: list = []
    variables = _extract_variables(data.content)
    char_count = len(data.content)

    # Check empty
    if not data.content.strip():
        errors.append("Template content cannot be empty.")

    # Check length
    if char_count > WA_MESSAGE_LIMIT:
        errors.append(
            f"Template exceeds WhatsApp message limit ({char_count}/{WA_MESSAGE_LIMIT} characters)."
        )
    elif char_count > WA_MESSAGE_LIMIT * 0.9:
        warnings.append(
            f"Template is close to WhatsApp limit ({char_count}/{WA_MESSAGE_LIMIT} characters)."
        )

    # Check unsupported variables
    unsupported = [v for v in variables if v not in SUPPORTED_VARIABLES]
    if unsupported:
        errors.append(
            f"Unsupported variables: {', '.join('{{' + v + '}}' for v in unsupported)}. "
            f"Supported: {', '.join('{{' + v + '}}' for v in SUPPORTED_VARIABLES)}."
        )

    # Check malformed placeholders
    malformed = re.findall(r"\{[^{]*\}(?!\})", data.content)
    single_braces = [m for m in malformed if not m.startswith("{{")]
    if single_braces:
        warnings.append(
            "Possible malformed placeholders detected. Use double braces: {{variable_name}}."
        )

    return WAValidateTemplateResponse(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        variables_used=[v for v in variables if v in SUPPORTED_VARIABLES],
        character_count=char_count,
    )
