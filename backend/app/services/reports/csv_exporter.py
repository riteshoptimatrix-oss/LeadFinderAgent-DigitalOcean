"""CSV Exporter"""
import os
import csv
from typing import Dict, Any
import logging

from app.models.report import ReportType

logger = logging.getLogger(__name__)

class CSVExporter:
    def __init__(self):
        self.reports_dir = "reports/csv"
        os.makedirs(self.reports_dir, exist_ok=True)
    
    async def export(self, report_id: str, report_data: Dict[str, Any],
                    report_type: ReportType) -> tuple[str, int]:
        filename = f"{report_id}_{report_type.value.replace(' ', '_')}.csv"
        file_path = os.path.join(self.reports_dir, filename)
        
        with open(file_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            
            # Lead Info
            lead = report_data.get('lead', {})
            writer.writerow(['--- Lead Information ---'])
            writer.writerow(['Field', 'Value'])
            writer.writerow(['Business Name', lead.get('name', 'N/A')])
            writer.writerow(['Website', lead.get('website', 'N/A')])
            writer.writerow(['Email', lead.get('email', 'N/A')])
            writer.writerow(['Phone', lead.get('phone', 'N/A')])
            writer.writerow(['City', lead.get('city', 'N/A')])
            writer.writerow(['Country', lead.get('country', 'N/A')])
            writer.writerow([])
            
            # Scores
            ai = report_data.get('ai_analysis', {})
            writer.writerow(['--- Scores ---'])
            writer.writerow(['Metric', 'Score'])
            writer.writerow(['Overall Score', ai.get('overall_ai_score', 'N/A')])
            writer.writerow(['SEO Score', ai.get('seo_score', 'N/A')])
            writer.writerow(['Performance Score', ai.get('performance_score', 'N/A')])
            writer.writerow(['Security Score', ai.get('security_score', 'N/A')])
            writer.writerow(['UI Score', ai.get('ui_score', 'N/A')])
            writer.writerow(['UX Score', ai.get('ux_score', 'N/A')])
            writer.writerow(['Business Opportunity', ai.get('business_opportunity_score', 'N/A')])
            writer.writerow([])
            
            # SEO Issues
            seo = report_data.get('seo_analysis', {})
            if seo and seo.get('issues'):
                writer.writerow(['--- SEO Issues ---'])
                writer.writerow(['Severity', 'Category', 'Description'])
                for issue in seo['issues']:
                    writer.writerow([
                        issue.get('severity', 'N/A'),
                        issue.get('category', 'N/A'),
                        issue.get('description', 'N/A')
                    ])
                writer.writerow([])

            # Performance Issues
            perf = report_data.get('performance_analysis', {})
            if perf and perf.get('issues'):
                writer.writerow(['--- Performance Issues ---'])
                writer.writerow(['Priority', 'Problem', 'Impact'])
                for issue in perf['issues']:
                    writer.writerow([
                        issue.get('priority', 'N/A'),
                        issue.get('problem', 'N/A'),
                        issue.get('impact', 'N/A')
                    ])
                writer.writerow([])

            # Website Performance Audit
            perf_audit = report_data.get('performance_audit', {})
            if perf_audit:
                writer.writerow(['--- Website Performance Audit ---'])
                writer.writerow(['Metric', 'Value'])
                writer.writerow(['Overall Score', perf_audit.get('overallScore', 'N/A')])
                writer.writerow(['Grade', perf_audit.get('grade', 'N/A')])

                cwv = perf_audit.get('coreWebVitals', {}) or {}
                for key in ('lcp', 'fcp', 'inp', 'cls', 'ttfb', 'tbt', 'speedIndex', 'tti'):
                    metric = cwv.get(key, {}) or {}
                    writer.writerow([
                        f'CWV {key}',
                        metric.get('label') or f"{metric.get('value', 'N/A')} {metric.get('unit', '')}".strip()
                    ])

                speed = perf_audit.get('websiteSpeed', {}) or {}
                for key in ('loadTime', 'domReadyTime', 'fullyLoadedTime', 'initialResponseTime', 'networkIdleTime'):
                    metric = speed.get(key, {}) or {}
                    writer.writerow([
                        f'Speed {key}',
                        metric.get('label') or f"{metric.get('value', 'N/A')} {metric.get('unit', '')}".strip()
                    ])

                images = perf_audit.get('images', {}) or {}
                writer.writerow(['Images Total', images.get('total', 'N/A')])
                writer.writerow(['Images Optimized', images.get('optimized', 'N/A')])
                writer.writerow(['Images Unoptimized', images.get('unoptimized', 'N/A')])
                writer.writerow(['Images Large', images.get('largeImages', 'N/A')])

                javascript = perf_audit.get('javascript', {}) or {}
                writer.writerow(['JS Files', javascript.get('totalFiles', 'N/A')])
                writer.writerow(['JS Minified', javascript.get('minified', 'N/A')])

                compression = perf_audit.get('compression', {}) or {}
                writer.writerow(['GZIP', compression.get('gzip', 'N/A')])
                writer.writerow(['Brotli', compression.get('brotli', 'N/A')])

                cache = perf_audit.get('cache', {}) or {}
                writer.writerow(['Cache-Control', cache.get('cacheControl', 'N/A')])
                writer.writerow(['ETag', cache.get('etag', 'N/A')])

                cdn = perf_audit.get('cdn', {}) or {}
                writer.writerow(['CDN Provider', cdn.get('provider') or 'None'])

                hosting = perf_audit.get('hosting', {}) or {}
                writer.writerow(['HTTP Version', hosting.get('httpVersion', 'N/A')])

                third_party = perf_audit.get('thirdParty', {}) or {}
                writer.writerow(['Third-Party Trackers', third_party.get('count', 'N/A')])

                recommendations = perf_audit.get('recommendations', []) or []
                if recommendations:
                    writer.writerow([])
                    writer.writerow(['Audit Recommendations', 'Priority'])
                    for rec in recommendations:
                        writer.writerow([rec.get('title', 'N/A'), rec.get('priority', 'N/A')])
                writer.writerow([])

            # Website Security Audit
            sec_audit = report_data.get('security_audit', {})
            if sec_audit:
                writer.writerow(['--- Website Security Audit ---'])
                writer.writerow(['Metric', 'Value'])
                writer.writerow(['Overall Score', sec_audit.get('overallScore', 'N/A')])
                writer.writerow(['Grade', sec_audit.get('grade', 'N/A')])

                ssl = sec_audit.get('ssl', {}) or {}
                writer.writerow(['HTTPS Enabled', ssl.get('enabled', 'N/A')])
                writer.writerow(['Certificate Valid', ssl.get('valid', 'N/A')])
                writer.writerow(['Certificate Expiry', ssl.get('expiry', 'N/A')])
                writer.writerow(['Certificate Issuer', ssl.get('issuer', 'N/A')])
                writer.writerow(['Days Remaining', ssl.get('daysRemaining', 'N/A')])
                writer.writerow(['HTTP to HTTPS Redirect', ssl.get('httpRedirect', 'N/A')])
                writer.writerow(['Mixed Content', ssl.get('mixedContent', 'N/A')])

                headers = sec_audit.get('headers', {}) or {}
                writer.writerow(['Headers Present', headers.get('present', 'N/A')])
                writer.writerow(['Headers Missing', headers.get('missing', 'N/A')])
                writer.writerow(['Headers Weak', headers.get('weak', 'N/A')])
                for item in headers.get('headers', []) or []:
                    writer.writerow([f'Header {item.get("name", "N/A")}', item.get('status', 'N/A')])

                cookies = sec_audit.get('cookies', {}) or {}
                writer.writerow(['Cookies Total', cookies.get('totalCookies', 'N/A')])
                writer.writerow(['Cookies Secure', cookies.get('secureCookies', 'N/A')])
                writer.writerow(['Cookies HttpOnly', cookies.get('httpOnlyCookies', 'N/A')])
                writer.writerow(['Cookies SameSite', cookies.get('sameSiteCookies', 'N/A')])
                writer.writerow(['Cookies Insecure', cookies.get('insecureCookies', 'N/A')])

                server = sec_audit.get('server', {}) or {}
                writer.writerow(['Server Header', server.get('server', 'N/A')])
                writer.writerow(['X-Powered-By', server.get('xPoweredBy', 'N/A')])
                writer.writerow(['Information Leakage', server.get('informationLeakage', 'N/A')])

                forms = sec_audit.get('forms', {}) or {}
                writer.writerow(['Forms Total', forms.get('totalForms', 'N/A')])
                writer.writerow(['Forms With CSRF', forms.get('formsWithCsrf', 'N/A')])
                writer.writerow(['Forms CSRF Protected', forms.get('csrfProtected', 'N/A')])
                writer.writerow(['Forms Password Fields', forms.get('passwordFields', 'N/A')])
                writer.writerow(['Forms HTTPS Submit', forms.get('httpsSubmit', 'N/A')])
                writer.writerow(['Forms Captcha Protected', forms.get('captchaProtected', 'N/A')])

                content = sec_audit.get('content', {}) or {}
                writer.writerow(['Mixed Content', content.get('mixedContent', 'N/A')])
                writer.writerow(['Unsafe Resources', content.get('unsafeResources', 'N/A')])
                writer.writerow(['External Scripts', content.get('externalScripts', 'N/A')])
                writer.writerow(['Unsafe Iframes', content.get('unsafeIframes', 'N/A')])

                authentication = sec_audit.get('authentication', {}) or {}
                writer.writerow(['Login Page', authentication.get('loginPage', 'N/A')])
                writer.writerow(['Password Reset', authentication.get('passwordReset', 'N/A')])
                writer.writerow(['Registration', authentication.get('registration', 'N/A')])
                writer.writerow(['Protected Admin Pages', authentication.get('protectedAdminPages', 'N/A')])

                domain = sec_audit.get('domain', {}) or {}
                writer.writerow(['Domain', domain.get('domain', 'N/A')])
                writer.writerow(['DNSSEC Enabled', domain.get('dnssecEnabled', 'N/A')])
                writer.writerow(['WHOIS Available', domain.get('whoisAvailable', 'N/A')])
                writer.writerow(['Registrar', domain.get('registrar', 'N/A')])
                writer.writerow(['Domain Creation Date', domain.get('creationDate', 'N/A')])
                writer.writerow(['Domain Expiry Date', domain.get('expiryDate', 'N/A')])
                writer.writerow(['Days to Expiry', domain.get('daysToExpiry', 'N/A')])
                writer.writerow(['Domain Expired', domain.get('expired', 'N/A')])
                writer.writerow(['Nameservers', len(domain.get('nameServers', []) or [])])

                sec_recommendations = sec_audit.get('recommendations', []) or []
                if sec_recommendations:
                    writer.writerow([])
                    writer.writerow(['Security Recommendations', 'Priority'])
                    for rec in sec_recommendations:
                        writer.writerow([rec.get('title', 'N/A'), rec.get('priority', 'N/A')])
                writer.writerow([])

            # SEO Intelligence Audit
            seo_audit = report_data.get('seo_audit', {})
            if seo_audit:
                writer.writerow(['--- SEO Intelligence Audit ---'])
                writer.writerow(['Metric', 'Value'])
                writer.writerow(['Overall Score', seo_audit.get('overallScore', 'N/A')])
                writer.writerow(['Grade', seo_audit.get('grade', 'N/A')])
                writer.writerow(['Status', seo_audit.get('overallStatus', 'N/A')])

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
                writer.writerow([])
                writer.writerow(['SEO Module', 'Score', 'Status', 'Issues'])
                for key, label in module_map.items():
                    section = seo_audit.get(key, {}) or {}
                    if isinstance(section, dict) and section.get('score') is not None:
                        writer.writerow([
                            label,
                            section.get('score', 'N/A'),
                            section.get('status', 'N/A'),
                            section.get('issueCount', 'N/A'),
                        ])

                issues = seo_audit.get('issues', []) or []
                if issues:
                    writer.writerow([])
                    writer.writerow(['SEO Issues', 'Severity', 'Category', 'URL'])
                    for issue in issues:
                        writer.writerow([
                            issue.get('title', issue.get('description', 'N/A')),
                            issue.get('severity', 'N/A'),
                            issue.get('category', 'N/A'),
                            issue.get('affectedUrl', 'N/A'),
                        ])

                seo_recommendations = seo_audit.get('recommendations', []) or []
                if seo_recommendations:
                    writer.writerow([])
                    writer.writerow(['SEO Recommendations', 'Priority', 'Category'])
                    for rec in seo_recommendations:
                        writer.writerow([
                            rec.get('title', 'N/A'),
                            rec.get('priority', 'N/A'),
                            rec.get('category', 'N/A'),
                        ])
                writer.writerow([])

            # Website UI/UX Intelligence Audit
            uiux_audit = report_data.get('uiux_audit', {})
            if uiux_audit:
                writer.writerow(['--- Website UI/UX Intelligence Audit ---'])
                writer.writerow(['Metric', 'Value'])
                writer.writerow(['Overall Score', uiux_audit.get('overallScore', 'N/A')])
                writer.writerow(['Grade', uiux_audit.get('grade', 'N/A')])
                writer.writerow(['Status', uiux_audit.get('overallStatus', 'N/A')])
                writer.writerow(['Audit Time (ms)', uiux_audit.get('auditTime', 'N/A')])

                redesign = uiux_audit.get('redesignOpportunity', {}) or {}
                writer.writerow([])
                writer.writerow(['Redesign Opportunity', 'Value'])
                writer.writerow(['Score', redesign.get('score', 'N/A')])
                writer.writerow(['Level', redesign.get('opportunityLevel', 'N/A')])
                writer.writerow(['Rationale', redesign.get('rationale', 'N/A')])
                writer.writerow(['Estimated Impact', redesign.get('estimatedImpact', 'N/A')])
                writer.writerow(['Payoff', redesign.get('payoff', 'N/A')])

                sales_opp = uiux_audit.get('salesOpportunity', {}) or {}
                writer.writerow([])
                writer.writerow(['Sales Opportunity', 'Value'])
                writer.writerow(['Score', sales_opp.get('score', 'N/A')])
                writer.writerow(['Level', sales_opp.get('opportunityLevel', 'N/A')])
                writer.writerow(['Pitch Summary', sales_opp.get('pitchSummary', 'N/A')])
                writer.writerow(['Suggested Services', ', '.join(sales_opp.get('suggestedServices', []) or [])])

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
                writer.writerow([])
                writer.writerow(['UI/UX Module', 'Score', 'Status', 'Issues', 'Recommendations'])
                for key, label in module_map.items():
                    section = uiux_audit.get(key, {}) or {}
                    if isinstance(section, dict) and section.get('score') is not None:
                        writer.writerow([
                            label,
                            section.get('score', 'N/A'),
                            section.get('status', 'N/A'),
                            section.get('issueCount', 'N/A'),
                            section.get('recommendationCount', 'N/A'),
                        ])

                issues = uiux_audit.get('issues', []) or []
                if issues:
                    writer.writerow([])
                    writer.writerow(['UI/UX Issues', 'Severity', 'Category', 'URL'])
                    for issue in issues:
                        writer.writerow([
                            issue.get('title', issue.get('description', 'N/A')),
                            issue.get('severity', 'N/A'),
                            issue.get('category', 'N/A'),
                            issue.get('affectedUrl', 'N/A'),
                        ])

                uiux_recommendations = uiux_audit.get('recommendations', []) or []
                if uiux_recommendations:
                    writer.writerow([])
                    writer.writerow(['UI/UX Recommendations', 'Priority', 'Category'])
                    for rec in uiux_recommendations:
                        writer.writerow([
                            rec.get('title', 'N/A'),
                            rec.get('priority', 'N/A'),
                            rec.get('category', 'N/A'),
                        ])
                writer.writerow([])

            # Contacts
            contacts = report_data.get('contact_discovery', {})
            if contacts and contacts.get('contacts'):
                writer.writerow(['--- Contacts ---'])
                writer.writerow(['Type', 'Value', 'Classification'])
                for c in contacts['contacts']:
                    writer.writerow([
                        c.get('type', 'N/A'),
                        c.get('value', 'N/A'),
                        c.get('classification', 'N/A')
                    ])
                writer.writerow([])
                
            # Technologies
            tech = report_data.get('technology_detection', {})
            if tech and tech.get('technologies'):
                writer.writerow(['--- Technologies ---'])
                writer.writerow(['Technology', 'Category', 'Version', 'Confidence'])
                for t in tech['technologies']:
                    writer.writerow([
                        t.get('name', 'N/A'),
                        t.get('category', 'N/A'),
                        t.get('version', 'N/A'),
                        f"{t.get('confidence_score', 0)}%"
                    ])
        
        file_size = os.path.getsize(file_path)
        return file_path, file_size
