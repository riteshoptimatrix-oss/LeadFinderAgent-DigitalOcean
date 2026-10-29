'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Download, FileText, RefreshCw, Trash2, Eye, Clock, CheckCircle, XCircle, Loader } from 'lucide-react';

interface Report {
  _id: string;
  report_type: string;
  report_format: string;
  status: string;
  file_size_bytes: number;
  download_count: number;
  created_at: string;
  generation_time_seconds: number;
  error_message?: string;
}

interface ReportsTabProps {
  leadId: string;
}

export default function ReportsTab({ leadId }: ReportsTabProps) {
  const queryClient = useQueryClient();
  const [selectedReportTypes, setSelectedReportTypes] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('PDF');

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ['reports', leadId],
    queryFn: async () => {
      const res = await api.get(`/reports/lead/${leadId}`);
      return res.data;
    },
    refetchInterval: 5000 // Refresh every 5 seconds to show generation progress
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { report_types: string[]; report_format: string }) => {
      await api.post('/reports/generate', {
        lead_id: leadId,
        report_types: data.report_types,
        report_format: data.report_format
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', leadId] });
      setSelectedReportTypes([]);
      alert('Report generation started! It will appear here when ready.');
    },
    onError: (error: any) => {
      alert(`Error: ${error.response?.data?.detail || 'Failed to generate report'}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId: string) => {
      if (confirm('Are you sure you want to delete this report?')) {
        await api.delete(`/reports/${reportId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', leadId] });
    }
  });

  const regenerateMutation = useMutation({
    mutationFn: async (reportId: string) => {
      await api.post(`/reports/${reportId}/regenerate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', leadId] });
    }
  });

  const handleDownload = async (reportId: string) => {
    try {
      const res = await api.get(`/reports/${reportId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition = res.headers['content-disposition'];
      const filename = contentDisposition ? contentDisposition.split('filename=')[1].replace(/"/g, '') : `report_${reportId}.pdf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (error) {
      alert('Failed to download report');
    }
  };

  const reportTypes = [
    'Executive Summary',
    'Complete Website Audit',
    'SEO Report',
    'Technical SEO Report',
    'Performance Report',
    'UI Analysis Report',
    'UX Analysis Report',
    'Accessibility Report',
    'Security Report',
    'Technology Stack Report',
    'Contact Discovery Report',
    'Business Opportunity Report',
    'AI Recommendations Report',
    'Proposal Report',
    'Client Presentation Report'
  ];

  const formats = ['PDF', 'HTML', 'Excel', 'JSON', 'CSV'];

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'Generating':
      case 'Pending':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'Failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const reports: Report[] = reportsData?.data || [];

  return (
    <div className="space-y-6">
      {/* Generation Card */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-500" />
          Generate New Reports
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Select Report Types
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {reportTypes.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-2 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg cursor-pointer border border-slate-200 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedReportTypes.includes(type)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedReportTypes([...selectedReportTypes, type]);
                      } else {
                        setSelectedReportTypes(selectedReportTypes.filter(t => t !== type));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-slate-700">{type}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Output Format
            </label>
            <div className="flex gap-2">
              {formats.map((format) => (
                <button
                  key={format}
                  onClick={() => setSelectedFormat(format)}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    selectedFormat === format
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => generateMutation.mutate({
              report_types: selectedReportTypes,
              report_format: selectedFormat
            })}
            disabled={selectedReportTypes.length === 0 || generateMutation.isPending}
            className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {generateMutation.isPending ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" />
                Generate Reports
              </>
            )}
          </button>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-500" />
          Generated Reports ({reports.length})
        </h3>

        {isLoading ? (
          <div className="text-center py-12">
            <Loader className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-slate-500">Loading reports...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 mb-2">No reports generated yet</p>
            <p className="text-slate-400 text-sm">
              Generate your first report using the form above
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report._id}
                className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  {getStatusIcon(report.status)}
                  
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-800">
                      {report.report_type}
                    </h4>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                      <span className="font-medium">{report.report_format}</span>
                      {report.file_size_bytes > 0 && (
                        <span>{formatFileSize(report.file_size_bytes)}</span>
                      )}
                      {report.download_count > 0 && (
                        <span>{report.download_count} downloads</span>
                      )}
                      {report.generation_time_seconds > 0 && (
                        <span>Generated in {report.generation_time_seconds.toFixed(1)}s</span>
                      )}
                    </div>
                    {report.error_message && (
                      <p className="text-xs text-red-600 mt-1">{report.error_message}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {report.status === 'Completed' && (
                    <>
                      <button
                        onClick={() => handleDownload(report._id)}
                        className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => regenerateMutation.mutate(report._id)}
                        className="p-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
                        title="Regenerate"
                        disabled={regenerateMutation.isPending}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(report._id)}
                    className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                    title="Delete"
                    disabled={deleteMutation.isPending}
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
  );
}
