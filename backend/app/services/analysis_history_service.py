"""
Analysis History Service
=========================
Provides versioned analysis history, change detection, and comparison.

This service reads from the Lead document's historical_analyses array
and performs intelligent diff operations to detect:
- New/removed contacts
- Technology stack changes
- SEO improvements/degradations
- Performance trends
- Score deltas
"""

import logging
from typing import Any, Dict, List, Optional, Set
from datetime import datetime

from app.db.database import get_db
from app.models.analysis_history import (
    AnalysisHistorySnapshot,
    AnalysisComparison,
    AnalysisTimelineEntry,
    ContactChange,
    WebsiteChange,
    TechnologyChange,
    ScoreDelta,
    ScoreComparison,
    ChangeSummary,
    AnalysisScoreSummary,
)
from bson import ObjectId

logger = logging.getLogger(__name__)


class AnalysisHistoryService:
    """
    Service for reading and comparing historical AI analyses.
    All data is read from the Lead document (single source of truth).
    """

    # ──────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────

    async def get_latest_analysis(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """
        Returns the current (most recent) analysis for a Lead.
        
        Returns:
            Dict containing the complete Lead analysis snapshot, or None if no analysis exists.
        """
        lead = await self._get_lead(lead_id)
        if not lead or not lead.get("ai_analysis"):
            return None
        
        return self._build_snapshot(lead, is_current=True)

    async def get_analysis_history(self, lead_id: str) -> Dict[str, Any]:
        """
        Returns the complete analysis history for a Lead.
        
        Returns:
            Dict with:
                - lead_id: str
                - count: int (total analyses including current)
                - history: List[Dict] (archived analyses)
                - current: Dict (latest analysis)
                - timeline: List[Dict] (chronological timeline)
        """
        lead = await self._get_lead(lead_id)
        if not lead:
            return {
                "lead_id": lead_id,
                "count": 0,
                "history": [],
                "current": None,
                "timeline": [],
            }
        
        # Build historical snapshots
        historical = []
        for item in lead.get("historical_analyses", []):
            snapshot = self._build_snapshot(item, is_current=False)
            historical.append(snapshot)
        
        # Sort by version
        historical.sort(key=lambda x: x.get("version", 0))
        
        # Build current snapshot
        current = None
        if lead.get("ai_analysis"):
            current = self._build_snapshot(lead, is_current=True)
        
        # Build timeline
        timeline = []
        for h in historical:
            timeline.append(self._build_timeline_entry(h, is_current=False))
        if current:
            timeline.append(self._build_timeline_entry(current, is_current=True))
        
        return {
            "lead_id": lead_id,
            "count": len(historical) + (1 if current else 0),
            "history": historical,
            "current": current,
            "timeline": timeline,
        }

    async def get_analysis_comparison(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """
        Compares the previous analysis with the latest analysis.
        
        Returns:
            Dict with:
                - lead_id: str
                - previous: Dict (previous analysis snapshot)
                - latest: Dict (latest analysis snapshot)
                - comparison: Dict (detailed change detection)
        """
        lead = await self._get_lead(lead_id)
        if not lead or not lead.get("ai_analysis"):
            return None
        
        historical = lead.get("historical_analyses", [])
        historical_snapshots = [self._build_snapshot(item, is_current=False) for item in historical]
        historical_snapshots.sort(key=lambda x: x.get("version", 0))
        
        previous = historical_snapshots[-1] if historical_snapshots else None
        latest = self._build_snapshot(lead, is_current=True)
        
        comparison = self._compare_analyses(previous, latest)
        
        return {
            "lead_id": lead_id,
            "previous": previous,
            "latest": latest,
            "comparison": comparison,
        }

    async def get_analysis_by_version(self, lead_id: str, version: int) -> Optional[Dict[str, Any]]:
        """
        Retrieves a specific analysis version by its version number.
        
        Args:
            lead_id: Lead identifier
            version: Analysis version number (1, 2, 3...)
        
        Returns:
            Analysis snapshot for the specified version, or None if not found.
        """
        lead = await self._get_lead(lead_id)
        if not lead:
            return None
        
        # Check current analysis
        ai_meta = lead.get("ai_analysis", {})
        current_version = ai_meta.get("analysis_count", 0)
        if version == current_version:
            return self._build_snapshot(lead, is_current=True)
        
        # Search historical analyses
        for item in lead.get("historical_analyses", []):
            if item.get("version") == version or item.get("analysis_count") == version:
                return self._build_snapshot(item, is_current=False)
        
        return None

    async def compare_versions(
        self, lead_id: str, version_a: int, version_b: int
    ) -> Optional[Dict[str, Any]]:
        """
        Compares two specific analysis versions.
        
        Args:
            lead_id: Lead identifier
            version_a: First version number (typically older)
            version_b: Second version number (typically newer)
        
        Returns:
            Comparison result similar to get_analysis_comparison.
        """
        snapshot_a = await self.get_analysis_by_version(lead_id, version_a)
        snapshot_b = await self.get_analysis_by_version(lead_id, version_b)
        
        if not snapshot_a or not snapshot_b:
            return None
        
        comparison = self._compare_analyses(snapshot_a, snapshot_b)
        
        return {
            "lead_id": lead_id,
            "previous": snapshot_a,
            "latest": snapshot_b,
            "comparison": comparison,
        }

    # ──────────────────────────────────────────────────────────
    # Private Helpers
    # ──────────────────────────────────────────────────────────

    async def _get_lead(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Fetches the Lead document from MongoDB."""
        db = get_db()
        if db is None:
            return None
        
        # Support both string _id and ObjectId
        query: Dict[str, Any] = {"$or": [{"_id": lead_id}]}
        if ObjectId.is_valid(lead_id):
            query["$or"].append({"_id": ObjectId(lead_id)})
        
        lead = await db["leads"].find_one(query)
        if lead:
            lead["_id"] = str(lead["_id"])
        return lead

    def _build_snapshot(self, source: Dict[str, Any], is_current: bool) -> Dict[str, Any]:
        """
        Builds a standardized analysis snapshot from a Lead or history entry.
        
        Args:
            source: Either a Lead document or a historical_analyses entry
            is_current: True if this is the current analysis
        
        Returns:
            Standardized snapshot dictionary
        """
        ai_meta = source.get("ai_analysis", {}) if is_current else source
        analysis_number = ai_meta.get("analysis_count") or source.get("version", 1)
        
        scores = self._extract_scores(source)
        
        return {
            "version": analysis_number,
            "label": "Current" if is_current else source.get("label", f"Analysis #{analysis_number}"),
            "is_current": is_current,
            "archived_at": source.get("archived_at"),
            "analysis_status": ai_meta.get("analysis_status"),
            "analysis_version": ai_meta.get("analysis_version", "1.0"),
            "analysis_date": ai_meta.get("analysis_completed_at") or ai_meta.get("last_analysis_date") or source.get("analysis_date"),
            "analysis_started_at": ai_meta.get("analysis_started_at"),
            "analysis_completed_at": ai_meta.get("analysis_completed_at"),
            "duration": ai_meta.get("analysis_duration") or source.get("analysis_duration"),
            "scores": scores,
            "overall_score": scores.get("overall_score"),
            "seo_score": scores.get("seo_score"),
            "performance_score": scores.get("performance_score"),
            "ui_score": scores.get("ui_score"),
            "ux_score": scores.get("ux_score"),
            "accessibility_score": scores.get("accessibility_score"),
            "security_score": scores.get("security_score"),
            "business_opportunity": scores.get("business_opportunity"),
            "website_information": source.get("website_information"),
            "website_structure": source.get("website_structure"),
            "contact_discovery": source.get("contact_discovery"),
            "social_media": source.get("social_media"),
            "technology_detection": source.get("technology_detection"),
            "seo": source.get("seo"),
            "performance": source.get("performance"),
            "design": source.get("design"),
            "business": source.get("business"),
        }

    def _build_timeline_entry(self, snapshot: Dict[str, Any], is_current: bool) -> Dict[str, Any]:
        """Builds a compact timeline entry from a snapshot."""
        return {
            "version": snapshot.get("version"),
            "label": snapshot.get("label"),
            "is_current": is_current,
            "analysis_status": snapshot.get("analysis_status"),
            "analysis_date": snapshot.get("analysis_date"),
            "duration": snapshot.get("duration"),
            "scores": snapshot.get("scores", {}),
        }

    def _extract_scores(self, source: Dict[str, Any]) -> Dict[str, Any]:
        """Extracts all scores from a Lead or history entry."""
        if source.get("scores"):
            return source.get("scores", {})
        
        seo = source.get("seo") or {}
        perf = source.get("performance") or {}
        design = source.get("design") or {}
        business = source.get("business") or {}
        
        return {
            "overall_score": business.get("overall_score") or source.get("overall_score"),
            "seo_score": seo.get("seo_score") or source.get("seo_score"),
            "performance_score": perf.get("performance_score") or perf.get("pagespeed") or source.get("performance_score"),
            "ui_score": design.get("ui_score") or source.get("ui_score"),
            "ux_score": design.get("ux_score") or source.get("ux_score"),
            "accessibility_score": design.get("accessibility_score") or source.get("accessibility_score"),
            "security_score": design.get("security_score") or source.get("security_score"),
            "business_opportunity": business.get("business_opportunity_score") or business.get("business_opportunity") or source.get("business_opportunity"),
        }

    def _compare_analyses(
        self, previous: Optional[Dict[str, Any]], latest: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Performs comprehensive diff between two analysis snapshots.
        
        Detects:
            - Contact changes (emails, phones, WhatsApp)
            - Website structure changes (new pages, broken links)
            - Technology stack changes (CMS, hosting, frameworks)
            - Score deltas and trends
        """
        previous = previous or {}
        
        # Extract sub-documents
        prev_cd = previous.get("contact_discovery") or {}
        next_cd = latest.get("contact_discovery") or {}
        prev_ws = previous.get("website_structure") or {}
        next_ws = latest.get("website_structure") or {}
        prev_tech = previous.get("technology_detection") or {}
        next_tech = latest.get("technology_detection") or {}
        prev_scores = previous.get("scores") or {}
        next_scores = latest.get("scores") or {}
        
        # ── Contact Changes ──
        contact_changes = self._detect_contact_changes(prev_cd, next_cd)
        
        # ── Website Changes ──
        website_changes = self._detect_website_changes(prev_ws, next_ws)
        
        # ── Technology Changes ──
        technology_changes = self._detect_technology_changes(prev_tech, next_tech)
        
        # ── Score Comparison ──
        score_comparison = self._compare_scores(prev_scores, next_scores)
        
        # ── SEO & Performance Trends ──
        seo_delta = score_comparison["seo_score"].get("delta")
        perf_delta = score_comparison["performance_score"].get("delta")
        
        seo_improvements = seo_delta is not None and seo_delta > 0
        seo_degradation = seo_delta is not None and seo_delta < 0
        performance_improvement = perf_delta is not None and perf_delta > 0
        performance_degradation = perf_delta is not None and perf_delta < 0
        
        # ── CMS and Hosting Changes ──
        cms_changes = [t for t in technology_changes if t["field"] == "cms"]
        hosting_changes = [t for t in technology_changes if t["field"] == "hosting"]
        
        # ── Human-Readable Summary ──
        change_summary = self._build_change_summary(
            contact_changes,
            website_changes,
            technology_changes,
            score_comparison,
        )
        
        return {
            "previous_version": previous.get("version"),
            "latest_version": latest.get("version"),
            "contact_changes": contact_changes,
            "website_changes": website_changes,
            "technology_changes": technology_changes,
            "seo_improvements": seo_improvements,
            "seo_degradation": seo_degradation,
            "performance_improvement": performance_improvement,
            "performance_degradation": performance_degradation,
            "cms_changes": cms_changes,
            "hosting_changes": hosting_changes,
            "score_difference": score_comparison,
            "change_summary": change_summary,
        }

    def _detect_contact_changes(self, prev: Dict[str, Any], next: Dict[str, Any]) -> Dict[str, Any]:
        """Detects new and removed contacts."""
        prev_emails = self._extract_contacts(prev, ["primary_email", "secondary_emails", "all_emails"])
        next_emails = self._extract_contacts(next, ["primary_email", "secondary_emails", "all_emails"])
        
        prev_phones = self._extract_contacts(prev, ["primary_phone", "secondary_phones"])
        next_phones = self._extract_contacts(next, ["primary_phone", "secondary_phones"])
        
        prev_whatsapp = self._extract_contacts(prev, ["whatsapp_numbers"])
        next_whatsapp = self._extract_contacts(next, ["whatsapp_numbers"])
        
        return {
            "new_emails": sorted(next_emails - prev_emails),
            "removed_emails": sorted(prev_emails - next_emails),
            "new_phones": sorted(next_phones - prev_phones),
            "removed_phones": sorted(prev_phones - next_phones),
            "new_whatsapp": sorted(next_whatsapp - prev_whatsapp),
            "removed_whatsapp": sorted(prev_whatsapp - next_whatsapp),
        }

    def _extract_contacts(self, source: Dict[str, Any], keys: List[str]) -> Set[str]:
        """Extracts and deduplicates contacts from specified fields."""
        contacts = set()
        for key in keys:
            value = source.get(key)
            if value:
                if isinstance(value, list):
                    contacts.update(str(v) for v in value if v)
                else:
                    contacts.add(str(value))
        return contacts

    def _detect_website_changes(self, prev: Dict[str, Any], next: Dict[str, Any]) -> Dict[str, Any]:
        """Detects changes in website structure."""
        prev_pages = prev.get("total_pages") or 0
        next_pages = next.get("total_pages") or 0
        prev_broken = prev.get("broken_links") or 0
        next_broken = next.get("broken_links") or 0
        
        return {
            "new_pages": max(0, next_pages - prev_pages),
            "removed_pages": max(0, prev_pages - next_pages),
            "new_broken_links": max(0, next_broken - prev_broken),
            "fixed_links": max(0, prev_broken - next_broken),
        }

    def _detect_technology_changes(
        self, prev: Dict[str, Any], next: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Detects changes in technology stack."""
        tech_keys = [
            "cms", "frontend_framework", "backend_framework", "hosting", "cdn",
            "analytics", "server_stack", "javascript_framework", "css_framework",
            "payment_gateway",
        ]
        
        changes = []
        for key in tech_keys:
            old = prev.get(key)
            new = next.get(key)
            
            if old != new:
                if not old and new:
                    change_type = "added"
                elif old and not new:
                    change_type = "removed"
                elif old and new:
                    change_type = "changed"
                else:
                    continue
                
                changes.append({
                    "field": key,
                    "previous": old,
                    "latest": new,
                    "change_type": change_type,
                })
        
        return changes

    def _compare_scores(self, prev: Dict[str, Any], next: Dict[str, Any]) -> Dict[str, Any]:
        """Compares all score metrics."""
        score_keys = [
            "overall_score", "seo_score", "performance_score", "ui_score",
            "ux_score", "accessibility_score", "security_score", "business_opportunity",
        ]
        
        comparison = {}
        for key in score_keys:
            comparison[key] = self._calculate_score_delta(
                prev.get(key), next.get(key)
            )
        
        return comparison

    def _calculate_score_delta(self, previous: Any, latest: Any) -> Dict[str, Any]:
        """Calculates delta and direction for a single score."""
        old = self._as_number(previous)
        new = self._as_number(latest)
        
        delta = None
        if old is not None and new is not None:
            delta = round(new - old, 2)
        
        direction = "unchanged"
        if delta is not None:
            if delta > 0:
                direction = "improved"
            elif delta < 0:
                direction = "degraded"
        
        return {
            "previous": old,
            "latest": new,
            "delta": delta,
            "direction": direction,
        }

    def _as_number(self, value: Any) -> Optional[float]:
        """Safely converts a value to a number."""
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _build_change_summary(
        self,
        contact_changes: Dict[str, Any],
        website_changes: Dict[str, Any],
        technology_changes: List[Dict[str, Any]],
        score_comparison: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Builds a human-readable summary of all changes."""
        # Aggregate all new contacts
        new_contacts = (
            contact_changes.get("new_emails", []) +
            contact_changes.get("new_phones", []) +
            contact_changes.get("new_whatsapp", [])
        )
        
        # Aggregate all removed contacts
        removed_contacts = (
            contact_changes.get("removed_emails", []) +
            contact_changes.get("removed_phones", []) +
            contact_changes.get("removed_whatsapp", [])
        )
        
        # New technologies (only additions)
        new_technologies = [
            t for t in technology_changes if t.get("change_type") == "added"
        ]
        
        # Website improvements
        improvements = []
        if website_changes.get("new_pages", 0) > 0:
            improvements.append(f"{website_changes['new_pages']} new pages discovered")
        if website_changes.get("fixed_links", 0) > 0:
            improvements.append(f"{website_changes['fixed_links']} broken links fixed")
        
        # Check score improvements
        for key in ["seo_score", "performance_score", "ui_score", "ux_score"]:
            delta = score_comparison.get(key, {}).get("delta")
            if delta and delta > 0:
                label = key.replace("_", " ").title()
                improvements.append(f"{label} improved by {delta:.1f} points")
        
        # Website issues
        issues = []
        if website_changes.get("new_broken_links", 0) > 0:
            issues.append(f"{website_changes['new_broken_links']} new broken links detected")
        
        # Check score degradations
        for key in ["seo_score", "performance_score", "ui_score", "ux_score"]:
            delta = score_comparison.get(key, {}).get("delta")
            if delta and delta < 0:
                label = key.replace("_", " ").title()
                issues.append(f"{label} degraded by {abs(delta):.1f} points")
        
        return {
            "new_contacts_discovered": sorted(new_contacts),
            "removed_contacts": sorted(removed_contacts),
            "new_technologies": new_technologies,
            "website_improvements": improvements,
            "website_issues": issues,
            "score_difference": score_comparison,
        }


# ── Singleton instance ────────────────────────────────────────────────────
analysis_history_service = AnalysisHistoryService()
