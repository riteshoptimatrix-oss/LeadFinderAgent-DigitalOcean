'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { PageHeader } from '@/src/components/common/PageHeader';
import { Server, Database, Activity, RefreshCw, Cpu, MemoryStick, ListTree, HardDrive } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function AdminDashboardPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: systemHealth, refetch: refetchSystem, isLoading: loadingSystem } = useQuery({
    queryKey: ['health_system'],
    queryFn: async () => {
      const res = await api.get('/health/system');
      return res.data;
    },
    refetchInterval: 5000,
  });

  const { data: dbHealth, refetch: refetchDb, isLoading: loadingDb } = useQuery({
    queryKey: ['health_db'],
    queryFn: async () => {
      const res = await api.get('/health/database');
      return res.data;
    },
    refetchInterval: 10000,
  });

  const { data: queueHealth, refetch: refetchQueues, isLoading: loadingQueues } = useQuery({
    queryKey: ['health_queues'],
    queryFn: async () => {
      const res = await api.get('/health/queues');
      return res.data;
    },
    refetchInterval: 5000,
  });

  const handleRefresh = () => {
    refetchSystem();
    refetchDb();
    refetchQueues();
  };

  if (!mounted) return null;

  return (
    <div className="w-full space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <PageHeader title="System Monitoring" description="Real-time infrastructure health and queue status." />
        <button 
          onClick={handleRefresh}
          className="px-4 py-2 bg-white border border-[#E7E5E4] hover:bg-[#FCFCFA] text-[#111827] rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${(loadingSystem || loadingDb || loadingQueues) ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* System Health */}
        <div className="bg-[#FAFAF8] border border-[#E7E5E4] rounded-xl p-6">
          <h2 className="text-sm font-bold text-[#6B7280] uppercase tracking-wider mb-6 flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-500" /> Server Resources
          </h2>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#6B7280] flex items-center gap-2"><Cpu className="w-4 h-4"/> CPU Usage</span>
                <span className="text-[#111827] font-medium">{systemHealth?.cpu_percent || 0}%</span>
              </div>
              <div className="h-2 w-full bg-white rounded-full overflow-hidden">
                <div className={`h-full ${systemHealth?.cpu_percent > 80 ? 'bg-red-500' : 'bg-blue-500'} transition-all duration-500`} style={{ width: `${systemHealth?.cpu_percent || 0}%` }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#6B7280] flex items-center gap-2"><MemoryStick className="w-4 h-4"/> Memory Usage</span>
                <span className="text-[#111827] font-medium">{systemHealth?.memory_percent || 0}%</span>
              </div>
              <div className="h-2 w-full bg-white rounded-full overflow-hidden mb-1">
                <div className={`h-full ${systemHealth?.memory_percent > 80 ? 'bg-red-500' : 'bg-blue-500'} transition-all duration-500`} style={{ width: `${systemHealth?.memory_percent || 0}%` }}></div>
              </div>
              <div className="text-xs text-[#6B7280] text-right">{systemHealth?.memory_used_gb || 0} GB / {systemHealth?.memory_total_gb || 0} GB</div>
            </div>
            
            <div className="pt-4 border-t border-[#E7E5E4] flex justify-between items-center text-sm">
              <span className="text-[#6B7280]">Uptime</span>
              <span className="text-[#111827] font-mono">{systemHealth?.uptime_seconds ? Math.floor(systemHealth.uptime_seconds / 3600) + 'h ' + Math.floor((systemHealth.uptime_seconds % 3600)/60) + 'm' : '0m'}</span>
            </div>
          </div>
        </div>

        {/* Database Health */}
        <div className="bg-[#FAFAF8] border border-[#E7E5E4] rounded-xl p-6">
          <h2 className="text-sm font-bold text-[#6B7280] uppercase tracking-wider mb-6 flex items-center gap-2">
            <Database className="w-4 h-4 text-green-500" /> Database Status
          </h2>
          
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-[#E7E5E4]">
              <span className="text-[#6B7280]">Connection</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${dbHealth?.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {dbHealth?.status || 'Offline'}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-[#6B7280] uppercase tracking-wider mb-1">Collections</div>
                <div className="text-xl font-bold text-[#111827]">{dbHealth?.collections || 0}</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-xs text-[#6B7280] uppercase tracking-wider mb-1 flex items-center gap-1"><HardDrive className="w-3 h-3"/> Size</div>
                <div className="text-xl font-bold text-[#111827]">{dbHealth?.data_size_mb || 0} <span className="text-sm font-normal text-[#6B7280]">MB</span></div>
              </div>
            </div>
            
            <div className="pt-2 flex justify-between items-center text-sm">
              <span className="text-[#6B7280]">Active Indexes</span>
              <span className="text-[#111827]">{dbHealth?.indexes || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Queue Health */}
      <h2 className="text-lg font-bold text-[#111827] pt-4 flex items-center gap-2">
        <ListTree className="w-5 h-5 text-purple-500" /> Background Queues
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {queueHealth && Object.keys(queueHealth).map((qName) => (
          <div key={qName} className="bg-[#FAFAF8] border border-[#E7E5E4] rounded-xl p-5">
            <h3 className="font-bold text-[#111827] capitalize mb-4">{qName.replace('_', ' ')}</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-[#6B7280]">Total</span>
                <span className="font-mono text-[#111827]">{queueHealth[qName].total}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-blue-400">Pending</span>
                <span className="font-mono text-blue-400">{queueHealth[qName].pending}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-yellow-500">Processing</span>
                <span className="font-mono text-yellow-500">{queueHealth[qName].processing}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-red-500">Failed</span>
                <span className="font-mono text-red-500">{queueHealth[qName].failed}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
    </div>
  );
}
