'use client';

import { Database, Download, Upload, AlertCircle } from 'lucide-react';

export default function DataPage() {
  return (
    <div className="w-full space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shadow-sm">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Data Management</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Import, export, and manage your datasets
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
          <Database className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Data Management Module</h2>
        <p className="text-slate-500 max-w-md mx-auto mb-6">
          This feature is currently under development. Soon, you will be able to bulk import CSV files, configure advanced data export rules, and manage all your datasets in one place.
        </p>
        <div className="flex gap-4">
          <button className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-not-allowed opacity-60">
            <Upload className="w-4 h-4" /> Import Data
          </button>
          <button className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-not-allowed opacity-60">
            <Download className="w-4 h-4" /> Export All Data
          </button>
        </div>
      </div>
    </div>
  );
}
