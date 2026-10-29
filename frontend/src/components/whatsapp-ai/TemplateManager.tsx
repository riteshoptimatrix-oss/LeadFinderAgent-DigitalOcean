'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { useRouter } from 'next/navigation';
import { Check, MessageSquare, Clock, Globe, Tag, ArrowLeft, ArrowRight, CheckCircle2, Plus, Pencil, Trash2, X, Eye } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';
import { DeleteDialog } from '@/src/components/common/Dialogs';

interface Template {
  _id: string;
  name: string;
  content: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

const STEPS = [
  { id: 1, label: 'Select Leads', status: 'completed' },
  { id: 2, label: 'AI Templates', status: 'active' },
  { id: 3, label: 'Campaign Wizard', status: 'pending' },
  { id: 4, label: 'Live Campaign', status: 'pending' },
];

const SAMPLE_LEAD: Record<string, string> = {
  business_name: 'Acme Technologies',
  owner_name: 'Jane Doe',
  phone: '+1 (555) 012-3456',
  email: 'contact@acmetechnologies.com',
  website: 'www.acmetechnologies.com',
  city: 'San Francisco',
  state: 'CA',
  country: 'USA',
  industry: 'Software',
  address: '123 Tech Lane, SF',
  ai_score: '98'
};

export default function TemplateManager() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Template modal state (create / edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

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
  }, []);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['wa-ai-templates'],
    queryFn: async () => {
      const res = await api.get('/whatsapp-ai/templates');
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; content: string; description?: string }) => {
      const res = await api.post('/whatsapp-ai/templates', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wa-ai-templates'] });
      toast.success('Template created successfully');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to create template');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: { name: string; content: string; description?: string } }) => {
      const res = await api.put(`/whatsapp-ai/templates/${id}`, payload);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['wa-ai-templates'] });
      // Keep selection in sync if the edited template was selected
      setSelectedTemplate(prev => prev && prev._id === updated._id ? { ...prev, ...updated } : prev);
      toast.success('Template updated successfully');
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to update template');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/whatsapp-ai/templates/${id}`);
      return res.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['wa-ai-templates'] });
      setSelectedTemplate(prev => prev && prev._id === id ? null : prev);
      setDeleteTarget(null);
      toast.success('Template deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to delete template');
    }
  });

  const getPreviewContent = (content: string) => {
    if (!content) return '';
    let preview = content;
    Object.entries(SAMPLE_LEAD).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      preview = preview.replace(regex, value);
    });
    return preview;
  };

  const getVariables = (content: string) => {
    const matches = content.match(/{{(.*?)}}/g);
    if (!matches) return [];
    return Array.from(new Set(matches.map(m => m.replace(/[{}]/g, ''))));
  };

  const openCreate = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormDescription('');
    setFormContent('');
    setModalOpen(true);
  };

  const openEdit = (template: Template) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormDescription(template.description || '');
    setFormContent(template.content);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingTemplate(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (!formContent.trim()) {
      toast.error('Template message content is required');
      return;
    }
    const payload = {
      name: formName.trim(),
      content: formContent.trim(),
      description: formDescription.trim() || undefined
    };
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate._id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleNext = () => {
    if (!selectedTemplate) {
      toast.error('Please select a template to continue.');
      return;
    }
    localStorage.setItem('wa_selected_template', JSON.stringify(selectedTemplate));
    router.push('/dashboard/whatsapp-ai?tab=campaigns');
  };

  if (!isMounted) return null;

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

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

      {/* Stats Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
            <Check className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Selected Count</p>
            <p className="text-2xl font-bold text-slate-900">{selectedLeads.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Selected Businesses</p>
            <p className="text-2xl font-bold text-slate-900">{selectedLeads.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Estimated Messages</p>
            <p className="text-2xl font-bold text-slate-900">{selectedLeads.length}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-0">
        
        {/* Template List */}
        <div className="flex flex-col min-h-0 bg-slate-50/50 rounded-3xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Message Templates</h2>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/30"
            >
              <Plus className="w-4 h-4" />
              New Template
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 animate-pulse">
                  <div className="h-5 bg-slate-200 rounded w-1/3 mb-3"></div>
                  <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                </div>
              ))
            ) : templates.length === 0 ? (
              <div className="text-center py-12 text-slate-500 flex flex-col items-center gap-3">
                <MessageSquare className="w-10 h-10 text-slate-300" />
                <p>No templates found yet.</p>
                <button
                  onClick={openCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Create your first template
                </button>
              </div>
            ) : (
              templates.map((template) => {
                const isSelected = selectedTemplate?._id === template._id;
                const variables = getVariables(template.content);
                
                return (
                  <div 
                    key={template._id}
                    onClick={() => setSelectedTemplate(template)}
                    className={cn(
                      "bg-white border-2 rounded-2xl p-5 cursor-pointer transition-all duration-200 hover:shadow-md relative group",
                      isSelected ? "border-blue-500 shadow-sm ring-4 ring-blue-500/10" : "border-slate-200 hover:border-blue-300"
                    )}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                          {template.name}
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                        </h3>
                        {template.description && <p className="text-sm text-slate-500 mt-0.5">{template.description}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(template); }}
                          className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit template"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(template); }}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete template"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-3 mb-4">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-xs font-medium text-slate-600">
                        <Tag className="w-3 h-3" />
                        Outreach
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-xs font-medium text-slate-600">
                        <Globe className="w-3 h-3" />
                        English
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-xs font-medium text-slate-600">
                        <Clock className="w-3 h-3" />
                        {template.updated_at
                          ? `Updated ${new Date(template.updated_at).toLocaleDateString()}`
                          : 'Just now'}
                      </span>
                    </div>

                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <div className="text-xs font-semibold text-slate-500 mb-2">Variables ({variables.length})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {variables.length > 0 ? variables.map((v, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono border border-blue-100">
                            {`{{${v}}}`}
                          </span>
                        )) : (
                          <span className="text-xs text-slate-400 italic">No variables</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Live Preview */}
        <div className="flex flex-col min-h-0 bg-white rounded-3xl border border-slate-200 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col h-full">
            <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              Live Preview
            </h2>
            <p className="text-sm text-slate-500 mb-6">Showing preview with sample lead data</p>
            
            <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-200 p-6 overflow-y-auto">
              {selectedTemplate ? (
                <div className="space-y-4">
                  <div className="bg-[#E1F6CB] text-[#111B21] p-4 rounded-2xl rounded-tl-sm max-w-[85%] shadow-sm relative">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {getPreviewContent(selectedTemplate.content)}
                    </div>
                    <span className="text-[10px] text-slate-500 absolute bottom-1.5 right-3">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                  <MessageSquare className="w-10 h-10 text-slate-300" />
                  <p>Select a template to view the preview</p>
                </div>
              )}
            </div>
            
            <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Sample Lead Data</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-slate-500 flex justify-between">
                  <span>Name:</span> <span className="text-slate-900 font-semibold truncate max-w-[100px]">{SAMPLE_LEAD.business_name}</span>
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>Contact:</span> <span className="text-slate-900 font-semibold truncate max-w-[100px]">{SAMPLE_LEAD.owner_name}</span>
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>City:</span> <span className="text-slate-900 font-semibold truncate max-w-[100px]">{SAMPLE_LEAD.city}</span>
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>Industry:</span> <span className="text-slate-900 font-semibold truncate max-w-[100px]">{SAMPLE_LEAD.industry}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Navigation Buttons */}
      <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between">
        <button
          onClick={() => router.push('/dashboard/whatsapp-ai')}
          className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Lead Selection
        </button>
        
        <button
          onClick={handleNext}
          disabled={!selectedTemplate}
          className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/30 disabled:opacity-50 disabled:hover:bg-blue-600 disabled:shadow-none"
        >
          Next Step
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── Template Create/Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingTemplate ? 'Edit Template' : 'Create New Template'}
                </h3>
                <p className="text-sm text-slate-500">
                  Use placeholders like {'{{business_name}}'} — they are replaced with real lead data at send time.
                </p>
              </div>
              <button onClick={closeModal} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Form fields */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Template Name *</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Cold Outreach — Professional"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Description</label>
                  <input
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Short description of this template's use case"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Message Content *</label>
                    <span className="text-[10px] font-mono text-slate-400">{formContent.length} chars</span>
                  </div>
                  <textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    rows={8}
                    placeholder={'Hello {{business_name}}, ...'}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none font-mono leading-relaxed"
                  />
                  <div className="mt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Available variables</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.keys(SAMPLE_LEAD).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFormContent(prev => `${prev}{{${key}}}`)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono border border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                        >
                          {`{{${key}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Live preview */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 flex flex-col min-h-[320px]">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
                  <Eye className="w-4 h-4 text-blue-600" />
                  Live Preview
                </h4>
                <p className="text-xs text-slate-500 mb-4">Rendered with sample lead data</p>
                <div className="flex-1 bg-[#E1F6CB] text-[#111B21] p-4 rounded-2xl rounded-tl-sm shadow-sm overflow-y-auto">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {getPreviewContent(formContent) || <span className="text-slate-500 italic">Start typing to preview your message…</span>}
                  </div>
                  <div className="mt-3 pt-2 border-t border-black/10 text-right">
                    <span className="text-[10px] text-slate-600">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Variables used</p>
                  <div className="flex flex-wrap gap-1.5">
                    {getVariables(formContent).length > 0 ? getVariables(formContent).map((v, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono border border-blue-200">
                        {`{{${v}}}`}
                      </span>
                    )) : (
                      <span className="text-xs text-slate-400 italic">No variables</span>
                    )}
                  </div>
                </div>
              </div>
            </form>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                className="px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/30 disabled:opacity-50 disabled:hover:bg-blue-600 disabled:shadow-none"
              >
                {isSubmitting && <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
                {editingTemplate ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      <DeleteDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}
        title="Delete Template"
        message={deleteTarget
          ? `Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`
          : 'Are you sure you want to delete this template?'}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
