"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileText,
  Focus,
  Globe,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MessageSquare,
  MousePointerClick,
  Paintbrush,
  Palette,
  PanelTop,
  PenTool,
  Percent,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Type,
  Wrench,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  Excellent: "#10b981",
  Good: "#3b82f6",
  Average: "#f59e0b",
  Poor: "#ef4444",
  Critical: "#b91c1c",
};

interface WebsiteUIUXIntelligenceProps {
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

function scoreColor(score: number): string {
  return score >= 80 ? "#10b981" : score >= 60 ? "#3b82f6" : score >= 40 ? "#f59e0b" : score >= 20 ? "#ef4444" : "#b91c1c";
}

function statusFromScore(score: number): string {
  return score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Average" : score >= 20 ? "Poor" : "Critical";
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

function ModuleCard({
  name,
  module,
  icon,
}: {
  name: string;
  module: Record<string, unknown>;
  icon?: React.ReactNode;
}) {
  const score = toInt(module.score);
  const color = scoreColor(score);
  const status = asString(module.status) ?? statusFromScore(score);
  const issueCount = toInt(module.issueCount);
  const recommendationCount = toInt(module.recommendationCount);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-gray-600">
          {icon && <span className="shrink-0 text-blue-500">{icon}</span>}
          <span className="truncate">{name}</span>
        </span>
        <span className="shrink-0 font-mono text-base font-bold" style={{ color }}>
          {score}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: color }} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <StatusPill status={status} />
        <span className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-gray-400">
          {issueCount > 0 && <span className="text-red-500">{issueCount} issues</span>}
          {recommendationCount > 0 && <span className="text-amber-500">{recommendationCount} recs</span>}
        </span>
      </div>
    </div>
  );
}

