'use client';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, BarChart2, Grid3X3, Target, Lightbulb, Trophy, Map, FileText,
  RefreshCw, Download, Filter, Search, FileSpreadsheet, FileJson, Loader2
} from 'lucide-react';
import api from '@/src/lib/axios';

import Filters, { FilterState } from '@/src/components/intelligence/Filters';
import AnalyticsCharts from '@/src/components/intelligence/AnalyticsCharts';
import TopOpportunities from '@/src/components/intelligence/TopOpportunities';
import AIInsights from '@/src/components/intelligence/AIInsights';
import Leaderboards from '@/src/components/intelligence/Leaderboards';
import Heatmaps from '@/src/components/intelligence/Heatmaps';
import ReportExport from '@/src/components/intelligence/ReportExport';
import { Overview } from '@/src/components/intelligence/Overview';
import { useIntelligenceWS } from '@/src/components/intelligence/useIntelligenceWS';

const TABS = [
  { key: 'overview', label: 'Overview', icon: BarChart2 },
  { key: 'charts', label: 'Analytics', icon: Grid3X3 },
  { key: 'opportunities', label: 'Top 50s', icon: Target },
  { key: 'insights', label: 'AI Insights', icon: Lightbulb },
  { key: 'leaderboards', label: 'Leaderboards', icon: Trophy },
  { key: 'heatmaps', label: 'Heatmaps', icon: Map },
  { key: 'reports', label: 'Reports', icon: FileText },
];

const EMPTY_FILTERS: FilterState = {
  keyword: '', country: '', state: '', city: '', industry: '',
  technology: '', cms: '',
  min_website_score: '', max_website_score: '',
  min_seo_score: '', max_seo_score: '',
  min_performance_score: '', max_performance_score: '',
  min_opportunity_score: '', max_opportunity_score: '',
  lead_priority: '', date_from: '', date_to: '',
};

const EMPTY_CHARTS = {
  website_score: [], seo_score: [], performance_score: [], ui_score: [], ux_score: [],
  security_score: [], accessibility_score: [], technology: [], cms: [], hosting: [],
  programming_language: [], business_opportunity: [], lead_priority: [], industry: [],
  country: [], state: [], city: []
};

const EMPTY_TOP = {
  highest_opportunity: [], worst_websites: [], best_websites: [],
  fastest_websites: [], slowest_websites: [], highest_seo_problems: [],
  security_risks: [], ui_problems: [], ux_problems: []
};

const EMPTY_INSIGHTS = {
  top_problems: [], common_seo_issues: [], common_performance_problems: [],
  common_ui_problems: [], common_security_issues: [], missing_features: [],
  requested_services: [], avg_business_opportunity: 0, industry_trends: []
};

const EMPTY_LEADERBOARDS = {
  highest_seo: [], lowest_seo: [], highest_performance: [], lowest_performance: [],
  highest_opportunity: [], highest_security: [], lowest_security: [], best_ui: [], worst_ui: []
};

const EMPTY_HEATMAPS = {
  technology_industry: [], industry_score: [], country_opportunity: [],
  country_seo: [], business_opportunity_geo: []
};

const EXPORT_FORMATS = [
  { key: 'csv', label: 'CSV', icon: FileText },
  { key: 'excel', label: 'Excel', icon: FileSpreadsheet },
  { key: 'json', label: 'JSON', icon: FileJson },
] as const;

