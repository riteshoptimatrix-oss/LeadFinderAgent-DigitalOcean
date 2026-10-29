"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import Link from "next/link";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Code,
  Copy,
  ExternalLink,
  Gauge,
  Globe,
  Lightbulb,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  Navigation,
  Phone,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  User,
  Wifi,
  Palette,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { WebsiteTechnologyStack } from "@/src/components/ai-analysis/ui/WebsiteTechnologyStack";
import { WebsitePerformanceAudit } from "@/src/components/ai-analysis/ui/WebsitePerformanceAudit";
import { WebsiteSecurityAudit } from "@/src/components/ai-analysis/ui/WebsiteSecurityAudit";
import { SEOIntelligenceAudit } from "@/src/components/ai-analysis/ui/SEOIntelligenceAudit";
import { WebsiteUIUXIntelligence } from "@/src/components/ai-analysis/ui/WebsiteUIUXIntelligence";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

const PIPELINE_STAGES = [
  "New Lead",
  "Website Analyzed",
  "Needs Review",
  "Contact Ready",
  "Email Sent",
  "WhatsApp Sent",
  "Follow-up Scheduled",
  "Meeting Scheduled",
  "Proposal Sent",
  "Negotiation",
  "Won",
  "Lost",
  "On Hold",
  "Archived",
];

type AnyRecord = Record<string, unknown>;

const isPresent = (value: unknown) => value !== undefined && value !== null && value !== "";
const asArray = (value: unknown) => Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
const unique = (items: unknown[]) => Array.from(new Set(items.filter(Boolean).map(String)));

const normalizePhone = (phone: unknown) => {
  if (!phone) return undefined;
  const s = String(phone).trim();
  if (["null", "undefined", "n/a", "-", "unknown", "none"].includes(s.toLowerCase())) return undefined;
  const stripped = s.replace(/[^\d]/g, "");
  if (stripped.length >= 10) {
    return stripped.slice(-10) || undefined;
  }
  return stripped || undefined;
};

const normalizeEmail = (email: unknown) => {
  if (!email) return undefined;
  const s = String(email).trim().toLowerCase();
  if (["null", "undefined", "n/a", "-", "unknown", "none"].includes(s) || !s) return undefined;
  return s;
};

const uniquePhones = (items: unknown[]) => {
  const seen = new Set<string>();
  const uniqueItems: string[] = [];
  for (const item of items) {
    if (!item) continue;
    const norm = normalizePhone(item);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      uniqueItems.push(String(item).trim());
    }
  }
  return uniqueItems;
};

const uniqueEmails = (items: unknown[]) => {
  const seen = new Set<string>();
  const uniqueItems: string[] = [];
  for (const item of items) {
    if (!item) continue;
    const norm = normalizeEmail(item);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      uniqueItems.push(norm);
    }
  }
  return uniqueItems;
};

const display = (value: unknown, fallback = "Not Available") => isPresent(value) ? String(value) : fallback;
const asOptionalString = (value: unknown) => isPresent(value) ? String(value) : undefined;
const numericScore = (value: unknown) => {
  if (!isPresent(value)) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.min(100, Math.round(numberValue))) : undefined;
};
const boolText = (value: unknown) => value === true ? "Yes" : value === false ? "No" : "Not Available";

type Recommendation = {
  category?: string;
  priority?: string;
  title?: string;
  recommendation?: string;
  impact?: string;
  difficulty?: string;
  estimated_benefit?: string;
  status?: string;
  reference_url?: string;
};

const toRecommendation = (item: unknown): Recommendation | null => {
  if (!item) return null;
  if (typeof item === "string") return { recommendation: item };
  if (typeof item === "object") {
    const r = item as AnyRecord;
    const recommendation = asOptionalString(r.recommendation ?? r.description ?? r.action ?? r.issue);
    const title = asOptionalString(r.title ?? r.name ?? r.service_name);
    const category = asOptionalString(r.category);
    if (!recommendation && !title && !category) {
      const fallback = asOptionalString(r.summary ?? r.text ?? r.suggestion);
      return fallback ? { recommendation: fallback } : null;
    }
    return {
      category,
      priority: asOptionalString(r.priority),
      title,
      recommendation,
      impact: asOptionalString(r.impact),
      difficulty: asOptionalString(r.difficulty ?? r.effort),
      estimated_benefit: asOptionalString(r.estimated_benefit),
      status: asOptionalString(r.status),
      reference_url: asOptionalString(r.reference_url),
    };
  }
  return { recommendation: String(item) };
};

