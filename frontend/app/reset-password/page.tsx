'use client';

import { useState, useEffect, Suspense } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/src/lib/axios';
import { AxiosError } from 'axios';
import { Lock, ArrowRight, ShieldCheck, Target, Zap, Sparkles, Send, Eye, EyeOff } from 'lucide-react';

function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Invalid password reset link. Token is missing.');
      setTokenValid(false);
      return;
    }
    
    const validateToken = async () => {
      try {
        await api.get(`/auth/validate-reset-token?token=${token}`);
        setTokenValid(true);
      } catch (err: any) {
        setError('Reset link expired or invalid.');
        setTokenValid(false);
      }
    };
    
    validateToken();
  }, [token]);

  const validatePassword = (pass: string) => {
    return {
      length: pass.length >= 8,
      upper: /[A-Z]/.test(pass),
      lower: /[a-z]/.test(pass),
      number: /[0-9]/.test(pass),
      special: /[@$!%*?&#^]/.test(pass)
    };
  };

  const passValidation = validatePassword(password);
  const isPasswordValid = Object.values(passValidation).every(Boolean);
  const isPasswordsMatch = password === confirmPassword && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('Invalid password reset link. Token is missing.');
      return;
    }
    
    if (!isPasswordValid) {
      setError('Password is too weak. Please check requirements.');
      return;
    }

    if (!isPasswordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/reset-password', { token, new_password: password });
      setSuccess(response.data.message || 'Your password has been changed successfully.');
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        const data = err.response.data;
        let errMsg = 'Failed to reset password.';
        if (data.error && data.error.message) {
          errMsg = data.error.message;
        } else if (data.detail) {
          errMsg = typeof data.detail === 'string' ? data.detail : errMsg;
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
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && (
        <div className="p-4 text-sm text-red-700 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3 animate-fade-in">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      
      {success && (
        <div className="p-4 text-sm text-green-700 bg-green-50 rounded-xl border border-green-100 flex items-start gap-3 animate-fade-in">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
          <p>{success}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-slate-700">New Password</label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-[#c1121f] transition-colors" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            className="block w-full pl-11 pr-11 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#c1121f]/20 focus:border-[#c1121f] focus:bg-white transition-all shadow-sm placeholder:text-slate-400"
            placeholder="Create new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors focus:outline-none"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {password.length > 0 && (
          <div className="flex gap-2 text-xs flex-wrap mt-2">
            <span className={passValidation.length ? 'text-green-600 font-medium' : 'text-slate-500'}>8+ chars</span>
            <span className={passValidation.upper ? 'text-green-600 font-medium' : 'text-slate-500'}>ABC</span>
            <span className={passValidation.lower ? 'text-green-600 font-medium' : 'text-slate-500'}>abc</span>
            <span className={passValidation.number ? 'text-green-600 font-medium' : 'text-slate-500'}>123</span>
            <span className={passValidation.special ? 'text-green-600 font-medium' : 'text-slate-500'}>@#$</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-slate-700">Confirm Password</label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-[#c1121f] transition-colors" />
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            className="block w-full pl-11 pr-11 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-[#c1121f]/20 focus:border-[#c1121f] focus:bg-white transition-all shadow-sm placeholder:text-slate-400"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {confirmPassword.length > 0 && (
          <p className={`text-xs mt-1.5 font-medium ${isPasswordsMatch ? 'text-green-600' : 'text-red-500'}`}>
            {isPasswordsMatch ? 'Passwords match' : 'Passwords do not match'}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !token || success !== '' || tokenValid === false}
        className="w-full py-3.5 px-4 flex justify-center items-center gap-2 text-sm font-bold rounded-xl text-white bg-[#c1121f] hover:bg-[#a00d18] focus:outline-none focus:ring-4 focus:ring-[#c1121f]/20 disabled:opacity-70 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#c1121f]/25 mt-4"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Updating Password...
          </>
        ) : (
          <>Update Password <ArrowRight className="w-5 h-5" /></>
        )}
      </button>

      <div className="flex justify-center pt-3">
        <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-xs font-medium text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          Enterprise-grade encryption
        </div>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* Left Branding Panel (60%) */}
      <div className="hidden lg:flex flex-[1.5] relative overflow-hidden bg-slate-50 border-r border-slate-100 flex-col justify-between p-12">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-[#c1121f]/5 blur-3xl animate-float-slow" />
          <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-blue-100/40 blur-3xl" />
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-white shadow-sm border border-slate-200 flex items-center justify-center overflow-hidden">
            <img src="/logo.png" alt="Optimatrix" className="h-8 w-auto object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
          </div>
          <div className="text-xl font-bold tracking-tighter">
            <span className="text-black">Opti</span><span className="text-[#c1121f]">Matrix</span>
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
        
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#c1121f]/5 blur-3xl lg:hidden rounded-full pointer-events-none" />
        
        <div className="w-full max-w-sm xl:max-w-md animate-fade-up relative z-10">
          <div className="mb-8 xl:mb-10 flex flex-col items-center lg:items-start">
            <div className="h-16 mb-8 flex items-center justify-center lg:hidden">
              <img src="/logo.png" alt="Optimatrix" className="h-16 w-auto object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
            </div>
            
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 text-center lg:text-left mb-2">
              Create New Password
            </h2>
            <p className="text-slate-500 text-center lg:text-left">
              Please enter your new strong password below.
            </p>
          </div>

          <Suspense fallback={<div className="text-sm text-slate-500 animate-pulse text-center">Loading secure form...</div>}>
            <ResetPasswordForm />
          </Suspense>

          <div className="text-center mt-8">
            <p className="text-sm font-medium text-slate-600">
              Return to{' '}
              <a href="/login" className="font-bold text-[#c1121f] hover:text-[#a00d18] transition-colors underline decoration-2 decoration-transparent hover:decoration-[#c1121f]/30 underline-offset-4">
                Login
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
