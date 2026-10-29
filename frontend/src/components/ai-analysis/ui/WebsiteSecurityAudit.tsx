"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Cookie,
  Globe,
  KeyRound,
  Lock,
  ScrollText,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/src/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  Excellent: "#10b981",
  Good: "#3b82f6",
  Average: "#f59e0b",
  Poor: "#ef4444",
  Critical: "#7f1d1d",
};

const HEADER_STATUS_COLORS: Record<string, string> = {
  Present: "#10b981",
  Configured: "#10b981",
  Weak: "#f59e0b",
  Missing: "#ef4444",
};

interface WebsiteSecurityAuditProps {
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
  icon,
  children,
}: {
  title: string;
  score?: number | null;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const numericScore = typeof score === "number" ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  const scoreColor = numericScore >= 80 ? "#10b981" : numericScore >= 60 ? "#3b82f6" : numericScore >= 40 ? "#f59e0b" : numericScore >= 20 ? "#ef4444" : "#7f1d1d";

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
  const isBadge = value === "Present" || value === "Missing" || value === "Weak" || value === "Configured";
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-gray-500">{label}</span>
      {isBadge ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: `${HEADER_STATUS_COLORS[String(value)] ?? "#6b7280"}1A`, color: HEADER_STATUS_COLORS[String(value)] ?? "#6b7280" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: HEADER_STATUS_COLORS[String(value)] ?? "#6b7280" }} />
          {String(value)}
        </span>
      ) : (
        <span className={cn("inline-flex items-center gap-1 font-semibold", bool ? "text-emerald-600" : "text-gray-400")}>
          {bool ? <CheckCircle className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />}
          {String(value ?? (bool ? "Yes" : "No"))}
        </span>
      )}
    </div>
  );
}

function ValueRow({ label, value }: { label: string; value?: unknown }) {
  const text = value === undefined || value === null || value === "" ? "—" : String(value);
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-gray-500">{label}</span>
      <span className="max-w-[60%] truncate font-semibold text-gray-800">{text}</span>
    </div>
  );
}

