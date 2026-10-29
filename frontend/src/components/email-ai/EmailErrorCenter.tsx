import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { ShieldCheck, AlertTriangle, XCircle, FileWarning } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function EmailErrorCenter() {
  const { data: errors = [], isLoading } = useQuery({
    queryKey: ['email-ai-errors'],
    queryFn: async () => {
      const res = await api.get('/email-ai/analytics/errors');
      return res.data;
    },
    refetchInterval: 30000
  });

  const COLORS = ['#ef4444', '#f59e0b', '#6366f1', '#8b5cf6'];
  const totalErrors = errors.reduce((acc: number, curr: any) => acc + curr.count, 0);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-3xl p-8 text-white flex items-center justify-between shadow-lg">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <ShieldCheck className="w-8 h-8" /> Error Center
          </h2>
          <p className="mt-2 text-red-100 font-medium">Centralized dashboard for tracking SMTP and validation failures.</p>
        </div>
        <div className="text-right">
          <div className="text-5xl font-black">{totalErrors}</div>
          <div className="text-red-100 font-semibold uppercase text-sm tracking-wider mt-1">Total Failures Logged</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" /> Error Distribution
          </h3>
          <div className="h-64">
            {errors.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={errors}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="category"
                  >
                    {errors.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 font-medium flex-col gap-2">
                <ShieldCheck className="w-8 h-8 text-green-400" /> No errors logged yet!
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
            <FileWarning className="w-5 h-5 text-red-500" /> Top Error Categories
          </h3>
          <div className="flex-1 overflow-auto pr-2 space-y-3">
            {errors.length > 0 ? errors.sort((a:any, b:any) => b.count - a.count).map((err: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    err.category.includes('Auth') ? 'bg-amber-100 text-amber-600' :
                    err.category.includes('Timeout') ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                  )}>
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div className="font-bold text-slate-700">{err.category}</div>
                </div>
                <div className="font-black text-xl text-slate-900">{err.count}</div>
              </div>
            )) : (
              <div className="text-center text-slate-400 mt-10">Everything is running perfectly smooth.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
