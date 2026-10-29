'use client';

import React from 'react';
import { FileText, Filter, BrainCircuit, SmilePlus, Award, Send } from 'lucide-react';

const flowSteps = [
  {
    id: 1,
    title: 'DOM Extraction',
    description: 'Captures raw text, HTML structure, and metadata directly from the lead\'s website using our headless scraper.',
    icon: FileText,
    gradient: 'from-emerald-500 to-teal-400',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-100'
  },
  {
    id: 2,
    title: 'Contextual Parsing',
    description: 'Strips away boilerplate code and navigation menus to isolate the core business description and context.',
    icon: Filter,
    gradient: 'from-cyan-500 to-blue-400',
    bg: 'bg-cyan-50',
    text: 'text-cyan-600',
    border: 'border-cyan-100'
  },
  {
    id: 3,
    title: 'Deep Data Mining',
    description: 'Gemini AI scans the text to extract hidden email addresses, founder names, and social media footprints.',
    icon: BrainCircuit,
    gradient: 'from-violet-500 to-purple-400',
    bg: 'bg-violet-50',
    text: 'text-violet-600',
    border: 'border-violet-100'
  },
  {
    id: 4,
    title: 'Sentiment & Tone',
    description: 'Analyzes the website language to determine if the business is B2B, B2C, professional, or casual.',
    icon: SmilePlus,
    gradient: 'from-pink-500 to-rose-400',
    bg: 'bg-pink-50',
    text: 'text-pink-600',
    border: 'border-pink-100'
  },
  {
    id: 5,
    title: 'Quality Profiling',
    description: 'Calculates a Lead Score (0-100) based on data completeness, contact availability, and relevance.',
    icon: Award,
    gradient: 'from-amber-500 to-orange-400',
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-100'
  },
  {
    id: 6,
    title: 'Pipeline Integration',
    description: 'Outputs a perfectly structured JSON object and injects the intelligent lead directly into your CRM.',
    icon: Send,
    gradient: 'from-blue-500 to-indigo-400',
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-100'
  }
];

export default function AIAnalysisSettings() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10 max-w-5xl mx-auto">
      <div className="text-center sm:text-left">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">AI Analysis Architecture</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl mx-auto sm:mx-0">
          Understanding our intelligence layer. This represents how raw website data is autonomously transformed into structured, scored leads using Gemini AI.
        </p>
      </div>

      <div className="relative mt-12 mb-16">
        {/* Continuous Connection Line */}
        <div className="absolute left-[39px] lg:left-1/2 top-4 bottom-4 w-1 bg-gradient-to-b from-emerald-100 via-violet-100 to-blue-100 lg:-translate-x-1/2 rounded-full hidden sm:block" />
        
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
        <div className="absolute right-0 top-0 w-64 h-64 bg-violet-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10">
          <h3 className="text-lg font-bold text-gray-900">AI Logic is Active</h3>
          <p className="text-sm text-gray-500 mt-1">
            Gemini AI models are actively configured for this workspace. No manual intervention is needed.
          </p>
        </div>
        <div className="relative z-10 shrink-0">
          <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 border border-violet-100 rounded-full shadow-sm">
            <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.6)]"></div>
            <span className="text-xs font-bold text-violet-700 uppercase tracking-wider">Models Running</span>
          </div>
        </div>
      </div>
    </div>
  );
}
