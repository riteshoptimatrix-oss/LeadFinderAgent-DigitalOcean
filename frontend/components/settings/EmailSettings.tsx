'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Loader2, Save, Mail, PenTool, Hash, Settings2, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function EmailSettings({ setHasUnsavedChanges }: { setHasUnsavedChanges: (val: boolean) => void }) {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    from_email: '',
    daily_limit: 500,
    signature: 'Best regards,\nThe Growth Team\nwww.example.com',
    track_opens: true,
  });
  const [originalSettings, setOriginalSettings] = useState<any>(null);

  const { data: userProfile, isLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const res = await api.get('/users/me');
      return res.data;
    }
  });

  useEffect(() => {
    if (userProfile && userProfile.email_settings) {
      setSettings(userProfile.email_settings);
      setOriginalSettings(userProfile.email_settings);
    }
  }, [userProfile]);

  const handleChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (originalSettings) {
      const isDirty = JSON.stringify(settings) !== JSON.stringify(originalSettings);
      setHasUnsavedChanges(isDirty);
    }
  }, [settings, originalSettings, setHasUnsavedChanges]);

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put('/users/me', { email_settings: payload });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Email Settings updated successfully');
      setOriginalSettings(settings);
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
    onError: () => toast.error('Failed to update Email Settings')
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(settings);
  };

  const ToggleRow = ({ label, description, checked, onChange, icon: Icon }: any) => (
    <div className="flex items-center justify-between p-4 hover:bg-gray-50/50 rounded-xl transition-colors">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-100 ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Email Automation</h2>
        <p className="text-sm text-gray-500 mt-1">Configure SMTP servers, outreach limits, and global email templates.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* SMTP */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-900">SMTP Server Configuration</h3>
            <span className="flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Connected</span>
          </div>
          <div className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">SMTP Host</label>
                <div className="relative">
                  <Settings2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={settings.smtp_host}
                    onChange={(e) => handleChange('smtp_host', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  />
                </div>
              </div>

               <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Port</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="number"
                    value={settings.smtp_port}
                    onChange={(e) => handleChange('smtp_port', parseInt(e.target.value))}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  />
                </div>
              </div>
            </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Username (Email)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={settings.smtp_user}
                    onChange={(e) => handleChange('smtp_user', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                    placeholder="sales@example.com"
                  />
                </div>
              </div>

               <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">App Password</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    value={settings.smtp_pass}
                    onChange={(e) => handleChange('smtp_pass', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-gray-100">
               <button type="button" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">Test Connection</button>
            </div>
          </div>
        </section>

        {/* Templates & Signature */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Content & Limits</h3>
          </div>
          
           <div className="p-4 sm:p-6 space-y-2 border-b border-gray-100">
             <ToggleRow 
                label="Track Email Opens" 
                description="Inject a tracking pixel into outbound emails to measure engagement." 
                checked={settings.track_opens} 
                onChange={(v: boolean) => handleChange('track_opens', v)} 
                icon={Send} 
              />
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Global Email Signature</label>
              <div className="relative">
                <textarea
                  value={settings.signature}
                  onChange={(e) => handleChange('signature', e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100 font-mono"
                />
              </div>
            </div>

            <div className="pt-2">
               <label className="block text-sm font-medium text-gray-700 mb-1.5">Daily Sending Limit</label>
                <div className="relative max-w-xs">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="number"
                    value={settings.daily_limit}
                    onChange={(e) => handleChange('daily_limit', parseInt(e.target.value))}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-500">Protect your domain reputation by capping daily outbound emails.</p>
            </div>
            
            <div className="pt-4 border-t border-gray-100">
               <h4 className="text-sm font-bold text-gray-900 mb-4">Email Templates</h4>
               <div className="space-y-3">
                 <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                   <div className="flex items-center gap-3">
                     <FileText className="h-5 w-5 text-gray-400" />
                     <div>
                       <p className="text-sm font-bold text-gray-900">Cold Outreach V1</p>
                       <p className="text-xs text-gray-500">Default template for new leads.</p>
                     </div>
                   </div>
                   <button type="button" className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"><PenTool className="h-4 w-4" /></button>
                 </div>
               </div>
               <button type="button" className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">+ Create Template</button>
            </div>
          </div>
          
          <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 flex justify-end">
             <button
              type="submit"
              disabled={updateMutation.isPending || (originalSettings && JSON.stringify(settings) === JSON.stringify(originalSettings))}
              className="w-full sm:w-auto rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-gray-800 disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-gray-200 flex items-center gap-2 justify-center"
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Email Config
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
