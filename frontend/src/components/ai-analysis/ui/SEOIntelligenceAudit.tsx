"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ExternalLink,
  FileText,
  Globe,
  Grid,
  Heading1,
  ImageIcon,
  Link,
  Link2,
  MapPin,
  MessageSquare,
  Radar,
  Search,
  Smartphone,
  Star,
  Tag,
  Users,
} from "lucide-react";
import { cn } from "@/src/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  Excellent: "#10b981",
  Good: "#3b82f6",
  Average: "#f59e0b",
  Poor: "#ef4444",
  Critical: "#b91c1c",
};

interface SEOIntelligenceAuditProps {
  data?: Record<string, unknown> | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return value === undefined || value === null || value === "" ? null : String(value);
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toInt(value: unknown): number {
  const numberValue = toNumber(value);
  return numberValue === null ? 0 : Math.round(numberValue);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function StatusPill({ status }: { status?: string | null }) {
  if (!status) return null;
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

function CategoryScoreCard({
  title,
  score,
  status,
  issueCount,
  icon,
  children,
}: {
  title: string;
  score?: number | null;
  status?: string | null;
  issueCount?: number;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const numericScore = typeof score === "number" ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  const scoreColor = STATUS_COLORS[status ?? ""] ?? (numericScore >= 80 ? "#10b981" : numericScore >= 60 ? "#3b82f6" : numericScore >= 40 ? "#f59e0b" : "#ef4444");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
          {icon && <span className="shrink-0 text-blue-500">{icon}</span>}
          <span className="truncate">{title}</span>
        </span>
        <span className="shrink-0 font-mono text-lg font-bold" style={{ color: scoreColor }}>
          {typeof score === "number" ? Math.round(score) : "N/A"}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${numericScore}%`, backgroundColor: scoreColor }} />
        </div>
      </div>
      {(status || (issueCount ?? 0) > 0) && (
        <div className="mt-2 flex items-center gap-2">
          <StatusPill status={status} />
          {(issueCount ?? 0) > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">{issueCount} issue(s)</span>
          )}
        </div>
      )}
      {children && <div className="mt-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function CheckRow({ label, value, positive }: { label: string; value?: unknown; positive?: boolean }) {
  const bool = positive ?? Boolean(value);
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-gray-500">{label}</span>
      <span className={cn("inline-flex items-center gap-1 font-semibold", bool ? "text-emerald-600" : "text-gray-400")}>
        {bool ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> : <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />}
        {String(value ?? (bool ? "Yes" : "No"))}
      </span>
    </div>
  );
}

function ValueRow({ label, value }: { label: string; value?: unknown }) {
  const text = value === undefined || value === null || value === "" ? "—" : String(value);
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-gray-500">{label}</span>
      <span className="truncate text-right font-semibold text-gray-800">{text}</span>
    </div>
  );
}

function ListRow({ label, values }: { label: string; values?: unknown }) {
  const items = asArray(values).filter((value) => asString(value));
  if (items.length === 0) return null;
  return (
    <div className="text-[13px]">
      <div className="text-gray-500">{label}</div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {items.slice(0, 6).map((value, index) => (
          <span key={`${label}-${index}`} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
            {String(value)}
          </span>
        ))}
        {items.length > 6 && <span className="text-[11px] text-gray-400">+{items.length - 6}</span>}
      </div>
    </div>
  );
}

export function SEOIntelligenceAudit({ data }: SEOIntelligenceAuditProps) {
  const [showIssues, setShowIssues] = useState(true);
  const [showRecommendations, setShowRecommendations] = useState(true);

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-400">
        <Search className="h-4 w-4" />
        No SEO intelligence audit available yet.
      </div>
    );
  }

  const overallScore = toInt(data.overallScore);
  const grade = asString(data.grade) ?? "—";
  const overallStatus = asString(data.overallStatus);
  const auditTime = toNumber(data.auditTime);

  const modules = {
    meta: asRecord(data.meta),
    headings: asRecord(data.headings),
    images: asRecord(data.images),
    urls: asRecord(data.urls),
    indexability: asRecord(data.indexability),
    openGraph: asRecord(data.openGraph),
    twitterCards: asRecord(data.twitterCards),
    schema: asRecord(data.schema),
    internalLinks: asRecord(data.internalLinks),
    externalLinks: asRecord(data.externalLinks),
    content: asRecord(data.content),
    mobile: asRecord(data.mobile),
    pages: asRecord(data.pages),
    localSEO: asRecord(data.localSEO),
    socialSEO: asRecord(data.socialSEO),
    favicon: asRecord(data.favicon),
  };

  const issues = asArray(data.issues)
    .map((item) => asRecord(item))
    .filter((item) => asString(item.title) || asString(item.description));

  const recommendations = asArray(data.recommendations)
    .map((item) => asRecord(item))
    .filter((item) => asString(item.title));

  const overallColor = STATUS_COLORS[overallStatus ?? ""] ?? (overallScore >= 80 ? "#10b981" : overallScore >= 60 ? "#3b82f6" : overallScore >= 40 ? "#f59e0b" : "#ef4444");
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (overallScore / 100) * circumference;

  const gradeColor = grade === "A" || grade === "B" ? "#10b981" : grade === "C" ? "#3b82f6" : grade === "D" ? "#f59e0b" : "#ef4444";

  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm">
          <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
            <svg className="h-full w-full -rotate-90">
              <circle cx="56" cy="56" r={radius} className="stroke-gray-200" strokeWidth="9" fill="transparent" />
              <circle
                cx="56"
                cy="56"
                r={radius}
                className="stroke-current transition-all duration-700"
                style={{ color: overallColor }}
                strokeWidth="9"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute">
              <div className="font-mono text-3xl font-bold text-gray-900">{overallScore}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">/ 100</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span
              className="rounded-lg px-2.5 py-1 font-mono text-lg font-bold"
              style={{ backgroundColor: `${gradeColor}1A`, color: gradeColor }}
            >
              {grade}
            </span>
            <StatusPill status={overallStatus} />
          </div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-gray-500">SEO Score</div>
          {auditTime !== null && (
            <div className="mt-2 text-[11px] text-gray-400">
              Audited in {auditTime >= 1000 ? `${(auditTime / 1000).toFixed(1)}s` : `${Math.round(auditTime)}ms`}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* On-page essentials */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
              <Tag className="h-4 w-4 text-blue-500" />
              On-Page Essentials
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <CategoryScoreCard title="Meta Tags" score={toNumber(modules.meta.score)} status={asString(modules.meta.status)} issueCount={toInt(modules.meta.issueCount)} icon={<Tag className="h-4 w-4" />}>
                <CheckRow label="Title tags" value={modules.meta.hasTitle} />
                <ValueRow label="Avg title length" value={toNumber(modules.meta.titleLengthAvg) ? `${toInt(modules.meta.titleLengthAvg)} chars` : null} />
                <CheckRow label="Meta descriptions" value={modules.meta.hasMetaDescription} />
                <ValueRow label="Avg description length" value={toNumber(modules.meta.descriptionLengthAvg) ? `${toInt(modules.meta.descriptionLengthAvg)} chars` : null} />
                <ValueRow label="Duplicate titles" value={modules.meta.duplicateTitles} />
                <ValueRow label="Missing descriptions" value={modules.meta.missingMetaDescriptions} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Headings" score={toNumber(modules.headings.score)} status={asString(modules.headings.status)} issueCount={toInt(modules.headings.issueCount)} icon={<Heading1 className="h-4 w-4" />}>
                <CheckRow label="H1 present" value={modules.headings.hasH1} />
                <ValueRow label="H1 count" value={modules.headings.h1Count} />
                <ValueRow label="Avg headings/page" value={modules.headings.averageHeadingsPerPage} />
                <ValueRow label="Pages without H1" value={modules.headings.pagesWithoutH1} />
                <ValueRow label="Pages with multiple H1" value={modules.headings.multipleH1Pages} />
                <CheckRow label="H2 sections" value={modules.headings.missingH2} positive={!modules.headings.missingH2} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Images" score={toNumber(modules.images.score)} status={asString(modules.images.status)} issueCount={toInt(modules.images.issueCount)} icon={<ImageIcon className="h-4 w-4" />}>
                <ValueRow label="Total images" value={modules.images.total} />
                <ValueRow label="Missing alt text" value={modules.images.missingAlt} />
                <ValueRow label="Missing lazy-loading" value={modules.images.missingLazyLoading} />
                <ValueRow label="Missing dimensions" value={modules.images.missingDimensions} />
                <ValueRow label="Large images" value={modules.images.largeImages} />
              </CategoryScoreCard>
            </div>
          </div>

          {/* Technical SEO */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
              <Radar className="h-4 w-4 text-blue-500" />
              Technical SEO
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <CategoryScoreCard title="URL Structure" score={toNumber(modules.urls.score)} status={asString(modules.urls.status)} issueCount={toInt(modules.urls.issueCount)} icon={<Link className="h-4 w-4" />}>
                <CheckRow label="HTTPS" value={modules.urls.hasHttps} />
                <ValueRow label="Avg URL length" value={toNumber(modules.urls.averageUrlLength) ? `${toInt(modules.urls.averageUrlLength)} chars` : null} />
                <CheckRow label="Descriptive URLs" value={modules.urls.descriptiveUrls} />
                <CheckRow label="Contains stopwords" value={modules.urls.containsStopwords} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Indexability" score={toNumber(modules.indexability.score)} status={asString(modules.indexability.status)} issueCount={toInt(modules.indexability.issueCount)} icon={<Search className="h-4 w-4" />}>
                <CheckRow label="robots.txt" value={modules.indexability.hasRobotsTxt} />
                <CheckRow label="XML sitemap" value={modules.indexability.hasSitemap} />
                <ValueRow label="Noindex pages" value={modules.indexability.noindexPages} />
                <ValueRow label="Canonical URLs" value={modules.indexability.canonicalUrls} />
                <ValueRow label="Broken links" value={modules.indexability.brokenLinks} />
                <ListRow label="Blocked by robots" values={modules.indexability.blockedByRobots} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Schema Markup" score={toNumber(modules.schema.score)} status={asString(modules.schema.status)} issueCount={toInt(modules.schema.issueCount)} icon={<Boxes className="h-4 w-4" />}>
                <CheckRow label="Structured data" value={modules.schema.hasSchema} />
                <ValueRow label="JSON-LD blocks" value={modules.schema.jsonLdBlocks} />
                <ValueRow label="Schema types" value={modules.schema.totalSchemas} />
                <ListRow label="Types" values={modules.schema.schemaTypes} />
                <CheckRow label="Valid JSON-LD" value={modules.schema.validJsonLd} />
                <CheckRow label="Organization" value={modules.schema.hasOrganization} />
                <CheckRow label="LocalBusiness" value={modules.schema.hasLocalBusiness} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Open Graph" score={toNumber(modules.openGraph.score)} status={asString(modules.openGraph.status)} issueCount={toInt(modules.openGraph.issueCount)} icon={<ExternalLink className="h-4 w-4" />}>
                <CheckRow label="og:title" value={modules.openGraph.hasOgTitle} />
                <CheckRow label="og:description" value={modules.openGraph.hasOgDescription} />
                <CheckRow label="og:image" value={modules.openGraph.hasOgImage} />
                <CheckRow label="og:url" value={modules.openGraph.hasOgUrl} />
                <ValueRow label="Completeness" value={modules.openGraph.ogCompleteness} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Twitter Cards" score={toNumber(modules.twitterCards.score)} status={asString(modules.twitterCards.status)} issueCount={toInt(modules.twitterCards.issueCount)} icon={<MessageSquare className="h-4 w-4" />}>
                <CheckRow label="twitter:card" value={modules.twitterCards.hasTwitterCard} />
                <CheckRow label="twitter:title" value={modules.twitterCards.hasTwitterTitle} />
                <CheckRow label="twitter:image" value={modules.twitterCards.hasTwitterImage} />
                <ValueRow label="Card type" value={modules.twitterCards.cardType} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Content Quality" score={toNumber(modules.content.score)} status={asString(modules.content.status)} issueCount={toInt(modules.content.issueCount)} icon={<FileText className="h-4 w-4" />}>
                <ValueRow label="Avg word count" value={modules.content.averageWordCount} />
                <ValueRow label="Thin content pages" value={modules.content.thinContentPages} />
                <CheckRow label="Has blog" value={modules.content.hasBlog} />
                <CheckRow label="Keyword usage" value={modules.content.keywordUsage} />
                <CheckRow label="Fresh content" value={modules.content.freshContent} />
              </CategoryScoreCard>
            </div>
          </div>

          {/* Site structure */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
              <Globe className="h-4 w-4 text-blue-500" />
              Site Structure & Visibility
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <CategoryScoreCard title="Internal Links" score={toNumber(modules.internalLinks.score)} status={asString(modules.internalLinks.status)} issueCount={toInt(modules.internalLinks.issueCount)} icon={<Link2 className="h-4 w-4" />}>
                <ValueRow label="Total links" value={modules.internalLinks.total} />
                <ValueRow label="Avg per page" value={toNumber(modules.internalLinks.averagePerPage) ? Number(modules.internalLinks.averagePerPage).toFixed(1) : null} />
                <ValueRow label="Orphaned pages" value={modules.internalLinks.orphanedPages} />
                <ValueRow label="Pages without links" value={modules.internalLinks.pagesWithoutInternalLinks} />
                <ValueRow label="Broken internal links" value={modules.internalLinks.brokenInternalLinks} />
              </CategoryScoreCard>

              <CategoryScoreCard title="External Links" score={toNumber(modules.externalLinks.score)} status={asString(modules.externalLinks.status)} issueCount={toInt(modules.externalLinks.issueCount)} icon={<Globe className="h-4 w-4" />}>
                <ValueRow label="Total links" value={modules.externalLinks.total} />
                <ValueRow label="Avg per page" value={toNumber(modules.externalLinks.averagePerPage) ? Number(modules.externalLinks.averagePerPage).toFixed(1) : null} />
                <CheckRow label="nofollow used" value={modules.externalLinks.noFollow} />
                <ValueRow label="Trusted domains" value={modules.externalLinks.trustedDomains} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Mobile SEO" score={toNumber(modules.mobile.score)} status={asString(modules.mobile.status)} issueCount={toInt(modules.mobile.issueCount)} icon={<Smartphone className="h-4 w-4" />}>
                <CheckRow label="Viewport meta" value={modules.mobile.hasViewport} />
                <CheckRow label="Media queries" value={modules.mobile.hasMediaQueries} />
                <CheckRow label="Responsive images" value={modules.mobile.responsiveImages} />
                <CheckRow label="Tap targets" value={modules.mobile.tapTargets} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Pages" score={toNumber(modules.pages.score)} status={asString(modules.pages.status)} issueCount={toInt(modules.pages.issueCount)} icon={<Grid className="h-4 w-4" />}>
                <ValueRow label="Total pages" value={modules.pages.totalPages} />
                <ValueRow label="Crawled pages" value={modules.pages.crawledPages} />
                <ValueRow label="Internal pages" value={modules.pages.internalPages} />
                <ValueRow label="Navigation depth" value={modules.pages.navigationDepth} />
                <CheckRow label="Orphan pages" value={modules.pages.hasOrphanPages} />
                <ValueRow label="Duplicate titles" value={modules.pages.duplicateTitles} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Local SEO" score={toNumber(modules.localSEO.score)} status={asString(modules.localSEO.status)} issueCount={toInt(modules.localSEO.issueCount)} icon={<MapPin className="h-4 w-4" />}>
                <CheckRow label="NAP present" value={modules.localSEO.hasNab} />
                <CheckRow label="Address" value={modules.localSEO.hasAddress} />
                <CheckRow label="Phone number" value={modules.localSEO.hasPhone} />
                <CheckRow label="LocalBusiness schema" value={modules.localSEO.hasLocalBusinessSchema} />
                <CheckRow label="Google Maps" value={modules.localSEO.hasGoogleMaps} />
                <ValueRow label="Local pack signals" value={modules.localSEO.localPackSignals} />
                <ListRow label="Cities" values={modules.localSEO.citiesMentioned} />
              </CategoryScoreCard>

              <CategoryScoreCard title="Social SEO" score={toNumber(modules.socialSEO.score)} status={asString(modules.socialSEO.status)} issueCount={toInt(modules.socialSEO.issueCount)} icon={<Users className="h-4 w-4" />}>
                <CheckRow label="Social profiles" value={modules.socialSEO.hasSocialLinks} />
                <ValueRow label="Profiles found" value={modules.socialSEO.socialProfiles} />
                <CheckRow label="sameAs schema" value={modules.socialSEO.hasSameAsSchema} />
                <ListRow label="Platforms" values={modules.socialSEO.platforms} />
              </CategoryScoreCard>
            </div>
          </div>
        </div>
      </div>

      {/* Favicon */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <CategoryScoreCard title="Favicon" score={toNumber(modules.favicon.score)} status={asString(modules.favicon.status)} issueCount={toInt(modules.favicon.issueCount)} icon={<Star className="h-4 w-4" />}>
          <CheckRow label="Favicon detected" value={modules.favicon.hasFavicon} />
          <ValueRow label="URL" value={modules.favicon.faviconUrl} />
          <CheckRow label="Apple touch icon" value={modules.favicon.hasAppleTouchIcon} />
          <CheckRow label="ICO format" value={modules.favicon.hasIcoFormat} />
          <ValueRow label="Multiple icons" value={modules.favicon.multipleIcons} />
        </CategoryScoreCard>
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setShowIssues((value) => !value)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              SEO Issues
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">{issues.length}</span>
            </span>
            {showIssues ? <span className="text-gray-400">−</span> : <span className="text-gray-400">+</span>}
          </button>
          {showIssues && (
            <ul className="space-y-2 border-t border-gray-200 px-4 py-3">
              {issues.map((item, index) => {
                const severity = asString(item.severity) ?? "Warning";
                const severityColor =
                  severity === "Error" ? "#b91c1c" : severity === "Critical" ? "#b91c1c" : severity === "Warning" ? "#f59e0b" : "#3b82f6";
                return (
                  <li key={`seo-issue-${index}`} className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{asString(item.title) ?? asString(item.description)}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: `${severityColor}1A`, color: severityColor }}
                        >
                          {severity}
                        </span>
                        {asString(item.category) && (
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                            {asString(item.category)}
                          </span>
                        )}
                      </div>
                      {asString(item.title) && asString(item.description) && (
                        <p className="mt-1 text-[13px] leading-5 text-gray-600">{asString(item.description)}</p>
                      )}
                      {asString(item.affectedUrl) && (
                        <p className="mt-1 truncate font-mono text-[11px] text-gray-400">{asString(item.affectedUrl)}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setShowRecommendations((value) => !value)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Recommendations
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600">{recommendations.length}</span>
            </span>
            {showRecommendations ? <span className="text-gray-400">−</span> : <span className="text-gray-400">+</span>}
          </button>
          {showRecommendations && (
            <ul className="space-y-2 border-t border-gray-200 px-4 py-3">
              {recommendations.map((item, index) => {
                const priority = asString(item.priority) ?? "Medium";
                const priorityColor = priority === "High" ? "#ef4444" : priority === "Medium" ? "#f59e0b" : "#3b82f6";
                return (
                  <li key={`seo-rec-${index}`} className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{asString(item.title)}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: `${priorityColor}1A`, color: priorityColor }}
                        >
                          {priority}
                        </span>
                        {asString(item.category) && (
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                            {asString(item.category)}
                          </span>
                        )}
                      </div>
                      {asString(item.description) && <p className="mt-1 text-[13px] leading-5 text-gray-600">{asString(item.description)}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
