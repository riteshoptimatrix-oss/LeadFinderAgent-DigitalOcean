'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  X, User, Search, Target, Zap, Mail, MessageSquare, Activity, 
  MapPin, Clock, Calendar, CheckCircle2, AlertCircle, RefreshCw,
  ExternalLink, Globe, Phone, ChevronLeft, ChevronRight, ShieldCheck,
  Building, CheckCheck, Loader2
} from 'lucide-react';

interface UserDetailPanelProps {
  userId: string;
  onClose: () => void;
}

export default function UserDetailPanel({ userId, onClose }: UserDetailPanelProps) {
  const [activeTab, setActiveTab] = useState('profile');
  const [page, setPage] = useState(0);
  const pageSize = 15;

  // 1. Fetch Profile and Lifetime Usage Statistics
  const { 
    data: profileData, 
    isLoading: loadingProfile,
    refetch: refetchProfile 
  } = useQuery({
    queryKey: ['admin-user-profile', userId],
    queryFn: async () => {
      const res = await api.get(`/admin/users/${userId}/profile`);
      return res.data;
    },
    refetchInterval: 15000,
  });

  // 2. Fetch Activity Data for Currently Active Tab
  const { 
    data: activityData, 
    isLoading: loadingActivity, 
    isFetching: fetchingActivity,
    isError: errorActivity,
    refetch: refetchActivity 
  } = useQuery({
    queryKey: ['admin-user-activity', userId, activeTab, page],
    queryFn: async () => {
      if (activeTab === 'profile') return null;
      const res = await api.get(`/admin/users/${userId}/activity/${activeTab}`, {
        params: {
          skip: page * pageSize,
          limit: pageSize,
        }
      });
      return res.data;
    },
    enabled: activeTab !== 'profile',
    refetchInterval: 15000,
  });

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setPage(0);
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'timeline', label: 'Timeline', icon: Activity },
    { id: 'searches', label: 'Searches', icon: Search },
    { id: 'leads', label: 'Leads', icon: Target },
    { id: 'ai', label: 'AI Analysis', icon: Zap },
    { id: 'emails', label: 'Email', icon: Mail },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  ];

  const user = profileData?.profile;
  const stats = profileData?.stats;
  const items = activityData?.items || [];
  const totalItems = activityData?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Status Badge Helper
  const renderStatusBadge = (statusStr?: string) => {
    const s = (statusStr || 'Completed').toUpperCase();
    if (['COMPLETED', 'ACTIVE', 'DELIVERED', 'SAVED', 'SENT'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {statusStr || 'Completed'}
        </span>
      );
    }
    if (['IN_PROGRESS', 'SEARCHING', 'ANALYZING', 'RUNNING', 'PROCESSING'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
          {statusStr || 'Processing'}
        </span>
      );
    }
    if (['PENDING', 'QUEUED', 'WAITING'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {statusStr || 'Queued'}
        </span>
      );
    }
    if (['FAILED', 'ERROR', 'BLOCKED'].includes(s)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          {statusStr || 'Failed'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-700">
        {statusStr || 'Recorded'}
      </span>
    );
  };

  // Format Date & Time Helper
  const formatDateTime = (dateVal?: string | Date) => {
    if (!dateVal) return '—';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal);
      return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return String(dateVal);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs transition-opacity">
      <div className="w-full max-w-5xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center text-white font-bold text-base shadow-sm">
              {user?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">{user?.full_name || 'User Profile'}</h2>
                {user?.role && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                    {user.role}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 font-medium">{user?.email}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refetchProfile();
                if (activeTab !== 'profile') refetchActivity();
              }}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${fetchingActivity ? 'animate-spin text-blue-600' : ''}`} />
            </button>
            <button 
              onClick={onClose} 
              className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              title="Close Panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-gray-100 flex overflow-x-auto hide-scrollbar bg-white shrink-0">
          <div className="flex gap-6">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 py-3.5 text-sm font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'border-[#c1121f] text-[#c1121f]'
                      : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-200'
                  }`}
                >
                  <tab.icon className={`w-4 h-4 ${isActive ? 'text-[#c1121f]' : 'text-gray-400'}`} />
                  {tab.label}
                  {tab.id !== 'profile' && tab.id !== 'timeline' && stats && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-[#c1121f]/10 text-[#c1121f]' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tab.id === 'searches' && (stats.total_searches || 0)}
                      {tab.id === 'leads' && (stats.total_leads || 0)}
                      {tab.id === 'ai' && (stats.total_ai_analyses || 0)}
                      {tab.id === 'emails' && (stats.total_emails || 0)}
                      {tab.id === 'whatsapp' && (stats.total_whatsapp || 0)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/60">
          
          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {loadingProfile ? (
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 h-24 animate-pulse" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Company</p>
                      <p className="font-bold text-gray-900 text-sm">{user?.company_name || 'Not provided'}</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Mobile Number</p>
                      <p className="font-bold text-gray-900 text-sm font-mono">{user?.mobile_number || 'Not provided'}</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Location</p>
                      <p className="font-bold text-gray-900 text-sm">
                        {[user?.city, user?.state, user?.country].filter(Boolean).join(', ') || 'Global'}
                      </p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-2xs">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Registration Date</p>
                      <p className="font-bold text-gray-900 text-sm">{formatDateTime(user?.created_at)}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">Lifetime Usage Statistics</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
                      {[
                        { label: 'Searches', value: stats?.total_searches, icon: Search, color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: 'Leads', value: stats?.total_leads, icon: Target, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                        { label: 'AI Scans', value: stats?.total_ai_analyses, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
                        { label: 'Emails', value: stats?.total_emails, icon: Mail, color: 'text-purple-600', bg: 'bg-purple-50' },
                        { label: 'WhatsApp', value: stats?.total_whatsapp, icon: MessageSquare, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                      ].map((stat, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-gray-100 shadow-2xs text-center flex flex-col items-center">
                          <div className={`w-9 h-9 rounded-full ${stat.bg} flex items-center justify-center mb-2.5 shadow-2xs`}>
                            <stat.icon className={`w-4 h-4 ${stat.color}`} />
                          </div>
                          <h4 className="text-xl font-extrabold text-gray-900">{stat.value || 0}</h4>
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-1">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {loadingActivity ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-gray-100 h-20 animate-pulse" />
                  ))}
                </div>
              ) : errorActivity ? (
                <div className="bg-white rounded-2xl p-8 border border-red-100 text-center">
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-gray-900">Failed to load activity timeline</p>
                  <button 
                    onClick={() => refetchActivity()}
                    className="mt-3 px-4 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 border border-gray-100 text-center shadow-2xs">
                  <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-gray-800">No activity recorded yet</h4>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                    Actions taken by this user such as searches, lead exports, and AI audits will appear here in chronological order.
                  </p>
                </div>
              ) : (
                <div className="relative border-l-2 border-blue-200/60 ml-4 pl-6 space-y-5">
                  {items.map((log: any) => {
                    const moduleColor = 
                      log.module === 'search' ? 'border-blue-500 bg-blue-50 text-blue-700' :
                      log.module === 'ai' ? 'border-amber-500 bg-amber-50 text-amber-700' :
                      log.module === 'leads' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                      log.module === 'emails' ? 'border-purple-500 bg-purple-50 text-purple-700' :
                      log.module === 'whatsapp' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' :
                      'border-gray-500 bg-gray-50 text-gray-700';

                    return (
                      <div key={log._id} className="relative group">
                        <div className={`absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#c1121f] ring-4 ring-white shadow-xs`} />
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-2xs hover:border-gray-200 transition-all">
                          <div className="flex justify-between items-start gap-2 mb-1.5">
                            <h4 className="font-bold text-gray-900 text-sm">{log.title}</h4>
                            <span className="text-[11px] font-semibold text-gray-400 shrink-0">
                              {formatDateTime(log.created_at)}
                            </span>
                          </div>
                          {log.description && (
                            <p className="text-xs text-gray-600 leading-relaxed mb-2.5">{log.description}</p>
                          )}
                          <div className="flex items-center justify-between pt-1 border-t border-gray-50">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${moduleColor}`}>
                                {log.module || 'SYSTEM'}
                              </span>
                              {log.activity_type && (
                                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                                  {log.activity_type}
                                </span>
                              )}
                            </div>
                            {renderStatusBadge(log.status)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TABS 3-7: SEARCHES, LEADS, AI ANALYSIS, EMAIL, WHATSAPP */}
          {['searches', 'leads', 'ai', 'emails', 'whatsapp'].includes(activeTab) && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100">
                        <th className="py-3 px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-40">Date</th>
                        <th className="py-3 px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          {activeTab === 'searches' && 'Search Query & Parameters'}
                          {activeTab === 'leads' && 'Lead & Contact Details'}
                          {activeTab === 'ai' && 'Website & Audit Target'}
                          {activeTab === 'emails' && 'Campaign & Subject'}
                          {activeTab === 'whatsapp' && 'Campaign / Contact'}
                        </th>
                        <th className="py-3 px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-36 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {loadingActivity ? (
                        [1, 2, 3, 4, 5].map((i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="py-3.5 px-4"><div className="h-3.5 w-24 bg-gray-200 rounded" /></td>
                            <td className="py-3.5 px-4"><div className="h-3.5 w-64 bg-gray-200 rounded mb-1" /><div className="h-2.5 w-40 bg-gray-100 rounded" /></td>
                            <td className="py-3.5 px-4 text-right"><div className="h-5 w-16 bg-gray-100 rounded-full ml-auto" /></td>
                          </tr>
                        ))
                      ) : errorActivity ? (
                        <tr>
                          <td colSpan={3} className="py-10 text-center">
                            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                            <p className="text-sm font-semibold text-gray-900">Failed to load activity records</p>
                            <button
                              onClick={() => refetchActivity()}
                              className="mt-3 px-4 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
                            >
                              Try Again
                            </button>
                          </td>
                        </tr>
                      ) : items.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-12 text-center">
                            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-2 text-gray-400">
                              {activeTab === 'searches' && <Search className="w-5 h-5" />}
                              {activeTab === 'leads' && <Target className="w-5 h-5" />}
                              {activeTab === 'ai' && <Zap className="w-5 h-5" />}
                              {activeTab === 'emails' && <Mail className="w-5 h-5" />}
                              {activeTab === 'whatsapp' && <MessageSquare className="w-5 h-5" />}
                            </div>
                            <p className="text-sm font-bold text-gray-800">
                              {activeTab === 'searches' && 'No searches recorded for this user'}
                              {activeTab === 'leads' && 'No leads captured by this user'}
                              {activeTab === 'ai' && 'No AI website audits run yet'}
                              {activeTab === 'emails' && 'No email campaigns recorded'}
                              {activeTab === 'whatsapp' && 'No WhatsApp activity recorded'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                              Records will be synchronized here automatically when operations are executed.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        items.map((item: any) => (
                          <tr key={item._id} className="hover:bg-gray-50/60 transition-colors">
                            {/* Date Column */}
                            <td className="py-3 px-4 text-xs font-semibold text-gray-600 whitespace-nowrap">
                              {formatDateTime(item.created_at || item.analyzed_at || item.started_at)}
                            </td>

                            {/* Details Column tailored per module */}
                            <td className="py-3 px-4">
                              {activeTab === 'searches' && (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-900">{item.keyword}</span>
                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.2 rounded-full border border-blue-100">
                                      {item.provider || 'Google Maps'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-gray-400" />
                                      {item.location}
                                    </span>
                                    <span>•</span>
                                    <span className="font-medium text-gray-700">
                                      {item.total_found || 0} leads discovered
                                    </span>
                                  </div>
                                </div>
                              )}

                              {activeTab === 'leads' && (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-900">{item.name}</span>
                                    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.2 rounded uppercase">
                                      {item.category || 'REAL ESTATE'}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-gray-500">
                                    {item.phone && <span className="font-mono text-gray-700">{item.phone}</span>}
                                    {item.email && <span className="text-blue-600">{item.email}</span>}
                                    {item.website && (
                                      <a 
                                        href={item.website.startsWith('http') ? item.website : `https://${item.website}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="text-blue-600 hover:underline flex items-center gap-0.5"
                                      >
                                        {item.website.replace(/^https?:\/\/(www\.)?/, '')}
                                        <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    )}
                                    {item.location && <span>📍 {item.location}</span>}
                                  </div>
                                </div>
                              )}

                              {activeTab === 'ai' && (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-900">{item.name}</span>
                                    {item.overall_score > 0 && (
                                      <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.2 rounded-full border border-purple-200">
                                        Score: {item.overall_score}%
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    {item.domain && (
                                      <span className="font-mono text-blue-600 flex items-center gap-1">
                                        <Globe className="w-3 h-3 text-blue-500" />
                                        {item.domain}
                                      </span>
                                    )}
                                    {item.stage && <span>• Stage: {item.stage}</span>}
                                  </div>
                                </div>
                              )}

                              {activeTab === 'emails' && (
                                <div className="space-y-0.5">
                                  <p className="text-sm font-bold text-gray-900">{item.campaign_name}</p>
                                  <p className="text-xs text-gray-500">Subject: {item.subject} • {item.recipient}</p>
                                </div>
                              )}

                              {activeTab === 'whatsapp' && (
                                <div className="space-y-0.5">
                                  <p className="text-sm font-bold text-gray-900">{item.campaign_name}</p>
                                  <p className="text-xs text-gray-500">{item.phone} • {item.message}</p>
                                </div>
                              )}
                            </td>

                            {/* Status Column */}
                            <td className="py-3 px-4 text-right">
                              {renderStatusBadge(item.status)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalItems > pageSize && (
                  <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      Showing <strong className="text-gray-900">{page * pageSize + 1}</strong> to <strong className="text-gray-900">{Math.min((page + 1) * pageSize, totalItems)}</strong> of <strong className="text-gray-900">{totalItems}</strong> records
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        disabled={page === 0}
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        className="p-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-2 font-bold text-gray-800">
                        {page + 1} / {totalPages || 1}
                      </span>
                      <button
                        disabled={(page + 1) >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="p-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
