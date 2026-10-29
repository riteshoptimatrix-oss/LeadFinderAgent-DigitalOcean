export interface WorkerState {
  currentLeadIndex: number;
  totalLeads: number;
  currentLeadId: string;
  businessName: string;
  websiteUrl: string;
  stage: string;
  progress: number;
  worker: string;
  seoScore: number;
  perfScore: number;
  uiScore: number;
  uxScore: number;
  secScore: number;
  accScore: number;
  overallScore: number;
  businessOpportunityScore: number;
  socialMediaScore: number;
  mobileScore: number;
  contentScore: number;
  leadIntelligenceScore: number;
  salesOpportunityScore: number;
  emailsFound: number;
  phonesFound: number;
  pagesCrawled: number;
  queueStatus: string;
  pendingJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  queueSize: number;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  time: string;
  message: string;
  stage: string;
  status: "success" | "warning" | "error" | "info";
}

export interface QueueJob {
  id: string;
  lead_id: string;
  business_name: string;
  website_url: string;
  status: string;
  stage: string;
  progress: number;
  worker: string;
  seo_score: number | null;
  emails_discovered: number | null;
  overall_ai_score: number | null;
  elapsed: number;
}
