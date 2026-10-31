# PHASE 1: CORE SCRAPING ENGINE OPTIMIZATION
## LeadFinderAgent – Performance Audit & Fast Extraction

Act as a Senior Python Performance Engineer specializing in Playwright, asynchronous processing, and high-performance data extraction.

### OBJECTIVE

Optimize the existing LeadFinderAgent scraping engine.

Current performance: Approximately 40 leads/minute.

Phase 1 target: 100–150 unique leads/minute, subject to actual source availability and server capacity.

### 1. COMPLETE CODEBASE AUDIT

Inspect the existing implementation, especially:

- backend/app/services/search_engine/playwright_engine.py
- Search engine services.
- Browser initialization.
- Search result extraction.
- Individual business extraction.
- Scrolling and pagination.
- HTTP requests.
- MongoDB insertion.
- Duplicate detection.
- Background task execution.

Identify the actual performance bottlenecks.

Measure:
- Browser initialization time.
- Search initialization time.
- Business extraction time.
- Individual page navigation time.
- DOM processing time.
- Database write latency.
- CPU and RAM utilization.

Do not assume the bottleneck. Use profiling and actual measurements.

### 2. ELIMINATE UNNECESSARY BROWSER NAVIGATION

Investigate whether multiple business records can be extracted directly from an already-loaded search results page.

Implement:
- Multiple business card extraction per session.
- Reusable browser instances.
- Safe browser context reuse.
- Page reuse.
- Efficient DOM evaluation.
- Minimal navigation.
- Minimal page reloads.
- Reduced unnecessary selector calls.

Avoid opening individual business pages when required information is already available in search results.

Use authorized and documented extraction methods.

### 3. PLAYWRIGHT OPTIMIZATION

Optimize:
- Browser launch configuration.
- Page initialization.
- DOM readiness.
- Navigation waiting strategies.
- Scrolling.
- Pagination.
- Resource loading.

Block unnecessary images, media, and fonts only after verifying extraction accuracy.

Do not blindly block CSS or JavaScript required for page rendering.

Replace arbitrary asyncio.sleep() calls with condition-based waits wherever possible.

### 4. FAST DATA EXTRACTION

Extract available information efficiently:

- Business name.
- Category.
- Address.
- Location.
- Phone.
- Website.
- Source identifier.

Requirements:
- Minimize repeated DOM traversal.
- Reuse extracted values.
- Avoid repeated parsing.
- Avoid unnecessary per-business HTTP requests.
- Normalize records efficiently.
- Preserve extraction accuracy.

### 5. SEPARATE EXPENSIVE ENRICHMENT

Basic lead discovery must not wait for:
- Email discovery.
- Detailed website crawling.
- Phone verification.
- Additional business research.

Save available basic information immediately.

Keep expensive enrichment outside the discovery execution flow.

### 6. INITIAL MONGODB OPTIMIZATION

Inspect existing database operations.

Identify:
- Individual writes.
- Unnecessary queries.
- Repeated duplicate checks.
- Missing indexes.
- Slow database operations.

Prepare the codebase for bulk persistence in Phase 3.

Do not introduce unsafe database changes.

### 7. TESTING

Test:
- Existing search functionality.
- Multiple businesses in one search session.
- Browser reuse.
- Resource blocking.
- Navigation failures.
- Duplicate records.
- MongoDB persistence.

### 8. PHASE 1 DELIVERABLES

Provide:
1. Root cause analysis.
2. Before-and-after benchmark.
3. Modified files.
4. Performance improvements.
5. CPU and RAM usage.
6. Remaining bottlenecks.

### STRICT RULES

- Preserve existing application functionality.
- Do not break API contracts.
- Do not create another scraper implementation.
- Do not change unrelated modules.
- Do not bypass CAPTCHAs or access restrictions.
- Respect provider terms and quotas.
- Do not fabricate benchmark results.

Complete Phase 1 implementation and testing before proceeding to Phase 2.








# PHASE 2: ADVANCED PARALLEL SCRAPING ARCHITECTURE
## LeadFinderAgent – Concurrent Workers & Intelligent Query Distribution

### OBJECTIVE

Upgrade the optimized scraping engine into a controlled, asynchronous, parallel scraping architecture.

Target: 200–300 unique leads/minute as an intermediate engineering goal.

### 1. PARALLEL WORKER POOL

Implement six configurable concurrent workers initially.

Configuration:

WORKER_COUNT=6
MAX_CONCURRENT_PAGES=6
MAX_CONCURRENT_REQUESTS=10

These values must be configurable according to available resources and provider limits.

