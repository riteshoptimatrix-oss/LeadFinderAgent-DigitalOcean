'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/features/auth/store';
import { queryClient } from '@/src/lib/queryClient';
import { PageHeader } from '@/src/components/common/PageHeader';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import CreateUserModal from '@/src/components/admin/CreateUserModal';
import EditUserModal from '@/src/components/admin/EditUserModal';
import UserDetailsModal from '@/src/components/admin/UserDetailsModal';
import DeleteUserDialog from '@/src/components/admin/DeleteUserDialog';

import {
  Users,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  LogIn,
  Shield,
  ShieldAlert,
  Building2,
  MapPin,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  ShieldCheck,
  CheckCircle2,
  Compass
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminUsersPage() {
  const router = useRouter();
  const authUser = useAuthStore((state) => state.user);

  // Check admin privileges
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

  // Filters & Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<any | null>(null);
  const [selectedUserIdForView, setSelectedUserIdForView] = useState<string | null>(null);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<any | null>(null);
  const [isImpersonatingId, setIsImpersonatingId] = useState<string | null>(null);

  // Query users
  const {
    data: usersData,
    isLoading: loadingUsers,
    refetch: refetchUsers,
    isRefetching
  } = useQuery({
    queryKey: ['admin-users-list', searchTerm, roleFilter, statusFilter, page],
    queryFn: async () => {
      const res = await api.get('/admin/users', {
        params: {
          skip: (page - 1) * limit,
          limit,
          search: searchTerm.trim() || undefined,
          role: roleFilter !== 'ALL' ? roleFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined
        }
      });
      return res.data;
    },
    enabled: isAdmin,
  });

  // Query stats
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['admin-users-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/dashboard-stats');
      return res.data;
    },
    enabled: isAdmin,
  });

  const handleRefresh = () => {
    refetchUsers();
    refetchStats();
  };

  // Impersonate (Login as User) Handler
  const handleImpersonate = async (targetUser: any) => {
    const targetId = targetUser._id || targetUser.id;
    if (!targetId) return;

    try {
      setIsImpersonatingId(targetId);

      // 1. Backup current Admin credentials in localStorage
      const currentAccessToken = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
      const currentRefreshToken = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
      const currentAdminUser = useAuthStore.getState().user;

      if (!currentAccessToken) {
        toast.error('Unable to verify current admin session.');
        return;
      }

      localStorage.setItem('admin_backup_access_token', currentAccessToken);
      if (currentRefreshToken) {
        localStorage.setItem('admin_backup_refresh_token', currentRefreshToken);
      }
      localStorage.setItem('admin_backup_user', JSON.stringify(currentAdminUser));
      localStorage.setItem('is_impersonating', 'true');
      localStorage.setItem('impersonated_target_email', targetUser.email);

      // 2. Request impersonation tokens from backend
      const res = await api.post(`/admin/users/${targetId}/impersonate`);

      if (res.data?.success && res.data?.access_token) {
        const { access_token, refresh_token, user } = res.data;

        // 3. Update auth store and browser storage with impersonated user credentials
        useAuthStore.getState().login(
          {
            id: user.id || user._id,
            email: user.email,
            role: user.role || 'USER'
          },
          access_token,
          refresh_token,
          true
        );

        // 4. Clear cached queries so user data loads fresh
        queryClient.clear();

        toast.success(`Access granted! You are now viewing the workspace as ${targetUser.email}`);

        // 5. Navigate to Dashboard as that user
        window.location.href = '/dashboard';
      } else {
        throw new Error(res.data?.detail || 'Failed to switch to user account.');
      }
    } catch (err: unknown) {
      // Revert backup if failed
      localStorage.removeItem('is_impersonating');
      localStorage.removeItem('impersonated_target_email');
      localStorage.removeItem('admin_backup_access_token');
      localStorage.removeItem('admin_backup_refresh_token');
      localStorage.removeItem('admin_backup_user');

      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj?.response?.data?.detail || errorObj?.message || 'Failed to impersonate user.';
      toast.error(msg);
    } finally {
      setIsImpersonatingId(null);
    }
  };

  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const handleToggleAutoLeadFinder = async (targetId: string, targetUser: any) => {
    setTogglingUserId(targetId);
    try {
      const res = await api.patch(`/admin/users/${targetId}/toggle-auto-leadfinder`);
      toast.success(res.data?.message || 'Auto LeadFinder access updated!');
      refetchUsers();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update Auto LeadFinder access');
    } finally {
      setTogglingUserId(null);
    }
  };

  if (profileLoading || !isAdmin) {
    return null;
  }

  const usersList = usersData?.items || [];
  const totalUsers = usersData?.total || 0;
  const totalPages = Math.ceil(totalUsers / limit) || 1;

  const currentAdminId = authUser?.id || userProfile?.id || userProfile?._id;

  return (
    <div className="w-full space-y-6 pb-12 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="User Management"
          description="Manage all registered platform users, create new accounts, edit profiles, and access user accounts via impersonation."
        />

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={handleRefresh}
            className="p-2.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-all cursor-pointer"
            title="Refresh user list"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Total Registered</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">
              {statsData?.total_users ?? totalUsers}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Active Users</span>
            <span className="text-2xl font-bold text-emerald-600 mt-1 block">
              {statsData?.logged_in_users || totalUsers}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">Active Today</span>
            <span className="text-2xl font-bold text-blue-600 mt-1 block">
              {statsData?.active_users_today || 1}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 block">New Today</span>
            <span className="text-2xl font-bold text-purple-600 mt-1 block">
              {statsData?.today_new_users || 0}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
            <UserPlus className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, email, company..."
              className="w-full text-xs sm:text-sm pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 hidden sm:inline">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-indigo-500 transition-all font-medium text-slate-700"
            >
              <option value="ALL">All Roles</option>
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 hidden sm:inline">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-indigo-500 transition-all font-medium text-slate-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Total found badge */}
        <div className="text-xs font-semibold text-slate-500">
          Showing <span className="text-slate-900 font-bold">{usersList.length}</span> of <span className="text-slate-900 font-bold">{totalUsers}</span> users
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200/80 rounded-3xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-4 px-6">User</th>
                <th className="py-4 px-4">Role</th>
                <th className="py-4 px-4">Status</th>
                <th className="py-4 px-4">Auto LeadFinder</th>
                <th className="py-4 px-4">Company & Location</th>
                <th className="py-4 px-4">Registered</th>
                <th className="py-4 px-4">Last Login</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingUsers ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mx-auto mb-3" />
                    <span>Loading platform users...</span>
                  </td>
                </tr>
              ) : usersList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600 text-sm">No users found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchTerm || roleFilter !== 'ALL' || statusFilter !== 'ALL'
                        ? 'Try clearing search filters or search terms.'
                        : 'Click "Create User" to add the first user account.'}
                    </p>
                  </td>
                </tr>
              ) : (
                usersList.map((u: any) => {
                  const userId = u._id || u.id;
                  const isCurrentAdmin = String(userId) === String(currentAdminId);
                  const initial = (u.full_name?.[0] || u.email?.[0] || 'U').toUpperCase();
                  const roleStr = (u.role || 'USER').toUpperCase();
                  const statusStr = u.account_status || (u.is_active === false ? 'Suspended' : 'Active');

                  return (
                    <tr key={userId} className="hover:bg-slate-50/60 transition-colors">
                      {/* User (Avatar, Name, Email) */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 truncate">
                                {u.full_name || 'Unnamed User'}
                              </span>
                              {isCurrentAdmin && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-slate-500 text-[11px] block truncate">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                            roleStr === 'ADMIN'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : roleStr === 'MANAGER'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : roleStr === 'VIEWER'
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}
                        >
                          {roleStr}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <StatusBadge status={statusStr} />
                      </td>

                      {/* Auto LeadFinder Access Toggle */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleAutoLeadFinder(userId, u)}
                            disabled={togglingUserId === userId}
                            title={
                              u.auto_leadfinder_access || u.email?.toLowerCase() === 'kutchtourguide@gmail.com'
                                ? 'Click to disable Auto LeadFinder for this user'
                                : 'Click to enable Auto LeadFinder for this user'
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                              u.auto_leadfinder_access || u.email?.toLowerCase() === 'kutchtourguide@gmail.com'
                                ? 'bg-teal-600'
                                : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                u.auto_leadfinder_access || u.email?.toLowerCase() === 'kutchtourguide@gmail.com'
                                  ? 'translate-x-4'
                                  : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <div>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                u.auto_leadfinder_access || u.email?.toLowerCase() === 'kutchtourguide@gmail.com'
                                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              <Compass className="w-2.5 h-2.5" />
                              {u.auto_leadfinder_access || u.email?.toLowerCase() === 'kutchtourguide@gmail.com'
                                ? (u.email?.toLowerCase() === 'kutchtourguide@gmail.com' ? 'Travel Agency [Fixed]' : (u.auto_leadfinder_keyword || 'Active'))
                                : 'Disabled'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Company & Location */}
                      <td className="py-4 px-4">
                        <div className="text-slate-700 font-medium truncate max-w-[140px]">
                          {u.company_name || '—'}
                        </div>
                        <div className="text-slate-400 text-[11px] truncate max-w-[140px]">
                          {[u.state, u.country].filter(Boolean).join(', ') || '—'}
                        </div>
                      </td>

                      {/* Registered Date */}
                      <td className="py-4 px-4 text-slate-500 whitespace-nowrap">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>

                      {/* Last Login */}
                      <td className="py-4 px-4 text-slate-500 whitespace-nowrap">
                        {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* LOGIN AS USER (IMPERSONATE) BUTTON */}
                          {!isCurrentAdmin && (
                            <button
                              onClick={() => handleImpersonate(u)}
                              disabled={isImpersonatingId === userId || statusStr === 'Suspended'}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 font-bold text-[11px] transition-all shadow-2xs active:scale-95 disabled:opacity-40 cursor-pointer mr-1"
                              title="Access application directly from this user's perspective"
                            >
                              <LogIn className="w-3.5 h-3.5 text-amber-700" />
                              <span>Login as User</span>
                            </button>
                          )}

                          {/* View */}
                          <button
                            onClick={() => setSelectedUserIdForView(userId)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="View User Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => setSelectedUserForEdit(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Edit User"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setSelectedUserForDelete(u)}
                            disabled={isCurrentAdmin}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                            title={isCurrentAdmin ? 'Cannot delete yourself' : 'Delete User'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalUsers > limit && (
          <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateUserModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          refetchUsers();
          refetchStats();
        }}
      />

      <EditUserModal
        user={selectedUserForEdit}
        isOpen={!!selectedUserForEdit}
        onClose={() => setSelectedUserForEdit(null)}
        onSuccess={() => {
          refetchUsers();
          refetchStats();
        }}
      />

      <UserDetailsModal
        userId={selectedUserIdForView}
        isOpen={!!selectedUserIdForView}
        onClose={() => setSelectedUserIdForView(null)}
        onImpersonate={(u) => handleImpersonate(u)}
      />

      <DeleteUserDialog
        user={selectedUserForDelete}
        isOpen={!!selectedUserForDelete}
        onClose={() => setSelectedUserForDelete(null)}
        onSuccess={() => {
          refetchUsers();
          refetchStats();
        }}
      />
    </div>
  );
}
