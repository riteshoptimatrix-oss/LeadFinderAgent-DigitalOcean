'use client';

import { cn } from '@/src/lib/utils';

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('rounded-lg bg-slate-100 animate-pulse', className)} />;
}

export function SkeletonLoader() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-8 w-8 rounded-lg" />
              <SkeletonBlock className="h-4 w-10" />
            </div>
            <SkeletonBlock className="h-8 w-24" />
            <SkeletonBlock className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Score distribution + sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-xl bg-white border border-slate-200 shadow-sm p-5 space-y-3">
          <SkeletonBlock className="h-5 w-40" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 py-2">
              <div className="flex items-center justify-between">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-3 w-24" />
              </div>
              <SkeletonBlock className="h-2.5 w-full" />
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5 space-y-3">
          <SkeletonBlock className="h-5 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          <SkeletonBlock className="h-5 w-48" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-8 w-28 rounded-md" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <SkeletonBlock className="h-9 w-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-3.5 w-1/3" />
                <SkeletonBlock className="h-3 w-1/4" />
              </div>
              <SkeletonBlock className="h-4 w-20" />
              <SkeletonBlock className="h-5 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
