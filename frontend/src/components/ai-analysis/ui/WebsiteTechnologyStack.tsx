"use client";

import { useState } from "react";
import { Boxes, ChevronDown, ChevronUp, CircleDot } from "lucide-react";
import { cn } from "@/src/lib/utils";

export interface WebsiteTechnology {
  name: string | null;
  category: string;
  confidence: number | null;
  version: string | null;
  detectedFrom: string | null;
  logo: string | null;
}

interface WebsiteTechnologyStackProps {
  data?: Record<string, unknown> | null;
}

const CATEGORY_ORDER = [
  "CMS",
  "E-Commerce",
  "Frontend Framework",
  "Backend Framework",
  "Programming Language",
  "JavaScript Library",
  "UI Library",
  "Build Tool",
  "Database",
  "Server",
  "Hosting",
  "Deployment Platform",
  "Cloud Provider",
  "CDN",
  "Fonts",
  "Analytics",
  "Marketing Tools",
  "Chat Widget",
  "Payment Gateway",
  "Security",
  "SEO Tools",
  "PWA",
  "Other",
];

function isPresent(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function toNumber(value: unknown): number | null {
  if (!isPresent(value)) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : null;
}

const INVALID_CDN_SLUGS = new Set([
  "csp",
  "securityheaders",
  "hsts",
  "subresourceintegrity",
  "schema",
  "lazyload",
  "opengraph",
  "cookieconsent",
  "slick",
  "gravity",
]);

function isValidLogoUrl(url: unknown): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("simpleicons.org")) {
      const slug = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
      if (slug && INVALID_CDN_SLUGS.has(slug)) {
        return null;
      }
    }
    return url;
  } catch {
    return null;
  }
}

function normalizeTechnologies(data: Record<string, unknown> | null | undefined): WebsiteTechnology[] {
  if (!data) return [];
  const raw: unknown = Array.isArray(data.websiteTechnologies)
    ? data.websiteTechnologies
    : Array.isArray(data.technologies)
      ? data.technologies
      : [];

  return (raw as WebsiteTechnology[])
    .map((item) => ({
      name: isPresent(item?.name) ? String(item.name) : null,
      category: isPresent(item?.category) ? String(item.category) : "Other",
      confidence: toNumber(item?.confidence ?? (item as unknown as Record<string, unknown>)?.confidence_score),
      version: isPresent(item?.version) ? String(item.version) : null,
      detectedFrom: isPresent(item?.detectedFrom) ? String(item.detectedFrom) : null,
      logo: isPresent(item?.logo) ? isValidLogoUrl(item.logo) : null,
    }))
    .filter((item) => Boolean(item.name)) as WebsiteTechnology[];
}

function CategoryBadge({ label, count }: { label: string; count: number }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
      {label} <span className="text-gray-300">·</span> {count}
    </span>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const tone =
    value >= 80
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : value >= 60
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", tone)}>
      {value}%
    </span>
  );
}

function TechnologyLogo({ name, logo }: { name: string; logo?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-5 w-5 shrink-0 rounded-sm object-contain"
      />
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-[11px] font-bold text-blue-600">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function WebsiteTechnologyStack({ data }: WebsiteTechnologyStackProps) {
  const [showDetails, setShowDetails] = useState(false);
  const technologies = normalizeTechnologies(data);

  if (technologies.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-400">
        <Boxes className="h-4 w-4" />
        No detailed technology stack detected.
      </div>
    );
  }

  const grouped = new Map<string, WebsiteTechnology[]>();
  for (const tech of technologies) {
    const category = tech.category ?? "Other";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)?.push(tech);
  }

  const categories = Array.from(grouped.keys()).sort(
    (a, b) =>
      (CATEGORY_ORDER.indexOf(a) === -1 ? CATEGORY_ORDER.length : CATEGORY_ORDER.indexOf(a)) -
      (CATEGORY_ORDER.indexOf(b) === -1 ? CATEGORY_ORDER.length : CATEGORY_ORDER.indexOf(b))
  );

  const insights = (data?.insights as Record<string, unknown> | null | undefined) ?? {};
  const observations = Array.isArray(insights.observations) ? (insights.observations as string[]) : [];
  const recommendations = Array.isArray(insights.recommendations) ? (insights.recommendations as string[]) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {categories.map((category) => {
          const items = (grouped.get(category) ?? []).sort(
            (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
          );
          return (
            <div key={category} className="rounded-xl border border-gray-200 bg-white p-3">
              <CategoryBadge label={category} count={items.length} />
              <ul className="mt-2 space-y-2">
                {items.map((tech) => (
                  <li key={tech.name} className="flex items-center gap-2.5" title={tech.detectedFrom ?? undefined}>
                    <TechnologyLogo name={tech.name ?? "?"} logo={tech.logo} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                      {tech.name}
                      {isPresent(tech.version) && (
                        <span className="ml-1.5 text-[11px] font-normal text-gray-400">v{tech.version}</span>
                      )}
                    </span>
                    {tech.confidence !== null && <ConfidenceBadge value={tech.confidence} />}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {(observations.length > 0 || recommendations.length > 0) && (
        <div className="rounded-xl border border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left"
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
              <CircleDot className="h-4 w-4 text-blue-500" />
              Stack Insights
              <span className="text-[11px] font-normal text-gray-400">
                {observations.length + recommendations.length} findings
              </span>
            </span>
            {showDetails ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
          {showDetails && (
            <div className="space-y-3 border-t border-gray-200 px-4 py-3">
              {observations.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">Observations</div>
                  <ul className="space-y-1.5">
                    {observations.map((item, index) => (
                      <li key={`obs-${index}`} className="flex gap-2 text-[13px] leading-5 text-gray-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recommendations.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">Recommendations</div>
                  <ul className="space-y-1.5">
                    {recommendations.map((item, index) => (
                      <li key={`rec-${index}`} className="flex gap-2 text-[13px] leading-5 text-gray-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
