'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { useRouter } from 'next/navigation';
import { Send, ArrowLeft, Clock, Shuffle, RefreshCw, Calendar, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import WhatsAppComingSoonModal from './WhatsAppComingSoonModal';

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
  const [showComingSoon, setShowComingSoon] = useState(false);
  
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    optional_delay: 5,
    random_delay: true,
    retry_count: 3,
    schedule: ''
  });

  useEffect(() => {
    setIsMounted(true);
    const savedLeads = localStorage.getItem('wa_selected_leads');
    if (savedLeads) {
      try {
        const parsed = JSON.parse(savedLeads);
        if (Array.isArray(parsed)) setSelectedLeads(parsed);
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
      toast.success('Campaign started successfully!');
      
      // Pass the campaign ID to the live view via query param or local storage
      if (data && data._id) {
        localStorage.setItem('wa_active_campaign', data._id);
      }
      
      router.push('/dashboard/whatsapp-ai/live');
    },
    onError: () => {
      toast.error('Failed to start campaign. Please try again.');
    }
  });

  const handleStartCampaign = () => {
    if (!formData.name) {
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
    setShowComingSoon(true);
  };

  const calculateDuration = () => {
    const baseDelay = formData.optional_delay || 5;
    const additional = formData.random_delay ? 3 : 0; // average random addition
    const totalSeconds = selectedLeads.length * (baseDelay + additional);
    
    if (totalSeconds < 60) return `${totalSeconds} seconds`;
    const minutes = Math.floor(totalSeconds / 60);
    return `~${minutes} min`;
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-200">
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

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Campaign Wizard</h2>
          <p className="text-slate-500 text-sm mt-1">Configure your sending parameters and start the queue</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
        
        {/* Form Configuration */}
        <div className="lg:col-span-2 flex flex-col min-h-0 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm overflow-y-auto">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Configuration</h3>
          
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 text-slate-700 resize-none h-24"
                  placeholder="Internal note about this campaign's goal"
                />
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-1.5">
                    <Clock className="w-4 h-4 text-blue-500" />
                    Delay Between Messages (Seconds)
                  </label>
                  <input 
                    type="number" 
                    min="1"
                    value={formData.optional_delay}
                    onChange={e => setFormData({ ...formData, optional_delay: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">Base delay to prevent spam detection.</p>
                </div>
                
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
                    <Shuffle className="w-4 h-4 text-purple-500" />
                    Randomize Delay
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
                      {formData.random_delay ? 'Enabled (+1s to 5s)' : 'Disabled (Fixed Delay)'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-1.5">
                    <RefreshCw className="w-4 h-4 text-amber-500" />
                    Retry Count on Failure
                  </label>
                  <input 
                    type="number" 
                    min="0"
                    max="10"
                    value={formData.retry_count}
                    onChange={e => setFormData({ ...formData, retry_count: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">Times to retry if number is unreachable.</p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-1.5">
                    <Calendar className="w-4 h-4 text-green-500" />
                    Schedule (Optional)
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
        </div>

        {/* Summary Panel */}
        <div className="flex flex-col min-h-0 bg-slate-900 rounded-3xl border border-slate-800 p-8 relative overflow-hidden text-white shadow-xl shadow-blue-900/10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col h-full">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2 border-b border-slate-700 pb-4">
              Campaign Summary
            </h3>
            
            <div className="space-y-6 flex-1">
              <div>
                <div className="text-sm text-slate-400 mb-1">Selected Leads</div>
                <div className="text-3xl font-bold text-white flex items-baseline gap-2">
                  {selectedLeads.length}
                  <span className="text-sm font-medium text-blue-400">businesses</span>
                </div>
              </div>
              
              <div>
                <div className="text-sm text-slate-400 mb-1">Selected Template</div>
                <div className="text-base font-medium text-white truncate">
                  {selectedTemplate?.name || 'None selected'}
                </div>
              </div>
              
              <div>
                <div className="text-sm text-slate-400 mb-1">Estimated Duration</div>
                <div className="text-lg font-semibold text-amber-400">
                  {calculateDuration()}
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-700">
                <div className="text-sm text-slate-400 mb-3">Settings Overview</div>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex justify-between">
                    <span>Base Delay:</span>
                    <span className="text-white font-medium">{formData.optional_delay}s</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Randomize:</span>
                    <span className="text-white font-medium">{formData.random_delay ? 'Yes' : 'No'}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Retries:</span>
                    <span className="text-white font-medium">{formData.retry_count}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Start Time:</span>
                    <span className="text-white font-medium">{formData.schedule ? new Date(formData.schedule).toLocaleString() : 'Immediate'}</span>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-700">
              <button
                onClick={handleStartCampaign}
                disabled={launchMutation.isPending}
                className="w-full flex justify-center items-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-xl text-base font-bold hover:bg-blue-500 transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] disabled:opacity-50 disabled:shadow-none"
              >
                {launchMutation.isPending ? 'Starting Queue...' : 'Start Campaign'}
                {!launchMutation.isPending && <Send className="w-5 h-5 ml-1" />}
              </button>
              <p className="text-center text-xs text-slate-400 mt-3">Campaign will start immediately. No extra confirmation.</p>
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

      <WhatsAppComingSoonModal
        isOpen={showComingSoon}
        onClose={() => setShowComingSoon(false)}
      />
    </div>
  );
}
