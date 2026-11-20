'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/features/auth/store';
import { PageHeader } from '@/src/components/common/PageHeader';
import { toast } from 'sonner';

import {
  Compass,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  Calendar,
  MapPin,
  Plus,
  Sliders,
  Sparkles,
  Layers,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Check,
  TrendingUp,
  Building2,
  Users,
  Navigation,
  ChevronRight,
  Filter,
  Timer,
  Activity,
  Search
} from 'lucide-react';
import ScheduledTasksMonitor from '@/src/components/auto-leadfinder/ScheduledTasksMonitor';
import LocationSelector, { TargetCityItem } from '@/src/components/auto-leadfinder/LocationSelector';

const TARGET_EMAIL = 'kutchtourguide@gmail.com';

export default function AutoLeadFinderPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  // Fetch user profile to verify email
  const { data: userProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      try {
        const res = await api.get('/users/me');
        return res.data;
      } catch {
        return null;
      }
    },
  });

  const userEmail = (user?.email || userProfile?.email || '')?.toLowerCase();
  const isAuthorized = userEmail === TARGET_EMAIL;

  // Strict route authorization check
  useEffect(() => {
    if (!profileLoading && !isAuthorized) {
      toast.error('Access restricted to authorized account.');
      router.replace('/dashboard');
    }
  }, [isAuthorized, profileLoading, router]);

  // Settings & KPI stats query
  const {
    data: settingsResponse,
    isLoading: loadingSettings,
    refetch: refetchSettings,
    isRefetching: refetchingSettings
  } = useQuery({
    queryKey: ['auto-leadfinder-settings'],
    queryFn: async () => {
      const res = await api.get('/auto-leadfinder/settings');
      return res.data?.data;
    },
    enabled: isAuthorized,
    refetchInterval: 10000,
  });

  // Run history query
  const {
    data: historyResponse,
    isLoading: loadingHistory,
    refetch: refetchHistory,
    isRefetching: refetchingHistory
  } = useQuery({
    queryKey: ['auto-leadfinder-history'],
    queryFn: async () => {
      const res = await api.get('/auto-leadfinder/history?limit=15');
      return res.data?.data || [];
    },
    enabled: isAuthorized,
    refetchInterval: 10000,
  });

  // Local state for configuration form
  const [isActive, setIsActive] = useState<boolean>(true);
  const [dailyLimit, setDailyLimit] = useState<number>(500);
  const [country, setCountry] = useState<string>('India');
  const [countryCode, setCountryCode] = useState<string>('IN');
  const [state, setState] = useState<string>('Gujarat');
  const [stateCode, setStateCode] = useState<string>('GJ');
  const [city, setCity] = useState<string>('Bhuj');
  const [district, setDistrict] = useState<string>('Kachchh');
  const [locationMode, setLocationMode] = useState<'kutch_systematic' | 'custom_city'>('custom_city');
  const [targetCities, setTargetCities] = useState<TargetCityItem[]>([]);
  const [discoveredAreas, setDiscoveredAreas] = useState<any[]>([]);
  const [discoveredPincodes, setDiscoveredPincodes] = useState<string[]>([]);
  const [currentAreaIndex, setCurrentAreaIndex] = useState<number>(0);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [areaSearchFilter, setAreaSearchFilter] = useState<string>('');
  const [showDiscoveredExplorer, setShowDiscoveredExplorer] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTriggeringRun, setIsTriggeringRun] = useState<boolean>(false);
  const [showCatalog, setShowCatalog] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'engine' | 'tasks'>('engine');

  // Synchronize local form state with fetched settings
  useEffect(() => {
    if (settingsResponse) {
      setIsActive(settingsResponse.is_active ?? true);
      setDailyLimit(settingsResponse.daily_limit ?? 500);
      setCountry(settingsResponse.country || 'India');
      setCountryCode(settingsResponse.country_code || 'IN');
      setState(settingsResponse.state || 'Gujarat');
      setStateCode(settingsResponse.state_code || 'GJ');
      setCity(settingsResponse.city || 'Bhuj');
      setDistrict(settingsResponse.district || 'Kachchh');
      setLocationMode(settingsResponse.location_mode || 'custom_city');
      setTargetCities(settingsResponse.target_cities || []);
      setDiscoveredAreas(settingsResponse.discovered_areas || []);
      setDiscoveredPincodes(settingsResponse.discovered_pincodes || []);
      setCurrentAreaIndex(settingsResponse.current_area_index || 0);
    }
  }, [settingsResponse]);

  if (profileLoading || !isAuthorized) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  const handleTriggerDiscovery = async (forceRefresh: boolean = false, targetCityName?: string) => {
    const cName = targetCityName || city || 'Bhuj';
    setIsDiscovering(true);
    try {
      const res = await api.post('/auto-leadfinder/discover-areas', {
        city: cName,
        state: state || 'Gujarat',
        country: country || 'India',
        district: district || 'Kachchh',
        force_refresh: forceRefresh,
      });
      const data = res.data?.data;
      if (data) {
        setDiscoveredAreas(data.areas || []);
        setDiscoveredPincodes(data.pincodes || []);
        setDistrict(data.district || district);
        toast.success(`Discovered ${data.total_areas || 0} postal areas across ${data.pincodes?.length || 0} PIN codes for ${cName}!`);
        refetchSettings();
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj?.response?.data?.detail || errorObj?.message || 'Failed to discover postal areas.';
      toast.error(msg);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSaveSettings = async (customPayload?: Record<string, any> | unknown) => {
    setIsSaving(true);
    try {
      // Safely ensure customPayload is a pure plain object and NOT a DOM / React SyntheticEvent
      const isPlainObject =
        customPayload &&
        typeof customPayload === 'object' &&
        !('nativeEvent' in customPayload) &&
        !('_reactName' in customPayload) &&
        !('target' in customPayload);
      const safeCustom = isPlainObject ? (customPayload as Record<string, any>) : {};

      const payload = {
        is_active: isActive,
        daily_limit: Number(dailyLimit),
        country,
        country_code: countryCode,
        state,
        state_code: stateCode,
        city,
        district,
        location_mode: locationMode,
        target_cities: targetCities,
        discovered_areas: discoveredAreas,
        discovered_pincodes: discoveredPincodes,
        current_area_index: currentAreaIndex,
        ...safeCustom,
      };
      await api.put('/auto-leadfinder/settings', payload);
      toast.success('Auto LeadFinder location & settings updated successfully!');
      refetchSettings();
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj?.response?.data?.detail || errorObj?.message || 'Failed to update settings.';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLocationChange = (updated: {
    country: string;
    country_code: string;
    state: string;
    state_code: string;
    city: string;
    location_mode: 'kutch_systematic' | 'custom_city';
    target_cities?: TargetCityItem[];
  }) => {
    const prevCity = city;
    setCountry(updated.country);
    setCountryCode(updated.country_code);
    setState(updated.state);
    setStateCode(updated.state_code);
    setCity(updated.city);
    setLocationMode(updated.location_mode);
    if (updated.target_cities !== undefined) {
      setTargetCities(updated.target_cities);
    }
    // Auto-discover areas via Indian Postal PIN Code API if city changed
    if (updated.city && updated.city !== prevCity) {
      handleTriggerDiscovery(false, updated.city);
    }
  };

  const handleTriggerManualRun = async () => {
    setIsTriggeringRun(true);
    try {
      await api.post('/auto-leadfinder/run-now');
      toast.success(`Systematic ${city || 'City'} lead scraping started! Tracking live progress.`);
      refetchSettings();
      refetchHistory();
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj?.response?.data?.detail || errorObj?.message || 'Failed to start scraping.';
      toast.error(msg);
    } finally {
      setIsTriggeringRun(false);
    }
  };

  const handleRefreshAll = () => {
    refetchSettings();
    refetchHistory();
  };

  const todayCollected = settingsResponse?.today_leads_collected ?? 0;
  const currentLimit = settingsResponse?.daily_limit ?? dailyLimit;
  const totalCollected = settingsResponse?.total_leads_collected ?? 0;
  const isRunning = settingsResponse?.is_running ?? false;
  const nextRunTime = settingsResponse?.next_run_ist ?? 'Tonight at 12:00 AM IST';
  const currentLocalityName = settingsResponse?.current_locality_name ?? 'Station Road, Bhuj';
  const currentLocalityIndex = settingsResponse?.current_locality_index ?? 0;
  const totalLocalities = settingsResponse?.total_kutch_localities ?? 38;
  const kutchCatalog = settingsResponse?.kutch_localities_catalog ?? [];
  const displayCity = (city || '').replace(/\s+district$/i, '').trim();

  return (
    <div className="w-full space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 border border-teal-200/80 text-teal-700">
              <Compass className="w-3.5 h-3.5 text-teal-600" />
              Priority #1: {displayCity ? `${displayCity} Systematic Locality Coverage` : 'City & Localities Systematic Coverage'}
            </span>
            <span className="text-xs text-slate-400">Exclusive for {TARGET_EMAIL}</span>
          </div>
          <PageHeader
            title="Auto LeadFinder"
            description={
              displayCity
                ? `Autonomous daily lead discovery system systematically covering all areas and localities of ${displayCity} first, gathering a guaranteed 500 unique leads every day.`
                : "Autonomous daily lead discovery system systematically covering all areas and localities of selected city first, gathering a guaranteed 500 unique leads every day."
            }
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={handleRefreshAll}
            className="p-2.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-all cursor-pointer"
            title="Refresh statistics"
          >
            <RotateCcw className={`w-4 h-4 ${refetchingSettings || refetchingHistory ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleTriggerManualRun}
            disabled={isTriggeringRun || isRunning}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs transition-all cursor-pointer active:scale-95 ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-teal-600 hover:bg-teal-700 disabled:opacity-50'
            }`}
          >
            {isTriggeringRun || isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Scraping Active...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Scraping Now</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('engine')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'engine'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Compass className="w-4 h-4 text-teal-400" />
          <span>{displayCity ? `${displayCity} Lead Discovery Engine` : 'City Lead Discovery Engine'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'tasks'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Timer className="w-4 h-4 text-teal-600" />
          <span>Scheduled Tasks & Execution Monitor</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
        </button>
      </div>

      {/* View 1: Scheduled Tasks Monitor */}
      {activeTab === 'tasks' && <ScheduledTasksMonitor />}

      {/* View 2: Kutch Lead Discovery Engine */}
      {activeTab === 'engine' && (
        <div className="space-y-6">
          {/* Priority Region Banner */}
      <div className="bg-gradient-to-r from-teal-900 to-slate-900 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
          <Compass className="w-56 h-56 text-white" />
        </div>
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-teal-500/20 border border-teal-400/30 text-teal-300">
            <Navigation className="w-3.5 h-3.5" />
            <span>{displayCity ? `${displayCity} Priority Sequence` : 'City Priority Sequence'}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Systematic Locality Coverage in Progress
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            The system begins with <strong className="text-teal-300">{displayCity ? `${displayCity}${district && district !== displayCity ? ` (${district})` : ''}${state ? `, ${state}` : ''}` : 'the selected city'}</strong>, thoroughly exploring all major areas and localities before moving outward. Every daily run targets a minimum of <strong className="text-teal-300">500 100% unique, fresh leads</strong> while strictly ignoring all duplicate contacts.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs">
            <div className="bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10">
              <span className="text-slate-400 block text-[10px]">Next Locality Queue:</span>
              <span className="font-bold text-teal-300">
                {discoveredAreas.length > 0 && discoveredAreas[currentAreaIndex]?.name
                  ? `${discoveredAreas[currentAreaIndex].name} (${discoveredAreas[currentAreaIndex].pincode || displayCity})`
                  : currentLocalityName}
              </span>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10">
              <span className="text-slate-400 block text-[10px]">{displayCity ? `${displayCity} Areas Indexed:` : 'Areas Indexed:'}</span>
              <span className="font-bold text-white">
                {discoveredAreas.length > 0 ? `${discoveredAreas.length} Discovered Postal Areas` : `${totalLocalities} Areas & Localities`}
              </span>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10">
              <span className="text-slate-400 block text-[10px]">Daily Target Guarantee:</span>
              <span className="font-bold text-emerald-400">500 Unique Leads / Day</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Status Banner if running */}
      {isRunning && (
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-700 font-bold">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900">Systematic Lead Scraping Active in {displayCity || 'Selected City'}</h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Exploring localities in {displayCity || 'Selected City'} for Tour Operators, Travel Agencies, and Tour Guides. Deduplicating against all existing records in real time.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-amber-800 bg-amber-100/80 px-3 py-1 rounded-full border border-amber-300">
            Live Execution
          </span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Status */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Automation Status</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isActive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
            }`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-lg font-bold text-slate-900">
                {isActive ? 'Active (Scheduled)' : 'Paused'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block truncate">
              Next: {nextRunTime}
            </span>
          </div>
        </div>

        {/* Card 2: Daily Limit */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Daily Target Limit</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <Sliders className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-slate-900">{currentLimit}</span>
            <span className="text-xs text-slate-500 ml-1">leads / day</span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Guaranteed Fresh & Unique
            </span>
          </div>
        </div>

        {/* Card 3: Today's Collection */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Today&apos;s Collected</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-blue-600">{todayCollected}</span>
              <span className="text-xs text-slate-400">/ {currentLimit}</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (todayCollected / Math.max(1, currentLimit)) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 4: Total Auto Leads */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Lifetime Leads</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-indigo-600">{totalCollected}</span>
            <span className="text-xs text-slate-500 ml-1">leads</span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Synced with Leads Management
            </span>
          </div>
        </div>
      </div>

      {/* Manual Cascading Location Selector (Country -> State -> City) */}
      <LocationSelector
        country={country}
        countryCode={countryCode}
        state={state}
        stateCode={stateCode}
        city={city}
        locationMode={locationMode}
        targetCities={targetCities}
        discoveredPincodes={discoveredPincodes}
        discoveredAreasCount={discoveredAreas.length}
        isDiscovering={isDiscovering}
        onTriggerDiscovery={handleTriggerDiscovery}
        onChangeLocation={handleLocationChange}
      />

      {/* Discovered Postal Areas & Google Maps Queries Explorer */}
      {discoveredAreas && discoveredAreas.length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Discovered Postal Areas in {displayCity || 'City'} ({discoveredAreas.length})
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 border border-teal-200 text-teal-700">
                    Indian Postal PIN Code API
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Extracted <code className="text-teal-700 font-bold">PostOffice[].Name</code> areas with dynamically generated Google Maps queries.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                onClick={() => handleTriggerDiscovery(true)}
                disabled={isDiscovering}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                title="Force refresh areas from API"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
                <span>Re-Discover</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDiscoveredExplorer(!showDiscoveredExplorer)}
                className="text-xs font-bold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100/70 border border-teal-200 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                {showDiscoveredExplorer ? 'Collapse Areas' : `View All ${discoveredAreas.length} Areas`}
              </button>
            </div>
          </div>

          {showDiscoveredExplorer && (
            <div className="space-y-3 pt-1">
              {/* Filter search bar */}
              <div className="relative max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter discovered areas or PIN codes..."
                  value={areaSearchFilter}
                  onChange={(e) => setAreaSearchFilter(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium"
                />
              </div>

              {/* Grid of Areas */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
                {discoveredAreas
                  .filter((a: any) => {
                    if (!areaSearchFilter.trim()) return true;
                    const q = areaSearchFilter.toLowerCase();
                    return (
                      a.name.toLowerCase().includes(q) ||
                      (a.pincode && a.pincode.includes(q)) ||
                      (a.maps_query && a.maps_query.toLowerCase().includes(q))
                    );
                  })
                  .map((area: any, idx: number) => {
                    const isNextInQueue = idx === currentAreaIndex;
                    return (
                      <div
                        key={`${area.name}-${area.pincode}-${idx}`}
                        className={`p-3 rounded-2xl border text-xs flex flex-col justify-between gap-2 transition-all ${
                          isNextInQueue
                            ? 'bg-teal-50/80 border-teal-300 ring-2 ring-teal-500/20 shadow-xs'
                            : 'bg-slate-50/50 border-slate-200/80 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-extrabold text-slate-900 block text-xs">
                              {area.name}
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {area.district || district} • {area.state}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {area.pincode && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-white border border-slate-200 text-slate-700 shadow-2xs">
                                📮 {area.pincode}
                              </span>
                            )}
                            {isNextInQueue && (
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-teal-600 text-white animate-pulse">
                                NEXT
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Google Maps Generated Query */}
                        <div className="p-2 rounded-xl bg-white border border-slate-100 text-[10px] space-y-1">
                          <div className="flex items-center gap-1 text-slate-400 font-semibold">
                            <MapPin className="w-2.5 h-2.5 text-teal-600" />
                            <span>Google Maps Query:</span>
                          </div>
                          <p className="font-mono text-slate-700 truncate" title={area.maps_query}>
                            {area.maps_query}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Systematic Kutch Localities Catalog Explorer */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {city.toLowerCase().includes('kutch') || city.toLowerCase().includes('bhuj')
                  ? 'Kutch Localities Coverage Index'
                  : `${city} Regional Coverage Index`}
              </h3>
              <p className="text-xs text-slate-500">
                {city.toLowerCase().includes('kutch') || city.toLowerCase().includes('bhuj')
                  ? 'All 38 key areas and localities across Bhuj, Gandhidham, Mandvi, White Desert, Anjar, Mundra, and Western/Eastern Kutch.'
                  : `Localities and areas prioritized for lead generation in ${city}, ${district || state}.`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCatalog(!showCatalog)}
            className="text-xs font-bold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100/70 border border-teal-200 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer self-start sm:self-center"
          >
            {showCatalog ? 'Hide Localities List' : `View All ${kutchCatalog.length || 38} Reference Localities`}
          </button>
        </div>

        {/* Localities Grid Preview */}
        {showCatalog && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-3 animate-in fade-in duration-200">
            {kutchCatalog.map((loc: any, idx: number) => {
              const isCurrent = idx === currentLocalityIndex;
              return (
                <div
                  key={`${loc.city}-${loc.locality}`}
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                    isCurrent
                      ? 'bg-teal-50 border-teal-300 ring-2 ring-teal-500/20 shadow-xs'
                      : 'bg-slate-50/60 border-slate-200/70'
                  }`}
                >
                  <div className="overflow-hidden">
                    <span className="font-bold text-slate-800 block truncate">{loc.locality}</span>
                    <span className="text-[10px] text-slate-400 block truncate">{loc.city} • {loc.zone}</span>
                  </div>
                  {isCurrent ? (
                    <span className="shrink-0 px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-teal-600 text-white animate-pulse">
                      NEXT
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] text-slate-400 font-semibold">
                      #{idx + 1}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings & Configuration Card */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Customizable Scraping Settings</h3>
              <p className="text-xs text-slate-500">
                Adjust your daily target quota and automatic midnight execution.
              </p>
            </div>
          </div>

          {/* Master Toggle */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 px-4 py-2 rounded-2xl self-start sm:self-center">
            <span className="text-xs font-semibold text-slate-700">Daily Automation:</span>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                isActive ? 'bg-teal-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-xs font-bold ${isActive ? 'text-teal-700' : 'text-slate-400'}`}>
              {isActive ? 'ENABLED' : 'PAUSED'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Limit Control */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 block">
              Daily Lead Limit (Target New Unique Leads / Day)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="10"
                max="1000"
                step="10"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                className="w-32 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
              />
              <div className="flex items-center gap-1.5">
                {[100, 250, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDailyLimit(preset)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      dailyLimit === preset
                        ? 'bg-teal-50 border-teal-300 text-teal-700 font-bold'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {preset} leads
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              The scraper explores localities sequentially until reaching exactly <strong className="text-slate-600">{dailyLimit} fresh leads</strong>.
            </p>
          </div>

          {/* Schedule Info Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Clock className="w-4 h-4 text-teal-600" />
              <span>Execution Schedule & Deduplication</span>
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Target Geography:</span>
                <span className="font-semibold text-teal-700 truncate max-w-[200px]" title={`${displayCity || city}, ${state}, ${country}`}>
                  {displayCity || city || 'Bhuj'}, {state || 'Gujarat'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Frequency:</span>
                <span className="font-semibold text-slate-900">Every Night at 12:00 AM (Midnight)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Timezone:</span>
                <span className="font-semibold text-slate-900">Asia/Kolkata (IST)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Duplicate Filter:</span>
                <span className="font-semibold text-emerald-600">100% Unique Verified Leads</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Save Bar */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Systematic locality indexes persist across server restarts and daily runs.
          </p>
          <button
            type="button"
            onClick={() => handleSaveSettings()}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Configuration</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Recent Scraping Activity & History */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Recent Scraping History</h3>
              <p className="text-xs text-slate-500">
                Log of automated midnight runs and on-demand scraping batches.
              </p>
            </div>
          </div>

          <button
            onClick={() => refetchHistory()}
            className="text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
          >
            Refresh History
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Date & Time (IST)</th>
                <th className="py-3 px-4">Trigger</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Kutch Localities Processed</th>
                <th className="py-3 px-4">Unique Leads Collected</th>
                <th className="py-3 px-4">Duplicates Filtered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingHistory ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
                    <span>Loading scraping activity...</span>
                  </td>
                </tr>
              ) : !historyResponse || historyResponse.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Compass className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600 text-sm">No Scraping Runs Recorded Yet</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Scraping runs automatically every night at 12:00 AM IST, or click &quot;Run Scraping Now&quot; to start immediately.
                    </p>
                  </td>
                </tr>
              ) : (
                historyResponse.map((run: any) => {
                  const startedAt = run.started_at ? new Date(run.started_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-';
                  const isSuccess = run.status === 'COMPLETED';
                  const isRunActive = run.status === 'RUNNING';

                  return (
                    <tr key={run._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {startedAt}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          run.trigger_type === 'SCHEDULED'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {run.trigger_type === 'SCHEDULED' ? 'Scheduled (12 AM)' : 'Manual Trigger'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          isSuccess
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isRunActive
                            ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {isSuccess && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                          {isRunActive && <Loader2 className="w-3 h-3 animate-spin text-amber-600" />}
                          <span>{run.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {run.localities_processed && run.localities_processed.length > 0 ? (
                            run.localities_processed.map((l: any, i: number) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold"
                              >
                                {l.locality || l.city} ({l.leads_collected})
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <span className="text-teal-600 font-extrabold">{run.total_collected || 0}</span>
                        <span className="text-slate-400 font-normal"> / {run.daily_limit_target || 100}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {run.duplicates_filtered || 0} duplicates
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )}
</div>
);
}
