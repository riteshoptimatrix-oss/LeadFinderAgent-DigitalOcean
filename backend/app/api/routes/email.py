"""
Enterprise Email Campaign Builder — Unified API Routes

Endpoints:
  Templates   /templates            CRUD + default toggle
  Leads       /leads                Valid-email leads for campaign builder
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
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.email_campaign import (
    EmailTemplateCreate, EmailTemplateUpdate, EmailTemplateResponse,
    EmailCampaignCreate, EmailCampaignResponse, EmailCampaignStatus, EmailMessageStatus,
    EmailMessageLogResponse, EmailCampaignHistoryResponse,
    EmailPreviewRequest, EmailPreviewResponse,
    EmailValidateTemplateRequest, EmailValidateTemplateResponse,
    EmailLeadResponse, PaginatedEmailLeadResponse, PaginatedEmailLogResponse,
    SUPPORTED_VARIABLES,
)

router = APIRouter()

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

VARIABLE_PATTERN = re.compile(r"\{\{(\w+)\}\}")

VARIABLE_TO_FIELD = {
    "business_name": "name",
    "company_name": "name",
    "contact_name": "name",
    "city": "city",
    "state": "state",
    "country": "country",
    "website": "website",
    "phone": "phone",
    "email": "email",
    "category": "category",
    "ai_score": "ai_score",
    "seo_score": "seo_score",
    "website_score": "website_score"
}


def _extract_variables(content: str) -> List[str]:
    return list(set(VARIABLE_PATTERN.findall(content or "")))


def _render_template(content: str, lead: dict) -> str:
    if not content:
        return ""
    def _replacer(match: re.Match) -> str:
        var_name = match.group(1)
        field_name = VARIABLE_TO_FIELD.get(var_name, var_name)
        value = lead.get(field_name)
        return str(value) if value else ""
    return VARIABLE_PATTERN.sub(_replacer, content)


EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def _is_valid_email(email: Optional[str]) -> bool:
    if not email:
        return False
    # Basic RFC 5322 regex
    return bool(EMAIL_REGEX.match(email.strip()))


def _all_emails(lead: dict) -> List[str]:
    raw_emails = []
    
    top = (lead.get("email") or "").strip()
    if top: raw_emails.append(top)
    
    cd = lead.get("contact_discovery") or {}
    if isinstance(cd, dict):
        if cd.get("primary_email"): raw_emails.append(str(cd.get("primary_email")))
        if isinstance(cd.get("emails"), list): raw_emails.extend([str(e) for e in cd.get("emails")])
        if isinstance(cd.get("all_emails"), list): raw_emails.extend([str(e) for e in cd.get("all_emails")])
        if isinstance(cd.get("secondary_emails"), list): raw_emails.extend([str(e) for e in cd.get("secondary_emails")])

    ai = lead.get("ai_analysis") or {}
    if isinstance(ai, dict):
        if isinstance(ai.get("emails"), list): raw_emails.extend([str(e) for e in ai.get("emails")])

    valid_emails = []
    for addr in raw_emails:
        clean = addr.strip().lower()
        if _is_valid_email(clean) and clean not in valid_emails:
            valid_emails.append(clean)
            
    return valid_emails


def _resolve_email_lead(lead: dict) -> dict:
    """Augment a raw lead document with the computed email-automation fields."""
    resolved = dict(lead)
    all_emails = _all_emails(lead)
    resolved["emails"] = all_emails
    resolved["email"] = all_emails[0] if all_emails else None
    resolved["company_name"] = lead.get("business_name") or lead.get("name")
    resolved["lead_source"] = lead.get("category")
    return resolved


def _serialize_id(doc: dict) -> dict:
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
    await db["email_campaign_history"].insert_one({
        "campaign_id": campaign_id,
        "campaign_name": campaign_name,
        "user_id": user_id,
        "action": action,
        "details": details,
        "created_at": datetime.utcnow()
    })


# ──────────────────────────────────────────────
# Templates API
# ──────────────────────────────────────────────

@router.get("/templates", response_model=List[EmailTemplateResponse])
async def get_templates(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    cursor = db["email_templates"].find({"user_id": current_user.id}).sort("created_at", -1)
    templates = await cursor.to_list(length=None)
    return [_serialize_id(t) for t in templates]


@router.post("/templates", response_model=EmailTemplateResponse)
async def create_template(
    data: EmailTemplateCreate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    if data.is_default:
        await db["email_templates"].update_many(
            {"user_id": current_user.id},
            {"$set": {"is_default": False}}
        )

    template_dict = data.model_dump()
    template_dict["user_id"] = current_user.id
    template_dict["variables_used"] = _extract_variables(data.subject + " " + data.html_content)
    template_dict["created_at"] = datetime.utcnow()
    template_dict["updated_at"] = datetime.utcnow()

    res = await db["email_templates"].insert_one(template_dict)
    template_dict["_id"] = res.inserted_id
    return _serialize_id(template_dict)


@router.put("/templates/{template_id}", response_model=EmailTemplateResponse)
async def update_template(
    template_id: str,
    data: EmailTemplateUpdate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    if not ObjectId.is_valid(template_id):
        raise HTTPException(status_code=400, detail="Invalid Template ID")

    template = await db["email_templates"].find_one({
        "_id": ObjectId(template_id),
        "user_id": current_user.id
    })
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if data.is_default:
        await db["email_templates"].update_many(
            {"user_id": current_user.id},
            {"$set": {"is_default": False}}
        )

    update_data = data.model_dump(exclude_unset=True)
    if "subject" in update_data or "html_content" in update_data:
        subj = update_data.get("subject", template.get("subject", ""))
        html = update_data.get("html_content", template.get("html_content", ""))
        update_data["variables_used"] = _extract_variables(subj + " " + html)

    update_data["updated_at"] = datetime.utcnow()

    await db["email_templates"].update_one(
        {"_id": ObjectId(template_id)},
        {"$set": update_data}
    )

    updated_template = await db["email_templates"].find_one({"_id": ObjectId(template_id)})
    return _serialize_id(updated_template)


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    if not ObjectId.is_valid(template_id):
        raise HTTPException(status_code=400, detail="Invalid Template ID")

    result = await db["email_templates"].delete_one({
        "_id": ObjectId(template_id),
        "user_id": current_user.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
        
    return {"success": True}


# ──────────────────────────────────────────────
# Leads API
# ──────────────────────────────────────────────

@router.get("/leads", response_model=PaginatedEmailLeadResponse)
async def get_email_leads(
    page: int = 1,
    limit: int = 50,
    search: Optional[str] = None,
    category: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    # Only return leads that have a valid email format, either in the top-level
    # `email` field OR inside `contact_discovery.emails` (enrichment output).
    valid_email_cond = {
        "$or": [
            {"email": {"$regex": EMAIL_REGEX.pattern}},
            {"contact_discovery.emails": {"$elemMatch": {"$regex": EMAIL_REGEX.pattern}}},
            {"contact_discovery.all_emails": {"$elemMatch": {"$regex": EMAIL_REGEX.pattern}}},
            {"contact_discovery.primary_email": {"$regex": EMAIL_REGEX.pattern}},
            {"contact_discovery.secondary_emails": {"$elemMatch": {"$regex": EMAIL_REGEX.pattern}}},
            {"ai_analysis.emails": {"$elemMatch": {"$regex": EMAIL_REGEX.pattern}}},
        ]
    }
    
    query = {
        "user_id": current_user.id,
        **valid_email_cond
    }

    if search:
        search_cond = {
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"business_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"contact_discovery.emails": {"$elemMatch": {"$regex": search, "$options": "i"}}},
                {"contact_discovery.all_emails": {"$elemMatch": {"$regex": search, "$options": "i"}}},
                {"city": {"$regex": search, "$options": "i"}},
            ]
        }
        query = {
            "user_id": current_user.id,
            "$and": [valid_email_cond, search_cond]
        }

    if category and category != "All":
        query["category"] = category

    skip = (page - 1) * limit
    cursor = db["leads"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    leads = await cursor.to_list(length=None)
    total = await db["leads"].count_documents(query)

    return PaginatedEmailLeadResponse(
        data=[_serialize_id(_resolve_email_lead(lead)) for lead in leads],
        total=total
    )


# ──────────────────────────────────────────────
# Analytics Dashboard API
# ──────────────────────────────────────────────

from pydantic import BaseModel as _BaseModel

class EmailAnalyticsDashboard(_BaseModel):
    total_sent: int = 0
    total_opened: int = 0
    total_clicked: int = 0
    total_bounced: int = 0
    total_failed: int = 0
    total_queued: int = 0


@router.get("/analytics/dashboard", response_model=EmailAnalyticsDashboard)
async def get_email_analytics_dashboard(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Aggregate email message log counts for the analytics summary cards."""
    user_filter = {"user_id": current_user.id}

    pipeline = [
        {"$match": user_filter},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1}
        }}
    ]

    status_counts: dict[str, int] = {}
    async for doc in db["email_message_logs"].aggregate(pipeline):
        status_counts[doc["_id"]] = doc["count"]

    return EmailAnalyticsDashboard(
        total_sent=status_counts.get("SENT", 0),
        total_opened=0,
        total_clicked=0,
        total_bounced=status_counts.get("BOUNCED", 0),
        total_failed=status_counts.get("FAILED", 0),
        total_queued=status_counts.get("PENDING", 0) + status_counts.get("QUEUED", 0),
    )


