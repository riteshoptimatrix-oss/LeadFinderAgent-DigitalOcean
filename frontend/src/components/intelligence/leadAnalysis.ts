export interface AnalysisLead {
  _id?: string;
  id?: string;
  name?: string;
  business_name?: string;
  category?: string;
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  website?: string;
  phone?: string;
  email?: string;
  google_rating?: number | null;
  status?: string | null;
  priority?: string | null;
  ai_score?: number | null;
  website_score?: number | null;
  lead_score?: number | null;
  tiktok?: {
    found?: boolean | null;
    url?: string | null;
    username?: string | null;
    source_page?: string | null;
    last_checked?: string | null;
  } | null;
  ai_analysis?: {
    analysis_status?: string | null;
    website_score?: number | null;
    seo_score?: number | null;
    performance_score?: number | null;
    ui_score?: number | null;
    ux_score?: number | null;
    security_score?: number | null;
    accessibility_score?: number | null;
    response_time?: number | null;
    ssl?: boolean | null;
    http_status?: number | null;
    recommendations?: string[];
    emails?: string[];
    phones?: string[];
    addresses?: string[];
    cms?: string | null;
    frontend?: string | null;
    backend?: string | null;
    hosting?: string | null;
    analytics?: string | null;
    top_seo_issues?: string[];
    performance_suggestions?: string[];
    business_opportunity?: {
      lead_priority?: string | null;
      estimated_project_value?: number | null;
      recommended_services?: string[];
    } | null;
  } | null;
}

export function getLeadScore(lead: AnalysisLead): number {
  const s = lead?.ai_analysis?.website_score ?? lead?.website_score ?? lead?.ai_score ?? lead?.lead_score;
  return typeof s === 'number' && !isNaN(s) ? s : 0;
}

export function getLeadPriority(lead: AnalysisLead): string {
  const p = lead?.priority ?? lead?.ai_analysis?.business_opportunity?.lead_priority;
  return p || 'Normal';
}

export function getLeadStatus(lead: AnalysisLead): string {
  return lead?.status || lead?.ai_analysis?.analysis_status || 'new';
}

export function getLeadLocation(lead: AnalysisLead): string {
  return [lead?.city, lead?.state, lead?.country].filter(Boolean).join(', ');
}

export function getLeadEmails(lead: AnalysisLead): string[] {
  const fromAnalysis = lead?.ai_analysis?.emails ?? [];
  const fromRoot = lead?.email ? [lead.email] : [];
  return [...new Set([...fromRoot, ...fromAnalysis].filter(Boolean))];
}

export function getLeadPhones(lead: AnalysisLead): string[] {
  const fromAnalysis = lead?.ai_analysis?.phones ?? [];
  const fromRoot = lead?.phone ? [lead.phone] : [];
  return [...new Set([...fromRoot, ...fromAnalysis].filter(Boolean))];
}
