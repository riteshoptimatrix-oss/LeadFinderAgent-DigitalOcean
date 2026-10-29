'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, TrendingUp, AlertTriangle, Zap, Palette, Shield, Layers, Target } from 'lucide-react';

interface InsightItem {
  label: string;
  count: number;
  percentage: number;
  severity?: string;
  examples?: string[];
}

interface AIInsightsData {
  top_problems: InsightItem[];
  common_seo_issues: InsightItem[];
  common_performance_problems: InsightItem[];
  common_ui_problems: InsightItem[];
  common_security_issues: InsightItem[];
  missing_features: InsightItem[];
  requested_services: InsightItem[];
  avg_business_opportunity: number;
  industry_trends: Array<{ industry: string; count: number; cities: number; countries: number }>;
}

const SEVERITY_COLORS: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  High: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Info: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function InsightBar({ item, maxCount }: { item: InsightItem; maxCount: number }) {
  const [open, setOpen] = useState(false);
  const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;

  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div
        className="flex items-center gap-3 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg px-2 transition"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-800 dark:text-white truncate">{item.label}</span>
            {item.severity && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${SEVERITY_COLORS[item.severity] || SEVERITY_COLORS.Info}`}>
                {item.severity}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600"
              />
            </div>
            <span className="text-[10px] text-slate-400 shrink-0">{item.count} sites · {item.percentage}%</span>
          </div>
        </div>
        {item.examples && item.examples.length > 0 && (
          open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
      </div>
      <AnimatePresence>
        {open && item.examples && item.examples.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-2 pb-2"
          >
            <div className="flex flex-wrap gap-1">
              {item.examples.map((ex, i) => (
                <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded px-1.5 py-0.5 font-mono truncate max-w-[200px]">
                  {ex.replace(/^https?:\/\//, '')}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InsightSection({ title, icon, items, color }: {
  title: string; icon: React.ReactNode; items: InsightItem[]; color: string;
}) {
  const maxCount = Math.max(...items.map(i => i.count), 1);
  return (
    <div className={`rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden shadow-sm`}
      style={{ borderColor: 'rgba(100,116,139,0.15)' }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className={`rounded-lg p-1.5 ${color}`}>{icon}</div>
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h4>
          <p className="text-[10px] text-slate-400">{items.length} issues found</p>
        </div>
      </div>
      <div className="px-3 py-1 max-h-[300px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">No data yet</div>
        ) : (
          items.map((item, i) => <InsightBar key={i} item={item} maxCount={maxCount} />)
        )}
      </div>
    </div>
  );
}

interface AIInsightsProps {
  data: AIInsightsData;
}

export default function AIInsights({ data }: AIInsightsProps) {
  return (
    <div className="space-y-6">
      {/* Summary banner */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 via-purple-700 to-indigo-700 p-5 text-white flex flex-wrap items-center gap-6 shadow-lg">
        <div>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Avg Business Opportunity</p>
          <p className="text-4xl font-black">{data.avg_business_opportunity?.toFixed(1) || 0}<span className="text-xl text-white/50">/100</span></p>
        </div>
        <div className="h-12 w-px bg-white/20" />
        <div>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Top Problem</p>
          <p className="text-base font-bold truncate max-w-[200px]">{data.top_problems[0]?.label || 'None detected'}</p>
          {data.top_problems[0] && <p className="text-xs text-white/60">{data.top_problems[0].count} affected sites</p>}
        </div>
        <div className="h-12 w-px bg-white/20" />
        <div>
          <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Industries Analyzed</p>
          <p className="text-4xl font-black">{data.industry_trends?.length || 0}</p>
        </div>
      </div>

      {/* Insight sections grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <InsightSection
          title="Top Problems"
          icon={<AlertTriangle className="w-4 h-4 text-rose-500" />}
          items={data.top_problems || []}
          color="bg-rose-50 dark:bg-rose-900/20"
        />
        <InsightSection
          title="Common SEO Issues"
          icon={<TrendingUp className="w-4 h-4 text-blue-500" />}
          items={data.common_seo_issues || []}
          color="bg-blue-50 dark:bg-blue-900/20"
        />
        <InsightSection
          title="Performance Problems"
          icon={<Zap className="w-4 h-4 text-amber-500" />}
          items={data.common_performance_problems || []}
          color="bg-amber-50 dark:bg-amber-900/20"
        />
        <InsightSection
          title="UI Problems"
          icon={<Palette className="w-4 h-4 text-pink-500" />}
          items={data.common_ui_problems || []}
          color="bg-pink-50 dark:bg-pink-900/20"
        />
        <InsightSection
          title="Security Issues"
          icon={<Shield className="w-4 h-4 text-red-500" />}
          items={data.common_security_issues || []}
          color="bg-red-50 dark:bg-red-900/20"
        />
        <InsightSection
          title="Missing Features"
          icon={<Layers className="w-4 h-4 text-violet-500" />}
          items={data.missing_features || []}
          color="bg-violet-50 dark:bg-violet-900/20"
        />
        <InsightSection
          title="Requested Services"
          icon={<Target className="w-4 h-4 text-orange-500" />}
          items={data.requested_services || []}
          color="bg-orange-50 dark:bg-orange-900/20"
        />
      </div>

      {/* Industry Trends */}
      {data.industry_trends?.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-sm font-bold text-slate-800 dark:text-white">Industry Trends</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[400px]">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="py-2 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Industry</th>
                  <th className="py-2 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Leads</th>
                  <th className="py-2 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Cities</th>
                  <th className="py-2 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Countries</th>
                </tr>
              </thead>
              <tbody>
                {data.industry_trends.map((trend, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-4 text-xs font-semibold text-slate-800 dark:text-white">{trend.industry}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-400 font-bold">{trend.count}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-500 dark:text-slate-500">{trend.cities}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-500 dark:text-slate-500">{trend.countries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
