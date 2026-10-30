'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import {
  Loader2,
  Search,
  History,
  MapPin,
  SlidersHorizontal,
  Settings2,
  ChevronDown,
  X,
  Sparkles,
  Globe,
  Building2,
  ListChecks
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/src/components/common/DataTable';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { PageHeader } from '@/src/components/common/PageHeader';
import { Country, State, City } from 'country-state-city';

const searchSchema = z.object({
  keyword: z.string().min(2, 'Keyword must be at least 2 characters'),
  country: z.string().min(2, 'Country is required'),
  state: z.string().min(1, 'State is required'),
  city: z.string().min(1, 'City is required'),
  area: z.string().optional(),
  provider: z.string().min(1, 'Provider is required'),
  target_cap: z.string().optional(),
  max_leads: z.any().optional(),
  exhaustive: z.boolean().optional(),
  grid_size: z.any().optional()
});

type SearchFormValues = z.infer<typeof searchSchema>;

// Ahmedabad (GJ, IN) localities used as a curated area dropdown instead of the
// free-text Area field whenever India > Gujarat > Ahmedabad is selected.
const AHMEDABAD_LOCALITIES = [
  'Naroda', 'Nikol', 'Odhav', 'Satellite', 'Prahlad Nagar', 'Vastral', 'Bopal',
  'South Bopal (SoBo)', 'Shela', 'Shilaj', 'Thaltej', 'Bodakdev', 'Vastrapur',
  'Navrangpura', 'Naranpura', 'Memnagar', 'Gurukul', 'Ghatlodiya', 'Gota', 'Sola',
  'Science City', 'Bhadaj', 'Ognaj', 'Chandlodiya', 'Chanakyapuri', 'Sabarmati',
  'Ranip', 'New Ranip', 'Motera', 'Chandkheda', 'Tragad', 'Zundal', 'Shahibaug',
  'Camp Area', 'Asarwa', 'Meghaninagar', 'Dudheshwar', 'Madhupura', 'Subhash Bridge',
  'Usmanpura', 'Paldi', 'Ambawadi', 'Law Garden', 'CG Road', 'Ellisbridge',
  'Mithakhali', 'Gulbai Tekra', 'Panjrapole', 'Nehrunagar', 'Jivraj Park', 'Vasna',
  'Vejalpur', 'Anandnagar', 'Shyamal', 'Jodhpur Tekra', 'Makarba', 'Sarkhej',
  'Juhapura', 'Maktampura', 'Sanathal', 'Moraiya', 'Changodar', 'Bapunagar',
  'India Colony', 'Thakkarbapanagar', 'Saijpur Bogha', 'Kubernagar', 'Sardarnagar',
  'Hansol', 'Kathwada', 'Singarva', 'Ramol', 'Hathijan', 'Vinzol', 'Amraiwadi',
  'Gomtipur', 'Rakhial', 'Saraspur', 'Viratnagar', 'Bhaipura', 'Hatkeshwar',
  'Khokhra', 'CTM', 'Jasoda Nagar', 'Maninagar', 'Kankaria', 'Ghodasar', 'Isanpur',
  'Vatva', 'Narol', 'Lambha', 'Danilimda', 'Behrampura', 'Kalupur', 'Shahpur',
  'Dariyapur', 'Jamalpur', 'Khadia', 'Astodia', 'Lal Darwaja'
];

// Abrama (GJ, IN) localities — curated dropdown whenever India > Gujarat > Abrama.
const ABRAMA_LOCALITIES = [
  'Abrama Main Bazaar', 'Child Tracking System', 'Khara Abrama', 'Wikipedia',
  'Abrama Station Road', 'Vachhla Falia', 'Bhagda Falia', 'Halpati Falia',
  'Desai Falia', 'Patel Falia', 'Tandalja Road Pocket', 'Shanti Nagar',
  'Kranti Nagar', 'Ambika Nagar', 'Radha Krishna Society Area',
  'Pramukh Green Enclave', 'Sai Krupa Housing Pocket', 'Madhav Vihar Layout',
  'Krishna Avenue', 'Soham Villa Zone', 'Housing', 'Kedar Heights Area',
  'Shriram Nagar', 'New Abrama Extension', 'Old Abrama Gam (Village Core)',
  'Dudhiya Talav Connector Road Area', 'Jalalpore Link Road Pocket',
  'College Road Area (near Abrama Technical & Agricultural Institute)',
  'School Falia', 'Pipeline Road Area', 'Salt Pan Area (Historical Salt Bed Zones)',
  'Canal Road Pocket', 'Vashier Valley Connector Area'
];

