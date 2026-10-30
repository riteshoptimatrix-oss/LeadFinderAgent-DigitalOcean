'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  Building2, Mail, Phone, Globe, Briefcase, MapPin, Sparkles, 
  Settings, CheckCircle2, ChevronRight, ChevronLeft, Calendar, 
  Clock, ShieldAlert, FileText, Server, Sliders, Play, Loader2,
  Paperclip, Tag, AlignLeft, AlertCircle, Eye, MousePointerClick, 
  CornerDownRight, Send, HelpCircle, X, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { useRouter } from 'next/navigation';

const STEPS = [
  { id: 1, label: 'Select Leads', active: false, completed: true },
  { id: 2, label: 'AI Templates', active: false, completed: true },
  { id: 3, label: 'Campaign Wizard', active: true, completed: false },
  { id: 4, label: 'Live Campaign', active: false, completed: false },
];

const WIZARD_STEPS = [
  { id: 1, title: 'Information', icon: <FileText className="w-4 h-4" /> },
  { id: 2, title: 'SMTP Selection', icon: <Server className="w-4 h-4" /> },
  { id: 3, title: 'Sending Rules', icon: <Sliders className="w-4 h-4" /> },
  { id: 4, title: 'Tracking', icon: <Eye className="w-4 h-4" /> },
  { id: 5, title: 'Schedule', icon: <Calendar className="w-4 h-4" /> },
  { id: 6, title: 'Review', icon: <CheckCircle2 className="w-4 h-4" /> },
];