function filtersToParams(f: FilterState) {
  const params: Record<string, string> = {};
  Object.entries(f).forEach(([k, v]) => { if (v !== '') params[k] = v; });
  return params;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-xl bg-slate-100 animate-pulse ${className}`} />;
}

export default function IntelligencePage() {
  const [tab, setTab] = useState('overview');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [debouncedKeyword, setDebouncedKeyword] = useState(filters.keyword);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(filters.keyword), 350);
    return () => clearTimeout(t);
  }, [filters.keyword]);

  const params = useMemo(
    () => filtersToParams({ ...filters, keyword: debouncedKeyword }),
    [filters, debouncedKeyword]
  );

  // ── Data Queries ──────────────────────────────────────────────────────────
  const { data: kpiData, isLoading: kpiLoading, refetch: refetchKPI } = useQuery({
    queryKey: ['intelligence-kpis', params],
    queryFn: () => api.get('/intelligence/kpis', { params }).then(r => r.data),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: chartsData, isLoading: chartsLoading } = useQuery({
    queryKey: ['intelligence-charts', params],
    queryFn: () => api.get('/intelligence/charts/distributions', { params }).then(r => r.data),
    refetchInterval: 300000,
    staleTime: 120000,
    enabled: tab === 'charts' || tab === 'overview',
  });

  const { data: topData, isLoading: topLoading } = useQuery({
    queryKey: ['intelligence-top-opportunities', params],
    queryFn: () => api.get('/intelligence/top-opportunities', { params }).then(r => r.data),
    staleTime: 120000,
    enabled: tab === 'opportunities',
  });

  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ['intelligence-insights', params],
    queryFn: () => api.get('/intelligence/insights', { params }).then(r => r.data),
    staleTime: 600000,
    enabled: tab === 'insights',
  });

  const { data: leaderboardsData, isLoading: leaderboardsLoading } = useQuery({
    queryKey: ['intelligence-leaderboards'],
    queryFn: () => api.get('/intelligence/leaderboards').then(r => r.data),
    staleTime: 120000,
    enabled: tab === 'leaderboards',
  });

  const { data: heatmapsData, isLoading: heatmapsLoading } = useQuery({
    queryKey: ['intelligence-heatmaps'],
    queryFn: () => api.get('/intelligence/heatmaps').then(r => r.data),
    staleTime: 300000,
    enabled: tab === 'heatmaps',
  });

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const handleWSUpdate = useCallback(() => setLastUpdate(new Date()), []);
  useIntelligenceWS(handleWSUpdate);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleRefresh = () => {
    refetchKPI();
    setRefreshKey(k => k + 1);
    setLastUpdate(new Date());
  };

  const handleExport = async (format: 'csv' | 'excel' | 'json') => {
    setExporting(format);
    setExportOpen(false);
    try {
      const res = await api.get('/intelligence/export', { params: { format }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `intelligence_export.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setExporting(null);
    }
  };

  const handleKeywordChange = (value: string) => setFilters(f => ({ ...f, keyword: value }));

  const goToLeads = () => {
    window.location.href = '/dashboard/leads';
  };

  const headerBtnClass =
    'inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors';

  return (
    <div className="min-h-full bg-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-screen-2xl mx-auto px-6 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <Brain className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 leading-none">
                  AI Analysis
                </h1>
                <p className="text-sm text-slate-500 mt-1.5">
                  Analyze, score and evaluate discovered business leads using AI.
                  {lastUpdate && (
                    <span className="ml-2 text-slate-400">· Updated {lastUpdate.toLocaleTimeString()}</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={handleRefresh}
                className={headerBtnClass}
                aria-label="Refresh data"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportOpen(o => !o)}
                  className={headerBtnClass}
                  aria-label="Export data"
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export
                </button>
                <AnimatePresence>
                  {exportOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      role="menu"
                      className="absolute right-0 top-full mt-2 w-44 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-30"
                    >
                      {EXPORT_FORMATS.map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          type="button"
                          role="menuitem"
                          onClick={() => handleExport(key)}
                          disabled={exporting === key}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Icon className="w-4 h-4 text-slate-400" />
                          {label}
                          {exporting === key && <Loader2 className="w-3.5 h-3.5 ml-auto animate-spin" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                type="button"
                onClick={() => setShowFilters(s => !s)}
                className={`${headerBtnClass} ${showFilters ? 'bg-slate-50 border-blue-200 text-blue-600' : ''}`}
                aria-expanded={showFilters}
              >
                <Filter className="w-4 h-4" />
                Filter
              </button>

              <div className="relative w-56 lg:w-64">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={filters.keyword}
                  onChange={(e) => handleKeywordChange(e.target.value)}
                  placeholder="Search leads..."
                  aria-label="Search leads"
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6 overflow-x-auto no-scrollbar">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors shrink-0 ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Filters panel ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden bg-white border-b border-slate-200"
          >
            <div className="max-w-screen-2xl mx-auto px-6 py-5">
              <Filters filters={filters} onChange={setFilters} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="px-6 py-6 max-w-screen-2xl mx-auto">
        <AnimatePresence mode="wait">
          {tab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Overview
                kpiData={kpiData}
                kpiLoading={kpiLoading}
                websiteScoreDistribution={chartsData?.website_score}
                keyword={debouncedKeyword}
                refreshKey={refreshKey}
                onKeywordChange={handleKeywordChange}
                onAnalyze={goToLeads}
              />
            </motion.div>
          )}

          {tab === 'charts' && (
            <motion.div key="charts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {chartsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[260px]" />)}
                </div>
              ) : (
                <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5">
                  <AnalyticsCharts data={chartsData || EMPTY_CHARTS} />
                </div>
              )}
            </motion.div>
          )}

          {tab === 'opportunities' && (
            <motion.div key="opportunities" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {topLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[200px]" />)}
                </div>
              ) : (
                <TopOpportunities data={topData || EMPTY_TOP} />
              )}
            </motion.div>
          )}

          {tab === 'insights' && (
            <motion.div key="insights" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {insightsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[300px]" />)}
                </div>
              ) : (
                <AIInsights data={insightsData || EMPTY_INSIGHTS} />
              )}
            </motion.div>
          )}

          {tab === 'leaderboards' && (
            <motion.div key="leaderboards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {leaderboardsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-[300px]" />)}
                </div>
              ) : (
                <Leaderboards data={leaderboardsData || EMPTY_LEADERBOARDS} />
              )}
            </motion.div>
          )}

          {tab === 'heatmaps' && (
            <motion.div key="heatmaps" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {heatmapsLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[280px]" />)}
                </div>
              ) : (
                <Heatmaps data={heatmapsData || EMPTY_HEATMAPS} />
              )}
            </motion.div>
          )}

          {tab === 'reports' && (
            <motion.div key="reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <ReportExport isDark={false} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style jsx global>{`
        @media print {
          aside, nav, button, header { display: none !important; }
          body { background: white !important; }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