// Adalaj (GJ, IN) localities — curated dropdown whenever India > Gujarat > Adalaj.
const ADALAJ_LOCALITIES = [
  'Adalaj Gam (Old Village Core)', 'Adalaj Stepwell (Vav) Area',
  'Trimandir Campus Area', 'Adalaj Chokdi (Cross Roads)',
  'SG Highway – Adalaj Corridor', 'Gandhinagar – Ahmedabad Highway Belt',
  'Por Road Area', 'Koba – Adalaj Link Road Area', 'Jamiyatpura Road Belt',
  'Adalaj Station Road Area', 'Canal Road Pocket', 'Patel Falia', 'Rabari Vas',
  'Thakor Vas', 'Prajapati Vas', 'Vankar Vas', 'Brahmin Falia', 'Devipujak Vas',
  'Old Panchayat Office Area', 'Swaminarayan Mandir Belt', 'Shree Ram Nagar Area',
  'Ambika Nagar Area', 'Sai Baba Nagar Area', 'Shiv Shakti Nagar Area',
  'Tirupati Housing Belt', 'Siddhi Vinayak Zone', 'Trimandir Enclaves Zone',
  'Adalaj Industrial Belt (GIDC Pocket)', 'NH-147 Warehousing Zone',
  'Sughad – Adalaj Border Area', 'Koteshwar Link Belt', 'Shertha Road Outer Pocket',
  'Zundal – Adalaj Extension Belt', 'Kudasan Link Corridor', 'Sargasan Approach Area'
];

// Curated locality dropdown per city (GJ, IN). Only these cities unlock it;
// every other city keeps the plain free-text Area field.
const LOCALITY_MAP: Record<string, string[]> = {
  'Ahmedabad': AHMEDABAD_LOCALITIES,
  'Abrama': ABRAMA_LOCALITIES,
  'Adalaj': ADALAJ_LOCALITIES,
};

function getUnicodeFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "";
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch (e) {
    return "";
  }
}

