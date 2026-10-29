import { Search } from 'lucide-react';
import { cn } from './StatusBadge';

interface SearchBarProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearch?: (value: string) => void;
}

export function SearchBar({ className, onSearch, onChange, ...props }: SearchBarProps) {
  return (
    <div className={cn("relative flex-1 max-w-md", className)}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-[#6B7280]" />
      </div>
      <input
        type="text"
        className="block w-full pl-10 pr-3 py-2 border border-[#E7E5E4] rounded-lg leading-5 bg-white text-[#111827] placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
        onChange={(e) => {
          if (onChange) onChange(e);
          if (onSearch) onSearch(e.target.value);
        }}
        {...props}
      />
    </div>
  );
}