const priorityBadgeClass = (priority?: string) => {
  const p = String(priority || "").toLowerCase();
  if (p === "critical" || p === "high") return "border-red-200 bg-red-50 text-red-700";
  if (p === "medium" || p === "normal") return "border-amber-200 bg-amber-50 text-amber-700";
  if (p === "low") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

function Skeleton() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 space-y-6 lg:col-span-8">
            <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
            <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
          </div>
          <div className="col-span-12 space-y-6 lg:col-span-4">
            <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between border-b border-slate-100 bg-white px-4 py-4 text-left transition hover:bg-blue-50/40"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-600">{icon}</span>
          <span className="truncate text-sm font-bold uppercase tracking-wider text-slate-700">{title}</span>
        </span>
        {isOpen ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function CircularScore({ value, label, colorClass }: { value?: number; label: string; colorClass: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const displayValue = typeof value === "number" ? value : "N/A";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
        <svg className="h-full w-full -rotate-90">
          <circle cx="48" cy="48" r={radius} className="stroke-slate-200" strokeWidth="8" fill="transparent" />
          <circle cx="48" cy="48" r={radius} className={`stroke-current ${colorClass} transition-all duration-700`} strokeWidth="8" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
        </svg>
        <span className="absolute font-mono text-xl font-bold text-slate-900">{displayValue}</span>
      </div>
      <div className="mt-3 flex min-h-9 items-center justify-center text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function InfoRow({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  const content = href ? (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-blue-600 hover:text-blue-700">
      <span className="truncate">{value}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  ) : value;

  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="min-w-0 max-w-[65%] text-right text-sm font-semibold text-slate-700">{content}</span>
    </div>
  );
}

function RecommendationList({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-slate-600">{icon}{title}</h4>
      {items.length > 0 ? items.slice(0, 6).map((item, index) => (
        <div key={`${title}-${index}`} className="flex gap-3 rounded-lg border border-amber-100 bg-amber-50/70 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span className="text-sm leading-6 text-slate-700">{item}</span>
        </div>
      )) : <p className="text-sm italic text-slate-400">No stored recommendations yet.</p>}
    </div>
  );
}

function StructuredRecommendationList({ title, items, icon }: { title: string; items: Recommendation[]; icon: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-slate-600">{icon}{title}</h4>
      {items.length > 0 ? items.slice(0, 12).map((rec, index) => (
        <div key={`structured-${index}`} className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {rec.category && (
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-blue-700">{rec.category}</span>
            )}
            {rec.priority && (
              <span className={`rounded border px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${priorityBadgeClass(rec.priority)}`}>{rec.priority}</span>
            )}
            {rec.impact && (
              <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">Impact: {rec.impact}</span>
            )}
            {rec.difficulty && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Effort: {rec.difficulty}</span>
            )}
          </div>
          {rec.title && <div className="text-sm font-bold text-slate-900">{rec.title}</div>}
          {rec.recommendation && (
            <div className="flex gap-3">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span className="text-sm leading-6 text-slate-700">{rec.recommendation}</span>
            </div>
          )}
          {rec.estimated_benefit && (
            <div className="text-xs font-semibold text-emerald-700">Est. benefit: {rec.estimated_benefit}</div>
          )}
          {rec.reference_url && (
            <a href={String(rec.reference_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              Reference <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )) : <p className="text-sm italic text-slate-400">No structured recommendations yet.</p>}
    </div>
  );
}

function SocialLink({ label, url }: { label: string; url?: string }) {
  if (!url) {
    return <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">{label}</span>;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600">
      {label}<ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function TikTokPresence({ presence }: { presence: AnyRecord }) {
  const found = presence.found === true;
  const url = asOptionalString(presence.url);
  const username = asOptionalString(presence.username);
  const sourcePage = asOptionalString(presence.source_page);

  if (!found || !url) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <span className="rounded-lg bg-slate-200 p-2 text-slate-500"><Music2 className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-700">TikTok Profile</div>
          <div className="text-xs text-slate-500">Not found on website</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-emerald-100 p-2 text-emerald-700"><Music2 className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            {username ? `@${username}` : "TikTok Profile"}
            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
          </div>
          <a href={url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-emerald-700 hover:text-emerald-600">
            <span className="truncate">{url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
      </div>
      {sourcePage && <div className="mt-3 border-t border-emerald-100 pt-2 text-xs text-slate-500">Found on: <span className="truncate">{sourcePage}</span></div>}
    </div>
  );
}

const METRIC_DEFINITIONS: { group: string; items: { name: string; fullName: string; description: string }[] }[] = [
  {
    group: "PageSpeed Metrics",
    items: [
      { name: "LCP", fullName: "Largest Contentful Paint", description: "Measures how long it takes for the largest visible content element on the page to load. It indicates the page's loading performance." },
      { name: "FCP", fullName: "First Contentful Paint", description: "Measures the time it takes for the first piece of content (text, image, etc.) to appear on the screen." },
      { name: "INP", fullName: "Interaction to Next Paint", description: "Measures how quickly the website responds to user interactions, such as clicks or taps." },
      { name: "CLS", fullName: "Cumulative Layout Shift", description: "Measures the visual stability of a webpage by tracking unexpected layout shifts during loading." },
      { name: "TTFB", fullName: "Time to First Byte", description: "Measures the time it takes for the browser to receive the first byte of data from the server after making a request." },
      { name: "TBT", fullName: "Total Blocking Time", description: "Measures the total amount of time the main thread is blocked, preventing user interactions during page load." },
      { name: "Speed Index", fullName: "Speed Index", description: "Measures how quickly the visible content of a page is displayed during loading." },
      { name: "TTI", fullName: "Time to Interactive", description: "Measures how long it takes for the page to become fully interactive and responsive to user input." },
    ],
  },
  {
    group: "Website Speed Metrics",
    items: [
      { name: "Load Time", fullName: "Load Time", description: "The total time required for the webpage to load." },
      { name: "DOM Ready", fullName: "DOM Ready", description: "The time taken for the HTML document to be fully parsed and ready for interaction." },
      { name: "Fully Loaded", fullName: "Fully Loaded", description: "The time when all page resources, including images and scripts, have finished loading." },
      { name: "Initial Response", fullName: "Initial Response", description: "The time taken by the server to start responding to the browser's request." },
      { name: "Network Idle", fullName: "Network Idle", description: "The point at which there is little or no network activity, indicating that the page has mostly finished loading." },
    ],
  },
];

function MetricGlossary() {
  return (
    <div className="space-y-4">
      {METRIC_DEFINITIONS.map((group) => (
        <div key={group.group}>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{group.group}</div>
          <div className="space-y-2">
            {group.items.map((item) => (
              <div key={item.name} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="text-sm font-bold text-slate-900">
                  {item.name}
                  {item.name !== item.fullName && <span className="font-semibold text-slate-500"> ({item.fullName})</span>}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LeadDetailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const leadId = searchParams.get("id") as string;
  const [noteContent, setNoteContent] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // Phase 7: live backend stage progress (status / progress % / elapsed / warnings / errors)
  const [liveProgress, setLiveProgress] = useState<{
    stage: string; progress: number; elapsed: number; status: string;
    warnings: string[]; errors: string[];
  } | null>(null);

  const refreshLeadQueries = useCallback(async (id: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["lead", id], exact: true, refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: ["leadAnalysisSummary", id], exact: true, refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: ["leadAi", id], exact: true, refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: ["leadAnalysisHistory", id], exact: true, refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: ["leadAnalysisComparison", id], exact: true, refetchType: "active" }),
    ]);
  }, [queryClient]);

  const { data: lead, isLoading: leadLoading } = useQuery({
    queryKey: ["lead", leadId],
    enabled: Boolean(leadId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await api.get(`/leads/${leadId}`);
      return res.data;
    },
  });

  const { data: analysisSummary, isLoading: analysisLoading } = useQuery({
    queryKey: ["leadAnalysisSummary", leadId],
    enabled: Boolean(leadId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      try {
        const res = await api.get(`/ai-analysis/lead/${leadId}/analysis-summary`);
        return res.data;
      } catch {
        return null;
      }
    },
    retry: false,
  });

  const { data: legacyAi } = useQuery({
    queryKey: ["leadAi", leadId],
    enabled: Boolean(leadId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      try {
        const res = await api.get(`/ai-analysis/lead/${leadId}`);
        return res.data;
      } catch {
        return null;
      }
    },
    retry: false,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["leadActivities", leadId],
    enabled: Boolean(leadId),
    queryFn: async () => {
      try {
        const res = await api.get(`/crm/activities/lead/${leadId}`);
        // Phase 5: endpoint returns { activities: [], count: 0 } even when a
        // lead has no activity (never 404). Tolerate both shapes.
        return res.data?.activities ?? res.data?.data ?? [];
      } catch {
        // Never surface an error to the user for a lead with no activity.
        return [];
      }
    },
  });

  useEffect(() => {
    if (!leadId) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem("access_token") || "" : "";
    const wsUrl = `${API_BASE_URL.replace(/^http/, "ws").replace(/\/api\/v1$/, '')}/api/v1/ws/analysis-updates?token=${token}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        const incomingLeadId = payload.lead_id || payload.leadId;
        if (!incomingLeadId || String(incomingLeadId) !== String(leadId)) return;

        const shouldRefresh = ["LEAD_ANALYSIS_UPDATED", "LEAD_COMPLETED", "AI_ANALYSIS_COMPLETED", "LEAD_FAILED", "analysis_completed", "STAGE_PROGRESS"].includes(payload.type) || /analysis/i.test(String(payload.type || ""));
        if (!shouldRefresh) return;

        // Phase 7 — reflect granular backend stage progress in real time.
        if (payload.type === "STAGE_PROGRESS") {
          setLiveProgress({
            stage: String(payload.stage || ""),
            progress: Number(payload.progress || 0),
            elapsed: Number(payload.elapsed_seconds || 0),
            status: String(payload.stage_status || "running"),
            warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
            errors: Array.isArray(payload.errors) ? payload.errors : [],
          });
          // Do not return here. Let it fall through to refreshLeadQueries 
          // so the UI instantly updates with newly enriched data from this stage.
        }
        if (["LEAD_COMPLETED", "AI_ANALYSIS_COMPLETED", "analysis_completed", "LEAD_FAILED"].includes(payload.type)) {
          setLiveProgress(null);
        }

        await refreshLeadQueries(leadId);

        const wsStatus = String(payload.status || "").toLowerCase();
        if (payload.type === "LEAD_COMPLETED" || payload.type === "AI_ANALYSIS_COMPLETED" || payload.type === "analysis_completed") {
          if (wsStatus === "partial_success" || wsStatus === "partial success") {
            toast.warning("AI Analysis Partially Completed", {
              description: "Analysis finished but some modules encountered errors. Review warnings below.",
              duration: 6000,
            });
          } else if (wsStatus === "failed") {
            toast.error("AI Analysis Failed", {
              description: "Analysis could not be completed. You can retry the analysis.",
              duration: 6000,
            });
          } else {
            toast.success("Advanced AI Analysis Completed", {
              description: "Website analysis completed successfully and has been saved to this Lead.",
              duration: 5000,
            });
          }
        } else if (payload.type === "LEAD_FAILED") {
          toast.error("AI Analysis Failed", {
            description: "Analysis could not be completed. You can retry the analysis.",
            duration: 6000,
          });
        }
      } catch {
        // Ignore malformed websocket frames.
      }
    };

    return () => {
      if (ws.readyState === 0) {
        ws.onopen = () => ws.close();
      } else {
        ws.close();
      }
    };
  }, [leadId, refreshLeadQueries]);

  const stageMutation = useMutation({
    mutationFn: async (newStage: string) => api.patch(`/crm/leads/${leadId}/stage`, { stage: newStage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leadActivities", leadId] });
    },
  });

  const noteMutation = useMutation({
    mutationFn: async (content: string) => api.post(`/crm/activities`, { lead_id: leadId, activity_type: "Note Added", description: content }),
    onSuccess: () => {
      setNoteContent("");
      queryClient.invalidateQueries({ queryKey: ["leadActivities", leadId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/leads/${leadId}`);
    },
    onSuccess: () => router.push("/dashboard/leads"),
  });

  const profile = useMemo(() => {
    if (!lead) return null;
    return {
      ...lead,
      ai_analysis: analysisSummary?.ai_analysis ?? lead.ai_analysis,
      website_information: analysisSummary?.website_information ?? lead.website_information,
      website_structure: analysisSummary?.website_structure ?? lead.website_structure,
      contact_discovery: analysisSummary?.contact_discovery ?? lead.contact_discovery,
      social_media: analysisSummary?.social_media ?? lead.social_media,
      technology_detection: analysisSummary?.technology_detection ?? lead.technology_detection,
      seo: analysisSummary?.seo ?? lead.seo,
      performance: analysisSummary?.performance ?? lead.performance,
      performanceAudit: analysisSummary?.performanceAudit ?? lead.performanceAudit,
      securityAudit: analysisSummary?.securityAudit ?? lead.securityAudit,
      seoAudit: analysisSummary?.seoAudit ?? lead.seoAudit,
      uiuxAudit: analysisSummary?.uiuxAudit ?? lead.uiuxAudit,
      design: analysisSummary?.design ?? lead.design,
      business: analysisSummary?.business ?? lead.business,
      tiktok: analysisSummary?.tiktok ?? lead.tiktok,
    };
  }, [lead, analysisSummary]);

  const handleCopy = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  if (leadLoading || analysisLoading) return <Skeleton />;
  if (!profile) return <div className="min-h-screen bg-slate-50 p-12 text-center text-red-600">Lead not found.</div>;

  const cd: AnyRecord = profile.contact_discovery || {};
  const wi: AnyRecord = profile.website_information || {};
  const ws: AnyRecord = profile.website_structure || {};
  const tech: AnyRecord = profile.technology_detection || {};
  const seo: AnyRecord = profile.seo || {};
  const perf: AnyRecord = profile.performance || {};
  const perfAudit: AnyRecord = profile.performanceAudit || {};
  const secAudit: AnyRecord = profile.securityAudit || {};
  const seoAudit: AnyRecord = profile.seoAudit || {};
  const uiuxAudit: AnyRecord = profile.uiuxAudit || {};
  const design: AnyRecord = profile.design || {};
  const business: AnyRecord = profile.business || {};
  const social: AnyRecord = profile.social_media || {};
  const tiktok: AnyRecord = profile.tiktok || {};
  const aiMeta: AnyRecord = profile.ai_analysis || {};
  const aiSocialLinks = (aiMeta.social_links || {}) as AnyRecord;
  const aiContacts = Array.isArray(aiMeta.contacts) ? (aiMeta.contacts as AnyRecord[]) : [];
  const aiEmails = uniqueEmails(asArray(aiMeta.emails));
  const aiPhones = uniquePhones(asArray(aiMeta.phones));
  const aiAddresses = unique(asArray(aiMeta.addresses));

  const primaryEmail = asOptionalString(aiEmails[0] || cd.primary_email || profile.email);
  const primaryPhone = asOptionalString(aiPhones[0] || cd.primary_phone || profile.phone);
  const allEmails = uniqueEmails([primaryEmail, ...aiEmails, ...asArray(cd.all_emails), ...asArray(cd.secondary_emails), ...asArray(cd.support_email), ...asArray(cd.sales_email), ...asArray(cd.hr_email), ...asArray(cd.marketing_email)]);
  const allPhones = uniquePhones([primaryPhone, ...aiPhones, ...asArray(cd.secondary_phones)]);
  const whatsapp = uniquePhones([...aiPhones, ...asArray(cd.whatsapp_numbers), primaryPhone]);
  const address = asOptionalString(aiAddresses[0] || cd.office_address || profile.address);
  const mapsUrl = asOptionalString(aiMeta.google_maps || cd.google_maps || profile.source_url);

  const recommendations = {
    seo: unique([...asArray(aiMeta.top_seo_issues), ...asArray(seo.top_issues), ...asArray(seo.issues), ...asArray(seo.recommendations), ...asArray(legacyAi?.seo_audit?.recommendations)]),
    ui: unique([...asArray(aiMeta.top_ui_issues), ...asArray(design.top_ui_issues), ...asArray(design.ui_issues)]),
    ux: unique([...asArray(aiMeta.top_ux_issues), ...asArray(design.top_ux_issues), ...asArray(design.ux_issues), ...asArray(design.recommendations), ...asArray(legacyAi?.design_audit?.recommendations)]),
    perf: unique([...asArray(aiMeta.performance_suggestions), ...asArray(perf.suggestions), ...asArray(perf.performance_suggestions), ...asArray(perf.recommendations)]),
    security: unique([...asArray(aiMeta.security_suggestions), ...asArray(design.security_suggestions), ...asArray(seo.security_recommendations), ...asArray(legacyAi?.seo_audit?.security_recommendations)]),
    accessibility: unique([...asArray(aiMeta.accessibility_suggestions), ...asArray(design.accessibility_suggestions), ...asArray(seo.accessibility_recommendations), ...asArray(legacyAi?.seo_audit?.accessibility_recommendations)]),
  };

  const structuredRecs = (
    unique([
      ...asArray(aiMeta.recommendations),
      ...asArray(legacyAi?.recommendations),
      ...asArray(legacyAi?.analysis_data?.recommendations),
    ])
      .map(toRecommendation)
      .filter(Boolean) as Recommendation[]
  );

  const googleMapsHref = mapsUrl || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : undefined);
  const websiteUrl = asOptionalString(profile.website || wi.website_url || wi.final_url || aiMeta.website_url || aiMeta.domain);
  const isRefreshing = analysisLoading || stageMutation.isPending;
  const isProfessional = Boolean(websiteUrl) && (profile.website_type === 'PROFESSIONAL_WEBSITE' || !profile.website_type);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-700 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <Link href="/dashboard/leads" className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Back to leads">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="break-words text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{profile.name || "Untitled Lead"}</h1>
                  {(() => {
                    const rawStatus = String(aiMeta.analysis_status || "Pending Analysis").toLowerCase();
                    let badgeBorder = "border-slate-200";
                    let badgeBg = "bg-slate-50";
                    let badgeText = "text-slate-600";
                    let BadgeIcon = Activity;
                    if (rawStatus === "completed") {
                      badgeBorder = "border-emerald-200";
                      badgeBg = "bg-emerald-50";
                      badgeText = "text-emerald-700";
                      BadgeIcon = CheckCircle;
                    } else if (rawStatus === "partial_success" || rawStatus === "partial success") {
                      badgeBorder = "border-amber-200";
                      badgeBg = "bg-amber-50";
                      badgeText = "text-amber-700";
                      BadgeIcon = AlertTriangle;
                    } else if (rawStatus === "failed") {
                      badgeBorder = "border-red-200";
                      badgeBg = "bg-red-50";
                      badgeText = "text-red-700";
                      BadgeIcon = ShieldAlert;
                    } else if (["started", "collecting", "analyzing", "scoring", "saving", "queued", "waiting"].includes(rawStatus)) {
                      badgeBorder = "border-blue-200";
                      badgeBg = "bg-blue-50";
                      badgeText = "text-blue-700";
                      BadgeIcon = Activity;
                    }
                    return (
                      <span className={`inline-flex items-center gap-2 rounded-lg border ${badgeBorder} ${badgeBg} px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${badgeText}`}>
                        <BadgeIcon className="h-4 w-4" />{display(aiMeta.analysis_status, "Pending Analysis")}
                      </span>
                    );
                  })()}
                  {isRefreshing && <span className="text-xs font-semibold text-blue-600">Updating...</span>}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-500" />{[profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "No location"}</span>
                  {websiteUrl && <a href={websiteUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-2 truncate text-blue-600 hover:text-blue-700"><Globe className="h-4 w-4" /><span className="truncate">{websiteUrl}</span><ExternalLink className="h-3.5 w-3.5" /></a>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={profile.pipeline_stage || "New Lead"}
                onChange={(event) => stageMutation.mutate(event.target.value)}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 outline-none transition hover:bg-blue-100"
              >
                {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage} className="bg-white text-slate-700">{stage}</option>)}
              </select>
              <button onClick={() => {
                if (confirm("Are you sure you want to permanently delete this lead?")) {
                  deleteMutation.mutate();
                }
              }} className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-600 transition hover:bg-red-100" title="Delete lead" type="button">
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* ── Live Analysis Progress (Phase 7) ── */}
        {liveProgress && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 shrink-0 animate-pulse text-blue-600" />
                <div>
                  <div className="text-sm font-bold text-blue-800">
                    {liveProgress.stage || "Analyzing"} · {Math.round(liveProgress.progress)}%
                  </div>
                  <div className="text-xs text-blue-600">
                    Elapsed {liveProgress.elapsed}s · status {liveProgress.status}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.max(2, Math.min(100, liveProgress.progress))}%` }}
              />
            </div>
            {liveProgress.warnings.length > 0 && (
              <div className="mt-2 text-xs text-amber-700">
                {liveProgress.warnings.slice(0, 3).map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            {liveProgress.errors.length > 0 && (
              <div className="mt-2 text-xs text-red-700">
                {liveProgress.errors.slice(0, 3).map((e, i) => <div key={i}>✕ {e}</div>)}
              </div>
            )}
          </div>
        )}

        {/* ── Analysis Status Alerts ── */}
        {(() => {
          const statusRaw = String(aiMeta.analysis_status || "").toLowerCase();
          const analysisErrors = asArray(aiMeta.errors);
          const analysisWarnings = asArray(aiMeta.warnings);
          const showRetry = statusRaw === "failed";
          const showWarning = statusRaw === "partial_success" || statusRaw === "partial success";

          if (!analysisErrors.length && !analysisWarnings.length && !showRetry && !showWarning) return null;

          return (
            <div className="space-y-3">
              {statusRaw === "failed" && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-red-800">Analysis Failed</div>
                    <div className="mt-1 text-sm text-red-700">The analysis could not be completed. You can retry to run it again.</div>
                    {analysisErrors.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-red-600">
                        {analysisErrors.map((err, i) => <li key={i}>{String(err)}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              )}
              {(statusRaw === "partial_success" || statusRaw === "partial success") && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-amber-800">Analysis Partially Completed</div>
                    <div className="mt-1 text-sm text-amber-700">Some analysis modules encountered errors. Scores shown may be incomplete.</div>
                    {analysisWarnings.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-amber-600">
                        {analysisWarnings.map((w, i) => <li key={i}>{String(w)}</li>)}
                      </ul>
                    )}
                    {analysisErrors.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-red-500">
                        {analysisErrors.map((err, i) => <li key={i}>{String(err)}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div className="grid grid-cols-12 gap-6">
          <main className="col-span-12 space-y-6 lg:col-span-8">
            {isProfessional ? (
              <>
                <SectionCard title="Website Analysis" icon={<BarChart3 className="h-5 w-5" />}>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <CircularScore value={numericScore(aiMeta.overall_score ?? aiMeta.overall_ai_score)} label="Overall AI Score" colorClass="text-indigo-500" />
                <CircularScore value={numericScore(perfAudit.overallScore)} label="Performance Audit" colorClass="text-emerald-500" />
                <CircularScore value={numericScore(secAudit.overallScore)} label="Security Audit" colorClass="text-sky-500" />
                <CircularScore value={numericScore(seoAudit.overallScore)} label="SEO Intelligence" colorClass="text-amber-500" />
              </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <SectionCard title="Tech Stack" icon={<Code className="h-5 w-5" />}>
                <div className="mb-3">
                  <InfoRow label="CMS" value={display(aiMeta.cms || tech.cms)} />
                  <InfoRow label="Frontend" value={display(aiMeta.frontend || tech.frontend_framework || tech.javascript_framework || tech.css_framework)} />
                  <InfoRow label="Backend" value={display(aiMeta.backend || tech.backend_framework || tech.server_stack)} />
                  <InfoRow label="Hosting" value={display(aiMeta.hosting || tech.hosting)} />
                  <InfoRow label="CDN" value={display(aiMeta.cdn || tech.cdn)} />
                  <InfoRow label="Analytics" value={display(aiMeta.analytics || tech.analytics)} />
                </div>
                <WebsiteTechnologyStack data={tech} />
              </SectionCard>

              <SectionCard title="CRM Activity & Notes" icon={<Activity className="h-5 w-5" />} defaultOpen={false}>
                <div className="mb-5 max-h-72 space-y-4 overflow-y-auto border-l border-slate-200 pl-4">
                  {activities.length ? activities.map((event: AnyRecord, index: number) => {
                    const createdAt = asOptionalString(event.created_at);
                    return (
                      <div key={`${asOptionalString(event._id) || index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-blue-600">{display(event.activity_type, "Activity")}</span>
                          <span className="text-xs text-slate-500">{createdAt ? new Date(createdAt).toLocaleDateString() : ""}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{display(event.description, "")}</p>
                      </div>
                    );
                  }) : <p className="text-sm italic text-slate-400">No activities logged yet.</p>}
                </div>
                <div className="relative">
                  <textarea
                    value={noteContent}
                    onChange={(event) => setNoteContent(event.target.value)}
                    placeholder="Log a call, email, or meeting note..."
                    className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 pr-12 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <button type="button" onClick={() => noteContent.trim() && noteMutation.mutate(noteContent)} disabled={!noteContent.trim() || noteMutation.isPending} className="absolute bottom-2 right-2 rounded-lg bg-blue-600 p-2 text-white transition hover:bg-blue-500 disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </SectionCard>
            </div>

            {perfAudit && (Object.keys(perfAudit).length > 0) && (
              <SectionCard title="Website Performance Audit" icon={<BarChart3 className="h-5 w-5" />}>
                <WebsitePerformanceAudit data={perfAudit} />
              </SectionCard>
            )}

            {secAudit && (Object.keys(secAudit).length > 0) && (
              <SectionCard title="Website Security Audit" icon={<ShieldAlert className="h-5 w-5" />}>
                <WebsiteSecurityAudit data={secAudit} />
              </SectionCard>
            )}

            {seoAudit && (Object.keys(seoAudit).length > 0) && (
              <SectionCard title="SEO Intelligence Audit" icon={<Globe className="h-5 w-5" />}>
                <SEOIntelligenceAudit data={seoAudit} />
              </SectionCard>
            )}

            {uiuxAudit && (Object.keys(uiuxAudit).length > 0) && (
              <SectionCard title="Website UI/UX Intelligence" icon={<Palette className="h-5 w-5" />}>
                <WebsiteUIUXIntelligence data={uiuxAudit} />
              </SectionCard>
            )}

            {structuredRecs.length > 0 && (
              <SectionCard title="AI Recommendations" icon={<Lightbulb className="h-5 w-5 text-amber-500" />}>
                <StructuredRecommendationList title="Prioritized Recommendations" items={structuredRecs} icon={<Lightbulb className="h-4 w-4" />} />
              </SectionCard>
            )}

            </>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                  <Globe className="h-8 w-8 text-blue-500" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-slate-900">No Professional Website Found</h3>
                <p className="mt-2 text-slate-500">
                  This business has not provided an official business website. Website AI Analysis cannot be performed.
                </p>

              </div>
            )}
          </main>

          <aside className="col-span-12 space-y-6 lg:col-span-4">
            <SectionCard title="Contacts" icon={<User className="h-5 w-5" />}>
              <div className="space-y-5">
                <InfoRow label="Primary Email" value={primaryEmail ? <button type="button" onClick={() => handleCopy(primaryEmail, "primary-email")} className="inline-flex max-w-full items-center gap-2 truncate text-left text-emerald-600 hover:text-emerald-700"><Mail className="h-4 w-4" /><span className="truncate">{primaryEmail}</span>{copiedField === "primary-email" ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button> : "Not Available"} />
                <InfoRow label="All Emails" value={allEmails.length ? allEmails.join(", ") : "Not Available"} />
                <InfoRow label="Phones" value={allPhones.length ? allPhones.join(", ") : "Not Available"} />
                <InfoRow label="WhatsApp" value={whatsapp[0] ? <button type="button" onClick={() => handleCopy(whatsapp[0], "whatsapp")} className="inline-flex max-w-full items-center gap-2 truncate text-left text-emerald-600 hover:text-emerald-700"><MessageCircle className="h-4 w-4" /><span className="truncate">{whatsapp[0]}</span>{copiedField === "whatsapp" ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button> : "Not Available"} />
                <InfoRow label="Address" value={display(address)} />
                <InfoRow label="Google Maps" value={googleMapsHref ? "Open map" : "Not Available"} href={googleMapsHref} />
                {aiContacts.length > 0 && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Discovered contacts</div>
                  <div className="mt-2 space-y-2">
                    {aiContacts.slice(0, 4).map((contact, index) => (
                      <div key={`${contact.type}-${index}`} className="text-sm text-slate-700">
                        <span className="font-semibold">{display(contact.type)}</span>: {display(contact.value)}
                      </div>
                    ))}
                  </div>
                </div>}
                <div className="flex flex-wrap gap-2 pt-2">
                  {primaryPhone && <a href={`tel:${primaryPhone}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"><Phone className="h-4 w-4" />Call</a>}
                  {whatsapp[0] && <a href={`https://wa.me/${whatsapp[0].replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-600"><MessageCircle className="h-4 w-4" />WhatsApp</a>}
                  {primaryEmail && <a href={`mailto:${primaryEmail}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-600"><Send className="h-4 w-4" />Email</a>}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Social" icon={<Globe className="h-5 w-5" />}>
              <div className="grid grid-cols-2 gap-3">
                <SocialLink label="Facebook" url={asOptionalString(aiSocialLinks.facebook || social.facebook)} />
                <SocialLink label="Instagram" url={asOptionalString(aiSocialLinks.instagram || social.instagram)} />
                <SocialLink label="LinkedIn" url={asOptionalString(aiSocialLinks.linkedin || social.linkedin)} />
                <SocialLink label="Twitter" url={asOptionalString(aiSocialLinks.twitter || social.twitter)} />
                <SocialLink label="YouTube" url={asOptionalString(aiSocialLinks.youtube || social.youtube)} />
                <SocialLink label="TikTok" url={asOptionalString(aiSocialLinks.tiktok || tiktok.url)} />
                <SocialLink label="Threads" url={asOptionalString(aiSocialLinks.threads)} />
                <SocialLink label="Telegram" url={asOptionalString(aiSocialLinks.telegram)} />
                <SocialLink label="GitHub" url={asOptionalString(aiSocialLinks.github)} />
              </div>
            </SectionCard>

            <SectionCard title="TikTok Presence" icon={<Music2 className="h-5 w-5" />}>
              <TikTokPresence presence={tiktok} />
            </SectionCard>

            <SectionCard title="Performance Metrics Explained" icon={<Gauge className="h-5 w-5" />}>
              <MetricGlossary />
            </SectionCard>


          </aside>
        </div>
      </div>
    </div>
  );
}

