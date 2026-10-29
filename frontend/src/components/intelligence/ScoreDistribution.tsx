'use client';

import { cn } from '@/src/lib/utils';
import { AnalysisCard } from './AnalysisCard';

export interface DistributionPoint {
  name: string;
  value: number;
  percentage?: number;
  color?: string | null;
}

interface ScoreDistributionProps {
  data?: DistributionPoint[];
}

interface TierDef {
  label: string;
  buckets: string[];
  dot: string;
  bar: string;
}

const TIERS: TierDef[] = [
  { label: 'Excellent', buckets: ['80-100'], dot: 'bg-green-500', bar: 'bg-green-500' },
  { label: 'Good', buckets: ['60-80'], dot: 'bg-blue-500', bar: 'bg-blue-500' },
  { label: 'Average', buckets: ['40-60'], dot: 'bg-orange-400', bar: 'bg-orange-400' },
  { label: 'Poor', buckets: ['0-20', '20-40'], dot: 'bg-red-500', bar: 'bg-red-500' },
];

export function ScoreDistribution({ data }: ScoreDistributionProps) {
  const points = data ?? [];
  const total = points.reduce((sum, p) => sum + (p.value || 0), 0);

  return (
    <AnalysisCard title="AI Score Distribution" subtitle="Website quality scores across analyzed leads">
      <div className="space-y-5">
        {TIERS.map((tier) => {
          const count = points
            .filter((p) => tier.buckets.includes(p.name))
            .reduce((sum, p) => sum + (p.value || 0), 0);
          const percentage = total > 0 ? (count / total) * 100 : 0;

          return (
            <div key={tier.label}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2.5 h-2.5 rounded-full', tier.dot)} />
                  <span className="text-[13px] font-semibold text-slate-700">{tier.label}</span>
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {count.toLocaleString()} leads · {percentage.toFixed(1)}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', tier.bar)}
                  style={{ width: `${Math.min(100, percentage)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </AnalysisCard>
  );
}
