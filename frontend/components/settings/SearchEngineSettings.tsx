'use client';

import React from 'react';
import { Search, Wand2, ShieldCheck, Gavel, Database, Zap } from 'lucide-react';

const flowSteps = [
  {
    id: 1,
    title: 'Discover Lead',
    description: 'Searches geographic areas using Google Maps API and deep-crawls websites using Playwright.',
    icon: Search,
    gradient: 'from-blue-500 to-cyan-400',
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-100'
  },
  {
    id: 2,
    title: 'Normalize Data',
    description: 'Standardizes URLs, formats phone numbers, and cleans up raw extracted data points.',
    icon: Wand2,
    gradient: 'from-indigo-500 to-purple-400',
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    border: 'border-indigo-100'
  },
  {
    id: 3,
    title: 'Validate Quality',
    description: 'Checks domain accessibility, verifies email MX records, and validates phone structures.',
    icon: ShieldCheck,
    gradient: 'from-purple-500 to-fuchsia-400',
    bg: 'bg-purple-50',
    text: 'text-purple-600',
    border: 'border-purple-100'
  },
  {
    id: 4,
    title: 'AI Decision',
    description: 'Applies AI logic to explicitly Accept or Reject the lead based on its overall quality score.',
    icon: Gavel,
    gradient: 'from-pink-500 to-rose-400',
    bg: 'bg-pink-50',
    text: 'text-pink-600',
    border: 'border-pink-100'
  },
  {
    id: 5,
    title: 'Secure Save',
    description: 'Persists accepted leads into the database with their complete metadata and source origins.',
    icon: Database,
    gradient: 'from-rose-500 to-orange-400',
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    border: 'border-rose-100'
  },
  {
    id: 6,
    title: 'Realtime Push',
    description: 'Pushes the final lead states instantly to your active dashboard using WebSocket events.',
    icon: Zap,
    gradient: 'from-amber-500 to-yellow-400',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-100'
  }
];

export default function SearchEngineSettings() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10 max-w-5xl mx-auto">
      <div className="text-center sm:text-left">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Search Engine Architecture</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl mx-auto sm:mx-0">
          Understanding the core pipeline. This represents the autonomous state machine our agent uses to process, filter, and deliver high-quality leads.
        </p>
      </div>

      <div className="relative mt-12 mb-16">
        {/* Continuous Connection Line */}
        <div className="absolute left-[39px] lg:left-1/2 top-4 bottom-4 w-1 bg-gradient-to-b from-blue-100 via-purple-100 to-amber-100 lg:-translate-x-1/2 rounded-full hidden sm:block" />
        
        <div className="space-y-8 sm:space-y-16">
          {flowSteps.map((step, index) => {
            const Icon = step.icon;
            const isEven = index % 2 === 0;

            return (
              <div key={step.id} className="relative flex flex-col lg:flex-row items-center justify-between group">
                
                {/* Left Side Content (Desktop) */}
                <div className={`w-full lg:w-[45%] pl-20 sm:pl-24 lg:pl-0 ${isEven ? 'lg:pr-12 lg:text-right' : 'lg:order-2 lg:pl-12 lg:text-left'}`}>
                  <div className={`bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-gray-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative overflow-hidden ${isEven ? 'lg:origin-right' : 'lg:origin-left'}`}>
                    <div className={`absolute top-0 ${isEven ? 'right-0' : 'left-0'} w-1 h-full bg-gradient-to-b ${step.gradient}`}></div>
                    
                    <h3 className="text-base font-bold text-gray-900 mb-2 flex flex-col sm:flex-row items-start sm:items-center gap-3 lg:inline-flex lg:flex-row">
                      {!isEven && <span className={`text-[10px] font-black px-2 py-1 rounded-md ${step.bg} ${step.text} uppercase tracking-wider hidden lg:inline-block`}>Step {step.id}</span>}
                      {step.title}
                      {isEven && <span className={`text-[10px] font-black px-2 py-1 rounded-md ${step.bg} ${step.text} uppercase tracking-wider hidden lg:inline-block`}>Step {step.id}</span>}
                      {/* Mobile Step Badge */}
                      <span className={`text-[10px] font-black px-2 py-1 rounded-md ${step.bg} ${step.text} uppercase tracking-wider lg:hidden`}>Step {step.id}</span>
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>

                {/* Center Node (Icon) */}
                <div className="absolute left-0 lg:left-1/2 lg:-translate-x-1/2 flex items-center justify-center z-10 w-20 h-20">
                  <div className={`w-14 h-14 rounded-2xl bg-white border-4 ${step.border} shadow-sm flex items-center justify-center relative group-hover:scale-110 transition-transform duration-300`}>
                    <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${step.gradient} opacity-10 group-hover:opacity-20 transition-opacity`}></div>
                    <Icon className={`w-6 h-6 bg-gradient-to-br ${step.gradient} text-transparent bg-clip-text relative z-10`} />
                  </div>
                </div>

                {/* Right Side Empty Space (Desktop) */}
                <div className={`hidden lg:block w-[45%] ${isEven ? 'lg:order-2' : ''}`} />

              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 bg-white border border-gray-200 shadow-sm rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-green-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10">
          <h3 className="text-lg font-bold text-gray-900">Pipeline is Active & Secure</h3>
          <p className="text-sm text-gray-500 mt-1">
            No further configuration is required. The Lead Finder Agent manages this pipeline autonomously.
          </p>
        </div>
        <div className="relative z-10 shrink-0">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-100 rounded-full shadow-sm">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
            <span className="text-xs font-bold text-green-700 uppercase tracking-wider">System Optimal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
