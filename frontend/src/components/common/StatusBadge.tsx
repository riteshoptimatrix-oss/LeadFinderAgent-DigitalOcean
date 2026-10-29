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
  const normalizedStatus = status.toLowerCase();
  
  let styles = "bg-[#FCFCFA] text-[#111827] border-[#E7E5E4]"; // default
  
  if (["active", "success", "completed", "delivered", "verified"].includes(normalizedStatus)) {
    styles = "bg-emerald-900/30 text-emerald-400 border-emerald-900/50";
  } else if (["pending", "in_progress", "running", "paused"].includes(normalizedStatus)) {
    styles = "bg-amber-900/30 text-amber-400 border-amber-900/50";
  } else if (["error", "failed", "stopped", "bounced"].includes(normalizedStatus)) {
    styles = "bg-red-900/30 text-red-400 border-red-900/50";
  }

  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", styles, className)}>
      {status}
    </span>
  );
}