Requirements:
- Independent worker execution.
- Asynchronous task scheduling.
- Reusable browser sessions.
- Worker health monitoring.
- Independent error handling.
- Graceful worker shutdown.
- Controlled concurrency.
- No unlimited asyncio.gather() calls.

Six workers must not mean six uncontrolled browser instances.

### 2. INTELLIGENT GEOGRAPHIC QUERY DISTRIBUTION

Implement dynamic geographic partitioning.

Example:

Search:
Keyword: Gyms
Location: Mumbai

The system should:
1. Resolve the requested location.
2. Generate geographic sub-areas.
3. Create independent search tasks.
4. Assign tasks to available workers.
5. Prioritize high-density regions.
6. Detect overlapping regions.
7. Track completed and pending areas.
8. Generate additional areas when needed.
9. Stop when the target is reached or search coverage is exhausted.

Do not hardcode Mumbai or any specific city.

Use adaptive geographic partitioning based on business density.

### 3. CENTRALIZED PROCESSING QUEUE

Implement a bounded asynchronous queue.

All workers must submit extracted records to the central pipeline.

Support:
- Multiple producers.
- Multiple consumers.
- Backpressure.
- Configurable queue size.
- Task recovery.
- Graceful shutdown.
- Failure isolation.

Evaluate Redis or an appropriate durable queue if required by the existing architecture.

### 4. CONCURRENCY AND RESOURCE MANAGEMENT

Monitor:
- CPU utilization.
- Available RAM.
- Browser memory.
- Queue size.
- Extraction latency.
- Network latency.
- Provider throttling.

Implement resource-aware concurrency adjustments.

Do not overload the DigitalOcean Droplet.

### 5. DEDUPLICATION ACROSS WORKERS

Prevent duplicate records across:
- Multiple workers.
- Different geographic regions.
- Overlapping search queries.
- Multiple simultaneous search jobs.

Use:
- Stable business identifiers.
- Normalized business names.
- Phone numbers.
- Website domains.
- Address matching.
- MongoDB atomic upserts.

Deduplication must be concurrency-safe.

### 6. RETRY AND FAILURE MANAGEMENT

Implement:
- Exponential backoff with jitter.
- Configurable retry limits.
- Temporary failure detection.
- Provider rate-limit handling.
- Worker recovery.
- Failed task tracking.

Do not retry permanent failures indefinitely.

Do not bypass access restrictions or provider limits.

### 7. MULTIPLE SEARCH REQUEST SUPPORT

Ensure multiple users can execute independent searches simultaneously.

Each job must have:
- Unique job ID.
- Independent task tracking.
- Independent progress.
- Independent cancellation.
- Independent worker allocation.

One search must not block another.

### 8. REAL-TIME FRONTEND INTEGRATION

Integrate with the existing Next.js Leads page.

Display actual:
- Active workers.
- Completed geographic areas.
- Pending geographic areas.
- Discovered leads.
- Unique leads.
- Duplicate records.
- Failed records.
- Current extraction speed.
- Elapsed time.

Use existing WebSocket/SSE infrastructure if available.

Do not fabricate progress percentages.

Preserve the existing UI/UX.

### 9. TESTING

Test:
- Six workers operating concurrently.
- Multiple simultaneous searches.
- Duplicate records across workers.
- Browser crashes.
- Worker failures.
- Network interruptions.
- Application restart.
- Queue recovery.
- Resource consumption.

### 10. PHASE 2 DELIVERABLES

Provide:
1. Worker architecture.
2. Geographic distribution implementation.
3. Queue implementation.
4. Modified files.
5. Concurrency benchmark.
6. CPU and RAM usage.
7. Duplicate prevention results.
8. Remaining bottlenecks.

Complete Phase 2 implementation and testing before proceeding to Phase 3.






# PHASE 3: DATABASE, BACKGROUND PROCESSING & MAXIMUM THROUGHPUT
## LeadFinderAgent – Production Performance Optimization

### OBJECTIVE

Complete the high-performance lead scraping architecture.

Final target: 500+ UNIQUE, VALIDATED AND SUCCESSFULLY PERSISTED leads per minute, subject to real provider capacity, search coverage, and infrastructure limits.

### 1. MONGODB BULK PERSISTENCE

Optimize MongoDB operations.

Implement:
- Asynchronous bulk writes.
- Configurable batch sizes.
- Configurable flush intervals.
- Atomic upserts.
- Proper indexes.
- Connection pooling.
- Partial batch failure handling.
- Duplicate-safe persistence.

Avoid individual database writes for every lead when bulk operations are appropriate.

Never lose successfully extracted records because another record in the batch failed.

Preserve existing valid information.

### 2. DISCOVERY AND ENRICHMENT SEPARATION

Implement two independent pipelines.

PIPELINE A: DISCOVERY

