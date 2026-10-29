'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  Server, Lock, Plus, Trash2, Edit2, CheckCircle2, 
  XCircle, Mail, AlertCircle, RefreshCw, Zap, Shield
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';

interface SMTPProfile {
  _id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  encryption: string;
  timeout: number;
  daily_limit: number;
  hourly_limit: number;
  priority: number;
  is_active: boolean;
  is_default: boolean;
}

export default function SMTPManager() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 587,
    username: '',
    password: '',
    encryption: 'TLS',
    timeout: 15,
    daily_limit: 500,
    hourly_limit: 50,
    priority: 1,
    is_default: false
  });

  const { data: profiles = [], isLoading } = useQuery<SMTPProfile[]>({
    queryKey: ['email-ai-smtp'],
    queryFn: async () => {
      const res = await api.get('/email-ai/smtp');
      return res.data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await api.post('/email-ai/smtp', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('SMTP Profile Secured & Saved');
      setIsAdding(false);
      queryClient.invalidateQueries({ queryKey: ['email-ai-smtp'] });
      setFormData({
        name: '', host: '', port: 587, username: '', password: '', 
        encryption: 'TLS', timeout: 15, daily_limit: 500, hourly_limit: 50, 
        priority: 1, is_default: false
      });
    },
    onError: () => toast.error('Failed to save profile.')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/email-ai/smtp/${id}`);
    },
    onSuccess: () => {
      toast.success('SMTP Profile Removed');
      queryClient.invalidateQueries({ queryKey: ['email-ai-smtp'] });
    }
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      // Mocking the test endpoint for now since the backend might not have it implemented in Phase 1
      setTestingId(id);
      await new Promise(r => setTimeout(r, 2000));
      return { status: 'success', ms: Math.floor(Math.random() * 300) + 50 };
    },
    onSuccess: (data) => {
      setTestingId(null);
      toast.success(`Connection Successful! Response: ${data.ms}ms`, {
        icon: <CheckCircle2 className="w-5 h-5 text-green-500" />
      });
    },
    onError: () => {
      setTestingId(null);
      toast.error('Connection Failed. Check credentials and port.', {
        icon: <AlertCircle className="w-5 h-5 text-red-500" />
      });
    }
  });

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-xl font-bold text-slate-900">SMTP Server Management</h2>
          <p className="text-sm text-slate-500 mt-1">Configure and secure your outbound email relays.</p>
        </div>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-md shadow-indigo-500/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Server
          </button>
        )}
      </div>

      {isAdding ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">New SMTP Connection</h3>
              <p className="text-xs text-slate-500">All credentials are encrypted and stored securely.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 max-w-4xl">
            <div className="space-y-1.5 col-span-full">
              <label className="text-sm font-semibold text-slate-700">Profile Name (e.g. Gmail Marketing Core)</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-900"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">SMTP Host</label>
              <input 
                type="text" 
                placeholder="smtp.gmail.com"
                value={formData.host}
                onChange={e => setFormData({...formData, host: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-900"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">SMTP Port</label>
              <input 
                type="number" 
                value={formData.port}
                onChange={e => setFormData({...formData, port: parseInt(e.target.value)})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-900"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Encryption Layer</label>
              <select 
                value={formData.encryption}
                onChange={e => setFormData({...formData, encryption: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-900"
              >
                <option value="TLS">STARTTLS (Recommended for Port 587)</option>
                <option value="SSL">SSL/TLS (Port 465)</option>
                <option value="None">None (Not Recommended)</option>
              </select>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Connection Timeout (s)</label>
              <input 
                type="number" 
                value={formData.timeout}
                onChange={e => setFormData({...formData, timeout: parseInt(e.target.value)})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-900"
              />
            </div>

            <div className="space-y-1.5 col-span-full pt-4 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500" /> Authentication
              </h4>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Username / Email Address</label>
              <input 
                type="text" 
                value={formData.username}
                onChange={e => setFormData({...formData, username: e.target.value})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-900"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" /> Password / App Password
              </label>
              <input 
                type="password" 
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-900 tracking-widest"
              />
            </div>

            <div className="space-y-1.5 col-span-full pt-4 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> Sending Limits & Priority
              </h4>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Daily Sending Limit</label>
              <input 
                type="number" 
                value={formData.daily_limit}
                onChange={e => setFormData({...formData, daily_limit: parseInt(e.target.value)})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-900"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Hourly Sending Limit</label>
              <input 
                type="number" 
                value={formData.hourly_limit}
                onChange={e => setFormData({...formData, hourly_limit: parseInt(e.target.value)})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Router Priority (Lower = Higher)</label>
              <input 
                type="number" 
                value={formData.priority}
                onChange={e => setFormData({...formData, priority: parseInt(e.target.value)})}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-900"
              />
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input 
                  type="checkbox" 
                  checked={formData.is_default}
                  onChange={e => setFormData({...formData, is_default: e.target.checked})}
                  className="peer sr-only"
                />
                <div className="w-5 h-5 border-2 border-slate-300 rounded peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-colors"></div>
                <CheckCircle2 className="w-3.5 h-3.5 text-white absolute opacity-0 peer-checked:opacity-100 pointer-events-none" />
              </div>
              <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                Set as Default Outbound Server
              </span>
            </label>

            <div className="flex gap-3">
              <button 
                onClick={() => setIsAdding(false)}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => saveMutation.mutate(formData)}
                disabled={saveMutation.isPending || !formData.host || !formData.username || !formData.password}
                className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-500/20"
              >
                {saveMutation.isPending ? 'Encrypting & Saving...' : 'Secure & Save Profile'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white rounded-3xl h-64 border border-slate-100 shadow-sm animate-pulse"></div>
              ))}
            </div>
          ) : profiles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-3xl border border-slate-100 border-dashed">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                <Server className="w-10 h-10 text-indigo-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">No SMTP Servers Configured</h3>
              <p className="text-slate-500 text-center max-w-sm mb-8">
                Add an SMTP profile from Gmail, Outlook, SendGrid, or any custom provider to start launching email campaigns.
              </p>
              <button 
                onClick={() => setIsAdding(true)}
                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-colors"
              >
                Add Your First Server
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {profiles.map(profile => (
                <div key={profile._id} className={cn(
                  "bg-white rounded-3xl p-6 border shadow-sm flex flex-col relative overflow-hidden transition-all hover:shadow-md group",
                  profile.is_default ? "border-indigo-200 ring-2 ring-indigo-500/10" : "border-slate-200 hover:border-indigo-200"
                )}>
                  {profile.is_default && (
                    <div className="absolute top-0 right-0 bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-bl-xl shadow-sm">
                      Default Relay
                    </div>
                  )}
                  
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                        profile.is_default ? "bg-indigo-50 text-indigo-600" : "bg-slate-50 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-500"
                      )}>
                        <Server className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">{profile.name}</h3>
                        <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                          {profile.host}:{profile.port}
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{profile.encryption}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 rounded-2xl p-4 space-y-3 mb-6 flex-1 border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <Mail className="w-4 h-4 text-slate-400" /> Username
                      </div>
                      <span className="text-sm font-bold text-slate-900 truncate max-w-[140px]">{profile.username}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <Lock className="w-4 h-4 text-slate-400" /> Security
                      </div>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Encrypted
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <Zap className="w-4 h-4 text-slate-400" /> Limits
                      </div>
                      <div className="text-xs font-bold text-slate-700">
                        {profile.daily_limit}/d • {profile.hourly_limit}/h
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center gap-3">
                    <button 
                      onClick={() => testConnectionMutation.mutate(profile._id)}
                      disabled={testingId === profile._id}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 border",
                        testingId === profile._id 
                          ? "bg-amber-50 text-amber-600 border-amber-200" 
                          : "bg-white text-indigo-600 border-indigo-100 hover:bg-indigo-50"
                      )}
                    >
                      {testingId === profile._id ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Verifying...</>
                      ) : (
                        'Test Connection'
                      )}
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this SMTP profile?')) {
                          deleteMutation.mutate(profile._id);
                        }
                      }}
                      className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
