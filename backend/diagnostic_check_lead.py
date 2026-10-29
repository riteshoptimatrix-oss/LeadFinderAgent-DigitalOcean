#!/usr/bin/env python3
"""
Lead Data Diagnostic Tool
=========================
Verifies that AI Analysis data is correctly persisted in MongoDB
and accessible from all API endpoints.

Usage:
    python diagnostic_check_lead.py <lead_id>

Example:
    python diagnostic_check_lead.py 507f1f77bcf86cd799439011
"""

import asyncio
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.db.database import get_db, connect_to_mongo, close_mongo_connection
from app.services.production_validation_service import ProductionValidationService


async def diagnose_lead(lead_id: str):
    """
    Performs comprehensive diagnostic checks on a lead.
    """
    print(f"\n{'=' * 80}")
    print(f"AI ANALYSIS PIPELINE DIAGNOSTIC — Lead {lead_id}")
    print(f"{'=' * 80}\n")

    # Connect to MongoDB
    await connect_to_mongo()
    db = get_db()

    if db is None:
        print("❌ CRITICAL: Cannot connect to MongoDB")
        return

    # Fetch lead
    print(f"📊 Fetching Lead document from MongoDB...")
    lead = await db["leads"].find_one({"_id": lead_id})
    
    if not lead:
        print(f"❌ Lead {lead_id} not found in MongoDB")
        await close_mongo_connection()
        return

    print(f"✅ Lead found: {lead.get('name', 'Unknown')}")
    print(f"   Website: {lead.get('website', 'N/A')}")
    print()

    # Check ai_analysis sub-document
    ai_meta = lead.get("ai_analysis")
    
    if not ai_meta:
        print("❌ CRITICAL: ai_analysis sub-document is MISSING")
        print("   This means the analysis pipeline failed to persist data.")
        await close_mongo_connection()
        return

    print("✅ ai_analysis sub-document exists")
    print(f"   Analysis Status: {ai_meta.get('analysis_status', 'Unknown')}")
    print(f"   Analysis Version: {ai_meta.get('analysis_version', 'Unknown')}")
    print(f"   Analysis Count: {ai_meta.get('analysis_count', 0)}")
    print(f"   Last Analysis: {ai_meta.get('last_analysis_date', 'Never')}")
    print()

    # Check scores
    print("📈 SCORES:")
    scores = {
        "Overall Score": ai_meta.get("overall_score"),
        "SEO Score": ai_meta.get("seo_score"),
        "Performance Score": ai_meta.get("performance_score"),
        "UI Score": ai_meta.get("ui_score"),
        "UX Score": ai_meta.get("ux_score"),
        "Security Score": ai_meta.get("security_score"),
        "Accessibility Score": ai_meta.get("accessibility_score"),
        "Business Opportunity": ai_meta.get("business_opportunity"),
    }
    
    missing_scores = []
    for label, value in scores.items():
        if value is not None and value != 0:
            print(f"   ✅ {label}: {value}")
        else:
            print(f"   ❌ {label}: MISSING or 0")
            missing_scores.append(label)
    
    if missing_scores:
        print(f"\n⚠️  WARNING: {len(missing_scores)} scores are missing")
    print()

    # Check technology
    print("💻 TECHNOLOGY STACK:")
    tech_fields = {
        "CMS": ai_meta.get("cms"),
        "Frontend": ai_meta.get("frontend"),
        "Backend": ai_meta.get("backend"),
        "Hosting": ai_meta.get("hosting"),
        "CDN": ai_meta.get("cdn"),
        "Analytics": ai_meta.get("analytics"),
    }
    
    missing_tech = []
    for label, value in tech_fields.items():
        if value:
            print(f"   ✅ {label}: {value}")
        else:
            print(f"   ❌ {label}: Not Detected")
            missing_tech.append(label)
    
    if missing_tech:
        print(f"\n⚠️  WARNING: {len(missing_tech)} technologies not detected")
    print()

    # Check website metrics
    print("🌐 WEBSITE METRICS:")
    website_fields = {
        "Pages": ai_meta.get("pages"),
        "Internal Links": ai_meta.get("internal_links"),
        "Broken Links": ai_meta.get("broken_links"),
        "Robots.txt": ai_meta.get("robots"),
        "Sitemap": ai_meta.get("sitemap"),
        "Response Time": ai_meta.get("response_time"),
        "SSL": ai_meta.get("ssl"),
    }
    
    for label, value in website_fields.items():
        if value is not None:
            if isinstance(value, bool):
                print(f"   ✅ {label}: {'Yes' if value else 'No'}")
            else:
                print(f"   ✅ {label}: {value}")
        else:
            print(f"   ❌ {label}: MISSING")
    print()

    # Check recommendations
    print("💡 RECOMMENDATIONS:")
    recommendations = ai_meta.get("recommendations") or []
    top_seo = ai_meta.get("top_seo_issues") or []
    top_ui = ai_meta.get("top_ui_issues") or []
    top_ux = ai_meta.get("top_ux_issues") or []
    perf_sugg = ai_meta.get("performance_suggestions") or []
    sec_sugg = ai_meta.get("security_suggestions") or []
    acc_sugg = ai_meta.get("accessibility_suggestions") or []
    
    print(f"   General Recommendations: {len(recommendations)}")
    print(f"   SEO Issues: {len(top_seo)}")
    print(f"   UI Issues: {len(top_ui)}")
    print(f"   UX Issues: {len(top_ux)}")
    print(f"   Performance Suggestions: {len(perf_sugg)}")
    print(f"   Security Suggestions: {len(sec_sugg)}")
    print(f"   Accessibility Suggestions: {len(acc_sugg)}")
    
    total_recs = len(recommendations) + len(top_seo) + len(top_ui) + len(top_ux) + len(perf_sugg) + len(sec_sugg) + len(acc_sugg)
    if total_recs > 0:
        print(f"   ✅ Total: {total_recs} recommendations")
    else:
        print(f"   ❌ No recommendations generated")
    print()

    # Check contacts
    print("📧 CONTACTS:")
    emails = ai_meta.get("emails") or []
    phones = ai_meta.get("phones") or []
    addresses = ai_meta.get("addresses") or []
    social = ai_meta.get("social_links") or {}
    
    print(f"   Emails: {len(emails)}")
    if emails:
        for email in emails[:3]:
            print(f"      • {email}")
    
    print(f"   Phones: {len(phones)}")
    if phones:
        for phone in phones[:3]:
            print(f"      • {phone}")
    
    print(f"   Social Links: {len(social)} platforms")
    if social:
        for platform, url in list(social.items())[:3]:
            print(f"      • {platform}: {url}")
    print()

    # Check sub-documents
    print("📁 SUB-DOCUMENTS:")
    sub_docs = [
        ("website_information", "Website Information"),
        ("website_structure", "Website Structure"),
        ("contact_discovery", "Contact Discovery"),
        ("social_media", "Social Media"),
        ("technology_detection", "Technology Detection"),
        ("seo", "SEO Analysis"),
        ("performance", "Performance Analysis"),
        ("design", "Design Analysis"),
        ("business", "Business Intelligence"),
    ]
    
    populated = 0
    for field, label in sub_docs:
        value = lead.get(field)
        if value and isinstance(value, dict) and len(value) > 0:
            print(f"   ✅ {label}: {len(value)} fields")
            populated += 1
        else:
            print(f"   ❌ {label}: Empty or missing")
    
    print(f"\n   Sub-documents populated: {populated}/{len(sub_docs)}")
    print()

    # Check history
    history = lead.get("historical_analyses") or []
    print(f"📚 ANALYSIS HISTORY: {len(history)} versions")
    print()

    # Run validation service
    print("🔍 RUNNING PRODUCTION VALIDATION...")
    validator = ProductionValidationService()
    report = validator.validate_lead_document(lead)
    
    print(f"\n{'=' * 80}")
    print(f"VALIDATION REPORT — {report['overall_status']}")
    print(f"{'=' * 80}\n")
    
    summary = report["summary"]
    print(f"Total Checks: {summary['total_checks']}")
    print(f"  ✅ Pass: {summary['pass']}")
    print(f"  ⚠️  Warn: {summary['warn']}")
    print(f"  ❌ Fail: {summary['fail']}")
    print(f"  ℹ️  Info: {summary['info']}")
    print()
    
    if report["errors"]:
        print("❌ ERRORS:")
        for error in report["errors"]:
            print(f"   • {error}")
        print()
    
    if report["warnings"]:
        print("⚠️  WARNINGS:")
        for warning in report["warnings"]:
            print(f"   • {warning}")
        print()
    
    if report["missing_fields"]:
        print(f"📋 MISSING FIELDS ({len(report['missing_fields'])}):")
        for field in report["missing_fields"][:10]:
            print(f"   • {field}")
        if len(report["missing_fields"]) > 10:
            print(f"   ... and {len(report['missing_fields']) - 10} more")
        print()

    # Final verdict
    print(f"{'=' * 80}")
    if report["overall_status"] == "PASS":
        print("✅ VERDICT: PIPELINE WORKING CORRECTLY")
        print("   All data is persisted and accessible.")
    elif report["overall_status"] == "WARN":
        print("⚠️  VERDICT: PIPELINE PARTIALLY WORKING")
        print("   Some data is missing but core functionality works.")
    else:
        print("❌ VERDICT: PIPELINE FAILURE")
        print("   Critical data is missing. Analysis did not persist correctly.")
    print(f"{'=' * 80}\n")

    await close_mongo_connection()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python diagnostic_check_lead.py <lead_id>")
        print("Example: python diagnostic_check_lead.py 507f1f77bcf86cd799439011")
        sys.exit(1)
    
    lead_id = sys.argv[1]
    asyncio.run(diagnose_lead(lead_id))
