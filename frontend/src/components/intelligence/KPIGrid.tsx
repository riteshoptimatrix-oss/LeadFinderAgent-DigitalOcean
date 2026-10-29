'use client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Globe, Mail, Phone, TrendingUp, Zap, Shield,
  Eye, Palette, Target, Star, CheckCircle, Clock, XCircle,
  BarChart2, Activity
} from 'lucide-react';

export interface KPIData {
  total_leads: number;
  analyzed_leads: number;
  pending_analysis: number;
  failed_analysis: number;
  total_websites: number;
  websites_with_email: number;
  websites_without_email: number;
  websites_with_phone: number;
  websites_without_phone: number;
  avg_website_score: number;
  avg_seo_score: number;
  avg_performance_score: number;
  avg_ui_score: number;
  avg_ux_score: number;
  avg_security_score: number;
  avg_accessibility_score: number;
  avg_business_opportunity_score: number;
  avg_lead_priority: number;
}

interface KPICardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  suffix?: string;
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
  isScore?: boolean;
  updated?: boolean;
}

function ScoreRing({ score }: { score: number }) {
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const dash = (score / 100) * circ;
  const color =
    score >= 80 ? '#10b981' :
    score >= 60 ? '#3b82f6' :
    score >= 40 ? '#f59e0b' :
    score >= 20 ? '#f97316' : '#ef4444';

  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="4" />
      <circle
        cx="24" cy="24" r={radius}
        fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
        style={{ transition: 'stroke-dasharray 1s ease' }}
      />
      <text x="24" y="28" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">
        {Math.round(score)}
      </text>
    </svg>
  );
}

function KPICard({ title, value, icon, isScore, description, updated }: KPICardProps) {
  const numVal = typeof value === 'number' ? value : parseFloat(value as string) || 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl p-5 bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
    >
      <AnimatePresence>
        {updated && (
          <motion.div
            key="pulse"
            initial={{ opacity: 0.3, scale: 1 }}
            animate={{ opacity: 0, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 rounded-2xl bg-blue-500/10 pointer-events-none"
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-500 mb-1.5 whitespace-normal leading-tight">{title}</p>
          {isScore ? (
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {numVal.toFixed(1)}
              </span>
              <span className="text-slate-400 text-xs font-semibold">/100</span>
            </div>
          ) : (
            <p className="text-2xl font-bold text-slate-900 tracking-tight">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
          )}
          {description && <p className="text-[11px] font-medium text-slate-400 mt-2 line-clamp-1">{description}</p>}
        </div>
        <div className="shrink-0 flex items-center justify-center">
          {isScore ? (
            <ScoreRing score={numVal} />
          ) : (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 shadow-sm">
              {icon}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface KPIGridProps {
  data: KPIData;
  updatedFields?: Set<string>;
}

export default function KPIGrid({ data, updatedFields = new Set() }: KPIGridProps) {
  const cards: KPICardProps[] = [
    {
      title: 'Total Leads',
      value: data.total_leads,
      icon: <Users className="w-5 h-5 text-indigo-600" />,
      description: 'All discovered leads',
    },
    {
      title: 'Analyzed',
      value: data.analyzed_leads,
      icon: <CheckCircle className="w-5 h-5 text-emerald-600" />,
      description: 'Fully analyzed leads',
    },
    {
      title: 'Pending',
      value: data.pending_analysis,
      icon: <Clock className="w-5 h-5 text-amber-500" />,
      description: 'Awaiting analysis',
    },
    {
      title: 'Failed',
      value: data.failed_analysis,
      icon: <XCircle className="w-5 h-5 text-rose-600" />,
      description: 'Analysis failures',
    },
    {
      title: 'Websites',
      value: data.total_websites,
      icon: <Globe className="w-5 h-5 text-blue-600" />,
      description: 'With website URL',
    },
    {
      title: 'With Email',
      value: data.websites_with_email,
      icon: <Mail className="w-5 h-5 text-sky-500" />,
      description: 'Email discovered',
    },
    {
      title: 'No Email',
      value: data.websites_without_email,
      icon: <Mail className="w-5 h-5 text-slate-400" />,
      description: 'Email not found',
    },
    {
      title: 'With Phone',
      value: data.websites_with_phone,
      icon: <Phone className="w-5 h-5 text-violet-600" />,
      description: 'Phone discovered',
    },
    {
      title: 'No Phone',
      value: data.websites_without_phone,
      icon: <Phone className="w-5 h-5 text-slate-400" />,
      description: 'Phone not found',
    },
    {
      title: 'Avg Website Score',
      value: data.avg_website_score,
      icon: <BarChart2 className="w-5 h-5 text-indigo-500" />,
      isScore: true,
    },
    {
      title: 'Avg SEO Score',
      value: data.avg_seo_score,
      icon: <TrendingUp className="w-5 h-5 text-emerald-500" />,
      isScore: true,
    },
    {
      title: 'Avg Performance',
      value: data.avg_performance_score,
      icon: <Zap className="w-5 h-5 text-amber-500" />,
      isScore: true,
    },
    {
      title: 'Avg UI Score',
      value: data.avg_ui_score,
      icon: <Palette className="w-5 h-5 text-rose-500" />,
      isScore: true,
    },
    {
      title: 'Avg UX Score',
      value: data.avg_ux_score,
      icon: <Activity className="w-5 h-5 text-fuchsia-500" />,
      isScore: true,
    },
    {
      title: 'Avg Security',
      value: data.avg_security_score,
      icon: <Shield className="w-5 h-5 text-red-500" />,
      isScore: true,
    },
    {
      title: 'Avg Accessibility',
      value: data.avg_accessibility_score,
      icon: <Eye className="w-5 h-5 text-teal-500" />,
      isScore: true,
    },
    {
      title: 'Avg Opportunity',
      value: data.avg_business_opportunity_score,
      icon: <Target className="w-5 h-5 text-orange-500" />,
      isScore: true,
    },
    {
      title: 'Avg Lead Priority',
      value: data.avg_lead_priority,
      icon: <Star className="w-5 h-5 text-violet-500" />,
      isScore: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
      {cards.map((card, i) => (
        <KPICard key={card.title} {...card} updated={updatedFields.has(card.title)} />
      ))}
    </div>
  );
}
