'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import TemplatePreview from '@/src/components/whatsapp/TemplatePreview';
import {
  Plus, FileText, Trash2, Pencil, Check, X, Info, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface TemplateManagerProps {
  templates: any[];
  setTemplates: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function TemplateManager({ templates, setTemplates }: TemplateManagerProps) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', content: '' });
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [showNewForm, setShowNewForm] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/whatsapp/templates', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Template created');
      setTemplates([...templates, data]);
      setNewTemplate({ name: '', content: '' });
      setShowNewForm(false);
    },
    onError: () => toast.error('Failed to create template'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: any) => {
      const res = await api.put(`/whatsapp/templates/${id}`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Template updated');
      setTemplates(templates.map(t => t._id === data._id ? data : t));
      setEditingId(null);
    },
    onError: () => toast.error('Failed to update template'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/whatsapp/templates/${id}`);
    },
    onSuccess: (_, id) => {
      toast.success('Template deleted');
      setTemplates(templates.filter(t => t._id !== id));
    },
    onError: () => toast.error('Failed to delete template'),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-[400px]">
      {/* Template List */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Your Templates</h3>
          {!showNewForm && (
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          )}
        </div>

        {showNewForm && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
            <input
              value={newTemplate.name}
              onChange={(e) => setNewTemplate(p => ({ ...p, name: e.target.value }))}
              placeholder="Template name"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            />
            <textarea
              value={newTemplate.content}
              onChange={(e) => setNewTemplate(p => ({ ...p, content: e.target.value }))}
              placeholder="Use {{business_name}}, {{city}}, etc."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-300 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            />
            <div className="flex items-center gap-2 p-2 bg-blue-50/50 border border-blue-100 rounded-lg">
              <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="text-[11px] text-blue-600">
                {'{{business_name}}'}, {'{{city}}'}, {'{{category}}'}, {'{{owner}}'}, {'{{phone}}'}, {'{{website}}'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!newTemplate.name.trim() || !newTemplate.content.trim()) {
                    toast.error('Name and content are required');
                    return;
                  }
                  createMutation.mutate({ name: newTemplate.name.trim(), content: newTemplate.content.trim() });
                }}
                disabled={createMutation.isPending}
                className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setShowNewForm(false)}
                className="px-3 py-1.5 text-slate-500 text-xs font-medium hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {templates.length === 0 && !showNewForm ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <FileText className="w-10 h-10 text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No templates yet</p>
            <p className="text-xs text-slate-300 mt-1">Create one to use in your campaigns</p>
          </div>
        ) : (
          templates.map((tpl: any) => (
            <div
              key={tpl._id}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              {editingId === tpl._id ? (
                <div className="space-y-2.5">
                  <input
                    value={editData.name}
                    onChange={(e) => setEditData(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                  />
                  <textarea
                    value={editData.content}
                    onChange={(e) => setEditData(p => ({ ...p, content: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateMutation.mutate({ id: tpl._id, name: editData.name, content: editData.content })}
                      disabled={updateMutation.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 transition-colors"
                    >
                      <Check className="w-3 h-3" /> Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex items-center gap-1 px-2.5 py-1 text-slate-500 text-xs font-medium hover:bg-slate-100 rounded-md transition-colors"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-bold text-slate-800">{tpl.name}</h4>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => {
                          setEditingId(tpl._id);
                          setEditData({ name: tpl.name, content: tpl.content });
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this template?')) {
                            deleteMutation.mutate(tpl._id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2">{tpl.content?.substring(0, 120)}...</p>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Preview Panel */}
      <div className="lg:col-span-3">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Live Preview</h3>
        <div className="bg-slate-50/50 rounded-xl border border-slate-200 p-6">
          <TemplatePreview
            content={
              editingId
                ? editData.content
                : showNewForm
                ? newTemplate.content
                : templates[0]?.content || ''
            }
            leadData={{
              name: 'Acme Solutions',
              city: 'Mumbai',
              website: 'www.acme.com',
              phone: '+91 98765 43210',
              category: 'IT Services',
            }}
          />
        </div>
      </div>
    </div>
  );
}
