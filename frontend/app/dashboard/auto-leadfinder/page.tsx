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
  Sliders,
  Loader2,
  ShieldCheck,
  Check,
  TrendingUp,
  Building2,
  Users,
  ChevronRight,
  Timer,
  Search,
  Lock,
  Tag,
  Trash2,
  AlertTriangle,
  Globe,
  Sparkles,
  Layers,
  ChevronDown
} from 'lucide-react';
import ScheduledTasksMonitor from '@/src/components/auto-leadfinder/ScheduledTasksMonitor';

const TARGET_EMAIL = 'kutchtourguide@gmail.com';

const NICHE_PRESETS = [
  'Real Estate',
  'Hotels & Resorts',
  'Healthcare & Doctors',
  'Restaurants & Cafes',
  'Manufacturing & B2B',
  'IT & Digital Services',
  'Education & Coaching',
  'Finance & CA',
];

export default function AutoLeadFinderPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  // Fetch user profile to verify role and email
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

  const isAdmin =
    user?.role?.toLowerCase() === 'admin' ||
    userProfile?.role?.toLowerCase() === 'admin' ||
    userProfile?.is_superuser === true;

  const userEmail = (user?.email || userProfile?.email || '')?.toLowerCase();
  const isAuthorized =
    isAdmin ||
    userEmail === TARGET_EMAIL ||
    (userProfile as any)?.auto_leadfinder_access === true ||
    (user as any)?.auto_leadfinder_access === true;

  // Strict route authorization check
  useEffect(() => {
    if (!profileLoading && !isAuthorized) {
      toast.error('Access restricted. Please contact your administrator.');
      router.replace('/dashboard');
    }
  }, [isAuthorized, profileLoading, router]);

  // Admin User Switcher: fetch all users who have Auto LeadFinder enabled
  const { data: usersWithAccessResponse } = useQuery({
    queryKey: ['auto-leadfinder-users-with-access'],
    queryFn: async () => {
      const res = await api.get('/auto-leadfinder/users-with-access');
      return res.data?.data || [];
    },
    enabled: isAuthorized && isAdmin,
  });

  const usersWithAccess: any[] = usersWithAccessResponse || [];

  // Active user context selection
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>(TARGET_EMAIL);

  // Effective email being viewed/configured
  const effectiveEmail = (isAdmin ? selectedUserEmail : userEmail) || TARGET_EMAIL;
  const isKutchUser = effectiveEmail.toLowerCase() === TARGET_EMAIL.toLowerCase();

  // Settings & KPI stats query for this specific user
  const {
    data: settingsResponse,
    isLoading: loadingSettings,
    refetch: refetchSettings,
    isRefetching: refetchingSettings
  } = useQuery({
    queryKey: ['auto-leadfinder-settings', effectiveEmail],
    queryFn: async () => {
      const res = await api.get('/auto-leadfinder/settings', {
        params: { user_email: effectiveEmail }
      });
      return res.data?.data;
    },
    enabled: isAuthorized && !!effectiveEmail,
    refetchInterval: 10000,
  });

  // Run history query for this specific user
  const {
    data: historyResponse,
    isLoading: loadingHistory,
    refetch: refetchHistory,
    isRefetching: refetchingHistory
  } = useQuery({
    queryKey: ['auto-leadfinder-history', effectiveEmail],
    queryFn: async () => {
      const res = await api.get('/auto-leadfinder/history', {
        params: { user_email: effectiveEmail, limit: 15 }
      });
      return res.data?.data || [];
    },
    enabled: isAuthorized && !!effectiveEmail,
    refetchInterval: 10000,
  });

  // Local state for unified configuration form
  const [isActive, setIsActive] = useState<boolean>(true);
  const [dailyLimit, setDailyLimit] = useState<number>(100);
  const [keywordInput, setKeywordInput] = useState<string>('');
  const [country, setCountry] = useState<string>('India');
  const [state, setState] = useState<string>('Gujarat');
  const [city, setCity] = useState<string>('Bhuj');
  const [discoveredAreas, setDiscoveredAreas] = useState<any[]>([]);
  const [discoveredPincodes, setDiscoveredPincodes] = useState<string[]>([]);
  const [currentAreaIndex, setCurrentAreaIndex] = useState<number>(0);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTriggeringRun, setIsTriggeringRun] = useState<boolean>(false);
  const [showCatalog, setShowCatalog] = useState<boolean>(false);
  const [showAreasModal, setShowAreasModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks'>('overview');
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Synchronize form state with fetched settings
  useEffect(() => {
    if (settingsResponse) {
      setIsActive(settingsResponse.is_active ?? true);
      setDailyLimit(settingsResponse.daily_limit ?? (isKutchUser ? 500 : 100));
      setKeywordInput(settingsResponse.keyword || (isKutchUser ? 'Travel Agency' : ''));
      setCountry(settingsResponse.country || 'India');
      setState(settingsResponse.state || (isKutchUser ? 'Gujarat' : ''));
      setCity(settingsResponse.city || (isKutchUser ? 'Kutch district' : ''));
      setDiscoveredAreas(settingsResponse.discovered_areas || []);
      setDiscoveredPincodes(settingsResponse.discovered_pincodes || []);
      setCurrentAreaIndex(settingsResponse.current_area_index || 0);
    }
  }, [settingsResponse, isKutchUser]);

  if (profileLoading || !isAuthorized) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  const handleTriggerDiscovery = async (forceRefresh: boolean = false, targetCityName?: string) => {
    const cName = targetCityName || city || (isKutchUser ? 'Bhuj' : '');
    if (!cName.trim()) {
      toast.error('Please enter a target city first.');
      return;
    }
    setIsDiscovering(true);
    try {
      const res = await api.post(
        '/auto-leadfinder/discover-areas',
        {
          city: cName.trim(),
          state: state || 'Gujarat',
          country: country || 'India',
          district: cName.trim(),
          force_refresh: forceRefresh,
          user_email: effectiveEmail,
        },
        { params: { user_email: effectiveEmail } }
      );
      const data = res.data?.data;
      if (data) {
        setDiscoveredAreas(data.areas || []);
        setDiscoveredPincodes(data.pincodes || []);
        toast.success(`Discovered ${data.total_areas || 0} postal areas for ${cName}!`);
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

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const finalKeyword = isKutchUser ? 'Travel Agency' : (keywordInput || 'Business').trim();
      const payload = {
        is_configured: true,
        is_active: isActive,
        daily_limit: Number(dailyLimit),
        keyword: finalKeyword,
        industry_keywords: [finalKeyword],
        country: (country || 'India').trim(),
        state: (state || '').trim(),
        city: (city || '').trim(),
        district: (city || '').trim(),
        discovered_areas: discoveredAreas,
        discovered_pincodes: discoveredPincodes,
        current_area_index: currentAreaIndex,
        assigned_user_email: effectiveEmail,
      };

      await api.put('/auto-leadfinder/settings', payload, {
        params: { user_email: effectiveEmail }
      });
      toast.success(`Auto LeadFinder configuration saved successfully for ${effectiveEmail}!`);
      refetchSettings();

      // If city is entered and no areas are discovered yet, discover them
      if (payload.city && discoveredAreas.length === 0) {
        handleTriggerDiscovery(false, payload.city);
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj?.response?.data?.detail || errorObj?.message || 'Failed to update settings.';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerManualRun = async () => {
    if (!isKutchUser && (!city.trim() || !keywordInput.trim())) {
      toast.error('Please enter a target city and industry keyword first.');
      return;
    }
    setIsTriggeringRun(true);
    try {
      await api.post('/auto-leadfinder/run-now', null, {
        params: { user_email: effectiveEmail }
      });
      toast.success(`Lead scraping started for ${city || 'Target City'}!`);
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

  const handleDeleteAllSchedules = async () => {
    setIsDeleting(true);
    try {
      await api.delete('/auto-leadfinder/schedules', {
        params: { user_email: effectiveEmail }
      });
      toast.success(`All schedules and execution logs for ${effectiveEmail} have been deleted.`);
      setShowDeleteModal(false);
      refetchSettings();
      refetchHistory();
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj?.response?.data?.detail || errorObj?.message || 'Failed to delete schedules.';
      toast.error(msg);
    } finally {
      setIsDeleting(false);
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
  const currentLocalityName = settingsResponse?.current_locality_name ?? (city || 'Target Locality');
  const currentLocalityIndex = settingsResponse?.current_locality_index ?? 0;
  const totalLocalities = settingsResponse?.total_kutch_localities ?? 38;
  const kutchCatalog = settingsResponse?.kutch_localities_catalog ?? [];
  const displayCity = (city || '').replace(/\s+district$/i, '').trim();
  const isKeywordFixed = isKutchUser || settingsResponse?.is_keyword_fixed === true;
  const activeKeyword = settingsResponse?.keyword || keywordInput || (isKutchUser ? 'Travel Agency' : 'Custom');

  return (
    <div className="w-full space-y-5 pb-10 animate-in fade-in">
      {/* Admin Context Switcher Banner (Compact) */}
      {isAdmin && (
        <div className="bg-slate-900 border border-teal-500/30 rounded-2xl p-3.5 shadow-xs text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  Admin Multi-Tenant Control
                </span>
                <span className="text-xs font-bold text-white">
                  Managing: <strong className="text-teal-300">{settingsResponse?.user_name || effectiveEmail}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="text-xs text-slate-300 font-medium whitespace-nowrap">Switch User:</span>
            <div className="relative min-w-[240px] sm:min-w-[280px]">
              <select
                value={selectedUserEmail}
                onChange={(e) => setSelectedUserEmail(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-1.5 rounded-xl bg-slate-800 border border-teal-500/40 text-xs font-bold text-white focus:outline-hidden focus:ring-2 focus:ring-teal-400 cursor-pointer"
              >
                {usersWithAccess.length > 0 ? (
                  usersWithAccess.map((u: any) => (
                    <option key={u.email} value={u.email} className="bg-slate-900 text-white">
                      {u.full_name} ({u.email}) {u.is_kutch ? '★ Travel Agency' : `• ${u.keyword || 'Custom'}`}
                    </option>
                  ))
                ) : (
                  <option value={TARGET_EMAIL} className="bg-slate-900 text-white">
                    Vipul Shah (kutchtourguide@gmail.com)
                  </option>
                )}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-teal-300 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>
      )}

      {/* Header (Minimal & Compact) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 border border-teal-200 text-teal-700">
              <Compass className="w-3.5 h-3.5 text-teal-600" />
              Auto LeadFinder
            </span>
            <span className="text-xs text-slate-400 font-medium">
              Autonomous Locality Discovery Engine
            </span>
          </div>
          <PageHeader
            title="Auto LeadFinder"
            description={
              isKutchUser
                ? "Autonomous daily lead discovery system systematically covering localities of Kutch for Travel Agency leads."
                : `Autonomous daily lead discovery system for ${displayCity || 'your city'} targeting ${activeKeyword} leads.`
            }
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={handleRefreshAll}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-all cursor-pointer"
            title="Refresh statistics"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${refetchingSettings || refetchingHistory ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleTriggerManualRun}
            disabled={isTriggeringRun || isRunning}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-all cursor-pointer active:scale-95 ${
              isRunning ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700 disabled:opacity-50'
            }`}
          >
            {isTriggeringRun || isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Scraping Active...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Scraping Now</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. TOP PRIMARY CONFIGURATION CARD (All Primary Inputs Right at the Top) */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
        {/* Card Header with Status & Automation Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Search &amp; Scraping Preferences</h3>
              <p className="text-[11px] text-slate-500">
                Configure your target city, search keyword, and daily quota.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Master Toggle */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl text-xs">
              <span className="text-[11px] font-semibold text-slate-600">Daily Automation:</span>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  isActive ? 'bg-teal-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    isActive ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className={`text-[11px] font-bold ${isActive ? 'text-teal-700' : 'text-slate-400'}`}>
                {isActive ? 'ENABLED' : 'PAUSED'}
              </span>
            </div>
          </div>
        </div>

        {/* Inputs Grid: Location + Keyword + Daily Limit + Save Button */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* Input 1: Country (2 cols) */}
          <div className="lg:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-teal-600" />
              <span>Country</span>
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. India"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Input 2: State (2 cols) */}
          <div className="lg:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-teal-600" />
              <span>State / Province</span>
            </label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="e.g. Gujarat"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Input 3: City (2 cols) */}
          <div className="lg:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-teal-600" />
              <span>Target City</span>
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Bhuj, Ahmedabad..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          {/* Input 4: Target Industry Keyword (3 cols) */}
          <div className="lg:col-span-3 space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-teal-600" />
                <span>Industry Keyword</span>
              </label>
              {isKeywordFixed && (
                <span className="text-[10px] font-bold text-amber-700 flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5" /> Fixed
                </span>
              )}
            </div>
            <input
              type="text"
              disabled={isKeywordFixed}
              value={isKeywordFixed ? 'Travel Agency' : keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="e.g. Real Estate, Doctors..."
              className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                isKeywordFixed
                  ? 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                  : 'border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500'
              }`}
            />
          </div>

          {/* Input 5: Daily Limit (1.5 cols) */}
          <div className="lg:col-span-1.5 space-y-1">
            <label className="text-xs font-bold text-slate-700 block">
              Daily Limit
            </label>
            <select
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
            >
              <option value={100}>100 leads</option>
              <option value={250}>250 leads</option>
              <option value={500}>500 leads</option>
              <option value={1000}>1000 leads</option>
            </select>
          </div>

          {/* Action: Save Button (1.5 cols) */}
          <div className="lg:col-span-1.5">
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-2xs transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* Quick Niche Chips for Normal Users */}
        {!isKeywordFixed && (
          <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 font-medium">Quick Niches:</span>
            {NICHE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setKeywordInput(p)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                  keywordInput === p
                    ? 'bg-teal-50 border-teal-300 text-teal-700 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. MINIMAL 4-CARD KPI METRIC STRIP */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: Today's Collected */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Today&apos;s Collected</span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-slate-900">{todayCollected}</span>
              <span className="text-xs text-slate-400">/ {currentLimit}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-teal-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (todayCollected / (currentLimit || 1)) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Total Lifetime Leads */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Lifetime Leads</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-black text-slate-900">{totalCollected}</span>
            <span className="text-xs text-slate-400 ml-1">leads</span>
            <p className="text-[10px] text-slate-400 mt-1 truncate">Synced with Leads</p>
          </div>
        </div>

        {/* Card 3: Next in Queue */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Locality in Queue</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <MapPin className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xs font-bold text-slate-900 block truncate" title={currentLocalityName}>
              {discoveredAreas.length > 0 && discoveredAreas[currentAreaIndex]?.name
                ? `${discoveredAreas[currentAreaIndex].name}`
                : currentLocalityName}
            </span>
            <span className="text-[10px] text-teal-600 font-semibold block mt-0.5">
              {discoveredAreas.length > 0 ? `${discoveredAreas.length} Areas Discovered` : `${totalLocalities} Localities`}
            </span>
          </div>
        </div>

        {/* Card 4: Schedule Status */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Schedule Status</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className="text-xs font-bold text-slate-900">{isActive ? 'Active (Scheduled)' : 'Paused'}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 truncate">{nextRunTime}</p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. CLEAN TABS NAVIGATION */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-teal-400" />
          <span>Scraping Activity &amp; Discovered Areas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'tasks'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Timer className="w-3.5 h-3.5 text-teal-600" />
          <span>Scheduled Tasks &amp; Execution Monitor</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 2: SCHEDULED TASKS MONITOR */}
      {/* ========================================================================= */}
      {activeTab === 'tasks' && (
        <ScheduledTasksMonitor
          userEmail={effectiveEmail}
          isKutchUser={isKutchUser}
          onScheduleDeleted={handleRefreshAll}
        />
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: OVERVIEW & SCRAPING ACTIVITY */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Discovered Areas Status Bar (Clean & Compact) */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-bold text-slate-800">
                Active Location: <strong className="text-teal-700">{displayCity || city || 'Pending'}</strong>, {state || ''}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 border border-teal-200 text-teal-700">
                📮 {discoveredAreas.length} Discovered Postal Areas
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleTriggerDiscovery(true)}
                disabled={isDiscovering}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                title="Force refresh areas from Indian Postal PIN Code API"
              >
                <RotateCcw className={`w-3 h-3 ${isDiscovering ? 'animate-spin' : ''}`} />
                <span>Re-Discover PIN Areas</span>
              </button>

              {discoveredAreas.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAreasModal(!showAreasModal)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-50 hover:bg-teal-100/70 border border-teal-200 text-teal-700 transition-colors cursor-pointer"
                >
                  {showAreasModal ? 'Hide Areas' : `View ${discoveredAreas.length} Areas`}
                </button>
              )}

              {isKutchUser && (
                <button
                  type="button"
                  onClick={() => setShowCatalog(!showCatalog)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  {showCatalog ? 'Hide Kutch List' : `Kutch Catalog (${kutchCatalog.length || 38})`}
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Discovered Areas Grid (Compact) */}
          {showAreasModal && discoveredAreas.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-3 animate-in fade-in">
              <h4 className="text-xs font-bold text-slate-800">
                Discovered Postal Localities for {displayCity || city}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                {discoveredAreas.map((area: any, idx: number) => {
                  const isCurrent = idx === currentAreaIndex;
                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-xl border text-[11px] flex items-center justify-between gap-1.5 ${
                        isCurrent
                          ? 'bg-teal-50 border-teal-300 ring-1 ring-teal-500/20'
                          : 'bg-slate-50/50 border-slate-200/70'
                      }`}
                    >
                      <span className="font-semibold text-slate-800 truncate" title={area.name}>
                        {area.name}
                      </span>
                      {area.pincode && (
                        <span className="text-[9px] font-mono text-slate-400 shrink-0">
                          {area.pincode}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Collapsible Kutch Localities Catalog (for Kutch Tour Guide) */}
          {showCatalog && isKutchUser && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-3 animate-in fade-in">
              <h4 className="text-xs font-bold text-slate-800">
                Kutch Reference Locality Index ({kutchCatalog.length || 38} Localities)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                {kutchCatalog.map((loc: any, idx: number) => {
                  const isCurrent = idx === currentLocalityIndex;
                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-xl border text-[11px] flex items-center justify-between gap-1.5 ${
                        isCurrent ? 'bg-teal-50 border-teal-300 ring-1 ring-teal-500/20' : 'bg-slate-50/50 border-slate-200/70'
                      }`}
                    >
                      <span className="font-semibold text-slate-800 truncate" title={`${loc.locality}, ${loc.city}`}>
                        {loc.locality}
                      </span>
                      <span className="text-[9px] text-slate-400 shrink-0">#{idx + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Scraping Activity Table (Minimal & Clean) */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Recent Scraping History</h3>
                  <p className="text-[11px] text-slate-500">
                    Execution logs for <strong className="text-slate-700">{effectiveEmail}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <button
                  onClick={() => refetchHistory()}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors cursor-pointer"
                >
                  Refresh History
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 transition-colors cursor-pointer shadow-2xs"
                  title="Delete all schedules for this user"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Delete All Schedules</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3.5">Date &amp; Time (IST)</th>
                    <th className="py-2.5 px-3.5">Trigger</th>
                    <th className="py-2.5 px-3.5">Status</th>
                    <th className="py-2.5 px-3.5">Localities</th>
                    <th className="py-2.5 px-3.5">Leads Collected</th>
                    <th className="py-2.5 px-3.5">Duplicates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-teal-600" />
                        <span>Loading activity...</span>
                      </td>
                    </tr>
                  ) : !historyResponse || historyResponse.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        <Compass className="w-7 h-7 mx-auto mb-1 text-slate-300" />
                        <p className="font-semibold text-slate-600 text-xs">No Scraping Runs Recorded Yet</p>
                        <p className="text-[11px] text-slate-400">
                          Automated runs trigger at 12:00 AM IST or click &quot;Run Scraping Now&quot; above.
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
                          <td className="py-2.5 px-3.5 font-medium text-slate-800">
                            {startedAt}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              run.trigger_type === 'SCHEDULED'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}>
                              {run.trigger_type === 'SCHEDULED' ? 'Scheduled' : 'Manual'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
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
                          <td className="py-2.5 px-3.5">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {run.localities_processed && run.localities_processed.length > 0 ? (
                                run.localities_processed.slice(0, 3).map((l: any, i: number) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-medium"
                                  >
                                    {l.locality || l.city}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 text-[10px]">-</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 font-bold text-slate-900">
                            <span className="text-teal-600 font-extrabold">{run.total_collected || 0}</span>
                            <span className="text-slate-400 font-normal"> / {run.daily_limit_target || 100}</span>
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-500">
                            {run.duplicates_filtered || 0}
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

      {/* Confirmation Modal for Delete All Schedules */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete All Schedules?</h3>
                <p className="text-xs text-slate-500">
                  Target: <strong className="text-slate-700">{effectiveEmail}</strong>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete all schedules and execution runs for <strong className="text-slate-900">{effectiveEmail}</strong>? This will clear scheduled tasks and historical run records for this user only.
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 leading-normal">
              ⚠️ <strong>Strict User Isolation:</strong> This action will NOT delete or affect schedules belonging to any other user.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteAllSchedules}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete All Schedules</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
