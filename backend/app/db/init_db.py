from app.db.database import get_db
from app.core import security
from app.core.logger import logger
from app.core.config import settings
import pymongo
from datetime import datetime, timezone


async def init_admin_user():
    """Create the default admin user if it does not already exist."""
    try:
        db = get_db()
    except Exception as e:
        logger.error(f"Database connection not found during init_admin_user: {e}")
        return

    # Get admin credentials from settings or defaults requested by user
    admin_email = settings.ADMIN_EMAIL or "info@optiinfo.com"
    admin_password = settings.ADMIN_PASSWORD or "Optiinfo.com99"
    
    if not admin_email or not admin_password:
        logger.warning("ADMIN_EMAIL and ADMIN_PASSWORD not set in .env file. Skipping admin user creation.")
        logger.info("To create an admin user, set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file")
        return
    
    try:
        user = await db["admins"].find_one({"email": admin_email})
        if user:
            logger.info(f"Admin user {admin_email} already exists in admins collection.")
            return

        hashed_password = security.get_password_hash(admin_password)
        admin_user = {
            "email": admin_email,
            "password_hash": hashed_password,
            "role": "admin",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "last_login": None
        }
        
        await db["admins"].insert_one(admin_user)
        logger.info(f"Admin user {admin_email} created successfully in admins collection.")
    except Exception as e:
        logger.error(f"Failed to create admin user: {str(e)}")


