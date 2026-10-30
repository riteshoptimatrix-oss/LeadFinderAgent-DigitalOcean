'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/features/auth/store';
import { 
  Users, UserCheck, LogIn, Search, Target, Zap, Mail, MessageSquare, 
  ChevronRight, Calendar, Search as SearchIcon, Filter, Eye, Activity
} from 'lucide-react';
import UserDetailPanel from '@/components/admin/UserDetailPanel';

export default function UserActivityPage() {
  const router = useRouter();
  const authUser = useAuthStore((state) => state.user);

  const { data: userProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      try {
        const res = await api.get('/users/me');
        return res.data;
      } catch {
        return null;
      }
    },
  });

  const userRole = (userProfile?.role || authUser?.role || '')?.toLowerCase();
  const isAdmin = userRole === 'admin' || userProfile?.is_superuser === true;

  useEffect(() => {
    if (!profileLoading && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isAdmin, profileLoading, router]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Fetch Stats
  const { data: stats } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/dashboard-stats');
      return res.data;
    },
    refetchInterval: 30000,
  });

  // Fetch Users
  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users', searchTerm],
    queryFn: async () => {
      const res = await api.get('/admin/users', {
        params: { search: searchTerm, limit: 100 }
      });
      return res.data;
    },
  });

  const statsCards = [
    { label: 'Total Users', value: stats?.total_users || 0, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Active Today', value: stats?.active_users_today || 0, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Logged In', value: stats?.logged_in_users || 0, icon: LogIn, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Total Searches', value: stats?.total_searches || 0, icon: Search, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Total Leads', value: stats?.total_leads || 0, icon: Target, color: 'text-[#c1121f]', bg: 'bg-[#c1121f]/10' },
    { label: 'AI Analyses', value: stats?.total_ai_analyses || 0, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  if (profileLoading || !isAdmin) {
    return null;
  }

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Enterprise User Activity</h1>
          <p className="text-sm text-gray-500 mt-1">Monitor all registered users, their sessions, and generated leads.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statsCards.map((stat, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{stat.value.toLocaleString()}</h3>
                <p className="text-[13px] font-medium text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Users Table Section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.02)] overflow-hidden">
          {/* Table Header / Filters */}
          <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-400" />
              Registered Users
            </h2>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, or company..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#c1121f]/20 focus:border-[#c1121f] transition-all outline-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2 transition-colors">
                <Filter className="w-4 h-4" /> Filters
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="py-3.5 px-5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">User</th>
                  <th className="py-3.5 px-5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Company</th>
                  <th className="py-3.5 px-5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Registration</th>
                  <th className="py-3.5 px-5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Status</th>
                  <th className="py-3.5 px-5 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingUsers ? (
                  <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-500">Loading users...</td></tr>
                ) : usersData?.items?.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-500">No users found.</td></tr>
                ) : (
                  usersData?.items?.map((user: any) => (
                    <tr 
                      key={user._id} 
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                      onClick={() => setSelectedUserId(user._id)}
                    >
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-800 to-gray-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-[#c1121f] transition-colors">{user.full_name || 'N/A'}</p>
                            <p className="text-[13px] text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        <p className="text-sm text-gray-700 font-medium">{user.company_name || '-'}</p>
                      </td>
                      <td className="py-3 px-5">
                        <p className="text-sm text-gray-700">{new Date(user.created_at).toLocaleDateString()}</p>
                        <p className="text-[12px] text-gray-400">Last login: {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</p>
                      </td>
                      <td className="py-3 px-5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${user.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                          {user.is_active ? 'Active' : 'Blocked'}
                        </span>
                        {user.role === 'admin' && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-50 text-purple-600 border border-purple-100">
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button className="p-2 text-gray-400 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-100 rounded-lg transition-all shadow-sm">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Slide-over Panel */}
      {selectedUserId && (
        <UserDetailPanel 
          userId={selectedUserId} 
          onClose={() => setSelectedUserId(null)} 
        />
      )}
    </div>
  );
}
