'use client';

import { MessageSquare } from 'lucide-react';

interface TemplatePreviewProps {
  content: string;
  leadData?: {
    name?: string;
    city?: string;
    website?: string;
    phone?: string;
    category?: string;
  };
}

const VARIABLE_MAP: Record<string, string> = {
  business_name: 'name',
  owner: 'name',
  city: 'city',
  website: 'website',
  phone: 'phone',
  category: 'category',
};

function renderTemplate(content: string, lead?: TemplatePreviewProps['leadData']): string {
  if (!lead) {
    // Show sample data if no lead
    const sample: Record<string, string> = {
      business_name: 'Acme Solutions',
      owner: 'Acme Solutions',
      city: 'Mumbai',
      website: 'www.acme.com',
      phone: '+91 98765 43210',
      category: 'IT Services',
    };
    return content.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
      return sample[varName] || `{{${varName}}}`;
    });
  }
  return content.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    const field = VARIABLE_MAP[varName] || varName;
    const value = (lead as any)[field];
    return value || '';
  });
}

export default function TemplatePreview({ content, leadData }: TemplatePreviewProps) {
  const rendered = renderTemplate(content, leadData);

  return (
    <div className="relative">
      {/* WhatsApp-style chat bubble */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-1">
          <MessageSquare className="w-4 h-4 text-slate-500" />
        </div>
        <div className="flex-1">
          <div
            className="relative bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-md p-4 max-w-md"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            {/* Tail */}
            <div
              className="absolute -left-2 top-3 w-0 h-0"
              style={{
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderRight: '8px solid rgb(248 250 252)',
              }}
            />
            {content ? (
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {rendered}
              </p>
            ) : (
              <p className="text-sm text-slate-400 italic">
                Start typing a template to see the preview…
              </p>
            )}
            <div className="flex items-center justify-end gap-1 mt-2">
              <span className="text-[10px] text-slate-400">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <svg className="w-4 h-4 text-slate-400" viewBox="0 0 16 16" fill="none">
                <path d="M1.5 8.5L5.5 12.5L14.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4.5 8.5L8.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          {leadData?.name && (
            <p className="text-xs text-slate-400 mt-1.5 ml-1">
              Preview for: <span className="font-medium text-slate-500">{leadData.name}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export { renderTemplate };
