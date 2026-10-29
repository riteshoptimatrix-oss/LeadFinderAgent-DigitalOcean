"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/src/lib/axios";
import Link from "next/link";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Lightbulb,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  Phone,
  Send,
  ShieldAlert,
  Trash2,
  User,
  Palette,
  Gauge,
  Sparkles,
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
const asArray = (value: unknown) => (Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []);
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

const display = (value: unknown, fallback = "Not Available") => (isPresent(value) ? String(value) : fallback);
const asOptionalString = (value: unknown) => (isPresent(value) ? String(value) : undefined);
const numericScore = (value: unknown) => {
  if (!isPresent(value)) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.min(100, Math.round(numberValue))) : undefined;
};

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
  return "border-gray-200 bg-gray-50 text-gray-600";
};

function Skeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white shadow-2xs" />
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 space-y-6 lg:col-span-8">
          <div className="h-44 animate-pulse rounded-xl border border-gray-200 bg-white shadow-2xs" />
          <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white shadow-2xs" />
        </div>
        <div className="col-span-12 space-y-6 lg:col-span-4">
          <div className="h-80 animate-pulse rounded-xl border border-gray-200 bg-white shadow-2xs" />
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xs">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between border-b border-gray-100 bg-white px-4 py-3 text-left transition hover:bg-gray-50/70"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="rounded-md border border-gray-200 bg-gray-50 p-1.5 text-gray-600">{icon}</span>
          <span className="truncate text-xs font-bold uppercase tracking-wider text-gray-800">{title}</span>
        </span>
        {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 sm:p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function CircularScore({
  value,
  label,
  colorClass,
}: {
  value?: number;
  label: string;
  colorClass: string;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const displayValue = typeof value === "number" ? value : "N/A";

  return (
    <div className="rounded-xl border border-gray-200/80 bg-white p-3.5 text-center shadow-2xs">
      <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
        <svg className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={radius} className="stroke-gray-100" strokeWidth="6" fill="transparent" />
          <circle
            cx="40"
            cy="40"
            r={radius}
            className={`stroke-current ${colorClass} transition-all duration-700`}
            strokeWidth="6"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute font-mono text-lg font-bold text-gray-900">{displayValue}</span>
      </div>
      <div className="mt-2 text-[11px] font-semibold text-gray-600 leading-tight">{label}</div>
    </div>
  );
}

function InfoRow({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  const content = href ? (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-blue-600 hover:text-blue-700">
      <span className="truncate">{value}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  ) : (
    value
  );

  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-2 text-xs last:border-0">
      <span className="text-gray-500 font-medium shrink-0">{label}</span>
      <span className="min-w-0 max-w-[70%] text-right font-semibold text-gray-800">{content}</span>
    </div>
  );
}

function StructuredRecommendationList({
  title,
  items,
  icon,
}: {
  title: string;
  items: Recommendation[];
  icon: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-2 border-b border-gray-100 pb-2 text-xs font-bold uppercase tracking-wider text-gray-700">
        {icon}
        {title}
      </h4>
      {items.length > 0 ? (
        items.slice(0, 8).map((rec, index) => (
          <div key={`structured-${index}`} className="space-y-1.5 rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {rec.category && (
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                  {rec.category}
                </span>
              )}
              {rec.priority && (
                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityBadgeClass(rec.priority)}`}>
                  {rec.priority}
                </span>
              )}
              {rec.impact && (
                <span className="rounded bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                  Impact: {rec.impact}
                </span>
              )}
            </div>
            {rec.title && <div className="font-bold text-gray-900">{rec.title}</div>}
            {rec.recommendation && (
              <div className="flex gap-2 text-gray-700 leading-relaxed">
                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-blue-600 mt-0.5" />
                <span>{rec.recommendation}</span>
              </div>
            )}
            {rec.reference_url && (
              <a href={String(rec.reference_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">
                Reference <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ))
      ) : (
        <p className="text-xs italic text-gray-400">No structured recommendations yet.</p>
      )}
    </div>
  );
}

function SocialLink({ label, url }: { label: string; url?: string }) {
  if (!url) {
    return <span className="rounded-lg border border-gray-200 bg-gray-50/60 px-2.5 py-1.5 text-xs font-medium text-gray-400 text-center">{label}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-blue-300 hover:text-blue-600 shadow-2xs"
    >
      <span>{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
    </a>
  );
}

const METRIC_DEFINITIONS: { group: string; items: { name: string; fullName: string; description: string }[] }[] = [
  {
    group: "PageSpeed Metrics",
    items: [
      { name: "LCP", fullName: "Largest Contentful Paint", description: "Measures loading performance of the main visible content." },
      { name: "FCP", fullName: "First Contentful Paint", description: "Time taken for the first element to appear on screen." },
      { name: "INP", fullName: "Interaction to Next Paint", description: "How quickly the page responds to user clicks or taps." },
      { name: "CLS", fullName: "Cumulative Layout Shift", description: "Visual stability tracking unexpected layout movement." },
    ],
  },
];

function MetricGlossary() {
  return (
    <div className="space-y-2 text-xs">
      {METRIC_DEFINITIONS.map((group) => (
        <div key={group.group} className="space-y-1.5">
          {group.items.map((item) => (
            <div key={item.name} className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5">
              <div className="font-bold text-gray-900">
                {item.name} <span className="font-normal text-gray-500">({item.fullName})</span>
              </div>
              <p className="text-gray-600 mt-0.5 leading-relaxed">{item.description}</p>
            </div>
          ))}
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
  const [liveProgress, setLiveProgress] = useState<{
    stage: string;
    progress: number;
    elapsed: number;
    status: string;
    warnings: string[];
    errors: string[];
  } | null>(null);

  const refreshLeadQueries = useCallback(
    async (id: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lead", id], exact: true, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["leadAnalysisSummary", id], exact: true, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["leadAi", id], exact: true, refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["leadActivities", id], exact: true, refetchType: "active" }),
      ]);
    },
    [queryClient]
  );

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
        return res.data?.activities ?? res.data?.data ?? [];
      } catch {
        return [];
      }
    },
  });

  useEffect(() => {
    if (!leadId) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") || "" : "";
    const wsUrl = `${API_BASE_URL.replace(/^http/, "ws").replace(/\/api\/v1$/, "")}/api/v1/ws/analysis-updates?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        const incomingLeadId = payload.lead_id || payload.leadId;
        if (!incomingLeadId || String(incomingLeadId) !== String(leadId)) return;

        const shouldRefresh =
          ["LEAD_ANALYSIS_UPDATED", "LEAD_COMPLETED", "AI_ANALYSIS_COMPLETED", "LEAD_FAILED", "analysis_completed", "STAGE_PROGRESS"].includes(payload.type) ||
          /analysis/i.test(String(payload.type || ""));
        if (!shouldRefresh) return;

        if (payload.type === "STAGE_PROGRESS") {
          setLiveProgress({
            stage: String(payload.stage || ""),
            progress: Number(payload.progress || 0),
            elapsed: Number(payload.elapsed_seconds || 0),
            status: String(payload.stage_status || "running"),
            warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
            errors: Array.isArray(payload.errors) ? payload.errors : [],
          });
        }
        if (["LEAD_COMPLETED", "AI_ANALYSIS_COMPLETED", "analysis_completed", "LEAD_FAILED"].includes(payload.type)) {
          setLiveProgress(null);
        }

        await refreshLeadQueries(leadId);

        const wsStatus = String(payload.status || "").toLowerCase();
        if (payload.type === "LEAD_COMPLETED" || payload.type === "AI_ANALYSIS_COMPLETED" || payload.type === "analysis_completed") {
          if (wsStatus === "partial_success" || wsStatus === "partial success") {
            toast.warning("AI Analysis Partially Completed");
          } else if (wsStatus === "failed") {
            toast.error("AI Analysis Failed");
          } else {
            toast.success("AI Analysis Completed Successfully");
          }
        } else if (payload.type === "LEAD_FAILED") {
          toast.error("AI Analysis Failed");
        }
      } catch {
        // Ignore malformed frames
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
      toast.success("Pipeline stage updated");
    },
  });

  const noteMutation = useMutation({
    mutationFn: async (content: string) =>
      api.post(`/crm/activities`, { lead_id: leadId, activity_type: "Note Added", description: content }),
    onSuccess: () => {
      setNoteContent("");
      queryClient.invalidateQueries({ queryKey: ["leadActivities", leadId] });
      toast.success("Note added");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/leads/${leadId}`);
    },
    onSuccess: () => {
      toast.success("Lead deleted");
      router.push("/dashboard/leads");
    },
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
  if (!profile) {
    return (
      <div className="w-full rounded-xl border border-gray-200 bg-white p-12 text-center shadow-2xs space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Lead Record Not Found</h2>
        <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
          The requested lead could not be located in your database. It may have been deleted or the ID is invalid.
        </p>
        <Link
          href="/dashboard/leads"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Leads Directory
        </Link>
      </div>
    );
  }

  const cd: AnyRecord = profile.contact_discovery || {};
  const wi: AnyRecord = profile.website_information || {};
  const tech: AnyRecord = profile.technology_detection || {};
  const perfAudit: AnyRecord = profile.performanceAudit || {};
  const secAudit: AnyRecord = profile.securityAudit || {};
  const seoAudit: AnyRecord = profile.seoAudit || {};
  const uiuxAudit: AnyRecord = profile.uiuxAudit || {};
  const social: AnyRecord = profile.social_media || {};
  const aiMeta: AnyRecord = profile.ai_analysis || {};
  const aiSocialLinks = (aiMeta.social_links || {}) as AnyRecord;
  const aiContacts = Array.isArray(aiMeta.contacts) ? (aiMeta.contacts as AnyRecord[]) : [];
  const aiEmails = uniqueEmails(asArray(aiMeta.emails));
  const aiPhones = uniquePhones(asArray(aiMeta.phones));
  const aiAddresses = unique(asArray(aiMeta.addresses));

  const primaryEmail = asOptionalString(aiEmails[0] || cd.primary_email || profile.email);
  const primaryPhone = asOptionalString(aiPhones[0] || cd.primary_phone || profile.phone);
  const allEmails = uniqueEmails([
    primaryEmail,
    ...aiEmails,
    ...asArray(cd.all_emails),
    ...asArray(cd.secondary_emails),
  ]);
  const allPhones = uniquePhones([primaryPhone, ...aiPhones, ...asArray(cd.secondary_phones)]);
  const whatsapp = uniquePhones([...aiPhones, ...asArray(cd.whatsapp_numbers), primaryPhone]);
  const address = asOptionalString(aiAddresses[0] || cd.office_address || profile.address);
  const mapsUrl = asOptionalString(aiMeta.google_maps || cd.google_maps || profile.source_url);

  const structuredRecs = unique([
    ...asArray(aiMeta.recommendations),
    ...asArray(legacyAi?.recommendations),
    ...asArray(legacyAi?.analysis_data?.recommendations),
  ])
    .map(toRecommendation)
    .filter(Boolean) as Recommendation[];

  const googleMapsHref = mapsUrl || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : undefined);
  const websiteUrl = asOptionalString(profile.website || wi.website_url || wi.final_url || aiMeta.website_url || aiMeta.domain);
  const isRefreshing = analysisLoading || stageMutation.isPending;
  const isProfessional = Boolean(websiteUrl) && (profile.website_type === "PROFESSIONAL_WEBSITE" || !profile.website_type);

  return (
    <div className="w-full space-y-6 text-gray-800 pb-16">
      {/* =========================================================================
          TOP HEADER: Clean, Minimal, Action-Oriented
      ========================================================================= */}
      <header className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <Link
              href="/dashboard/leads"
              className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 shrink-0"
              aria-label="Back to leads directory"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="break-words text-lg sm:text-xl font-bold tracking-tight text-gray-900">
                  {profile.name || "Untitled Lead"}
                </h1>
                {(() => {
                  const rawStatus = String(aiMeta.analysis_status || "Pending Analysis").toLowerCase();
                  let badgeClass = "border-gray-200 bg-gray-50 text-gray-600";
                  let Icon = Activity;
                  if (rawStatus === "completed") {
                    badgeClass = "border-emerald-200 bg-emerald-50 text-emerald-700";
                    Icon = CheckCircle2;
                  } else if (rawStatus === "partial_success" || rawStatus === "partial success") {
                    badgeClass = "border-amber-200 bg-amber-50 text-amber-700";
                    Icon = AlertTriangle;
                  } else if (rawStatus === "failed") {
                    badgeClass = "border-red-200 bg-red-50 text-red-700";
                    Icon = ShieldAlert;
                  }
                  return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
                      <Icon className="h-3 w-3" />
                      {display(aiMeta.analysis_status, "Pending Analysis")}
                    </span>
                  );
                })()}
                {isRefreshing && <span className="text-xs font-semibold text-blue-600 animate-pulse">Syncing...</span>}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span>{[profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "No location"}</span>
                </span>
                {profile.category && (
                  <span className="inline-flex items-center gap-1 text-gray-600">
                    <span className="text-gray-300">•</span>
                    <span>{profile.category}</span>
                  </span>
                )}
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 truncate text-blue-600 hover:text-blue-700"
                  >
                    <span className="text-gray-300">•</span>
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate max-w-[200px] sm:max-w-xs">{websiteUrl}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions & Pipeline Stage */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={profile.pipeline_stage || "New Lead"}
              onChange={(event) => stageMutation.mutate(event.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-800 outline-none transition hover:bg-gray-100 cursor-pointer"
            >
              {PIPELINE_STAGES.map((stage) => (
                <option key={stage} value={stage} className="bg-white text-gray-700">
                  {stage}
                </option>
              ))}
            </select>

            {primaryPhone && (
              <a
                href={`tel:${primaryPhone}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-blue-300 hover:text-blue-600 shadow-2xs transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                Call
              </a>
            )}

            {whatsapp[0] && (
              <a
                href={`https://wa.me/${whatsapp[0].replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-emerald-300 hover:text-emerald-600 shadow-2xs transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                WhatsApp
              </a>
            )}

            {primaryEmail && (
              <a
                href={`mailto:${primaryEmail}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-blue-300 hover:text-blue-600 shadow-2xs transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-blue-600" />
                Email
              </a>
            )}

            <button
              onClick={() => {
                if (confirm("Are you sure you want to permanently delete this lead?")) {
                  deleteMutation.mutate();
                }
              }}
              className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
              title="Delete lead"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Live Stage Progress */}
      {liveProgress && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-blue-900">
            <span className="flex items-center gap-2">
              <Activity className="h-4 w-4 animate-pulse text-blue-600" />
              {liveProgress.stage || "Analyzing Website"}
            </span>
            <span>{Math.round(liveProgress.progress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${Math.max(3, Math.min(100, liveProgress.progress))}%` }}
            />
          </div>
        </div>
      )}

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* Main Left Column: Audits & Intelligence */}
        <main className="col-span-12 space-y-6 lg:col-span-8">
          {isProfessional ? (
            <>
              {/* Overall Circular Scores */}
              <SectionCard title="Website Analysis Overview" icon={<BarChart3 className="h-4 w-4" />}>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
                  <CircularScore
                    value={numericScore(aiMeta.overall_score ?? aiMeta.overall_ai_score)}
                    label="Overall AI Score"
                    colorClass="text-blue-600"
                  />
                  <CircularScore
                    value={numericScore(perfAudit.overallScore)}
                    label="Performance"
                    colorClass="text-emerald-600"
                  />
                  <CircularScore
                    value={numericScore(secAudit.overallScore)}
                    label="Security"
                    colorClass="text-indigo-600"
                  />
                  <CircularScore
                    value={numericScore(seoAudit.overallScore)}
                    label="SEO Score"
                    colorClass="text-amber-600"
                  />
                </div>
              </SectionCard>

              {/* Tech Stack */}
              <SectionCard title="Technology Stack" icon={<Code className="h-4 w-4" />}>
                <div className="mb-3 space-y-1">
                  <InfoRow label="CMS" value={display(aiMeta.cms || tech.cms)} />
                  <InfoRow label="Frontend Framework" value={display(aiMeta.frontend || tech.frontend_framework || tech.javascript_framework || tech.css_framework)} />
                  <InfoRow label="Backend / Server" value={display(aiMeta.backend || tech.backend_framework || tech.server_stack)} />
                  <InfoRow label="Hosting Provider" value={display(aiMeta.hosting || tech.hosting)} />
                  <InfoRow label="CDN" value={display(aiMeta.cdn || tech.cdn)} />
                  <InfoRow label="Analytics Tool" value={display(aiMeta.analytics || tech.analytics)} />
                </div>
                <WebsiteTechnologyStack data={tech} />
              </SectionCard>

              {/* Performance Audit */}
              {perfAudit && Object.keys(perfAudit).length > 0 && (
                <SectionCard title="Performance Audit" icon={<Gauge className="h-4 w-4" />}>
                  <WebsitePerformanceAudit data={perfAudit} />
                </SectionCard>
              )}

              {/* Security Audit */}
              {secAudit && Object.keys(secAudit).length > 0 && (
                <SectionCard title="Security Audit" icon={<ShieldAlert className="h-4 w-4" />}>
                  <WebsiteSecurityAudit data={secAudit} />
                </SectionCard>
              )}

              {/* SEO Intelligence Audit */}
              {seoAudit && Object.keys(seoAudit).length > 0 && (
                <SectionCard title="SEO Intelligence" icon={<Globe className="h-4 w-4" />}>
                  <SEOIntelligenceAudit data={seoAudit} />
                </SectionCard>
              )}

              {/* UI/UX Intelligence */}
              {uiuxAudit && Object.keys(uiuxAudit).length > 0 && (
                <SectionCard title="UI/UX & Mobile Readiness" icon={<Palette className="h-4 w-4" />}>
                  <WebsiteUIUXIntelligence data={uiuxAudit} />
                </SectionCard>
              )}

              {/* AI Recommendations */}
              {structuredRecs.length > 0 && (
                <SectionCard title="AI Recommendations" icon={<Lightbulb className="h-4 w-4 text-amber-500" />}>
                  <StructuredRecommendationList
                    title="Prioritized Recommendations"
                    items={structuredRecs}
                    icon={<Lightbulb className="h-4 w-4 text-blue-600" />}
                  />
                </SectionCard>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-2xs space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Globe className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">No Professional Website Available</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                This business does not have an active corporate website listed. Deep website AI crawling was skipped.
              </p>
            </div>
          )}
        </main>

        {/* Aside Right Column: Contacts, Social & Notes */}
        <aside className="col-span-12 space-y-6 lg:col-span-4">
          {/* Contact Details */}
          <SectionCard title="Contact Information" icon={<User className="h-4 w-4" />}>
            <div className="space-y-4">
              <InfoRow
                label="Primary Email"
                value={
                  primaryEmail ? (
                    <button
                      type="button"
                      onClick={() => handleCopy(primaryEmail, "primary-email")}
                      className="inline-flex max-w-full items-center gap-1.5 truncate text-left text-blue-600 hover:text-blue-700"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{primaryEmail}</span>
                      {copiedField === "primary-email" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                    </button>
                  ) : (
                    "Not Available"
                  )
                }
              />
              <InfoRow label="All Emails" value={allEmails.length ? allEmails.join(", ") : "Not Available"} />
              <InfoRow label="Phone Numbers" value={allPhones.length ? allPhones.join(", ") : "Not Available"} />
              <InfoRow
                label="WhatsApp"
                value={
                  whatsapp[0] ? (
                    <button
                      type="button"
                      onClick={() => handleCopy(whatsapp[0], "whatsapp")}
                      className="inline-flex max-w-full items-center gap-1.5 truncate text-left text-emerald-600 hover:text-emerald-700"
                    >
                      <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{whatsapp[0]}</span>
                      {copiedField === "whatsapp" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                    </button>
                  ) : (
                    "Not Available"
                  )
                }
              />
              <InfoRow label="Address" value={display(address)} />
              <InfoRow
                label="Google Maps"
                value={googleMapsHref ? "Open in Google Maps" : "Not Available"}
                href={googleMapsHref}
              />

              {aiContacts.length > 0 && (
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3 text-xs space-y-1.5">
                  <div className="font-bold uppercase tracking-wider text-gray-500 text-[10px]">Discovered Contacts</div>
                  {aiContacts.slice(0, 4).map((c, i) => (
                    <div key={i} className="text-gray-700 flex justify-between">
                      <span className="font-medium text-gray-500">{display(c.type)}</span>
                      <span className="font-semibold">{display(c.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>

          {/* CRM Activity & Notes */}
          <SectionCard title="CRM Activity & Notes" icon={<Activity className="h-4 w-4" />} defaultOpen={true}>
            <div className="space-y-3">
              <div className="max-h-56 space-y-2.5 overflow-y-auto pr-1">
                {activities.length ? (
                  activities.map((event: AnyRecord, index: number) => {
                    const createdAt = asOptionalString(event.created_at);
                    return (
                      <div key={`${asOptionalString(event._id) || index}`} className="rounded-lg border border-gray-200 bg-gray-50/60 p-2.5 text-xs">
                        <div className="flex items-center justify-between text-gray-500 mb-1">
                          <span className="font-bold text-blue-600">{display(event.activity_type, "Activity")}</span>
                          <span>{createdAt ? new Date(createdAt).toLocaleDateString() : ""}</span>
                        </div>
                        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{display(event.description, "")}</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs italic text-gray-400 py-1">No notes logged yet.</p>
                )}
              </div>

              <div className="relative pt-1">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Add a quick note or log interaction..."
                  className="h-20 w-full resize-none rounded-lg border border-gray-200 bg-white p-2.5 pr-10 text-xs text-gray-800 outline-none placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => noteContent.trim() && noteMutation.mutate(noteContent)}
                  disabled={!noteContent.trim() || noteMutation.isPending}
                  className="absolute bottom-2.5 right-2 rounded-md bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  title="Save note"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </SectionCard>

          {/* Social Presence */}
          <SectionCard title="Social Presence" icon={<Globe className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-2">
              <SocialLink label="LinkedIn" url={asOptionalString(aiSocialLinks.linkedin || social.linkedin)} />
              <SocialLink label="Twitter / X" url={asOptionalString(aiSocialLinks.twitter || social.twitter)} />
              <SocialLink label="Facebook" url={asOptionalString(aiSocialLinks.facebook || social.facebook)} />
              <SocialLink label="Instagram" url={asOptionalString(aiSocialLinks.instagram || social.instagram)} />
              <SocialLink label="YouTube" url={asOptionalString(aiSocialLinks.youtube || social.youtube)} />
              <SocialLink label="GitHub" url={asOptionalString(aiSocialLinks.github)} />
            </div>
          </SectionCard>

          {/* Metrics Glossary */}
          <SectionCard title="Metrics Reference" icon={<Gauge className="h-4 w-4" />} defaultOpen={false}>
            <MetricGlossary />
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
