'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { ShieldCheck, KeyRound, Lock, Activity, FileCheck2, Fingerprint, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const passwordSchema = z.object({
  old_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ["confirm_password"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function SecuritySettings({ setHasUnsavedChanges }: { setHasUnsavedChanges: (val: boolean) => void }) {
  const queryClient = useQueryClient();

  const { data: securityLogs, isLoading: loadingLogs } = useQuery({
    queryKey: ['securityLogs'],
    queryFn: async () => {
      const res = await api.get('/users/me/security-logs');
      return res.data;
    }
  });

  const { register, handleSubmit, watch, formState: { errors, isDirty }, reset } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
  });

  const newPassword = watch("new_password", "");
  
  const getPasswordStrength = (pw: string) => {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score += 25;
    if (pw.length >= 12) score += 25;
    if (/[A-Z]/.test(pw)) score += 15;
    if (/[0-9]/.test(pw)) score += 15;
    if (/[^A-Za-z0-9]/.test(pw)) score += 20;
    return Math.min(100, score);
  };
  
  const strength = getPasswordStrength(newPassword);
  
  const getStrengthColor = (score: number) => {
    if (score < 40) return 'bg-red-500';
    if (score < 70) return 'bg-amber-500';
    return 'bg-green-500';
  };
  
  const getStrengthLabel = (score: number) => {
    if (score === 0) return '';
    if (score < 40) return 'Weak';
    if (score < 70) return 'Good';
    return 'Strong';
  };

  React.useEffect(() => {
    setHasUnsavedChanges(isDirty);
  }, [isDirty, setHasUnsavedChanges]);

  const pwMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/users/change-password', data);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Password updated successfully');
      reset();
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['securityLogs'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to change password.');
    }
  });

  const onSubmit = (data: PasswordFormValues) => {
    pwMutation.mutate({
      old_password: data.old_password,
      new_password: data.new_password
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Security Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Manage your password, two-factor authentication, API keys, and active sessions.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Change Password</h3>
          </div>
          <div className="p-6 sm:p-8 space-y-6">
            <div className="max-w-md space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    {...register('old_password')}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  />
                </div>
                {errors.old_password && <p className="mt-1.5 text-xs text-red-500">{errors.old_password.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    {...register('new_password')}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  />
                </div>
                {newPassword && (
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500 font-medium">Password strength</span>
                      <span className={`font-bold ${strength < 40 ? 'text-red-600' : strength < 70 ? 'text-amber-600' : 'text-green-600'}`}>
                        {getStrengthLabel(strength)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${getStrengthColor(strength)}`} style={{ width: `${strength}%` }}></div>
                    </div>
                  </div>
                )}
                {errors.new_password && <p className="mt-1.5 text-xs text-red-500">{errors.new_password.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    {...register('confirm_password')}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  />
                </div>
                {errors.confirm_password && <p className="mt-1.5 text-xs text-red-500">{errors.confirm_password.message}</p>}
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 flex justify-start">
            <button
              type="submit"
              disabled={!isDirty || pwMutation.isPending}
              className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-gray-800 disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-gray-200"
            >
              {pwMutation.isPending ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </section>
      </form>

      {/* Two-Factor Authentication */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50">
          <h3 className="text-sm font-bold text-gray-900">Two-Factor Authentication (2FA)</h3>
        </div>
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-gray-900">Protect your account with an extra layer of security</p>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Require a time-based verification code from an authenticator app (like Google Authenticator or Authy) when you log in.
            </p>
          </div>
          <button type="button" className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors whitespace-nowrap shadow-sm">
            Enable 2FA
          </button>
        </div>
      </section>

      {/* Data Privacy & Compliance */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50 flex items-center gap-3">
          <FileCheck2 className="h-5 w-5 text-gray-500" />
          <h3 className="text-sm font-bold text-gray-900">Data Privacy & Compliance</h3>
        </div>
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Strict GDPR Compliance Mode</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-xl">
                When enabled, the scraper automatically drops personally identifiable information (PII) from European regions and enforces strict data retention limits.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></div>
            </label>
          </div>
          
          <div className="h-px w-full bg-gray-100" />
          
          <div className="flex items-center justify-between gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Workspace Telemetry</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-xl">
                Allow Opti Matrix to collect anonymous usage data to help improve our AI algorithms and scraping reliability.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></div>
            </label>
          </div>
        </div>
      </section>

      {/* Security Activity Log */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-gray-500" />
            <div>
              <h3 className="text-sm font-bold text-gray-900">Security Activity Log</h3>
              <p className="text-xs text-gray-500 mt-1">Recent security events and authentication attempts on your account.</p>
            </div>
          </div>
        </div>
        <div className="p-0">
          {loadingLogs ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {securityLogs?.map((log: any) => {
                let icon = Activity;
                let color = 'text-gray-600';
                let bg = 'bg-gray-50';
                
                if (log.action.includes('Login')) {
                  icon = Fingerprint;
                  color = 'text-green-600';
                  bg = 'bg-green-50';
                } else if (log.action.includes('Password')) {
                  icon = KeyRound;
                  color = 'text-blue-600';
                  bg = 'bg-blue-50';
                } else if (log.action.includes('Export')) {
                  icon = Lock;
                  color = 'text-amber-600';
                  bg = 'bg-amber-50';
                }

                const Icon = icon;
                return (
                  <li key={log._id || log.id || Math.random().toString()} className="flex items-center justify-between p-6 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full ${bg} border border-gray-100 flex items-center justify-center shrink-0`}>
                        <Icon className={`h-5 w-5 ${color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{log.action}</p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                          <span>IP: {log.ip_address || 'Unknown'}</span>
                          <span>•</span>
                          <span>{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
              {(!securityLogs || securityLogs.length === 0) && (
                <div className="py-10 text-center text-sm text-gray-500">
                  No security activity found.
                </div>
              )}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
