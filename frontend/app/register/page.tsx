'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/src/lib/axios';
import { AxiosError } from 'axios';
import { Eye, EyeOff, Mail, Lock, ArrowRight, ArrowLeft, ShieldCheck, Target, Zap, Sparkles, User, Building, Phone, CheckCircle2, MapPin } from 'lucide-react';
import { Country, State } from 'country-state-city';
import Select from 'react-select';

const selectStyles = {
  control: (base: any, state: any) => ({
    ...base,
    backgroundColor: 'rgba(248, 250, 252, 0.6)',
    borderColor: state.isFocused ? '#c1121f' : '#e2e8f0',
    borderRadius: '0.75rem',
    padding: '0.2rem 0.5rem',
    paddingLeft: '2rem',
    minHeight: '46px',
    boxShadow: state.isFocused ? '0 0 0 4px rgba(193, 18, 31, 0.1)' : 'none',
    '&:hover': {
      borderColor: state.isFocused ? '#c1121f' : '#e2e8f0'
    },
    transition: 'all 0.2s',
  }),
  valueContainer: (base: any) => ({
    ...base,
    padding: '0',
  }),
  input: (base: any) => ({
    ...base,
    margin: '0',
    padding: '0',
  }),
  placeholder: (base: any) => ({
    ...base,
    color: '#94a3b8',
    fontSize: '0.875rem',
  }),
  singleValue: (base: any) => ({
    ...base,
    color: '#0f172a',
    fontSize: '0.875rem',
  }),
  menu: (base: any) => ({
    ...base,
    borderRadius: '0.75rem',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
    zIndex: 50,
  }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isSelected ? '#c1121f' : state.isFocused ? '#f1f5f9' : 'white',
    color: state.isSelected ? 'white' : '#0f172a',
    fontSize: '0.875rem',
    cursor: 'pointer',
    '&:active': {
      backgroundColor: '#a00d18',
    },
  }),
};

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [selectedCountry, setSelectedCountry] = useState('IN');
  const [selectedState, setSelectedState] = useState('');

  const countries = Country.getAllCountries().map(c => ({ value: c.isoCode, label: c.name }));
  const states = selectedCountry ? State.getStatesOfCountry(selectedCountry).map(s => ({ value: s.isoCode, label: s.name })) : [];
  
  const phoneCode = selectedCountry ? Country.getCountryByCode(selectedCountry)?.phonecode : '91';
  const flag = selectedCountry ? Country.getCountryByCode(selectedCountry)?.flag : '🇮🇳';
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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

  const nextStep = () => {
    setError('');
    if (step === 1) {
      if (!fullName.trim() || !email.trim()) {
        setError('Please fill in all fields to continue.');
        return;
      }
      // Simple email validation
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        setError('Please enter a valid email address.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!selectedCountry || !selectedState || !mobileNumber || !companyName.trim()) {
        setError('Please fill in all location and company details.');
        return;
      }
      setStep(3);
    }
  };

  const prevStep = () => {
    setError('');
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) return;
    
    setError('');
    setSuccess('');

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
      await api.post('/auth/register', {
        email,
        password,
        full_name: fullName,
        mobile_number: mobileNumber,
        country: selectedCountry,
        state: selectedState,
        company_name: companyName
      });

      setSuccess('Account Created Successfully. Redirecting to Login...');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        const data = err.response.data;
        let errMsg = 'Registration failed.';
        if (data.error && data.error.message) {
          errMsg = data.error.message;
          if (data.error.code === 'VALIDATION_ERROR' && data.error.details?.errors?.length > 0) {
            errMsg = data.error.details.errors[0].message;
          }
        } else if (data.detail) {
          errMsg = typeof data.detail === 'string' ? data.detail : 'Validation error.';
        }
        setError(errMsg);
      } else {
        setError('An unexpected server error occurred.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-white to-rose-50/40">
      {/* Brand / value panel — light theme */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden border-r border-slate-100">
        <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-[#c1121f]/10 blur-3xl animate-float-slow" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Optimatrix" className="h-32 w-auto object-contain drop-shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
            <div className="hidden items-center text-xl font-bold tracking-tight text-slate-900">
              Opti<span className="text-[#c1121f]">Matrix</span>
            </div>
          </div>

          <div className="space-y-7 max-w-md">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 backdrop-blur border border-slate-200 text-xs font-medium text-slate-600 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-[#c1121f]" /> Enterprise Account
            </span>
            <h1 className="text-4xl font-bold leading-[1.15] text-slate-900 tracking-tight">
              Start building your<br />lead engine<br /><span className="text-[#c1121f]">today.</span>
            </h1>
            <p className="text-slate-500 leading-relaxed">
              Join LeadFinderAgent to discover high-intent businesses, enrich contacts, and automate your outreach at scale.
            </p>
            <div className="space-y-3 pt-1">
              {[
                { icon: Target, text: 'Precision lead discovery by keyword & area' },
                { icon: Zap, text: 'AI enrichment, scoring & website intelligence' },
                { icon: Mail, text: 'Email & WhatsApp automation at scale' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm">
                    <Icon className="w-4 h-4 text-[#c1121f]" />
                  </div>
                  <span className="text-sm text-slate-600">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400">© {new Date().getFullYear()} OptiMatrix · LeadFinderAgent</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md animate-fade-up my-auto">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-200/50 p-8 sm:p-9 relative overflow-hidden">
            
            {/* Progress Bar */}
            <div className="mb-8">
              <div className="flex items-center justify-between relative">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#c1121f] transition-all duration-500 ease-out" style={{ width: `${((step - 1) / 2) * 100}%` }} />
                </div>
                {[1, 2, 3].map((s) => (
                  <div key={s} className={`relative z-10 w-8 h-8 flex items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${step >= s ? 'bg-[#c1121f] text-white shadow-md shadow-[#c1121f]/20' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                    {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider px-1">
                <span className={step >= 1 ? 'text-[#c1121f] transition-colors duration-300' : ''}>Personal</span>
                <span className={step >= 2 ? 'text-[#c1121f] transition-colors duration-300' : ''}>Company</span>
                <span className={step >= 3 ? 'text-[#c1121f] transition-colors duration-300' : ''}>Security</span>
              </div>
            </div>

            <div className="mb-7 flex flex-col items-center lg:items-start">
              <div className="h-20 mb-4 flex items-center justify-center lg:hidden">
                <img src="/logo.png" alt="Optimatrix" className="h-20 w-auto object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                <div className="hidden items-center text-xl font-bold tracking-tighter">
                  <span className="text-black">Opti</span><span className="text-[#c1121f]">Matrix</span>
                </div>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-center lg:text-left">
                {step === 1 ? 'Personal Details' : step === 2 ? 'Company Details' : 'Secure Account'}
              </h1>
              <p className="mt-1 text-sm text-slate-500 text-center lg:text-left">
                {step === 1 ? 'Tell us a bit about yourself.' : step === 2 ? 'Where is your business located?' : 'Choose a strong password.'}
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="p-3.5 text-sm text-red-600 bg-red-50 rounded-xl border border-red-100 flex items-center gap-2.5 animate-fade-up">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3.5 text-sm text-green-600 bg-green-50 rounded-xl border border-green-100 flex items-center gap-2.5 animate-fade-up">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {success}
                </div>
              )}

              <div className="space-y-4 relative min-h-[220px]">
                {/* STEP 1 */}
                <div className={`transition-all duration-300 absolute w-full ${step === 1 ? 'opacity-100 translate-x-0 pointer-events-auto z-10' : '-translate-x-full opacity-0 pointer-events-none'}`}>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required={step === 1}
                          className="w-full pl-10 pr-3 py-3 bg-slate-50/60 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-[#c1121f]/10 focus:border-[#c1121f] text-slate-900 transition-all outline-none placeholder:text-slate-400 text-sm"
                          placeholder="Enter your full name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          required={step === 1}
                          className="w-full pl-10 pr-3 py-3 bg-slate-50/60 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-[#c1121f]/10 focus:border-[#c1121f] text-slate-900 transition-all outline-none placeholder:text-slate-400 text-sm"
                          placeholder="Enter your email address"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* STEP 2 */}
                <div className={`transition-all duration-300 absolute w-full ${step === 2 ? 'opacity-100 translate-x-0 pointer-events-auto z-10' : step > 2 ? '-translate-x-full opacity-0 pointer-events-none' : 'translate-x-full opacity-0 pointer-events-none'}`}>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700">Country</label>
                        <div className="relative">
                          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                          <Select
                            options={countries}
                            value={countries.find(c => c.value === selectedCountry)}
                            onChange={(option) => {
                              setSelectedCountry(option?.value || '');
                              setSelectedState('');
                            }}
                            styles={selectStyles}
                            placeholder="Country"
                            className="text-sm"
                            classNamePrefix="react-select"
                            instanceId="country-select"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-slate-700">State</label>
                        <div className="relative">
                          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                          <Select
                            options={states}
                            value={states.find(s => s.value === selectedState) || null}
                            onChange={(option) => setSelectedState(option?.value || '')}
                            styles={selectStyles}
                            placeholder="State"
                            isDisabled={!selectedCountry || states.length === 0}
                            className="text-sm"
                            classNamePrefix="react-select"
                            instanceId="state-select"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Mobile Number</label>
                      <div className="flex relative">
                        <span className="inline-flex items-center px-3 border border-r-0 border-slate-200 rounded-l-xl bg-slate-100 text-slate-600 text-sm">
                          {flag} +{phoneCode}
                        </span>
                        <input
                          type="tel"
                          required={step === 2}
                          pattern="[0-9]*"
                          className="w-full pl-3 pr-3 py-3 bg-slate-50/60 border border-slate-200 rounded-r-xl focus:bg-white focus:ring-4 focus:ring-[#c1121f]/10 focus:border-[#c1121f] text-slate-900 transition-all outline-none placeholder:text-slate-400 text-sm"
                          placeholder="Enter mobile number"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Company Name</label>
                      <div className="relative">
                        <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required={step === 2}
                          className="w-full pl-10 pr-3 py-3 bg-slate-50/60 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-[#c1121f]/10 focus:border-[#c1121f] text-slate-900 transition-all outline-none placeholder:text-slate-400 text-sm"
                          placeholder="Enter your company name"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* STEP 3 */}
                <div className={`transition-all duration-300 absolute w-full ${step === 3 ? 'opacity-100 translate-x-0 pointer-events-auto z-10' : 'translate-x-full opacity-0 pointer-events-none'}`}>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required={step === 3}
                          className="w-full pl-10 pr-11 py-3 bg-slate-50/60 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-[#c1121f]/10 focus:border-[#c1121f] text-slate-900 transition-all outline-none placeholder:text-slate-400 text-sm"
                          placeholder="Create password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors focus:outline-none"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {password.length > 0 && (
                        <div className="flex gap-2 text-xs flex-wrap mt-2">
                          <span className={passValidation.length ? 'text-green-600' : 'text-slate-500'}>8+ chars</span>
                          <span className={passValidation.upper ? 'text-green-600' : 'text-slate-500'}>ABC</span>
                          <span className={passValidation.lower ? 'text-green-600' : 'text-slate-500'}>abc</span>
                          <span className={passValidation.number ? 'text-green-600' : 'text-slate-500'}>123</span>
                          <span className={passValidation.special ? 'text-green-600' : 'text-slate-500'}>@#$</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">Confirm Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required={step === 3}
                          className="w-full pl-10 pr-11 py-3 bg-slate-50/60 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-[#c1121f]/10 focus:border-[#c1121f] text-slate-900 transition-all outline-none placeholder:text-slate-400 text-sm"
                          placeholder="Re-enter password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                      </div>
                      {confirmPassword.length > 0 && (
                        <p className={`text-xs mt-1 ${isPasswordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                          {isPasswordsMatch ? 'Passwords match' : 'Passwords do not match'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={prevStep}
                    disabled={loading}
                    className="flex-1 py-3 px-4 flex justify-center items-center gap-2 text-sm font-medium rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 focus:outline-none transition-all active:scale-[0.99] disabled:opacity-50"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                )}
                
                {step < 3 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex-[2] py-3 px-4 flex justify-center items-center gap-2 text-sm font-medium rounded-xl text-white bg-[#c1121f] hover:bg-[#a00d18] focus:outline-none shadow-lg shadow-[#c1121f]/20 transition-all active:scale-[0.99]"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading || !isPasswordValid || !isPasswordsMatch}
                    className="flex-[2] py-3 px-4 flex justify-center items-center gap-2 text-sm font-medium rounded-xl text-white bg-[#c1121f] hover:bg-[#a00d18] focus:outline-none shadow-lg shadow-[#c1121f]/20 transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Creating Account...
                      </>
                    ) : (
                      <>Create Account <CheckCircle2 className="w-4 h-4" /></>
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 pt-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Secured connection
              </div>

              <div className="text-center text-sm text-slate-600 mt-6 pb-2">
                Already have an account?{' '}
                <a href="/login" className="font-semibold text-[#c1121f] hover:text-[#a00d18] transition-colors">
                  Sign In
                </a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
