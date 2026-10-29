'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/src/features/auth/store';
import api from '@/src/lib/axios';
import { AxiosError } from 'axios';
import { Eye, EyeOff, Mail, Lock, ArrowRight, ShieldCheck, Target, Zap, Sparkles, Send, Database, BarChart3 } from 'lucide-react';


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await api.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const { access_token, refresh_token, role } = response.data;

      const meRes = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      // Fallback to role from 'me' response if backend response didn't include it (legacy support)
      const userRole = role || meRes.data.role || 'user';
      const userPayload = { id: meRes.data.id || meRes.data._id, email: meRes.data.email || email, role: userRole };

      login(userPayload, access_token, refresh_token, rememberMe);

      if (userRole === 'admin' || userRole === 'ADMIN') {
        router.push('/dashboard/admin/user-activity');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        const data = err.response.data;
        let errMsg = 'Invalid email or password.';
        if (data.error && data.error.message) {
          errMsg = data.error.message;
        } else if (data.detail) {
          errMsg = typeof data.detail === 'string' ? data.detail : 'Invalid email or password.';
        }
        setError(errMsg);
      } else {
        setError('An unexpected server error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* Left Carousel Panel (60%) */}
      <div className="hidden lg:flex flex-[1.5] relative overflow-hidden bg-slate-50 border-r border-slate-100 flex-col justify-between p-12">
        {/* Abstract Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-[#c1121f]/5 blur-3xl animate-float-slow" />
          <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-blue-100/40 blur-3xl" />
        </div>

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-3">
          <img src="/logo.png" alt="Optimatrix" className="h-12 w-auto object-contain drop-shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
          <div className="hidden items-center text-xl font-bold tracking-tight text-slate-900">
            Opti<span className="text-[#c1121f]">Matrix</span>
          </div>
        </div>

        {/* Static Content */}
        <div className="relative z-10 max-w-2xl mt-12 mb-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm text-xs font-semibold text-slate-700 tracking-wide uppercase mb-8">
            <Sparkles className="w-3.5 h-3.5 text-[#c1121f]" /> Enterprise Account
          </span>

          <h1 className="text-4xl sm:text-5xl font-extrabold leading-[1.1] text-slate-900 tracking-tight mb-6">
            Start building your<br />lead engine<br /><span className="text-[#c1121f]">today.</span>
          </h1>

          <p className="text-lg text-slate-500 leading-relaxed max-w-lg mb-10">
            Join LeadFinderAgent to discover high-intent businesses, enrich contacts, and automate your outreach at scale.
          </p>

          <div className="space-y-4">
            {[
              { icon: Target, text: 'Precision lead discovery by keyword & area' },
              { icon: Zap, text: 'AI enrichment, scoring & website intelligence' },
              { icon: Send, text: 'Email & WhatsApp automation at scale' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 text-[#c1121f]">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-base font-medium text-slate-700">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-xs font-medium text-slate-400">
          <span>© {new Date().getFullYear()} OptiMatrix</span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span>LeadFinderAgent Platform</span>
        </div>
      </div>

      {/* Right Form Panel (40%) */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12 relative overflow-hidden bg-white">

        {/* Mobile Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#c1121f]/5 blur-3xl lg:hidden rounded-full pointer-events-none" />

        <div className="w-full max-w-sm xl:max-w-md animate-fade-up relative z-10">
          <div className="mb-8 xl:mb-10 flex flex-col items-center lg:items-start">
            <div className="h-16 mb-8 flex items-center justify-center lg:hidden">
              <img src="/logo.png" alt="Optimatrix" className="h-16 w-auto object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
            </div>

            <h2 className="text-3xl font-bold tracking-tight text-slate-900 text-center lg:text-left mb-2">
              Welcome back
            </h2>
            <p className="text-slate-500 text-center lg:text-left">
              Please enter your details to sign in.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-4 text-sm text-red-700 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3 animate-fade-in">
                <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-red-500 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    required
                    className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#c1121f]/10 focus:border-[#c1121f] text-slate-900 transition-all outline-none placeholder:text-slate-400 text-sm shadow-sm"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="w-full pl-11 pr-12 py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-[#c1121f]/10 focus:border-[#c1121f] text-slate-900 transition-all outline-none placeholder:text-slate-400 text-sm shadow-sm"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 pb-2">
              <label className="flex items-center gap-2 cursor-pointer group select-none">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 bg-white checked:bg-[#c1121f] checked:border-[#c1121f] focus:ring-[#c1121f] focus:ring-2 focus:ring-offset-1 transition-all appearance-none cursor-pointer shadow-sm"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  {rememberMe && (
                    <svg className="absolute w-3 h-3 text-white pointer-events-none left-0.5 top-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Remember for 30 days</span>
              </label>

              <a href="/forgot-password" className="text-sm font-semibold text-[#c1121f] hover:text-[#a00d18] transition-colors">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 flex justify-center items-center gap-2 text-sm font-bold rounded-xl text-white bg-[#c1121f] hover:bg-[#a00d18] focus:outline-none focus:ring-4 focus:ring-[#c1121f]/20 disabled:opacity-70 disabled:cursor-wait transition-all shadow-lg shadow-[#c1121f]/25 mt-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Authenticating...
                </>
              ) : (
                <>Sign in to Dashboard <ArrowRight className="w-5 h-5" /></>
              )}
            </button>

            <div className="flex justify-center pt-3">
              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-xs font-medium text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Enterprise-grade encryption
              </div>
            </div>

            <div className="text-center mt-8">
              <p className="text-sm font-medium text-slate-600">
                Don&apos;t have an account?{' '}
                <a href="/register" className="font-bold text-[#c1121f] hover:text-[#a00d18] transition-colors underline decoration-2 decoration-transparent hover:decoration-[#c1121f]/30 underline-offset-4">
                  Create a free account
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
