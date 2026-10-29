import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from bson import ObjectId

from app.db.database import get_db
from app.models.contact import ContactDiscoveryResult, ContactExtracted
from app.services.discovery.contact_extractor import ContactExtractor
from app.services.contact_deduplication import (
    compute_metrics,
    log_contacts_metrics,
    normalize_email,
    normalize_phone,
)

logger = logging.getLogger(__name__)

class ContactDiscoveryService:
    def __init__(self):
        self.extractor = ContactExtractor()

    async def execute_discovery(self, job_id: str, lead_id: str) -> ContactDiscoveryResult:
        db = get_db()
        page_collection = db["crawl_pages"]
        
        logger.info(f"Starting Contact Discovery for Job {job_id}")
        
        # Fetch all crawled pages for this job
        pages = await page_collection.find({"job_id": job_id}).to_list(length=None)
        
        all_contacts: List[ContactExtracted] = []
        
        # Prioritize high value pages
        def page_priority(url):
            url = url.lower()
            if 'contact' in url: return 3
            if 'about' in url: return 2
            if 'team' in url: return 2
            return 1
            
        pages.sort(key=lambda p: page_priority(p.get("url", "")), reverse=True)
        
        for page in pages:
            url = page.get("url", "")
            text = page.get("visible_text", "")
            html = page.get("html", "")
            
            # Extract from text (Regex)
            text_contacts = self.extractor.extract_from_text(text, url)
            all_contacts.extend(text_contacts)
            
            # Extract from HTML (DOM)
            html_contacts = self.extractor.extract_from_html(html, url)
            all_contacts.extend(html_contacts)

        # Country hint for E.164 phone normalization (best effort).
        default_country = None
        try:
            lead_oid = ObjectId(lead_id) if isinstance(lead_id, str) and len(lead_id) == 24 else lead_id
            lead_doc = await db["leads"].find_one(
                {"_id": lead_oid}, {"country": 1, "website_information.country": 1}
            )
            if lead_doc:
                default_country = (
                    lead_doc.get("country")
                    or (lead_doc.get("website_information") or {}).get("country")
                )
        except Exception:
            default_country = None

        # Final dedup pass across ALL sources (crawl text + DOM + schema.org +
        # mailto/tel links). Emails and phones are normalized canonically before
        # dedup so the same value from different sources collapses to one entry.
        unique_contacts: Dict[str, ContactExtracted] = {}
        raw_emails: List[str] = []
        raw_phones: List[str] = []
        for c in all_contacts:
            ctype = c.type
            cval = str(c.value or "").strip()
            if not cval:
                continue

            if ctype == "Email":
                raw_emails.append(cval)
                norm = normalize_email(cval)
                if not norm:
                    continue
                c.value = norm
            elif ctype in ("Phone", "WhatsApp"):
                raw_phones.append(cval)
                norm = normalize_phone(cval, default_country=default_country)
                if not norm:
                    continue
                c.value = norm

            key = f"{ctype}:{c.value.lower()}"
            if key not in unique_contacts:
                unique_contacts[key] = c
            else:
                # Keep the one from the higher priority page, or bump confidence
                existing = unique_contacts[key]
                existing.confidence_score = min(100, existing.confidence_score + 10)
                if c.confidence_score > existing.confidence_score:
                    unique_contacts[key] = c

        final_contacts = list(unique_contacts.values())
        final_contacts.sort(key=lambda x: x.confidence_score, reverse=True)

        # Uniqueness metrics + [CONTACTS] log block.
        unique_emails = [c.value for c in final_contacts if c.type == "Email"]
        unique_phones = [
            c.value for c in final_contacts if c.type in ("Phone", "WhatsApp")
        ]
        metrics = compute_metrics(raw_emails, unique_emails, raw_phones, unique_phones)
        log_contacts_metrics(metrics, context="discovery")
        
        primary_email = None
        primary_phone = None
        whatsapp = None
        
        socials = {}
        
        for c in final_contacts:
            if c.type == "Email" and not primary_email:
                # Prefer named emails over info@ / contact@ if multiple exist
                if not any(x in c.value for x in ['info@', 'contact@', 'support@', 'hello@']) or not primary_email:
                    primary_email = c.value
            elif c.type == "Phone" and not primary_phone:
                primary_phone = c.value
            elif c.type == "WhatsApp" and not whatsapp:
                whatsapp = c.value
            elif c.type in ["LinkedIn", "Twitter", "Facebook", "Instagram"]:
                if c.type not in socials:
                    socials[c.type] = c.value
                    
        # Create result object
        result = ContactDiscoveryResult(
            job_id=job_id,
            lead_id=lead_id,
            primary_email=primary_email,
            primary_phone=primary_phone,
            whatsapp_number=whatsapp,
            contacts=final_contacts,
            social_linkedin=socials.get("LinkedIn"),
            social_twitter=socials.get("Twitter"),
            social_facebook=socials.get("Facebook"),
            social_instagram=socials.get("Instagram")
        )
        
        # Save raw discovery to DB (for archival / debugging)
        result_dict = result.model_dump()
        await db["contact_discoveries"].insert_one(result_dict)
        
        # ── Enrich Lead: contact_discovery + social_media sub-documents ──
        # This permanently writes all discovered contacts into the Lead document.
        try:
            from app.services.lead_enrichment_service import lead_enrichment_service, LeadEnrichmentData
            from app.services.analysis_result_mapper import analysis_result_mapper

            enrichment = LeadEnrichmentData()
            enrichment.contact_discovery = analysis_result_mapper.map_contact_result(result)
            enrichment.social_media = analysis_result_mapper.map_social_media(result)

            # Top-level lead fields: only fill if currently empty (never overwrite manual CRM data)
            cd = enrichment.contact_discovery
            if cd.get("primary_email"):
                enrichment.primary_email = cd["primary_email"]
            if cd.get("primary_phone"):
                enrichment.primary_phone = cd["primary_phone"]
            if cd.get("office_address"):
                enrichment.primary_address = cd["office_address"]

            await lead_enrichment_service.enrich_lead(lead_id, enrichment)
            logger.info(
                f"Contact Discovery enriched lead {lead_id}: "
                f"{len(final_contacts)} contacts written to Lead sub-documents"
            )
        except Exception as enrich_err:
            logger.error(f"Failed to enrich Lead {lead_id} from contact discovery: {enrich_err}")
            # Fallback: update only the top-level email/phone fields
            update_fields = {}
            if primary_email:
                update_fields["email"] = primary_email
            if primary_phone:
                update_fields["phone"] = primary_phone
            if whatsapp:
                update_fields["whatsapp"] = whatsapp
            if update_fields:
                lead_oid = ObjectId(lead_id) if isinstance(lead_id, str) and len(lead_id) == 24 else lead_id
                await db["leads"].update_one(
                    {"_id": lead_oid},
                    {"$set": update_fields}
                )
            
        logger.info(f"Completed Contact Discovery for Job {job_id}. Found {len(final_contacts)} unique contacts.")
        
        return result
