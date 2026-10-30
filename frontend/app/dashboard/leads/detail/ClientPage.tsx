"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import Link from "next/link";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Flame,
  Gauge,
  Globe,
  HelpCircle,
  Layers,
  Lightbulb,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  Navigation,
  Palette,
  Phone,
  Play,
  RefreshCw,
  Send,
  Server,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  ThumbsUp,
  Timer,
  Trash2,
  TrendingUp,
  User,
  Wifi,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import LeadAnalysisDrawer from "@/src/components/leads/LeadAnalysisDrawer";
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

const PRIMARY_PIPELINE_STEPS = [
  "New Lead",
  "Website Analyzed",
  "Contact Ready",
  "Meeting Scheduled",
  "Proposal Sent",
  "Won",
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

const getScoreGrade = (score?: number) => {
  if (score === undefined || score === null) return { grade: "—", label: "Pending", color: "text-slate-400", bg: "bg-slate-50", border: "border-slate-200" };
  if (score >= 90) return { grade: "A+", label: "Exceptional", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (score >= 80) return { grade: "A", label: "Good", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (score >= 70) return { grade: "B", label: "Average", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" };
  if (score >= 50) return { grade: "C", label: "Needs Work", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" };
  return { grade: "D", label: "High Pitch Potential", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" };
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
  return "border-slate-200 bg-slate-50 text-slate-600";
};

const METRIC_DEFINITIONS: { group: string; items: { name: string; fullName: string; description: string }[] }[] = [
  {
    group: "PageSpeed Metrics",
    items: [
      { name: "LCP", fullName: "Largest Contentful Paint", description: "Measures how long it takes for the largest visible content element on the page to load." },
      { name: "FCP", fullName: "First Contentful Paint", description: "Measures the time it takes for the first piece of content (text, image) to appear on screen." },
      { name: "INP", fullName: "Interaction to Next Paint", description: "Measures how quickly the website responds to user clicks, taps, or key presses." },
      { name: "CLS", fullName: "Cumulative Layout Shift", description: "Measures visual stability by tracking unexpected shifts during page rendering." },
      { name: "TTFB", fullName: "Time to First Byte", description: "Measures server responsiveness before the browser receives the first byte of HTML." },
      { name: "TBT", fullName: "Total Blocking Time", description: "Measures amount of time CPU main thread is blocked before user interaction is possible." },
      { name: "Speed Index", fullName: "Speed Index", description: "Measures how quickly visible elements of a page are visually populated." },
      { name: "TTI", fullName: "Time to Interactive", description: "Measures when the page becomes fully interactive and reliably responds to user input." },
    ],
  },
  {
    group: "Website Speed Metrics",
    items: [
      { name: "Load Time", fullName: "Load Time", description: "The total elapsed duration required for the web page to complete initial loading." },
      { name: "DOM Ready", fullName: "DOM Ready", description: "The time taken for HTML structure to be parsed and fully available in memory." },
      { name: "Fully Loaded", fullName: "Fully Loaded", description: "The timestamp when all assets, images, external scripts, and stylesheets have finished." },
      { name: "Network Idle", fullName: "Network Idle", description: "The point when network traffic stabilizes with no active requests pending." },
    ],
  },
];

export default function LeadDetailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const leadId = searchParams.get("id") as string;

  // Active Main Tab
  const [activeTab, setActiveTab] = useState<"overview" | "audits" | "tech" | "crm" | "contacts">("overview");
  // Active Audit Subtab
  const [auditSubTab, setAuditSubTab] = useState<"performance" | "security" | "seo" | "uiux" | "glossary">("performance");
  // Recommendation priority filter
  const [recFilter, setRecFilter] = useState<string>("all");

  const [noteContent, setNoteContent] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);

  // Live WebSocket progress tracking
  const [liveProgress, setLiveProgress] = useState<{
    stage: string;
    progress: number;
    elapsed: number;
    status: string;
    warnings: string[];
    errors: string[];
  } | null>(null);

  const refreshLeadQueries = useCallback(async (id: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["lead", id], exact: true, refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: ["leadAnalysisSummary", id], exact: true, refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: ["leadAi", id], exact: true, refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: ["leadActivities", id], exact: true, refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: ["leadAnalysisHistory", id], exact: true, refetchType: "active" }),
      queryClient.invalidateQueries({ queryKey: ["leadAnalysisComparison", id], exact: true, refetchType: "active" }),
    ]);
  }, [queryClient]);

  // Main Lead Query
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

  // AI Analysis Summary Query
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

  // Legacy AI Query
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

  // CRM Activities Query
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

  // Real-time WebSocket Listeners
  useEffect(() => {
    if (!leadId) return;

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") || "" : "";
    const wsUrl = `${API_BASE_URL.replace(/^http/, "ws").replace(/\/api\/v1$/, "")}/api/v1/ws/analysis-updates?token=${token}`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error("[LeadDetailWS] Connection error:", e);
      return;
    }

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
            toast.warning("AI Analysis Partially Completed", {
              description: "Analysis finished with minor warnings. Detailed data updated.",
              duration: 5000,
            });
          } else if (wsStatus === "failed") {
            toast.error("AI Analysis Failed", {
              description: "Analysis could not be completed. You can retry anytime.",
              duration: 5000,
            });
          } else {
            toast.success("AI Website Analysis Complete", {
              description: "Fresh intelligence, tech stack, and scores saved successfully.",
              duration: 5000,
            });
          }
        }
      } catch {
        // Ignore malformed websocket frames
      }
    };

    return () => {
      if (ws) {
        if (ws.readyState === 0) {
          ws.onopen = () => ws.close();
        } else {
          ws.close();
        }
      }
    };
  }, [leadId, refreshLeadQueries]);

  // Mutations
  const stageMutation = useMutation({
    mutationFn: async (newStage: string) => api.patch(`/crm/leads/${leadId}/stage`, { stage: newStage }),
    onSuccess: (_, newStage) => {
      toast.success(`Pipeline stage updated to "${newStage}"`);
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leadActivities", leadId] });
    },
    onError: () => toast.error("Failed to update pipeline stage"),
  });

  const noteMutation = useMutation({
    mutationFn: async (content: string) =>
      api.post(`/crm/activities`, { lead_id: leadId, activity_type: "Note Added", description: content }),
    onSuccess: () => {
      setNoteContent("");
      toast.success("Note logged successfully");
      queryClient.invalidateQueries({ queryKey: ["leadActivities", leadId] });
    },
    onError: () => toast.error("Failed to add note"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/leads/${leadId}`);
    },
    onSuccess: () => {
      toast.success("Lead deleted successfully");
      router.push("/dashboard/leads");
    },
    onError: () => toast.error("Failed to delete lead"),
  });

  const singleAnalysisMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/leads/${leadId}/start-analysis`);
      return res.data;
    },
    onSuccess: (data) => {
      if (data && (data.queue_id || data.queueId)) {
        setActiveQueueId(data.queue_id || data.queueId);
        toast.success("Website analysis initiated", {
          description: "Analyzing live pages, SSL certificates, tech stack & speed...",
        });
      } else if (data?.worker_id === "skipped") {
        toast.info("Analysis skipped: Lead has no valid business website URL.");
      } else {
        toast.info("Analysis job queued in background.");
        refreshLeadQueries(leadId);
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || "Failed to start AI analysis.";
      toast.error(msg);
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

  const handleCopy = (text: string, field: string, label = "Copied to clipboard") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(label);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleCopyPitchSummary = () => {
    if (!profile) return;
    const scores = [
      `Overall AI Score: ${numericScore(aiMeta.overall_score ?? aiMeta.overall_ai_score) ?? "N/A"}/100`,
      `Performance Audit: ${numericScore(perfAudit.overallScore) ?? "N/A"}/100`,
      `Security Score: ${numericScore(secAudit.overallScore) ?? "N/A"}/100`,
      `SEO Intelligence: ${numericScore(seoAudit.overallScore) ?? "N/A"}/100`,
    ].join("\n");

    const issues = structuredRecs.slice(0, 5).map((r, i) => `${i + 1}. [${r.priority || "Warning"}] ${r.title || r.recommendation}`).join("\n");

    const text = `
🎯 EXECUTIVE AI AUDIT REPORT: ${profile.name || "Business"}
🌐 Website: ${websiteUrl || "N/A"}
📍 Location: ${[profile.city, profile.state, profile.country].filter(Boolean).join(", ")}
📞 Phone: ${primaryPhone || "N/A"}
✉️ Email: ${primaryEmail || "N/A"}

📊 AUDIT BENCHMARKS:
${scores}

🛠️ TECH STACK:
- CMS: ${display(aiMeta.cms || tech.cms)}
- Frontend: ${display(aiMeta.frontend || tech.frontend_framework || tech.javascript_framework)}
- Hosting: ${display(aiMeta.hosting || tech.hosting)}

💡 TOP AI RECOMMENDATIONS:
${issues || "No critical issues detected."}
    `.trim();

    navigator.clipboard.writeText(text);
    toast.success("Executive pitch summary copied to clipboard!");
  };

  if (leadLoading || analysisLoading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        <div className="h-44 bg-white rounded-3xl border border-slate-200" />
        <div className="h-28 bg-white rounded-2xl border border-slate-200" />
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-8 h-96 bg-white rounded-3xl border border-slate-200" />
          <div className="col-span-4 h-96 bg-white rounded-3xl border border-slate-200" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-md text-center space-y-4">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Lead Record Not Found</h2>
          <p className="text-sm text-slate-500">The lead you are trying to view does not exist or has been deleted.</p>
          <Link
            href="/dashboard/leads"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Leads Directory
          </Link>
        </div>
      </div>
    );
  }

  // Extracted Data Records
  const cd: AnyRecord = profile.contact_discovery || {};
  const wi: AnyRecord = profile.website_information || {};
  const tech: AnyRecord = profile.technology_detection || {};
  const perfAudit: AnyRecord = profile.performanceAudit || {};
  const secAudit: AnyRecord = profile.securityAudit || {};
  const seoAudit: AnyRecord = profile.seoAudit || {};
  const uiuxAudit: AnyRecord = profile.uiuxAudit || {};
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
  const allEmails = uniqueEmails([primaryEmail, ...aiEmails, ...asArray(cd.all_emails), ...asArray(cd.secondary_emails)]);
  const allPhones = uniquePhones([primaryPhone, ...aiPhones, ...asArray(cd.secondary_phones)]);
  const whatsapp = uniquePhones([...aiPhones, ...asArray(cd.whatsapp_numbers), primaryPhone]);
  const address = asOptionalString(aiAddresses[0] || cd.office_address || profile.address);
  const mapsUrl = asOptionalString(aiMeta.google_maps || cd.google_maps || profile.google_maps_url || profile.source_url);

  const structuredRecs = (
    unique([
      ...asArray(aiMeta.recommendations),
      ...asArray(legacyAi?.recommendations),
      ...asArray(legacyAi?.analysis_data?.recommendations),
    ])
      .map(toRecommendation)
      .filter(Boolean) as Recommendation[]
  );

  const filteredRecs = structuredRecs.filter((r) => {
    if (recFilter === "all") return true;
    return (r.priority || "").toLowerCase() === recFilter.toLowerCase();
  });

  const googleMapsHref = mapsUrl || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : undefined);
  const websiteUrl = asOptionalString(profile.website || wi.website_url || wi.final_url || aiMeta.website_url || aiMeta.domain);
  const isProfessional = Boolean(websiteUrl) && (profile.website_type === "PROFESSIONAL_WEBSITE" || !profile.website_type);

  const rawStatus = String(aiMeta.analysis_status || "Pending Analysis").toLowerCase();
  const isAnalyzed = ["completed", "success", "partial_success", "partial success"].includes(rawStatus);

  const overallScoreVal = numericScore(aiMeta.overall_score ?? aiMeta.overall_ai_score);
  const overallGrade = getScoreGrade(overallScoreVal);

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16 pt-4 text-slate-800">
      {/* ── Active Live Analysis Drawer ── */}
      {activeQueueId && (
        <LeadAnalysisDrawer
          isOpen={Boolean(activeQueueId)}
          leadId={leadId}
          initialLead={lead}
          autoStartAnalysis={false}
          onClose={() => setActiveQueueId(null)}
          onAnalysisComplete={async () => {
            await refreshLeadQueries(leadId);
            setActiveQueueId(null);
            toast.success("AI Analysis Completed & Applied!");
          }}
        />
      )}

      <div className="w-full space-y-6 pb-12">
        {/* ── Breadcrumb & Back Row ── */}
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/leads"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-blue-600"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Leads
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="text-slate-400">Lead Detail</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="font-bold text-slate-800 truncate max-w-[220px]">{profile.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-[11px] font-mono text-slate-400">ID: {leadId.slice(-8)}</span>
            <button
              onClick={() => refreshLeadQueries(leadId)}
              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-500 transition shadow-sm"
              title="Refresh lead data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── 1. COMMAND HERO HEADER ── */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            {/* Identity & Badges */}
            <div className="flex items-start gap-4 sm:gap-5 min-w-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-blue-600 text-white font-black text-2xl sm:text-3xl flex items-center justify-center shrink-0 shadow-md shadow-indigo-100 ring-4 ring-indigo-50">
                {(profile.name || "L").charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight break-words">
                    {profile.name || "Untitled Lead"}
                  </h1>

                  {/* Status Badge */}
                  {(() => {
                    let border = "border-slate-200 bg-slate-50 text-slate-700";
                    let icon = <Activity className="w-3.5 h-3.5" />;
                    if (rawStatus === "completed" || rawStatus === "success") {
                      border = "border-emerald-200 bg-emerald-50 text-emerald-700";
                      icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
                    } else if (rawStatus.includes("partial")) {
                      border = "border-amber-200 bg-amber-50 text-amber-700";
                      icon = <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />;
                    } else if (rawStatus === "failed") {
                      border = "border-red-200 bg-red-50 text-red-700";
                      icon = <ShieldAlert className="w-3.5 h-3.5 text-red-600" />;
                    } else if (["started", "running", "collecting", "analyzing"].includes(rawStatus)) {
                      border = "border-blue-200 bg-blue-50 text-blue-700";
                      icon = <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />;
                    }
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${border}`}>
                        {icon} {rawStatus.replace("_", " ")}
                      </span>
                    );
                  })()}

                  {/* Google Rating */}
                  {(profile.google_rating || profile.rating) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {profile.google_rating || profile.rating}
                      {(profile.reviews_count || profile.review_count) && (
                        <span className="text-amber-600/80 font-medium">({profile.reviews_count || profile.review_count})</span>
                      )}
                    </span>
                  )}
                </div>

                {/* Subtitle Chips */}
                <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs font-medium text-slate-500">
                  {profile.category && (
                    <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" /> {profile.category}
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    {[profile.city, profile.state, profile.country].filter(Boolean).join(", ") || "Location Unspecified"}
                  </span>

                  {websiteUrl && (
                    <div className="inline-flex items-center gap-1.5 bg-blue-50/80 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-lg">
                      <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <a href={websiteUrl} target="_blank" rel="noreferrer" className="hover:underline font-semibold max-w-[240px] truncate">
                        {websiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                      </a>
                      <button
                        onClick={() => handleCopy(websiteUrl, "website", "Website URL copied")}
                        className="hover:text-blue-900 transition"
                        title="Copy website URL"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Header Actions Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end border-t lg:border-t-0 pt-4 lg:pt-0">
              {/* Analyze / Re-analyze Button */}
              {isProfessional ? (
                <button
                  onClick={() => singleAnalysisMutation.mutate()}
                  disabled={singleAnalysisMutation.isPending}
                  className="px-4 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-indigo-100 transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {singleAnalysisMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isAnalyzed ? "Re-run AI Analysis" : "Run AI Analysis"}
                </button>
              ) : (
                <span className="px-3 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-semibold">
                  No Professional Website
                </span>
              )}

              {/* Copy Pitch / Audit Summary */}
              <button
                onClick={handleCopyPitchSummary}
                className="px-3.5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs sm:text-sm font-bold text-slate-700 transition shadow-sm flex items-center gap-1.5"
                title="Copy client-ready pitch & audit summary"
              >
                <Share2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Copy Pitch</span>
              </button>

              {/* Quick Contact: Call */}
              {primaryPhone && (
                <a
                  href={`tel:${primaryPhone}`}
                  className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-xl transition shadow-sm"
                  title={`Call ${primaryPhone}`}
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}

              {/* Quick Contact: WhatsApp */}
              {whatsapp[0] && (
                <a
                  href={`https://wa.me/${whatsapp[0].replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-xl transition shadow-sm"
                  title="Chat on WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
              )}

              {/* Quick Contact: Email */}
              {primaryEmail && (
                <a
                  href={`mailto:${primaryEmail}`}
                  className="p-2.5 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-xl transition shadow-sm"
                  title={`Email ${primaryEmail}`}
                >
                  <Mail className="w-4 h-4" />
                </a>
              )}

              {/* Delete Lead */}
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to permanently delete this lead?")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                className="p-2.5 bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded-xl transition shadow-sm"
                title="Delete lead record"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Visual Pipeline Stepper (Commented out per user request) ──
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-600" /> CRM Pipeline Stage
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Current Stage:</span>
                <select
                  value={profile.pipeline_stage || "New Lead"}
                  onChange={(e) => stageMutation.mutate(e.target.value)}
                  className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1 outline-none transition hover:bg-indigo-100 cursor-pointer"
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {PRIMARY_PIPELINE_STEPS.map((step, idx) => {
                const isCurrent = (profile.pipeline_stage || "New Lead") === step;
                const isPast =
                  PIPELINE_STAGES.indexOf(profile.pipeline_stage || "New Lead") >= PIPELINE_STAGES.indexOf(step);

                return (
                  <button
                    key={step}
                    onClick={() => stageMutation.mutate(step)}
                    className={`p-2.5 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
                      isCurrent
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-sm ring-2 ring-indigo-200"
                        : isPast
                        ? "bg-indigo-50/70 border-indigo-200 text-indigo-800 hover:bg-indigo-100"
                        : "bg-slate-50/80 border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold font-mono opacity-80">0{idx + 1}</span>
                      {isCurrent ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      ) : isPast ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-slate-300" />
                      )}
                    </div>
                    <div className="text-xs font-bold truncate">{step}</div>
                  </button>
                );
              })}
            </div>
          </div>
          ── */}
        </div>

        {/* ── 2. LIVE ANALYSIS PROGRESS (Phase 7) ── */}
        {liveProgress && (
          <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 border border-indigo-200 rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 text-white rounded-xl animate-pulse">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Live AI Stage: {liveProgress.stage || "Analyzing Website"}</span>
                    <span className="text-indigo-600 font-mono">({Math.round(liveProgress.progress)}%)</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Elapsed: {liveProgress.elapsed}s · Worker status: {liveProgress.status}
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 bg-white border border-indigo-200 rounded-full text-xs font-bold text-indigo-700 animate-pulse">
                Analyzing Live
              </span>
            </div>

            <div className="w-full bg-indigo-100/60 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-600 to-violet-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(4, Math.min(100, liveProgress.progress))}%` }}
              />
            </div>
          </div>
        )}

        {/* ── 3. EXECUTIVE SCORECARD BANNER ── */}
        {isAnalyzed ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {/* Overall Score */}
            <div className="col-span-2 sm:col-span-1 bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Overall AI Score</span>
                <span className={`px-2 py-0.5 rounded-lg text-xs font-extrabold ${overallGrade.bg} ${overallGrade.color} ${overallGrade.border} border`}>
                  {overallGrade.grade}
                </span>
              </div>
              <div className="my-3 flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
                  {overallScoreVal ?? "—"}
                </span>
                <span className="text-xs text-slate-400 font-bold">/ 100</span>
              </div>
              <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>{overallGrade.label}</span>
              </div>
            </div>

            {/* Performance */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Performance</span>
                <Gauge className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="my-3 flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
                  {numericScore(perfAudit.overallScore) ?? "—"}
                </span>
                <span className="text-xs text-slate-400 font-bold">/ 100</span>
              </div>
              <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>PageSpeed & Vitals</span>
              </div>
            </div>

            {/* Security */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Security</span>
                <ShieldCheck className="w-4 h-4 text-sky-500" />
              </div>
              <div className="my-3 flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
                  {numericScore(secAudit.overallScore) ?? "—"}
                </span>
                <span className="text-xs text-slate-400 font-bold">/ 100</span>
              </div>
              <div className="text-[11px] font-semibold text-sky-700 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>SSL & Headers</span>
              </div>
            </div>

            {/* SEO Intelligence */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">SEO Score</span>
                <Globe className="w-4 h-4 text-amber-500" />
              </div>
              <div className="my-3 flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
                  {numericScore(seoAudit.overallScore) ?? "—"}
                </span>
                <span className="text-xs text-slate-400 font-bold">/ 100</span>
              </div>
              <div className="text-[11px] font-semibold text-amber-700 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Search Visibility</span>
              </div>
            </div>

            {/* UI/UX & Mobile */}
            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">UI / UX</span>
                <Palette className="w-4 h-4 text-violet-500" />
              </div>
              <div className="my-3 flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight">
                  {numericScore(uiuxAudit.overallScore ?? aiMeta.ui_score) ?? "—"}
                </span>
                <span className="text-xs text-slate-400 font-bold">/ 100</span>
              </div>
              <div className="text-[11px] font-semibold text-violet-700 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                <span>Layout & Mobile</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-blue-500/10 border border-indigo-200/80 rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="flex items-center gap-4 text-left">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <Sparkles className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Unlock Complete AI Website Intelligence</h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-xl">
                  Run an instant deep-crawl audit to uncover performance issues, vulnerabilities, SEO gaps, tech stack, and pitch-ready recommendations.
                </p>
              </div>
            </div>
            {isProfessional ? (
              <button
                onClick={() => singleAnalysisMutation.mutate()}
                disabled={singleAnalysisMutation.isPending}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-md transition-all flex items-center gap-2 shrink-0 cursor-pointer"
              >
                {singleAnalysisMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Analyze Website Now
              </button>
            ) : null}
          </div>
        )}

        {/* ── 4. WORKSPACE NAVIGATION TABS ── */}
        <div className="flex border-b border-slate-200 gap-2 overflow-x-auto pb-px">
          {[
            { id: "overview", label: "Overview & Insights", icon: <BarChart3 className="w-4 h-4" /> },
            {
              id: "audits",
              label: "Diagnostic Audits",
              icon: <ShieldCheck className="w-4 h-4" />,
              badge: isAnalyzed ? "4" : undefined,
            },
            {
              id: "tech",
              label: "Tech Stack & Infra",
              icon: <Code className="w-4 h-4" />,
              badge: tech && Object.keys(tech).length > 0 ? "Active" : undefined,
            },
            {
              id: "crm",
              label: "CRM Activities & Notes",
              icon: <Activity className="w-4 h-4" />,
              badge: activities.length ? String(activities.length) : undefined,
            },
            {
              id: "contacts",
              label: "Contacts & Social",
              icon: <User className="w-4 h-4" />,
              badge: String(allEmails.length + allPhones.length),
            },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-3 rounded-t-2xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-white text-indigo-700 border-t-2 border-l border-r border-t-indigo-600 border-slate-200 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── 5. TAB CONTENTS ── */}

        {/* TAB 1: OVERVIEW & INSIGHTS */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-12 gap-6 items-start">
            {/* Left 8-col */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
              {/* Executive Summary Card */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">AI Executive Summary</h3>
                      <p className="text-xs text-slate-500">Autonomous evaluation of sales opportunity & digital maturity</p>
                    </div>
                  </div>
                  {overallGrade.label && (
                    <span className={`px-3 py-1 rounded-xl text-xs font-extrabold border ${overallGrade.bg} ${overallGrade.color} ${overallGrade.border}`}>
                      {overallGrade.label}
                    </span>
                  )}
                </div>

                <p className="text-sm leading-relaxed text-slate-700 font-normal">
                  {(typeof aiMeta.summary === "string" && aiMeta.summary) ||
                    (typeof aiMeta.executive_summary === "string" && aiMeta.executive_summary) ||
                    (isAnalyzed
                      ? `Analysis complete for ${profile.name}. The website demonstrates a digital performance benchmark score of ${overallScoreVal ?? "N/A"}/100 with key opportunities identified below.`
                      : "Run an AI Website Analysis to automatically generate an executive opportunity report, customer pain points, and technical audit.")}
                </p>

                {/* Key Strengths vs Weaknesses Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 space-y-2">
                    <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" /> Key Strengths
                    </div>
                    <ul className="text-xs text-emerald-900/90 space-y-1.5 list-disc pl-4">
                      {isProfessional ? (
                        <>
                          <li>Official domain verified and accessible</li>
                          <li>Mobile responsive viewport present</li>
                          {tech.cms && <li>Built on {String(tech.cms)} CMS architecture</li>}
                        </>
                      ) : (
                        <li>Business listings indexed on search networks</li>
                      )}
                    </ul>
                  </div>

                  <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 space-y-2">
                    <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-600" /> Sales Pitch Opportunities
                    </div>
                    <ul className="text-xs text-amber-900/90 space-y-1.5 list-disc pl-4">
                      {structuredRecs.length > 0 ? (
                        structuredRecs.slice(0, 3).map((r, i) => (
                          <li key={i} className="truncate">
                            {r.title || r.recommendation}
                          </li>
                        ))
                      ) : (
                        <>
                          <li>Modern Core Web Vitals optimization</li>
                          <li>Lead capture conversion triggers & WhatsApp widget</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Actionable Recommendations Card */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Prioritized Action Plan</h3>
                      <p className="text-xs text-slate-500">
                        {filteredRecs.length} actionable improvements identified by AI engine
                      </p>
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
                    {["all", "critical", "high", "medium"].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setRecFilter(lvl)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
                          recFilter === lvl ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredRecs.length > 0 ? (
                  <div className="space-y-3">
                    {filteredRecs.slice(0, 8).map((rec, index) => (
                      <div
                        key={index}
                        className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-200 transition-all space-y-2 group"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {rec.priority && (
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${priorityBadgeClass(rec.priority)}`}>
                                {rec.priority}
                              </span>
                            )}
                            {rec.category && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold uppercase">
                                {rec.category}
                              </span>
                            )}
                          </div>
                          {rec.estimated_benefit && (
                            <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                              <TrendingUp className="w-3.5 h-3.5" /> {rec.estimated_benefit}
                            </span>
                          )}
                        </div>

                        {rec.title && <h4 className="text-sm font-bold text-slate-900">{rec.title}</h4>}
                        {rec.recommendation && (
                          <p className="text-xs text-slate-600 leading-relaxed">{rec.recommendation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-xs italic">
                    No recommendations matching filter "{recFilter}".
                  </div>
                )}
              </div>

              {/* Tech Stack Snapshot */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Code className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Technology Snapshot</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("tech")}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    View All Tech <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">CMS Platform</span>
                    <span className="text-xs font-bold text-slate-800 truncate block">{display(aiMeta.cms || tech.cms)}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Frontend</span>
                    <span className="text-xs font-bold text-slate-800 truncate block">
                      {display(aiMeta.frontend || tech.frontend_framework || tech.javascript_framework)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Web Server</span>
                    <span className="text-xs font-bold text-slate-800 truncate block">
                      {display(aiMeta.backend || tech.server_stack || tech.web_server)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Hosting / Cloud</span>
                    <span className="text-xs font-bold text-slate-800 truncate block">{display(aiMeta.hosting || tech.hosting)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 4-col Sidebar */}
            <div className="col-span-12 lg:col-span-4 space-y-6">
              {/* Quick Contacts Card */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Contact Information</h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-400 font-mono">
                    {allPhones.length + allEmails.length} found
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Primary Phone */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Primary Phone</span>
                      <span className="text-xs font-bold text-slate-900 truncate block">
                        {primaryPhone || "Not Available"}
                      </span>
                    </div>
                    {primaryPhone && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleCopy(primaryPhone, "phone", "Phone copied")}
                          className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-slate-800 transition"
                          title="Copy phone"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={`tel:${primaryPhone}`}
                          className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                          title="Call phone"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Primary Email */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Primary Email</span>
                      <span className="text-xs font-bold text-slate-900 truncate block">
                        {primaryEmail || "Not Available"}
                      </span>
                    </div>
                    {primaryEmail && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleCopy(primaryEmail, "email", "Email copied")}
                          className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-slate-800 transition"
                          title="Copy email"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={`mailto:${primaryEmail}`}
                          className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                          title="Send email"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* WhatsApp */}
                  {whatsapp[0] && (
                    <div className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 block">WhatsApp Ready</span>
                        <span className="text-xs font-bold text-emerald-900 truncate block">{whatsapp[0]}</span>
                      </div>
                      <a
                        href={`https://wa.me/${whatsapp[0].replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-1"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Chat
                      </a>
                    </div>
                  )}

                  {/* Address */}
                  {address && (
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Physical Location</span>
                      <p className="text-xs text-slate-700 leading-relaxed">{address}</p>
                      {googleMapsHref && (
                        <a
                          href={googleMapsHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline pt-1"
                        >
                          Open in Google Maps <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Connected Social Channels */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Social Channels</h3>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name: "Instagram", url: asOptionalString(aiSocialLinks.instagram || social.instagram) },
                    { name: "Facebook", url: asOptionalString(aiSocialLinks.facebook || social.facebook) },
                    { name: "LinkedIn", url: asOptionalString(aiSocialLinks.linkedin || social.linkedin) },
                    { name: "YouTube", url: asOptionalString(aiSocialLinks.youtube || social.youtube) },
                    { name: "Twitter / X", url: asOptionalString(aiSocialLinks.twitter || social.twitter) },
                    { name: "TikTok", url: asOptionalString(aiSocialLinks.tiktok || tiktok.url) },
                  ].map((s) => (
                    <div
                      key={s.name}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                        s.url
                          ? "bg-white border-slate-200 text-slate-800 hover:border-indigo-300"
                          : "bg-slate-50/60 border-slate-100 text-slate-400"
                      }`}
                    >
                      <span className="truncate">{s.name}</span>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DIAGNOSTIC AUDITS */}
        {activeTab === "audits" && (
          <div className="space-y-6">
            {/* Audit Subtab Pills */}
            <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
              {[
                { id: "performance", label: "Performance Audit", icon: <Gauge className="w-4 h-4" /> },
                { id: "security", label: "Security & SSL Audit", icon: <ShieldCheck className="w-4 h-4" /> },
                { id: "seo", label: "SEO Intelligence", icon: <Globe className="w-4 h-4" /> },
                { id: "uiux", label: "UI / UX Intelligence", icon: <Palette className="w-4 h-4" /> },
                { id: "glossary", label: "Metrics Glossary", icon: <HelpCircle className="w-4 h-4" /> },
              ].map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setAuditSubTab(sub.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                    auditSubTab === sub.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {sub.icon}
                  <span>{sub.label}</span>
                </button>
              ))}
            </div>

            {/* Subtab Contents */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
              {auditSubTab === "performance" && (
                <div>
                  {perfAudit && Object.keys(perfAudit).length > 0 ? (
                    <WebsitePerformanceAudit data={perfAudit} />
                  ) : (
                    <div className="text-center py-12 text-slate-400 italic">
                      Performance data has not been audited yet. Click "Run AI Analysis" above.
                    </div>
                  )}
                </div>
              )}

              {auditSubTab === "security" && (
                <div>
                  {secAudit && Object.keys(secAudit).length > 0 ? (
                    <WebsiteSecurityAudit data={secAudit} />
                  ) : (
                    <div className="text-center py-12 text-slate-400 italic">
                      Security audit has not been generated yet.
                    </div>
                  )}
                </div>
              )}

              {auditSubTab === "seo" && (
                <div>
                  {seoAudit && Object.keys(seoAudit).length > 0 ? (
                    <SEOIntelligenceAudit data={seoAudit} />
                  ) : (
                    <div className="text-center py-12 text-slate-400 italic">
                      SEO audit not available yet.
                    </div>
                  )}
                </div>
              )}

              {auditSubTab === "uiux" && (
                <div>
                  {uiuxAudit && Object.keys(uiuxAudit).length > 0 ? (
                    <WebsiteUIUXIntelligence data={uiuxAudit} />
                  ) : (
                    <div className="text-center py-12 text-slate-400 italic">
                      UI/UX evaluation not available yet.
                    </div>
                  )}
                </div>
              )}

              {auditSubTab === "glossary" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Performance & Diagnostic Metrics Reference</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Definitions of industry standard Google Core Web Vitals and PageSpeed metrics.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {METRIC_DEFINITIONS.flatMap((g) => g.items).map((m) => (
                      <div key={m.name} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                        <div className="text-sm font-bold text-slate-900">
                          {m.name} <span className="text-xs font-semibold text-slate-400">({m.fullName})</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{m.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TECH STACK & INFRASTRUCTURE */}
        {activeTab === "tech" && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Detected Web Technologies & Infrastructure</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Frameworks, servers, CMS, libraries, analytics, and advertising scripts detected on {websiteUrl || "website"}.
                </p>
              </div>
            </div>

            {tech && Object.keys(tech).length > 0 ? (
              <WebsiteTechnologyStack data={tech} />
            ) : (
              <div className="text-center py-12 text-slate-400 italic">
                No technology stack detected yet. Run AI Analysis to inspect the web architecture.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CRM ACTIVITIES & NOTES */}
        {activeTab === "crm" && (
          <div className="grid grid-cols-12 gap-6 items-start">
            {/* Note Composer */}
            <div className="col-span-12 lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Log CRM Note or Interaction</h3>
              </div>

              <div className="space-y-3">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Record call summary, meeting notes, customer objections, or next steps..."
                  className="w-full h-36 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none"
                />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">Auto-synced to lead activity timeline</span>
                  <button
                    onClick={() => noteContent.trim() && noteMutation.mutate(noteContent)}
                    disabled={!noteContent.trim() || noteMutation.isPending}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {noteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Save Note
                  </button>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="col-span-12 lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Activity History</h3>
                </div>
                <span className="text-xs font-mono text-slate-400">{activities.length} records</span>
              </div>

              {activities.length > 0 ? (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {activities.map((act: AnyRecord, idx: number) => {
                    const dateStr = asOptionalString(act.created_at);
                    return (
                      <div key={idx} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                            {display(act.activity_type, "Activity")}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {dateStr ? new Date(dateStr).toLocaleString() : ""}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {display(act.description || act.note, "")}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs italic">
                  No interactions logged for this lead yet. Use the note logger to record communications.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: CONTACTS & SOCIAL DIRECTORY */}
        {activeTab === "contacts" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Phone & Email Directory */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <Mail className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Direct Contacts Directory</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Verified Phone Numbers</h4>
                  {allPhones.length > 0 ? (
                    <div className="space-y-2">
                      {allPhones.map((ph, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                          <span className="text-xs font-bold font-mono text-slate-800">{ph}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleCopy(ph, `ph-${idx}`)}
                              className="p-1.5 hover:bg-white rounded-lg text-slate-500 transition"
                              title="Copy"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={`tel:${ph}`}
                              className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No phone numbers discovered.</p>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Verified Email Addresses</h4>
                  {allEmails.length > 0 ? (
                    <div className="space-y-2">
                      {allEmails.map((em, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                          <span className="text-xs font-bold text-slate-800 truncate">{em}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleCopy(em, `em-${idx}`)}
                              className="p-1.5 hover:bg-white rounded-lg text-slate-500 transition"
                              title="Copy"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={`mailto:${em}`}
                              className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No email addresses discovered.</p>
                  )}
                </div>

                {/* Discovered Decision Makers */}
                {aiContacts.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Discovered Team & Roles</h4>
                    <div className="space-y-2">
                      {aiContacts.map((c, idx) => (
                        <div key={idx} className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">{display(c.value)}</span>
                          <span className="text-[10px] font-bold text-indigo-700 uppercase bg-indigo-100/60 px-2 py-0.5 rounded-md">
                            {display(c.type, "Member")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Social Presence & Location */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <Globe className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Social Channels & Presence</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { name: "Instagram", url: asOptionalString(aiSocialLinks.instagram || social.instagram) },
                  { name: "Facebook", url: asOptionalString(aiSocialLinks.facebook || social.facebook) },
                  { name: "LinkedIn", url: asOptionalString(aiSocialLinks.linkedin || social.linkedin) },
                  { name: "Twitter / X", url: asOptionalString(aiSocialLinks.twitter || social.twitter) },
                  { name: "YouTube", url: asOptionalString(aiSocialLinks.youtube || social.youtube) },
                  { name: "TikTok", url: asOptionalString(aiSocialLinks.tiktok || tiktok.url) },
                  { name: "Threads", url: asOptionalString(aiSocialLinks.threads) },
                  { name: "Telegram", url: asOptionalString(aiSocialLinks.telegram) },
                  { name: "GitHub", url: asOptionalString(aiSocialLinks.github) },
                ].map((item) => (
                  <div
                    key={item.name}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                      item.url ? "bg-white border-slate-200 shadow-sm" : "bg-slate-50 border-slate-100 opacity-60"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">{item.name}</span>
                      <span className="text-[10px] text-slate-400 block truncate max-w-[140px]">
                        {item.url ? item.url.replace(/^https?:\/\/(www\.)?/, "") : "Not linked"}
                      </span>
                    </div>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {/* Physical Location Box */}
              {address && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Physical Address</span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{address}</p>
                  {googleMapsHref && (
                    <a
                      href={googleMapsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 pt-1"
                    >
                      Open Google Maps Location <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
