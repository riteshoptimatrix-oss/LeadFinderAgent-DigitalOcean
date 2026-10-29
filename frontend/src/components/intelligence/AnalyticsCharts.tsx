'use client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar, Treemap, LineChart, Line,
  Legend
} from 'recharts';
import { motion } from 'framer-motion';

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
  '#f97316', '#84cc16', '#06b6d4', '#e11d48',
  '#a855f7', '#0ea5e9', '#16a34a', '#dc2626',
];

interface DataPoint { name: string; value: number; percentage?: number; color?: string; }

interface ChartData {
  website_score: DataPoint[];
  seo_score: DataPoint[];
  performance_score: DataPoint[];
  ui_score: DataPoint[];
  ux_score: DataPoint[];
  security_score: DataPoint[];
  accessibility_score: DataPoint[];
  technology: DataPoint[];
  cms: DataPoint[];
  hosting: DataPoint[];
  programming_language: DataPoint[];
  business_opportunity: DataPoint[];
  lead_priority: DataPoint[];
  industry: DataPoint[];
  country: DataPoint[];
  state: DataPoint[];
  city: DataPoint[];
}

// ─────────────── Custom Tooltip ───────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-slate-800 dark:text-white mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="text-xs">
          {p.name}: <span className="font-bold">{p.value}</span>
          {p.payload?.percentage != null && (
            <span className="text-slate-400 ml-1">({p.payload.percentage}%)</span>
          )}
        </p>
      ))}
    </div>
  );
}

// ─────────────── Score Distribution Bar ───────────────
function ScoreDistChart({ title, data, color }: { title: string; data: DataPoint[]; color: string }) {
  const filled = data.length > 0 ? data : [
    { name: '0-20', value: 0 }, { name: '20-40', value: 0 },
    { name: '40-60', value: 0 }, { name: '60-80', value: 0 },
    { name: '80-100', value: 0 },
  ];
  return (
    <div>
      <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{title}</h4>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filled} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={1} />
                <stop offset="100%" stopColor={color} stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(100,116,139,0.15)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" fill={`url(#grad-${title})`} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────── Horizontal Bar ───────────────
function HorizontalBarChart({ title, data, limit = 12 }: { title: string; data: DataPoint[]; limit?: number }) {
  const sliced = [...(data || [])].slice(0, limit);
  return (
    <div>
      <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{title}</h4>
      {sliced.length === 0 ? (
        <div className="h-[160px] flex items-center justify-center text-xs text-slate-400">No data yet</div>
      ) : (
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sliced} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(100,116,139,0.15)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                {sliced.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || PALETTE[index % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─────────────── Pie / Donut Chart ───────────────
function DonutChart({ title, data, limit = 8 }: { title: string; data: DataPoint[]; limit?: number }) {
  const sliced = [...(data || [])].slice(0, limit);
  return (
    <div>
      <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{title}</h4>
      {sliced.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">No data yet</div>
      ) : (
        <div className="h-[180px] flex gap-3">
          <ResponsiveContainer width="60%" height="100%">
            <PieChart>
              <Pie
                data={sliced}
                cx="50%" cy="50%"
                innerRadius={45} outerRadius={70}
                paddingAngle={3}
                dataKey="value"
                animationBegin={0}
                animationDuration={800}
              >
                {sliced.map((entry, index) => (
                  <Cell key={index} fill={entry.color || PALETTE[index % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 flex flex-col justify-center gap-1 overflow-hidden">
            {sliced.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5 min-w-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color || PALETTE[index % PALETTE.length] }} />
                <span className="text-[10px] text-slate-600 dark:text-slate-400 truncate">{entry.name}</span>
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 ml-auto shrink-0">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────── Card Wrapper ───────────────
function ChartCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm ${className}`}
    >
      {children}
    </motion.div>
  );
}

// ─────────────── Main Component ───────────────
interface AnalyticsChartsProps {
  data: ChartData;
}

export default function AnalyticsCharts({ data }: AnalyticsChartsProps) {
  return (
    <div className="space-y-6">
      {/* Section: Score Distributions */}
      <div>
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />
          Score Distributions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <ChartCard>
            <ScoreDistChart title="Website Score" data={data.website_score} color="#6366f1" />
          </ChartCard>
          <ChartCard>
            <ScoreDistChart title="SEO Score" data={data.seo_score} color="#10b981" />
          </ChartCard>
          <ChartCard>
            <ScoreDistChart title="Performance" data={data.performance_score} color="#f59e0b" />
          </ChartCard>
          <ChartCard>
            <ScoreDistChart title="UI Score" data={data.ui_score} color="#ec4899" />
          </ChartCard>
          <ChartCard>
            <ScoreDistChart title="UX Score" data={data.ux_score} color="#8b5cf6" />
          </ChartCard>
          <ChartCard>
            <ScoreDistChart title="Security" data={data.security_score} color="#ef4444" />
          </ChartCard>
          <ChartCard>
            <ScoreDistChart title="Accessibility" data={data.accessibility_score} color="#14b8a6" />
          </ChartCard>
          <ChartCard>
            <ScoreDistChart title="Business Opportunity" data={data.business_opportunity} color="#f97316" />
          </ChartCard>
        </div>
      </div>

      {/* Section: Technology & Platform */}
      <div>
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
          Technology & Platform
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ChartCard>
            <DonutChart title="Technology" data={data.technology} />
          </ChartCard>
          <ChartCard>
            <DonutChart title="CMS" data={data.cms} />
          </ChartCard>
          <ChartCard>
            <DonutChart title="Hosting" data={data.hosting} />
          </ChartCard>
          <ChartCard>
            <DonutChart title="Programming Language" data={data.programming_language} />
          </ChartCard>
        </div>
      </div>

      {/* Section: Geography & Industry */}
      <div>
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          Geography & Industry
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ChartCard>
            <HorizontalBarChart title="Industry Distribution" data={data.industry} />
          </ChartCard>
          <ChartCard>
            <HorizontalBarChart title="Country Distribution" data={data.country} />
          </ChartCard>
          <ChartCard>
            <HorizontalBarChart title="State Distribution" data={data.state} />
          </ChartCard>
          <ChartCard>
            <HorizontalBarChart title="City Distribution" data={data.city} />
          </ChartCard>
          <ChartCard>
            <DonutChart title="Lead Priority" data={data.lead_priority} />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
