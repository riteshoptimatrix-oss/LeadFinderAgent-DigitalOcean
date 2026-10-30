'use client';

import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Target, ArrowRightLeft, ListTodo, Route, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/src/lib/axios';

export default function CRMSettings({ setHasUnsavedChanges }: { setHasUnsavedChanges: (val: boolean) => void }) {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({
    lead_score_threshold: 70,
    auto_assignment: true,
    default_status: 'New Lead',
    pipeline_stages: ['New Lead', 'Website Analyzed', 'Needs Review', 'Contact Ready', 'Email Sent', 'Meeting Scheduled', 'Won', 'Lost'],
  });
  const [originalSettings, setOriginalSettings] = useState<any>(null);

  useEffect(() => {
    // Mock fetch
    setOriginalSettings(settings);
  }, []);

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
      return new Promise((resolve) => setTimeout(resolve, 800));
    },
    onSuccess: () => {
      toast.success('CRM Settings updated successfully');
      setOriginalSettings(settings);
      setHasUnsavedChanges(false);
    },
    onError: () => toast.error('Failed to update CRM Settings')
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(settings);
  };

  const deleteLeadsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/leads/export-and-delete');
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Successfully deleted ${data.deleted_count} leads. Backup saved.`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      
      if (data.backup_file) {
        api.get(`/leads/download-backup?filename=${data.backup_file}`, { responseType: 'blob' })
          .then(response => {
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', data.backup_file);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
          })
          .catch(err => {
            console.error('Failed to download backup:', err);
            toast.error('Failed to download backup automatically.');
          });
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to delete leads');
    }
  });

  const handleDeleteAllLeads = () => {
    if (window.confirm("DANGER: Are you sure you want to nuke the database (delete ALL leads and search history)? This action cannot be undone. A backup Excel file will be downloaded before deletion.")) {
      deleteLeadsMutation.mutate();
    }
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-gray-900">CRM Configuration</h2>
        <p className="text-sm text-gray-500 mt-1">Manage lead routing, pipeline stages, and automated scoring rules.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Automations & Scoring</h3>
          </div>
          <div className="p-4 sm:p-6 space-y-2 border-b border-gray-100">
             <ToggleRow 
                label="Auto-Assign Leads" 
                description="Automatically assign incoming hot leads to available team members." 
                checked={settings.auto_assignment} 
                onChange={(v: boolean) => handleChange('auto_assignment', v)} 
                icon={ArrowRightLeft} 
              />
          </div>
          <div className="p-6 sm:p-8 space-y-6">
            <div>
              <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-3">
                <span className="flex items-center gap-2"><Target className="h-4 w-4 text-gray-400"/> Lead Score Threshold (Hot Lead)</span>
                <span className="text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{settings.lead_score_threshold}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={settings.lead_score_threshold}
                onChange={(e) => handleChange('lead_score_threshold', parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <p className="mt-3 text-xs text-gray-500">Leads with a calculated score above this threshold will automatically bypass review stages.</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Pipeline & Statuses</h3>
          </div>
          <div className="p-6 sm:p-8 space-y-6">
             <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Default New Lead Status</label>
              <div className="relative">
                <ListTodo className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={settings.default_status}
                  onChange={(e) => handleChange('default_status', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100 appearance-none"
                >
                  {settings.pipeline_stages.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
               <label className="block text-sm font-medium text-gray-700 mb-4">Pipeline Stages (Draggable)</label>
               <div className="space-y-2">
                 {settings.pipeline_stages.map((stage, i) => (
                   <div key={stage} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-move hover:bg-white hover:border-gray-300 transition-colors">
                     <Route className="h-4 w-4 text-gray-400" />
                     <span className="text-sm font-medium text-gray-900">{i + 1}. {stage}</span>
                   </div>
                 ))}
               </div>
               <button type="button" className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">+ Add Stage</button>
            </div>
          </div>
          
          <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 flex justify-end">
              <button
              type="submit"
              disabled={updateMutation.isPending || (originalSettings && JSON.stringify(settings) === JSON.stringify(originalSettings))}
              className="w-full sm:w-auto rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-blue-700 disabled:opacity-50 shadow-sm active:scale-95 flex items-center gap-2 justify-center"
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save CRM Config
            </button>
          </div>
        </section>
      </form>

      {/* Danger Zone */}
      <section className="bg-red-50 rounded-2xl border border-red-100 shadow-sm overflow-hidden mt-8">
        <div className="border-b border-red-100 px-6 py-5 bg-red-100/50 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h3 className="text-sm font-bold text-red-900">Danger Zone</h3>
        </div>
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-gray-900">Nuke Database (Delete All Leads & Search History)</h4>
              <p className="text-xs text-gray-600 mt-1">
                This will permanently remove all leads and your entire search history from the database. A backup of all leads will be automatically downloaded as an Excel file before deletion.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDeleteAllLeads}
              disabled={deleteLeadsMutation.isPending}
              className="w-full sm:w-auto rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-red-200 flex items-center gap-2 justify-center shrink-0"
            >
              {deleteLeadsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleteLeadsMutation.isPending ? 'Processing...' : 'Nuke Database'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
