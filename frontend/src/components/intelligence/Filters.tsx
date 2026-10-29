'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, X, ChevronDown, ChevronUp, Search, RotateCcw } from 'lucide-react';

export interface FilterState {
  keyword: string;
  country: string;
  state: string;
  city: string;
  industry: string;
  technology: string;
  cms: string;
  min_website_score: string;
  max_website_score: string;
  min_seo_score: string;
  max_seo_score: string;
  min_performance_score: string;
  max_performance_score: string;
  min_opportunity_score: string;
  max_opportunity_score: string;
  lead_priority: string;
  date_from: string;
  date_to: string;
}

const EMPTY_FILTERS: FilterState = {
  keyword: '', country: '', state: '', city: '', industry: '',
  technology: '', cms: '',
  min_website_score: '', max_website_score: '',
  min_seo_score: '', max_seo_score: '',
  min_performance_score: '', max_performance_score: '',
  min_opportunity_score: '', max_opportunity_score: '',
  lead_priority: '',
  date_from: '', date_to: '',
};

const PRIORITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];

interface FiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs px-2 py-0.5 font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-blue-800" aria-label={`Remove ${label}`}>
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

export default function Filters({ filters, onChange }: FiltersProps) {
  const [open, setOpen] = useState(false);

  const update = (key: keyof FilterState, value: string) =>
    onChange({ ...filters, [key]: value });

  const reset = () => onChange(EMPTY_FILTERS);

  const activeFilters = Object.entries(filters).filter(([, v]) => v !== '');

  const inputClass =
    'w-full rounded-lg border px-3 py-2 text-sm bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all';

  const labelClass = 'block text-xs font-semibold mb-1 text-slate-500';

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-1.5">
            <Filter className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">
              Filters
            </span>
            {activeFilters.length > 0 && (
              <span className="rounded-full bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5">
                {activeFilters.length} active
              </span>
            )}
          </div>
          {/* Active filter chips */}
          <div className="hidden sm:flex flex-wrap gap-1">
            {activeFilters.slice(0, 4).map(([key, value]) => (
              <FilterChip
                key={key}
                label={`${key.replace(/_/g, ' ')}: ${value}`}
                onRemove={() => update(key as keyof FilterState, '')}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeFilters.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-rose-500 transition"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {/* Filter panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-slate-100">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 pt-4">
                {/* Keyword */}
                <div className="xl:col-span-2">
                  <label className={labelClass}>Keyword</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      className={inputClass + ' pl-8'}
                      placeholder="Name, website, industry..."
                      value={filters.keyword}
                      onChange={e => update('keyword', e.target.value)}
                    />
                  </div>
                </div>

                {/* Country */}
                <div>
                  <label className={labelClass}>Country</label>
                  <input type="text" className={inputClass} placeholder="United States" value={filters.country} onChange={e => update('country', e.target.value)} />
                </div>

                {/* State */}
                <div>
                  <label className={labelClass}>State</label>
                  <input type="text" className={inputClass} placeholder="California" value={filters.state} onChange={e => update('state', e.target.value)} />
                </div>

                {/* City */}
                <div>
                  <label className={labelClass}>City</label>
                  <input type="text" className={inputClass} placeholder="New York" value={filters.city} onChange={e => update('city', e.target.value)} />
                </div>

                {/* Industry */}
                <div>
                  <label className={labelClass}>Industry</label>
                  <input type="text" className={inputClass} placeholder="Restaurant" value={filters.industry} onChange={e => update('industry', e.target.value)} />
                </div>

                {/* Technology */}
                <div>
                  <label className={labelClass}>Technology</label>
                  <input type="text" className={inputClass} placeholder="WordPress" value={filters.technology} onChange={e => update('technology', e.target.value)} />
                </div>

                {/* CMS */}
                <div>
                  <label className={labelClass}>CMS</label>
                  <input type="text" className={inputClass} placeholder="Shopify" value={filters.cms} onChange={e => update('cms', e.target.value)} />
                </div>

                {/* Lead Priority */}
                <div>
                  <label className={labelClass}>Lead Priority</label>
                  <select className={inputClass} value={filters.lead_priority} onChange={e => update('lead_priority', e.target.value)}>
                    <option value="">All priorities</option>
                    {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                {/* Score ranges */}
                <div>
                  <label className={labelClass}>Website Score (min)</label>
                  <input type="number" className={inputClass} placeholder="0" min={0} max={100} value={filters.min_website_score} onChange={e => update('min_website_score', e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Website Score (max)</label>
                  <input type="number" className={inputClass} placeholder="100" min={0} max={100} value={filters.max_website_score} onChange={e => update('max_website_score', e.target.value)} />
                </div>

                <div>
                  <label className={labelClass}>SEO Score (min)</label>
                  <input type="number" className={inputClass} placeholder="0" min={0} max={100} value={filters.min_seo_score} onChange={e => update('min_seo_score', e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>SEO Score (max)</label>
                  <input type="number" className={inputClass} placeholder="100" min={0} max={100} value={filters.max_seo_score} onChange={e => update('max_seo_score', e.target.value)} />
                </div>

                <div>
                  <label className={labelClass}>Performance (min)</label>
                  <input type="number" className={inputClass} placeholder="0" min={0} max={100} value={filters.min_performance_score} onChange={e => update('min_performance_score', e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Opportunity (min)</label>
                  <input type="number" className={inputClass} placeholder="0" min={0} max={100} value={filters.min_opportunity_score} onChange={e => update('min_opportunity_score', e.target.value)} />
                </div>

                {/* Date range */}
                <div>
                  <label className={labelClass}>Date From</label>
                  <input type="date" className={inputClass} value={filters.date_from} onChange={e => update('date_from', e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Date To</label>
                  <input type="date" className={inputClass} value={filters.date_to} onChange={e => update('date_to', e.target.value)} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
