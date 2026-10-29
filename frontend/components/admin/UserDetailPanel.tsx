'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  X, User, Search, Target, Zap, Mail, MessageSquare, Activity, 
  MapPin, Clock, Calendar, CheckCircle, AlertCircle
} from 'lucide-react';

export default function UserDetailPanel({ userId, onClose }: { userId: string, onClose: () => void }) {
  const [activeTab, setActiveTab] = useState('profile');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-user-profile', userId],
    queryFn: async () => {
      const res = await api.get(`/admin/users/${userId}/profile`);
      return res.data;
    },
  });

  const { data: activityData, isLoading: loadingActivity } = useQuery({
    queryKey: ['admin-user-activity', userId, activeTab],
    queryFn: async () => {
      if (activeTab === 'profile') return null;
      const res = await api.get(`/admin/users/${userId}/activity/${activeTab}`);
      return res.data;
    },
    enabled: activeTab !== 'profile',
  });

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'timeline', label: 'Timeline', icon: Activity },
    { id: 'searches', label: 'Searches', icon: Search },
    { id: 'leads', label: 'Leads', icon: Target },
    { id: 'ai', label: 'AI Analysis', icon: Zap },
    { id: 'emails', label: 'Email', icon: Mail },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  ];

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm">
        <div className="w-full max-w-4xl bg-white h-full shadow-2xl flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#c1121f]"></div>
        </div>
      </div>
    );
  }

  const user = data?.profile;
  const stats = data?.stats;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-4xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold text-lg">
              {user?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{user?.full_name || 'N/A'}</h2>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-100 flex overflow-x-auto hide-scrollbar bg-white shrink-0">
          <div className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-[#c1121f] text-[#c1121f]'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">Company</p>
                  <p className="font-semibold text-gray-900">{user?.company_name || 'Not provided'}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">Mobile Number</p>
                  <p className="font-semibold text-gray-900">{user?.mobile_number || 'Not provided'}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">Location</p>
                  <p className="font-semibold text-gray-900">{user?.city ? `${user.city}, ` : ''}{user?.state || ''} {user?.country || ''}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500 mb-1">Registration Date</p>
                  <p className="font-semibold text-gray-900">{new Date(user?.created_at).toLocaleString()}</p>
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-900 mt-8 mb-4">Lifetime Usage Statistics</h3>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                {[
                  { label: 'Searches', value: stats?.total_searches, icon: Search, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Leads', value: stats?.total_leads, icon: Target, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'AI Scans', value: stats?.total_ai_analyses, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Emails', value: stats?.total_emails, icon: Mail, color: 'text-purple-600', bg: 'bg-purple-50' },
                  { label: 'WhatsApp', value: stats?.total_whatsapp, icon: MessageSquare, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                ].map((stat, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
                    <div className={`w-10 h-10 mx-auto rounded-full ${stat.bg} flex items-center justify-center mb-3`}>
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <h4 className="text-xl font-bold text-gray-900">{stat.value || 0}</h4>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline Tab */}
          {activeTab === 'timeline' && (
            <div className="space-y-4 animate-in fade-in">
              {loadingActivity ? (
                <div className="text-center text-sm text-gray-500 py-10">Loading timeline...</div>
              ) : activityData?.items?.length === 0 ? (
                <div className="text-center text-sm text-gray-500 py-10">No activity recorded yet.</div>
              ) : (
                <div className="relative border-l-2 border-gray-200 ml-4 pl-6 space-y-6">
                  {activityData?.items?.map((log: any) => (
                    <div key={log._id} className="relative">
                      <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-white border-2 border-[#c1121f]" />
                      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-gray-900">{log.title}</h4>
                          <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded-md">
                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {log.description && <p className="text-sm text-gray-600">{log.description}</p>}
                        <div className="mt-3 flex items-center gap-3 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                          <span className="bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">{log.module}</span>
                          <span className="bg-gray-50 border border-gray-100 px-2 py-0.5 rounded">{log.activity_type}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Generic Table for other tabs */}
          {['searches', 'leads', 'ai', 'emails', 'whatsapp'].includes(activeTab) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="py-3 px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Date</th>
                      <th className="py-3 px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Details</th>
                      <th className="py-3 px-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {loadingActivity ? (
                      <tr><td colSpan={3} className="py-8 text-center text-sm text-gray-500">Loading data...</td></tr>
                    ) : activityData?.items?.length === 0 ? (
                      <tr><td colSpan={3} className="py-8 text-center text-sm text-gray-500">No records found.</td></tr>
                    ) : (
                      activityData?.items?.map((item: any) => (
                        <tr key={item._id} className="hover:bg-gray-50/50">
                          <td className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">
                            {new Date(item.created_at || item.analyzed_at || item.audited_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm font-semibold text-gray-900">
                              {item.keyword || item.name || item.domain || item.campaign_name || 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500 truncate max-w-sm">
                              {item.location || item.email || item.url || item.subject || ''}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600">
                              {item.status || 'Completed'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
