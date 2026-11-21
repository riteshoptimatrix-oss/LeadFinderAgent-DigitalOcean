import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = (status || '').toLowerCase();
  
  let styles = "bg-slate-100 text-black border-slate-300"; // default
  let dotColor = "bg-slate-500";
  
  if (["active", "success", "completed", "delivered", "verified"].includes(normalizedStatus)) {
    styles = "bg-emerald-50 text-black border-emerald-300";
    dotColor = "bg-emerald-600";
  } else if (["pending", "in_progress", "running", "paused", "partially_completed", "partial"].includes(normalizedStatus)) {
    styles = "bg-amber-50 text-black border-amber-300";
    dotColor = "bg-amber-600";
  } else if (["error", "failed", "stopped", "bounced", "suspended", "deactivated", "inactive"].includes(normalizedStatus)) {
    styles = "bg-rose-50 text-black border-rose-300";
    dotColor = "bg-rose-600";
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border text-black shadow-2xs", styles, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)} />
      <span className="text-black font-bold">{status}</span>
    </span>
  );
}
