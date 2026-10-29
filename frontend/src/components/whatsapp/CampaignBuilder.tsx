'use client';

import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import TemplatePreview from '@/src/components/whatsapp/TemplatePreview';
import {
  Send, CheckCircle, AlertCircle, Loader2, FileText,
  ArrowRight, ArrowLeft, Users, Info, X, Check,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';

interface CampaignBuilderProps {
  leads: any[];
  total?: number;
  templates: any[];
  loadingLeads: boolean;
  onCampaignCreated?: () => void;
}

type Step = 'leads' | 'template' | 'confirm';

export default function CampaignBuilder({ leads, total, templates, loadingLeads, onCampaignCreated }: CampaignBuilderProps) {
  const queryClient = useQueryClient();
  const tableRef = useRef<any>(null);

  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [campaignName, setCampaignName] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [currentStep, setCurrentStep] = useState<Step>('leads');

  const [template, setTemplate] = useState({ name: '', content: '' });
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  const selectedTemplate = templates.find((t: any) => t._id === selectedTemplateId);
  const selectedLeads = leads.filter((l: any) => selectedLeadIds.includes(l._id));

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/whatsapp/campaigns', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Campaign created! It will start sending messages shortly.');
      queryClient.invalidateQueries({ queryKey: ['wa-campaigns'] });
      setSelectedLeadIds([]);
      setSelectedTemplateId('');
      setCampaignName('');
      setCampaignDescription('');
      setCurrentStep('leads');
      onCampaignCreated?.();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to create campaign');
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/whatsapp/templates', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Template saved!');
      templates.push(data);
      setSelectedTemplateId(data._id);
      setShowSaveTemplate(false);
      setTemplate({ name: '', content: '' });
    },
    onError: () => toast.error('Failed to save template'),
  });

  const handleCreateCampaign = () => {
    if (!campaignName.trim()) return toast.error('Campaign name is required');
    if (selectedLeadIds.length === 0) return toast.error('Select at least one lead');
    if (!selectedTemplateId) return toast.error('Choose a message template');

    createMutation.mutate({
      name: campaignName.trim(),
      description: campaignDescription.trim(),
      lead_ids: selectedLeadIds,
      template_id: selectedTemplateId,
    });
  };

  const STEPS: { id: Step; label: string; icon: typeof Users }[] = [
    { id: 'leads', label: 'Select Leads', icon: Users },
    { id: 'template', label: 'Choose Template', icon: MessageSquare },
    { id: 'confirm', label: 'Review & Send', icon: Send },
  ];

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  const canProceed = () => {
    if (currentStep === 'leads') return selectedLeadIds.length > 0;
    if (currentStep === 'template') return !!selectedTemplateId;
    return true;
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-0 max-w-2xl mx-auto">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === currentStepIndex;
          const isDone = i < currentStepIndex;
          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => {
                  if (isDone) setCurrentStep(step.id);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md'
                    : isDone
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer'
                    : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                }`}
              >
                {isDone ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px mx-1 ${isDone ? 'bg-slate-300' : 'bg-slate-100'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {currentStep === 'leads' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Select Target Leads</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  Choose leads to include in this campaign
                </p>
              </div>
              {selectedLeadIds.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-700">
                    {selectedLeadIds.length} of {total ?? leads.length} selected
                  </span>
                </div>
              )}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {loadingLeads ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : leads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                    <AlertCircle className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">No leads found</p>
                  <p className="text-xs text-slate-400 mt-1">Add leads from the Discover or Leads page first</p>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-3">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={selectedLeadIds.length === leads.length && leads.length > 0}
                            onChange={(e) => {
                              setSelectedLeadIds(
                                e.target.checked ? leads.map((l: any) => l._id) : []
                              );
                            }}
                          />
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Business</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Area</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {leads.map((lead: any) => {
                        const isSelected = selectedLeadIds.includes(lead._id);
                        return (
                          <tr
                            key={lead._id}
                            onClick={() => {
                              setSelectedLeadIds((prev) =>
                                isSelected ? prev.filter((id) => id !== lead._id) : [...prev, lead._id]
                              );
                            }}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-emerald-50/60'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300"
                                checked={isSelected}
                                onChange={() => {}}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">{lead.name || 'Unknown'}</td>
                            <td className="px-4 py-3 text-slate-600">{lead.category || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{lead.area || lead.city || '—'}</td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-600">
                              {lead.phones?.length > 1 ? (
                                <div className="group relative flex items-center">
                                  <span className="border-b border-dashed border-slate-400 cursor-help">{lead.phones[0]}</span>
                                  <span className="ml-1 text-[10px] bg-slate-100 text-slate-500 px-1 rounded">+{lead.phones.length - 1}</span>
                                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-slate-800 text-white text-xs p-2 rounded shadow-lg z-10 whitespace-nowrap">
                                    <div className="font-semibold mb-1 border-b border-slate-700 pb-1">All Numbers</div>
                                    {lead.phones.map((p: string, i: number) => <div key={i}>{p}</div>)}
                                  </div>
                                </div>
                              ) : (
                                lead.phone || '—'
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full ${
                                lead.aiAnalysis
                                  ? lead.aiAnalysis === 'HOT'
                                    ? 'bg-red-50 text-red-600'
                                    : lead.aiAnalysis === 'WARM'
                                    ? 'bg-amber-50 text-amber-600'
                                    : 'bg-slate-100 text-slate-600'
                                  : 'bg-slate-50 text-slate-400'
                              }`}>
                                {lead.aiAnalysis || 'No analysis'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {currentStep === 'template' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Message Template</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Pick a template or create a new one
              </p>
            </div>

            {showSaveTemplate ? (
              <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-700">New Template</h4>
                  <button onClick={() => setShowSaveTemplate(false)} className="p-1 hover:bg-slate-100 rounded-md transition-colors">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <input
                  value={template.name}
                  onChange={(e) => setTemplate(p => ({ ...p, name: e.target.value }))}
                  placeholder="Template name"
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
                <textarea
                  value={template.content}
                  onChange={(e) => setTemplate(p => ({ ...p, content: e.target.value }))}
                  placeholder={"Use {{business_name}}, {{owner}}, {{city}}, {{website}}, {{phone}}, {{category}} as placeholders."}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-300 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                />
                <div className="flex items-center gap-2 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg">
                  <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="text-xs text-blue-600">
                    Use {'{{variable}}'} to insert lead data like business name, city, etc.
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (!template.name.trim() || !template.content.trim()) {
                      toast.error('Template name and content are required');
                      return;
                    }
                    saveTemplateMutation.mutate({ name: template.name.trim(), content: template.content.trim() });
                  }}
                  disabled={saveTemplateMutation.isPending}
                  className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {saveTemplateMutation.isPending ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <div className="lg:col-span-2 space-y-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Saved Templates</span>
                    <button
                      onClick={() => setShowSaveTemplate(true)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-md hover:bg-slate-100 transition-colors"
                    >
                      + New
                    </button>
                  </div>
                  {templates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <FileText className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-xs text-slate-400">No templates yet</p>
                    </div>
                  ) : (
                    templates.map((tpl: any) => (
                      <button
                        key={tpl._id}
                        onClick={() => setSelectedTemplateId(tpl._id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          selectedTemplateId === tpl._id
                            ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-semibold ${selectedTemplateId === tpl._id ? 'text-white' : 'text-slate-800'}`}>
                            {tpl.name}
                          </span>
                          {selectedTemplateId === tpl._id && (
                            <Check className="w-4 h-4 text-white" />
                          )}
                        </div>
                        <p className={`text-xs mt-1 line-clamp-2 ${selectedTemplateId === tpl._id ? 'text-white/70' : 'text-slate-400'}`}>
                          {tpl.content?.substring(0, 80)}...
                        </p>
                      </button>
                    ))
                  )}
                </div>

                <div className="lg:col-span-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Preview</span>
                  {selectedTemplate ? (
                    <div className="bg-slate-50/50 rounded-xl border border-slate-200 p-5">
                      <TemplatePreview
                        content={selectedTemplate.content}
                        leadData={selectedLeads[0] || {
                          name: 'Acme Solutions',
                          city: 'Mumbai',
                          website: 'www.acme.com',
                          phone: '+91 98765 43210',
                          category: 'IT Services',
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                      <MessageSquare className="w-8 h-8 text-slate-200 mb-2" />
                      <p className="text-xs text-slate-400">Select a template to preview</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {currentStep === 'confirm' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Review & Launch</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Double-check everything before sending
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Campaign Name *</label>
                  <input
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. Summer Sale Blast"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                  />
                </div>

                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description (optional)</label>
                  <input
                    value={campaignDescription}
                    onChange={(e) => setCampaignDescription(e.target.value)}
                    placeholder="Internal note for this campaign"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Campaign Summary</span>
                <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-slate-500">Target leads</span>
                    <span className="text-sm font-bold text-slate-800">{selectedLeadIds.length}</span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-slate-500">Template</span>
                    <span className="text-sm font-medium text-slate-700">{selectedTemplate?.name || '—'}</span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-slate-500">Message length</span>
                    <span className="text-sm text-slate-600">{selectedTemplate?.content?.length || 0} chars</span>
                  </div>
                </div>
              </div>
            </div>

            {selectedTemplate && (
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Message Preview</span>
                <div className="bg-slate-50/50 rounded-xl border border-slate-200 p-5">
                  <TemplatePreview content={selectedTemplate.content} leadData={selectedLeads[0]} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          onClick={() => setCurrentStep(STEPS[currentStepIndex - 1].id)}
          disabled={currentStepIndex === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {currentStep === 'confirm' ? (
          <button
            onClick={handleCreateCampaign}
            disabled={createMutation.isPending || !campaignName.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-md"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {createMutation.isPending ? 'Creating...' : 'Launch Campaign'}
          </button>
        ) : (
          <button
            onClick={() => setCurrentStep(STEPS[currentStepIndex + 1].id)}
            disabled={!canProceed()}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-md"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
