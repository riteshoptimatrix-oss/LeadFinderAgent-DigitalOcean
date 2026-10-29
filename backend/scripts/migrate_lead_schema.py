"""Idempotent migration that normalizes every Lead document to the canonical
Lead schema.

What it fixes
-------------
* ai_analysis.recommendations  -> List[str] (flat strings, coercing legacy dicts)
* technology_detection         -> canonical TechnologyDetection dict
* social_media / social_profiles / social_links -> canonical SocialMedia dict
* contacts                     -> list of {type, value, classification, source_url}
* scores / analysis            -> folded into the canonical ai_analysis payload

The migration is idempotent: a document is only rewritten when the normalized
form differs from what is already stored, so re-running it is safe.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from app.core.logger import logger
from app.db.database import connect_to_mongo, close_mongo_connection, db_instance
from app.models.lead import _flatten_recommendations


def _as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _as_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _normalize_technology(raw: Any) -> Dict[str, Any]:
    """Canonicalize the `technology_detection` section.

    Legacy documents sometimes store `technology`/`technologies` as a flat list
    of {category, name} dicts. Convert that into the structured map.
    """
    result: Dict[str, Any] = {}
    data = _as_dict(raw)
    if data:
        # Already a structured map.
        for key in (
            "frontend_framework", "backend_framework", "cms", "hosting", "cdn",
            "analytics", "payment_gateway", "server_stack", "javascript_framework",
            "css_framework",
        ):
            if data.get(key) is not None:
                result[key] = data.get(key)
        if result:
            return result

    # Fallback: scan a list of {category, name} entries.
    for tech in _as_list(raw):
        if isinstance(tech, dict):
            category = tech.get("category")
            name = tech.get("name")
            if category and name:
                key = {
                    "CMS": "cms",
                    "Frontend Framework": "frontend_framework",
                    "JavaScript Framework": "javascript_framework",
                    "CSS Framework": "css_framework",
                    "Backend Framework": "backend_framework",
                    "Programming Language": "server_stack",
                    "Hosting": "hosting",
                    "CDN": "cdn",
                    "Analytics": "analytics",
                    "Payment Gateway": "payment_gateway",
                }.get(category)
                if key:
                    result[key] = name
    return result


def _normalize_social(raw: Any, *, social_links: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Canonicalize social profiles into the SocialMedia model shape."""
    result: Dict[str, Any] = {}
    data = _as_dict(raw)
    for key in ("facebook", "instagram", "linkedin", "youtube", "twitter", "threads", "telegram", "github"):
        value = data.get(key) or (social_links or {}).get(key)
        if value:
            result[key] = value
    # Pull any social handles out of a contacts list too.
    return result


def _normalize_contacts(raw: Any) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for contact in _as_list(raw):
        if isinstance(contact, dict):
            result.append({
                "type": contact.get("type"),
                "value": contact.get("value"),
                "classification": contact.get("classification"),
                "source_url": contact.get("source_url"),
            })
        elif hasattr(contact, "type"):
            result.append({
                "type": getattr(contact, "type", None),
                "value": getattr(contact, "value", None),
                "classification": getattr(contact, "classification", None),
                "source_url": getattr(contact, "source_url", None),
            })
    return result


def canonicalize_lead_document(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Return an idempotent, canonical version of a raw Lead document."""
    doc = dict(raw)

    # 1. recommendations -> flat strings
    ai = doc.get("ai_analysis")
    if isinstance(ai, dict):
        recs = ai.get("recommendations")
        if recs is not None:
            ai["recommendations"] = _flatten_recommendations(recs)

    # 2. technology_detection
    for key in ("technology_detection", "technology", "technologies"):
        if key in doc and doc[key] is not None:
            tech = _normalize_technology(doc[key])
            if tech:
                doc["technology_detection"] = tech
            if key != "technology_detection":
                doc.pop(key, None)
            break

    # 3. social_media
    social_links = _as_dict(ai).get("social_links") if isinstance(ai, dict) else None
    for key in ("social_media", "social_profiles", "social"):
        if key in doc and doc[key] is not None:
            social = _normalize_social(doc[key], social_links=social_links)
            if social:
                doc["social_media"] = social
            if key != "social_media":
                doc.pop(key, None)
            break

    # 4. contacts
    if "contacts" in doc and doc["contacts"] is not None:
        doc["contacts"] = _normalize_contacts(doc["contacts"])

    # 5. top-level scores folded into ai_analysis for a single source of truth
    if isinstance(ai, dict):
        for score_key in ("lead_score", "website_score"):
            if doc.get(score_key) is not None and ai.get(score_key) is None:
                ai[score_key] = doc.get(score_key)
        # legacy `analysis` blob folded in
        legacy_analysis = doc.pop("analysis", None)
        if isinstance(legacy_analysis, dict) and not ai.get("analysis_status"):
            ai.update({k: v for k, v in legacy_analysis.items() if k not in ai})

    return doc


def _doc_changed(original: Dict[str, Any], canonical: Dict[str, Any]) -> bool:
    import json
    try:
        return json.dumps(original, default=str, sort_keys=True) != json.dumps(canonical, default=str, sort_keys=True)
    except Exception:
        return True


async def migrate() -> Dict[str, int]:
    await connect_to_mongo()
    db = db_instance.db
    if db is None:
        raise RuntimeError("Database connection unavailable.")

    total = await db["leads"].count_documents({})
    processed = 0
    updated = 0
    failed = 0

    logger.info(f"[MIGRATION] Starting Lead schema migration for {total} documents.")

    cursor = db["leads"].find({})
    async for lead in cursor:
        processed += 1
        lead_id = lead.get("_id")
        try:
            canonical = canonicalize_lead_document(lead)
            if _doc_changed(lead, canonical):
                await db["leads"].update_one({"_id": lead_id}, {"$set": canonical})
                updated += 1
        except Exception as e:
            failed += 1
            logger.error(f"[MIGRATION] Failed to migrate lead {lead_id}: {e}")

        if processed % 100 == 0:
            logger.info(f"[MIGRATION] Progress: {processed}/{total} (updated={updated}, failed={failed})")

    logger.info(
        f"[MIGRATION] Complete. processed={processed} updated={updated} failed={failed} total={total}"
    )
    return {"processed": processed, "updated": updated, "failed": failed, "total": total}


def main() -> None:
    try:
        summary = asyncio.run(migrate())
        logger.info(f"[MIGRATION] Summary: {summary}")
    finally:
        asyncio.run(close_mongo_connection())


if __name__ == "__main__":
    main()
