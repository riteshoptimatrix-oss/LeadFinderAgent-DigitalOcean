'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Globe,
  Mail,
  Phone,
  Shield,
  Clock,
  Zap,
  CheckCircle,
  ArrowRight,
  TrendingUp,
  Database,
  Download
} from 'lucide-react';

interface DashboardStats {
  totalLeads: number;
  websitesFound: number;
  emailsFound: number;
  phoneNumbers: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalLeads: 0,
    websitesFound: 0,
    emailsFound: 0,
    phoneNumbers: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      icon: <Search className="w-5 h-5" />,
      title: 'Google Maps Search',
      description: 'Automatically discover local businesses from Google Maps and regional directories using smart category filters and geo-targeting.',
      color: 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
    },
    {
      icon: <Globe className="w-5 h-5" />,
      title: 'Website Analysis',
      description: 'Perform deep crawling on target websites to accurately extract active contact details and find valuable outreach signals.',
      color: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
    },
    {
      icon: <Download className="w-5 h-5" />,
      title: 'Instant Data Export',
      description: 'Download your fresh leads instantly into clean CSV or Excel formats, perfectly structured and ready for any CRM or email platform.',
      color: 'bg-purple-500/10 text-purple-500 border border-purple-500/20',
    },
  ];

  const trustPoints = [
    { icon: <CheckCircle className="w-4 h-4" />, text: 'No credit card required to start' },
    { icon: <Clock className="w-4 h-4" />, text: 'Real-time data, always fresh' },
    { icon: <Shield className="w-4 h-4" />, text: 'GDPR-compliant data handling' },
    { icon: <Zap className="w-4 h-4" />, text: '99.9% uptime guarantee' },
  ];

  return (
    <div className="min-h-screen bg-background antialiased selection:bg-[var(--accent)] selection:text-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-28 pb-20 border-b border-[var(--border)] bg-gradient-to-b from-transparent to-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 text-sm font-medium rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 mb-6 backdrop-blur-sm">
              <Zap className="w-4 h-4 fill-current" /> Next-Gen Lead Generation
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground mb-6 bg-gradient-to-r from-foreground via-foreground to-muted bg-clip-text">
              Find your next 1Million Leads <span className="text-[var(--accent)]">in Just 10 Minutes</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
              LeadFinder automatically discovers, analyzes, and organizes high-intent business leads from Google Maps and business directories—keeping your pipeline constantly full.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/dashboard/search"
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold rounded-xl text-white bg-[var(--accent)] hover:bg-blue-700 shadow-md shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/20 active:scale-[0.98] transition-all"
              >
                Start Finding Leads
                <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/dashboard/leads"
                className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold rounded-xl border border-[var(--border)] text-foreground bg-card hover:bg-[var(--hover)] active:scale-[0.98] transition-all"
              >
                View All Leads
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">
              Advanced Platform Capabilities
            </h2>
            <p className="text-lg text-muted">
              Everything you need to automate prospecting, bypass friction, and close deals faster.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group relative bg-card rounded-2xl p-8 border border-[var(--border)] hover:border-muted-foreground/20 hover:shadow-xl hover:shadow-muted/5 transition-all duration-300"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${feature.color} mb-6 shadow-sm`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3 group-hover:text-[var(--accent)] transition-colors">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Points */}
      <section className="py-12 bg-muted/30 border-y border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {trustPoints.map((point, index) => (
              <div
                key={index}
                className="flex items-center justify-center lg:justify-start gap-3 p-3 rounded-xl bg-card border border-[var(--border)] shadow-sm"
              >
                <div className="text-emerald-500 bg-emerald-500/10 p-1.5 rounded-lg">
                  {point.icon}
                </div>
                <span className="text-xs sm:text-sm font-semibold text-foreground">
                  {point.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why LeadFinder Pro */}
      <section className="py-24 bg-gradient-to-b from-transparent to-muted/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">
              Why Choose LeadFinder Pro?
            </h2>
            <p className="text-lg text-muted">
              Engineered to give your sales and marketing teams an undeniable competitive advantage.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-10">
            <div className="text-center flex flex-col items-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-500 mb-6 border border-blue-500/20 shadow-inner">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-3">
                10× Faster Prospecting
              </h3>
              <p className="text-sm text-muted leading-relaxed max-w-sm">
                Bypass hours of tedious manual discovery. Build enterprise-scale prospecting pipelines in fractions of the time.
              </p>
            </div>
            <div className="text-center flex flex-col items-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 mb-6 border border-emerald-500/20 shadow-inner">
                <CheckCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-3">
                Verified Accurate Contact Data
              </h3>
              <p className="text-sm text-muted leading-relaxed max-w-sm">
                Access highly scrubbed, clean data pools that protect your domain rating and dramatically minimize email bounce rates.
              </p>
            </div>
            <div className="text-center flex flex-col items-center col-span-2 sm:col-span-2 md:col-span-1">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-500 mb-6 border border-purple-500/20 shadow-inner">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-3">
                Automated Profiling & Enrichment
              </h3>
              <p className="text-sm text-muted leading-relaxed max-w-sm">
                Every generated lead receives instant context enrichment, injecting critical dynamic signals directly into your dataset.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative py-24 bg-[var(--accent)] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_50%)]"></div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
            Ready to scale your business pipeline?
          </h2>
          <p className="text-lg text-blue-100/90 max-w-xl mx-auto mb-10">
            Start completely free today — uncover targeted pipelines and empower your workflows without any friction.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/dashboard/search"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-sm font-semibold rounded-xl text-[var(--accent)] bg-white hover:bg-neutral-50 shadow-lg shadow-black/10 active:scale-[0.98] transition-all"
            >
              Get Started Now
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
            <Link
              href="/dashboard/leads"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-sm font-semibold rounded-xl border border-white/30 text-white bg-white/5 hover:bg-white/10 active:scale-[0.98] transition-all"
            >
              View All Leads
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