# ──────────────────────────────────────────────
# Campaigns API
# ──────────────────────────────────────────────

@router.get("/campaigns", response_model=List[EmailCampaignResponse])
async def get_campaigns(
    status: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    query = {"user_id": current_user.id}
    if status and status != "All":
        query["status"] = status

    cursor = db["email_campaigns"].find(query).sort("created_at", -1)
    campaigns = await cursor.to_list(length=None)
    return [_serialize_id(c) for c in campaigns]


@router.post("/campaigns", response_model=EmailCampaignResponse)
async def create_campaign(
    data: EmailCampaignCreate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    if not data.lead_ids:
        raise HTTPException(status_code=400, detail="Must select at least one lead")

    template = await db["email_templates"].find_one({
        "_id": ObjectId(data.template_id),
        "user_id": current_user.id
    })
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    campaign_dict = {
        "user_id": current_user.id,
        "name": data.name,
        "description": data.description,
        "template_id": data.template_id,
        "status": EmailCampaignStatus.DRAFT.value,
        "total_count": len(data.lead_ids),
        "sent_count": 0,
        "failed_count": 0,
        "skipped_count": 0,
        "created_at": datetime.utcnow()
    }
    
    res = await db["email_campaigns"].insert_one(campaign_dict)
    campaign_id = str(res.inserted_id)
    campaign_dict["_id"] = res.inserted_id

    # Create message logs
    logs = []
    for lead_id_str in data.lead_ids:
        if not ObjectId.is_valid(lead_id_str): continue

        lead = await db["leads"].find_one({"_id": ObjectId(lead_id_str)})
        if not lead: continue

        all_emails = _all_emails(lead)
        # Defensive: never enqueue a lead without a valid email address.
        if not all_emails:
            continue
            
        recipient = all_emails[0]

        logs.append({
            "campaign_id": campaign_id,
            "user_id": current_user.id,
            "lead_id": lead_id_str,
            "lead_name": lead.get("name"),
            "recipient_email": recipient.lower().strip(),
            "status": EmailMessageStatus.PENDING.value,
            "retry_count": 0,
            "queued_at": datetime.utcnow()
        })
        
    if logs:
        await db["email_message_logs"].insert_many(logs)

    await _log_campaign_history(db, campaign_id, data.name, current_user.id, "CREATED", f"Created campaign with {len(logs)} leads")
    return _serialize_id(campaign_dict)


@router.get("/campaigns/{campaign_id}", response_model=EmailCampaignResponse)
async def get_campaign(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    if not ObjectId.is_valid(campaign_id):
        raise HTTPException(400)
        
    campaign = await db["email_campaigns"].find_one({
        "_id": ObjectId(campaign_id),
        "user_id": current_user.id
    })
    
    if not campaign:
        raise HTTPException(404, "Campaign not found")
        
    return _serialize_id(campaign)


@router.post("/campaigns/{campaign_id}/{action}")
async def campaign_action(
    campaign_id: str,
    action: str, # start, pause, resume, cancel
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    if not ObjectId.is_valid(campaign_id):
        raise HTTPException(400, "Invalid ID")

    campaign = await db["email_campaigns"].find_one({
        "_id": ObjectId(campaign_id),
        "user_id": current_user.id
    })
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    valid_actions = ["start", "pause", "resume", "cancel"]
    if action not in valid_actions:
        raise HTTPException(400, f"Action must be one of {valid_actions}")

    current_status = campaign.get("status")
    new_status = current_status
    details = ""

    if action == "start":
        if current_status != EmailCampaignStatus.DRAFT.value:
            raise HTTPException(400, "Only DRAFT campaigns can be started.")
            
        settings = await db["settings"].find_one({"user_id": current_user.id})
        if not settings or not settings.get("smtp_host"):
            raise HTTPException(400, "SMTP is not configured. Please configure SMTP in Settings.")
            
        new_status = EmailCampaignStatus.QUEUED.value
        details = "Campaign queued for sending."
        
    elif action == "pause":
        if current_status not in [EmailCampaignStatus.QUEUED.value, EmailCampaignStatus.RUNNING.value]:
            raise HTTPException(400, "Only running or queued campaigns can be paused.")
        new_status = EmailCampaignStatus.PAUSED.value
        details = "Campaign paused."
        
    elif action == "resume":
        if current_status != EmailCampaignStatus.PAUSED.value:
            raise HTTPException(400, "Only paused campaigns can be resumed.")
        new_status = EmailCampaignStatus.QUEUED.value
        details = "Campaign resumed and queued."
        
    elif action == "cancel":
        if current_status in [EmailCampaignStatus.COMPLETED.value, EmailCampaignStatus.CANCELLED.value]:
            raise HTTPException(400, "Campaign already finished.")
        new_status = EmailCampaignStatus.CANCELLED.value
        details = "Campaign cancelled by user."
        await db["email_message_logs"].update_many(
            {"campaign_id": campaign_id, "status": {"$in": [EmailMessageStatus.PENDING.value, EmailMessageStatus.RETRYING.value]}},
            {"$set": {"status": EmailMessageStatus.CANCELLED.value, "updated_at": datetime.utcnow()}}
        )

    updates = {"status": new_status}
    if action == "start" and not campaign.get("started_at"):
        updates["started_at"] = datetime.utcnow()
    if action == "cancel":
        updates["completed_at"] = datetime.utcnow()

    await db["email_campaigns"].update_one(
        {"_id": ObjectId(campaign_id)},
        {"$set": updates}
    )

    await _log_campaign_history(db, campaign_id, campaign.get("name"), current_user.id, action.upper(), details)
    return {"success": True, "new_status": new_status}


@router.get("/campaigns/{campaign_id}/logs", response_model=PaginatedEmailLogResponse)
async def get_campaign_logs(
    campaign_id: str,
    page: int = 1,
    limit: int = 50,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    if not ObjectId.is_valid(campaign_id):
        raise HTTPException(400)
        
    skip = (page - 1) * limit
    query = {"campaign_id": campaign_id, "user_id": current_user.id}
    
    cursor = db["email_message_logs"].find(query).sort("queued_at", -1).skip(skip).limit(limit)
    logs = await cursor.to_list(length=None)
    total = await db["email_message_logs"].count_documents(query)
    
    return PaginatedEmailLogResponse(
        data=[_serialize_id(l) for l in logs],
        total=total
    )


# ──────────────────────────────────────────────
# Preview & Validation API
# ──────────────────────────────────────────────

@router.post("/preview", response_model=EmailPreviewResponse)
async def preview_template(
    data: EmailPreviewRequest,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    lead = {}
    if data.lead_id and ObjectId.is_valid(data.lead_id):
        lead_doc = await db["leads"].find_one({"_id": ObjectId(data.lead_id), "user_id": current_user.id})
        if lead_doc:
            lead = lead_doc

    if not lead:
        # Dummy data
        lead = {
            "name": "Acme Corp",
            "city": "San Francisco",
            "state": "CA",
            "country": "USA",
            "website": "https://acmecorp.com",
            "email": "hello@acmecorp.com",
            "phone": "+1 555-0123",
            "category": "Technology",
            "ai_score": 95,
            "seo_score": 88,
            "website_score": 92
        }

    rendered_subject = _render_template(data.template_subject, lead)
    rendered_html = _render_template(data.template_html, lead)

    return EmailPreviewResponse(
        rendered_subject=rendered_subject,
        rendered_html=rendered_html,
        lead_name=lead.get("name"),
        variables_found=_extract_variables(data.template_subject + " " + data.template_html)
    )


@router.post("/validate-template", response_model=EmailValidateTemplateResponse)
async def validate_template(
    data: EmailValidateTemplateRequest,
):
    errors = []
    warnings = []
    
    vars_found = _extract_variables(data.subject + " " + data.html_content)
    
    for v in vars_found:
        if v not in SUPPORTED_VARIABLES:
            errors.append(f"Unsupported variable: {v}")

    if not data.subject.strip():
        errors.append("Subject cannot be empty")
        
    if not data.html_content.strip():
        errors.append("HTML Content cannot be empty")

    return EmailValidateTemplateResponse(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        variables_used=vars_found
    )
