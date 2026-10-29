import { Download, Upload } from 'lucide-react';
import { cn } from './StatusBadge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
}

export function ExportButton({ isLoading, className, children = "Export", ...props }: ButtonProps) {
  return (
    <button
      className={cn("flex items-center gap-2 px-4 py-2 bg-[#FCFCFA] hover:bg-neutral-700 text-[#111827] border border-[#E7E5E4] rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500", className)}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
      {children}
    </button>
  );
}

export function ImportButton({ isLoading, className, children = "Import", ...props }: ButtonProps) {
  return (
    <button
      className={cn("flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-[#111827] rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-900/20", className)}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
      {children}
    </button>
  );
}
