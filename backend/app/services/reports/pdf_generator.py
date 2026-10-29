"""PDF Report Generator - Creates professional PDF reports from real analysis data"""
import os
from datetime import datetime
from typing import Dict, Any
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
import logging

from app.models.report import ReportType, ReportMetadata

logger = logging.getLogger(__name__)

class PDFReportGenerator:
    def __init__(self):
        self.reports_dir = "reports/pdf"
        os.makedirs(self.reports_dir, exist_ok=True)
        self.styles = getSampleStyleSheet()
        self._setup_styles()
    
    def _setup_styles(self):
        self.styles.add(ParagraphStyle(name='ReportTitle', parent=self.styles['Heading1'],
                                       fontSize=24, textColor=colors.HexColor('#1E40AF'),
                                       spaceAfter=30, alignment=TA_CENTER, bold=True))
        self.styles.add(ParagraphStyle(name='SectionHeading', parent=self.styles['Heading2'],
                                       fontSize=16, textColor=colors.HexColor('#3B82F6'),
                                       spaceBefore=20, spaceAfter=12, bold=True))
    
    async def generate(self, report_id: str, report_data: Dict[str, Any],
                      report_type: ReportType, metadata: ReportMetadata) -> tuple[str, int]:
        filename = f"{report_id}_{report_type.value.replace(' ', '_')}.pdf"
        file_path = os.path.join(self.reports_dir, filename)
        
        doc = SimpleDocTemplate(file_path, pagesize=letter)
        story = []
        
        # Cover Page
        story.extend(self._create_cover_page(report_data, report_type, metadata))
        story.append(PageBreak())
        
        # Content based on report type
        if report_type == ReportType.EXECUTIVE_SUMMARY:
            story.extend(self._create_executive_summary(report_data))
        elif report_type == ReportType.COMPLETE_AUDIT:
            story.extend(self._create_complete_audit(report_data))
        elif report_type == ReportType.SEO_REPORT:
            story.extend(self._create_seo_report(report_data))
        elif report_type == ReportType.TECHNICAL_SEO:
            story.extend(self._create_seo_report(report_data)) # Fallback to SEO report structure
        elif report_type == ReportType.PERFORMANCE:
            story.extend(self._create_performance_report(report_data))
        elif report_type == ReportType.UI_ANALYSIS:
            story.extend(self._create_ui_ux_report(report_data, title="UI Analysis Report"))
            story.extend(self._create_uiux_audit_report(report_data))
        elif report_type == ReportType.UX_ANALYSIS:
            story.extend(self._create_ui_ux_report(report_data, title="UX Analysis Report"))
            story.extend(self._create_uiux_audit_report(report_data))
        elif report_type == ReportType.ACCESSIBILITY:
            story.extend(self._create_accessibility_report(report_data))
        elif report_type == ReportType.SECURITY:
            story.extend(self._create_security_report(report_data))
        elif report_type == ReportType.TECHNOLOGY_STACK:
            story.extend(self._create_technology_report(report_data))
        elif report_type == ReportType.CONTACT_DISCOVERY:
            story.extend(self._create_contact_report(report_data))
        elif report_type == ReportType.BUSINESS_OPPORTUNITY:
            story.extend(self._create_business_report(report_data))
        elif report_type == ReportType.AI_RECOMMENDATIONS:
            story.extend(self._create_ai_recommendations_report(report_data))
        elif report_type == ReportType.PROPOSAL:
            story.extend(self._create_proposal_report(report_data, "Proposal Report"))
        elif report_type == ReportType.CLIENT_PRESENTATION:
            story.extend(self._create_proposal_report(report_data, "Client Presentation Report"))
        
        doc.build(story)
        file_size = os.path.getsize(file_path)
        return file_path, file_size
    
    def _create_cover_page(self, data: Dict, report_type: ReportType, metadata: ReportMetadata):
        elements = []
        elements.append(Spacer(1, 2*inch))
        elements.append(Paragraph(report_type.value, self.styles['ReportTitle']))
        elements.append(Spacer(1, 0.5*inch))
        
        lead = data.get('lead', {})
        info = [[Paragraph("<b>Business Name:</b>", self.styles['Normal']),
                Paragraph(lead.get('name', 'N/A'), self.styles['Normal'])],
               [Paragraph("<b>Website:</b>", self.styles['Normal']),
                Paragraph(lead.get('website', 'N/A'), self.styles['Normal'])],
               [Paragraph("<b>Analysis Date:</b>", self.styles['Normal']),
                Paragraph(datetime.utcnow().strftime('%Y-%m-%d'), self.styles['Normal'])],
               [Paragraph("<b>Report Version:</b>", self.styles['Normal']),
                Paragraph(metadata.report_version, self.styles['Normal'])],
               [Paragraph("<b>Generated By:</b>", self.styles['Normal']),
                Paragraph(metadata.generated_by or "Lead Finder Agent", self.styles['Normal'])]]
        
        table = Table(info, colWidths=[2*inch, 4*inch])
        table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP'),
                                  ('PADDING', (0,0), (-1,-1), 12)]))
        elements.append(table)
        return elements
    
    def _create_executive_summary(self, data: Dict):
        elements = []
        elements.append(Paragraph("Executive Summary", self.styles['ReportTitle']))
        
        ai_analysis = data.get('ai_analysis', {})
        
        # Overall Scores
        elements.append(Paragraph("Overall Scores", self.styles['SectionHeading']))
        scores = [
            ['Metric', 'Score'],
            ['Overall Website Score', str(ai_analysis.get('overall_ai_score', 'N/A'))],
            ['Business Opportunity', str(ai_analysis.get('business_opportunity_score', 'N/A'))],
            ['Lead Priority', str(ai_analysis.get('lead_priority_score', 'N/A'))]
        ]
        
        score_table = Table(scores, colWidths=[3*inch, 2*inch])
        score_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 14),
            ('BOTTOMPADDING', (0,0), (-1,0), 12),
            ('BACKGROUND', (0,1), (-1,-1), colors.beige),
            ('GRID', (0,0), (-1,-1), 1, colors.black)
        ]))
        elements.append(score_table)
        elements.append(Spacer(1, 0.5*inch))
        
        # Recommendations
        recommendations = ai_analysis.get('recommendations', [])
        if recommendations:
            elements.append(Paragraph("Top Recommendations & Quick Wins", self.styles['SectionHeading']))
            for rec in recommendations[:5]:
                elements.append(Paragraph(f"• {rec}", self.styles['Normal']))
            elements.append(Spacer(1, 0.3*inch))
        
        return elements
    
    def _create_complete_audit(self, data: Dict):
        elements = self._create_executive_summary(data)
        elements.append(PageBreak())
        elements.extend(self._create_seo_report(data))
        elements.append(PageBreak())
        elements.extend(self._create_performance_report(data))
        elements.append(PageBreak())
        elements.extend(self._create_ui_ux_report(data, "UI/UX Analysis"))
        elements.append(PageBreak())
        elements.extend(self._create_security_report(data))
        elements.append(PageBreak())
        elements.extend(self._create_technology_report(data))
        elements.append(PageBreak())
        elements.extend(self._create_performance_audit_report(data))
        elements.append(PageBreak())
        elements.extend(self._create_security_audit_report(data))
        elements.append(PageBreak())
        elements.extend(self._create_seo_audit_report(data))
        elements.append(PageBreak())
        elements.extend(self._create_uiux_audit_report(data))
        return elements

    def _create_performance_audit_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("Website Performance Audit", self.styles['ReportTitle']))

        perf_audit = data.get('performance_audit', {})
        if not perf_audit:
            elements.append(Paragraph("No performance audit data available", self.styles['Normal']))
            return elements

        elements.append(Paragraph("Overall Score", self.styles['SectionHeading']))
        overview = [['Metric', 'Value'],
                    ['Overall Score', f"{perf_audit.get('overallScore', 0)}/100"],
                    ['Grade', perf_audit.get('grade', 'N/A')],
                    ['Audit Time', f"{perf_audit.get('auditTime', 0):.0f} ms"]]

        overview_table = Table(overview, colWidths=[3 * inch, 2 * inch])
        overview_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(overview_table)
        elements.append(Spacer(1, 0.3 * inch))

        for section_name, section_title in (
            ('coreWebVitals', 'Core Web Vitals'),
            ('websiteSpeed', 'Website Speed'),
        ):
            section = perf_audit.get(section_name, {}) or {}
            if not isinstance(section, dict):
                continue
            rows = [['Metric', 'Value', 'Status']]
            for key, value in section.items():
                if isinstance(value, dict):
                    label = value.get('label')
                    if not label and (value.get('value') is not None or value.get('unit')):
                        label = f"{value.get('value', '')} {value.get('unit', '')}".strip()
                    rows.append([key, label or 'N/A', value.get('status') or 'N/A'])
                else:
                    rows.append([key, value, 'N/A'])
            elements.append(Paragraph(section_title, self.styles['SectionHeading']))
            table = Table(rows, colWidths=[2.5 * inch, 1.5 * inch, 1 * inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(table)
            elements.append(Spacer(1, 0.3 * inch))

        elements.append(Paragraph("Category Scores", self.styles['SectionHeading']))
        category_rows = [['Category', 'Score']]
        for key in ('images', 'javascript', 'css', 'fonts', 'compression', 'cache', 'cdn', 'resources', 'mobile', 'desktop', 'hosting', 'thirdParty'):
            section = perf_audit.get(key, {}) or {}
            if isinstance(section, dict) and section.get('score') is not None:
                category_rows.append([key, f"{section.get('score')}/100"])
        category_table = Table(category_rows, colWidths=[3 * inch, 2 * inch])
        category_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(category_table)

        recommendations = perf_audit.get('recommendations', []) or []
        if recommendations:
            elements.append(Spacer(1, 0.3 * inch))
            elements.append(Paragraph("Recommendations", self.styles['SectionHeading']))
            for rec in recommendations[:10]:
                priority = rec.get('priority', 'N/A')
                elements.append(Paragraph(f"• <b>[{priority}]</b> {rec.get('title', 'N/A')}", self.styles['Normal']))
                if rec.get('description'):
                    elements.append(Paragraph(f"&nbsp;&nbsp;{rec.get('description')}", self.styles['Normal']))

        return elements

    def _create_security_audit_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("Website Security Audit", self.styles['ReportTitle']))

        sec_audit = data.get('security_audit', {})
        if not sec_audit:
            elements.append(Paragraph("No security audit data available", self.styles['Normal']))
            return elements

        elements.append(Paragraph("Overall Score", self.styles['SectionHeading']))
        overview = [['Metric', 'Value'],
                    ['Overall Score', f"{sec_audit.get('overallScore', 0)}/100"],
                    ['Grade', sec_audit.get('grade', 'N/A')],
                    ['Audit Time', f"{sec_audit.get('auditTime', 0):.0f} ms"]]

        overview_table = Table(overview, colWidths=[3 * inch, 2 * inch])
        overview_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(overview_table)
        elements.append(Spacer(1, 0.3 * inch))

        section_map = {
            'ssl': 'SSL & Transport Security',
            'headers': 'Security Headers',
            'cookies': 'Cookie Security',
            'server': 'Server Security',
            'forms': 'Form Security',
            'content': 'Content Security',
            'authentication': 'Authentication',
            'domain': 'Domain Security',
        }
        for section_key, section_title in section_map.items():
            section = sec_audit.get(section_key, {}) or {}
            if not isinstance(section, dict):
                continue
            rows = [['Check', 'Value']]
            for field, value in section.items():
                if isinstance(value, list):
                    continue
                if field == 'score':
                    continue
                if isinstance(value, bool):
                    rows.append([field, 'Yes' if value else 'No'])
                else:
                    rows.append([field, value if value is not None else 'N/A'])
            elements.append(Paragraph(section_title, self.styles['SectionHeading']))
            table = Table(rows, colWidths=[3 * inch, 2 * inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(table)
            elements.append(Spacer(1, 0.3 * inch))

        header_items = ((sec_audit.get('headers', {}) or {}).get('headers', [])) or []
        if header_items:
            elements.append(Paragraph("Security Header Checks", self.styles['SectionHeading']))
            header_rows = [['Header', 'Status']]
            for item in header_items[:15]:
                header_rows.append([item.get('name', 'N/A'), item.get('status', 'N/A')])
            header_table = Table(header_rows, colWidths=[3 * inch, 2 * inch])
            header_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(header_table)
            elements.append(Spacer(1, 0.3 * inch))

        recommendations = sec_audit.get('recommendations', []) or []
        if recommendations:
            elements.append(Paragraph("Recommendations", self.styles['SectionHeading']))
            for rec in recommendations[:10]:
                priority = rec.get('priority', 'N/A')
                elements.append(Paragraph(f"• <b>[{priority}]</b> {rec.get('title', 'N/A')}", self.styles['Normal']))
                if rec.get('description'):
                    elements.append(Paragraph(f"&nbsp;&nbsp;{rec.get('description')}", self.styles['Normal']))

        return elements

    def _create_seo_audit_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("SEO Intelligence Audit", self.styles['ReportTitle']))

        seo_audit = data.get('seo_audit', {})
        if not seo_audit:
            elements.append(Paragraph("No SEO intelligence audit data available", self.styles['Normal']))
            return elements

        elements.append(Paragraph("Overall Score", self.styles['SectionHeading']))
        overview = [['Metric', 'Value'],
                    ['Overall Score', f"{seo_audit.get('overallScore', 0)}/100"],
                    ['Grade', seo_audit.get('grade', 'N/A')],
                    ['Status', seo_audit.get('overallStatus', 'N/A')],
                    ['Audit Time', f"{seo_audit.get('auditTime', 0):.0f} ms"]]

        overview_table = Table(overview, colWidths=[3 * inch, 2 * inch])
        overview_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(overview_table)
        elements.append(Spacer(1, 0.3 * inch))

        module_map = {
            'meta': 'Meta Tags',
            'headings': 'Headings',
            'images': 'Images',
            'urls': 'URL Structure',
            'indexability': 'Indexability',
            'openGraph': 'Open Graph',
            'twitterCards': 'Twitter Cards',
            'schema': 'Schema Markup',
            'internalLinks': 'Internal Links',
            'externalLinks': 'External Links',
            'content': 'Content Quality',
            'mobile': 'Mobile SEO',
            'pages': 'Pages',
            'localSEO': 'Local SEO',
            'socialSEO': 'Social SEO',
            'favicon': 'Favicon',
        }
        elements.append(Paragraph("Module Scores", self.styles['SectionHeading']))
        module_rows = [['Module', 'Score', 'Status', 'Issues']]
        for key, label in module_map.items():
            section = seo_audit.get(key, {}) or {}
            if isinstance(section, dict) and section.get('score') is not None:
                module_rows.append([
                    label,
                    f"{section.get('score')}/100",
                    section.get('status') or 'N/A',
                    str(section.get('issueCount', 0)),
                ])
        module_table = Table(module_rows, colWidths=[2 * inch, 1.2 * inch, 1.3 * inch, 0.8 * inch])
        module_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ]))
        elements.append(module_table)
        elements.append(Spacer(1, 0.3 * inch))

        issues = seo_audit.get('issues', []) or []
        if issues:
            elements.append(Paragraph("SEO Issues", self.styles['SectionHeading']))
            for issue in issues[:12]:
                severity = issue.get('severity', 'N/A')
                elements.append(Paragraph(f"• <b>[{severity}]</b> {issue.get('title', issue.get('description', 'N/A'))}", self.styles['Normal']))
                if issue.get('affectedUrl'):
                    elements.append(Paragraph(f"&nbsp;&nbsp;{issue.get('affectedUrl')}", self.styles['Normal']))

        recommendations = seo_audit.get('recommendations', []) or []
        if recommendations:
            elements.append(Spacer(1, 0.3 * inch))
            elements.append(Paragraph("Recommendations", self.styles['SectionHeading']))
            for rec in recommendations[:10]:
                priority = rec.get('priority', 'N/A')
                elements.append(Paragraph(f"• <b>[{priority}]</b> {rec.get('title', 'N/A')}", self.styles['Normal']))
                if rec.get('description'):
                    elements.append(Paragraph(f"&nbsp;&nbsp;{rec.get('description')}", self.styles['Normal']))

        return elements

    def _create_uiux_audit_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("Website UI/UX Intelligence", self.styles['ReportTitle']))

        uiux = data.get('uiux_audit', {})
        if not uiux:
            elements.append(Paragraph("No Website UI/UX Intelligence data available", self.styles['Normal']))
            return elements

        elements.append(Paragraph("Overall Score", self.styles['SectionHeading']))
        overview = [['Metric', 'Value'],
                    ['Overall Score', f"{uiux.get('overallScore', 0)}/100"],
                    ['Grade', uiux.get('grade', 'N/A')],
                    ['Status', uiux.get('overallStatus', 'N/A')],
                    ['Audit Time', f"{uiux.get('auditTime', 0):.0f} ms"]]

        overview_table = Table(overview, colWidths=[3 * inch, 2 * inch])
        overview_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(overview_table)
        elements.append(Spacer(1, 0.3 * inch))

        redesign = uiux.get('redesignOpportunity', {}) or {}
        if isinstance(redesign, dict) and redesign.get('rationale'):
            elements.append(Paragraph("Redesign Opportunity", self.styles['SectionHeading']))
            elements.append(Paragraph(
                f"• <b>{redesign.get('opportunityLevel', 'N/A')}</b> "
                f"&nbsp;Score: {redesign.get('score', 0)}/100<br/>{redesign.get('rationale', '')}",
                self.styles['Normal']
            ))
            elements.append(Spacer(1, 0.2 * inch))

        sales_opp = uiux.get('salesOpportunity', {}) or {}
        if isinstance(sales_opp, dict) and sales_opp.get('pitchSummary'):
            elements.append(Paragraph("Sales Opportunity", self.styles['SectionHeading']))
            elements.append(Paragraph(
                f"• <b>{sales_opp.get('opportunityLevel', 'N/A')}</b> "
                f"&nbsp;Score: {sales_opp.get('score', 0)}/100<br/>{sales_opp.get('pitchSummary', '')}",
                self.styles['Normal']
            ))
            elements.append(Spacer(1, 0.2 * inch))

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
        elements.append(Paragraph("Module Scores", self.styles['SectionHeading']))
        module_rows = [['Module', 'Score', 'Status', 'Issues', 'Recs']]
        for key, label in module_map.items():
            section = uiux.get(key, {}) or {}
            if isinstance(section, dict) and section.get('score') is not None:
                module_rows.append([
                    label,
                    f"{section.get('score')}/100",
                    section.get('status') or 'N/A',
                    str(section.get('issueCount', 0)),
                    str(section.get('recommendationCount', 0)),
                ])
        module_table = Table(module_rows, colWidths=[1.8 * inch, 1 * inch, 1.2 * inch, 0.8 * inch, 0.8 * inch])
        module_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ]))
        elements.append(module_table)
        elements.append(Spacer(1, 0.3 * inch))

        issues = uiux.get('issues', []) or []
        if issues:
            elements.append(Paragraph("Visual Issues", self.styles['SectionHeading']))
            for issue in issues[:12]:
                severity = issue.get('severity', 'N/A')
                title = issue.get('title', issue.get('description', 'N/A'))
                elements.append(Paragraph(f"• <b>[{severity}]</b> {title}", self.styles['Normal']))
                if issue.get('affectedUrl'):
                    elements.append(Paragraph(f"&nbsp;&nbsp;{issue.get('affectedUrl')}", self.styles['Normal']))

        recommendations = uiux.get('recommendations', []) or []
        if recommendations:
            elements.append(Spacer(1, 0.3 * inch))
            elements.append(Paragraph("Recommendations", self.styles['SectionHeading']))
            for rec in recommendations[:10]:
                priority = rec.get('priority', 'N/A')
                elements.append(Paragraph(f"• <b>[{priority}]</b> {rec.get('title', 'N/A')}", self.styles['Normal']))
                if rec.get('description'):
                    elements.append(Paragraph(f"&nbsp;&nbsp;{rec.get('description')}", self.styles['Normal']))

        return elements

    def _create_seo_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("SEO Analysis Report", self.styles['ReportTitle']))
        
        seo = data.get('seo_analysis', {})
        if not seo:
            elements.append(Paragraph("No SEO analysis data available", self.styles['Normal']))
            return elements
        
        scorecard = seo.get('scorecard', {})
        elements.append(Paragraph("SEO Scorecard", self.styles['SectionHeading']))
        scores = [['Category', 'Score'],
                 ['Overall SEO', f"{scorecard.get('overall_score', 0)}/100"],
                 ['Technical SEO', f"{scorecard.get('technical_score', 0)}/100"],
                 ['Content Quality', f"{scorecard.get('content_score', 0)}/100"],
                 ['Metadata', f"{scorecard.get('metadata_score', 0)}/100"]]
        
        table = Table(scores, colWidths=[3*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('GRID', (0,0), (-1,-1), 1, colors.black)
        ]))
        elements.append(table)
        elements.append(Spacer(1, 0.3*inch))
        
        issues = seo.get('issues', [])
        if issues:
            elements.append(Paragraph("SEO Issues", self.styles['SectionHeading']))
            for issue in issues[:10]:
                elements.append(Paragraph(f"• <b>{issue.get('severity', 'N/A')}</b>: {issue.get('description', 'N/A')}", self.styles['Normal']))
                
        return elements
    
    def _create_performance_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("Performance Analysis", self.styles['ReportTitle']))
        
        perf = data.get('performance_analysis', {})
        if not perf:
            elements.append(Paragraph("No performance data available", self.styles['Normal']))
            return elements
        
        scorecard = perf.get('scorecard', {})
        elements.append(Paragraph("Performance Scores", self.styles['SectionHeading']))
        scores = [['Metric', 'Score'],
                 ['Overall Desktop', f"{scorecard.get('overall_desktop_score', 0)}/100"],
                 ['Overall Mobile', f"{scorecard.get('overall_mobile_score', 0)}/100"],
                 ['Core Web Vitals', f"{scorecard.get('core_web_vitals_score', 0)}/100"],
                 ['Server Response', f"{scorecard.get('server_response_score', 0)}/100"]]
        
        table = Table(scores, colWidths=[3*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('GRID', (0,0), (-1,-1), 1, colors.black)
        ]))
        elements.append(table)
        
        suggestions = perf.get('optimization_suggestions', [])
        if suggestions:
            elements.append(Spacer(1, 0.3*inch))
            elements.append(Paragraph("Optimization Suggestions", self.styles['SectionHeading']))
            for suggestion in suggestions[:10]:
                elements.append(Paragraph(f"• {suggestion.get('description', 'N/A')}", self.styles['Normal']))

        elements.append(PageBreak())
        elements.extend(self._create_performance_audit_report(data))
        elements.append(PageBreak())
        elements.extend(self._create_security_audit_report(data))
        elements.append(PageBreak())
        elements.extend(self._create_seo_audit_report(data))

        return elements
        
    def _create_ui_ux_report(self, data: Dict, title: str):
        elements = []
        elements.append(Paragraph(title, self.styles['ReportTitle']))
        
        uiux = data.get('ui_ux_analysis', {})
        if not uiux:
            elements.append(Paragraph("No UI/UX data available", self.styles['Normal']))
            return elements
            
        scorecard = uiux.get('scorecard', {})
        elements.append(Paragraph("UI/UX Scores", self.styles['SectionHeading']))
        scores = [['Metric', 'Score'],
                 ['Overall UI', f"{scorecard.get('overall_ui_score', 0)}/100"],
                 ['Overall UX', f"{scorecard.get('overall_ux_score', 0)}/100"],
                 ['Mobile Responsiveness', f"{scorecard.get('mobile_responsiveness_score', 0)}/100"],
                 ['Visual Hierarchy', f"{scorecard.get('visual_hierarchy_score', 0)}/100"]]
        
        table = Table(scores, colWidths=[3*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('GRID', (0,0), (-1,-1), 1, colors.black)
        ]))
        elements.append(table)
        
        problems = uiux.get('problems', [])
        if problems:
            elements.append(Spacer(1, 0.3*inch))
            elements.append(Paragraph("Identified Problems", self.styles['SectionHeading']))
            for problem in problems[:10]:
                elements.append(Paragraph(f"• {problem.get('description', 'N/A')}", self.styles['Normal']))
                
        return elements
        
    def _create_accessibility_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("Accessibility Report", self.styles['ReportTitle']))
        
        uiux = data.get('ui_ux_analysis', {})
        if not uiux:
            elements.append(Paragraph("No accessibility data available", self.styles['Normal']))
            return elements
            
        scorecard = uiux.get('scorecard', {})
        elements.append(Paragraph("Accessibility Score", self.styles['SectionHeading']))
        scores = [['Metric', 'Score'],
                 ['Accessibility (WCAG)', f"{scorecard.get('accessibility_score', 0)}/100"]]
        
        table = Table(scores, colWidths=[3*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('GRID', (0,0), (-1,-1), 1, colors.black)
        ]))
        elements.append(table)
        return elements

    def _create_security_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("Security Analysis", self.styles['ReportTitle']))
        
        security = data.get('security_analysis', {})
        if not security:
            elements.append(Paragraph("No security data available", self.styles['Normal']))
            return elements
        
        scorecard = security.get('scorecard', {})
        elements.append(Paragraph("Security Scorecard", self.styles['SectionHeading']))
        scores = [['Category', 'Score'],
                 ['Overall Security', f"{scorecard.get('overall_security_score', 0)}/100"],
                 ['SSL/TLS', f"{scorecard.get('ssl_score', 0)}/100"],
                 ['HTTP Security Headers', f"{scorecard.get('http_security_score', 0)}/100"],
                 ['Cookie Security', f"{scorecard.get('cookie_security_score', 0)}/100"]]
        
        table = Table(scores, colWidths=[3*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('GRID', (0,0), (-1,-1), 1, colors.black)
        ]))
        elements.append(table)
        
        findings = security.get('findings', [])
        if findings:
            elements.append(Spacer(1, 0.3*inch))
            elements.append(Paragraph("Security Findings", self.styles['SectionHeading']))
            for finding in findings:
                elements.append(Paragraph(f"• <b>{finding.get('severity', 'N/A')}</b>: {finding.get('description', 'N/A')}", self.styles['Normal']))
                
        return elements
        
    def _create_technology_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("Technology Stack Report", self.styles['ReportTitle']))
        
        tech = data.get('technology_detection', {})
        if not tech:
            elements.append(Paragraph("No technology data available", self.styles['Normal']))
            return elements
            
        technologies = tech.get('technologies', {})
        if isinstance(technologies, list):
            if not technologies:
                elements.append(Paragraph("None detected", self.styles['Normal']))
                return elements
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

        for category, items in technologies.items():
            elements.append(Paragraph(str(category).capitalize(), self.styles['SectionHeading']))
            if items:
                for item in items:
                    elements.append(Paragraph(f"• {item}", self.styles['Normal']))
            else:
                elements.append(Paragraph("None detected", self.styles['Normal']))
                
        return elements
        
    def _create_contact_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("Contact Discovery Report", self.styles['ReportTitle']))
        
        contact = data.get('contact_discovery', {})
        if not contact:
            elements.append(Paragraph("No contact data available", self.styles['Normal']))
            return elements
            
        contacts = contact.get('contacts', {})
        
        elements.append(Paragraph("Discovered Contacts", self.styles['SectionHeading']))
        for key in ['emails', 'phones', 'whatsapp', 'social_links']:
            items = contacts.get(key, [])
            elements.append(Paragraph(str(key).replace('_', ' ').capitalize(), self.styles['Heading3']))
            if items:
                for item in items:
                    elements.append(Paragraph(f"• {item}", self.styles['Normal']))
            else:
                elements.append(Paragraph("None found", self.styles['Normal']))
                
        return elements

    def _create_business_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("Business Opportunity Report", self.styles['ReportTitle']))
        
        business = data.get('business_intelligence', {})
        if not business:
            elements.append(Paragraph("No business intelligence data available", self.styles['Normal']))
            return elements
        
        scorecard = business.get('scorecard', {})
        elements.append(Paragraph("Business Scores", self.styles['SectionHeading']))
        scores = [['Metric', 'Score'],
                 ['Business Opportunity', f"{scorecard.get('business_opportunity_score', 0)}/100"],
                 ['Lead Priority', f"{scorecard.get('lead_priority_score', 0)}/100"],
                 ['Digital Maturity', f"{scorecard.get('digital_maturity_score', 0)}/100"]]
        
        table = Table(scores, colWidths=[3*inch, 2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('GRID', (0,0), (-1,-1), 1, colors.black)
        ]))
        elements.append(table)
        
        opportunities = business.get('opportunities', [])
        if opportunities:
            elements.append(Spacer(1, 0.3*inch))
            elements.append(Paragraph("Recommended Services & Impact", self.styles['SectionHeading']))
            for opp in opportunities:
                elements.append(Paragraph(f"• <b>{opp.get('opportunity_type', 'N/A')}</b> - "
                                        f"Impact: {opp.get('estimated_business_impact', 'N/A')}, "
                                        f"ROI: {opp.get('estimated_roi', 'N/A')}", 
                                        self.styles['Normal']))
        
        return elements
        
    def _create_ai_recommendations_report(self, data: Dict):
        elements = []
        elements.append(Paragraph("AI Recommendations Report", self.styles['ReportTitle']))
        
        ai_analysis = data.get('ai_analysis', {})
        if not ai_analysis:
            elements.append(Paragraph("No AI recommendations available", self.styles['Normal']))
            return elements
            
        recommendations = ai_analysis.get('recommendations', [])
        if recommendations:
            elements.append(Paragraph("Top Recommendations", self.styles['SectionHeading']))
            for rec in recommendations:
                elements.append(Paragraph(f"• {rec}", self.styles['Normal']))
        
        return elements
        
    def _create_proposal_report(self, data: Dict, title: str):
        elements = []
        elements.append(Paragraph(title, self.styles['ReportTitle']))
        
        business = data.get('business_intelligence', {})
        if not business:
            elements.append(Paragraph("No data available to generate proposal", self.styles['Normal']))
            return elements
            
        elements.append(Paragraph("Executive Summary", self.styles['SectionHeading']))
        elements.append(Paragraph("Based on our comprehensive analysis of your digital presence, we have identified several high-impact areas for improvement.", self.styles['Normal']))
        
        opportunities = business.get('opportunities', [])
        if opportunities:
            elements.append(Spacer(1, 0.3*inch))
            elements.append(Paragraph("Proposed Services", self.styles['SectionHeading']))
            
            data_table = [['Service', 'Impact', 'Priority']]
            for opp in opportunities:
                data_table.append([
                    opp.get('opportunity_type', 'N/A'),
                    opp.get('estimated_business_impact', 'N/A'),
                    opp.get('priority', 'N/A')
                ])
                
            table = Table(data_table, colWidths=[3*inch, 2*inch, 2*inch])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E40AF')),
                ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ('GRID', (0,0), (-1,-1), 1, colors.black)
            ]))
            elements.append(table)
            
        return elements
