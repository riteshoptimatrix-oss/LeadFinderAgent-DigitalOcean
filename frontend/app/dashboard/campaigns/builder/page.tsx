'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { PageHeader } from '@/src/components/common/PageHeader';
import { ArrowLeft, Users, FileText, Send, Calendar, Save } from 'lucide-react';
import Link from 'next/link';

export default function CampaignBuilderPage() {
  const router = useRouter();
  
  const [name, setName] = useState('');
  const [type, setType] = useState('EMAIL');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  
  // Template Creation State
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateSubject, setNewTemplateSubject] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');

  // Target Leads State
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Fetch Templates
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['templates', type],
    queryFn: async () => {
      const res = await api.get(`/campaigns/templates?campaign_type=${type}`);
      return res.data;
    }
  });

  // Fetch Total Target Audience Count based on filter
  const { data: audienceStats } = useQuery({
    queryKey: ['audienceCount', selectedStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('limit', '1');
      if (selectedStatus !== 'ALL') params.append('status', selectedStatus);
      const res = await api.get(`/leads?${params.toString()}`);
      return { total: res.data.total, leads: res.data.data }; // We just need total right now for simplicity, but in a real app we'd fetch actual IDs or let the backend do the filtering on campaign creation
    }
  });

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: newTemplateName,
        campaign_type: type,
        subject: type === 'EMAIL' ? newTemplateSubject : undefined,
        content: newTemplateContent
      };
      const res = await api.post('/campaigns/templates', payload);
      return res.data;
    },
    onSuccess: (data) => {
      setIsCreatingTemplate(false);
      refetchTemplates();
      setSelectedTemplate(data._id);
    }
  });

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      // For this implementation, we need the exact lead IDs. 
      // We will fetch them briefly based on the selectedStatus.
      const params = new URLSearchParams({ limit: '10000' });
      if (selectedStatus !== 'ALL') params.append('status', selectedStatus);
      const leadsRes = await api.get(`/leads?${params.toString()}`);
      const leadIds = leadsRes.data.data.map((l: any) => l._id);

      if (leadIds.length === 0) {
        throw new Error("No leads found for the selected audience filter.");
      }

      const payload = {
        name,
        campaign_type: type,
        template_id: selectedTemplate,
        lead_ids: leadIds,
        scheduled_date: isScheduled ? new Date(scheduledDate).toISOString() : null
      };
      
      const res = await api.post('/campaigns/', payload);
      return res.data;
    },
    onSuccess: (data) => {
      router.push(`/dashboard/campaigns/detail?id=${data._id}`);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to create campaign.");
    }
  });

  const isFormValid = name.trim() && selectedTemplate && audienceStats?.total > 0 && (!isScheduled || scheduledDate);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard/campaigns" className="p-2 text-[#6B7280] hover:text-[#111827] bg-white rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#111827]">Campaign Builder</h1>
          <p className="text-[#6B7280] text-sm mt-1">Configure and launch a new outreach campaign.</p>
        </div>
      </div>

      <div className="space-y-8">
        
        {/* Step 1: Basic Info */}
        <div className="bg-[#FAFAF8] border border-[#E7E5E4] rounded-2xl p-8 space-y-6">
          <h2 className="text-lg font-bold text-[#111827] flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 text-xs">1</span>
            Basic Details
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#6B7280] mb-2">Campaign Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Q3 Software Companies Outreach"
                className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-[#111827] outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#6B7280] mb-2">Campaign Type</label>
              <div className="flex gap-4">
                {['EMAIL', 'WHATSAPP'].map(t => (
                  <button
                    key={t}
                    onClick={() => { setType(t); setSelectedTemplate(''); }}
                    className={`flex-1 py-4 border rounded-xl font-bold transition-all ${type === t ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-white border-[#E7E5E4] text-[#6B7280] hover:bg-[#FCFCFA]'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Template Selection */}
        <div className="bg-[#FAFAF8] border border-[#E7E5E4] rounded-2xl p-8 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-[#111827] flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 text-xs">2</span>
              Message Template
            </h2>
            <button 
              onClick={() => setIsCreatingTemplate(!isCreatingTemplate)}
              className="text-sm text-blue-400 hover:text-blue-300 font-medium"
            >
              {isCreatingTemplate ? 'Select Existing' : '+ Create New'}
            </button>
          </div>

          {isCreatingTemplate ? (
            <div className="bg-white p-6 rounded-xl border border-[#E7E5E4] space-y-4">
              <input 
                type="text" placeholder="Template Name" value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)}
                className="w-full px-4 py-2 bg-[#FAFAF8] border border-[#E7E5E4] rounded-lg text-[#111827] outline-none focus:border-blue-500"
              />
              {type === 'EMAIL' && (
                <input 
                  type="text" placeholder="Email Subject (e.g. Collaboration with {{BusinessName}})" value={newTemplateSubject} onChange={e => setNewTemplateSubject(e.target.value)}
                  className="w-full px-4 py-2 bg-[#FAFAF8] border border-[#E7E5E4] rounded-lg text-[#111827] outline-none focus:border-blue-500"
                />
              )}
              
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-xs font-semibold text-[#6B7280] uppercase">Insert Variable:</span>
                  {['{{BusinessName}}', '{{Website}}', '{{Email}}', '{{Phone}}', '{{Address}}', '{{Category}}'].map(v => (
                    <button key={v} onClick={() => setNewTemplateContent(prev => prev + v)} className="text-xs bg-[#FCFCFA] hover:bg-neutral-700 text-blue-400 px-2 py-1 rounded">
                      {v}
                    </button>
                  ))}
                </div>
                <textarea 
                  placeholder="Message HTML or Text Content. Use variables above..." 
                  value={newTemplateContent} onChange={e => setNewTemplateContent(e.target.value)}
                  className="w-full h-48 px-4 py-3 bg-[#FAFAF8] border border-[#E7E5E4] rounded-lg text-[#111827] outline-none focus:border-blue-500 resize-none font-mono text-sm"
                />
              </div>

              <button 
                onClick={() => createTemplateMutation.mutate()}
                disabled={createTemplateMutation.isPending || !newTemplateName || !newTemplateContent}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[#111827] rounded-lg font-medium flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save Template
              </button>
            </div>
          ) : (
            <div>
              {templates.length === 0 ? (
                <p className="text-[#6B7280] text-sm">No templates found for {type}. Please create one.</p>
              ) : (
                <select 
                  value={selectedTemplate}
                  onChange={e => setSelectedTemplate(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-[#111827] outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a template...</option>
                  {templates.map((t: any) => (
                    <option key={t._id} value={t._id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Step 3: Audience */}
        <div className="bg-[#FAFAF8] border border-[#E7E5E4] rounded-2xl p-8 space-y-6">
          <h2 className="text-lg font-bold text-[#111827] flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 text-xs">3</span>
            Target Audience
          </h2>

          <div className="flex gap-6 items-start">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#6B7280] mb-2">Filter CRM Leads by Status</label>
              <select 
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-[#111827] outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              >
                <option value="ALL">All Leads in CRM</option>
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="Interested">Interested</option>
                <option value="Follow Up">Follow Up</option>
              </select>
              {type === 'EMAIL' && (
                <p className="text-xs text-blue-400 font-medium">
                  Note: The system will automatically exclude leads missing valid email addresses when launching.
                </p>
              )}
            </div>
            
            <div className="w-48 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <Users className="w-6 h-6 text-blue-500 mb-2" />
              <span className="text-2xl font-bold text-[#111827]">{audienceStats?.total || 0}</span>
              <span className="text-xs text-[#6B7280] uppercase tracking-wider font-semibold">Recipients</span>
            </div>
          </div>
        </div>

        {/* Step 4: Schedule */}
        <div className="bg-[#FAFAF8] border border-[#E7E5E4] rounded-2xl p-8 space-y-6">
          <h2 className="text-lg font-bold text-[#111827] flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-500 text-xs">4</span>
            Delivery Schedule
          </h2>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsScheduled(false)}
              className={`flex-1 py-4 border rounded-xl font-bold transition-all flex justify-center items-center gap-2 ${!isScheduled ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-white border-[#E7E5E4] text-[#6B7280]'}`}
            >
              <Send className="w-4 h-4" /> Send Immediately
            </button>
            <button 
              onClick={() => setIsScheduled(true)}
              className={`flex-1 py-4 border rounded-xl font-bold transition-all flex justify-center items-center gap-2 ${isScheduled ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-white border-[#E7E5E4] text-[#6B7280]'}`}
            >
              <Calendar className="w-4 h-4" /> Schedule for Later
            </button>
          </div>

          {isScheduled && (
            <div className="pt-4">
              <input 
                type="datetime-local" 
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-[#111827] outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#FAFAF8]/80 backdrop-blur-md border-t border-[#E7E5E4] p-4 z-50">
        <div className="w-full max-w-5xl mx-auto flex justify-between items-center">
          <p className="text-sm text-[#6B7280]">
            {isFormValid ? "Ready to launch campaign." : "Please complete all required fields above."}
          </p>
          <button 
            onClick={() => createCampaignMutation.mutate()}
            disabled={!isFormValid || createCampaignMutation.isPending}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-[#FCFCFA] disabled:text-[#6B7280] text-[#111827] rounded-xl font-bold transition-all flex items-center gap-2"
          >
            {createCampaignMutation.isPending ? 'Processing...' : (isScheduled ? 'Schedule Campaign' : 'Launch Campaign')}
          </button>
        </div>
      </div>
    </div>
  );
}