// Searchable Select (Combobox) component with performance optimizations for large lists
interface SearchableSelectProps {
  options: { label: string; value: string; icon?: string }[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  disabled?: boolean;
  error?: string;
  label?: string;
  required?: boolean;
}

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  label,
  required = false
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options
  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return options.filter(opt =>
      opt.label.toLowerCase().includes(lower) ||
      opt.value.toLowerCase().includes(lower)
    );
  }, [options, search]);

  // Limit rendering for large sets
  const displayedOptions = useMemo(() => {
    return filtered.slice(0, 100);
  }, [filtered]);

  const selectedOption = useMemo(() => {
    return options.find(opt => opt.value === value);
  }, [options, value]);

  // Reset search and set initial focus index when opening
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      const idx = options.findIndex(opt => opt.value === value);
      setFocusedIndex(idx >= 0 ? idx : 0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, value, options]);

  // Keyboard navigation support
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        setFocusedIndex(prev => (prev < displayedOptions.length - 1 ? prev + 1 : 0));
        e.preventDefault();
        break;
      case 'ArrowUp':
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : displayedOptions.length - 1));
        e.preventDefault();
        break;
      case 'Enter':
        if (focusedIndex >= 0 && focusedIndex < displayedOptions.length) {
          onChange(displayedOptions[focusedIndex].value);
          setIsOpen(false);
        }
        e.preventDefault();
        break;
      case 'Escape':
        setIsOpen(false);
        e.preventDefault();
        break;
      case 'Tab':
        setIsOpen(false);
        break;
      case 'Home':
        setFocusedIndex(0);
        e.preventDefault();
        break;
      case 'End':
        setFocusedIndex(displayedOptions.length - 1);
        e.preventDefault();
        break;
      default:
        break;
    }
  };

  // Scroll focused element into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[focusedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [focusedIndex]);

  return (
    <div
      className="space-y-2 relative w-full"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {label && (
        <label className="block text-sm font-semibold text-slate-800">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={`w-full px-4 py-3 bg-white border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm text-left flex items-center justify-between transition-all disabled:opacity-60 disabled:bg-slate-50 cursor-pointer ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-slate-300'
            }`}
        >
          <span className={selectedOption ? 'text-slate-900 font-medium' : 'text-slate-400'}>
            {selectedOption ? (
              <span className="flex items-center gap-2">
                {selectedOption.icon && <span className="text-lg shrink-0 flag-emoji">{selectedOption.icon}</span>}
                <span className="truncate">{selectedOption.label}</span>
              </span>
            ) : (
              placeholder
            )}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
            {/* Search Input */}
            <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
              <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
              <input
                type="text"
                autoFocus
                placeholder="🔍 Search Country..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFocusedIndex(0);
                }}
                className="w-full bg-transparent border-0 py-1 px-1 text-sm outline-none text-slate-900 placeholder:text-slate-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFocusedIndex(0);
                  }}
                  className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Options List */}
            <ul
              ref={listRef}
              role="listbox"
              className="max-h-60 overflow-y-auto py-1"
            >
              {displayedOptions.length > 0 ? (
                displayedOptions.map((opt, index) => (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={opt.value === value}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                      onMouseEnter={() => setFocusedIndex(index)}
                      className={`w-full px-4 py-2.5 text-sm text-left flex items-center gap-2 transition-colors cursor-pointer ${index === focusedIndex
                        ? 'bg-slate-100 text-slate-900 font-bold'
                        : opt.value === value
                          ? 'bg-slate-50 text-slate-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      {opt.icon && <span className="text-lg shrink-0 flag-emoji">{opt.icon}</span>}
                      <span className="truncate">{opt.label}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-4 py-3 text-sm text-slate-400 text-center">
                  No matching options found
                </li>
              )}
              {filtered.length > 100 && (
                <li className="px-4 py-2 text-[10px] text-slate-400 bg-slate-50 text-center border-t border-slate-100 sticky bottom-0">
                  Showing first 100 of {filtered.length} results. Refine search input.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}

export default function SearchPage() {
  const router = useRouter();

  const { register, handleSubmit, control, watch, setValue, formState: { errors, isValid } } = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    mode: 'onChange',
    defaultValues: {
      provider: 'Google Maps',
      target_cap: 'SMALL_MEDIUM_CAP',
      exhaustive: false,
      grid_size: 3
    }
  });

  const selectedCountryCode = watch('country');
  const selectedStateCode = watch('state');
  const watchKeyword = watch('keyword');
  const watchProvider = watch('provider');
  const watchTargetCap = watch('target_cap');
  const watchArea = watch('area');
  const watchMaxLeads = watch('max_leads');
  const watchCity = watch('city');
  const watchExhaustive = watch('exhaustive');
  const watchGridSize = watch('grid_size');

  const [countries, setCountries] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);

  useEffect(() => {
    setCountries(Country.getAllCountries());
  }, []);

  useEffect(() => {
    if (selectedCountryCode) {
      setStates(State.getStatesOfCountry(selectedCountryCode));
      setValue('state', '');
      setValue('city', '');
    } else {
      setStates([]);
    }
  }, [selectedCountryCode, setValue]);

  useEffect(() => {
    if (selectedCountryCode && selectedStateCode) {
      setCities(City.getCitiesOfState(selectedCountryCode, selectedStateCode));
      setValue('city', '');
    } else {
      setCities([]);
    }
  }, [selectedCountryCode, selectedStateCode, setValue]);

  // Form options conversion
  const countryOptions = useMemo(() => {
    return countries.map((c) => ({
      label: c.name,
      value: c.isoCode,
      icon: getUnicodeFlag(c.isoCode) || c.flag
    }));
  }, [countries]);

  const stateOptions = useMemo(() => {
    return states.map((s) => ({
      label: s.name,
      value: s.isoCode
    }));
  }, [states]);

  const cityOptions = useMemo(() => {
    return cities.map((c) => ({
      label: c.name,
      value: c.name
    }));
  }, [cities]);

  // Curated locality dropdown: shown ONLY for India > Gujarat > a mapped city
  // (Ahmedabad, Abrama). Any other location keeps the free-text Area field.
  const activeLocalities = selectedCountryCode === 'IN' && selectedStateCode === 'GJ'
    ? (LOCALITY_MAP[watchCity] || null)
    : null;

  const localityOptions = useMemo(() => {
    return (activeLocalities || []).map((locality) => ({
      label: locality,
      value: locality
    }));
  }, [activeLocalities]);

  // When the user leaves a mapped city, release the locality constraint so the
  // free-text area input is usable again, but preserve any already-chosen value.
  const watchAreaIsLocality = watchArea && (activeLocalities || []).includes(watchArea);
  useEffect(() => {
    if (!activeLocalities && watchAreaIsLocality) {
      setValue('area', '');
    }
  }, [activeLocalities, watchAreaIsLocality, setValue]);

  const selectedCountryName = useMemo(() => {
    if (!selectedCountryCode) return '';
    return Country.getCountryByCode(selectedCountryCode)?.name || '';
  }, [selectedCountryCode]);

  const selectedStateName = useMemo(() => {
    if (!selectedCountryCode || !selectedStateCode) return '';
    return State.getStateByCodeAndCountry(selectedStateCode, selectedCountryCode)?.name || '';
  }, [selectedCountryCode, selectedStateCode]);

  const searchMutation = useMutation({
    mutationFn: async (data: SearchFormValues) => {
      const countryData = Country.getCountryByCode(data.country);
      const stateData = data.state ? State.getStateByCodeAndCountry(data.state, data.country) : null;

      const maxLeads = Number(data.max_leads);
      const payload: Record<string, unknown> = {
        keyword: data.keyword,
        provider: data.provider || 'Google Maps',
        target_cap: data.target_cap || 'SMALL_MEDIUM_CAP',
        country: countryData?.name || data.country,
        state: stateData?.name || data.state || '',
        city: data.city || '',
        area: data.area || '',
        exhaustive: !!data.exhaustive
      };

      if (data.exhaustive) {
        let gridSize = data.grid_size ? Number(data.grid_size) : 3;
        if (Number.isNaN(gridSize) || gridSize <= 0) {
          gridSize = 3;
        }
        payload.grid_size = gridSize;
        payload.limit = 1000;
      } else {
        if (maxLeads == null || Number.isNaN(maxLeads) || maxLeads <= 0) {
          payload.limit = 100; // reasonable default if empty
        } else {
          payload.limit = maxLeads;
        }
      }

      const res = await api.post('/search', payload);
      return res.data;
    },
    onSuccess: (data) => {
      router.push(`/dashboard/search/job/detail?id=${data.job_id || data._id || data.id}`);
    },
  });
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['searchHistory', 'preview'],
    queryFn: async () => {
      const res = await api.get('/search/jobs?limit=10');
      return res.data.data;
    }
  });

  const onSubmit = (data: SearchFormValues) => {
    searchMutation.mutate(data);
  };

  const historyColumns = [
    { header: 'Search ID', accessor: (row: any) => <span className="font-mono text-xs text-slate-500">{row.job_id || row._id || row.id}</span> },
    { header: 'Keyword', accessor: (row: any) => <span className="font-semibold text-slate-900">{row.keyword}</span> },
    { header: 'Location', accessor: (row: any) => <span className="text-slate-600">{row.city ? `${row.city}, ` : ''}{row.state ? `${row.state}, ` : ''}{row.country}</span> },
    { header: 'Status', accessor: (row: any) => <StatusBadge status={row.status} /> },
    { header: 'Date', accessor: (row: any) => <span className="text-slate-600">{new Date(row.started_at || row.created_at).toLocaleDateString()}</span> },
    {
      header: 'Action', accessor: (row: any) => (
        <Link href={`/dashboard/search/job/detail?id=${row.job_id || row._id || row.id}`} className="text-slate-900 hover:text-slate-600 font-bold text-sm transition-colors underline decoration-slate-300 underline-offset-4">
          View Details
        </Link>
      )
    }
  ];

  return (
    <div className="w-full space-y-8 font-sans pb-12">
      <PageHeader
        title="Search Leads"
        description="Configure your parameters to extract high-quality business leads."
        action={
          <Link href="/dashboard/search/history" className="px-5 py-2.5 text-sm font-medium rounded-lg text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            View History
          </Link>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left Form Settings */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-8">

          {/* CARD 1: Search Configuration */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl flex items-center gap-3">
              <div className="p-2 bg-white rounded-md shadow-sm border border-slate-100">
                <SlidersHorizontal className="w-4 h-4 text-slate-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">1. Industry & Provider</h3>
                <p className="text-xs text-slate-500 mt-0.5">Define your target industry and data source.</p>
              </div>
            </div>

            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-800">Keyword / Industry <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    {...register('keyword')}
                    disabled={searchMutation.isPending}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm text-slate-900 placeholder:text-slate-400 transition-all disabled:opacity-60 disabled:bg-slate-50 font-medium"
                    placeholder="e.g. Real Estate, Plumbers"
                  />
                </div>
                {errors.keyword && <p className="text-xs text-red-500 font-medium">{errors.keyword.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-800">Provider</label>
                <div className="relative">
                  <select
                    {...register('provider')}
                    disabled={searchMutation.isPending}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm text-slate-900 transition-all disabled:opacity-60 disabled:bg-slate-50 appearance-none cursor-pointer font-medium"
                  >
                    <option value="Google Maps">Google Maps</option>
                    <option value="IndiaMart">IndiaMart</option>
                    <option value="Justdial">Justdial</option>
                    <option value="Clutch">Clutch</option>
                    <option value="Yellow Pages">Yellow Pages</option>
                    <option value="Yelp">Yelp</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {watchProvider && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200/80">
                      <Building2 className="w-3 h-3" />
                      {watchProvider}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">will be searched</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CARD 2: Location Targeting with Searchable Selects */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl flex items-center gap-3">
              <div className="p-2 bg-white rounded-md shadow-sm border border-slate-100">
                <MapPin className="w-4 h-4 text-slate-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">2. Location Details</h3>
                <p className="text-xs text-slate-500 mt-0.5">Narrow down leads by specific geographical areas using searchable dropdowns.</p>
              </div>
            </div>

            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Country Selection */}
              <Controller
                name="country"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    label="Country"
                    required
                    options={countryOptions}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Select Country"
                    disabled={searchMutation.isPending}
                    error={errors.country?.message}
                  />
                )}
              />

              {/* State Selection */}
              <Controller
                name="state"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    label="State / Region"
                    options={stateOptions}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder={selectedCountryCode ? "Any State" : "Select Country First"}
                    disabled={!selectedCountryCode || searchMutation.isPending}
                  />
                )}
              />

              {/* City Selection */}
              <Controller
                name="city"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    label="City"
                    options={cityOptions}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder={selectedStateCode ? "Any City" : "Select State First"}
                    disabled={!selectedStateCode || searchMutation.isPending}
                  />
                )}
              />

              {activeLocalities ? (
                <Controller
                  name="area"
                  control={control}
                  render={({ field }) => (
                    <SearchableSelect
                      label="Area / Locality"
                      options={localityOptions}
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder={`Select a locality in ${watchCity}`}
                      disabled={searchMutation.isPending}
                    />
                  )}
                />
              ) : (
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-800 flex items-center justify-between">
                    Area / Neighborhood
                    <span className="text-xs font-normal text-slate-400">Optional</span>
                  </label>
                  <input
                    type="text"
                    {...register('area')}
                    disabled={searchMutation.isPending}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm text-slate-900 placeholder:text-slate-400 transition-all disabled:opacity-60 disabled:bg-slate-50 font-medium"
                    placeholder="e.g. Downtown"
                  />
                </div>
              )}
            </div>
          </div>

          {/* CARD 3: Target Business Scale & Market Cap Filter */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl flex items-center gap-3">
              <div className="p-2 bg-white rounded-md shadow-sm border border-slate-100">
                <Building2 className="w-4 h-4 text-slate-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">3. Business Scale &amp; Target Cap Filter</h3>
                <p className="text-xs text-slate-500 mt-0.5">Filter leads perfectly by business scale (Small Cap, Medium Cap, SMEs vs Large Enterprises).</p>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-4">
              <label className="block text-sm font-semibold text-slate-800">Target Business Cap / Size</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  { value: 'SMALL_MEDIUM_CAP', label: '⭐ Small & Medium Cap (SMEs)', badge: 'RECOMMENDED', desc: 'Independent shops, local agencies & mid-market firms (Filters out giant corporate chains)' },
                  { value: 'SMALL_CAP', label: '🏪 Small Cap Only', badge: 'SMB / Micro', desc: 'Boutique stores, local service providers & startups (<150 reviews)' },
                  { value: 'MEDIUM_CAP', label: '🏢 Medium Cap Only', badge: 'Mid-Market', desc: 'Established regional businesses & medium enterprises (150-1000 reviews)' },
                  { value: 'LARGE_CAP', label: '🏛️ Large Cap / Corporate', badge: 'Enterprise', desc: 'Multinational corporations & national brand chains (>1000 reviews)' },
                  { value: 'ALL', label: '🌍 All Business Sizes', badge: 'Unfiltered', desc: 'Scrape all businesses without size or cap restrictions' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      watchTargetCap === option.value
                        ? 'border-blue-600 bg-blue-50/60 text-slate-900 shadow-sm ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm flex items-center gap-2 text-slate-900">
                        <input
                          type="radio"
                          value={option.value}
                          {...register('target_cap')}
                          className="hidden"
                        />
                        {option.label}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        watchTargetCap === option.value
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : option.badge === 'RECOMMENDED'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200/80'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {option.badge}
                      </span>
                    </div>
                    <p className={`text-xs leading-relaxed ${
                      watchTargetCap === option.value ? 'text-slate-600 font-medium' : 'text-slate-500'
                    }`}>
                      {option.desc}
                    </p>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 4: Limits */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl flex items-center gap-3">
              <div className="p-2 bg-white rounded-md shadow-sm border border-slate-100">
                <ListChecks className="w-4 h-4 text-slate-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">4. Extraction Limits</h3>
                <p className="text-xs text-slate-500 mt-0.5">Control the maximum count of leads details collected.</p>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-6">
              <label className="flex items-start gap-3 cursor-pointer group select-none">
                <div className="relative flex items-center mt-0.5">
                  <input
                    type="checkbox"
                    {...register('exhaustive')}
                    disabled={searchMutation.isPending}
                    className="w-4 h-4 rounded border-slate-300 bg-white checked:bg-[#c1121f] checked:border-[#c1121f] focus:ring-[#c1121f] focus:ring-1 focus:ring-offset-1 transition-all appearance-none cursor-pointer"
                  />
                  {watchExhaustive && (
                    <svg className="absolute w-3 h-3 text-white pointer-events-none left-0.5 top-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <span className="text-sm font-semibold text-slate-800">Exhaustive scrape (collect ALL)</span>
                  <p className="text-xs text-slate-500 mt-0.5">Covers the area with a grid of map viewports so every matching business is returned — not just Google's first results.</p>
                </div>
              </label>

              {watchExhaustive ? (
                <div className="max-w-md space-y-2">
                  <label className="block text-sm font-semibold text-slate-800">Grid Coverage</label>
                  <div className="relative">
                    <select
                      {...register('grid_size', { valueAsNumber: true })}
                      disabled={searchMutation.isPending}
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm text-slate-900 transition-all disabled:opacity-60 disabled:bg-slate-50 appearance-none cursor-pointer font-medium"
                    >
                      <option value={3}>3 × 3 (recommended)</option>
                      <option value={5}>5 × 5 (dense areas)</option>
                      <option value={7}>7 × 7 (very large areas)</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <p className="text-xs text-slate-400">Higher coverage = more requests &amp; longer runtime.</p>
                </div>
              ) : (
                <div className="max-w-md space-y-2">
                  <label className="block text-sm font-semibold text-slate-800 flex items-center justify-between">
                    Maximum Leads
                    <span className="text-xs font-normal text-slate-400">Optional</span>
                  </label>
                  <input
                    type="number"
                    {...register('max_leads', { valueAsNumber: true })}
                    disabled={searchMutation.isPending}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm text-slate-900 placeholder:text-slate-400 transition-all disabled:opacity-60 disabled:bg-slate-50 font-medium"
                    placeholder="e.g. 500"
                  />
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Sticky Preview Card & Launch Button */}
        <div className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-8 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm relative">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
              <h3 className="text-xs font-bold tracking-wider uppercase text-slate-700">Live Agent Preview</h3>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-4">

                {/* Industry */}
                <div className="flex items-start gap-3">
                  <div className="p-1.5 bg-slate-50 rounded text-slate-500 mt-0.5 shrink-0 border border-slate-100">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold tracking-wider uppercase">Target Industry</span>
                    <span className="text-sm font-bold text-slate-800">
                      {watchKeyword ? (
                        <span className="text-slate-900 font-extrabold">{watchKeyword}</span>
                      ) : (
                        <span className="text-slate-400 italic font-normal">Enter industry...</span>
                      )}
                    </span>
                  </div>
                </div>


                {/* Location */}
                <div className="flex items-start gap-3">
                  <div className="p-1.5 bg-slate-50 rounded text-slate-500 mt-0.5 shrink-0 border border-slate-100">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold tracking-wider uppercase">Location</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {selectedCountryCode ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-lg leading-none shrink-0 flag-emoji">{getUnicodeFlag(selectedCountryCode)}</span>
                          <span className="text-slate-900 font-bold">
                            {watchCity ? `${watchCity}, ` : ''}{selectedStateName ? `${selectedStateName}, ` : ''}{selectedCountryName}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic font-normal">Select country...</span>
                      )}
                      {watchArea && <span className="block text-xs text-slate-500 mt-0.5 font-medium">Area: <span className="text-slate-700">{watchArea}</span></span>}
                    </span>
                  </div>
                </div>

                {/* Provider */}
                <div className="flex items-start gap-3">
                  <div className="p-1.5 bg-slate-50 rounded text-slate-500 mt-0.5 shrink-0 border border-slate-100">
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold tracking-wider uppercase">Data Provider</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {watchProvider ? (
                        <span className="text-slate-900 font-bold">{watchProvider}</span>
                      ) : (
                        <span className="text-slate-400 italic font-normal">Select provider...</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Max Leads */}
                <div className="flex items-start gap-3">
                  <div className="p-1.5 bg-slate-50 rounded text-slate-500 mt-0.5 shrink-0 border border-slate-100">
                    <ListChecks className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold tracking-wider uppercase">Extraction Limit</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {watchExhaustive ? (
                        <span className="text-slate-900 font-bold">Exhaustive · {watchGridSize || 3}×{watchGridSize || 3} grid</span>
                      ) : watchMaxLeads ? (
                        <span className="text-slate-900 font-bold">{watchMaxLeads} leads</span>
                      ) : (
                        <span className="text-slate-500 font-normal">Default (100)</span>
                      )}
                    </span>
                  </div>
                </div>

              </div>

              <div className="pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={!isValid || searchMutation.isPending}
                  className="w-full py-3 flex justify-center items-center gap-2 text-sm font-bold rounded-lg text-white bg-[#0f172a] hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
                >
                  {searchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {searchMutation.isPending ? 'Launching Agent...' : 'Launch Scraper Agent'}
                </button>
                <p className="text-[10px] text-center text-slate-400 mt-2 font-medium">
                  The agent runs in the background to automatically scrape email address, phone numbers, website links, and social reviews.
                </p>
              </div>
            </div>
          </div>
        </div>

      </form>

      {/* History Section */}
      <div className="pt-8 border-t border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <Settings2 className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-bold text-slate-900">Recent Searches</h2>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <DataTable
            data={historyData || []}
            columns={historyColumns}
            keyExtractor={(row: any) => row._id}
            isLoading={historyLoading}
          />
        </div>
      </div>
    </div>
  );
}
