# Search System Production Certification Report - 6a5073afed42a8d5c87b39f5
- **Timestamp**: 2026-07-10T04:23:30.322535+00:00
- **Requested Target**: 100 leads
- **Actual Collected**: 0 leads
- **Coverage**: 0.0%
- **Overall Certification Status**: **[FAIL]** (Reliability Score: 45.0/100.0)

## Subsystem Audits
| Subsystem | Status | Isolation Reason | Recommended Fix |
|---|---|---|---|
| Queue Subsystem | **[WARN]** | No queue records found for job. | Ensure queue items are stored in search_queue. |
| Browser Subsystem | **[PASS]** | Browser session remained stable without crashes. | None |
| Worker Subsystem | **[PASS]** | Workers completed tasks without requiring restarts. | None |
| MongoDB Subsystem | **[PASS]** | Database connection verified and online. | None |
| Google Maps Subsystem | **[WARN]** | Scraper executed but did not record scroll or page events. | Ensure scroll and page trackers are called. |
| Persistence Subsystem | **[FAIL]** | No leads were persisted to the database. | Verify provider extraction methods and buffer flush triggers. |


## Search Accuracy & Quality Audits
- **Lead Accuracy**: 100.0%
- **Website Accuracy (Found)**: 0.0%
- **Phone Accuracy (Found)**: 0.0%
- **Email Accuracy (Found)**: 0.0%
- **Address Accuracy (Found)**: 0.0%
- **Category Accuracy (Found)**: 0.0%
- **Duplicates Removed**: 0 leads
- **Missing Leads**: 100 leads

## Performance Audit
- **Startup Time**: 0.00 seconds
- **Verification Duration**: 0.0675 seconds
- **CPU Utilization**: 0.0%
- **Memory Consumption**: 122.1 MB
