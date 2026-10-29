# Report Generation System Documentation

## Overview

The Report Generation System is a comprehensive module that automatically generates professional, client-ready reports from real AI analysis data. It supports 15 different report types and 5 output formats.

## Features

### ✅ Automatic Report Generation
- Reports are automatically generated when AI analysis completes
- Background worker monitors analysis completions
- No manual intervention required

### ✅ 15 Report Types
1. **Executive Summary** - High-level overview with key metrics and scores
2. **Complete Website Audit** - Comprehensive analysis of all aspects
3. **SEO Report** - Search engine optimization analysis
4. **Technical SEO Report** - Deep technical SEO examination
5. **Performance Report** - Speed and Core Web Vitals analysis
6. **UI Analysis Report** - User interface design assessment
7. **UX Analysis Report** - User experience evaluation
8. **Accessibility Report** - WCAG compliance and accessibility
9. **Security Report** - Security headers, SSL, vulnerabilities
10. **Technology Stack Report** - Detected technologies and versions
11. **Contact Discovery Report** - Found emails, phones, social links
12. **Business Opportunity Report** - Sales opportunities and recommendations
13. **AI Recommendations Report** - AI-generated improvement suggestions
14. **Proposal Report** - Client-ready service proposal
15. **Client Presentation Report** - Professional presentation format

### ✅ 5 Output Formats
- **PDF** - Professional print-ready documents
- **HTML** - Web-viewable interactive reports
- **Excel** - Spreadsheet format with multiple tabs
- **JSON** - Machine-readable structured data
- **CSV** - Comma-separated values for data analysis

### ✅ Real Data Only
- All reports use actual analysis data from MongoDB
- No placeholder or fake values
- Missing data is clearly indicated as "N/A" or "Not Available"

### ✅ Professional Layout
- Cover page with branding
- Table of contents
- Executive summary
- Detailed sections
- Charts and visualizations
- Screenshots (where available)
- Color-coded scores

### ✅ Background Processing
- Reports generate asynchronously
- No API blocking
- Progress tracking
- Generation time metrics

## Architecture

### Components

```
app/services/reports/
├── __init__.py
├── report_generator.py       # Main orchestrator
├── data_aggregator.py         # Pulls real data from MongoDB
├── pdf_generator.py           # PDF generation
├── html_generator.py          # HTML generation
├── excel_generator.py         # Excel generation
├── json_exporter.py           # JSON export
├── csv_exporter.py            # CSV export
├── chart_generator.py         # Chart creation
├── auto_report_worker.py      # Background automation
└── templates/                 # HTML templates
    └── report_template.html

app/models/
├── report.py                  # Report data models

app/api/routes/
├── reports.py                 # API endpoints
```

### Database Collections

```javascript
// reports collection
{
  "_id": ObjectId,
  "lead_id": String,
  "user_id": String,
  "report_type": String,         // "Executive Summary", etc.
  "report_format": String,       // "PDF", "HTML", etc.
  "status": String,              // "Pending", "Generating", "Completed", "Failed"
  "file_path": String,
  "file_size_bytes": Number,
  "download_count": Number,
  "metadata": {
    "company_logo": String,
    "project_name": String,
    "generated_by": String,
    "report_version": String,
    "branding_color": String,
    "include_charts": Boolean,
    "include_screenshots": Boolean,
    "include_recommendations": Boolean
  },
  "error_message": String,
  "generation_started_at": Date,
  "generation_completed_at": Date,
  "generation_time_seconds": Number,
  "created_at": Date
}
```

## API Endpoints

### Generate Report
```
POST /api/v1/reports/generate
Body: {
  "lead_id": "string",
  "report_types": ["Executive Summary", "SEO Report"],
  "report_format": "PDF",
  "metadata": {
    "company_logo": "optional",
    "project_name": "optional",
    "generated_by": "optional"
  }
}
Response: Report object
```

### Get Lead Reports
```
GET /api/v1/reports/lead/{lead_id}
Query: skip=0, limit=50
Response: {
  "data": [Report],
  "total": number
}
```

### Download Report
```
GET /api/v1/reports/{report_id}/download
Response: File download
```

### Regenerate Report
```
POST /api/v1/reports/{report_id}/regenerate
Response: Report object
```

### Delete Report
```
DELETE /api/v1/reports/{report_id}
Response: 204 No Content
```

### Bulk Generate
```
POST /api/v1/reports/bulk-generate
Body: {
  "lead_ids": ["id1", "id2"],
  "report_types": ["Executive Summary"],
  "report_format": "PDF"
}
Response: { "message": "...", "total_reports": number }
```

## Installation

### 1. Install Dependencies
```bash
cd backend
install_reports.bat
```

Or manually:
```bash
pip install reportlab weasyprint Pillow matplotlib Jinja2 aiofiles python-docx xlsxwriter
```

