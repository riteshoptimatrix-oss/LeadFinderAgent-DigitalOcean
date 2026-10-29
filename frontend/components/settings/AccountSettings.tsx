'use client';

import React, { useState, useEffect } from 'react';
import { Download, Globe, Clock, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/features/auth/store';
import { toast } from 'sonner';

export default function AccountSettings({ setHasUnsavedChanges }: { setHasUnsavedChanges: (val: boolean) => void }) {
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);

  const { data: user } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const res = await api.get('/users/me');
      return res.data;
    }
  });

  const [language, setLanguage] = useState('English (US)');
  const [timezone, setTimezone] = useState('UTC-08:00 (Pacific Time)');

  useEffect(() => {
    if (user) {
      if (user.language) setLanguage(user.language);
      if (user.timezone) setTimezone(user.timezone);
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.put('/users/me', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      toast.success('Preferences updated.');
      setHasUnsavedChanges(false);
    }
  });

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setLanguage(val);
    updateMutation.mutate({ language: val });
  };

  const handleTimezoneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setTimezone(val);
    updateMutation.mutate({ timezone: val });
  };

  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    try {
      setIsExporting(true);
      const res = await api.get('/users/me/export');
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "workspace_export.json");
      document.body.appendChild(downloadAnchorNode); 
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      queryClient.invalidateQueries({ queryKey: ['securityLogs'] });
      toast.success("Export successful.");
    } catch (err) {
      toast.error("Failed to export data.");
    } finally {
      setIsExporting(false);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);
  const handleDeleteAccount = async () => {
    if (window.confirm("Are you sure you want to permanently delete your account? This action is irreversible.")) {
      try {
        setIsDeleting(true);
        await api.delete('/users/me');
        toast.success("Account deleted.");
        logout();
      } catch (err) {
        toast.error("Failed to delete account.");
        setIsDeleting(false);
      }
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Account Preferences</h2>
        <p className="text-sm text-gray-500 mt-1">Manage your account configurations, data export, and deletion.</p>
      </div>

      <div className="space-y-8">
        
        {/* Localization Section */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Localization</h3>
          </div>
          <div className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Language</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <select
                    value={language}
                    onChange={handleLanguageChange}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100 appearance-none"
                  >
                    <option>English (US)</option>
                    <option>English (UK)</option>
                    <option>Spanish</option>
                    <option>French</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <select
                    value={timezone}
                    onChange={handleTimezoneChange}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100 appearance-none"
                  >
                    <option>UTC-08:00 (Pacific Time)</option>
                    <option>UTC-05:00 (Eastern Time)</option>
                    <option>UTC+00:00 (GMT)</option>
                    <option>UTC+05:30 (IST)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Data & Export */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Data Management</h3>
          </div>
          <div className="p-6 sm:p-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-900">Export Workspace Data</h4>
                <p className="text-sm text-gray-500 mt-1">Download a copy of all your leads, campaigns, and search history in CSV or JSON format.</p>
              </div>
              <button onClick={handleExport} disabled={isExporting} type="button" className="shrink-0 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-gray-100">
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export Data'}
              </button>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-red-50/30 rounded-2xl border border-red-100 overflow-hidden">
          <div className="border-b border-red-100 px-6 py-5">
            <h3 className="text-sm font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Danger Zone
            </h3>
          </div>
          <div className="p-6 sm:p-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-900">Delete Account</h4>
                <p className="text-sm text-gray-500 mt-1 max-w-lg">
                  Permanently delete your account and all associated workspace data. This action is irreversible and will immediately cancel any active subscriptions.
                </p>
              </div>
              <button onClick={handleDeleteAccount} disabled={isDeleting} type="button" className="shrink-0 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100">
                {isDeleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
