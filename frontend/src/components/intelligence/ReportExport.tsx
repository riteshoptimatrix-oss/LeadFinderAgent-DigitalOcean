'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText, FileSpreadsheet, FileJson, Printer, Calendar, CheckCircle, Loader2 } from 'lucide-react';
import api from '@/src/lib/axios';

const PERIODS = [
  { key: 'daily', label: 'Daily', desc: 'Last 24 hours' },
  { key: 'weekly', label: 'Weekly', desc: 'Last 7 days' },
  { key: 'monthly', label: 'Monthly', desc: 'Last 30 days' },
  { key: 'yearly', label: 'Yearly', desc: 'Last 365 days' },
  { key: 'custom', label: 'Custom', desc: 'Pick date range' },
];

const FORMATS = [
  { key: 'csv', label: 'CSV', icon: <FileText className="w-4 h-4" />, color: 'text-green-600' },
  { key: 'excel', label: 'Excel', icon: <FileSpreadsheet className="w-4 h-4" />, color: 'text-emerald-600' },
  { key: 'json', label: 'JSON', icon: <FileJson className="w-4 h-4" />, color: 'text-blue-600' },
  { key: 'pdf', label: 'PDF', icon: <Printer className="w-4 h-4" />, color: 'text-rose-600' },
];

interface ReportSummary {
  period: string;
  date_from?: string;
  date_to?: string;
  kpis: {
    total_leads: number;
    analyzed_leads: number;
    avg_website_score: number;
    avg_seo_score: number;
    avg_business_opportunity_score: number;
  };
  top_opportunities: Array<{ name?: string; website?: string; business_opportunity_score?: number }>;
  top_insights: Array<{ label: string; count: number }>;
  generated_at: string;
}

interface ReportExportProps {
  isDark?: boolean;
}

export default function ReportExport({ isDark }: ReportExportProps) {
  const [period, setPeriod] = useState('monthly');
  const [format, setFormat] = useState('csv');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [success, setSuccess] = useState(false);

  const baseClass = `rounded-xl border px-4 py-2.5 text-sm font-semibold transition cursor-pointer`;
  const activeClass = `bg-violet-600 text-white border-violet-600 shadow-md`;
  const inactiveClass = isDark
    ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50';

  const inputClass = `rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition
    ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`;

  async function generateReport() {
    setLoading(true);
    try {
      const params: Record<string, string> = { period };
      if (period === 'custom') {
        if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
        if (dateTo) params.date_to = new Date(dateTo).toISOString();
      }
      const { data } = await api.get('/intelligence/reports', { params });
      setReportData(data);
    } catch (e) {
      console.error('Report generation failed', e);
    } finally {
      setLoading(false);
    }
  }

  async function exportData() {
    if (format === 'pdf') {
      window.print();
      return;
    }
    setExporting(true);
    try {
      const response = await api.get('/intelligence/export', {
        params: { format },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'excel' ? 'xlsx' : format;
      a.download = `intelligence_${period}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border p-6 shadow-sm ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <h3 className={`text-base font-bold mb-5 ${isDark ? 'text-white' : 'text-slate-800'}`}>
          Executive Report Generator
        </h3>

        {/* Period Selector */}
        <div className="mb-5">
          <label className={`block text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Report Period
          </label>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`${baseClass} ${period === p.key ? activeClass : inactiveClass} flex flex-col items-start gap-0`}
              >
                <span>{p.label}</span>
                <span className="text-[10px] font-normal opacity-60">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range */}
        <AnimatePresence>
          {period === 'custom' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-5"
            >
              <div className="flex gap-3 flex-wrap pt-1">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <Calendar className="w-3 h-3 inline mr-1" />From
                  </label>
                  <input type="date" className={inputClass} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <Calendar className="w-3 h-3 inline mr-1" />To
                  </label>
                  <input type="date" className={inputClass} value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generate Button */}
        <button
          onClick={generateReport}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 text-sm font-bold transition disabled:opacity-60 mb-6"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          Generate Report Preview
        </button>

        {/* Report Preview */}
        <AnimatePresence>
          {reportData && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`rounded-2xl p-5 mb-6 border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                    {reportData.period.charAt(0).toUpperCase() + reportData.period.slice(1)} Report Preview
                  </h4>
                  {reportData.date_from && (
                    <p className="text-xs text-slate-400">
                      {reportData.date_from} → {reportData.date_to}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-slate-400">
                  Generated {new Date(reportData.generated_at).toLocaleTimeString()}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                {[
                  { label: 'Total Leads', value: reportData.kpis.total_leads },
                  { label: 'Analyzed', value: reportData.kpis.analyzed_leads },
                  { label: 'Avg Website', value: `${reportData.kpis.avg_website_score?.toFixed(1)}/100` },
                  { label: 'Avg SEO', value: `${reportData.kpis.avg_seo_score?.toFixed(1)}/100` },
                  { label: 'Avg Opportunity', value: `${reportData.kpis.avg_business_opportunity_score?.toFixed(1)}/100` },
                ].map(kpi => (
                  <div key={kpi.label} className={`rounded-xl p-3 text-center ${isDark ? 'bg-slate-700' : 'bg-white'} border ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                    <p className="text-lg font-black text-violet-600">{kpi.value}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {reportData.top_insights.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Top Issues This Period</p>
                  <div className="flex flex-wrap gap-2">
                    {reportData.top_insights.slice(0, 5).map((ins, i) => (
                      <span key={i} className="text-[10px] bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full px-2 py-0.5 font-medium">
                        {ins.label} ({ins.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Export Section */}
        <div className={`border-t pt-5 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <label className={`block text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Export Format
          </label>
          <div className="flex flex-wrap gap-2 mb-4">
            {FORMATS.map(f => (
              <button
                key={f.key}
                onClick={() => setFormat(f.key)}
                className={`${baseClass} flex items-center gap-1.5 ${format === f.key ? activeClass : inactiveClass}`}
              >
                <span className={format === f.key ? 'text-white' : f.color}>{f.icon}</span>
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={exportData}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-bold transition disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : success ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {success ? 'Downloaded!' : `Export as ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
