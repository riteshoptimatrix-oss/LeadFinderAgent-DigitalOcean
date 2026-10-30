'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  X, User, Search, Target, Zap, Mail, MessageSquare, Activity, 
  MapPin, Clock, Calendar, CheckCircle, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight, Globe, Phone, ExternalLink, ShieldCheck,
  Building2, Smartphone, Inbox, ArrowUpRight, Filter
} from 'lucide-react';

interface UserDetailPanelProps {
  userId: string;
  onClose: () => void;
}

export default function UserDetailPanel({ userId, onClose }: UserDetailPanelProps) {
  const [activeTab, setActiveTab] = useState('profile');
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const limit = 15;

  // Handle Tab Switch
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setPage(1);
    setSearchTerm('');
  };

  // Fetch User Profile & Lifetime Stats
  const { 
    data: profileData, 
    isLoading: loadingProfile, 
    isError: errorProfile,
    refetch: refetchProfile 
  } = useQuery({
    queryKey: ['admin-user-profile', userId],
    queryFn: async () => {
      const res = await api.get(`/admin/users/${userId}/profile`);
      return res.data;
    },
    staleTime: 10000,
  });

  // Fetch Tab Specific Activity Data
  const { 
    data: activityData, 
    isLoading: loadingActivity, 
    isFetching: fetchingActivity,
    isError: errorActivity,
    error: activityErrorObj,
    refetch: refetchActivity 
  } = useQuery({
    queryKey: ['admin-user-activity', userId, activeTab, page, searchTerm],
    queryFn: async () => {
      if (activeTab === 'profile') return null;
      const res = await api.get(`/admin/users/${userId}/activity/${activeTab}`, {
        params: {
          skip: (page - 1) * limit,
          limit,
          ...(searchTerm ? { search: searchTerm } : {})
        }
      });
      return res.data;
    },
    enabled: activeTab !== 'profile',
    staleTime: 10000,
  });

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'timeline', label: 'Timeline', icon: Activity },
    { id: 'searches', label: 'Searches', icon: Search, count: profileData?.stats?.total_searches },
    { id: 'leads', label: 'Leads', icon: Target, count: profileData?.stats?.total_leads },
    { id: 'ai', label: 'AI Analysis', icon: Zap, count: profileData?.stats?.total_ai_analyses },
    { id: 'emails', label: 'Email', icon: Mail, count: profileData?.stats?.total_emails },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, count: profileData?.stats?.total_whatsapp },
  ];

  const user = profileData?.profile;
  const stats = profileData?.stats;

  const totalItems = activityData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const currentItems = activityData?.items || [];

  const handleRefresh = () => {
    if (activeTab === 'profile') {
      refetchProfile();
    } else {
      refetchActivity();
    }
  };

  const getStatusBadge = (status?: string) => {
    const s = (status || 'COMPLETED').toUpperCase();
    if (['COMPLETED', 'ACTIVE', 'VERIFIED', 'DELIVERED', 'READ'].includes(s)) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (['PENDING', 'QUEUED', 'PROCESSING', 'RUNNING'].includes(s)) {
      return 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse';
    }
    if (['FAILED', 'BOUNCED', 'ERROR'].includes(s)) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getTimelineIcon = (type: string, moduleName: string) => {
    if (moduleName === 'auth' || type === 'USER_REGISTER') return { icon: User, bg: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (moduleName === 'search' || type === 'SEARCH_JOB') return { icon: Search, bg: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    if (moduleName === 'leads' || type === 'LEAD_CREATED') return { icon: Target, bg: 'bg-rose-100 text-rose-700 border-rose-200' };
    if (moduleName === 'ai_analysis' || type === 'AI_ANALYSIS') return { icon: Zap, bg: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (moduleName === 'email' || type === 'EMAIL_CAMPAIGN') return { icon: Mail, bg: 'bg-purple-100 text-purple-700 border-purple-200' };
    if (moduleName === 'whatsapp' || type === 'WHATSAPP_CAMPAIGN') return { icon: MessageSquare, bg: 'bg-teal-100 text-teal-700 border-teal-200' };
    return { icon: ShieldCheck, bg: 'bg-slate-100 text-slate-700 border-slate-200' };
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-5xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-gray-900 to-gray-700 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              {user?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">{user?.full_name || 'User Profile'}</h2>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${user?.is_active !== false ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                  {user?.is_active !== false ? 'Active' : 'Disabled'}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 uppercase">
                  {user?.role || 'User'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">{user?.email}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              title="Refresh data"
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${fetchingActivity || loadingProfile ? 'animate-spin text-[#c1121f]' : ''}`} />
            </button>
            <button 
              onClick={onClose} 
              className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-gray-100 flex items-center justify-between bg-white shrink-0 overflow-x-auto hide-scrollbar">
          <div className="flex gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                    isActive
                      ? 'border-[#c1121f] text-[#c1121f] bg-red-50/30'
                      : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? 'bg-[#c1121f] text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/60">

          {/* 1. PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {loadingProfile ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-24 bg-white rounded-2xl border border-gray-100 p-4 animate-pulse" />
                    ))}
                  </div>
                </div>
              ) : errorProfile ? (
                <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <div className="flex-1 text-sm font-medium">Failed to load user profile details.</div>
                  <button onClick={() => refetchProfile()} className="px-3 py-1 bg-white rounded-lg border border-rose-200 text-xs font-bold hover:bg-rose-100 transition-colors">
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Company</p>
                        <p className="font-bold text-gray-900 text-base mt-0.5">{user?.company_name || 'Not provided'}</p>
                        <p className="text-xs text-gray-500 mt-1">{user?.industry || 'General Business'}</p>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact Phone</p>
                        <p className="font-bold text-gray-900 text-base mt-0.5">{user?.mobile_number || user?.phone || 'Not provided'}</p>
                        <p className="text-xs text-gray-500 mt-1">{user?.email}</p>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 shrink-0">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Location</p>
                        <p className="font-bold text-gray-900 text-base mt-0.5">
                          {[user?.city, user?.state, user?.country].filter(Boolean).join(', ') || 'Global / Unspecified'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{user?.timezone || 'UTC'}</p>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 shrink-0">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Registration Date</p>
                        <p className="font-bold text-gray-900 text-base mt-0.5">
                          {user?.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">User ID: <span className="font-mono text-[11px]">{userId}</span></p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-gray-900 tracking-tight">Lifetime Usage Statistics</h3>
                      <span className="text-xs text-gray-400 font-medium">Aggregated across all collections</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {[
                        { label: 'Searches', value: stats?.total_searches, icon: Search, color: 'text-blue-600', bg: 'bg-blue-50', tab: 'searches' },
                        { label: 'Leads Gathered', value: stats?.total_leads, icon: Target, color: 'text-emerald-600', bg: 'bg-emerald-50', tab: 'leads' },
                        { label: 'AI Scans', value: stats?.total_ai_analyses, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50', tab: 'ai' },
                        { label: 'Emails', value: stats?.total_emails, icon: Mail, color: 'text-purple-600', bg: 'bg-purple-50', tab: 'emails' },
                        { label: 'WhatsApp', value: stats?.total_whatsapp, icon: MessageSquare, color: 'text-teal-600', bg: 'bg-teal-50', tab: 'whatsapp' },
                      ].map((stat, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleTabChange(stat.tab)}
                          className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center hover:border-gray-300 hover:shadow-md transition-all group cursor-pointer"
                        >
                          <div className={`w-10 h-10 mx-auto rounded-xl ${stat.bg} flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform`}>
                            <stat.icon className={`w-5 h-5 ${stat.color}`} />
                          </div>
                          <h4 className="text-2xl font-black text-gray-900">{stat.value || 0}</h4>
                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mt-1">{stat.label}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ACTIVITY TABS (Timeline, Searches, Leads, AI, Emails, WhatsApp) */}
          {activeTab !== 'profile' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder={`Filter ${activeTab}...`}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    className="w-full pl-9 pr-4 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#c1121f]/20 focus:border-[#c1121f] outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-gray-500 font-medium">
                  <span>Total: <strong className="text-gray-900">{totalItems}</strong> records</span>
                </div>
              </div>

              {/* Error Alert */}
              {errorActivity && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Failed to load {activeTab} data. Please check connection or credentials.
                  </div>
                  <button 
                    onClick={() => refetchActivity()} 
                    className="px-3 py-1 bg-white rounded-lg border border-rose-200 text-xs font-bold hover:bg-rose-100 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Loading Skeleton */}
              {loadingActivity && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 animate-pulse">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-100 rounded w-1/3" />
                        <div className="h-2 bg-gray-100 rounded w-1/2" />
                      </div>
                      <div className="w-20 h-5 bg-gray-100 rounded-full" />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!loadingActivity && !errorActivity && currentItems.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto mb-3">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-900">No {activeTab} records found</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                    {searchTerm 
                      ? `No results matching "${searchTerm}". Try clearing your search filter.`
                      : `The user has not generated any records under this module yet.`}
                  </p>
                </div>
              )}

              {/* Content Renderers */}
              {!loadingActivity && !errorActivity && currentItems.length > 0 && (
                <>
                  {/* 2. TIMELINE VIEW */}
                  {activeTab === 'timeline' && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                      <div className="relative border-l-2 border-gray-200 ml-4 pl-6 space-y-6">
                        {currentItems.map((event: any, idx: number) => {
                          const config = getTimelineIcon(event.activity_type, event.module);
                          const EventIcon = config.icon;
                          return (
                            <div key={event._id || idx} className="relative group">
                              <div className={`absolute -left-[35px] top-1 w-6 h-6 rounded-full border-2 flex items-center justify-center bg-white shadow-sm ${config.bg}`}>
                                <EventIcon className="w-3 h-3" />
                              </div>

                              <div className="bg-slate-50/70 hover:bg-slate-50 transition-colors p-4 rounded-xl border border-gray-100">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-bold text-gray-900">{event.title}</h4>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getStatusBadge(event.status)}`}>
                                      {event.status || 'COMPLETED'}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-medium text-gray-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {event.created_at ? new Date(event.created_at).toLocaleString() : 'Recent'}
                                  </span>
                                </div>

                                <p className="text-xs text-gray-600 leading-relaxed">{event.description}</p>

                                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                                  <span className="bg-white border border-gray-200 px-2 py-0.5 rounded-md">
                                    Module: {event.module}
                                  </span>
                                  <span className="bg-white border border-gray-200 px-2 py-0.5 rounded-md">
                                    Action: {event.activity_type}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. SEARCHES TAB */}
                  {activeTab === 'searches' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                              <th className="py-3 px-4">Date & Time</th>
                              <th className="py-3 px-4">Query / Keyword</th>
                              <th className="py-3 px-4">Location</th>
                              <th className="py-3 px-4">Provider</th>
                              <th className="py-3 px-4 text-center">Leads Found</th>
                              <th className="py-3 px-4 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {currentItems.map((job: any) => (
                              <tr key={job._id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-4 text-gray-500 whitespace-nowrap font-medium">
                                  {job.created_at ? new Date(job.created_at).toLocaleString() : 'N/A'}
                                </td>
                                <td className="py-3 px-4">
                                  <p className="font-bold text-gray-900">{job.keyword || 'Search query'}</p>
                                  {job.search_type && (
                                    <span className="text-[10px] font-medium text-gray-400 capitalize">{job.search_type}</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-gray-600">
                                  <div className="flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                    <span>{job.location || [job.city, job.state, job.country].filter(Boolean).join(', ') || 'Global'}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-gray-600 uppercase font-mono text-[10px]">
                                  {job.provider || 'Google Maps'}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700">
                                    {job.completed_leads || job.total_found || 0}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getStatusBadge(job.status)}`}>
                                    {job.status || 'COMPLETED'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 4. LEADS TAB */}
                  {activeTab === 'leads' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                              <th className="py-3 px-4">Lead / Company</th>
                              <th className="py-3 px-4">Contact Info</th>
                              <th className="py-3 px-4">Location</th>
                              <th className="py-3 px-4">Source</th>
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4 text-right">Created</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {currentItems.map((lead: any) => (
                              <tr key={lead._id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-4">
                                  <p className="font-bold text-gray-900">{lead.name || lead.company_name || 'Business Lead'}</p>
                                  {lead.website && (
                                    <a 
                                      href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                                    >
                                      <Globe className="w-3 h-3" />
                                      <span className="truncate max-w-[180px]">{lead.website.replace(/^https?:\/\//, '')}</span>
                                      <ArrowUpRight className="w-3 h-3" />
                                    </a>
                                  )}
                                </td>
                                <td className="py-3 px-4 space-y-1">
                                  {lead.phone && (
                                    <div className="flex items-center gap-1.5 text-gray-700">
                                      <Phone className="w-3 h-3 text-gray-400" />
                                      <span>{lead.phone}</span>
                                    </div>
                                  )}
                                  {lead.email && (
                                    <div className="flex items-center gap-1.5 text-gray-700">
                                      <Mail className="w-3 h-3 text-gray-400" />
                                      <span className="truncate max-w-[160px]">{lead.email}</span>
                                    </div>
                                  )}
                                  {!lead.phone && !lead.email && (
                                    <span className="text-gray-400 italic">No direct contact</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-gray-600">
                                  {lead.location || [lead.city, lead.state, lead.country].filter(Boolean).join(', ') || 'N/A'}
                                </td>
                                <td className="py-3 px-4 text-gray-600">
                                  <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px] font-medium uppercase">
                                    {lead.source || 'Scraper'}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getStatusBadge(lead.status)}`}>
                                    {lead.status || 'VERIFIED'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right text-gray-500 whitespace-nowrap font-medium">
                                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 5. AI ANALYSIS TAB */}
                  {activeTab === 'ai' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                              <th className="py-3 px-4">Date</th>
                              <th className="py-3 px-4">Analyzed Target</th>
                              <th className="py-3 px-4 text-center">Score</th>
                              <th className="py-3 px-4">Details / Pages</th>
                              <th className="py-3 px-4 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {currentItems.map((job: any) => {
                              const score = job.score ?? job.overall_ai_score ?? job.seo_score;
                              return (
                                <tr key={job._id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-3 px-4 text-gray-500 whitespace-nowrap font-medium">
                                    {job.created_at ? new Date(job.created_at).toLocaleDateString() : 'N/A'}
                                  </td>
                                  <td className="py-3 px-4">
                                    <p className="font-bold text-gray-900">{job.lead_name || 'Website Analysis'}</p>
                                    {job.website_url && (
                                      <a 
                                        href={job.website_url} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                                      >
                                        <Globe className="w-3 h-3" />
                                        <span className="truncate max-w-[200px]">{job.website_url}</span>
                                        <ArrowUpRight className="w-3 h-3" />
                                      </a>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    {score !== null && score !== undefined ? (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black ${
                                        score >= 80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                        score >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                        'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}>
                                        {score}/100
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 italic">No score</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-gray-600">
                                    <div className="flex items-center gap-2 text-[11px]">
                                      <span>Pages: {job.total_pages || 1}</span>
                                      {job.analysis_type && (
                                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] uppercase font-medium">
                                          {job.analysis_type}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getStatusBadge(job.status)}`}>
                                      {job.status || 'COMPLETED'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 6. EMAIL TAB */}
                  {activeTab === 'emails' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                              <th className="py-3 px-4">Date</th>
                              <th className="py-3 px-4">Campaign Name</th>
                              <th className="py-3 px-4">Subject</th>
                              <th className="py-3 px-4 text-center">Sent Count</th>
                              <th className="py-3 px-4 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {currentItems.map((c: any) => (
                              <tr key={c._id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-4 text-gray-500 whitespace-nowrap font-medium">
                                  {c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A'}
                                </td>
                                <td className="py-3 px-4">
                                  <p className="font-bold text-gray-900">{c.campaign_name || 'Email Outreach'}</p>
                                </td>
                                <td className="py-3 px-4 text-gray-600">
                                  <p className="truncate max-w-sm">{c.subject || 'Direct message'}</p>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700">
                                    {c.sent_count || c.total_sent || 0}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getStatusBadge(c.status)}`}>
                                    {c.status || 'COMPLETED'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 7. WHATSAPP TAB */}
                  {activeTab === 'whatsapp' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                              <th className="py-3 px-4">Date</th>
                              <th className="py-3 px-4">Campaign Name</th>
                              <th className="py-3 px-4">Template</th>
                              <th className="py-3 px-4 text-center">Messages Sent</th>
                              <th className="py-3 px-4 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {currentItems.map((wa: any) => (
                              <tr key={wa._id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-4 text-gray-500 whitespace-nowrap font-medium">
                                  {wa.created_at ? new Date(wa.created_at).toLocaleDateString() : 'N/A'}
                                </td>
                                <td className="py-3 px-4">
                                  <p className="font-bold text-gray-900">{wa.campaign_name || 'WhatsApp Broadcast'}</p>
                                </td>
                                <td className="py-3 px-4 text-gray-600">
                                  <span className="bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded font-mono text-[10px]">
                                    {wa.template_name || 'Standard'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700">
                                    {wa.sent_count || wa.total_sent || 0}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getStatusBadge(wa.status)}`}>
                                    {wa.status || 'COMPLETED'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Pagination Footer */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm">
                      <span className="text-xs text-gray-500 font-medium">
                        Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalItems)} of {totalItems}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-semibold px-2 text-gray-700">
                          {page} / {totalPages}
                        </span>
                        <button
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page >= totalPages}
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
