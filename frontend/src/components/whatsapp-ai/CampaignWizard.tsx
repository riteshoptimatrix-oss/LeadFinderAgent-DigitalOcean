'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { useRouter } from 'next/navigation';
import { 
  Send, ArrowLeft, Clock, Shuffle, RefreshCw, Calendar, 
  CheckCircle2, AlertCircle, Eye, ShieldCheck, Zap, Users, Phone, X, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import WhatsAppConfigModal from './WhatsAppConfigModal';

const STEPS = [
  { id: 1, label: 'Select Leads', status: 'completed' },
  { id: 2, label: 'AI Templates', status: 'completed' },
  { id: 3, label: 'Campaign Wizard', status: 'active' },
  { id: 4, label: 'Live Campaign', status: 'pending' },
];

export default function CampaignWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isMounted, setIsMounted] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [previewLeadId, setPreviewLeadId] = useState<string>('');
  const [previewText, setPreviewText] = useState<string>('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    optional_delay: 5,
    random_delay: true,
    retry_count: 3,
    schedule: ''
  });

  // Fetch WhatsApp API configuration
  const { data: config, isLoading: isConfigLoading } = useQuery({
    queryKey: ['wa-ai-config'],
    queryFn: async () => {
      const res = await api.get('/whatsapp-ai/config');
      return res.data;
    }
  });

  useEffect(() => {
    setIsMounted(true);
    const savedLeads = localStorage.getItem('wa_selected_leads');
    if (savedLeads) {
      try {
        const parsed = JSON.parse(savedLeads);
        if (Array.isArray(parsed)) {
          setSelectedLeads(parsed);
          if (parsed.length > 0) setPreviewLeadId(parsed[0]);
        }
      } catch (e) {}
    }

    const savedTemplate = localStorage.getItem('wa_selected_template');
    if (savedTemplate) {
      try {
        const parsed = JSON.parse(savedTemplate);
        if (parsed && parsed._id) setSelectedTemplate(parsed);
      } catch (e) {}
    }
    
    // Auto-generate campaign name
    setFormData(prev => ({
      ...prev,
      name: `Campaign - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
    }));
  }, []);

  // Fetch preview when template or previewLeadId changes
  useEffect(() => {
    if (!selectedTemplate) return;

    const fetchPreview = async () => {
      try {
        const res = await api.post('/whatsapp-ai/preview', {
          template_id: selectedTemplate._id,
          template_content: selectedTemplate.content,
          lead_id: previewLeadId || (selectedLeads.length > 0 ? selectedLeads[0] : undefined)
        });
        if (res.data && res.data.rendered) {
          setPreviewText(res.data.rendered);
        }
      } catch (e) {
        // Fallback simple replacement
        setPreviewText(selectedTemplate.content || '');
      }
    };

    fetchPreview();
  }, [selectedTemplate, previewLeadId, selectedLeads]);

  const launchMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: formData.name,
        description: formData.description,
        template_id: selectedTemplate?._id,
        target_leads: selectedLeads,
        optional_delay: formData.optional_delay,
        random_delay: formData.random_delay,
        retry_count: formData.retry_count,
        schedule: formData.schedule || undefined
      };
      const res = await api.post('/whatsapp-ai/campaigns', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['wa-ai-campaigns'] });
      toast.success('Campaign launched into background queue!');
      setShowConfirmModal(false);
      
      if (data && data._id) {
        localStorage.setItem('wa_active_campaign', data._id);
      }
      
      router.push('/dashboard/whatsapp-ai/live');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to start campaign. Please try again.');
    }
  });

  const handleStartCampaign = () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a campaign name.');
      return;
    }
    if (selectedLeads.length === 0) {
      toast.error('No leads selected. Please go back to Step 1.');
      return;
    }
    if (!selectedTemplate) {
      toast.error('No template selected. Please go back to Step 2.');
      return;
    }

    if (!config?.is_configured) {
      toast.error('Meta WhatsApp Cloud API is not connected. Please configure your credentials first.');
      setShowConfigModal(true);
      return;
    }

    // Open confirmation review modal
    setShowConfirmModal(true);
  };

  const calculateDuration = () => {
    const baseDelay = formData.optional_delay || 5;
    const additional = formData.random_delay ? 2.5 : 0;
    const totalSeconds = Math.round(selectedLeads.length * (baseDelay + additional));
    
    if (totalSeconds < 60) return `${totalSeconds} seconds`;
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `~${minutes}m ${secs > 0 ? `${secs}s` : ''}`;
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-200">
        <div className="flex items-center gap-4 sm:gap-8 overflow-x-auto w-full no-scrollbar">
          {STEPS.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-300",
                step.status === 'completed' ? "bg-green-100 text-green-700" :
                step.status === 'active' ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : 
                "bg-slate-100 text-slate-400"
              )}>
                {step.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <span className={cn(
                    "flex items-center justify-center w-5 h-5 rounded-full text-[10px]",
                    step.status === 'active' ? "bg-white text-blue-600" : "bg-slate-200 text-slate-500"
                  )}>
                    {step.id}
                  </span>
                )}
                {step.label}
              </div>
              {idx < STEPS.length - 1 && (
                <div className={cn(
                  "w-8 sm:w-12 h-[2px] mx-2 rounded-full",
                  step.status === 'completed' ? "bg-green-200" : "bg-slate-200"
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Meta API Connection Alert Banner (if unconfigured) */}
      {!config?.is_configured && !isConfigLoading && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-900">
                Meta WhatsApp Business Cloud API Not Configured
              </div>
              <div className="text-xs text-amber-700 mt-0.5">
                To send automated WhatsApp messages, configure your Meta Access Token and Phone Number ID.
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowConfigModal(true)}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm whitespace-nowrap"
          >
            Connect WhatsApp API
          </button>
        </div>
      )}

      {/* Connected Status Pill */}
      {config?.is_configured && (
        <div className="mb-6 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-900">
              Meta WhatsApp Cloud API Active: <span className="font-mono">{config.verified_phone || config.phone_number_id}</span>
              {config.display_name && ` (${config.display_name})`}
            </span>
          </div>
          <button
            onClick={() => setShowConfigModal(true)}
            className="text-xs text-emerald-700 font-bold hover:underline"
          >
            Settings
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Campaign Wizard</h2>
          <p className="text-slate-500 text-sm mt-1">Configure your delivery parameters, preview personalization, and launch</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
        
        {/* Form Configuration & Preview (Left 2 cols) */}
        <div className="lg:col-span-2 flex flex-col space-y-6 overflow-y-auto pr-1">
          
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Parameters</h3>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-full">
                  <label className="block text-sm font-semibold text-slate-900 mb-1.5">Campaign Name</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 text-slate-900 font-medium"
                    placeholder="e.g. Q3 Outreach - Tech Sector"
                  />
                </div>

                <div className="col-span-full">
                  <label className="block text-sm font-semibold text-slate-900 mb-1.5">Campaign Description (Optional)</label>
                  <textarea 
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 text-slate-700 resize-none h-20"
                    placeholder="Internal note about this campaign's goal"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-1.5">
                    <Clock className="w-4 h-4 text-blue-500" />
                    Delay Between Messages (Seconds)
                  </label>
                  <input 
                    type="number" 
                    min="1"
                    max="60"
                    value={formData.optional_delay}
                    onChange={e => setFormData({ ...formData, optional_delay: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">Base delay to respect Meta API rate limits.</p>
                </div>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
                    <Shuffle className="w-4 h-4 text-purple-500" />
                    Randomize Delay Pacing
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={formData.random_delay}
                      onChange={e => setFormData({ ...formData, random_delay: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ml-3 text-sm font-medium text-slate-600">
                      {formData.random_delay ? 'Enabled (+1s to 4s jitter)' : 'Disabled (Fixed delay)'}
                    </span>
                  </label>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-1.5">
                    <RefreshCw className="w-4 h-4 text-amber-500" />
                    Automatic Retries on Failure
                  </label>
                  <input 
                    type="number" 
                    min="0"
                    max="5"
                    value={formData.retry_count}
                    onChange={e => setFormData({ ...formData, retry_count: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">Retry attempts before marking recipient as failed.</p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-1.5">
                    <Calendar className="w-4 h-4 text-green-500" />
                    Schedule Start (Optional)
                  </label>
                  <input 
                    type="datetime-local" 
                    value={formData.schedule}
                    onChange={e => setFormData({ ...formData, schedule: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-slate-700"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">Leave blank to start immediately.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Live Message Preview Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-900">Personalized Message Preview</h3>
              </div>
              <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-medium">
                Live Variable Substitution
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 font-sans text-sm text-slate-800 leading-relaxed whitespace-pre-line relative">
              {previewText ? (
                previewText
              ) : (
                <span className="text-slate-400 italic">No template selected. Go back to Step 2 to pick a message template.</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Tags like `&#123;&#123;business_name&#125;&#125;` and `&#123;&#123;contact_name&#125;&#125;` will be filled dynamically for each lead during dispatch.
            </p>
          </div>
        </div>

        {/* Summary Panel (Right Col) */}
        <div className="flex flex-col min-h-0 bg-slate-900 rounded-3xl border border-slate-800 p-8 relative overflow-hidden text-white shadow-xl shadow-blue-900/10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col h-full">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 border-b border-slate-700 pb-4">
              Campaign Summary
            </h3>
            
            <div className="space-y-6 flex-1">
              <div>
                <div className="text-sm text-slate-400 mb-1">Target Recipients</div>
                <div className="text-3xl font-bold text-white flex items-baseline gap-2">
                  {selectedLeads.length}
                  <span className="text-sm font-medium text-blue-400">leads selected</span>
                </div>
              </div>
              
              <div>
                <div className="text-sm text-slate-400 mb-1">Selected Template</div>
                <div className="text-base font-semibold text-white truncate">
                  {selectedTemplate?.name || 'None selected'}
                </div>
              </div>
              
              <div>
                <div className="text-sm text-slate-400 mb-1">Estimated Pacing Duration</div>
                <div className="text-lg font-bold text-amber-400">
                  {calculateDuration()}
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-700">
                <div className="text-sm text-slate-400 mb-3">Gateway & Safety Checks</div>
                <ul className="space-y-2.5 text-sm text-slate-300">
                  <li className="flex justify-between items-center">
                    <span>Meta Cloud API:</span>
                    <span className={cn("font-medium text-xs px-2 py-0.5 rounded-full", config?.is_configured ? "bg-emerald-900/60 text-emerald-300" : "bg-red-900/60 text-red-300")}>
                      {config?.is_configured ? "Connected" : "Not Configured"}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span>Base Delay:</span>
                    <span className="text-white font-medium">{formData.optional_delay}s</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Random Jitter:</span>
                    <span className="text-white font-medium">{formData.random_delay ? 'Enabled' : 'Disabled'}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Opt-Out Protection:</span>
                    <span className="text-emerald-400 font-medium">Automatic</span>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-700">
              <button
                onClick={handleStartCampaign}
                disabled={launchMutation.isPending || selectedLeads.length === 0 || !selectedTemplate}
                className="w-full flex justify-center items-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-xl text-base font-bold hover:bg-blue-500 transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] disabled:opacity-50 disabled:shadow-none"
              >
                {launchMutation.isPending ? 'Preparing Queue...' : 'Review & Start Campaign'}
                {!launchMutation.isPending && <Send className="w-5 h-5 ml-1" />}
              </button>
              <p className="text-center text-xs text-slate-400 mt-3">
                Background worker will process sends sequentially via Meta Cloud API.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Navigation Buttons */}
      <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between">
        <button
          onClick={() => router.push('/dashboard/whatsapp-ai/templates')}
          className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Templates
        </button>
      </div>

      {/* WhatsApp Configuration Modal */}
      <WhatsAppConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
      />

      {/* Campaign Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowConfirmModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowConfirmModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 mb-4">
              <Send className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Launch WhatsApp Campaign?
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              You are about to start sending automated WhatsApp messages via the official Meta Cloud API.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-sm mb-6">
              <div className="flex justify-between">
                <span className="text-slate-500">Campaign Name:</span>
                <span className="font-semibold text-slate-900">{formData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Leads:</span>
                <span className="font-semibold text-slate-900">{selectedLeads.length} recipients</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Template:</span>
                <span className="font-semibold text-blue-600">{selectedTemplate?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Est. Duration:</span>
                <span className="font-semibold text-amber-600">{calculateDuration()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sender:</span>
                <span className="font-semibold text-emerald-600">{config?.verified_phone || 'Meta Cloud API'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={() => launchMutation.mutate()}
                disabled={launchMutation.isPending}
                className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
              >
                {launchMutation.isPending ? 'Starting Queue...' : 'Confirm & Launch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