async def init_email_ai_defaults():
    """Seed Email AI defaults so the Campaign Wizard can run out of the box.

    If no SMTP profile exists yet and valid SMTP credentials are present in the
    environment (.env), a default profile is created from them.
    Also seeds professional starter templates if none exist yet.
    """
    try:
        db = get_db()
    except Exception as e:
        logger.error(f"Database connection not found during init_email_ai_defaults: {e}")
        return

    # Seed starter templates if none exist
    try:
        existing_templates = await db["email_ai_templates"].count_documents({})
        if existing_templates == 0:
            starter_templates = [
                {
                    "name": "Cold Outreach - Introduction",
                    "subject": "Quick question for {{business_name}}",
                    "body_html": "<p>Hi {{owner_name}},</p><p>I came across <strong>{{business_name}}</strong> in {{city}} and was impressed by your work.</p><p>We specialize in helping businesses in the {{industry}} industry streamline operations and scale customer acquisition.</p><p>Would you be open to a brief 5-minute chat this week?</p><p>Best regards,<br/>Your Name</p>",
                    "body_text": "Hi {{owner_name}},\n\nI came across {{business_name}} in {{city}} and was impressed by your work.\n\nWe specialize in helping businesses in the {{industry}} industry streamline operations and scale customer acquisition.\n\nWould you be open to a brief 5-minute chat this week?\n\nBest regards,\nYour Name",
                    "category": "Outreach",
                    "language": "English",
                    "is_active": True,
                    "is_favorite": True,
                    "usage_count": 0,
                    "version": 1,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                },
                {
                    "name": "Follow-Up - Quick Check-in",
                    "subject": "Following up regarding {{business_name}}",
                    "body_html": "<p>Hi {{owner_name}},</p><p>Just following up on my previous note regarding <strong>{{business_name}}</strong>.</p><p>I understand you are busy, so if now is not the right time, no worries at all.</p><p>If you'd like to connect when things quiet down, just reply to this email.</p><p>Warm regards,<br/>Your Name</p>",
                    "body_text": "Hi {{owner_name}},\n\nJust following up on my previous note regarding {{business_name}}.\n\nI understand you are busy, so if now is not the right time, no worries at all.\n\nIf you'd like to connect when things quiet down, just reply to this email.\n\nWarm regards,\nYour Name",
                    "category": "Follow Up",
                    "language": "English",
                    "is_active": True,
                    "is_favorite": False,
                    "usage_count": 0,
                    "version": 1,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                },
                {
                    "name": "Value Proposition & Audit",
                    "subject": "Growth opportunity for {{business_name}}",
                    "body_html": "<p>Hi {{owner_name}},</p><p>We recently reviewed digital presence metrics for businesses in {{city}}, including <strong>{{business_name}}</strong>.</p><p>We noticed a few quick optimizations that could help you attract more high-value clients this quarter.</p><p>Let me know if you would like me to share a complimentary summary report.</p><p>Best regards,<br/>Your Team</p>",
                    "body_text": "Hi {{owner_name}},\n\nWe recently reviewed digital presence metrics for businesses in {{city}}, including {{business_name}}.\n\nWe noticed a few quick optimizations that could help you attract more high-value clients this quarter.\n\nLet me know if you would like me to share a complimentary summary report.\n\nBest regards,\nYour Team",
                    "category": "Promotional",
                    "language": "English",
                    "is_active": True,
                    "is_favorite": False,
                    "usage_count": 0,
                    "version": 1,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
            ]
            await db["email_ai_templates"].insert_many(starter_templates)
            logger.info("Email AI defaults: Seeded 3 starter templates.")
    except Exception as e:
        logger.error(f"Email AI defaults: Failed to seed starter templates: {e}")

    # Purge any legacy unowned/demo campaigns without a valid user_id
    try:
        orphan_res = await db["email_ai_campaigns"].delete_many({
            "$or": [
                {"user_id": None},
                {"user_id": {"$exists": False}},
                {"user_id": ""}
            ]
        })
        if orphan_res.deleted_count > 0:
            logger.info(f"Email AI defaults: Cleaned up {orphan_res.deleted_count} unassigned legacy demo campaign(s).")
            valid_cids = [str(c["_id"]) for c in await db["email_ai_campaigns"].find({}, {"_id": 1}).to_list(None)]
            await db["email_ai_queue"].delete_many({"campaign_id": {"$nin": valid_cids}})
    except Exception as cleanup_err:
        logger.warning(f"Email AI defaults: Cleanup warning: {cleanup_err}")

    if not settings.smtp_is_configured:
        logger.info("SMTP settings not configured in .env. Skipping default SMTP profile seeding.")
        return

    try:
        existing = await db["email_ai_smtp"].count_documents({})
        if existing > 0:
            logger.info(f"Email AI defaults: {existing} SMTP profile(s) already present. No seeding required.")
            return

        profile = settings.smtp_profile_dict()
        profile["created_at"] = datetime.now(timezone.utc)
        profile["updated_at"] = datetime.now(timezone.utc)
        result = await db["email_ai_smtp"].insert_one(profile)
        logger.info(
            f"Email AI defaults: Seeded default SMTP profile from .env "
            f"(id={result.inserted_id}, host={profile['host']}, user={profile['username']}, port={profile['port']})."
        )
    except Exception as e:
        logger.error(f"Email AI defaults: Failed to seed default SMTP profile: {e}")

async def _create_index_safe(collection, key, **kwargs):
    try:
        await collection.create_index(key, **kwargs)
    except Exception as e:
        logger.warning(f"Index creation skipped/ignored for {collection.name} on keys {key}: {e}")

async def init_indexes():
    """Initialize database indexes for performance optimization."""
    try:
        db = get_db()
    except Exception as e:
        logger.error(f"Database connection not found during init_indexes: {e}")
        return
        
    logger.info("Initializing Database Indexes...")
    try:
        # Users
        await _create_index_safe(db["users"], "email", unique=True)
        
        # Leads
        await _create_index_safe(db["leads"], [("name", "text"), ("email", "text"), ("phone", "text")])
        await _create_index_safe(db["leads"], "user_id")
        await _create_index_safe(db["leads"], "status")
        await _create_index_safe(db["leads"], "job_id")
        await _create_index_safe(db["leads"], "source_url")
        await _create_index_safe(db["leads"], "website", sparse=True)
        await _create_index_safe(db["leads"], "phone", sparse=True)
        
        # AI Analysis - NEW
        await _create_index_safe(db["ai_analysis"], [("lead_id", 1), ("user_id", 1)], unique=True)
        await _create_index_safe(db["ai_analysis"], "user_id")
        await _create_index_safe(db["ai_analysis"], "analyzed_at")
        logger.info("AI Analysis indexes created")
        
        # Website Audits - NEW
        await _create_index_safe(db["website_audits"], [("lead_id", 1), ("user_id", 1)], unique=True)
        await _create_index_safe(db["website_audits"], "user_id")
        await _create_index_safe(db["website_audits"], "audited_at")
        logger.info("Website Audits indexes created")
        
        # Campaigns
        await db["campaigns"].create_index("user_id")
        
        # Searches
        await db["searches"].create_index("user_id")
        
        # Audit Logs
        await db["audit_logs"].create_index("user_id")
        await db["audit_logs"].create_index("action")
        await db["audit_logs"].create_index([("created_at", -1)])
        
        # Activity Logs
        await db["activity_logs"].create_index("user_id")
        await db["activity_logs"].create_index([("created_at", -1)])
        
        # WhatsApp Templates
        await db["wa_templates"].create_index("user_id")
        await db["wa_templates"].create_index([("user_id", 1), ("is_default", 1)])
        logger.info("WA Templates indexes created")
        
        # WhatsApp Campaigns
        await db["wa_campaigns"].create_index("user_id")
        await db["wa_campaigns"].create_index([("user_id", 1), ("status", 1)])
        await db["wa_campaigns"].create_index([("created_at", -1)])
        logger.info("WA Campaigns indexes created")
        
        # WhatsApp Campaign History
        await db["wa_campaign_history"].create_index("campaign_id")
        await db["wa_campaign_history"].create_index([("user_id", 1), ("created_at", -1)])
        logger.info("WA Campaign History indexes created")
        
        # WhatsApp Message Logs
        await db["wa_message_logs"].create_index("campaign_id")
        await db["wa_message_logs"].create_index([("campaign_id", 1), ("status", 1)])
        await db["wa_message_logs"].create_index("user_id")
        logger.info("WA Message Logs indexes created")
        
        # ── Intelligence Dashboard Indexes ────────────────────────────────────
        # Advanced Analysis Queue
        await db["advanced_analysis_queue"].create_index([("status", pymongo.ASCENDING), ("completed_at", pymongo.DESCENDING)])
        await db["advanced_analysis_queue"].create_index([("lead_id", pymongo.ASCENDING)])
        await db["advanced_analysis_queue"].create_index([("website_quality_score", pymongo.DESCENDING)])

        # SEO Analysis Results
        await db["seo_analysis_results"].create_index([("lead_id", pymongo.ASCENDING)])
        await db["seo_analysis_results"].create_index([("scorecard.overall_score", pymongo.DESCENDING)])

        # Performance Analysis Results
        await db["performance_analysis_results"].create_index([("lead_id", pymongo.ASCENDING)])
        await db["performance_analysis_results"].create_index([("scorecard.overall_desktop_score", pymongo.DESCENDING)])

        # Security Analysis Results
        await db["security_analysis_results"].create_index([("lead_id", pymongo.ASCENDING)])
        await db["security_analysis_results"].create_index([("scorecard.overall_security_score", pymongo.DESCENDING)])
        await db["security_analysis_results"].create_index([("scorecard.accessibility_score", pymongo.DESCENDING)])

        # UI/UX Analysis Results
        await db["ui_ux_analysis_results"].create_index([("lead_id", pymongo.ASCENDING)])
        await db["ui_ux_analysis_results"].create_index([("scorecard.overall_ui_score", pymongo.DESCENDING)])
        await db["ui_ux_analysis_results"].create_index([("scorecard.overall_ux_score", pymongo.DESCENDING)])

        # Business Intelligence Results
        await db["business_intelligence_results"].create_index([("lead_id", pymongo.ASCENDING)])
        await db["business_intelligence_results"].create_index([("scorecard.business_opportunity_score", pymongo.DESCENDING)])
        await db["business_intelligence_results"].create_index([("scorecard.lead_priority_score", pymongo.DESCENDING)])
        await db["business_intelligence_results"].create_index([("priority_classification", pymongo.ASCENDING)])

        # Technology Detections
        await db["technology_detections"].create_index([("lead_id", pymongo.ASCENDING)])
        await db["technology_detections"].create_index([("technologies.category", pymongo.ASCENDING)])
        await db["technology_detections"].create_index([("technologies.name", pymongo.ASCENDING)])

        # Daily/Weekly/Monthly Aggregates
        await db["dashboard_daily_aggregates"].create_index([("date", pymongo.ASCENDING)], unique=True)
        await db["dashboard_weekly_aggregates"].create_index([("date", pymongo.ASCENDING)], unique=True)
        await db["dashboard_monthly_aggregates"].create_index([("date", pymongo.ASCENDING)], unique=True)

        logger.info("Intelligence Dashboard indexes created")
        # ─────────────────────────────────────────────────────────────────────

        # ── Queue & Worker Indexes ────────────────────────────────────────────
        # Search Jobs
        await db["search_jobs"].create_index("status")
        await db["search_jobs"].create_index("user_id")
        await db["search_jobs"].create_index([("status", pymongo.ASCENDING), ("created_at", pymongo.ASCENDING)])

        # Search Queue
        await db["search_queue"].create_index([("job_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)])
        await db["search_queue"].create_index([("created_at", pymongo.ASCENDING)])

        # Email Queue
        await db["email_queue"].create_index([("campaign_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)])

        # WhatsApp Queue
        await db["whatsapp_queue"].create_index([("campaign_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)])

        # Campaign Queue
        await db["campaign_queue"].create_index([("campaign_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)])

        # Worker Nodes
        await db["worker_nodes"].create_index([("node_id", pymongo.ASCENDING), ("worker_name", pymongo.ASCENDING)], unique=True)

        # Job Logs with TTL (auto-expire after 30 days)
        await db["job_logs"].create_index([("job_type", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
        await db["job_logs"].create_index("created_at", expireAfterSeconds=30 * 24 * 3600)

        # Audit Logs TTL (auto-expire after 90 days)
        await db["audit_logs"].create_index("created_at", expireAfterSeconds=90 * 24 * 3600)

        # CRM indexes
        await db["crm_activities"].create_index([("lead_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
        await db["crm_tasks"].create_index([("user_id", pymongo.ASCENDING), ("status", pymongo.ASCENDING)])

        # Reports
        await db["reports"].create_index([("lead_id", pymongo.ASCENDING), ("report_type", pymongo.ASCENDING)])

        logger.info("Queue, Worker & TTL indexes created")
        # ─────────────────────────────────────────────────────────────────────
        
        logger.info("Indexes successfully created.")
    except Exception as e:
        logger.error(f"Failed to create indexes: {str(e)}")
