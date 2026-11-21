'use client';

import React, { useState, useEffect } from 'react';
import { X, Send, Key, Eye, EyeOff, ShieldCheck, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import api from '@/src/lib/axios';
import { toast } from 'sonner';

interface EasyAdServerConfigModalProps {
  user: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EasyAdServerConfigModal({
  user,
  isOpen,
  onClose,
  onSuccess
}: EasyAdServerConfigModalProps) {
  const [access, setAccess] = useState(false);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setAccess(Boolean(user.easyadserver_access));
      setToken(user.easyadserver_token || '');
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const userId = user._id || user.id;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (access && !token.trim()) {
      toast.error('Please enter an API Token to enable EasyAdServer for this user.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.patch(`/admin/users/${userId}/toggle-easyadserver`, {
        easyadserver_access: access,
        easyadserver_token: token.trim()
      });

      toast.success(res.data?.message || `EasyAdServer settings updated for ${user.email}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update EasyAdServer settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-xs">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">EasyAdServer Integration</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Dynamic Admin Control
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Configure API credentials &amp; lead export permissions for this user.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
          <div>
            <span className="font-bold text-slate-800 block text-sm">{user.full_name || 'Unnamed User'}</span>
            <span className="text-slate-500">{user.email}</span>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700">
            {user.role || 'USER'}
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Enable / Disable Toggle */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">EasyAdServer Access</span>
                <span className="text-[11px] text-slate-500">
                  When enabled, this user will see the &quot;Send EasyAdServer&quot; button in their leads panel.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAccess(!access)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                access ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                  access ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* API Token Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-emerald-600" />
              <span>EasyAdServer API Bearer Token</span>
              {access && <span className="text-rose-500">*</span>}
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="eas_9e20435003f9e6e1baa3b9c5052755ec81a225861c38ef13652d747c2dd905b6"
                className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl p-3 pr-10 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Admin token assigned specifically to this user account. Leads dispatched by this user will be sent with this Bearer token securely on the backend.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Configuration...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Configuration</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
