'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { FileText, Download, RefreshCw, Trash2, CheckCircle2, Clock, XCircle, FileImage, Layout, Smartphone, Search, FileCode2, Shield, Share2, Briefcase, Presentation, Brain } from 'lucide-react';

interface Report {
  _id: string;
  report_type: string;
  report_format: string;
  status: string;
  generation_started_at: string | null;
  generation_completed_at: string | null;
  file_path: string | null;
  error_message: string | null;
}

export default function ReportsTab({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [selectedFormat, setSelectedFormat] = useState('PDF');
  const [selectedType, setSelectedType] = useState('Executive Summary');

  const { data, isLoading } = useQuery({
    queryKey: ['leadReports', leadId],
    queryFn: async () => {
      const res = await api.get(`/reports/lead/${leadId}`);
      return res.data;
    },
    refetchInterval: (data: any) => {
      // Auto refetch if any reports are generating
      const hasGenerating = data?.data?.some((r: Report) => r.status === 'Generating' || r.status === 'Pending');
      return hasGenerating ? 3000 : false;
    }
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      await api.post('/reports/generate', {
        lead_id: leadId,
        report_types: [selectedType],
        report_format: selectedFormat
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadReports', leadId] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId: string) => {
      await api.delete(`/reports/${reportId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadReports', leadId] });
    }
  });

  const regenerateMutation = useMutation({
    mutationFn: async (reportId: string) => {
      await api.post(`/reports/${reportId}/regenerate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadReports', leadId] });
    }
  });

  const handleDownload = async (report: Report) => {
    try {
      const res = await api.get(`/reports/${report._id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      
      let extension = 'pdf';
      if (report.report_format === 'HTML') extension = 'html';
      if (report.report_format === 'Excel') extension = 'xlsx';
      if (report.report_format === 'CSV') extension = 'csv';
      if (report.report_format === 'JSON') extension = 'json';
      
      link.setAttribute('download', `${report.report_type.replace(/ /g, '_')}_${leadId}.${extension}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (e) {
      alert("Failed to download report.");
    }
  };

  const reportTypes = [
    { id: 'Executive Summary', icon: FileText },
    { id: 'Complete Website Audit', icon: Layout },
    { id: 'SEO Report', icon: Search },
    { id: 'Technical SEO Report', icon: FileCode2 },
    { id: 'Performance Report', icon: RefreshCw },
    { id: 'UI Analysis Report', icon: Layout },
    { id: 'UX Analysis Report', icon: Smartphone },
    { id: 'Accessibility Report', icon: CheckCircle2 },
    { id: 'Security Report', icon: Shield },
    { id: 'Technology Stack Report', icon: FileCode2 },
    { id: 'Contact Discovery Report', icon: Share2 },
    { id: 'Business Opportunity Report', icon: Briefcase },
    { id: 'AI Recommendations Report', icon: Brain },
    { id: 'Proposal Report', icon: FileText },
    { id: 'Client Presentation Report', icon: Presentation }
  ];

  const formats = ['PDF', 'HTML', 'Excel', 'JSON', 'CSV'];

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 mt-6 w-full max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-500" /> Professional Reports
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Generator Controls */}
        <div className="col-span-1 bg-slate-50 p-5 rounded-xl border border-slate-100 h-fit">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Generate New Report</h4>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Report Type</label>
              <select 
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {reportTypes.map(t => <option key={t.id} value={t.id}>{t.id}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Format</label>
              <select 
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {formats.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <button 
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-all shadow-sm disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {generateMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Generate Report
            </button>
          </div>
        </div>

        {/* Reports List */}
        <div className="col-span-1 md:col-span-2">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Generated Reports</h4>
          
          {isLoading ? (
            <div className="flex justify-center p-8">
              <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : data?.data?.length === 0 ? (
            <div className="text-center p-10 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
              <FileImage className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No reports generated yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.data?.map((report: Report) => (
                <div key={report._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 transition-colors gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${report.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : report.status === 'Failed' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                      {report.status === 'Completed' ? <CheckCircle2 className="w-5 h-5" /> : 
                       report.status === 'Failed' ? <XCircle className="w-5 h-5" /> : 
                       <RefreshCw className="w-5 h-5 animate-spin" />}
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-slate-800">{report.report_type}</h5>
                      <div className="flex items-center gap-2 mt-1 text-xs font-medium text-slate-500">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600">{report.report_format}</span>
                        <span>•</span>
                        <span>{report.generation_completed_at ? new Date(report.generation_completed_at).toLocaleString() : 'Processing...'}</span>
                      </div>
                      {report.error_message && (
                        <p className="text-xs text-red-500 mt-1">{report.error_message}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {report.status === 'Completed' && (
                      <button 
                        onClick={() => handleDownload(report)}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-colors flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </button>
                    )}
                    <button 
                      onClick={() => regenerateMutation.mutate(report._id)}
                      disabled={regenerateMutation.isPending || report.status === 'Generating'}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Regenerate"
                    >
                      <RefreshCw className={`w-4 h-4 ${regenerateMutation.isPending && regenerateMutation.variables === report._id ? 'animate-spin' : ''}`} />
                    </button>
                    <button 
                      onClick={() => {
                        if(confirm('Delete this report?')) deleteMutation.mutate(report._id);
                      }}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