export default function EmailCampaignWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isMounted, setIsMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
  // Base State from previous phases
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Form State
  const [formData, setFormData] = useState({
    info: {
      name: '',
      description: '',
      tag: '',
      category: 'Outreach',
      priority: 1,
      color: '#3b82f6',
      owner: 'System'
    },
    smtp_id: '',
    rules: {
      delay_seconds: 120,
      random_delay: true,
      max_per_hour: 30,
      max_per_day: 300,
      max_concurrent: 1,
      retry_count: 2,
      retry_delay: 300,
      duplicate_protection: true
    },
    tracking: {
      open_tracking: true,
      click_tracking: true,
      reply_tracking: true,
      bounce_tracking: true
    },
    schedule: {
      type: 'Immediate',
      start_date: '',
      start_time: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      business_hours_only: true,
      weekdays_only: true
    }
  });

  // Queries
  const { data: smtpProfiles = [], isLoading: isLoadingSmtp, error: smtpError, refetch: refetchSmtp } = useQuery({
    queryKey: ['email-ai-smtp'],
    queryFn: async () => {
      const res = await api.get('/email-ai/smtp');
      return res.data;
    }
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['email-ai-templates'],
    queryFn: async () => {
      const res = await api.get('/email-ai/templates');
      return res.data;
    }
  });

  const formatError = (error: any) =>
    error?.response?.data?.detail || error?.message || 'Request failed';

  const logWizardEvent = (event: string, data?: any) => {
    console.log(`[EmailAI][Wizard] ${event}`, data || '');
  };

  // Mutations
  const createCampaign = useMutation({
    mutationFn: async (payload: any) => await api.post('/email-ai/campaigns', payload),
    onSuccess: (res: any) => {
      toast.success('Campaign configured and queued successfully!');
      if (res?.data?._id) {
        localStorage.setItem('email_active_campaign', res.data._id);
      }
      queryClient.invalidateQueries({ queryKey: ['email-ai-header-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['email-ai-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['email-ai-analytics'] });
      logWizardEvent('campaign_created', {
        name: formData.info.name,
        leads: selectedLeadIds.length,
        template_id: selectedTemplateId,
        smtp_id: formData.smtp_id
      });
      // Navigate to Live tab
      window.dispatchEvent(new CustomEvent('change-tab', { detail: 'live' }));
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail || error?.message || 'Failed to create campaign';
      console.error('[EmailAI][Wizard] create_campaign failed:', error?.response?.status, detail);
      toast.error(detail);
    }
  });

  useEffect(() => {
    setIsMounted(true);
    
    // Auto-generate name based on date
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    setFormData(prev => ({
      ...prev,
      info: { ...prev.info, name: `Campaign - ${dateStr}` }
    }));

    try {
      const savedLeads = localStorage.getItem('email_selected_leads');
      if (savedLeads) setSelectedLeadIds(JSON.parse(savedLeads));

      const savedTemplate = localStorage.getItem('email_selected_template');
      if (savedTemplate) setSelectedTemplateId(savedTemplate);
      
      const savedDraft = localStorage.getItem('email_campaign_draft');
      if (savedDraft) {
        setFormData(JSON.parse(savedDraft));
      }
    } catch (e) {
      console.error('[EmailAI][Wizard] Failed to restore wizard state from localStorage:', e);
    }

    logWizardEvent('wizard_mounted', {
      leads: (() => {
        try { return JSON.parse(localStorage.getItem('email_selected_leads') || '[]').length; } catch { return 0; }
      })(),
      template: localStorage.getItem('email_selected_template') || null
    });
  }, []);

  // Auto-select default SMTP profile when loaded
  useEffect(() => {
    if (smtpProfiles.length > 0 && !formData.smtp_id) {
      const defaultSmtp = smtpProfiles.find((s: any) => s.is_default && s.is_active !== false)
        || smtpProfiles.find((s: any) => s.is_active !== false)
        || smtpProfiles[0];
      if (defaultSmtp) {
        setFormData(prev => ({ ...prev, smtp_id: defaultSmtp._id }));
      }
    }
  }, [smtpProfiles, formData.smtp_id]);

  // Auto-select template if none chosen
  useEffect(() => {
    if (templates.length > 0 && !selectedTemplateId) {
      const defaultTmpl = templates.find((t: any) => t.is_favorite) || templates[0];
      if (defaultTmpl) {
        setSelectedTemplateId(defaultTmpl._id);
      }
    }
  }, [templates, selectedTemplateId]);

  // Auto save draft
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('email_campaign_draft', JSON.stringify(formData));
    }
  }, [formData, isMounted]);

  const handleNext = () => {
    // Validation
    if (currentStep === 1 && !formData.info.name) {
      return toast.error('Campaign Name is required');
    }
    if (currentStep === 2 && !formData.smtp_id) {
      return toast.error('Please select an SMTP profile');
    }
    if (currentStep === 5 && formData.schedule.type === 'Later' && (!formData.schedule.start_date || !formData.schedule.start_time)) {
      return toast.error('Please select a valid date and time for scheduling');
    }
    
    if (currentStep < 6) {
      logWizardEvent('next_step', { from: currentStep, to: currentStep + 1 });
      setCurrentStep(c => c + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      logWizardEvent('prev_step', { from: currentStep, to: currentStep - 1 });
      setCurrentStep(c => c - 1);
    }
    else window.dispatchEvent(new CustomEvent('change-tab', { detail: 'templates' }));
  };

  const handleStartCampaign = () => {
    if (selectedLeadIds.length === 0) return toast.error('No leads selected! Please go back to Step 1.');
    if (!selectedTemplateId) return toast.error('No template selected! Please go back to Step 2.');
    if (!formData.smtp_id) return toast.error('No SMTP profile selected!');

    logWizardEvent('start_campaign', {
      step: currentStep,
      leads: selectedLeadIds.length,
      template_id: selectedTemplateId,
      smtp_id: formData.smtp_id,
      schedule: formData.schedule.type
    });

    const payload = {
      info: formData.info,
      template_id: selectedTemplateId,
      smtp_id: formData.smtp_id,
      target_leads: selectedLeadIds,
      rules: formData.rules,
      tracking: formData.tracking,
      schedule: {
        type: formData.schedule.type,
        start_time: formData.schedule.type === 'Later' 
          ? new Date(`${formData.schedule.start_date}T${formData.schedule.start_time}`).toISOString() 
          : new Date().toISOString(),
        timezone: formData.schedule.timezone,
        business_hours_only: formData.schedule.business_hours_only,
        weekdays_only: formData.schedule.weekdays_only
      }
    };

    createCampaign.mutate(payload);
  };

  const activeTemplate = templates.find((t: any) => t._id === selectedTemplateId);
  const activeSmtp = smtpProfiles.find((s: any) => s._id === formData.smtp_id);

  if (!isMounted) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      {/* Top Header Steps */}
      <div className="flex-none mb-6">
        <div className="flex items-center justify-between pb-6 border-b border-slate-200">
          <div className="flex items-center gap-4 sm:gap-8 overflow-x-auto w-full no-scrollbar">
            {STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-300",
                  step.active 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" 
                    : step.completed 
                      ? "bg-green-50 text-green-700" 
                      : "bg-slate-100 text-slate-400"
                )}>
                  <span className={cn(
                    "flex items-center justify-center w-5 h-5 rounded-full text-[10px]",
                    step.active ? "bg-white text-blue-600" : step.completed ? "bg-green-600 text-white" : "bg-slate-200 text-slate-500"
                  )}>
                    {step.completed ? <CheckCircle2 className="w-3 h-3" /> : step.id}
                  </span>
                  {step.label}
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={cn("w-8 sm:w-12 h-[2px] mx-2 rounded-full", step.completed ? "bg-green-500" : "bg-slate-200")} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-8 min-h-0">
        
        {/* Left Sidebar - Wizard Progress */}
        <div className="w-64 flex-none flex flex-col gap-2">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Campaign Setup</h3>
          {WIZARD_STEPS.map(step => (
            <button
              key={step.id}
              onClick={() => step.id < currentStep && setCurrentStep(step.id)}
              className={cn(
                "flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl transition-all font-medium text-sm border",
                currentStep === step.id 
                  ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm" 
                  : currentStep > step.id
                    ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    : "bg-transparent border-transparent text-slate-400 opacity-70"
              )}
            >
              <div className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full",
                currentStep === step.id ? "bg-blue-100 text-blue-600" : currentStep > step.id ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
              )}>
                {currentStep > step.id ? <CheckCircle2 className="w-4 h-4" /> : step.icon}
              </div>
              {step.title}
            </button>
          ))}
          
          <div className="mt-auto p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Campaign Payload</div>
            <div className="space-y-2 text-sm font-medium">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Leads:</span>
                <span className={cn("font-bold", selectedLeadIds.length > 0 ? "text-slate-900" : "text-amber-600")}>
                  {selectedLeadIds.length.toLocaleString()}
                </span>
              </div>
              {selectedLeadIds.length === 0 && (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'leads' }))}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold underline block text-left"
                >
                  + Select Target Leads
                </button>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Template:</span>
                <span className="text-slate-900 truncate max-w-[100px]">{activeTemplate?.name || 'None'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
          <div className="flex-1 overflow-y-auto p-8 relative">
            
            {/* Step 1: Info */}
            {currentStep === 1 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Campaign Information</h2>
                  <p className="text-slate-500 mt-1">Provide basic details to identify your campaign internally.</p>
                </div>

                {selectedLeadIds.length === 0 && (
                  <div className="p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-xs font-medium flex items-center justify-between">
                    <span>No target leads selected yet for this campaign.</span>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'leads' }))}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shrink-0 ml-3"
                    >
                      Select Target Leads
                    </button>
                  </div>
                )}
                
                <div className="space-y-4 max-w-2xl">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Campaign Name <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      value={formData.info.name}
                      onChange={e => setFormData({...formData, info: {...formData.info, name: e.target.value}})}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Internal Description</label>
                    <textarea 
                      value={formData.info.description}
                      onChange={e => setFormData({...formData, info: {...formData.info, description: e.target.value}})}
                      rows={3}
                      placeholder="e.g. Outreach to software companies in NY regarding web dev services."
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
                      <select 
                        value={formData.info.category}
                        onChange={e => setFormData({...formData, info: {...formData.info, category: e.target.value}})}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        <option>Outreach</option>
                        <option>Follow Up</option>
                        <option>Newsletter</option>
                        <option>Promotional</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Campaign Tag</label>
                      <div className="relative">
                        <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                          type="text" 
                          placeholder="e.g. Q3-Sales"
                          value={formData.info.tag}
                          onChange={e => setFormData({...formData, info: {...formData.info, tag: e.target.value}})}
                          className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: SMTP Selection */}
            {currentStep === 2 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Select Sending Account</h2>
                  <p className="text-slate-500 mt-1">Choose the authenticated SMTP profile to send these emails.</p>
                </div>
                
                {isLoadingSmtp ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
                ) : smtpError ? (
                  <div className="p-6 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-bold">Failed to load SMTP Accounts</h4>
                      <p className="text-sm mt-1">{formatError(smtpError)}</p>
                      <button
                        onClick={() => refetchSmtp()}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" /> Retry
                      </button>
                    </div>
                  </div>
                ) : smtpProfiles.length === 0 ? (
                  <div className="p-6 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold">No SMTP Accounts Found</h4>
                      <p className="text-sm mt-1">You must configure an SMTP account in the Email AI Dashboard before running a campaign.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {smtpProfiles.map((smtp: any) => (
                      <div 
                        key={smtp._id}
                        onClick={() => setFormData({...formData, smtp_id: smtp._id})}
                        className={cn(
                          "p-4 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden",
                          formData.smtp_id === smtp._id 
                            ? "bg-blue-50 border-blue-500 shadow-md shadow-blue-500/10" 
                            : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                        )}
                      >
                        {formData.smtp_id === smtp._id && (
                          <div className="absolute top-3 right-3 text-blue-500">
                            <CheckCircle2 className="w-5 h-5 fill-current text-white" />
                          </div>
                        )}
                        <div className="flex items-center gap-3 mb-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                            formData.smtp_id === smtp._id ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                          )}>
                            <Server className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900">{smtp.name}</h4>
                            <p className="text-xs text-slate-500">{smtp.username}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs font-medium">
                          <div className="bg-white p-2 rounded-lg border border-slate-100 flex flex-col gap-0.5">
                            <span className="text-slate-400">Daily Limit</span>
                            <span className="text-slate-700">{smtp.daily_limit}</span>
                          </div>
                          <div className="bg-white p-2 rounded-lg border border-slate-100 flex flex-col gap-0.5">
                            <span className="text-slate-400">Hourly Limit</span>
                            <span className="text-slate-700">{smtp.hourly_limit}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Sending Rules */}
            {currentStep === 3 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Sending Rules & Safety</h2>
                  <p className="text-slate-500 mt-1">Configure limits and delays to protect your sender reputation.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                  {/* Delivery Speed */}
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-blue-500" /> Delivery Speed
                    </h3>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-700">Delay Between Emails</span>
                        <span className="text-blue-600 font-bold">{formData.rules.delay_seconds} sec</span>
                      </div>
                      <input 
                        type="range" min="30" max="600" step="10"
                        value={formData.rules.delay_seconds}
                        onChange={e => setFormData({...formData, rules: {...formData.rules, delay_seconds: parseInt(e.target.value)}})}
                        className="w-full accent-blue-600"
                      />
                    </div>
                    
                    <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={formData.rules.random_delay}
                        onChange={e => setFormData({...formData, rules: {...formData.rules, random_delay: e.target.checked}})}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800">Randomize Delay (+/- 20%)</div>
                        <div className="text-xs text-slate-500">Makes sending patterns look more human.</div>
                      </div>
                    </label>
                  </div>

                  {/* Throttle Limits */}
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
                      <ShieldAlert className="w-4 h-4 text-blue-500" /> Throttle Limits
                    </h3>
                    
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Max Emails Per Hour</label>
                      <input 
                        type="number" min="1" max="1000"
                        value={formData.rules.max_per_hour}
                        onChange={e => setFormData({...formData, rules: {...formData.rules, max_per_hour: parseInt(e.target.value)}})}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Max Emails Per Day</label>
                      <input 
                        type="number" min="1" max="5000"
                        value={formData.rules.max_per_day}
                        onChange={e => setFormData({...formData, rules: {...formData.rules, max_per_day: parseInt(e.target.value)}})}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" 
                      />
                    </div>
                  </div>

                  {/* Safety & Retries */}
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 md:col-span-2">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-amber-500" /> Safety & Retries
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Retry Attempts on Failure</label>
                        <select 
                          value={formData.rules.retry_count}
                          onChange={e => setFormData({...formData, rules: {...formData.rules, retry_count: parseInt(e.target.value)}})}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value={0}>No Retries</option>
                          <option value={1}>1 Retry</option>
                          <option value={2}>2 Retries</option>
                          <option value={3}>3 Retries</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Retry Delay</label>
                        <select 
                          value={formData.rules.retry_delay}
                          onChange={e => setFormData({...formData, rules: {...formData.rules, retry_delay: parseInt(e.target.value)}})}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value={60}>1 Minute</option>
                          <option value={300}>5 Minutes</option>
                          <option value={1800}>30 Minutes</option>
                          <option value={3600}>1 Hour</option>
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors mt-2">
                      <input 
                        type="checkbox" 
                        checked={formData.rules.duplicate_protection}
                        onChange={e => setFormData({...formData, rules: {...formData.rules, duplicate_protection: e.target.checked}})}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-800">Duplicate Protection</div>
                        <div className="text-xs text-slate-500">Prevent sending the same email to the same lead twice.</div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Tracking & Attachments */}
            {currentStep === 4 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Tracking & Attachments</h2>
                  <p className="text-slate-500 mt-1">Configure email interaction tracking and attachments.</p>
                </div>

                <div className="p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-sm font-medium flex gap-3 mb-6 max-w-2xl">
                  <Sparkles className="w-5 h-5 shrink-0" />
                  <div>These features are currently being prepared and will be fully operational in a future phase. Your configuration is saved in anticipation of the update.</div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                  {/* Tracking Toggles */}
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                      <Eye className="w-4 h-4 text-indigo-500" /> Interaction Tracking
                    </h3>
                    
                    {[
                      { key: 'open_tracking', label: 'Open Tracking', desc: 'Track when recipients open the email.' },
                      { key: 'click_tracking', label: 'Click Tracking', desc: 'Track link clicks within the email.' },
                      { key: 'reply_tracking', label: 'Reply Tracking', desc: 'Monitor the inbox for direct replies.' },
                      { key: 'bounce_tracking', label: 'Bounce Tracking', desc: 'Track failed deliveries and bounces.' }
                    ].map(t => (
                      <label key={t.key} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{t.label}</div>
                          <div className="text-xs text-slate-500">{t.desc}</div>
                        </div>
                        <div className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={formData.tracking[t.key as keyof typeof formData.tracking]}
                            onChange={e => setFormData({
                              ...formData, 
                              tracking: {...formData.tracking, [t.key]: e.target.checked}
                            })}
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Attachments Placeholder */}
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-center items-center text-center border-dashed border-2 opacity-70 cursor-not-allowed">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100">
                      <Paperclip className="w-8 h-8 text-slate-300" />
                    </div>
                    <h4 className="font-bold text-slate-700 mb-1">Drag & Drop Attachments</h4>
                    <p className="text-xs text-slate-500 max-w-[200px] mb-4">Support for PDF, DOCX, XLSX, images up to 5MB.</p>
                    <button disabled className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-400">Browse Files</button>
                    <span className="text-[10px] uppercase font-bold text-slate-400 mt-6 tracking-widest bg-white px-2 py-1 rounded">Coming in future phase</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Schedule */}
            {currentStep === 5 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Campaign Schedule</h2>
                  <p className="text-slate-500 mt-1">Determine exactly when the first email leaves your outbox.</p>
                </div>
                
                <div className="max-w-2xl space-y-6">
                  <div className="flex gap-4">
                    <label className={cn(
                      "flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center text-center gap-2",
                      formData.schedule.type === 'Immediate' ? "bg-blue-50 border-blue-500" : "bg-white border-slate-200 hover:border-slate-300"
                    )}>
                      <input 
                        type="radio" className="sr-only" 
                        checked={formData.schedule.type === 'Immediate'}
                        onChange={() => setFormData({...formData, schedule: {...formData.schedule, type: 'Immediate'}})}
                      />
                      <Send className={cn("w-6 h-6", formData.schedule.type === 'Immediate' ? "text-blue-600" : "text-slate-400")} />
                      <div>
                        <div className="font-bold text-slate-900">Send Immediately</div>
                        <div className="text-xs text-slate-500">Starts processing right now.</div>
                      </div>
                    </label>

                    <label className={cn(
                      "flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center text-center gap-2",
                      formData.schedule.type === 'Later' ? "bg-blue-50 border-blue-500" : "bg-white border-slate-200 hover:border-slate-300"
                    )}>
                      <input 
                        type="radio" className="sr-only" 
                        checked={formData.schedule.type === 'Later'}
                        onChange={() => setFormData({...formData, schedule: {...formData.schedule, type: 'Later'}})}
                      />
                      <Calendar className={cn("w-6 h-6", formData.schedule.type === 'Later' ? "text-blue-600" : "text-slate-400")} />
                      <div>
                        <div className="font-bold text-slate-900">Schedule Later</div>
                        <div className="text-xs text-slate-500">Pick a specific date and time.</div>
                      </div>
                    </label>
                  </div>

                  {formData.schedule.type === 'Later' && (
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 animate-in slide-in-from-top-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Start Date</label>
                          <input 
                            type="date" 
                            min={new Date().toISOString().split('T')[0]}
                            value={formData.schedule.start_date}
                            onChange={e => setFormData({...formData, schedule: {...formData.schedule, start_date: e.target.value}})}
                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Start Time</label>
                          <input 
                            type="time" 
                            value={formData.schedule.start_time}
                            onChange={e => setFormData({...formData, schedule: {...formData.schedule, start_time: e.target.value}})}
                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" 
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Timezone</label>
                        <select 
                          value={formData.schedule.timezone}
                          onChange={e => setFormData({...formData, schedule: {...formData.schedule, timezone: e.target.value}})}
                          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value="UTC">UTC (Universal Coordinated Time)</option>
                          <option value="America/New_York">Eastern Time (US & Canada)</option>
                          <option value="America/Chicago">Central Time (US & Canada)</option>
                          <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                          <option value="Europe/London">London (GMT)</option>
                          <option value="Asia/Kolkata">India (IST)</option>
                          <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>Local Time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <h3 className="font-bold text-slate-800 mb-3 text-sm">Delivery Windows</h3>
                    <label className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Business Hours Only</div>
                        <div className="text-xs text-slate-500">Only send between 9 AM and 6 PM.</div>
                      </div>
                      <div className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={formData.schedule.business_hours_only} onChange={e => setFormData({...formData, schedule: {...formData.schedule, business_hours_only: e.target.checked}})} />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </div>
                    </label>
                    <label className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Weekdays Only</div>
                        <div className="text-xs text-slate-500">Skip sending on Saturdays and Sundays.</div>
                      </div>
                      <div className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={formData.schedule.weekdays_only} onChange={e => setFormData({...formData, schedule: {...formData.schedule, weekdays_only: e.target.checked}})} />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Review & Start */}
            {currentStep === 6 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300 pb-12">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Review & Start</h2>
                    <p className="text-slate-500 mt-1">Final check before queuing your campaign.</p>
                  </div>
                  <div className="px-4 py-2 bg-green-50 text-green-700 font-bold text-sm rounded-xl border border-green-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Ready to Launch
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Big Stats */}
                  <div className="md:col-span-3 grid grid-cols-3 gap-4">
                    <div className="bg-white border border-slate-200 text-slate-900 p-5 rounded-2xl relative overflow-hidden shadow-xs">
                      <div className="text-slate-500 text-sm font-semibold mb-1">Target Audience</div>
                      <div className="text-4xl font-black text-slate-900">{selectedLeadIds.length.toLocaleString()}</div>
                      <div className="text-slate-400 text-xs mt-2">Leads prepared</div>
                    </div>
                    <div className="bg-blue-600 text-white p-5 rounded-2xl relative overflow-hidden">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
                      <div className="text-blue-200 text-sm font-semibold mb-1">Est. Duration</div>
                      <div className="text-4xl font-black">
                        {Math.ceil((selectedLeadIds.length * formData.rules.delay_seconds) / 3600)}<span className="text-2xl">h</span>
                      </div>
                      <div className="text-blue-200 text-xs mt-2">Based on delay & limits</div>
                    </div>
                    <div className="bg-white border-2 border-slate-200 p-5 rounded-2xl">
                      <div className="text-slate-500 text-sm font-semibold mb-1">Start Schedule</div>
                      <div className="text-2xl font-black text-slate-900 mt-2">
                        {formData.schedule.type === 'Immediate' ? 'Immediately' : `${formData.schedule.start_date}`}
                      </div>
                      {formData.schedule.type === 'Later' && <div className="text-slate-500 text-xs mt-2">{formData.schedule.start_time} ({formData.schedule.timezone})</div>}
                    </div>
                  </div>

                  {/* Summary Details */}
                  <div className="md:col-span-2 space-y-4">
                    <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                      <h3 className="font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">Campaign Configuration</h3>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                        <div>
                          <div className="text-slate-500 mb-1 text-xs uppercase font-bold">Name</div>
                          <div className="font-semibold text-slate-900">{formData.info.name}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 mb-1 text-xs uppercase font-bold">SMTP Account</div>
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            <Server className="w-3.5 h-3.5 text-blue-500" /> {activeSmtp?.name || 'Unknown'}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500 mb-1 text-xs uppercase font-bold">Template</div>
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-blue-500" /> {activeTemplate?.name || 'Unknown'}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500 mb-1 text-xs uppercase font-bold">Limits</div>
                          <div className="font-semibold text-slate-900">{formData.rules.max_per_hour}/hr, {formData.rules.max_per_day}/day</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Warning / Notes */}
                  <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl">
                    <h3 className="font-bold text-amber-900 flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4" /> Final Checks
                    </h3>
                    <ul className="space-y-3 text-xs text-amber-800 font-medium">
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" /> Make sure your SMTP account is warmed up.</li>
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" /> Verify template variables are correct.</li>
                      <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" /> Check duplicate protection is active to avoid spam.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Footer Navigation */}
          <div className="flex-none p-5 border-t border-slate-200 bg-white flex items-center justify-between sticky bottom-0 z-50">
            <button
              onClick={handleBack}
              className="px-6 py-2.5 text-slate-600 hover:text-slate-900 font-bold transition-colors flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            
            {currentStep < 6 ? (
              <button
                onClick={handleNext}
                className="group flex items-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-sm"
              >
                Next Step
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <button
                onClick={handleStartCampaign}
                disabled={createCampaign.isPending}
                className="group flex items-center gap-3 px-10 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-lg shadow-xl shadow-blue-500/30 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                {createCampaign.isPending ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Preparing...</>
                ) : (
                  <><Play className="w-5 h-5 fill-current" /> Start Campaign</>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
