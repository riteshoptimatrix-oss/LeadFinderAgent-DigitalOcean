import logging
from typing import List, Optional
from app.models.crawl_graph import WebsiteStructureCreate
from app.models.ui_ux_audit import (
    PerformanceMetrics, UXMetrics, UIMetrics, 
    DesignRecommendation, WebsiteDesignAuditCreate
)
from app.models.seo_audit import LighthouseMetrics

logger = logging.getLogger(__name__)

class DesignAuditService:
    def __init__(self):
        pass

    def _evaluate_performance(self, lighthouse: Optional[LighthouseMetrics]) -> tuple[int, Optional[PerformanceMetrics], List[DesignRecommendation]]:
        recommendations = []
        score = 100
        
        if not lighthouse:
            return 50, None, [DesignRecommendation(category="Performance", issue="No performance data available", impact="Medium", action="Configure PageSpeed API to get real performance metrics.")]
            
        metrics = PerformanceMetrics()
        
        try:
            def parse_time(val):
                if not val: return None
                try:
                    num = float(val.replace('s', '').replace(',', '').strip())
                    return int(num * 1000)
                except:
                    return None
                    
            metrics.fcp_ms = parse_time(lighthouse.first_contentful_paint)
            metrics.lcp_ms = parse_time(lighthouse.largest_contentful_paint)
            metrics.tbt_ms = parse_time(lighthouse.total_blocking_time)
            metrics.server_response_time_ms = metrics.fcp_ms - 200 if metrics.fcp_ms else None # Approximation
            metrics.ttfb_ms = metrics.server_response_time_ms
            
            try:
                metrics.cls_score = float(lighthouse.cumulative_layout_shift) if lighthouse.cumulative_layout_shift else None
            except:
                pass
                
        except Exception as e:
            logger.error(f"Error parsing lighthouse times: {e}")

        if lighthouse.performance_score is not None:
            score = lighthouse.performance_score
            if score < 50:
                recommendations.append(DesignRecommendation(category="Performance", issue="Poor overall performance", impact="High", action="Optimize images and defer non-critical JavaScript."))
            elif score < 90:
                recommendations.append(DesignRecommendation(category="Performance", issue="Sub-optimal performance", impact="Medium", action="Implement aggressive caching and minimize render-blocking resources."))
        
        metrics.js_size_kb = 500 # Heuristic defaults
        metrics.css_size_kb = 150
        metrics.image_optimization_score = score
        metrics.caching_score = score
        
        return score, metrics, recommendations

    def _evaluate_ux(self, structure: WebsiteStructureCreate, lighthouse: Optional[LighthouseMetrics]) -> tuple[int, UXMetrics, List[DesignRecommendation]]:
        recommendations = []
        score = 100
        metrics = UXMetrics()
        
        total_pages = len(structure.nodes)
        if total_pages == 0:
            return 0, metrics, []
            
        total_ctas = sum(n.ux_data.get('cta_count', 0) if n.ux_data else 0 for n in structure.nodes)
        total_trust_signals = sum(n.ux_data.get('trust_signals_count', 0) if n.ux_data else 0 for n in structure.nodes)
        
        # Navigation
        if structure.max_depth > 4:
            score -= 10
            metrics.navigation_clarity_score = 60
            recommendations.append(DesignRecommendation(category="UX", issue="Deep navigation structure", impact="Medium", action="Flatten site architecture to ensure users find content within 3 clicks."))
        else:
            metrics.navigation_clarity_score = 90
            
        # CTAs
        if total_ctas == 0:
            score -= 20
            metrics.cta_visibility_score = 30
            recommendations.append(DesignRecommendation(category="UX", issue="Missing Call-to-Action buttons", impact="High", action="Add prominent CTA buttons (e.g. 'Contact Us', 'Buy Now') to drive conversions."))
        else:
            metrics.cta_visibility_score = min(100, 50 + (total_ctas * 5))
            
        # Accessibility & Responsive Layout
        if lighthouse and lighthouse.accessibility_score is not None:
            metrics.accessibility_score = lighthouse.accessibility_score
            metrics.responsive_layout_score = lighthouse.accessibility_score
        else:
            metrics.accessibility_score = 70
            metrics.responsive_layout_score = 80
            
        metrics.mobile_layout_score = metrics.responsive_layout_score
        metrics.trust_signals_score = min(100, 60 + (total_trust_signals * 10))
        metrics.readability_score = 85
        metrics.user_journey_score = int((metrics.navigation_clarity_score + metrics.cta_visibility_score) / 2)
        
        # Aggregate Score
        score = int((metrics.navigation_clarity_score + metrics.cta_visibility_score + metrics.accessibility_score + metrics.responsive_layout_score) / 4)
        
        return max(0, score), metrics, recommendations

    def _evaluate_ui(self, structure: WebsiteStructureCreate) -> tuple[int, UIMetrics, List[DesignRecommendation]]:
        recommendations = []
        score = 100
        metrics = UIMetrics()
        
        total_pages = len(structure.nodes)
        if total_pages == 0:
            return 0, metrics, []
            
        total_h1 = sum(n.seo_data.get('h1_count', 0) if n.seo_data else 0 for n in structure.nodes)
        total_h2 = sum(n.seo_data.get('h2_count', 0) if n.seo_data else 0 for n in structure.nodes)
        
        if total_h1 == 0 and total_h2 == 0:
            score -= 20
            metrics.typography_score = 40
            metrics.visual_hierarchy_score = 40
            recommendations.append(DesignRecommendation(category="UI", issue="Poor typographic hierarchy", impact="High", action="Use clear headings (H1, H2) to structure content visually."))
        else:
            metrics.typography_score = 90
            metrics.visual_hierarchy_score = 85
            
        metrics.color_consistency_score = 85
        metrics.brand_consistency_score = 80
        metrics.spacing_score = 80
        
        score = int((metrics.typography_score + metrics.visual_hierarchy_score + metrics.color_consistency_score + metrics.brand_consistency_score + metrics.spacing_score) / 5)
        
        return max(0, score), metrics, recommendations

    async def perform_audit(self, lead_id: str, base_url: str, structure: WebsiteStructureCreate, lighthouse: Optional[LighthouseMetrics] = None) -> WebsiteDesignAuditCreate:
        
        perf_score, perf_metrics, perf_recs = self._evaluate_performance(lighthouse)
        ux_score, ux_metrics, ux_recs = self._evaluate_ux(structure, lighthouse)
        ui_score, ui_metrics, ui_recs = self._evaluate_ui(structure)
        
        overall_score = int((perf_score + ux_score + ui_score) / 3)
        all_recs = perf_recs + ux_recs + ui_recs
        
        return WebsiteDesignAuditCreate(
            lead_id=lead_id,
            base_url=base_url,
            ui_score=ui_score,
            ux_score=ux_score,
            performance_score=perf_score,
            website_quality_score=overall_score,
            performance_metrics=perf_metrics,
            ux_metrics=ux_metrics,
            ui_metrics=ui_metrics,
            recommendations=all_recs
        )
