'use client';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Zap, Shield, Target, Palette, ExternalLink } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  lead_id: string;
  name?: string;
  website?: string;
  score: number;
  city?: string;
  country?: string;
}

interface LeaderboardsData {
  highest_seo: LeaderboardEntry[];
  lowest_seo: LeaderboardEntry[];
  highest_performance: LeaderboardEntry[];
  lowest_performance: LeaderboardEntry[];
  highest_opportunity: LeaderboardEntry[];
  highest_security: LeaderboardEntry[];
  lowest_security: LeaderboardEntry[];
  best_ui: LeaderboardEntry[];
  worst_ui: LeaderboardEntry[];
}

const RANK_COLORS = ['#F59E0B', '#94A3B8', '#CD7F32'];
const RANK_LABELS = ['🥇', '🥈', '🥉'];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return <span className="text-base">{RANK_LABELS[rank - 1]}</span>;
  }
  return (
    <span className="text-xs font-bold text-slate-400 w-6 text-center">#{rank}</span>
  );
}

function ScoreBar({ score, maxScore = 100, color }: { score: number; maxScore?: number; color: string }) {
  const pct = Math.min(100, (score / maxScore) * 100);
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <span className="text-[10px] font-bold shrink-0" style={{ color }}>{score.toFixed(0)}</span>
    </div>
  );
}

function LeaderboardCard({
  title, entries, icon, color, invert = false
}: {
  title: string;
  entries: LeaderboardEntry[];
  icon: React.ReactNode;
  color: string;
  invert?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800"
        style={{ background: `linear-gradient(135deg, ${color}15, transparent)` }}>
        <div className="rounded-lg p-1.5" style={{ background: `${color}20` }}>
          {icon}
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h4>
          <p className="text-[10px] text-slate-400">Top {entries.length}</p>
        </div>
      </div>

      {/* Entries */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {entries.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">No data yet</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.lead_id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
              <div className="w-7 text-center shrink-0">
                <RankBadge rank={entry.rank} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{entry.name || 'Unknown'}</p>
                <div className="flex items-center gap-1">
                  {entry.website && (
                    <a href={entry.website} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-blue-500 hover:underline truncate max-w-[140px]">
                      {entry.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {(entry.city || entry.country) && (
                    <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">
                      · {[entry.city, entry.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
                <ScoreBar score={entry.score} color={invert
                  ? (entry.score <= 30 ? '#10b981' : entry.score <= 60 ? '#f59e0b' : '#ef4444')
                  : color
                } />
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

interface LeaderboardsProps {
  data: LeaderboardsData;
}

export default function Leaderboards({ data }: LeaderboardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <LeaderboardCard
        title="Highest SEO Score"
        entries={data.highest_seo || []}
        icon={<TrendingUp className="w-4 h-4" style={{ color: '#10b981' }} />}
        color="#10b981"
      />
      <LeaderboardCard
        title="Lowest SEO Score"
        entries={data.lowest_seo || []}
        icon={<TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
        color="#ef4444"
        invert
      />
      <LeaderboardCard
        title="Best Performance"
        entries={data.highest_performance || []}
        icon={<Zap className="w-4 h-4" style={{ color: '#f59e0b' }} />}
        color="#f59e0b"
      />
      <LeaderboardCard
        title="Worst Performance"
        entries={data.lowest_performance || []}
        icon={<Zap className="w-4 h-4" style={{ color: '#9ca3af' }} />}
        color="#9ca3af"
        invert
      />
      <LeaderboardCard
        title="Highest Opportunity"
        entries={data.highest_opportunity || []}
        icon={<Target className="w-4 h-4" style={{ color: '#f97316' }} />}
        color="#f97316"
      />
      <LeaderboardCard
        title="Highest Security"
        entries={data.highest_security || []}
        icon={<Shield className="w-4 h-4" style={{ color: '#6366f1' }} />}
        color="#6366f1"
      />
      <LeaderboardCard
        title="Lowest Security"
        entries={data.lowest_security || []}
        icon={<Shield className="w-4 h-4" style={{ color: '#ef4444' }} />}
        color="#ef4444"
        invert
      />
      <LeaderboardCard
        title="Best UI Score"
        entries={data.best_ui || []}
        icon={<Palette className="w-4 h-4" style={{ color: '#ec4899' }} />}
        color="#ec4899"
      />
      <LeaderboardCard
        title="Worst UI Score"
        entries={data.worst_ui || []}
        icon={<Palette className="w-4 h-4" style={{ color: '#94a3b8' }} />}
        color="#94a3b8"
        invert
      />
    </div>
  );
}
