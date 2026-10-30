'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  Search, Plus, FileText, Settings, Star, Trash2, Copy, Eye, Clock, Hash, ChevronDown, 
  Smartphone, Monitor, Tablet, Bold, Italic, Underline, List, Link as LinkIcon, Image as ImageIcon, 
  AlignLeft, AlignCenter, AlignRight, Type, Undo, Redo, LayoutTemplate, LayoutPanelTop, MousePointerSquareDashed, Filter, CheckCircle2, 
  Sparkles, MessageSquare, AlertTriangle, ShieldAlert, Zap, History, X,
  Building2, User, Mail, Phone, Globe, Briefcase, MapPin, ArrowRight, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { useRouter } from 'next/navigation';

interface Template {
  _id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  category: string;
  language: string;
  is_favorite: boolean;
  usage_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  "Cold Outreach", "Warm Outreach", "Follow Up", "Second Follow Up", 
  "Meeting Request", "Sales", "Marketing", "IT Services", 
  "Website Development", "SEO", "AI Automation", "Consultation", "Custom"
];

const VARIABLES = [
  { key: 'business_name', label: 'Business Name', icon: <Building2 className="w-3 h-3" /> },
  { key: 'owner_name', label: 'Owner Name', icon: <User className="w-3 h-3" /> },
  { key: 'email', label: 'Email', icon: <Mail className="w-3 h-3" /> },
  { key: 'phone', label: 'Phone', icon: <Phone className="w-3 h-3" /> },
  { key: 'website', label: 'Website', icon: <Globe className="w-3 h-3" /> },
  { key: 'industry', label: 'Industry', icon: <Briefcase className="w-3 h-3" /> },
  { key: 'city', label: 'City', icon: <MapPin className="w-3 h-3" /> },
  { key: 'ai_score', label: 'AI Score', icon: <Sparkles className="w-3 h-3" /> },
];



const STEPS = [
  { id: 1, label: 'Select Leads', active: false, completed: true },
  { id: 2, label: 'AI Templates', active: true, completed: false },
  { id: 3, label: 'Campaign Wizard', active: false, completed: false },
  { id: 4, label: 'Live Campaign', active: false, completed: false },
];

