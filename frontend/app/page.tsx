'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/src/features/auth/store';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  Gauge,
  Globe,
  Handshake,
  HelpCircle,
  History,
  Layers,
  Mail,
  MapPin,
  MessageCircle,
  PlayCircle,
  Radar,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';

export default function HomePage() {
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    if (!hasHydrated) return;
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, hasHydrated, router]);

  if (!hasHydrated) return null;

  const features = [
    {
      icon: MapPin,
      title: 'Google Maps Search',
      description:
        'Discover local businesses from Google Maps and regional directories using smart category filters and geo-targeting.',
      color: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
    },
    {
      icon: Globe,
      title: 'Website Analysis',
      description:
        'Deep-crawl target websites to extract active contact details, detect technologies, and surface high-value outreach signals.',
      color: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
    },
    {
      icon: Sparkles,
      title: 'AI Enrichment & Scoring',
      description:
        'Every lead is enriched with instant context — company intelligence, contact data, and a quality score to prioritize your best targets.',
      color: 'bg-purple-500/10 text-purple-500 border border-purple-500/20',
    },
    {
      icon: Mail,
      title: 'Email Automation',
      description:
        'Send personalized cold-email sequences at scale with AI-written drafts, smart follow-ups, and detailed deliverability tracking.',
      color: 'bg-rose-500/10 text-rose-500 border border-rose-500/20',
    },
    {
      icon: MessageCircle,
      title: 'WhatsApp Automation',
      description:
        'Reach leads where they respond — schedule campaigns, reuse templates, and track delivery and replies in real time.',
      color: 'bg-green-500/10 text-green-500 border border-green-500/20',
    },
    {
      icon: Download,
      title: 'Instant Data Export',
      description:
        'Export clean, structured leads to CSV or Excel in one click — ready for any CRM or email platform with zero friction.',
      color: 'bg-orange-500/10 text-orange-500 border border-orange-500/20',
    },
  ];

  const steps = [
    {
      step: '01',
      icon: Search,
      title: 'Find the right leads',
      description:
        'Search by keyword, category, and location to discover high-intent businesses from Google Maps and local directories.',
    },
    {
      step: '02',
      icon: Database,
      title: 'Enrich with AI',
      description:
        'Our engine analyzes websites, extracts verified emails and phone numbers, and scores every business automatically.',
    },
    {
      step: '03',
      icon: Send,
      title: 'Automate outreach',
      description:
        'Launch email and WhatsApp campaigns to your fresh pipeline, then track responses and conversion in one dashboard.',
    },
  ];

  const stats = [
    { value: '10×', label: 'Faster prospecting' },
    { value: '1M+', label: 'Leads discovered' },
    { value: '95%', label: 'Data accuracy' },
    { value: '24/7', label: 'AI automation' },
  ];

  const trustPoints = [
    { icon: CheckCircle2, text: 'No credit card required to start' },
    { icon: Clock, text: 'Real-time data, always fresh' },
    { icon: ShieldCheck, text: 'GDPR-compliant data handling' },
    { icon: Zap, text: '99.9% uptime guarantee' },
  ];

  const analysisDimensions = [
    { icon: Gauge, label: 'SEO Score', value: 82, color: 'bg-emerald-500' },
    { icon: Zap, label: 'Performance', value: 76, color: 'bg-emerald-500' },
    { icon: Sparkles, label: 'UI / UX', value: 68, color: 'bg-amber-400' },
    { icon: ShieldCheck, label: 'Security', value: 91, color: 'bg-emerald-500' },
    { icon: Radar, label: 'Accessibility', value: 64, color: 'bg-amber-400' },
    { icon: TrendingUp, label: 'Opportunity', value: 88, color: 'bg-[#c1121f]' },
  ];

  const pipelineStages = [
    { name: 'New Lead', count: 128, color: 'bg-slate-400' },
    { name: 'Analyzed', count: 96, color: 'bg-blue-500' },
    { name: 'Contacted', count: 54, color: 'bg-amber-400' },
    { name: 'Meeting', count: 21, color: 'bg-purple-500' },
    { name: 'Won', count: 9, color: 'bg-emerald-500' },
  ];

  const audience = [
    {
      icon: Building2,
      title: 'Agencies & Consultants',
      description:
        'Deliver fresh, qualified leads to every client account. Batch-discover niches, enrich in bulk, and hand off clean, ready-to-use datasets.',
      points: ['White-label ready pipelines', 'Bulk discovery by niche & region', 'CSV / Excel hand-off for client reports'],
    },
    {
      icon: Handshake,
      title: 'B2B Sales Teams',
      description:
        'Fill your CRM with scored, high-intent prospects and automate the follow-up sequence — from first touch to won deal.',
      points: ['AI-scored target lists', 'Email & WhatsApp sequencing', 'Kanban pipeline & deal tracking'],
    },
    {
      icon: Rocket,
      title: 'Founders & Startups',
      description:
        'Skip the cold outreach grind. Find customers in minutes, personalize every message, and focus your energy on closing.',
      points: ['Free to start', 'No credit card required', 'Results on day one'],
    },
  ];

  const faqs = [
    {
      q: 'Do I need a credit card to start?',
      a: 'No. Create a free account and start discovering leads immediately — no credit card, no hidden trial, cancel anytime.',
    },
    {
      q: 'Where do your leads come from?',
      a: 'Leads are discovered from Google Maps and regional business directories by country, state, city, area, and keyword. Every search job runs live with progress tracking and is saved to your history.',
    },
    {
      q: 'Is the contact data verified?',
      a: 'Yes. Every lead passes through our AI analysis pipeline, which crawls the business website to extract and verify emails and phone numbers, and scores each business across SEO, performance, security, and opportunity.',
    },
    {
      q: 'Can I use the leads for email and WhatsApp outreach?',
      a: 'Absolutely. Import your leads into the Email and WhatsApp AI agents, choose from 13+ built-in template categories, and run automated campaigns with scheduling, limits, and live delivery tracking.',
    },
    {
      q: 'How do I track leads after they reply?',
      a: 'Use the built-in CRM. Leads flow through a 14-stage sales pipeline from new lead to won or lost, with a drag-and-drop Kanban board, priorities, and lead scores on every card.',
    },
  ];

  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.png"
                alt="LeadFinder"
                className="h-10 w-auto object-contain drop-shadow-sm"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500 tracking-wide uppercase">
                LeadFinderAgent
              </span>
              <div className="hidden items-center text-lg font-bold tracking-tight text-slate-900">
                Lead<span className="text-blue-600">Finder</span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
              <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How it works</a>
              <a href="#intelligence" className="hover:text-slate-900 transition-colors">AI Analysis</a>
              <a href="#automation" className="hover:text-slate-900 transition-colors">Automation</a>
              <a href="#crm" className="hover:text-slate-900 transition-colors">CRM</a>
              <a href="#faq" className="hover:text-slate-900 transition-colors">FAQ</a>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-bold rounded-xl text-white bg-[#c1121f] hover:bg-[#a00d18] shadow-md shadow-[#c1121f]/20 transition-all"
              >
                Get Started
                <ArrowRight className="ml-1.5 w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-[#c1121f]/5 blur-3xl animate-float-slow" />
          <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-blue-100/40 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 lg:pt-28 lg:pb-32">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm text-xs font-semibold text-slate-700 tracking-wide uppercase mb-8 animate-fade-up">
              <Sparkles className="w-3.5 h-3.5 text-[#c1121f]" /> Next-Gen Lead Generation
            </span>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] text-slate-900 tracking-tight mb-6 animate-fade-up">
              Find your next million leads{' '}
              <span className="text-[#c1121f]">in just 10 minutes</span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-500 leading-relaxed max-w-2xl mx-auto mb-10 animate-fade-up">
              LeadFinderAgent automatically discovers, analyzes, and organizes high-intent business
              leads from Google Maps and business directories — then enriches them with verified
              contacts and automates your outreach at scale.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-up">
              <Link
                href="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold rounded-xl text-white bg-[#c1121f] hover:bg-[#a00d18] shadow-lg shadow-[#c1121f]/25 active:scale-[0.98] transition-all"
              >
                Start Finding Leads Free
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 active:scale-[0.98] transition-all"
              >
                <PlayCircle className="mr-2 w-4 h-4 text-[#c1121f]" />
                Sign in to Dashboard
              </Link>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-xs font-medium text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Free to start · No credit card required · Cancel anytime
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="py-10 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs sm:text-sm font-medium text-slate-400 uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20 text-xs font-semibold tracking-wide uppercase mb-5">
              <Target className="w-3.5 h-3.5" /> Platform Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4">
              Everything you need to automate prospecting
            </h2>
            <p className="text-lg text-slate-500 leading-relaxed">
              From discovery to first reply — one platform that handles your entire outbound
              workflow so you can close deals faster.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map(({ icon: Icon, title, description, color }) => (
              <div
                key={title}
                className="group relative bg-white rounded-2xl p-8 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/60 hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${color} mb-6`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-3 group-hover:text-[#c1121f] transition-colors">
                  {title}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 bg-slate-50 border-y border-slate-100 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20 text-xs font-semibold tracking-wide uppercase mb-5">
              <Layers className="w-3.5 h-3.5" /> How it works
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4">
              From lead to customer in three simple steps
            </h2>
            <p className="text-lg text-slate-500 leading-relaxed">
              No spreadsheets, no manual scraping, no guesswork. Just a repeatable engine that
              keeps your pipeline full.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map(({ step, icon: Icon, title, description }) => (
              <div key={step} className="relative">
                <div className="hidden md:block absolute top-8 left-full -translate-x-1/2 w-16 h-px bg-slate-200" />
                <div className="relative bg-white rounded-2xl p-8 border border-slate-100 shadow-sm h-full">
                  <div className="flex items-center justify-between mb-6">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-4xl font-extrabold text-slate-100">{step}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">{title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Analysis & Intelligence */}
      <section id="intelligence" className="py-24 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="relative order-2 lg:order-1">
              <div className="absolute -bottom-10 -left-10 w-72 h-72 rounded-full bg-[#c1121f]/5 blur-3xl" />
              <div className="relative bg-white rounded-3xl border border-slate-100 shadow-2xl shadow-slate-200/60 p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20">
                      <BrainCircuit className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">AI Lead Analysis</div>
                      <div className="text-xs text-slate-400">website-analyzed · 14-stage pipeline</div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs font-semibold">
                    Score 88/100
                  </span>
                </div>

                <div className="space-y-4 mb-8">
                  {analysisDimensions.map(({ icon: Icon, label, value, color }) => (
                    <div key={label}>
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <Icon className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-600">{label}</span>
                        <span className="ml-auto text-xs font-bold text-slate-900">{value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Workflow className="w-4 h-4 text-[#c1121f]" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">Pipeline Progress</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {['New', 'Analyzed', 'Contacted', 'Meeting', 'Won'].map((stage, i) => (
                      <div key={stage} className="flex flex-1 flex-col items-center gap-1.5">
                        <div className={`w-full h-1.5 rounded-full ${i <= 3 ? 'bg-[#c1121f]' : 'bg-emerald-500'}`} />
                        <span className="text-[10px] font-semibold text-slate-500">{stage}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20 text-xs font-semibold tracking-wide uppercase mb-5">
                <BrainCircuit className="w-3.5 h-3.5" /> AI Analysis &amp; Intelligence
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-5 leading-tight">
                Every lead analyzed, scored, and ready to sell
              </h2>
              <p className="text-lg text-slate-500 leading-relaxed mb-8">
                Our AI engine crawls every website it discovers and returns a complete intelligence
                report — so you only reach out to businesses that are actually worth your time.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  {
                    icon: Trophy,
                    title: 'Opportunity scoring',
                    description: 'Top-50 leaderboards surface the highest-value prospects first.',
                  },
                  {
                    icon: Gauge,
                    title: 'Deep website scores',
                    description: 'SEO, performance, UI/UX, security & accessibility ratings per lead.',
                  },
                  {
                    icon: Radar,
                    title: 'Stack detection',
                    description: 'Know the CMS, hosting, and tech every prospect runs on.',
                  },
                  {
                    icon: FileSpreadsheet,
                    title: 'Export-ready reports',
                    description: 'Pull KPIs and insights as CSV, Excel, JSON, or PDF on any schedule.',
                  },
                ].map(({ icon: Icon, title, description }) => (
                  <div key={title} className="flex items-start gap-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-white text-[#c1121f] border border-slate-100 shadow-sm">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Automation showcase */}
      <section id="automation" className="py-24 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20 text-xs font-semibold tracking-wide uppercase mb-5">
                <Zap className="w-3.5 h-3.5" /> Outreach Automation
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-5 leading-tight">
                Engage leads on the channels they actually use
              </h2>
              <p className="text-lg text-slate-500 leading-relaxed mb-8">
                Your leads are enriched, scored, and ready. Automate personalized follow-ups and
                reply-tracking across email and WhatsApp — all from a single, unified dashboard.
              </p>

              <div className="space-y-5">
                {[
                  {
                    icon: Mail,
                    title: 'AI Email Campaigns',
                    description: 'AI-written sequences, smart scheduling, and open & reply tracking.',
                  },
                  {
                    icon: MessageCircle,
                    title: 'WhatsApp Campaigns',
                    description: 'Reusable templates, live delivery status, and instant reply alerts.',
                  },
                  {
                    icon: Users,
                    title: 'Built-in CRM & Pipeline',
                    description: 'Organize leads, manage follow-ups, and track every deal to close.',
                  },
                  {
                    icon: BarChart3,
                    title: 'Analytics & Intelligence',
                    description: 'Measure performance, spot trends, and optimize what converts.',
                  },
                ].map(({ icon: Icon, title, description }) => (
                  <div key={title} className="flex items-start gap-4">
                    <div className="flex items-center justify-center w-11 h-11 shrink-0 rounded-xl bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{title}</h3>
                      <p className="text-sm text-slate-500 mt-0.5">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-10 -right-10 w-72 h-72 rounded-full bg-[#c1121f]/5 blur-3xl" />
              <div className="relative bg-slate-900 rounded-3xl p-8 shadow-2xl shadow-slate-900/20">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#c1121f]" />
                    <span className="w-3 h-3 rounded-full bg-amber-400" />
                    <span className="w-3 h-3 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-xs font-semibold text-slate-400">Campaign Dashboard</span>
                </div>

                <div className="flex items-center gap-3 mb-8">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">WhatsApp Blast — May 2026</div>
                    <div className="text-xs text-slate-400">1,240 leads · 89% delivered</div>
                  </div>
                  <span className="ml-auto px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">
                    Active
                  </span>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Delivered', value: '1,104', pct: 89, color: 'bg-emerald-400' },
                    { label: 'Opened', value: '612', pct: 55, color: 'bg-[#c1121f]' },
                    { label: 'Replied', value: '186', pct: 30, color: 'bg-amber-400' },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                        <span className="text-slate-300">{row.label}</span>
                        <span className="text-white">{row.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-700/60 overflow-hidden">
                        <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400">New reply</span>
                  </div>
                  <p className="text-sm text-slate-300">
                    &quot;Hi, we&apos;re interested. Can you share pricing for 50 stores?&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CRM Pipeline */}
      <section id="crm" className="py-24 bg-slate-50 border-y border-slate-100 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20 text-xs font-semibold tracking-wide uppercase mb-5">
                <ClipboardCheck className="w-3.5 h-3.5" /> Built-in CRM Pipeline
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-5 leading-tight">
                Watch every deal move from lead to won
              </h2>
              <p className="text-lg text-slate-500 leading-relaxed mb-8">
                A 14-stage sales pipeline — from new lead and website analyzed, through email and
                WhatsApp sent, meeting scheduled, proposal and negotiation, to won, lost, or
                archived. Drag and drop, prioritize, and close.
              </p>

              <div className="space-y-5">
                {[
                  {
                    icon: ClipboardCheck,
                    title: '14-stage pipeline',
                    description: 'Every stage of your sales process mapped and trackable in one board.',
                  },
                  {
                    icon: Star,
                    title: 'Priorities & lead scores',
                    description: 'AI-assigned scores and priorities on every card make it obvious who to call.',
                  },
                  {
                    icon: Users,
                    title: 'Full lead context',
                    description: 'Website, contacts, scores, and outreach history — right on the card.',
                  },
                  {
                    icon: History,
                    title: 'Search history & reruns',
                    description: 'Re-open any past search, rerun it, and keep the pipeline fresh forever.',
                  },
                ].map(({ icon: Icon, title, description }) => (
                  <div key={title} className="flex items-start gap-4">
                    <div className="flex items-center justify-center w-11 h-11 shrink-0 rounded-xl bg-white text-[#c1121f] border border-slate-100 shadow-sm">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{title}</h3>
                      <p className="text-sm text-slate-500 mt-0.5">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -top-10 -left-10 w-72 h-72 rounded-full bg-blue-100/40 blur-3xl" />
              <div className="relative grid grid-cols-5 gap-3">
                {pipelineStages.map((stage, i) => (
                  <div key={stage.name} className="bg-slate-100/70 rounded-2xl border border-slate-100 p-3 min-h-[260px] flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">{stage.name}</span>
                      <span className="text-[10px] font-bold text-slate-400">{stage.count}</span>
                    </div>
                    <div className="space-y-2 flex-1">
                      {i === 0 && (
                        <>
                          <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-2.5">
                            <div className="text-[11px] font-bold text-slate-800">Pixel Studio</div>
                            <div className="text-[9px] text-slate-400 mt-0.5">Web Design · Score 88</div>
                          </div>
                          <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-2.5">
                            <div className="text-[11px] font-bold text-slate-800">Urban Dental</div>
                            <div className="text-[9px] text-slate-400 mt-0.5">Healthcare · Score 84</div>
                          </div>
                        </>
                      )}
                      {i === 1 && (
                        <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-2.5">
                          <div className="text-[11px] font-bold text-slate-800">Apex Logistics</div>
                          <div className="text-[9px] text-slate-400 mt-0.5">Logistics · Score 91</div>
                        </div>
                      )}
                      {i === 2 && (
                        <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-2.5">
                          <div className="text-[11px] font-bold text-slate-800">Bright Solar</div>
                          <div className="text-[9px] text-slate-400 mt-0.5">Energy · Score 79</div>
                        </div>
                      )}
                      {i === 3 && (
                        <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-2.5">
                          <div className="text-[11px] font-bold text-slate-800">Cafe Verde</div>
                          <div className="text-[9px] text-slate-400 mt-0.5">F&B · Score 86</div>
                        </div>
                      )}
                      {i === 4 && (
                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 shadow-sm p-2.5">
                          <div className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="w-3 h-3" />
                            <span className="text-[11px] font-bold text-slate-800">Metro Fit</span>
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5">Fitness · Score 93</div>
                        </div>
                      )}
                      <div className={`h-1.5 w-full rounded-full ${stage.color} opacity-80`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why us / trust */}
      <section id="stats" className="py-24 bg-slate-50 border-y border-slate-100 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4">
              Trusted by sales teams that never stop growing
            </h2>
            <p className="text-lg text-slate-500 leading-relaxed">
              Built for agencies, B2B teams, and founders who need a dependable stream of
              high-quality leads.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {trustPoints.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-100 shadow-sm"
              >
                <div className="text-emerald-500 bg-emerald-500/10 p-1.5 rounded-lg shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-slate-700">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section id="audience" className="py-24 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20 text-xs font-semibold tracking-wide uppercase mb-5">
              <Users className="w-3.5 h-3.5" /> Who it&apos;s for
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4">
              Built for teams that live and breathe growth
            </h2>
            <p className="text-lg text-slate-500 leading-relaxed">
              Agencies, sales teams, and founders all use LeadFinderAgent to replace manual
              prospecting with a repeatable, data-driven engine.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {audience.map(({ icon: Icon, title, description, points }) => (
              <div
                key={title}
                className="group relative bg-white rounded-2xl p-8 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/60 hover:-translate-y-1 transition-all duration-300"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20 mb-6">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-6">{description}</p>
                <ul className="space-y-2.5">
                  {points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 bg-slate-50 border-y border-slate-100 scroll-mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c1121f]/10 text-[#c1121f] border border-[#c1121f]/20 text-xs font-semibold tracking-wide uppercase mb-5">
              <HelpCircle className="w-3.5 h-3.5" /> FAQ
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4">
              Frequently asked questions
            </h2>
            <p className="text-lg text-slate-500 leading-relaxed">
              Everything you need to know before getting started.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={faq.q}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left"
                  >
                    <span className="text-base font-bold text-slate-900">{faq.q}</span>
                    <span className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-slate-50 border border-slate-100 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#c1121f]' : ''}`}>
                      <ChevronDown className="w-4 h-4" />
                    </span>
                  </button>
                  <div
                    className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 sm:px-6 pb-6 text-sm text-slate-500 leading-relaxed">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24 bg-white border-t border-slate-100 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-[#c1121f]/5 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-blue-100/40 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
            Ready to scale your business pipeline?
          </h2>
          <p className="text-lg text-slate-500 max-w-xl mx-auto mb-10 leading-relaxed">
            Start completely free today — uncover targeted pipelines and empower your workflows
            without any friction.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-sm font-semibold rounded-xl text-white bg-[#c1121f] hover:bg-[#a00d18] shadow-lg shadow-[#c1121f]/25 active:scale-[0.98] transition-all"
            >
              Get Started Now
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-sm font-semibold rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 active:scale-[0.98] transition-all"
            >
              View All Leads
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.png"
                alt="OptiMatrix"
                className="h-8 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <span className="text-base font-bold tracking-tight text-slate-900">
                Opti<span className="text-[#c1121f]">Matrix</span>
              </span>
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
              <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
              <a href="#intelligence" className="hover:text-slate-900 transition-colors">AI Analysis</a>
              <a href="#automation" className="hover:text-slate-900 transition-colors">Automation</a>
              <a href="#crm" className="hover:text-slate-900 transition-colors">CRM</a>
              <a href="#faq" className="hover:text-slate-900 transition-colors">FAQ</a>
              <Link href="/login" className="hover:text-slate-900 transition-colors">Sign in</Link>
              <Link href="/register" className="hover:text-slate-900 transition-colors">Get started</Link>
            </nav>

            <div className="text-xs text-slate-500 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Enterprise-grade encryption
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <span>© {new Date().getFullYear()} OptiMatrix · LeadFinderAgent Platform</span>
            <span className="flex items-center gap-2">
              GDPR-compliant · 99.9% uptime · Built for scale
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
