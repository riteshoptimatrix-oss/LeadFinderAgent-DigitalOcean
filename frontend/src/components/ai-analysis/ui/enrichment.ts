export interface Enrichment {
  business_name?: string | null;
  name?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  area?: string | null;
  address?: string | null;
  primary_email?: string | null;
  all_emails?: string[];
  primary_phone?: string | null;
  phones?: string[];
  website?: string | null;
  website_status?: string | null;
  website_information?: Record<string, unknown> | null;
  contact_discovery?: Record<string, unknown> | null;
  technology_detection?: Record<string, unknown> | null;
  ai_analysis?: Record<string, unknown> | null;
  business?: Record<string, unknown> | null;
  lead_intelligence?: Record<string, unknown> | null;
  sales_opportunity?: Record<string, unknown> | null;
}

const PLACEHOLDER = new Set(["null", "undefined", "n/a", "-", "--", "none", "unknown"]);

function clean(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s || PLACEHOLDER.has(s.toLowerCase())) return null;
  return s;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    const c = clean(v);
    if (c) return c;
  }
  return null;
}

function firstItem(value: unknown): unknown {
  return Array.isArray(value) && value.length > 0 ? value[0] : value;
}

export function getBusinessName(e: Enrichment | null): string | null {
  return firstString(e?.business_name, e?.name);
}

export function getIndustry(e: Enrichment | null): string | null {
  return firstString(e?.category);
}

export function getLocation(e: Enrichment | null): string | null {
  if (!e) return null;
  const parts = [clean(e.country), clean(e.state), clean(e.city), clean(e.area)];
  const joined = parts.filter(Boolean).join(" · ");
  return joined || firstString(e.address) || null;
}

export function getTechnologySummary(e: Enrichment | null): string | null {
  const t = e?.technology_detection;
  if (!t) return null;
  const stack = [
    t.cms,
    t.frontend_framework,
    t.backend_framework,
    t.javascript_framework,
    t.hosting,
    t.server_stack,
  ]
    .map((v) => clean(v))
    .filter(Boolean) as string[];
  return stack.slice(0, 3).join(" · ") || null;
}

export function getDomain(e: Enrichment | null): string | null {
  return firstString(e?.website_information?.domain, e?.website_information?.final_url);
}

export function getSslState(e: Enrichment | null): boolean | null | undefined {
  const ssl = e?.website_information?.ssl ?? e?.ai_analysis?.ssl;
  if (ssl === undefined || ssl === null) return null;
  return Boolean(ssl);
}

export function getHttpStatus(e: Enrichment | null): number | null {
  const status = e?.website_information?.http_status ?? e?.ai_analysis?.http_status;
  return typeof status === "number" ? status : null;
}

export function getHosting(e: Enrichment | null): string | null {
  return firstString(e?.technology_detection?.hosting);
}

export function getPrimaryEmail(e: Enrichment | null): string | null {
  return firstString(
    e?.contact_discovery?.primary_email,
    e?.primary_email,
    firstItem(e?.contact_discovery?.all_emails),
    firstItem(e?.all_emails)
  );
}

export function getPrimaryPhone(e: Enrichment | null): string | null {
  return firstString(
    e?.contact_discovery?.primary_phone,
    e?.primary_phone,
    firstItem(e?.phones),
    firstItem(e?.contact_discovery?.secondary_phones)
  );
}

export function getAddress(e: Enrichment | null): string | null {
  return firstString(e?.contact_discovery?.office_address, e?.address) || getLocation(e);
}

export function getRecommendations(e: Enrichment | null): string[] {
  const recs = e?.ai_analysis?.recommendations;
  if (Array.isArray(recs)) {
    return recs
      .map((r) => (typeof r === "string" ? r : r?.text ?? r?.recommendation ?? null))
      .filter((r): r is string => Boolean(r));
  }
  return [];
}

export function getLeadPriority(e: Enrichment | null): string | null {
  return firstString(e?.business?.lead_priority);
}

export function getBusinessOpportunityLabel(e: Enrichment | null): string | null {
  return firstString(e?.business?.business_opportunity);
}

export function getLeadQualityLabel(e: Enrichment | null): string | null {
  return firstString(e?.lead_intelligence?.lead_quality);
}

export function getTechnologyScore(e: Enrichment | null): number {
  const t = e?.technology_detection;
  if (!t) return 0;
  const fields = [
    t.cms,
    t.frontend_framework,
    t.backend_framework,
    t.hosting,
    t.cdn,
    t.analytics,
    t.payment_gateway,
    t.server_stack,
  ];
  const detected = fields.filter((v) => clean(v)).length;
  return detected > 0 ? Math.round((detected / fields.length) * 100) : 0;
}
