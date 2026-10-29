import { Filter } from 'lucide-react';

export function FilterPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 bg-neutral-900/80 border border-[#E7E5E4] rounded-xl mb-6">
      <div className="flex items-center gap-2 mb-4 text-sm font-medium text-[#111827]">
        <Filter className="w-4 h-4" />
        Filters
      </div>
      <div className="flex flex-wrap gap-4 items-end">
        {children}
      </div>
    </div>
  );
}
