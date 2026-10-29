'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Globe,
  Download,
  ShieldCheck,
  Clock,
  Zap,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Database,
  Sparkles
} from 'lucide-react';
import api from '@/src/lib/axios';

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
  const [userLeadsCount, setUserLeadsCount] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          if (isMounted) setStats(data);
        }
      } catch {
        // Fallback silently
      }

      try {
        const res = await api.get('/leads?limit=1');
        if (isMounted && res.data && typeof res.data.total === 'number') {
          setUserLeadsCount(res.data.total);
        }
      } catch {
        // Auth session or backend unreachable
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const trustPoints = [
    {
      icon: CheckCircle2,
      text: 'No credit card required to start',
      color: 'text-emerald-600',
    },
    {
      icon: Clock,
      text: 'Real-time data, always fresh',
      color: 'text-blue-600',
    },
    {
      icon: ShieldCheck,
      text: 'GDPR-compliant data handling',
      color: 'text-indigo-600',
    },
    {
      icon: Zap,
      text: '99.9% uptime guarantee',
      color: 'text-amber-600',
    },
  ];

  const features = [
    {
      icon: Search,
      title: 'Google Maps Search',
      description:
        'Automatically discover local businesses from Google Maps and regional directories using smart category filters and geo-targeting.',
      href: '/dashboard/search',
      actionText: 'Start Map Search',
      iconColor: 'bg-blue-50 text-blue-600 border-blue-200',
    },
    {
      icon: Globe,
      title: 'Website Analysis',
      description:
        'Perform deep crawling on target websites to accurately extract active contact details and find valuable outreach signals.',
      href: '/dashboard/leads',
      actionText: 'View Discovered Leads',
      iconColor: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    },
    {
      icon: Download,
      title: 'Instant Data Export',
      description:
        'Download fresh leads instantly into clean CSV or Excel formats, structured and ready for any CRM or email platform.',
      href: '/dashboard/leads',
      actionText: 'Export Lead Records',
      iconColor: 'bg-purple-50 text-purple-600 border-purple-200',
    },
  ];

  const reasons = [
    {
      icon: Zap,
      title: '10× Faster Prospecting',
      description:
        'Bypass hours of tedious manual discovery. Build enterprise-scale prospecting pipelines in fractions of the time.',
      accent: 'text-blue-600 bg-blue-50 border-blue-100',
    },
    {
      icon: CheckCircle2,
      title: 'Verified Accurate Contact Data',
      description:
        'Access cleaned and validated contact data to help improve outreach quality and reduce email bounce rates. Only communicate verification capabilities that the product actually supports.',
      accent: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    },
    {
      icon: TrendingUp,
      title: 'Automated Profiling & Enrichment',
      description:
        'Every generated lead receives available context and enrichment signals to make prospecting more informed and efficient.',
      accent: 'text-purple-600 bg-purple-50 border-purple-100',
    },
  ];

  return (
    <div className="w-full space-y-6 sm:space-y-8 pb-10">
      {/* =========================================================================
          1. HERO SECTION (Full-Width, Compact, Minimal & Action-Focused)
      ========================================================================= */}
      <section className="relative w-full rounded-2xl border border-gray-200/90 bg-white p-6 sm:p-8 lg:p-10 shadow-xs">
        <div className="max-w-4xl space-y-4">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Next-Gen Lead Generation</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight">
            Find Your Next 1 Million Leads{' '}
            <span className="text-blue-600">in Just 10 Minutes</span>
          </h1>

          {/* Description */}
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-3xl">
            LeadFinder automatically discovers, analyzes, and organizes high-intent business leads from Google Maps and business directories—keeping your pipeline constantly full.
          </p>

          {/* CTA Buttons & Status */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/dashboard/search"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-700 shadow-sm active:scale-[0.98] transition-all"
            >
              <Search className="w-4 h-4" />
              Start Finding Leads
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/dashboard/leads"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 shadow-2xs active:scale-[0.98] transition-all"
            >
              <Database className="w-4 h-4 text-gray-500" />
              View All Leads
            </Link>

            {userLeadsCount !== null && userLeadsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {userLeadsCount.toLocaleString()} Leads in Database
              </span>
            )}
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. PRODUCT VALUE AND TRUST INDICATORS (Responsive Full Width Grid)
      ========================================================================= */}
      <section aria-label="Trust Indicators" className="w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full">
          {trustPoints.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-200/80 bg-white shadow-2xs hover:border-gray-300 transition-colors"
              >
                <div className={`p-2.5 rounded-lg bg-gray-50 shrink-0 ${item.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-gray-800 leading-snug">
                  {item.text}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          3. ADVANCED PLATFORM CAPABILITIES (Full Width 3-Card Grid)
      ========================================================================= */}
      <section className="w-full space-y-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
            Advanced Platform Capabilities
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Everything you need to automate prospecting, bypass friction, and close deals faster.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 w-full">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="group rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-2xs hover:border-gray-300 hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border ${feature.iconColor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-gray-100">
                  <Link
                    href={feature.href}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <span>{feature.actionText}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          4. WHY CHOOSE LEADFINDER PRO? (Full Width 3-Column Layout)
      ========================================================================= */}
      <section className="w-full space-y-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
            Why Choose LeadFinder Pro?
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Engineered to give your sales and marketing teams an undeniable competitive advantage.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 w-full">
          {reasons.map((reason, index) => {
            const Icon = reason.icon;
            return (
              <div
                key={index}
                className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-2xs flex flex-col space-y-3"
              >
                <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border ${reason.accent}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900">
                    {reason.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1.5 leading-relaxed">
                    {reason.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          5. FINAL CONVERSION SECTION (Full Width Minimal Banner)
      ========================================================================= */}
      <section className="w-full rounded-2xl border border-gray-200 bg-gradient-to-r from-blue-50/70 via-white to-blue-50/40 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-2xs">
        <div className="space-y-1 max-w-2xl">
          <h2 className="text-base sm:text-lg font-bold text-gray-900">
            Ready to Scale Your Business Pipeline?
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            Start completely free today — uncover targeted pipelines and empower your workflows without friction.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Link
            href="/dashboard/search"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-700 shadow-sm active:scale-[0.98] transition-all"
          >
            Get Started Now
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/dashboard/leads"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 shadow-2xs active:scale-[0.98] transition-all"
          >
            <Database className="w-3.5 h-3.5 text-gray-500" />
            View All Leads
          </Link>
        </div>
      </section>
    </div>
  );
}