export function WebsiteUIUXIntelligence({ data }: WebsiteUIUXIntelligenceProps) {
  const [showModules, setShowModules] = useState(true);
  const [showIssues, setShowIssues] = useState(true);
  const [showRecommendations, setShowRecommendations] = useState(true);

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-400">
        <Paintbrush className="h-4 w-4" />
        No website UI/UX intelligence audit available yet.
      </div>
    );
  }

  const overallScore = toInt(data.overallScore);
  const grade = asString(data.grade) ?? "—";
  const overallStatus = asString(data.overallStatus) ?? statusFromScore(overallScore);
  const auditTime = toNumber(data.auditTime);

  const modules: Array<{ key: string; name: string; icon: React.ReactNode }> = [
    { key: "visualDesign", name: "Visual Design", icon: <Paintbrush className="h-3.5 w-3.5" /> },
    { key: "colors", name: "Colors", icon: <Palette className="h-3.5 w-3.5" /> },
    { key: "typography", name: "Typography", icon: <Type className="h-3.5 w-3.5" /> },
    { key: "layout", name: "Layout", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
    { key: "navigation", name: "Navigation", icon: <PanelTop className="h-3.5 w-3.5" /> },
    { key: "cta", name: "Call-to-Action", icon: <MousePointerClick className="h-3.5 w-3.5" /> },
    { key: "responsive", name: "Responsive", icon: <Percent className="h-3.5 w-3.5" /> },
    { key: "mobile", name: "Mobile", icon: <Smartphone className="h-3.5 w-3.5" /> },
    { key: "forms", name: "Forms", icon: <Wrench className="h-3.5 w-3.5" /> },
    { key: "ux", name: "UX", icon: <Focus className="h-3.5 w-3.5" /> },
    { key: "content", name: "Content", icon: <FileText className="h-3.5 w-3.5" /> },
    { key: "images", name: "Images", icon: <ImageIcon className="h-3.5 w-3.5" /> },
    { key: "icons", name: "Icons", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { key: "branding", name: "Branding", icon: <PenTool className="h-3.5 w-3.5" /> },
    { key: "accessibility", name: "Accessibility", icon: <Heart className="h-3.5 w-3.5" /> },
    { key: "modernDesign", name: "Modern Design", icon: <Cpu className="h-3.5 w-3.5" /> },
    { key: "trust", name: "Trust", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  ];

  const issues = asArray(data.issues)
    .map((item) => asRecord(item))
    .filter((item) => asString(item.title));

  const recommendations = asArray(data.recommendations)
    .map((item) => asRecord(item))
    .filter((item) => asString(item.title));

  const redesign = asRecord(data.redesignOpportunity);
  const salesOpp = asRecord(data.salesOpportunity);

  const overallColor = scoreColor(overallScore);
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
            <StatusPill status={overallStatus} />
          </div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-gray-500">UI/UX Intelligence Score</div>
          {auditTime !== null && (
            <div className="mt-2 text-[11px] text-gray-400">
              Audited in {auditTime >= 1000 ? `${(auditTime / 1000).toFixed(1)}s` : `${Math.round(auditTime)}ms`}
            </div>
          )}
        </div>

        {/* Redesign + sales opportunity summary */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
                  <Target className="h-4 w-4 text-blue-500" />
                  Redesign Opportunity
                </span>
                {toNumber(redesign.score) !== null && (
                  <span className="font-mono text-base font-bold" style={{ color: scoreColor(toInt(redesign.score)) }}>
                    {toInt(redesign.score)}
                  </span>
                )}
              </div>
              {asString(redesign.opportunityLevel) && (
                <StatusPill status={asString(redesign.opportunityLevel) === "High" ? "Critical" : asString(redesign.opportunityLevel) === "Medium" ? "Average" : "Good"} />
              )}
              {asString(redesign.rationale) && <p className="mt-2 text-[13px] leading-5 text-gray-600">{asString(redesign.rationale)}</p>}
              {asString(redesign.payoff) && <p className="mt-2 text-[13px] font-medium text-emerald-600">{asString(redesign.payoff)}</p>}
              {asArray(redesign.suggestedChanges).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {asArray(redesign.suggestedChanges).map((item, index) => (
                    <li key={`rd-${index}`} className="flex items-start gap-2 text-[13px] text-gray-600">
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span>{asString(item)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
                  <Globe className="h-4 w-4 text-blue-500" />
                  Sales Opportunity
                </span>
                {toNumber(salesOpp.score) !== null && (
                  <span className="font-mono text-base font-bold" style={{ color: scoreColor(toInt(salesOpp.score)) }}>
                    {toInt(salesOpp.score)}
                  </span>
                )}
              </div>
              {asString(salesOpp.opportunityLevel) && (
                <StatusPill status={asString(salesOpp.opportunityLevel) === "High" ? "Critical" : asString(salesOpp.opportunityLevel) === "Medium" ? "Average" : "Good"} />
              )}
              {asString(salesOpp.pitchSummary) && <p className="mt-2 text-[13px] leading-5 text-gray-600">{asString(salesOpp.pitchSummary)}</p>}
              {asArray(salesOpp.sellingPoints).length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Selling points</div>
                  <ul className="mt-1 space-y-1">
                    {asArray(salesOpp.sellingPoints).map((item, index) => (
                      <li key={`sp-${index}`} className="flex items-start gap-2 text-[13px] text-gray-600">
                        <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span>{asString(item)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {asArray(salesOpp.painPoints).length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Pain points</div>
                  <ul className="mt-1 space-y-1">
                    {asArray(salesOpp.painPoints).map((item, index) => (
                      <li key={`pp-${index}`} className="flex items-start gap-2 text-[13px] text-gray-600">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span>{asString(item)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {asArray(salesOpp.suggestedServices).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {asArray(salesOpp.suggestedServices).map((item, index) => (
                    <span key={`sv-${index}`} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                      {asString(item)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Module breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowModules((value) => !value)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-gray-600">
            <LayoutGrid className="h-4 w-4 text-blue-500" />
            Intelligence Modules
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600">{modules.length}</span>
          </span>
          {showModules ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
        {showModules && (
          <div className="grid grid-cols-1 gap-3 border-t border-gray-200 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map(({ key, name, icon }) => (
              <ModuleCard key={key} name={name} module={asRecord(data[key])} icon={icon} />
            ))}
          </div>
        )}
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
              Visual Issues
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">{issues.length}</span>
            </span>
            {showIssues ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
          {showIssues && (
            <ul className="space-y-2 border-t border-gray-200 px-4 py-3">
              {issues.map((item, index) => {
                const severity = asString(item.severity) ?? "Info";
                const severityColor = severity === "Error" ? "#ef4444" : severity === "Warning" ? "#f59e0b" : "#3b82f6";
                return (
                  <li key={`ui-issue-${index}`} className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: severityColor }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{asString(item.title)}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: `${severityColor}1A`, color: severityColor }}
                        >
                          {severity}
                        </span>
                        {asString(item.category) && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{asString(item.category)}</span>
                        )}
                      </div>
                      {asString(item.description) && <p className="mt-1 text-[13px] leading-5 text-gray-600">{asString(item.description)}</p>}
                      {asString(item.affectedUrl) && (
                        <div className="mt-1 truncate font-mono text-[11px] text-gray-400">{asString(item.affectedUrl)}</div>
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
              <List className="h-4 w-4 text-amber-500" />
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
                  <li key={`ui-rec-${index}`} className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
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
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{asString(item.category)}</span>
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
