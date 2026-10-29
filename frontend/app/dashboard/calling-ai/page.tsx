'use client';

import { useState } from 'react';
import { PageHeader } from '@/src/components/common/PageHeader';
import {
  Phone,
  Bot,
  Mic,
  AudioWaveform,
  PhoneIncoming,
  PhoneOutgoing,
  AudioLines,
  Languages,
  BarChart3,
  Database,
  UserCheck,
  PhoneCall,
  BadgeCheck,
  Brain,
  TrendingUp,
  Headphones,
  CalendarCheck,
  ClipboardList,
  BellRing,
  Star,
  HeartPulse,
  FileAudio,
  FileText,
  RefreshCw,
  Code2,
  Zap,
  Network,
  Radio,
  Sparkles,
  ShieldCheck,
  Lock,
  KeyRound,
  FileClock,
  Activity,
  ChevronDown,
  Rocket,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

const features = [
  { icon: Bot, title: 'AI Voice Assistant', desc: 'Natural conversations powered by AI.' },
  { icon: PhoneIncoming, title: 'Inbound Call Handling', desc: 'Automatically answer customer calls.' },
  { icon: PhoneOutgoing, title: 'Outbound Calling', desc: 'Launch AI-powered calling campaigns.' },
  { icon: Mic, title: 'Speech To Text', desc: 'Real-time speech transcription.' },
  { icon: AudioLines, title: 'Text To Speech', desc: 'Natural AI voice generation.' },
  { icon: Languages, title: 'Multi Language Support', desc: 'Support multiple languages.' },
  { icon: BarChart3, title: 'Call Analytics', desc: 'Conversation insights and metrics.' },
  { icon: Database, title: 'CRM Integration', desc: 'Automatically sync customer interactions.' },
];

const workflow = [
  { icon: UserCheck, title: 'Lead Selected', desc: 'A lead is chosen from the CRM and queued for outreach.' },
  { icon: PhoneCall, title: 'AI Places Call', desc: 'The AI agent initiates an automated outbound call.' },
  { icon: PhoneIncoming, title: 'Customer Answers', desc: 'The call connects and the customer is greeted.' },
  { icon: MessageCircle, title: 'Conversation Starts', desc: 'The AI engages in a natural, flowing dialogue.' },
  { icon: Brain, title: 'Intent Detection', desc: 'The agent understands the customer intent in real time.' },
  { icon: Bot, title: 'AI Responds', desc: 'Context-aware responses guide the conversation forward.' },
  { icon: BadgeCheck, title: 'Lead Qualified', desc: 'The conversation is scored and the lead is qualified.' },
  { icon: Database, title: 'CRM Updated', desc: 'Outcomes, notes, and data are synced back to the CRM.' },
];

const useCases = [
  { icon: TrendingUp, title: 'Sales' },
  { icon: Headphones, title: 'Customer Support' },
  { icon: CalendarCheck, title: 'Appointment Booking' },
  { icon: UserCheck, title: 'Lead Qualification' },
  { icon: ClipboardList, title: 'Survey Calls' },
  { icon: BellRing, title: 'Payment Reminders' },
  { icon: Star, title: 'Feedback Collection' },
  { icon: HeartPulse, title: 'Healthcare Follow-up' },
];

const futureFeatures = [
  { icon: PhoneOutgoing, title: 'Outbound Campaigns' },
  { icon: PhoneIncoming, title: 'Inbound Reception' },
  { icon: BarChart3, title: 'Real-time Dashboard' },
  { icon: FileAudio, title: 'Call Recording' },
  { icon: Brain, title: 'AI Sentiment Analysis' },
  { icon: AudioLines, title: 'Voice Cloning' },
  { icon: FileText, title: 'Conversation Summary' },
  { icon: ClipboardList, title: 'Auto CRM Notes' },
  { icon: RefreshCw, title: 'Smart Follow-up' },
];

const techStack = [
  { icon: Code2, title: 'Python' },
  { icon: Zap, title: 'FastAPI' },
  { icon: Database, title: 'MongoDB' },
  { icon: Brain, title: 'AI' },
  { icon: Mic, title: 'Whisper' },
  { icon: AudioLines, title: 'Piper TTS' },
  { icon: Network, title: 'Socket.IO' },
  { icon: Radio, title: 'WebSocket' },
  { icon: Sparkles, title: 'LLM' },
];

const security = [
  { icon: ShieldCheck, title: 'Role Based Access' },
  { icon: Lock, title: 'Encrypted Conversations' },
  { icon: KeyRound, title: 'Secure Authentication' },
  { icon: FileClock, title: 'Audit Logs' },
  { icon: Activity, title: 'Activity Monitoring' },
];

const faqs = [
  {
    q: 'What is Calling AI?',
    a: 'Calling AI is an enterprise AI voice platform that automates outbound and inbound phone conversations, enabling intelligent calling workflows, lead qualification, and automated business communication.',
  },
  {
    q: 'How does AI Calling work?',
    a: 'The AI agent places or answers calls, converts speech to text in real time, understands customer intent with an LLM, and responds with natural-sounding AI-generated speech while the conversation is logged and synced to your CRM.',
  },
  {
    q: 'Will outbound campaigns be supported?',
    a: 'Yes. Outbound calling campaigns are part of the planned roadmap, allowing you to launch AI-powered call outreach across large lead lists with intelligent conversation handling.',
  },
  {
    q: 'Can it integrate with CRM?',
    a: 'Yes. Calling AI is designed to automatically sync conversations, call outcomes, and notes with your CRM so every interaction is tracked without manual data entry.',
  },
  {
    q: 'Does it support multiple languages?',
    a: 'Yes. Multi-language support is a core planned capability, enabling the AI agent to handle conversations in multiple languages through speech recognition and natural voice generation.',
  },
  {
    q: 'Can calls be analyzed automatically?',
    a: 'Yes. Call analytics and AI sentiment analysis are planned features that will surface conversation insights, quality metrics, and actionable intelligence from every call.',
  },
];

const sectionTitle = 'text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white';
const sectionDesc = 'text-slate-500 dark:text-slate-400 mt-2';

export default function CallingAIPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="max-w-7xl mx-auto flex flex-col min-h-[calc(100vh-8rem)] pb-12">
      <div className="flex-none mb-8">
        <PageHeader
          breadcrumbs={[{ label: 'Calling AI Agent' }]}
          title="Calling AI Agent"
          description="Enterprise AI Voice Calling Platform for intelligent outbound and inbound voice automation."
        />
      </div>

      {/* Hero */}
      <section className="mb-12">
        <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 p-8 lg:p-12 items-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-xs font-bold tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                Next-Gen Voice Automation
              </div>
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight text-slate-900">
                AI Voice Automation
              </h2>
              <p className="text-lg text-slate-500 leading-relaxed">
                Build intelligent voice workflows capable of handling customer conversations, lead qualification,
                appointment booking, follow-ups, and automated business communication.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                {['Human-like Conversations', '24/7 Availability', 'CRM Ready'].map((chip) => (
                  <span
                    key={chip}
                    className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-600"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Illustration placeholder */}
            <div className="relative flex items-center justify-center min-h-[300px]">
              <div className="absolute inset-8 rounded-[2rem] bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-slate-200/80" />
              <div className="relative grid grid-cols-2 gap-5 w-full max-w-sm p-6">
                <div className="p-6 rounded-2xl bg-white shadow-md shadow-slate-200/60 border border-slate-100 flex flex-col items-center gap-3 animate-in fade-in duration-700">
                  <div className="p-4 rounded-2xl bg-blue-100 text-blue-600">
                    <Phone className="w-8 h-8" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Calling</span>
                </div>
                <div className="p-6 rounded-2xl bg-white shadow-md shadow-slate-200/60 border border-slate-100 flex flex-col items-center gap-3 animate-in fade-in duration-700 delay-100">
                  <div className="p-4 rounded-2xl bg-indigo-100 text-indigo-600">
                    <Bot className="w-8 h-8" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">AI Agent</span>
                </div>
                <div className="p-6 rounded-2xl bg-white shadow-md shadow-slate-200/60 border border-slate-100 flex flex-col items-center gap-3 animate-in fade-in duration-700 delay-200">
                  <div className="p-4 rounded-2xl bg-purple-100 text-purple-600">
                    <Mic className="w-8 h-8" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Listening</span>
                </div>
                <div className="p-6 rounded-2xl bg-white shadow-md shadow-slate-200/60 border border-slate-100 flex flex-col items-center gap-3 animate-in fade-in duration-700 delay-300">
                  <div className="p-4 rounded-2xl bg-emerald-100 text-emerald-600">
                    <AudioWaveform className="w-8 h-8" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Speaking</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="mb-12">
        <div className="mb-8">
          <h2 className={sectionTitle}>Core Capabilities</h2>
          <p className={sectionDesc}>Everything needed to run intelligent AI-powered phone conversations.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="p-3 rounded-xl bg-blue-50 text-blue-600 w-fit mb-4 group-hover:scale-110 transition-transform duration-300">
                <Icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-900 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="mb-12">
        <div className="mb-8">
          <h2 className={sectionTitle}>How It Works</h2>
          <p className={sectionDesc}>A fully automated voice workflow from lead to CRM.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {workflow.map(({ icon: Icon, title, desc }, index) => (
            <div key={title} className="relative">
              <div className="h-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col relative overflow-hidden">
                <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-slate-100 text-slate-600">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-black text-slate-400 tracking-widest">STEP {index + 1}</span>
                </div>
                <h3 className="font-bold text-slate-900 mb-1.5">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
              {index < workflow.length - 1 && (
                <div className="hidden lg:flex absolute -right-5 top-1/2 -translate-y-1/2 z-10 text-slate-300 pointer-events-none">
                  <ChevronDown className="w-5 h-5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="mb-12">
        <div className="mb-8">
          <h2 className={sectionTitle}>Use Cases</h2>
          <p className={sectionDesc}>Deploy AI voice agents across every part of your business.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {useCases.map(({ icon: Icon, title }) => (
            <div
              key={title}
              className="group flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-300"
            >
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                <Icon className="w-5 h-5" />
              </div>
              <span className="font-semibold text-slate-800 text-sm">{title}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Future Features */}
      <section className="mb-12">
        <div className="mb-8">
          <h2 className={sectionTitle}>Future Features</h2>
          <p className={sectionDesc}>A glimpse into the Calling AI product roadmap.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {futureFeatures.map(({ icon: Icon, title }) => (
            <div
              key={title}
              className="flex items-center gap-3 bg-slate-50/80 border border-slate-200 rounded-2xl px-5 py-4 shadow-sm"
            >
              <Icon className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="font-medium text-slate-700 text-sm">{title}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Coming Soon */}
      <section className="mb-12">
        <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 shadow-xl text-center p-12 lg:p-16">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex flex-col items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
              <Rocket className="w-10 h-10 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight text-white">Calling AI Agent</h2>
              <span className="inline-flex px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-sm font-bold tracking-wide uppercase">
                Coming Soon
              </span>
            </div>
            <p className="text-slate-300 max-w-xl text-lg leading-relaxed">
              The AI Calling platform is currently under development and will be available in an upcoming release.
            </p>
            <button
              type="button"
              disabled
              className="px-8 py-3.5 rounded-2xl bg-white/10 border border-white/20 text-white font-semibold cursor-not-allowed opacity-60"
            >
              Coming Soon
            </button>
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="mb-12">
        <div className="mb-8">
          <h2 className={sectionTitle}>Technology Stack</h2>
          <p className={sectionDesc}>Powered by a modern, scalable voice AI architecture.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {techStack.map(({ icon: Icon, title }) => (
            <div
              key={title}
              className="flex flex-col items-center gap-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
            >
              <Icon className="w-7 h-7 text-blue-600" />
              <span className="font-bold text-slate-800 text-sm text-center">{title}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section className="mb-12">
        <div className="mb-8">
          <h2 className={sectionTitle}>Enterprise Security</h2>
          <p className={sectionDesc}>Built for compliance, privacy, and enterprise trust.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {security.map(({ icon: Icon, title }) => (
            <div
              key={title}
              className="flex flex-col items-center gap-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center"
            >
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
                <Icon className="w-6 h-6" />
              </div>
              <span className="font-bold text-slate-800 text-sm">{title}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <div className="mb-8">
          <h2 className={sectionTitle}>Frequently Asked Questions</h2>
          <p className={sectionDesc}>Answers to the most common questions about the Calling AI platform.</p>
        </div>
        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div
                key={faq.q}
                className={cn(
                  'bg-white border rounded-2xl shadow-sm transition-colors duration-300',
                  isOpen ? 'border-blue-200' : 'border-slate-200'
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-bold text-slate-900 text-sm lg:text-base">{faq.q}</span>
                  <ChevronDown
                    className={cn(
                      'w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300',
                      isOpen && 'rotate-180 text-blue-500'
                    )}
                  />
                </button>
                <div
                  className={cn(
                    'overflow-hidden transition-all duration-300',
                    isOpen ? 'max-h-48' : 'max-h-0'
                  )}
                >
                  <p className="px-6 pb-5 text-sm text-slate-500 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
