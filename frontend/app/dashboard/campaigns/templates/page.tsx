'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Loader2, Plus, Trash2, Mail } from 'lucide-react';

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('');

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await api.get('/templates');
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => await api.post('/templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowModal(false);
      setName(''); setSubject(''); setHtmlContent('');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => await api.delete(`/templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] })
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Email Templates</h1>
          <p className="text-[#6B7280] mt-1 text-sm">Create templates to use in your campaigns. Use {'{{name}}'} to insert the lead's name.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-[#111827] rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates?.map((t: any) => (
            <div key={t._id} className="bg-[#FAFAF8]/50 backdrop-blur-sm border border-[#E7E5E4] rounded-2xl p-5 hover:border-[#E7E5E4] transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2 text-[#111827] font-medium">
                  <Mail className="w-4 h-4 text-[#6B7280]" />
                  {t.name}
                </div>
                <button onClick={() => { if(window.confirm('Delete?')) deleteMutation.mutate(t._id); }} className="text-[#6B7280] hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs font-semibold text-[#6B7280] uppercase">Subject</p>
              <p className="text-sm text-[#111827] mt-1 truncate">{t.subject}</p>
            </div>
          ))}
          {templates?.length === 0 && (
            <div className="col-span-full py-12 text-center text-[#6B7280]">No templates found.</div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E7E5E4] rounded-2xl p-6 w-full max-w-2xl">
            <h2 className="text-xl font-bold text-[#111827] mb-4">Create Template</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#6B7280] mb-1">Name</label>
                <input type="text" value={name} onChange={e=>setName(e.target.value)} className="w-full px-4 py-2 bg-[#FAFAF8] border border-[#E7E5E4] rounded-xl text-[#111827] outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6B7280] mb-1">Subject</label>
                <input type="text" value={subject} onChange={e=>setSubject(e.target.value)} className="w-full px-4 py-2 bg-[#FAFAF8] border border-[#E7E5E4] rounded-xl text-[#111827] outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6B7280] mb-1">HTML Content</label>
                <textarea rows={6} value={htmlContent} onChange={e=>setHtmlContent(e.target.value)} className="w-full px-4 py-2 bg-[#FAFAF8] border border-[#E7E5E4] rounded-xl text-[#111827] outline-none focus:border-blue-500 font-mono text-sm" placeholder="<p>Hi {{name}},</p>" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-[#6B7280] hover:text-[#111827] transition-colors">Cancel</button>
              <button onClick={() => createMutation.mutate({ name, subject, html_content: htmlContent })} disabled={createMutation.isPending || !name || !subject || !htmlContent} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-[#111827] rounded-xl text-sm font-medium disabled:opacity-50 transition-colors">
                {createMutation.isPending ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
