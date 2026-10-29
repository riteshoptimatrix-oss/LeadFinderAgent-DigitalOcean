'use client';

import { cn } from '@/src/lib/utils';

export interface ScoreTier {
  label: string;
  text: string;
  bg: string;
  ring: string;
  bar: string;
}

export function getScoreTier(score: number): ScoreTier {
  if (score >= 80) {
    return { label: 'Excellent', text: 'text-green-600', bg: 'bg-green-50', ring: 'ring-green-100', bar: 'bg-green-500' };
  }
  if (score >= 60) {
    return { label: 'Good', text: 'text-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-100', bar: 'bg-blue-500' };
  }
  if (score >= 40) {
    return { label: 'Average', text: 'text-orange-500', bg: 'bg-orange-50', ring: 'ring-orange-100', bar: 'bg-orange-400' };
  }
  return { label: 'Poor', text: 'text-red-600', bg: 'bg-red-50', ring: 'ring-red-100', bar: 'bg-red-500' };
}

interface ScoreBadgeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md';
}

export function ScoreBadge({ score, size = 'sm' }: ScoreBadgeProps) {
  const value = typeof score === 'number' && !isNaN(score) ? Math.round(score) : 0;
  const tier = getScoreTier(value);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-bold ring-1 shrink-0',
        size === 'sm' ? 'gap-1.5 px-2.5 py-1 text-xs' : 'gap-2 px-3.5 py-1.5 text-sm',
        tier.bg,
        tier.text,
        tier.ring
      )}
    >
      {value}
      <span className={cn('font-semibold opacity-80', size === 'md' && 'text-[13px]')}>{tier.label}</span>
    </span>
  );
}
