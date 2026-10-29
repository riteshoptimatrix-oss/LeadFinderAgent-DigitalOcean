'use client';

import { RotateCcw, Search } from 'lucide-react';

export interface OverviewFilters {
  industry: string;
  country: string;
  state: string;
  city: string;
  minScore: string;
  maxScore: string;
  priority: string;
  status: string;
}

export const EMPTY_OVERVIEW_FILTERS: OverviewFilters = {
  industry: '',
  country: '',
  state: '',
  city: '',
  minScore: '',
  maxScore: '',
  priority: '',
  status: '',
};

const PRIORITY_OPTIONS = ['High', 'Normal', 'Low'];
const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'disqualified'];

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  filters: OverviewFilters;
  onChange: (filters: OverviewFilters) => void;
  onReset: () => void;
}

export function FilterBar({ search, onSearchChange, filters, onChange, onReset }: FilterBarProps) {
  const inputClass =
    'h-9 w-full rounded-lg bg-white border border-slate-200 px-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all';
  const selectClass = `${inputClass} cursor-pointer pr-7`;

  const update = (key: keyof OverviewFilters, value: string) => onChange({ ...filters, [key]: value });

  const hasActive =
    search !== '' ||
    Object.values(filters).some((v) => v !== '');

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search business, website, phone..."
              aria-label="Search leads"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        <div className="w-40">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Industry</label>
          <input
            type="text"
            value={filters.industry}
            onChange={(e) => update('industry', e.target.value)}
            placeholder="Restaurant"
            aria-label="Filter by industry"
            className={inputClass}
          />
        </div>

        <div className="w-40">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Country</label>
          <input
            type="text"
            value={filters.country}
            onChange={(e) => update('country', e.target.value)}
            placeholder="United States"
            aria-label="Filter by country"
            className={inputClass}
          />
        </div>

        <div className="w-32">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">State</label>
          <input
            type="text"
            value={filters.state}
            onChange={(e) => update('state', e.target.value)}
            placeholder="California"
            aria-label="Filter by state"
            className={inputClass}
          />
        </div>

        <div className="w-40">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">City</label>
          <input
            type="text"
            value={filters.city}
            onChange={(e) => update('city', e.target.value)}
            placeholder="Los Angeles"
            aria-label="Filter by city"
            className={inputClass}
          />
        </div>

        <div className="w-36">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">AI Score</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={filters.minScore}
              onChange={(e) => update('minScore', e.target.value)}
              placeholder="Min"
              aria-label="Minimum AI score"
              min={0}
              max={100}
              className={`${inputClass} px-2 text-center`}
            />
            <span className="text-slate-300 text-xs">-</span>
            <input
              type="number"
              value={filters.maxScore}
              onChange={(e) => update('maxScore', e.target.value)}
              placeholder="Max"
              aria-label="Maximum AI score"
              min={0}
              max={100}
              className={`${inputClass} px-2 text-center`}
            />
          </div>
        </div>

        <div className="w-32">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Priority</label>
          <select
            value={filters.priority}
            onChange={(e) => update('priority', e.target.value)}
            aria-label="Filter by priority"
            className={selectClass}
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="w-32">
          <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Status</label>
          <select
            value={filters.status}
            onChange={(e) => update('status', e.target.value)}
            aria-label="Filter by status"
            className={selectClass}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {hasActive && (
          <button
            type="button"
            onClick={onReset}
            className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-red-600 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Filters
          </button>
        )}
      </div>
    </div>
  );
}
