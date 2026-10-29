import { AlertTriangle, FolderOpen } from 'lucide-react';

interface StateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: StateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-neutral-900/30 border border-[#E7E5E4] border-dashed rounded-2xl">
      <div className="w-12 h-12 rounded-full bg-[#FCFCFA] flex items-center justify-center text-[#6B7280] mb-4">
        <FolderOpen className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-semibold text-[#111827] mb-2">{title}</h3>
      <p className="text-[#6B7280] text-sm max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, description, action }: StateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-red-900/10 border border-red-900/30 rounded-2xl">
      <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center text-red-500 mb-4">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-semibold text-red-400 mb-2">{title}</h3>
      <p className="text-[#6B7280] text-sm max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}