export function WebsiteSecurityAudit({ data }: WebsiteSecurityAuditProps) {
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [showHeaders, setShowHeaders] = useState(true);

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-400">
        <Shield className="h-4 w-4" />
        No website security audit available yet.
      </div>
    );
  }

  const overallScore = toInt(data.overallScore);
  const grade = asString(data.grade) ?? "—";
  const auditTime = toNumber(data.auditTime);

  const ssl = asRecord(data.ssl);
  const headers = asRecord(data.headers);
  const cookies = asRecord(data.cookies);
  const server = asRecord(data.server);
  const forms = asRecord(data.forms);
  const content = asRecord(data.content);
  const authentication = asRecord(data.authentication);
  const domain = asRecord(data.domain);

  const dnssecStatus =
    domain.dnssecEnabled === undefined || domain.dnssecEnabled === null
      ? "Unavailable"
      : domain.dnssecEnabled
        ? "Enabled"
        : "Disabled";
  const dnssecColor =
    dnssecStatus === "Enabled" ? "#10b981" : dnssecStatus === "Disabled" ? "#ef4444" : "#6b7280";

  const recommendations = asArray(data.recommendations)
    .map((item) => asRecord(item))
    .filter((item) => asString(item.title));

  const headerItems = asArray(headers.headers)
    .map((item) => asRecord(item))
    .filter((item) => asString(item.name));

  const overallColor = overallScore >= 80 ? "#10b981" : overallScore >= 60 ? "#3b82f6" : overallScore >= 40 ? "#f59e0b" : overallScore >= 20 ? "#ef4444" : "#7f1d1d";
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
            <span className="rounded-lg px-2.5 py-1 font-mono text-lg font-bold" style={{ backgroundColor: `${gradeColor}1A`, color: gradeColor }}>
              {grade}
            </span>
            <StatusPill status={overallScore >= 80 ? "Excellent" : overallScore >= 60 ? "Good" : overallScore >= 40 ? "Average" : overallScore >= 20 ? "Poor" : "Critical"} />
          </div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Security Score</div>
          {auditTime !== null && (
            <div className="mt-2 text-[11px] text-gray-400">
              Audited in {auditTime >= 1000 ? `${(auditTime / 1000).toFixed(1)}s` : `${Math.round(auditTime)}ms`}
            </div>
          )}
        </div>

        {/* SSL + transport summary */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
                <Lock className="h-4 w-4 text-blue-500" />
                SSL &amp; Transport
              </span>
              {typeof ssl.score === "number" && <span className="text-xs font-semibold text-gray-400">Score: {Math.round(ssl.score)}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Certificate</div>
                <div className="mt-1.5 text-sm font-bold text-gray-800">{ssl.valid ? "Valid" : "Invalid"}</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Expiry</div>
                <div className="mt-1.5 text-sm font-bold text-gray-800">{ssl.daysRemaining !== null ? `${ssl.daysRemaining} days` : "—"}</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Version</div>
                <div className="mt-1.5 truncate text-sm font-bold text-gray-800">{asString(ssl.version) ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Issuer</div>
                <div className="mt-1.5 truncate text-sm font-bold text-gray-800">{asString(ssl.issuer) ?? "—"}</div>
              </div>
            </div>
          </div>

          {/* Security Headers */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setShowHeaders((value) => !value)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
                <ShieldCheck className="h-4 w-4 text-blue-500" />
                Security Headers
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600">{toInt(headers.total) || 0}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400">
                  <span className="text-emerald-600">{toInt(headers.present)}</span> present ·{" "}
                  <span className="text-amber-600">{toInt(headers.weak)}</span> weak ·{" "}
                  <span className="text-red-600">{toInt(headers.missing)}</span> missing
                </span>
                {showHeaders ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </span>
            </button>
            {showHeaders && (
              <div className="grid grid-cols-1 gap-2 border-t border-gray-200 px-4 py-3 sm:grid-cols-2">
                {headerItems.length > 0 ? (
                  headerItems.map((item, index) => (
                    <div key={`hdr-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold text-gray-700">{asString(item.name)}</span>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          backgroundColor: `${HEADER_STATUS_COLORS[asString(item.status) ?? ""] ?? "#6b7280"}1A`,
                          color: HEADER_STATUS_COLORS[asString(item.status) ?? ""] ?? "#6b7280",
                        }}
                      >
                        {asString(item.status) ?? "—"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-[13px] text-gray-400 sm:col-span-2">No security header data.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <CategoryScoreCard title="SSL Certificate" score={toNumber(ssl.score)} icon={<Lock className="h-4 w-4" />}>
          <CheckRow label="HTTPS enabled" value={ssl.enabled} />
          <CheckRow label="Certificate valid" value={ssl.valid} />
          <ValueRow label="Expiry" value={ssl.expiry} />
          <ValueRow label="Issuer" value={ssl.issuer} />
          <ValueRow label="Days remaining" value={ssl.daysRemaining} />
          <CheckRow label="Expired" value={ssl.expired} positive={!ssl.expired} />
          <CheckRow label="Self-signed" value={ssl.selfSigned} positive={!ssl.selfSigned} />
          <CheckRow label="Weak (TLS <1.2)" value={ssl.weak} positive={!ssl.weak} />
          <CheckRow label="HTTP → HTTPS redirect" value={ssl.httpRedirect} />
          <CheckRow label="No mixed content" value={ssl.mixedContent} positive={!ssl.mixedContent} />
          <CheckRow label="Secure connection" value={ssl.secureConnection} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Cookies" score={toNumber(cookies.score)} icon={<Cookie className="h-4 w-4" />}>
          <ValueRow label="Total cookies" value={cookies.totalCookies} />
          <ValueRow label="Secure" value={cookies.secureCookies} />
          <ValueRow label="HttpOnly" value={cookies.httpOnlyCookies} />
          <ValueRow label="SameSite" value={cookies.sameSiteCookies} />
          <ValueRow label="Session" value={cookies.sessionCookies} />
          <ValueRow label="Insecure" value={cookies.insecureCookies} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Server" score={toNumber(server.score)} icon={<Server className="h-4 w-4" />}>
          <ValueRow label="Server header" value={server.server} />
          <CheckRow label="Server header hidden" value={server.serverHeaderExposed} positive={!server.serverHeaderExposed} />
          <ValueRow label="X-Powered-By" value={server.xPoweredBy} />
          <CheckRow label="X-Powered-By hidden" value={server.xPoweredByExposed} positive={!server.xPoweredByExposed} />
          <CheckRow label="PHP version hidden" value={server.phpVersionExposed} positive={!server.phpVersionExposed} />
          <CheckRow label="ASP.NET version hidden" value={server.aspNetVersionExposed} positive={!server.aspNetVersionExposed} />
          <CheckRow label="Apache version hidden" value={server.apacheVersionExposed} positive={!server.apacheVersionExposed} />
          <CheckRow label="Nginx version hidden" value={server.nginxVersionExposed} positive={!server.nginxVersionExposed} />
          <CheckRow label="No info leakage" value={server.informationLeakage} positive={!server.informationLeakage} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Forms" score={toNumber(forms.score)} icon={<ScrollText className="h-4 w-4" />}>
          <ValueRow label="Total forms" value={forms.totalForms} />
          <ValueRow label="With CSRF token" value={forms.formsWithCsrf} />
          <CheckRow label="CSRF protected" value={forms.csrfProtected} />
          <ValueRow label="Password fields" value={forms.passwordFields} />
          <ValueRow label="Sensitive autocomplete" value={forms.autocompleteSensitive} />
          <CheckRow label="HTTPS submit" value={forms.httpsSubmit} />
          <CheckRow label="Captcha protected" value={forms.captchaProtected} />
          <CheckRow label="reCAPTCHA" value={forms.recaptcha} />
          <CheckRow label="Cloudflare Turnstile" value={forms.turnstile} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Content Security" score={toNumber(content.score)} icon={<Globe className="h-4 w-4" />}>
          <CheckRow label="No mixed content" value={content.mixedContent} positive={!content.mixedContent} />
          <ValueRow label="Unsafe resources" value={content.unsafeResources} />
          <ValueRow label="External scripts" value={content.externalScripts} />
          <ValueRow label="Unsafe iframes" value={content.unsafeIframes} />
          <ValueRow label="Total iframes" value={content.totalIframes} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Authentication" score={toNumber(authentication.score)} icon={<KeyRound className="h-4 w-4" />}>
          <CheckRow label="Login page" value={authentication.loginPage} />
          <CheckRow label="Password reset" value={authentication.passwordReset} />
          <CheckRow label="Registration" value={authentication.registration} />
          <CheckRow label="Protected admin pages" value={authentication.protectedAdminPages} />
        </CategoryScoreCard>

        <CategoryScoreCard title="Domain Security" score={toNumber(domain.score)} icon={<Globe className="h-4 w-4" />}>
          <ValueRow label="Domain" value={domain.domain} />
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-gray-500">DNSSEC</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: `${dnssecColor}1A`, color: dnssecColor }}
            >
              {dnssecStatus}
            </span>
          </div>
          <CheckRow label="WHOIS available" value={domain.whoisAvailable} />
          <ValueRow label="Registrar" value={domain.registrar} />
          <ValueRow label="Creation date" value={domain.creationDate} />
          <ValueRow label="Expiry date" value={domain.expiryDate} />
          <ValueRow label="Days to expiry" value={domain.daysToExpiry} />
          <CheckRow label="Not expired" value={domain.expired} positive={!domain.expired} />
          <ValueRow label="Nameservers" value={Array.isArray(domain.nameServers) ? domain.nameServers.length : 0} />
        </CategoryScoreCard>
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
                  <li key={`sec-rec-${index}`} className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
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
