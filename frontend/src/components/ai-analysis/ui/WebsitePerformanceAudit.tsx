"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Code,
  Gauge,
  Images,
  Palette,
  Server,
  Type,
} from "lucide-react";
import { cn } from "@/src/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  Excellent: "#10b981",
  Good: "#3b82f6",
  Average: "#f59e0b",
  Poor: "#ef4444",
};

interface WebsitePerformanceAuditProps {
  data?: Record<string, unknown> | null;
}

interface MetricValue {
  value?: number | null;
  unit?: string | null;
  status?: string | null;
  color?: string | null;
  label?: string | null;
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

function metricValue(raw: unknown): MetricValue {
  const record = asRecord(raw);
  return {
    value: toNumber(record.value),
    unit: asString(record.unit),
    status: asString(record.status),
    color: asString(record.color) ?? undefined,
    label: asString(record.label),
  };
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
  icon,
  children,
}: {
  title: string;
  score?: number | null;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const numericScore = typeof score === "number" ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  const scoreColor = numericScore >= 80 ? "#10b981" : numericScore >= 60 ? "#3b82f6" : numericScore >= 40 ? "#f59e0b" : "#ef4444";

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
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${numericScore}%`, backgroundColor: scoreColor }} />
      </div>
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
        {bool ? <CheckCircle className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />}
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
      <span className="font-semibold text-gray-800">{text}</span>
    </div>
  );
}

export function WebsitePerformanceAudit({ data }: WebsitePerformanceAuditProps) {
  const [showRecommendations, setShowRecommendations] = useState(true);

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-400">
        <Gauge className="h-4 w-4" />
        No website performance audit available yet.
      </div>
    );
  }

  const overallScore = toInt(data.overallScore);
  const grade = asString(data.grade) ?? "—";
  const auditTime = toNumber(data.auditTime);

  const cwv = asRecord(data.coreWebVitals);
  const speed = asRecord(data.websiteSpeed);
  const images = asRecord(data.images);
  const javascript = asRecord(data.javascript);
  const css = asRecord(data.css);
  const fonts = asRecord(data.fonts);
  const compression = asRecord(data.compression);
  const cache = asRecord(data.cache);
  const cdn = asRecord(data.cdn);
  const resources = asRecord(data.resources);
  const mobile = asRecord(data.mobile);
  const desktop = asRecord(data.desktop);
  const hosting = asRecord(data.hosting);
  const thirdParty = asRecord(data.thirdParty);

  const recommendations = asArray(data.recommendations)
    .map((item) => asRecord(item))
    .filter((item) => asString(item.title));

  const cwvMetrics = [
    { key: "lcp", name: "LCP", hint: "Largest Contentful Paint" },
    { key: "fcp", name: "FCP", hint: "First Contentful Paint" },
    { key: "inp", name: "INP", hint: "Interaction to Next Paint" },
    { key: "cls", name: "CLS", hint: "Cumulative Layout Shift" },
    { key: "ttfb", name: "TTFB", hint: "Time to First Byte" },
    { key: "tbt", name: "TBT", hint: "Total Blocking Time" },
    { key: "speedIndex", name: "Speed Index", hint: "Visual completion speed" },
    { key: "tti", name: "TTI", hint: "Time to Interactive" },
  ];

  const overallColor = overallScore >= 80 ? "#10b981" : overallScore >= 60 ? "#3b82f6" : overallScore >= 40 ? "#f59e0b" : "#ef4444";
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
          </div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Overall Score</div>
          {auditTime !== null && (
            <div className="mt-2 text-[11px] text-gray-400">
              Audited in {auditTime >= 1000 ? `${(auditTime / 1000).toFixed(1)}s` : `${Math.round(auditTime)}ms`}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Core Web Vitals */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
                <Gauge className="h-4 w-4 text-blue-500" />
                Core Web Vitals
              </span>
              {typeof cwv.score === "number" && (
                <span className="text-xs font-semibold text-gray-400">Category score: {Math.round(cwv.score)}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {cwvMetrics.map(({ key, name, hint }) => {
                const metric = metricValue(cwv[key]);
                const color = metric.color ?? STATUS_COLORS[metric.status ?? ""] ?? "#6b7280";
                return (
                  <div key={key} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm" title={hint}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{name}</span>
                      {metric.status && <StatusPill status={metric.status} />}
                    </div>
                    <div className="mt-1.5 font-mono text-base font-bold" style={{ color }}>
                      {metric.label ?? "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Website Speed */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
                <Server className="h-4 w-4 text-blue-500" />
                Website Speed
              </span>
              {typeof speed.score === "number" && (
                <span className="text-xs font-semibold text-gray-400">Category score: {Math.round(speed.score)}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                { key: "loadTime", name: "Load Time" },
                { key: "domReadyTime", name: "DOM Ready" },
                { key: "fullyLoadedTime", name: "Fully Loaded" },
                { key: "initialResponseTime", name: "Initial Response" },
                { key: "networkIdleTime", name: "Network Idle" },
              ].map(({ key, name }) => {
                const metric = metricValue(speed[key]);
                const color = metric.color ?? STATUS_COLORS[metric.status ?? ""] ?? "#6b7280";
                return (
                  <div key={key} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{name}</div>
                    <div className="mt-1.5 font-mono text-sm font-bold" style={{ color }}>
                      {metric.label ?? "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <CategoryScoreCard title="Images" score={toNumber(images.score)} icon={<Images className="h-4 w-4" />}>
          <ValueRow label="Total" value={images.total} />
          <ValueRow label="Optimized" value={images.optimized} />
          <ValueRow label="Unoptimized" value={images.unoptimized} />
          <ValueRow label="Large images" value={images.largeImages} />
          <ValueRow label="Missing lazy-loading" value={images.missingLazyLoading} />
          <ValueRow label="Missing responsive" value={images.missingResponsive} />
          <ValueRow label="Missing alt text" value={images.missingAlt} />
        </CategoryScoreCard>

        <CategoryScoreCard title="JavaScript" score={toNumber(javascript.score)} icon={<Code className="h-4 w-4" />}>
          <ValueRow label="Files" value={javascript.totalFiles} />
          <ValueRow label="Bundle size" value={metricValue(javascript.bundleSize).label} />
          <ValueRow label="Unused JS" value={metricValue(javascript.unusedJS).label} />
          <ValueRow label="Large bundles" value={javascript.largeBundles} />
          <ValueRow label="Render-blocking" value={javascript.renderBlocking} />
          <CheckRow label="Minified" value={javascript.minified} />
          <CheckRow label="Code splitting" value={javascript.codeSplitting} />
        </CategoryScoreCard>

        <CategoryScoreCard title="CSS" score={toNumber(css.score)} icon={<Palette className="h-4 w-4" />}>
          <ValueRow label="Files" value={css.totalFiles} />
          <ValueRow label="Unused CSS" value={metricValue(css.unusedCSS).label} />
          <ValueRow label="Render-blocking" value={css.renderBlocking} />
          <CheckRow label="Minified" value={css.minified} />
          <CheckRow label="Critical CSS" value={css.criticalCSS} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Fonts" score={toNumber(fonts.score)} icon={<Type className="h-4 w-4" />}>
          <ValueRow label="Google fonts" value={fonts.googleFonts} />
          <ValueRow label="Custom fonts" value={fonts.customFonts} />
          <ValueRow label="Total" value={fonts.total} />
          <CheckRow label="Too many fonts" value={fonts.tooManyFonts} />
          <ValueRow label="Loading" value={fonts.fontLoading} />
          <ValueRow label="Font display" value={fonts.fontDisplay} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Compression" score={toNumber(compression.score)}>
          <CheckRow label="GZIP" value={compression.gzip} />
          <CheckRow label="Brotli" value={compression.brotli} />
          <CheckRow label="No compression" value={compression.noCompression} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Browser Cache" score={toNumber(cache.score)}>
          <CheckRow label="Cache-Control" value={cache.cacheControl} />
          <CheckRow label="ETag" value={cache.etag} />
          <CheckRow label="Expires" value={cache.expires} />
          <CheckRow label="Immutable assets" value={cache.immutableAssets} />
        </CategoryScoreCard>

        <CategoryScoreCard title="CDN" score={toNumber(cdn.score)}>
          <CheckRow label="Detected" value={cdn.detected} />
          <ValueRow label="Provider" value={cdn.provider} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Resources" score={toNumber(resources.score)}>
          <ValueRow label="Requests" value={resources.totalRequests} />
          <ValueRow label="HTML" value={metricValue(resources.htmlSize).label} />
          <ValueRow label="CSS" value={metricValue(resources.cssSize).label} />
          <ValueRow label="JavaScript" value={metricValue(resources.jsSize).label} />
          <ValueRow label="Images" value={metricValue(resources.imageSize).label} />
          <ValueRow label="Total download" value={metricValue(resources.totalDownloadSize).label} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Hosting" score={toNumber(hosting.score)}>
          <ValueRow label="Response time" value={metricValue(hosting.responseTime).label} />
          <ValueRow label="Server" value={hosting.serverHeaders} />
          <ValueRow label="HTTP version" value={hosting.httpVersion} />
          <CheckRow label="Keep-alive" value={hosting.connectionKeepAlive} />
          <CheckRow label="HTTP/2" value={hosting.http2} />
          <CheckRow label="HTTP/3" value={hosting.http3} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Third-Party" score={toNumber(thirdParty.score)}>
          <ValueRow label="Trackers" value={thirdParty.count} />
          <ValueRow label="Tracking scripts" value={thirdParty.trackingScripts} />
          <ValueRow label="Chat widgets" value={thirdParty.chatWidgets} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Mobile" score={toNumber(mobile.score)}>
          <CheckRow label="Viewport meta" value={mobile.viewport} />
          <CheckRow label="Responsive layout" value={mobile.responsiveLayout} />
          <CheckRow label="Touch friendly" value={mobile.touchFriendly} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Desktop" score={toNumber(desktop.score)} />
      </div>

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
            {showRecommendations ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
          {showRecommendations && (
            <ul className="space-y-2 border-t border-gray-200 px-4 py-3">
              {recommendations.map((item, index) => {
                const priority = asString(item.priority) ?? "Medium";
                const priorityColor = priority === "High" ? "#ef4444" : priority === "Medium" ? "#f59e0b" : "#3b82f6";
                return (
                  <li key={`audit-rec-${index}`} className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
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
