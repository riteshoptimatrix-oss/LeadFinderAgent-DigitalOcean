'use client';

import React from 'react';
import {
  X, User, Mail, Phone, Building2, MapPin, Calendar, Clock,
  ShieldCheck, LogIn, Target, Search, Zap, Send, Compass, MessageSquare
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { EmailProviderBadge } from '@/src/components/common/EmailProviderBadge';


interface UserDetailsModalProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onImpersonate: (user: any) => void;
}

export default function UserDetailsModal({ userId, isOpen, onClose, onImpersonate }: UserDetailsModalProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-user-details', userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await api.get(`/admin/users/${userId}`);
      return res.data;
    },
    enabled: isOpen && !!userId,
  });

  if (!isOpen || !userId) return null;

  const user = data?.user;
  const stats = data?.stats;
  const emailConfigStatus = data?.email_config_status;
  const emailProvider = user?.email_provider;

  const initial = (user?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
              {initial}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">{user?.full_name || 'User Profile'}</h3>
                {user?.role && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60 uppercase">
                    {user.role}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mb-3" />
              <span>Loading user profile...</span>
            </div>
          ) : isError || !user ? (
            <div className="py-8 text-center text-rose-600 text-xs font-medium">
              Failed to load user details.
            </div>
          ) : (
            <>
              {/* Account Quick Status Strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/70">
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Status</span>
                    <StatusBadge status={user.account_status || (user.is_active ? 'Active' : 'Suspended')} className="mt-0.5" />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onClose();
                      onImpersonate(user);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Login as this User</span>
                  </button>
                </div>
              </div>

              {/* Statistics Overview */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">User Workspace Usage</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <Search className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-medium">Searches</span>
                    </div>
                    <span className="text-xl font-bold text-slate-900">{stats?.total_searches || 0}</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <Target className="w-3.5 h-3.5 text-rose-600" />
                      <span className="text-xs font-medium">Leads</span>
                    </div>
                    <span className="text-xl font-bold text-slate-900">{stats?.total_leads || 0}</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <Zap className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-xs font-medium">AI Analyses</span>
                    </div>
                    <span className="text-xl font-bold text-slate-900">{stats?.total_ai_analyses || 0}</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <Send className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-xs font-medium">Campaigns</span>
                    </div>
                    <span className="text-xl font-bold text-slate-900">
                      {(stats?.total_emails || 0) + (stats?.total_whatsapp || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Email Provider & Configuration Card */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Email Provider &amp; Automation Status
                </h4>
                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                  <div className="sm:col-span-2 flex flex-col gap-1.5">
                    <EmailProviderBadge
                      providerName={emailProvider?.provider_name}
                      logoKey={emailProvider?.logo_key}
                      detectionStatus={emailProvider?.detection_status}
                      detectionMethod={emailProvider?.detection_method}
                      showStatus={true}
                    />
                    <div className="text-[11px] text-slate-500">
                      Registered Email: <span className="font-mono font-semibold text-slate-700">{user.email}</span>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      SMTP Config Status
                    </span>
                    {emailConfigStatus?.configured ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {emailConfigStatus.smtp_status === 'CONNECTED' ? 'Connected' : emailConfigStatus.smtp_status}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        Not Configured
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Information Grid */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Account Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/50 flex items-center gap-3">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Email</span>
                      <span className="text-slate-800 font-medium">{user.email}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/50 flex items-center gap-3">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Mobile</span>
                      <span className="text-slate-800 font-medium">{user.mobile_number || 'Not provided'}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/50 flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Company</span>
                      <span className="text-slate-800 font-medium">{user.company_name || 'Not provided'}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/50 flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Location</span>
                      <span className="text-slate-800 font-medium">
                        {[user.state, user.country].filter(Boolean).join(', ') || 'Not provided'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/50 flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Registered On</span>
                      <span className="text-slate-800 font-medium">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/50 flex items-center gap-3">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Last Active Login</span>
                      <span className="text-slate-800 font-medium">
                        {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never logged in'}
                      </span>
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${user.auto_leadfinder_access
                    ? 'bg-teal-50/60 border-teal-200/60'
                    : 'bg-slate-100/80 border-slate-200'
                    }`}>
                    <Compass className={`w-4 h-4 shrink-0 ${user.auto_leadfinder_access ? 'text-teal-600' : 'text-slate-400'
                      }`} />
                    <div>
                      <span className={`text-[10px] block font-bold uppercase tracking-wider ${user.auto_leadfinder_access ? 'text-teal-700' : 'text-slate-500'
                        }`}>Auto LeadFinder Access</span>
                      <span className={`font-bold ${user.auto_leadfinder_access ? 'text-slate-900' : 'text-slate-600'
                        }`}>
                        {user.auto_leadfinder_access
                          ? `Enabled (${user.email?.toLowerCase() === 'kutchtourguide@gmail.com' ? 'Travel Agency [Fixed]' : (user.auto_leadfinder_keyword || 'Travel Agency')})`
                          : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${user.easyadserver_access
                    ? 'bg-emerald-50/60 border-emerald-200/60'
                    : 'bg-slate-100/80 border-slate-200'
                    }`}>
                    <Send className={`w-4 h-4 shrink-0 ${user.easyadserver_access ? 'text-emerald-600' : 'text-slate-400'
                      }`} />
                    <div>
                      <span className={`text-[10px] block font-bold uppercase tracking-wider ${user.easyadserver_access ? 'text-emerald-700' : 'text-slate-500'
                        }`}>EasyAdServer Access</span>
                      <span className={`font-bold ${user.easyadserver_access ? 'text-slate-900' : 'text-slate-600'
                        }`}>
                        {user.easyadserver_access
                          ? `Enabled ${user.easyadserver_token ? '(Token Configured)' : '(No Token Set)'}`
                          : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${user.email_automation_access
                    ? 'bg-orange-50/60 border-orange-200/60'
                    : 'bg-slate-100/80 border-slate-200'
                    }`}>
                    <Mail className={`w-4 h-4 shrink-0 ${user.email_automation_access ? 'text-orange-600' : 'text-slate-400'
                      }`} />
                    <div>
                      <span className={`text-[10px] block font-bold uppercase tracking-wider ${user.email_automation_access ? 'text-orange-700' : 'text-slate-500'
                        }`}>Email Automation Access</span>
                      <span className={`font-bold ${user.email_automation_access ? 'text-slate-900' : 'text-slate-600'
                        }`}>
                        {user.email_automation_access ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  <div className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${user.whatsapp_automation_access
                    ? 'bg-emerald-50/60 border-emerald-200/60'
                    : 'bg-slate-100/80 border-slate-200'
                    }`}>
                    <MessageSquare className={`w-4 h-4 shrink-0 ${user.whatsapp_automation_access ? 'text-emerald-600' : 'text-slate-400'
                      }`} />
                    <div>
                      <span className={`text-[10px] block font-bold uppercase tracking-wider ${user.whatsapp_automation_access ? 'text-emerald-700' : 'text-slate-500'
                        }`}>WhatsApp Automation Access</span>
                      <span className={`font-bold ${user.whatsapp_automation_access ? 'text-slate-900' : 'text-slate-600'
                        }`}>
                        {user.whatsapp_automation_access ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
