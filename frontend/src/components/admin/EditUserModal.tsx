'use client';

import React, { useState, useEffect } from 'react';
import { X, UserCheck, Loader2, AlertCircle, Eye, EyeOff, Compass, Lock, Tag } from 'lucide-react';
import api from '@/src/lib/axios';
import { toast } from 'sonner';

interface EditUserModalProps {
  user: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditUserModal({ user, isOpen, onClose, onSuccess }: EditUserModalProps) {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    mobile_number: '',
    company_name: '',
    country: '',
    state: '',
    role: 'USER',
    account_status: 'Active',
    is_active: true,
    auto_leadfinder_access: false,
    auto_leadfinder_keyword: 'Travel Agency',
    auto_leadfinder_visibility: 'visible'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      const email = user.email || '';
      const isKutch = email.toLowerCase() === 'kutchtourguide@gmail.com';
      setFormData({
        full_name: user.full_name || '',
        email: email,
        password: '',
        mobile_number: user.mobile_number || '',
        company_name: user.company_name || '',
        country: user.country || '',
        state: user.state || '',
        role: (user.role || 'USER').toUpperCase(),
        account_status: user.account_status || (user.is_active === false ? 'Suspended' : 'Active'),
        is_active: user.is_active !== false,
        auto_leadfinder_access: Boolean(user.auto_leadfinder_access),
        auto_leadfinder_keyword: isKutch ? 'Travel Agency' : (user.auto_leadfinder_keyword || 'Travel Agency'),
        auto_leadfinder_visibility: user.auto_leadfinder_visibility || 'visible'
      });
      setError(null);
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim() || !formData.email.trim()) {
      setError('Full Name and Email are required.');
      return;
    }

    if (formData.password && formData.password.length < 6) {
      setError('Password must be at least 6 characters if you wish to change it.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const isKutch = formData.email.toLowerCase() === 'kutchtourguide@gmail.com';
      const payload: any = {
        full_name: formData.full_name,
        email: formData.email,
        mobile_number: formData.mobile_number || null,
        company_name: formData.company_name || null,
        country: formData.country || null,
        state: formData.state || null,
        role: formData.role,
        account_status: formData.account_status,
        is_active: formData.account_status === 'Active',
        auto_leadfinder_access: formData.auto_leadfinder_access,
        auto_leadfinder_keyword: isKutch ? 'Travel Agency' : (formData.auto_leadfinder_keyword.trim() || 'Travel Agency'),
        auto_leadfinder_visibility: formData.auto_leadfinder_visibility
      };

      if (formData.password.trim()) {
        payload.password = formData.password.trim();
      }

      await api.put(`/admin/users/${user._id || user.id}`, payload);
      toast.success('User details updated successfully!');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj?.response?.data?.detail || errorObj?.message || 'Failed to update user.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200/70 flex items-center justify-center text-blue-600">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Edit User</h3>
              <p className="text-xs text-slate-500">
                Update account details, role permissions, or reset credentials.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            {/* Reset Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Set New Password <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Leave blank to keep current"
                  className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-xl p-3 pr-10 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Mobile Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Mobile Number
              </label>
              <input
                type="text"
                value={formData.mobile_number}
                onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
                className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Company Name
              </label>
              <input
                type="text"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Role
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              >
                <option value="USER">User (Standard)</option>
                <option value="MANAGER">Manager</option>
                <option value="VIEWER">Viewer (Read-only)</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </div>

            {/* Country */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Country
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            {/* State */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                State / Province
              </label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            {/* Account Status */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Account Status
              </label>
              <select
                value={formData.account_status}
                onChange={(e) => setFormData({ ...formData, account_status: e.target.value })}
                className="w-full text-xs sm:text-sm bg-white border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              >
                <option value="Active">Active (Full access)</option>
                <option value="Suspended">Suspended (Blocked from logging in)</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            {/* Auto LeadFinder Feature Access Section */}
            <div className="sm:col-span-2 pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200/80">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-100/90 border border-teal-200 flex items-center justify-center text-teal-700">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">Auto LeadFinder Feature Access</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        formData.auto_leadfinder_access
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {formData.auto_leadfinder_access ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      When enabled, this user sees Auto LeadFinder in their sidebar navigation and can access automated scraping.
                    </p>
                  </div>
                </div>

                {/* Toggle Button */}
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, auto_leadfinder_access: !formData.auto_leadfinder_access })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    formData.auto_leadfinder_access ? 'bg-teal-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      formData.auto_leadfinder_access ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Sub-settings when enabled */}
              {formData.auto_leadfinder_access && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  {/* Industry Keyword */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-teal-600" />
                        <span>Industry Keyword:</span>
                      </label>
                      {formData.email.toLowerCase() === 'kutchtourguide@gmail.com' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                          <Lock className="w-2.5 h-2.5" />
                          Fixed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          Editable
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        disabled={formData.email.toLowerCase() === 'kutchtourguide@gmail.com'}
                        value={formData.email.toLowerCase() === 'kutchtourguide@gmail.com' ? 'Travel Agency' : formData.auto_leadfinder_keyword}
                        onChange={(e) => setFormData({ ...formData, auto_leadfinder_keyword: e.target.value })}
                        placeholder="e.g. Travel Agency, Real Estate, Hotels..."
                        className={`w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all ${
                          formData.email.toLowerCase() === 'kutchtourguide@gmail.com' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'text-slate-900'
                        }`}
                      />
                      {formData.email.toLowerCase() === 'kutchtourguide@gmail.com' && (
                        <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {formData.email.toLowerCase() === 'kutchtourguide@gmail.com'
                        ? 'Permanently locked to "Travel Agency" for this user.'
                        : 'Custom search niche for this user account.'}
                    </p>
                  </div>

                  {/* Lead Visibility */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      Lead Visibility:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, auto_leadfinder_visibility: 'visible' })}
                        className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          formData.auto_leadfinder_visibility === 'visible'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Visible to User
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, auto_leadfinder_visibility: 'hidden' })}
                        className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          formData.auto_leadfinder_visibility === 'hidden'
                            ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Hidden (Admin)
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {formData.auto_leadfinder_visibility === 'visible'
                        ? 'Immediate visibility in user\'s leads table.'
                        : 'Requires Admin approval before showing to user.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