### 2. Directory Structure
The installation script creates:
```
reports/
├── pdf/
├── html/
├── excel/
├── json/
├── csv/
└── charts/
```

### 3. Backend Integration
Already integrated in `main.py`:
- Report routes registered
- Auto-report worker started
- Background generation enabled

## Usage

### Automatic Generation
Reports are generated automatically when AI analysis completes. The system:
1. Monitors AI analysis completions
2. Generates Executive Summary and Complete Audit reports
3. Stores reports in MongoDB
4. Makes them available for download

### Manual Generation
From the frontend Lead Details page:
1. Navigate to the "Reports" tab
2. Select report types
3. Choose output format
4. Click "Generate Reports"

### Programmatic Generation
```python
from app.services.reports.report_generator import ReportGeneratorService
from app.models.report import ReportType, ReportFormat

# Initialize service
service = ReportGeneratorService(db)

# Generate report
report = await service.generate_report(
    lead_id="...",
    user_id="...",
    report_type=ReportType.EXECUTIVE_SUMMARY,
    report_format=ReportFormat.PDF
)
```

## Data Sources

Reports pull data from these MongoDB collections:
- `leads` - Lead information
- `ai_analysis_jobs` - AI analysis metadata and scores
- `seo_analysis_results` - SEO findings
- `performance_analysis_results` - Performance metrics
- `ui_ux_analysis_results` - UI/UX evaluation
- `security_analysis_results` - Security assessment
- `technology_detection_results` - Technology stack
- `contact_discovery_results` - Contact information
- `business_intelligence_results` - Business opportunities

## Configuration

### Report Metadata
Customize reports with metadata:
```python
metadata = ReportMetadata(
    company_logo="/path/to/logo.png",
    project_name="Q4 2024 Analysis",
    generated_by="John Doe",
    report_version="2.0",
    branding_color="#3B82F6",
    include_charts=True,
    include_screenshots=True,
    include_recommendations=True
)
```

### Auto-Generation Settings
In `auto_report_worker.py`:
```python
self.auto_generate_reports = [
    ReportType.EXECUTIVE_SUMMARY,
    ReportType.COMPLETE_AUDIT
]
self.check_interval = 30  # seconds
```

## Frontend Integration

### Reports Tab Component
Located at `frontend/components/ReportsTab.tsx`

Features:
- Report type selection (multi-select)
- Format selection
- Generation trigger
- Reports list with status
- Download buttons
- Regenerate functionality
- Delete capability
- Real-time status updates

### Integration Example
```tsx
import ReportsTab from '@/components/ReportsTab';

// In your page component
<ReportsTab leadId={leadId} />
```

## Troubleshooting

### Reports Not Generating
1. Check MongoDB connection
2. Verify AI analysis is completed
3. Check auto_report_worker logs
4. Ensure reports directory exists

### Missing Data in Reports
Reports only include data that exists in MongoDB. If a section shows "N/A", the corresponding analysis may not have been completed.

### File Size Issues
Large reports (>10MB) may take longer to generate. Consider:
- Reducing screenshot quality
- Excluding charts
- Using HTML format instead of PDF

### Permission Errors
Ensure the backend has write permissions to the `reports/` directory.

## Performance

### Generation Times
- Executive Summary: 2-5 seconds
- Complete Audit: 5-10 seconds
- HTML: Faster than PDF (no rendering)
- Excel: Medium (multiple sheets)

### Optimization
- Background generation prevents API blocking
- Charts are generated once and reused
- Data is cached during generation
- File compression applied automatically

## Security

### Access Control
- Reports tied to user_id
- Download endpoint requires authentication
- Report IDs are non-guessable (ObjectId)

### Data Privacy
- Reports contain sensitive business data
- Store securely
- Clean up old reports periodically
- Consider encryption for sensitive reports

## Future Enhancements

### Planned Features
1. Watermarking
2. Password-protected PDFs
3. Email delivery
4. Scheduled generation
5. Custom templates
6. Multi-language support
7. White-labeling
8. Report comparison
9. Version control
10. Collaborative annotations

## Support

For issues or questions:
1. Check logs in `backend/logs/`
2. Review MongoDB collections
3. Test individual components
4. Check frontend console for API errors

## Success Criteria ✅

- [x] 15 report types implemented
- [x] 5 output formats supported
- [x] Automatic generation after AI analysis
- [x] Real data from MongoDB (no fake values)
- [x] Professional layouts and styling
- [x] Background processing
- [x] API endpoints complete
- [x] Frontend integration
- [x] Download functionality
- [x] Regenerate capability
- [x] Delete functionality
- [x] Charts and visualizations
- [x] Production-ready code
- [x] Documentation complete

## License

Internal use only. Part of Lead Finder Agent system.