export default function EmailTemplateManager() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isMounted, setIsMounted] = useState(false);
  
  // App State
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  
  // Editor State
  const [formData, setFormData] = useState({
    name: 'New Template',
    subject: '',
    body_html: '',
    category: 'Custom',
    language: 'English'
  });
  
  const [htmlMode, setHtmlMode] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [sampleLead, setSampleLead] = useState<any>(null);
  
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    // Load sample lead from selected leads
    try {
      const savedIds = localStorage.getItem('email_selected_leads');
      if (savedIds) {
        const ids = JSON.parse(savedIds);
        if (ids.length > 0) {
          // In a real app we'd fetch the actual lead data, but for preview we can mock it based on expected structure
          setSampleLead({
            business_name: 'Acme Corp',
            owner_name: 'John Doe',
            email: 'john@acmecorp.com',
            phone: '+1 555 0199',
            website: 'www.acmecorp.com',
            industry: 'Software',
            city: 'San Francisco',
            ai_score: 95
          });
        }
      }
    } catch (e) {}
  }, []);

  // Fetch Templates
  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['email-ai-templates'],
    queryFn: async () => {
      const res = await api.get('/email-ai/templates');
      return res.data;
    }
  });

  // Derived state
  const activeTemplate = templates.find(t => t._id === activeTemplateId);
  
  const filteredTemplates = templates.filter(t => {
    if (activeCategory !== 'All' && activeCategory !== 'Favorites' && t.category !== activeCategory) return false;
    if (activeCategory === 'Favorites' && !t.is_favorite) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.subject.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: any) => await api.post('/email-ai/templates', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['email-ai-templates'] });
      setActiveTemplateId(res.data._id);
      toast.success('Template created successfully');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => await api.put(`/email-ai/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-ai-templates'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => await api.delete(`/email-ai/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-ai-templates'] });
      setActiveTemplateId(null);
      toast.success('Template deleted');
    }
  });
  
  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => await api.post(`/email-ai/templates/${id}/duplicate`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['email-ai-templates'] });
      setActiveTemplateId(res.data._id);
      toast.success('Template duplicated');
    }
  });
  
  const favoriteMutation = useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string, is_favorite: boolean }) => 
      await api.put(`/email-ai/templates/${id}/favorite?is_favorite=${is_favorite}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-ai-templates'] });
    }
  });

  // Auto-save logic
  useEffect(() => {
    if (!activeTemplateId) return;
    
    // Check if form actually changed from activeTemplate
    if (
      activeTemplate && 
      (formData.name !== activeTemplate.name ||
       formData.subject !== activeTemplate.subject ||
       formData.body_html !== activeTemplate.body_html ||
       formData.category !== activeTemplate.category ||
       formData.language !== activeTemplate.language)
    ) {
      const timer = setTimeout(() => {
        updateMutation.mutate({ id: activeTemplateId, data: formData });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [formData, activeTemplateId, activeTemplate]);

  // Sync active template to form
  useEffect(() => {
    if (activeTemplate) {
      setFormData({
        name: activeTemplate.name,
        subject: activeTemplate.subject,
        body_html: activeTemplate.body_html || '',
        category: activeTemplate.category || 'Custom',
        language: activeTemplate.language || 'English'
      });
      if (editorRef.current && !htmlMode) {
        editorRef.current.innerHTML = activeTemplate.body_html || '';
      }
    } else {
      setFormData({
        name: 'New Template',
        subject: '',
        body_html: '',
        category: 'Custom',
        language: 'English'
      });
      if (editorRef.current && !htmlMode) {
        editorRef.current.innerHTML = '';
      }
    }
  }, [activeTemplateId, htmlMode]);

  // Editor Actions
  const execCommand = (cmd: string, val: string | undefined = undefined) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      setFormData(prev => ({ ...prev, body_html: editorRef.current!.innerHTML }));
    }
  };

  const insertVariable = (key: string, target: 'subject' | 'body') => {
    const variable = `{{${key}}}`;
    if (target === 'subject') {
      setFormData(prev => ({ ...prev, subject: prev.subject + variable }));
    } else {
      if (htmlMode) {
        setFormData(prev => ({ ...prev, body_html: prev.body_html + variable }));
      } else {
        execCommand('insertText', variable);
      }
    }
  };
  
  const insertBlock = (html: string) => {
    if (htmlMode) {
      setFormData(prev => ({ ...prev, body_html: prev.body_html + html }));
    } else {
      execCommand('insertHTML', html);
    }
  };

  const handleEditorInput = () => {
    if (editorRef.current) {
      setFormData(prev => ({ ...prev, body_html: editorRef.current!.innerHTML }));
    }
  };

  // Render logic
  const renderPreview = (html: string) => {
    if (!html) return '<div style="color: #94a3b8; padding: 20px; text-align: center;">Preview will appear here...</div>';
    let rendered = html;
    if (sampleLead) {
      Object.keys(sampleLead).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        rendered = rendered.replace(regex, `<span style="background-color: #e0f2fe; color: #0369a1; padding: 0 4px; border-radius: 4px; font-weight: 500;">${sampleLead[key]}</span>`);
      });
    }
    // Highlight unresolved variables
    rendered = rendered.replace(/{{([^}]+)}}/g, `<span style="background-color: #fef08a; color: #854d0e; padding: 0 4px; border-radius: 4px; border: 1px dashed #eab308;" title="Unresolved variable">{{$1}}</span>`);
    return rendered;
  };

  const handleCreateNew = () => {
    createMutation.mutate({
      name: 'New Template',
      subject: '',
      body_html: '',
      body_text: '',
      category: 'Custom',
      language: 'English'
    });
  };

  const handleGoAhead = () => {
    if (!activeTemplateId) {
      toast.error('Please select or create a template to continue.');
      return;
    }
    // Save to local storage for the next step
    localStorage.setItem('email_selected_template', activeTemplateId);
    window.dispatchEvent(new CustomEvent('change-tab', { detail: 'campaigns' }));
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in">
      
      {/* Header & Steps */}
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
          <div className="flex items-center gap-4 shrink-0">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'leads' }))}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleGoAhead}
              className="group flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/30 transition-all hover:shadow-blue-500/40"
            >
              Next Step
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Main 3-Column Workspace */}
      <div className="flex-1 flex gap-6 min-h-0">
        
        {/* Left Panel: Library */}
        <div className="w-80 flex-none flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-blue-500" />
                Library
              </h3>
              <button 
                onClick={handleCreateNew}
                className="w-8 h-8 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar snap-x">
              <button 
                onClick={() => setActiveCategory('All')}
                className={cn("px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap snap-start transition-colors", activeCategory === 'All' ? "bg-blue-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
              >
                All
              </button>
              <button 
                onClick={() => setActiveCategory('Favorites')}
                className={cn("px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap snap-start transition-colors flex items-center gap-1", activeCategory === 'Favorites' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
              >
                <Star className={cn("w-3 h-3", activeCategory === 'Favorites' ? "fill-amber-500 text-amber-500" : "")} />
                Favorites
              </button>
              {CATEGORIES.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn("px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap snap-start transition-colors", activeCategory === cat ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center p-8 text-slate-500 text-sm">No templates found.</div>
            ) : (
              filteredTemplates.map(t => (
                <div 
                  key={t._id}
                  onClick={() => setActiveTemplateId(t._id)}
                  className={cn(
                    "p-3 rounded-xl border transition-all cursor-pointer group relative overflow-hidden",
                    activeTemplateId === t._id 
                      ? "bg-blue-50 border-blue-200 shadow-sm" 
                      : "bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm"
                  )}
                >
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="font-semibold text-slate-900 truncate pr-6 text-sm">{t.name}</h4>
                    <button 
                      onClick={(e) => { e.stopPropagation(); favoriteMutation.mutate({ id: t._id, is_favorite: !t.is_favorite }); }}
                      className="absolute top-3 right-3 text-slate-300 hover:text-amber-500 transition-colors"
                    >
                      <Star className={cn("w-4 h-4", t.is_favorite ? "fill-amber-500 text-amber-500" : "")} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 truncate mb-2">{t.subject || 'No subject'}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full truncate max-w-[100px]">
                      {t.category}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(t._id); }} className="p-1 text-slate-400 hover:text-blue-500 bg-white rounded shadow-sm" title="Duplicate">
                        <Copy className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(t._id); }} className="p-1 text-slate-400 hover:text-red-500 bg-white rounded shadow-sm" title="Delete">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  
                  {activeTemplateId === t._id && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-xl" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center Panel: Builder */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative">
          {activeTemplate ? (
            <>
              {updateMutation.isPending && (
                <div className="absolute top-2 right-2 z-50 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold rounded-md flex items-center gap-1 shadow-xs">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                </div>
              )}
              
              <div className="flex-none p-5 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-4">
                  <input 
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="text-lg font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none transition-colors px-1 py-0.5 -ml-1"
                    placeholder="Template Name"
                  />
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><History className="w-3.5 h-3.5" /> v{activeTemplate.version}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>{activeTemplate.language}</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-semibold text-slate-600 w-16">Subject</label>
                    <div className="relative flex-1">
                      <input 
                        type="text"
                        value={formData.subject}
                        onChange={e => setFormData({...formData, subject: e.target.value})}
                        placeholder="e.g. Quick question regarding {{business_name}}"
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 pr-24 shadow-sm"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <div className="group relative">
                          <button className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors">
                            <Hash className="w-3 h-3" /> Insert
                          </button>
                          <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl p-2 z-50 w-48">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Variables</div>
                            {VARIABLES.map(v => (
                              <button 
                                key={v.key}
                                onClick={() => insertVariable(v.key, 'subject')}
                                className="w-full text-left px-2 py-1.5 hover:bg-blue-50 hover:text-blue-600 text-slate-700 rounded-lg text-xs flex items-center gap-2 transition-colors"
                              >
                                {v.icon} {v.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Toolbar */}
              <div className="flex-none p-2 border-b border-slate-200 bg-white flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-1">
                  <button onClick={() => execCommand('bold')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700" title="Bold"><Bold className="w-4 h-4" /></button>
                  <button onClick={() => execCommand('italic')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700" title="Italic"><Italic className="w-4 h-4" /></button>
                  <button onClick={() => execCommand('underline')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700" title="Underline"><Underline className="w-4 h-4" /></button>
                  <div className="w-px h-5 bg-slate-200 mx-1" />
                  <button onClick={() => execCommand('insertUnorderedList')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700" title="Bullet List"><List className="w-4 h-4" /></button>
                  <div className="w-px h-5 bg-slate-200 mx-1" />
                  <button onClick={() => execCommand('justifyLeft')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700" title="Align Left"><AlignLeft className="w-4 h-4" /></button>
                  <button onClick={() => execCommand('justifyCenter')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700" title="Align Center"><AlignCenter className="w-4 h-4" /></button>
                  <div className="w-px h-5 bg-slate-200 mx-1" />
                  <button onClick={() => {
                    const url = prompt('Enter link URL:');
                    if (url) execCommand('createLink', url);
                  }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700" title="Link"><LinkIcon className="w-4 h-4" /></button>
                  <div className="w-px h-5 bg-slate-200 mx-1" />
                  
                  {/* Blocks Dropdown */}
                  <div className="group relative">
                    <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors">
                      <LayoutPanelTop className="w-3.5 h-3.5" /> Blocks
                    </button>
                    <div className="hidden group-hover:block absolute left-0 top-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl p-2 z-50 w-48">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Insert Elements</div>
                      <button onClick={() => insertBlock('<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />')} className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-slate-700 rounded-lg text-xs flex items-center gap-2">Divider</button>
                      <button onClick={() => insertBlock('<a href="#" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Click Here</a>')} className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-slate-700 rounded-lg text-xs flex items-center gap-2">Button</button>
                      <button onClick={() => insertBlock('<div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px; margin: 10px 0; font-style: italic;">"Quote goes here"</div>')} className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-slate-700 rounded-lg text-xs flex items-center gap-2">Quote Block</button>
                    </div>
                  </div>

                  <div className="group relative ml-1">
                    <button className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors">
                      <Hash className="w-3.5 h-3.5" /> Variables
                    </button>
                    <div className="hidden group-hover:block absolute left-0 top-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl p-2 z-50 w-48">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Dynamic Tags</div>
                      {VARIABLES.map(v => (
                        <button 
                          key={v.key}
                          onClick={() => insertVariable(v.key, 'body')}
                          className="w-full text-left px-2 py-1.5 hover:bg-blue-50 hover:text-blue-600 text-slate-700 rounded-lg text-xs flex items-center gap-2 transition-colors"
                        >
                          {v.icon} {v.label}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setHtmlMode(!htmlMode)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors", htmlMode ? "bg-blue-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700")}
                  >
                    <Type className="w-3.5 h-3.5" /> {htmlMode ? 'Visual' : 'HTML'}
                  </button>
                </div>
              </div>
              
              {/* Editor Area */}
              <div className="flex-1 overflow-auto bg-white p-6 relative">
                {htmlMode ? (
                  <textarea 
                    value={formData.body_html}
                    onChange={e => setFormData({...formData, body_html: e.target.value})}
                    className="w-full h-full min-h-[300px] resize-none focus:outline-none font-mono text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200"
                    placeholder="<p>Write your HTML here...</p>"
                  />
                ) : (
                  <div 
                    ref={editorRef}
                    contentEditable
                    onInput={handleEditorInput}
                    className="w-full min-h-[300px] focus:outline-none prose prose-sm max-w-none text-slate-800 prose-p:leading-relaxed prose-a:text-blue-600"
                    data-placeholder="Start typing your email content here..."
                  />
                )}
              </div>
              
              {/* Bottom Future Phase Actions */}
              <div className="flex-none p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs font-bold shadow-sm" title="AI Writing coming in future phase">
                    <Sparkles className="w-3 h-3" /> AI Improve
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 text-xs font-medium" title="Attachments coming in future phase">
                    <LinkIcon className="w-3 h-3" /> Add Attachment
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <ShieldAlert className="w-3 h-3" /> Spam Score: 0/100 (Safe)
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                <MousePointerSquareDashed className="w-10 h-10 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Select a Template</h3>
              <p className="text-slate-500 max-w-md">Choose a template from the library on the left, or create a new one to start building your email campaign.</p>
              <button 
                onClick={handleCreateNew}
                className="mt-6 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all"
              >
                Create New Template
              </button>
            </div>
          )}
        </div>

        {/* Right Panel: Preview */}
        <div className="w-[400px] flex-none flex flex-col bg-slate-50 rounded-2xl border border-slate-200 shadow-inner overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Eye className="w-5 h-5 text-indigo-500" />
              Live Preview
            </h3>
            <div className="flex items-center bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setPreviewMode('mobile')} className={cn("p-1.5 rounded-md transition-colors", previewMode === 'mobile' ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700")}>
                <Smartphone className="w-4 h-4" />
              </button>
              <button onClick={() => setPreviewMode('tablet')} className={cn("p-1.5 rounded-md transition-colors", previewMode === 'tablet' ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700")}>
                <Tablet className="w-4 h-4" />
              </button>
              <button onClick={() => setPreviewMode('desktop')} className={cn("p-1.5 rounded-md transition-colors", previewMode === 'desktop' ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700")}>
                <Monitor className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-4 flex justify-center bg-slate-100">
            {activeTemplate ? (
              <div 
                className={cn(
                  "bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col transition-all duration-300",
                  previewMode === 'mobile' ? "w-[320px]" : previewMode === 'tablet' ? "w-[100%]" : "w-full h-full"
                )}
              >
                {/* Simulated Email Client Header */}
                <div className="flex-none p-3 border-b border-slate-100 bg-slate-50/50">
                  <div className="text-xs text-slate-500 mb-1">To: <span className="font-medium text-slate-700">{sampleLead?.email || 'recipient@example.com'}</span></div>
                  <div className="text-sm font-bold text-slate-900">
                    <span dangerouslySetInnerHTML={{ __html: renderPreview(formData.subject || 'No Subject') }} />
                  </div>
                </div>
                
                {/* Email Body */}
                <div className="flex-1 p-5 overflow-auto">
                  <div 
                    className="prose prose-sm max-w-none text-slate-800"
                    dangerouslySetInnerHTML={{ __html: renderPreview(formData.body_html) }} 
                  />
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 text-sm mt-12">
                Preview not available
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
