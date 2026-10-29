"""HTML Report Generator"""
import os
from datetime import datetime
from typing import Dict, Any
from jinja2 import Environment, FileSystemLoader, select_autoescape
import logging

from app.models.report import ReportType, ReportMetadata

logger = logging.getLogger(__name__)

class HTMLReportGenerator:
    def __init__(self):
        self.reports_dir = "reports/html"
        os.makedirs(self.reports_dir, exist_ok=True)
        self.templates_dir = "app/services/reports/templates"
        os.makedirs(self.templates_dir, exist_ok=True)
        self._create_default_template()
        self.env = Environment(
            loader=FileSystemLoader(self.templates_dir),
            autoescape=select_autoescape(['html', 'xml'])
        )
    
    def _create_default_template(self):
        template_path = os.path.join(self.templates_dir, "report_template.html")
        if not os.path.exists(template_path):
            with open(template_path, 'w') as f:
                f.write('''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{{ report_type }}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; background: #f3f4f6; color: #1f2937; }
        .container { max-width: 1000px; margin: 0 auto; background: white; padding: 50px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-radius: 12px; }
        .header { text-align: center; border-bottom: 4px solid #3B82F6; padding-bottom: 30px; margin-bottom: 40px; }
        h1 { color: #1E40AF; margin: 0 0 10px 0; font-size: 2.5em; }
        h2 { color: #2563eb; margin-top: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
        h3 { color: #4b5563; }
        .section { margin: 40px 0; }
        .score-card { background: #eff6ff; padding: 25px; border-radius: 10px; margin: 20px 0; text-align: center; border: 1px solid #bfdbfe; }
        .score { font-size: 56px; color: #10b981; font-weight: bold; line-height: 1; }
        table { width: 100%; border-collapse: collapse; margin: 25px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        th { background: #3B82F6; color: white; padding: 15px; text-align: left; font-weight: 600; }
        td { padding: 15px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) { background: #f9fafb; }
        .issue, .finding, .recommendation, .opportunity { margin: 15px 0; padding: 15px; border-radius: 6px; }
        .issue { background: #fef2f2; border-left: 4px solid #ef4444; }
        .finding { background: #fffbeb; border-left: 4px solid #f59e0b; }
        .recommendation { background: #ecfdf5; border-left: 4px solid #10b981; }
        .opportunity { background: #f0fdf4; border-left: 4px solid #22c55e; }
        .tech-item, .contact-item { display: inline-block; background: #e5e7eb; padding: 5px 10px; border-radius: 15px; margin: 5px; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{ report_type }}</h1>
            <p><strong>Business:</strong> {{ lead.name }}</p>
            <p><strong>Website:</strong> {{ lead.website }}</p>
            <p><strong>Generated:</strong> {{ generated_date }}</p>
        </div>
        <div class="content">
            {{ content | safe }}
        </div>
    </div>
</body>
</html>''')
    
    async def generate(self, report_id: str, report_data: Dict[str, Any],
                      report_type: ReportType, metadata: ReportMetadata) -> tuple[str, int]:
        filename = f"{report_id}_{report_type.value.replace(' ', '_')}.html"
        file_path = os.path.join(self.reports_dir, filename)
        
        content = self._generate_content(report_data, report_type)
        
        template = self.env.get_template('report_template.html')
        html_output = template.render(
            report_type=report_type.value,
            lead=report_data.get('lead', {}),
            generated_date=datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC'),
            content=content
        )
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html_output)
        
        file_size = os.path.getsize(file_path)
        return file_path, file_size
    
    def _generate_content(self, data: Dict, report_type: ReportType) -> str:
        if report_type == ReportType.EXECUTIVE_SUMMARY:
            return self._executive_summary_content(data)
        elif report_type == ReportType.COMPLETE_AUDIT:
            html = self._executive_summary_content(data)
            html += self._seo_content(data)
            html += self._performance_content(data)
            html += self._ui_ux_content(data, "UI/UX Analysis")
            html += self._uiux_audit_content(data)
            html += self._security_content(data)
            return html
        elif report_type == ReportType.SEO_REPORT or report_type == ReportType.TECHNICAL_SEO:
            return self._seo_content(data)
        elif report_type == ReportType.PERFORMANCE:
            return self._performance_content(data)
        elif report_type == ReportType.UI_ANALYSIS:
            return self._ui_ux_content(data, "UI Analysis Report") + self._uiux_audit_content(data)
        elif report_type == ReportType.UX_ANALYSIS:
            return self._ui_ux_content(data, "UX Analysis Report") + self._uiux_audit_content(data)
        elif report_type == ReportType.ACCESSIBILITY:
            return self._accessibility_content(data)
        elif report_type == ReportType.SECURITY:
            return self._security_content(data)
        elif report_type == ReportType.TECHNOLOGY_STACK:
            return self._technology_content(data)
        elif report_type == ReportType.CONTACT_DISCOVERY:
            return self._contact_content(data)
        elif report_type == ReportType.BUSINESS_OPPORTUNITY:
            return self._business_content(data)
        elif report_type == ReportType.AI_RECOMMENDATIONS:
            return self._ai_recommendations_content(data)
        elif report_type == ReportType.PROPOSAL or report_type == ReportType.CLIENT_PRESENTATION:
            return self._proposal_content(data)
            
        return "<p>Report content</p>"
    
    def _executive_summary_content(self, data: Dict) -> str:
        ai = data.get('ai_analysis', {})
        html = '<div class="section"><h2>Overall Scores</h2>'
        html += '<div class="score-card">'
        html += f'<div class="score">{ai.get("overall_ai_score", "N/A")}/100</div>'
        html += '<p>Overall Website Score</p></div>'
        
        html += '<table><tr><th>Metric</th><th>Score</th></tr>'
        html += f'<tr><td>Business Opportunity</td><td>{ai.get("business_opportunity_score", "N/A")}/100</td></tr>'
        html += f'<tr><td>Lead Priority</td><td>{ai.get("lead_priority_score", "N/A")}/100</td></tr>'
        html += '</table></div>'
        
        recs = ai.get('recommendations', [])
        if recs:
            html += '<div class="section"><h2>Top Recommendations</h2>'
            for rec in recs[:5]:
                html += f'<div class="recommendation">{rec}</div>'
            html += '</div>'
            
        return html
    
    def _seo_content(self, data: Dict) -> str:
        seo = data.get('seo_analysis', {})
        if not seo:
            return "<p>No SEO data available</p>"
        
        scorecard = seo.get('scorecard', {})
        html = '<div class="section"><h2>SEO Scorecard</h2><table>'
        html += '<tr><th>Category</th><th>Score</th></tr>'
        html += f'<tr><td>Overall SEO</td><td>{scorecard.get("overall_score", 0)}/100</td></tr>'
        html += f'<tr><td>Technical SEO</td><td>{scorecard.get("technical_score", 0)}/100</td></tr>'
        html += f'<tr><td>Content Quality</td><td>{scorecard.get("content_score", 0)}/100</td></tr>'
        html += '</table></div>'
        
        issues = seo.get('issues', [])
        if issues:
            html += '<div class="section"><h2>Issues Found</h2>'
            for issue in issues[:10]:
                html += f'<div class="issue"><strong>{issue.get("severity", "N/A")}</strong>: {issue.get("description", "N/A")}</div>'
            html += '</div>'
        
        return html
    
    def _performance_content(self, data: Dict) -> str:
        perf = data.get('performance_analysis', {})
        if not perf:
            return "<p>No performance data available</p>"
        
        scorecard = perf.get('scorecard', {})
        html = '<div class="section"><h2>Performance Scores</h2><table>'
        html += '<tr><th>Metric</th><th>Score</th></tr>'
        html += f'<tr><td>Overall Desktop</td><td>{scorecard.get("overall_desktop_score", 0)}/100</td></tr>'
        html += f'<tr><td>Overall Mobile</td><td>{scorecard.get("overall_mobile_score", 0)}/100</td></tr>'
        html += f'<tr><td>Core Web Vitals</td><td>{scorecard.get("core_web_vitals_score", 0)}/100</td></tr>'
        html += '</table></div>'
        
        suggestions = perf.get('optimization_suggestions', [])
        if suggestions:
            html += '<div class="section"><h2>Optimization Suggestions</h2>'
            for sug in suggestions[:10]:
                html += f'<div class="finding">{sug.get("description", "N/A")}</div>'
            html += '</div>'
            
        return html

    def _ui_ux_content(self, data: Dict, title: str) -> str:
        uiux = data.get('ui_ux_analysis', {})
        if not uiux:
            return f"<p>No {title} data available</p>"
        
        scorecard = uiux.get('scorecard', {})
        html = f'<div class="section"><h2>{title} Scores</h2><table>'
        html += '<tr><th>Metric</th><th>Score</th></tr>'
        html += f'<tr><td>Overall UI</td><td>{scorecard.get("overall_ui_score", 0)}/100</td></tr>'
        html += f'<tr><td>Overall UX</td><td>{scorecard.get("overall_ux_score", 0)}/100</td></tr>'
        html += f'<tr><td>Mobile Responsiveness</td><td>{scorecard.get("mobile_responsiveness_score", 0)}/100</td></tr>'
        html += '</table></div>'
        
        problems = uiux.get('problems', [])
        if problems:
            html += '<div class="section"><h2>Identified Problems</h2>'
            for prob in problems[:10]:
                html += f'<div class="issue">{prob.get("description", "N/A")}</div>'
            html += '</div>'
            
        return html

    def _uiux_audit_content(self, data: Dict) -> str:
        uiux = data.get('uiux_audit', {})
        if not uiux:
            return "<p>No Website UI/UX Intelligence data available</p>"

        html = '<div class="section"><h2>Website UI/UX Intelligence</h2>'
        html += '<div class="score-card">'
        html += f'<div class="score">{uiux.get("overallScore", "N/A")}/100</div>'
        html += f'<p>Overall UI/UX Score &nbsp;|&nbsp; Grade: <strong>{uiux.get("grade", "N/A")}</strong> &nbsp;|&nbsp; {uiux.get("overallStatus", "N/A")}</p></div>'

        module_map = {
            'visualDesign': 'Visual Design',
            'colors': 'Colors',
            'typography': 'Typography',
            'layout': 'Layout',
            'navigation': 'Navigation',
            'cta': 'Call-to-Action',
            'responsive': 'Responsive',
            'mobile': 'Mobile',
            'forms': 'Forms',
            'ux': 'UX',
            'content': 'Content',
            'images': 'Images',
            'icons': 'Icons',
            'branding': 'Branding',
            'accessibility': 'Accessibility',
            'modernDesign': 'Modern Design',
            'trust': 'Trust',
        }
        html += '<table><tr><th>Module</th><th>Score</th><th>Status</th><th>Issues</th><th>Recommendations</th></tr>'
        for key, label in module_map.items():
            section = uiux.get(key, {}) or {}
            if isinstance(section, dict) and section.get('score') is not None:
                html += f'<tr><td>{label}</td><td>{section.get("score", "N/A")}/100</td>'
                html += f'<td>{section.get("status", "N/A")}</td>'
                html += f'<td>{section.get("issueCount", "N/A")}</td>'
                html += f'<td>{section.get("recommendationCount", "N/A")}</td></tr>'
        html += '</table>'

        redesign = uiux.get('redesignOpportunity', {}) or {}
        if isinstance(redesign, dict) and redesign.get('rationale'):
            html += '<div class="section"><h3>Redesign Opportunity</h3>'
            html += f'<div class="opportunity"><strong>{redesign.get("opportunityLevel", "N/A")}</strong>'
            html += f' &nbsp;Score: {redesign.get("score", "N/A")}/100'
            html += f'<br>{redesign.get("rationale", "")}</div></div>'

        sales_opp = uiux.get('salesOpportunity', {}) or {}
        if isinstance(sales_opp, dict) and sales_opp.get('pitchSummary'):
            html += '<div class="section"><h3>Sales Opportunity</h3>'
            html += f'<div class="opportunity"><strong>{sales_opp.get("opportunityLevel", "N/A")}</strong>'
            html += f' &nbsp;Score: {sales_opp.get("score", "N/A")}/100'
            html += f'<br>{sales_opp.get("pitchSummary", "")}</div></div>'

        issues = uiux.get('issues', []) or []
        if issues:
            html += '<div class="section"><h2>Visual Issues</h2>'
            for issue in issues[:10]:
                severity = issue.get("severity", "N/A")
                html += f'<div class="issue"><strong>{severity}</strong>'
                if issue.get("category"):
                    html += f' &nbsp;[{issue.get("category")}]'
                html += f': {issue.get("title", issue.get("description", "N/A"))}'
                if issue.get("description") and issue.get("description") != issue.get("title"):
                    html += f' — {issue.get("description")}'
                html += '</div>'
            html += '</div>'

        recs = uiux.get('recommendations', []) or []
        if recs:
            html += '<div class="section"><h2>UI/UX Recommendations</h2>'
            for rec in recs[:10]:
                html += f'<div class="recommendation"><strong>{rec.get("priority", "Medium")}:</strong> {rec.get("title", "N/A")}'
                if rec.get("description"):
                    html += f' — {rec.get("description")}'
                html += '</div>'
            html += '</div>'

        html += '</div>'
        return html

    def _accessibility_content(self, data: Dict) -> str:
        uiux = data.get('ui_ux_analysis', {})
        if not uiux:
            return "<p>No accessibility data available</p>"
            
        scorecard = uiux.get('scorecard', {})
        html = '<div class="section"><h2>Accessibility Score</h2><table>'
        html += '<tr><th>Metric</th><th>Score</th></tr>'
        html += f'<tr><td>Accessibility (WCAG)</td><td>{scorecard.get("accessibility_score", 0)}/100</td></tr>'
        html += '</table></div>'
        return html

    def _security_content(self, data: Dict) -> str:
        security = data.get('security_analysis', {})
        if not security:
            return "<p>No security data available</p>"
            
        scorecard = security.get('scorecard', {})
        html = '<div class="section"><h2>Security Scorecard</h2><table>'
        html += '<tr><th>Category</th><th>Score</th></tr>'
        html += f'<tr><td>Overall Security</td><td>{scorecard.get("overall_security_score", 0)}/100</td></tr>'
        html += f'<tr><td>SSL/TLS</td><td>{scorecard.get("ssl_score", 0)}/100</td></tr>'
        html += f'<tr><td>HTTP Security Headers</td><td>{scorecard.get("http_security_score", 0)}/100</td></tr>'
        html += '</table></div>'
        
        findings = security.get('findings', [])
        if findings:
            html += '<div class="section"><h2>Security Findings</h2>'
            for finding in findings:
                html += f'<div class="issue"><strong>{finding.get("severity", "N/A")}</strong>: {finding.get("description", "N/A")}</div>'
            html += '</div>'
            
        return html

    def _technology_content(self, data: Dict) -> str:
        tech = data.get('technology_detection', {})
        if not tech:
            return "<p>No technology data available</p>"
            
        technologies = tech.get('technologies', {})
        if isinstance(technologies, list):
            if not technologies:
                return '<div class="section"><h2>Detected Technologies</h2><p>None detected</p></div>'
            by_category: Dict[str, List[str]] = {}
            for item in technologies:
                if isinstance(item, dict):
                    category = str(item.get('category', 'Other'))
                    label = item.get('name', '')
                    version = item.get('version')
                    confidence = item.get('confidence_score')
                    if label:
                        if version:
                            label = f"{label} {version}"
                        if confidence is not None:
                            label = f"{label} ({confidence}%)"
                        by_category.setdefault(category, []).append(label)
            technologies = by_category

        html = '<div class="section"><h2>Detected Technologies</h2>'
        
        for category, items in technologies.items():
            html += f'<h3>{str(category).capitalize()}</h3><div>'
            if items:
                for item in items:
                    html += f'<span class="tech-item">{item}</span>'
            else:
                html += '<span>None detected</span>'
            html += '</div>'
            
        html += '</div>'
        return html

    def _contact_content(self, data: Dict) -> str:
        contact = data.get('contact_discovery', {})
        if not contact:
            return "<p>No contact data available</p>"
            
        contacts = contact.get('contacts', {})
        html = '<div class="section"><h2>Discovered Contacts</h2>'
        
        for key in ['emails', 'phones', 'whatsapp', 'social_links']:
            items = contacts.get(key, [])
            html += f'<h3>{str(key).replace("_", " ").capitalize()}</h3><ul>'
            if items:
                for item in items:
                    html += f'<li>{item}</li>'
            else:
                html += '<li>None found</li>'
            html += '</ul>'
            
        html += '</div>'
        return html

    def _business_content(self, data: Dict) -> str:
        business = data.get('business_intelligence', {})
        if not business:
            return "<p>No business intelligence data available</p>"
            
        scorecard = business.get('scorecard', {})
        html = '<div class="section"><h2>Business Scores</h2><table>'
        html += '<tr><th>Metric</th><th>Score</th></tr>'
        html += f'<tr><td>Business Opportunity</td><td>{scorecard.get("business_opportunity_score", 0)}/100</td></tr>'
        html += f'<tr><td>Lead Priority</td><td>{scorecard.get("lead_priority_score", 0)}/100</td></tr>'
        html += f'<tr><td>Digital Maturity</td><td>{scorecard.get("digital_maturity_score", 0)}/100</td></tr>'
        html += '</table></div>'
        
        opportunities = business.get('opportunities', [])
        if opportunities:
            html += '<div class="section"><h2>Recommended Services & Impact</h2>'
            for opp in opportunities:
                html += f'<div class="opportunity"><strong>{opp.get("opportunity_type", "N/A")}</strong><br>'
                html += f'Impact: {opp.get("estimated_business_impact", "N/A")} | ROI: {opp.get("estimated_roi", "N/A")}</div>'
            html += '</div>'
            
        return html
        
    def _ai_recommendations_content(self, data: Dict) -> str:
        ai = data.get('ai_analysis', {})
        if not ai:
            return "<p>No AI recommendations available</p>"
            
        recs = ai.get('recommendations', [])
        html = '<div class="section"><h2>AI Recommendations</h2>'
        if recs:
            for rec in recs:
                html += f'<div class="recommendation">{rec}</div>'
        else:
            html += '<p>No recommendations available</p>'
        html += '</div>'
        return html

    def _proposal_content(self, data: Dict) -> str:
        business = data.get('business_intelligence', {})
        if not business:
            return "<p>No data available to generate proposal</p>"
            
        html = '<div class="section"><h2>Executive Summary</h2>'
        html += '<p>Based on our comprehensive analysis of your digital presence, we have identified several high-impact areas for improvement.</p></div>'
        
        opportunities = business.get('opportunities', [])
        if opportunities:
            html += '<div class="section"><h2>Proposed Services</h2><table>'
            html += '<tr><th>Service</th><th>Impact</th><th>Priority</th></tr>'
            for opp in opportunities:
                html += f'<tr><td>{opp.get("opportunity_type", "N/A")}</td>'
                html += f'<td>{opp.get("estimated_business_impact", "N/A")}</td>'
                html += f'<td>{opp.get("priority", "N/A")}</td></tr>'
            html += '</table></div>'
            
        return html