Extract and immediately persist:
- Business name.
- Category.
- Address.
- Location.
- Available phone.
- Available website.
- Source identifier.

PIPELINE B: BACKGROUND ENRICHMENT

Process separately:
- Additional phone information.
- Publicly available business emails.
- Website details.
- Contact page discovery.
- Additional business information.

Discovery must never wait for enrichment.

Use independent queues, worker pools, priorities, and concurrency limits.

A failed enrichment task must never change a successfully discovered lead into a failed discovery record.

### 3. INTELLIGENT CACHING

Implement caching for:
- Previously processed search queries.
- Geographic search areas.
- Business identifiers.
- Website domains.
- Completed enrichment results.

Requirements:
- Cache expiration.
- Cache invalidation.
- Duplicate request prevention.
- Stale data handling.

Use Redis only if justified by the existing infrastructure.

Cached records must not be counted as newly discovered leads.

### 4. ADVANCED DUPLICATE PROTECTION

Implement concurrency-safe deduplication.

Requirements:
- Stable business identifiers.
- Normalized phone numbers.
- Normalized website domains.
- Business name and address matching.
- Atomic MongoDB operations.
- Unique indexes where appropriate.

Prevent race conditions between simultaneous search jobs.

Do not overwrite high-quality records with empty or lower-quality data.

### 5. ADAPTIVE PERFORMANCE CONTROLLER

Implement dynamic concurrency optimization.

Monitor:
- CPU.
- RAM.
- Browser memory.
- Network latency.
- Queue congestion.
- MongoDB write latency.
- Provider rate limits.
- Extraction success rate.

Automatically adjust worker concurrency within safe limits.

Discovery must retain sufficient resources even when enrichment workload increases.

### 6. PROVIDER ADAPTER ARCHITECTURE

Evaluate integration with multiple authorized and documented business data providers.

Create a common provider interface.

Each provider must support:
- Business search.
- Result pagination.
- Data extraction.
- Error reporting.
- Rate-limit handling.
- Performance metrics.

Allow providers to be integrated without rewriting the central scraping pipeline.

Do not use undocumented internal endpoints or bypass provider restrictions.

### 7. PERFORMANCE MONITORING

Measure separately:

DISCOVERY:
- Raw records/minute.
- Unique records/minute.
- Validated leads/minute.
- Successfully persisted leads/minute.

ENRICHMENT:
- Pending tasks.
- Completed tasks.
- Average enrichment time.
- Email discovery success rate.
- Phone enrichment success rate.

SYSTEM:
- CPU.
- RAM.
- Network.
- MongoDB latency.
- Queue latency.
- Error rate.
- Duplicate percentage.

### 8. FINAL BENCHMARKING

Run comparable benchmarks.

Targets:

Stage 1:
100–150 leads/minute.

Stage 2:
200–300 leads/minute.

Final:
500+ unique validated leads/minute.

These are targets, not guaranteed results.

The final throughput must count only unique leads successfully persisted in MongoDB.

Do not count:
- Duplicate records.
- Cached results as new discoveries.
- Invalid records.
- Failed database writes.
- Artificial test records.

### 9. STABILITY TESTING

Test:
- Multiple simultaneous searches.
- High concurrency.
- Queue congestion.
- Database interruption.
- Backend restart.
- Worker crashes.
- Browser crashes.
- Duplicate insertion attempts.
- Enrichment failures.
- Graceful shutdown.
- Recovery of pending jobs.

### 10. FINAL DELIVERY

Provide:
1. Complete architecture documentation.
2. All modified and newly created files.
3. New environment variables.
4. Database index changes.
5. API changes.
6. Worker configuration.
7. Frontend integration details.
8. Automated test results.
9. Before-and-after benchmarks.
10. CPU/RAM consumption.
11. Remaining performance bottlenecks.

### STRICT REQUIREMENTS

- Preserve existing LeadFinderAgent functionality.
- Do not break the Leads page.
- Do not break AI analysis or bulk analysis.
- Do not break existing API contracts.
- Do not create duplicate scraper implementations.
- Do not introduce unlimited concurrency.
- Do not bypass CAPTCHAs or access restrictions.
- Respect provider quotas and terms.
- Do not fabricate performance results.

### FINAL SUCCESS CRITERIA

The complete system must provide:

- Fast lead discovery.
- Controlled parallel execution.
- Dynamic geographic query distribution.
- Centralized processing.
- Concurrency-safe deduplication.
- Optimized MongoDB bulk writes.
- Independent background enrichment.
- Accurate real-time progress.
- Reliable task recovery.
- Measurable performance improvements.

Complete all implementation, testing, and benchmarking.

Do not claim 500+ leads/minute unless actual repeatable benchmarks demonstrate it.