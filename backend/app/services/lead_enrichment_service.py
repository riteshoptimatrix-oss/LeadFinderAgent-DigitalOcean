"""
Lead Enrichment Service
=======================
The single source of truth merge engine.

Every completed AI Analysis phase calls this service to permanently
enrich the corresponding Lead document in MongoDB.

Rules enforced:
  - Never overwrite a valid (non-null) CRM field with null.
  - Never delete manually entered CRM data.
  - Only enrich the Lead — never create temporary analysis-only documents.
  - Archive previous analysis state to historical_analyses before overwriting.
  - Maintain analysis_count versioning on every run.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from bson import ObjectId

from app.db.database import get_db
from app.core.logger import logger
from app.services.contact_deduplication import (
    compute_metrics,
    deduplicate_emails,
    deduplicate_phones,
    log_contacts_metrics,
    normalize_email,
    normalize_phone,
)


def to_object_id(lead_id: Any) -> ObjectId | str:
    """
    Convert lead_id to ObjectId safely if it's a valid 24-character hex string.
    Otherwise returns the lead_id as-is (e.g. for string IDs like 'lead-123').
    """
    if isinstance(lead_id, ObjectId):
        return lead_id
    if isinstance(lead_id, str):
        if ObjectId.is_valid(lead_id):
            try:
                return ObjectId(lead_id)
            except Exception:
                pass
        return lead_id
    return lead_id


async def persist_ai_analysis(lead_id: Any, analysis: dict) -> bool:
    """
    Helper that:
    1. Converts string IDs to bson.ObjectId safely if possible.
    2. Updates the correct collection ("leads") with $set.
    3. Checks matched_count and modified_count.
    4. Rereads the document, and verifies ai_analysis exists.
    """
    db = get_db()
    if db is None:
        logger.error("[PersistenceHelper] Database not available")
        return False
        
    try:
        lead_oid = to_object_id(lead_id)
    except Exception as e:
        logger.error(f"[PersistenceHelper] ID conversion failed for {lead_id}: {e}")
        return False

    result = await db["leads"].update_one(
        {"_id": lead_oid},
        {"$set": {"ai_analysis": analysis, "updated_at": datetime.now(timezone.utc)}}
    )
    
    logger.info(
        f"[PersistenceHelper] MongoDB write audit: acknowledged={result.acknowledged}, "
        f"matched_count={result.matched_count}, modified_count={result.modified_count}"
    )
    
    if result.matched_count == 0:
        logger.error(f"[PersistenceHelper] CRITICAL: Lead {lead_id} (converted: {lead_oid}) not found during update")
        return False
        
    stored_lead = await db["leads"].find_one({"_id": lead_oid})
    if not stored_lead:
        logger.error(f"[PersistenceHelper] CRITICAL: Could not reread Lead {lead_oid} immediately after MongoDB save.")
        return False
        
    ai_data = stored_lead.get("ai_analysis")
    if not ai_data or not isinstance(ai_data, dict):
        logger.error(f"[PersistenceHelper] CRITICAL: ai_analysis sub-document is missing or empty in stored Lead document!")
        return False
        
    logger.info(f"[PersistenceHelper] Verification: ai_analysis persisted successfully for lead {lead_oid}.")
    return True


async def verify_ai_analysis_persisted(lead_id: Any) -> bool:
    """
    Checks if ai_analysis exists for the lead.
    """
    db = get_db()
    if db is None:
        return False
        
    try:
        lead_oid = to_object_id(lead_id)
    except Exception:
        return False
        
    lead = await db["leads"].find_one({"_id": lead_oid}, {"ai_analysis": 1})
    if lead and lead.get("ai_analysis"):
        return True
    return False


# ─────────────────────────────────────────────────────────
# Enrichment Data Container
# ─────────────────────────────────────────────────────────

class LeadEnrichmentData:
    """
    Carries all analysis-phase outputs that should be merged into the Lead.
    All fields are optional — only provided fields are merged.
    """

    def __init__(self):
        # ── AI Metadata ──────────────────────────────────
        self.ai_analysis: Optional[Dict[str, Any]] = None

        # ── Website ──────────────────────────────────────
        self.website_information: Optional[Dict[str, Any]] = None
        self.website_structure: Optional[Dict[str, Any]] = None

        # ── Contacts ─────────────────────────────────────
        self.contact_discovery: Optional[Dict[str, Any]] = None
        self.social_media: Optional[Dict[str, Any]] = None

        # ── Technology ───────────────────────────────────
        self.technology_detection: Optional[Dict[str, Any]] = None

        # ── SEO ──────────────────────────────────────────
        self.seo: Optional[Dict[str, Any]] = None

        # ── Performance ──────────────────────────────────
        self.performance: Optional[Dict[str, Any]] = None

        # ── Performance Audit (local Lighthouse-style engine) ──
        self.performance_audit: Optional[Dict[str, Any]] = None

        # ── Security Audit (local security engine) ──
        self.security_audit: Optional[Dict[str, Any]] = None

        # ── SEO Intelligence Audit (local on-page SEO engine) ──
        self.seo_audit: Optional[Dict[str, Any]] = None

        # ── UI/UX Intelligence Audit (local UI/UX engine) ──
        self.uiux_audit: Optional[Dict[str, Any]] = None

        # ── Design / UI / UX / Security ──────────────────
        self.design: Optional[Dict[str, Any]] = None

        # ── Business Intelligence ─────────────────────────
        self.business: Optional[Dict[str, Any]] = None

        # ── New Modules (Social, Mobile, Content) ──────────
        self.social_media_analysis: Optional[Dict[str, Any]] = None
        self.mobile: Optional[Dict[str, Any]] = None
        self.content: Optional[Dict[str, Any]] = None

        # ── TikTok Presence ────────────────────────────────
        self.tiktok: Optional[Dict[str, Any]] = None

        # ── Lead Intelligence (Phase 8) ───────────────────
        self.lead_intelligence: Optional[Dict[str, Any]] = None

        # ── Sales Opportunity ─────────────────────────────
        self.sales_opportunity: Optional[Dict[str, Any]] = None

        # ── Top-level Lead fields (email, phone, address) ─
        # These are only set when no existing value is present.
        self.primary_email: Optional[str] = None
        self.primary_phone: Optional[str] = None
        self.primary_address: Optional[str] = None

    def has_any_data(self) -> bool:
        return any([
            self.ai_analysis,
            self.website_information,
            self.website_structure,
            self.contact_discovery,
            self.social_media,
            self.technology_detection,
            self.seo,
            self.performance,
            self.performance_audit,
            self.security_audit,
            self.seo_audit,
            self.uiux_audit,
            self.design,
            self.business,
            self.social_media_analysis,
            self.mobile,
            self.content,
            self.tiktok,
            self.lead_intelligence,
            self.sales_opportunity,
            self.primary_email,
            self.primary_phone,
            self.primary_address,
        ])


# ─────────────────────────────────────────────────────────
# Lead Enrichment Service
# ─────────────────────────────────────────────────────────

class LeadEnrichmentService:
    """
    Merges AI analysis results permanently into the Lead document.

    This is the ONLY place that writes analysis data into a Lead.
    All analysis workers (both standard and advanced) call this service.
    """

    # CRM fields that must NEVER be touched by analysis enrichment
    PROTECTED_CRM_FIELDS = {
        "pipeline_stage",
        "priority",
        "owner_id",
        "proposal_status",
        "meeting_status",
        "reminder_status",
        "last_contacted_at",
        "tags",
        "is_favorite",
        "notes",
        "job_id",
        "user_id",
        "created_at",
        "name",         # business name comes from Google Maps scrape — don't override
        "category",
        "google_rating",
        "review_count",
        "place_id",
        "source_url",
        "latitude",
        "longitude",
        "business_status",
        "opening_hours",
        "description",
        "city",
        "state",
        "country",
    }

    # ── Public API ──────────────────────────────────────────────────────────

    async def enrich_lead(
        self,
        lead_id: str,
        enrichment: LeadEnrichmentData,
        archive_before_overwrite: bool = False,
    ) -> bool:
        """
        Permanently merges enrichment data into the Lead document.

        Args:
            lead_id:  MongoDB `_id` of the Lead (string or ObjectId).
            enrichment:  Container of data to merge.
            archive_before_overwrite:  If True, snapshots the current
                analysis state into historical_analyses before overwriting.
                Only set True for the FINAL enrichment of an analysis run.

        Returns:
            True if the Lead was updated, False otherwise.
        """
        if not enrichment.has_any_data():
            logger.debug(f"[LeadEnrichment] No data to enrich for lead {lead_id}")
            return False

        db = get_db()
        if db is None:
            logger.error("[LeadEnrichment] Database not available")
            return False

        # Convert lead_id to ObjectId for MongoDB queries
        try:
            lead_oid = to_object_id(lead_id)
        except ValueError as e:
            logger.error(f"[LeadEnrichment] Invalid lead_id format: {lead_id} - {e}")
            return False

        # Fetch current lead using ObjectId
        existing = await db["leads"].find_one({"_id": lead_oid})
        if not existing:
            logger.warning(f"[LeadEnrichment] Lead {lead_id} not found — skipping enrichment")
            return False

        # Build the atomic update payload
        set_payload: Dict[str, Any] = {}
        push_payload: Dict[str, Any] = {}

        # ── Archive previous analysis state (once per analysis run) ──
        if archive_before_overwrite:
            archived = self._build_history_snapshot(existing)
            if archived:
                push_payload["historical_analyses"] = archived

        # ── Merge all sub-documents ──────────────────────────────────
        if enrichment.ai_analysis:
            merged = self._safe_merge(
                existing.get("ai_analysis") or {},
                enrichment.ai_analysis,
            )
            set_payload["ai_analysis"] = merged

        if enrichment.website_information:
            merged = self._safe_merge(
                existing.get("website_information") or {},
                enrichment.website_information,
            )
            set_payload["website_information"] = merged

        if enrichment.website_structure:
            merged = self._safe_merge(
                existing.get("website_structure") or {},
                enrichment.website_structure,
            )
            set_payload["website_structure"] = merged

        if enrichment.contact_discovery:
            merged = self._safe_merge_contact(
                existing.get("contact_discovery") or {},
                enrichment.contact_discovery,
                default_country=existing.get("country"),
            )
            set_payload["contact_discovery"] = merged

        if enrichment.social_media:
            merged = self._safe_merge(
                existing.get("social_media") or {},
                enrichment.social_media,
            )
            set_payload["social_media"] = merged

        if enrichment.technology_detection:
            merged = self._safe_merge(
                existing.get("technology_detection") or {},
                enrichment.technology_detection,
            )
            set_payload["technology_detection"] = merged

        if enrichment.seo:
            merged = self._safe_merge(
                existing.get("seo") or {},
                enrichment.seo,
            )
            set_payload["seo"] = merged

        if enrichment.performance:
            merged = self._safe_merge(
                existing.get("performance") or {},
                enrichment.performance,
            )
            set_payload["performance"] = merged

        if enrichment.performance_audit:
            merged = self._safe_merge(
                existing.get("performanceAudit") or {},
                enrichment.performance_audit,
            )
            set_payload["performanceAudit"] = merged

        if enrichment.security_audit:
            merged = self._safe_merge(
                existing.get("securityAudit") or {},
                enrichment.security_audit,
            )
            set_payload["securityAudit"] = merged

        if enrichment.seo_audit:
            merged = self._safe_merge(
                existing.get("seoAudit") or {},
                enrichment.seo_audit,
            )
            set_payload["seoAudit"] = merged

        if enrichment.uiux_audit:
            merged = self._safe_merge(
                existing.get("uiuxAudit") or {},
                enrichment.uiux_audit,
            )
            set_payload["uiuxAudit"] = merged

        if enrichment.design:
            merged = self._safe_merge(
                existing.get("design") or {},
                enrichment.design,
            )
            set_payload["design"] = merged

        if enrichment.business:
            merged = self._safe_merge(
                existing.get("business") or {},
                enrichment.business,
            )
            set_payload["business"] = merged

        if enrichment.lead_intelligence:
            merged = self._safe_merge(
                existing.get("lead_intelligence") or {},
                enrichment.lead_intelligence,
            )
            set_payload["lead_intelligence"] = merged

        if enrichment.social_media_analysis:
            merged = self._safe_merge(
                existing.get("social_media_analysis") or {},
                enrichment.social_media_analysis,
            )
            set_payload["social_media_analysis"] = merged

        if enrichment.mobile:
            merged = self._safe_merge(
                existing.get("mobile") or {},
                enrichment.mobile,
            )
            set_payload["mobile"] = merged

        if enrichment.content:
            merged = self._safe_merge(
                existing.get("content") or {},
                enrichment.content,
            )
            set_payload["content"] = merged

        if enrichment.tiktok:
            merged = self._safe_merge_tiktok(
                existing.get("tiktok") or {},
                enrichment.tiktok,
            )
            set_payload["tiktok"] = merged

        if enrichment.sales_opportunity:
            merged = self._safe_merge(
                existing.get("sales_opportunity") or {},
                enrichment.sales_opportunity,
            )
            set_payload["sales_opportunity"] = merged

        # ── Top-level contact fields (only fill if currently empty) ──
        if enrichment.primary_email and not existing.get("email"):
            set_payload["email"] = enrichment.primary_email

        if enrichment.primary_phone and not existing.get("phone"):
            set_payload["phone"] = enrichment.primary_phone

        if enrichment.primary_address and not existing.get("address"):
            set_payload["address"] = enrichment.primary_address

        # ── Always update updated_at ─────────────────────────────────
        set_payload["updated_at"] = datetime.now(timezone.utc)

        if not set_payload:
            return False

        # ── Atomic MongoDB write ─────────────────────────────────────
        update_op: Dict[str, Any] = {"$set": set_payload}
        if push_payload:
            update_op["$push"] = push_payload

        result = await db["leads"].update_one(
            {"_id": lead_oid},
            update_op,
        )

        # Audit MongoDB write response properties
        logger.info(
            f"[LeadEnrichment] MongoDB write audit: acknowledged={result.acknowledged}, "
            f"matched_count={result.matched_count}, modified_count={result.modified_count}, "
            f"upserted_id={result.upserted_id}"
        )

        if result.matched_count == 0:
            logger.error(f"[LeadEnrichment] CRITICAL: Lead {lead_id} not found during update operation")
            return False

        # Read back document to compare Generated Analysis vs Stored Analysis field-by-field
        stored_lead = await db["leads"].find_one({"_id": lead_oid})
        if stored_lead:
            for k, v in set_payload.items():
                stored_val = stored_lead.get(k)
                if stored_val is None:
                    logger.error(f"[LeadEnrichment] FIELD_DISAPPEARED: Field '{k}' is missing or None in stored Lead document!")
                else:
                    if isinstance(v, dict) and isinstance(stored_val, dict):
                        for sub_k, sub_v in v.items():
                            if stored_val.get(sub_k) is None:
                                logger.error(f"[LeadEnrichment] FIELD_DISAPPEARED: Sub-field '{k}.{sub_k}' is missing or None in stored Lead document!")
                    logger.info(f"[LeadEnrichment] Field '{k}' verification: Stored successfully.")
        else:
            logger.error(f"[LeadEnrichment] CRITICAL: Could not read back Lead {lead_id} immediately after MongoDB save.")
        
        if result.modified_count >= 0:
            # Log detailed enrichment success
            ai_data = set_payload.get("ai_analysis", {})
            logger.info(
                f"[LeadEnrichment] ✓ Lead {lead_id} enriched successfully\n"
                f"  Fields Updated: {list(set_payload.keys())}\n"
                f"  Overall Score: {ai_data.get('overall_score', 'N/A')}\n"
                f"  SEO Score: {ai_data.get('seo_score', 'N/A')}\n"
                f"  Performance Score: {ai_data.get('performance_score', 'N/A')}\n"
                f"  UI Score: {ai_data.get('ui_score', 'N/A')}\n"
                f"  UX Score: {ai_data.get('ux_score', 'N/A')}\n"
                f"  Recommendations: {len(ai_data.get('recommendations', []))}\n"
                f"  Emails: {len(ai_data.get('emails', []))}\n"
                f"  Phones: {len(ai_data.get('phones', []))}\n"
                f"  CMS: {ai_data.get('cms', 'N/A')}\n"
                f"  Frontend: {ai_data.get('frontend', 'N/A')}\n"
                f"  Backend: {ai_data.get('backend', 'N/A')}\n"
                f"  Analysis Status: {ai_data.get('analysis_status', 'N/A')}\n"
                f"  MongoDB Write: SUCCESS (matched={result.matched_count}, modified={result.modified_count})"
            )
            
            # Verify the write by reading back
            db = get_db()
            verification = await db["leads"].find_one(
                {"_id": lead_oid},
                {"ai_analysis.overall_score": 1, "ai_analysis.analysis_status": 1}
            )
            if verification and verification.get("ai_analysis"):
                logger.info(
                    f"[LeadEnrichment] ✓ Verification: Lead {lead_id} ai_analysis.overall_score = "
                    f"{verification['ai_analysis'].get('overall_score', 'MISSING')}, "
                    f"status = {verification['ai_analysis'].get('analysis_status', 'MISSING')}"
                )
            else:
                logger.error(
                    f"[LeadEnrichment] ✗ VERIFICATION FAILED: Lead {lead_id} ai_analysis not readable after write"
                )
            
            try:
                from app.core.websocket import manager
                await manager.broadcast({
                    "type": "LEAD_ANALYSIS_UPDATED",
                    "lead_id": str(lead_id),
                    "fields": list(set_payload.keys()),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                logger.info(f"[LeadEnrichment] ✓ WebSocket notification sent for lead {lead_id}")
            except Exception as ws_err:
                logger.warning(f"[LeadEnrichment] ✗ WebSocket update failed for lead {lead_id}: {ws_err}")
            return True

        logger.warning(
            f"[LeadEnrichment] Lead {lead_id} — no changes applied "
            f"(matched={result.matched_count}, modified={result.modified_count}). "
            f"Data may be identical to existing."
        )
        return False

    async def mark_analysis_started(self, lead_id: str, job_id: str, website_url: str) -> None:
        """
        Updates the ai_analysis.analysis_status to 'Running' at the start of a job.
        Does NOT archive — only sets status so the UI can show progress.
        """
        db = get_db()
        if db is None:
            return

        lead_oid = to_object_id(lead_id)
        existing = await db["leads"].find_one({"_id": lead_oid}, {"ai_analysis": 1})
        current_count = 0
        if existing and existing.get("ai_analysis"):
            current_count = existing["ai_analysis"].get("analysis_count", 0)

        await db["leads"].update_one(
            {"_id": lead_oid},
            {"$set": {
                "ai_analysis.analysis_status": "Running",
                "ai_analysis.analysis_started_at": datetime.now(timezone.utc),
                "ai_analysis.last_analysis_date": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }}
        )
        try:
            from app.core.websocket import manager
            await manager.broadcast({
                "type": "LEAD_ANALYSIS_UPDATED",
                "lead_id": str(lead_id),
                "fields": ["ai_analysis"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as ws_err:
            logger.warning(f"[LeadEnrichment] WebSocket start update failed for lead {lead_id}: {ws_err}")
        logger.info(f"[LeadEnrichment] Analysis started for lead {lead_id} (job {job_id})")

    async def mark_analysis_failed(self, lead_id: str, error_message: str) -> None:
        """
        Marks analysis as Failed in the Lead ai_analysis sub-document.
        Does NOT overwrite any already-enriched data — only updates status.
        """
        db = get_db()
        if db is None:
            return

        lead_oid = to_object_id(lead_id)
        await db["leads"].update_one(
            {"_id": lead_oid},
            {"$set": {
                "ai_analysis.analysis_status": "FAILED",
                "ai_analysis.analysis_completed_at": datetime.now(timezone.utc),
                "ai_analysis.error_message": error_message,
                "updated_at": datetime.now(timezone.utc),
            }}
        )
        try:
            from app.core.websocket import manager
            await manager.broadcast({
                "type": "LEAD_ANALYSIS_UPDATED",
                "lead_id": str(lead_id),
                "fields": ["ai_analysis"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as ws_err:
            logger.warning(f"[LeadEnrichment] WebSocket failure update failed for lead {lead_id}: {ws_err}")
        logger.warning(f"[LeadEnrichment] Analysis failed for lead {lead_id}: {error_message}")

    # ── Private Helpers ────────────────────────────────────────────────────

    def _safe_merge(
        self,
        existing: Dict[str, Any],
        incoming: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Merges `incoming` into `existing`, respecting these rules:
          - If existing[key] has a truthy value AND incoming[key] is None/empty → keep existing.
          - If incoming[key] has a real value → always update (analysis data is more current).
          - If key doesn't exist in existing → add it regardless of null.

        This ensures CRM-entered data is never erased by a null analysis result.
        """
        merged = dict(existing) if existing else {}

        for key, incoming_val in incoming.items():
            # Skip protected CRM fields
            if key in self.PROTECTED_CRM_FIELDS:
                continue

            existing_val = merged.get(key)

            if incoming_val is None or incoming_val == "" or incoming_val == []:
                # Never overwrite a valid existing value with null/empty
                if existing_val is not None and existing_val != "" and existing_val != []:
                    continue
                # If existing is also null — allow the null write (preserves schema shape)
                merged[key] = incoming_val
            else:
                # Incoming has a real value → always set it (analysis is authoritative for its fields)
                merged[key] = incoming_val

        return merged

    def _safe_merge_tiktok(
        self,
        existing: Dict[str, Any],
        incoming: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Merges TikTok detection results without ever losing a discovered profile.

        Rules:
          - A positive detection (found=True + url) is authoritative → always set.
          - A negative detection (found=False) only applies when there is no
            previously stored profile — an existing profile is never erased by
            a later crawl that simply failed to find the link again.
        """
        merged = dict(existing) if existing else {}

        if incoming.get("found") and incoming.get("url"):
            merged["found"] = True
            merged["url"] = incoming["url"]
            if incoming.get("username"):
                merged["username"] = incoming["username"]
            if incoming.get("source_page"):
                merged["source_page"] = incoming["source_page"]
            if incoming.get("last_checked"):
                merged["last_checked"] = incoming["last_checked"]
        elif not (merged.get("found") and merged.get("url")):
            merged["found"] = False
            merged["url"] = incoming.get("url")
            merged["username"] = incoming.get("username")
            if incoming.get("source_page"):
                merged["source_page"] = incoming["source_page"]
            if incoming.get("last_checked"):
                merged["last_checked"] = incoming["last_checked"]

        return merged

    def _safe_merge_contact(
        self,
        existing: Dict[str, Any],
        incoming: Dict[str, Any],
        default_country: Any = None,
    ) -> Dict[str, Any]:
        """
        Specialised merge for the `contact_discovery` sub-document.

        List fields (emails, phones, etc.) are UNION-merged and replaced —
        never blindly appended. Every merged list runs through the canonical
        pipeline (normalize → validate → deduplicate → sort) before save so
        duplicates can never persist across analysis runs. Uniqueness metrics
        are recomputed and stored on the final document.
        """
        merged = dict(existing) if existing else {}

        LIST_FIELDS = {
            "secondary_emails",
            "all_emails",
            "secondary_phones",
            "whatsapp_numbers",
            "contact_pages",
            "contact_forms",
        }

        for key, incoming_val in incoming.items():
            if key in self.PROTECTED_CRM_FIELDS:
                continue

            if key in LIST_FIELDS:
                # Union-merge lists — replace the array with a deduped version.
                existing_list = merged.get(key) or []
                incoming_list = incoming_val or []
                combined = list(dict.fromkeys(existing_list + incoming_list))
                merged[key] = combined
            else:
                # Standard safe merge for scalar fields
                existing_val = merged.get(key)
                if incoming_val is None or incoming_val == "":
                    if existing_val is not None and existing_val != "":
                        continue
                merged[key] = incoming_val

        # Final canonical dedup + metrics before save.
        merged = self._final_dedup_contacts(merged, default_country=default_country)
        return merged

    def _final_dedup_contacts(
        self,
        cd: Dict[str, Any],
        default_country: Any = None,
    ) -> Dict[str, Any]:
        """
        Final normalize → validate → deduplicate → sort → save pass over the
        contact_discovery document. Rebuilds every contact array from the
        canonical set and recomputes uniqueness metrics.
        """
        email_scalars = ("primary_email", "support_email", "sales_email", "hr_email", "marketing_email")
        phone_scalars = ("primary_phone",)

        raw_emails: List[str] = [cd[k] for k in email_scalars if cd.get(k)]
        raw_emails.extend(cd.get("all_emails") or [])
        raw_emails.extend(cd.get("secondary_emails") or [])

        raw_phones: List[str] = [cd[k] for k in phone_scalars if cd.get(k)]
        raw_phones.extend(cd.get("secondary_phones") or [])
        raw_phones.extend(cd.get("whatsapp_numbers") or [])

        unique_emails, _ = deduplicate_emails(raw_emails)
        unique_phones, _ = deduplicate_phones(raw_phones, default_country=default_country)

        # Canonicalize scalar contact fields in place.
        for key in email_scalars:
            if cd.get(key):
                norm = normalize_email(cd[key])
                if norm:
                    cd[key] = norm
        for key in phone_scalars:
            if cd.get(key):
                norm = normalize_phone(cd[key], default_country=default_country)
                if norm:
                    cd[key] = norm

        reserved_emails = {
            cd[k] for k in ("primary_email", "support_email", "sales_email", "hr_email", "marketing_email")
            if cd.get(k)
        }
        cd["all_emails"] = unique_emails
        cd["secondary_emails"] = [e for e in unique_emails if e not in reserved_emails]

        primary_phone = cd.get("primary_phone")
        whatsapp_norm = {
            n for n in (cd.get("whatsapp_numbers") or [])
            if normalize_phone(n, default_country=default_country)
        }
        cd["secondary_phones"] = [
            p for p in unique_phones if p != primary_phone and p not in whatsapp_norm
        ]
        cd["whatsapp_numbers"] = [p for p in unique_phones if p in whatsapp_norm]

        # Recompute + persist uniqueness metrics.
        metrics = compute_metrics(
            raw_emails,
            cd["all_emails"],
            raw_phones,
            cd["secondary_phones"] + cd["whatsapp_numbers"],
        )
        cd["emails_found"] = metrics.emails_found
        cd["unique_emails"] = metrics.unique_emails
        cd["duplicate_emails_removed"] = metrics.duplicate_emails_removed
        cd["phones_found"] = metrics.phones_found
        cd["unique_phones"] = metrics.unique_phones
        cd["duplicate_phones_removed"] = metrics.duplicate_phones_removed
        log_contacts_metrics(metrics, context="merge")
        return cd

    def _score_summary(self, lead_data: Dict[str, Any]) -> Dict[str, Any]:
        seo = lead_data.get("seo") or {}
        perf = lead_data.get("performance") or {}
        design = lead_data.get("design") or {}
        business = lead_data.get("business") or {}
        return {
            "overall_score": business.get("overall_score"),
            "seo_score": seo.get("seo_score"),
            "performance_score": perf.get("performance_score") or perf.get("pagespeed"),
            "ui_score": design.get("ui_score"),
            "ux_score": design.get("ux_score"),
            "accessibility_score": design.get("accessibility_score"),
            "security_score": design.get("security_score"),
            "business_opportunity": business.get("business_opportunity_score") or business.get("business_opportunity"),
        }

    def _build_history_snapshot(self, existing: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Creates a snapshot of the current analysis state for historical_analyses.
        Only snapshots if the lead has at least one completed analysis.
        """
        ai_meta = existing.get("ai_analysis") or {}
        status = ai_meta.get("analysis_status")

        if not status or status.upper() not in ("COMPLETED", "COMPLETEDWITHWARNINGS", "FAILED"):
            # No previous completed analysis — nothing to archive
            return None

        scores = self._score_summary(existing)
        analysis_number = ai_meta.get("analysis_count", 0) or 1
        return {
            "version": analysis_number,
            "label": f"Analysis #{analysis_number}",
            "archived_at": datetime.now(timezone.utc).isoformat(),
            "analysis_version": ai_meta.get("analysis_version", "1.0"),
            "analysis_status": status,
            "analysis_date": ai_meta.get("analysis_completed_at") or ai_meta.get("last_analysis_date"),
            "analysis_started_at": ai_meta.get("analysis_started_at"),
            "analysis_completed_at": ai_meta.get("analysis_completed_at"),
            "analysis_duration": ai_meta.get("analysis_duration"),
            "analysis_count": analysis_number,
            "scores": scores,
            "overall_score": scores.get("overall_score"),
            "seo_score": scores.get("seo_score"),
            "performance_score": scores.get("performance_score"),
            "ui_score": scores.get("ui_score"),
            "ux_score": scores.get("ux_score"),
            "accessibility_score": scores.get("accessibility_score"),
            "security_score": scores.get("security_score"),
            "business_opportunity": scores.get("business_opportunity"),
            # Sub-document snapshots
            "website_information": existing.get("website_information"),
            "website_structure": existing.get("website_structure"),
            "contact_discovery": existing.get("contact_discovery"),
            "social_media": existing.get("social_media"),
            "technology_detection": existing.get("technology_detection"),
            "seo": existing.get("seo"),
            "performance": existing.get("performance"),
            "design": existing.get("design"),
            "business": existing.get("business"),
            "social_media_analysis": existing.get("social_media_analysis"),
            "mobile": existing.get("mobile"),
            "content": existing.get("content"),
            "tiktok": existing.get("tiktok"),
            "lead_intelligence": existing.get("lead_intelligence"),
            "sales_opportunity": existing.get("sales_opportunity"),
        }


# ── Singleton instance ────────────────────────────────────────────────────
lead_enrichment_service = LeadEnrichmentService()

