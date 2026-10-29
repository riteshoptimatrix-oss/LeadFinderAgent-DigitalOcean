'use client';

import { ReactNode } from 'react';
import { cn } from '@/src/lib/utils';

interface AnalysisCardProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function AnalysisCard({
  title,
  subtitle,
  icon,
  action,
  className,
  bodyClassName,
  children,
}: AnalysisCardProps) {
  return (
    <div className={cn('rounded-xl bg-white border border-slate-200 shadow-sm', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <div className="shrink-0 text-slate-400">{icon}</div>}
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-slate-900 leading-tight">{title}</h3>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </div>
  );
}
