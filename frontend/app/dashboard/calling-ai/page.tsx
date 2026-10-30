'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
  Play,
  Pause,
  Volume2,
  VolumeX,
  PhoneOff,
  Sliders,
  Settings,
  Layers,
  Flame,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Send,
  Search,
  Users,
  Clock,
  Gauge,
  Terminal,
  ChevronRight,
  Copy,
  Check,
  PhoneForwarded,
  SlidersHorizontal,
  Server,
  Cpu
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

// ==========================================
// PERSONAS & MOCK CALL DATA
// ==========================================

interface AgentPersona {
  id: string;
  name: string;
  role: string;
  voiceName: string;
  gender: 'Female' | 'Male';
  accent: string;
  energy: string;
  avatarBg: string;
  tagline: string;
  greeting: string;
  promptGuidance: string;
}

const PERSONAS: AgentPersona[] = [
  {
    id: 'sdr-alex',
    name: 'Alex Rivera',
    role: 'SDR Lead Qualifier',
    voiceName: 'Nova Neural (US)',
    gender: 'Female',
    accent: 'North American',
    energy: 'Energetic & Consultative',
    avatarBg: 'from-blue-600 to-indigo-600',
    tagline: 'Rapid inbound/outbound qualification with high conversion',
    greeting: "Hi there! This is Alex from LeadFlow AI. I noticed your team was looking into automated sales intelligence. Do you have two minutes to see if we can save your SDRs 15 hours a week?",
    promptGuidance: 'Identify decision maker, budget, timeline, and current lead gen bottlenecks.'
  },
  {
    id: 'closer-marcus',
    name: 'Marcus Vance',
    role: 'Executive Appointment Scheduler',
    voiceName: 'Orion Neural (US)',
    gender: 'Male',
    accent: 'Neutral Executive',
    energy: 'Polished & Direct',
    avatarBg: 'from-indigo-600 to-violet-600',
    tagline: 'High-ticket executive calendar booking & demo closer',
    greeting: "Hello! Marcus here calling from LeadFlow Solutions. I'm following up on the enterprise evaluation request your team submitted yesterday. Are you available for a 15-minute briefing this Thursday?",
    promptGuidance: 'Focus on executive pain points, lock in calendar time, handle scheduling friction.'
  },
  {
    id: 'support-elena',
    name: 'Elena Rostova',
    role: 'Customer Care & Retention Specialist',
    voiceName: 'Aria Neural (UK)',
    gender: 'Female',
    accent: 'British Received',
    energy: 'Empathetic & Calm',
    avatarBg: 'from-emerald-600 to-teal-600',
    tagline: '24/7 Tier-1 voice support with instantaneous ticket resolution',
    greeting: "Good afternoon! Thanks for connecting with LeadFlow Support. My name is Elena. How can I assist you with your workspace configuration today?",
    promptGuidance: 'De-escalate frustrations, diagnose account sync issues, initiate CRM trouble tickets.'
  },
  {
    id: 'renewal-sarah',
    name: 'Sarah Chen',
    role: 'Renewal & Payment Specialist',
    voiceName: 'Zephyr Neural (AU)',
    gender: 'Female',
    accent: 'Australian Professional',
    energy: 'Friendly & Solution-Oriented',
    avatarBg: 'from-amber-600 to-orange-600',
    tagline: 'Gentle renewal reminders, contract expansion & payment updates',
    greeting: "Hi! Sarah calling from LeadFlow Accounts. Hope your week is going well! I'm reaching out regarding your annual platform subscription renewal coming up next month.",
    promptGuidance: 'Highlight ROI metrics from past 12 months, present renewal incentives, secure confirmation.'
  }
];

interface TestLead {
  id: string;
  name: string;
  company: string;
  phone: string;
  title: string;
  intent: 'High' | 'Medium' | 'Cold';
  industry: string;
}

const TEST_LEADS: TestLead[] = [
  {
    id: 'lead-1',
    name: 'David Miller',
    company: 'Apex Digital Solutions',
    phone: '+1 (555) 234-8901',
    title: 'VP of Business Development',
    intent: 'High',
    industry: 'SaaS & Cloud Services'
  },
  {
    id: 'lead-2',
    name: 'Jessica Reynolds',
    company: 'Vanguard Health Group',
    phone: '+1 (555) 912-4450',
    title: 'Director of Patient Outreach',
    intent: 'High',
    industry: 'Healthcare & Telehealth'
  },
  {
    id: 'lead-3',
    name: 'Marcus Brody',
    company: 'Elevate Logistics Corp',
    phone: '+1 (555) 478-9032',
    title: 'Operations Manager',
    intent: 'Medium',
    industry: 'Supply Chain & Freight'
  },
  {
    id: 'lead-4',
    name: 'Custom Number / Lead',
    company: 'Live Sandbox Prospect',
    phone: '+1 (555) 000-TEST',
    title: 'Prospective Client',
    intent: 'High',
    industry: 'Enterprise Technology'
  }
];

interface TranscriptMessage {
  id: string;
  sender: 'ai' | 'customer';
  text: string;
  timestamp: string;
  latencyMs?: number;
  intentTag?: string;
  confidence?: number;
}

interface CampaignItem {
  id: string;
  name: string;
  persona: string;
  leadsCount: number;
  completedCount: number;
  status: 'Running' | 'Scheduled' | 'Completed' | 'Paused';
  connectionRate: string;
  qualificationRate: string;
  startedAt: string;
  activeAgents: number;
}

const MOCK_CAMPAIGNS: CampaignItem[] = [
  {
    id: 'camp-1',
    name: 'Q3 Inbound Demo Request Follow-Up',
    persona: 'Alex Rivera (SDR)',
    leadsCount: 650,
    completedCount: 524,
    status: 'Running',
    connectionRate: '68.4%',
    qualificationRate: '34.2%',
    startedAt: 'Today at 09:15 AM',
    activeAgents: 12
  },
  {
    id: 'camp-2',
    name: 'Enterprise MQL Cold Reactivation Wave',
    persona: 'Marcus Vance (Closer)',
    leadsCount: 1200,
    completedCount: 890,
    status: 'Running',
    connectionRate: '61.7%',
    qualificationRate: '28.9%',
    startedAt: 'Yesterday at 02:00 PM',
    activeAgents: 20
  },
  {
    id: 'camp-3',
    name: 'Annual Subscription Renewal Outreach',
    persona: 'Sarah Chen (Renewals)',
    leadsCount: 380,
    completedCount: 380,
    status: 'Completed',
    connectionRate: '79.2%',
    qualificationRate: '88.5%',
    startedAt: 'Sep 24, 2026',
    activeAgents: 0
  },
  {
    id: 'camp-4',
    name: 'Post-Webinar Attendees Follow-Up',
    persona: 'Alex Rivera (SDR)',
    leadsCount: 450,
    completedCount: 0,
    status: 'Scheduled',
    connectionRate: '-',
    qualificationRate: '-',
    startedAt: 'Tomorrow at 10:00 AM',
    activeAgents: 8
  }
];

const WORKFLOW_STEPS = [
  {
    step: 1,
    title: 'Lead Ingestion & Verification',
    badge: 'CRM Webhook',
    latency: '15ms',
    desc: 'Lead data, phone format validation (E.164), and TCPA Do-Not-Call registry checks are performed automatically.',
    technical: 'Validates DNC scrub, timezone curfew, and CRM contact metadata payload.'
  },
  {
    step: 2,
    title: 'SIP Trunking & Dial Dispatch',
    badge: 'Carrier SIP',
    latency: '85ms',
    desc: 'AI initiates carrier-grade outbound call using local phone number pools to maximize answer rates.',
    technical: 'Twilio / Telnyx SIP Trunking with STIR/SHAKEN A-level attestation.'
  },
  {
    step: 3,
    title: 'Real-time Voice Activity Detection',
    badge: 'Silero VAD',
    latency: '30ms',
    desc: 'Instant detection of human speech vs voicemail (Answering Machine Detection) with zero false triggers.',
    technical: 'Runs low-overhead 16kHz neural VAD to isolate voice onsets and interruptions.'
  },
  {
    step: 4,
    title: 'Streaming Speech to Text',
    badge: 'Whisper Large v3',
    latency: '140ms',
    desc: 'Audio chunks are converted to accurate, punctuation-rich text in real time with industry jargon recognition.',
    technical: 'Self-hosted Whisper v3 TensorRT engine running streaming multi-lingual ASR.'
  },
  {
    step: 5,
    title: 'LLM Intent & Conversation Engine',
    badge: 'Llama 3 70B / Groq',
    latency: '115ms',
    desc: 'Generates context-aware, goal-oriented responses following behavioral rules and company knowledge bases.',
    technical: 'Sub-150ms token stream with strict guardrails against hallucinations.'
  },
  {
    step: 6,
    title: 'Neural Speech Generation (TTS)',
    badge: 'Piper / Cartesia',
    latency: '160ms',
    desc: 'Converts generated response into lifelike, emotive audio with human breathing cues and natural prosody.',
    technical: 'Chunked audio packet streaming over WebSockets with 24kHz sample rate.'
  },
  {
    step: 7,
    title: 'BANT Scoring & Sentiment Tagging',
    badge: 'AI Qualification',
    latency: '45ms',
    desc: 'Automatically evaluates Budget, Authority, Need, and Timeline while monitoring prospect sentiment.',
    technical: 'Generates real-time 0-100 qualification score and emotion classification vector.'
  },
  {
    step: 8,
    title: 'Instant CRM Writeback & Webhooks',
    badge: 'HubSpot / Salesforce',
    latency: '20ms',
    desc: 'Full call audio recording, structured summary, action items, and calendar invites are auto-synced.',
    technical: 'Dispatches signed webhook events and writes structured timeline notes.'
  }
];

const FAQS = [
  {
    q: 'How does Calling AI achieve sub-500ms voice response latency?',
    a: 'Calling AI combines a low-overhead Voice Activity Detection (Silero VAD), streaming Speech-To-Text (Whisper Large v3 with TensorRT), accelerated LLM inference (sub-120ms token streams), and chunked neural Text-To-Speech (Cartesia / Piper). Audio packets begin streaming to the caller before the full sentence is even finished generating.'
  },
  {
    q: 'Can the AI handle interruptions when a prospect talks over it?',
    a: 'Yes! Full-duplex conversational audio allows the AI to immediately stop speaking within 150ms of detecting the customer speaking (barge-in support), acknowledging the interruption naturally just like a human SDR would.'
  },
  {
    q: 'How does the AI handle voicemails and answering machines?',
    a: 'The platform features real-time Answering Machine Detection (AMD). When an answering machine beep is detected, the AI can either leave a pre-configured personalized voicemail script or hang up immediately to conserve call minutes.'
  },
  {
    q: 'Is Calling AI compliant with TCPA and international calling regulations?',
    a: 'Absolutely. The platform enforces automatic TCPA Do-Not-Call (DNC) list scrubbing, respects local state calling curfew hours (e.g. 8 AM - 8 PM local prospect time), supports STIR/SHAKEN certified caller IDs, and logs auditable consent trails.'
  },
  {
    q: 'Can the AI transfer a live call to a human sales rep?',
    a: 'Yes. If a prospect reaches a high-intent threshold (e.g. "I want to sign up right now, can I talk to your senior advisor?"), the AI can initiate a warm live transfer (SIP REFER) directly to your AE’s phone or queue with a 5-second whisper summary.'
  },
  {
    q: 'How does it sync with my CRM and calendar?',
    a: 'Every call generates a timestamped audio recording, full diarized transcript, BANT qualification scorecard, and 3-bullet executive summary. If an appointment is agreed upon, the AI integrates with Google Calendar / Calendly to lock in the meeting.'
  }
];

type ActiveTab = 'studio' | 'campaigns' | 'personas' | 'workflow' | 'architecture' | 'faq';

export default function CallingAIPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio');
  const [selectedPersona, setSelectedPersona] = useState<AgentPersona>(PERSONAS[0]);
  const [selectedLead, setSelectedLead] = useState<TestLead>(TEST_LEADS[0]);
  
  // Call Simulator State
  const [callState, setCallState] = useState<'idle' | 'dialing' | 'ringing' | 'connected' | 'ended'>('idle');
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [voiceAudioEnabled, setVoiceAudioEnabled] = useState<boolean>(false);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [customReplyInput, setCustomReplyInput] = useState<string>('');
  const [isAiTyping, setIsAiTyping] = useState<boolean>(false);
  const [qualificationScore, setQualificationScore] = useState<number>(35);
  const [sentimentRate, setSentimentRate] = useState<number>(75);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number>(1);
  const [searchFaq, setSearchFaq] = useState<string>('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [copiedNote, setCopiedNote] = useState<boolean>(false);

  // Audio Waveform Animation values
  const [waveformBars, setWaveformBars] = useState<number[]>([30, 60, 45, 80, 50, 70, 40, 90, 65, 35, 75, 45]);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, isAiTyping]);

  // Call Timer
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Animated soundwave effect when connected or AI typing
  useEffect(() => {
    if (callState === 'connected' || isAiTyping) {
      const interval = setInterval(() => {
        setWaveformBars(
          Array.from({ length: 14 }, () => Math.floor(Math.random() * 70) + 15)
        );
      }, 120);
      return () => clearInterval(interval);
    } else {
      setWaveformBars(Array.from({ length: 14 }, () => 10));
    }
  }, [callState, isAiTyping]);

  // Format Duration seconds into mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Optional Native Web Speech API speech generator
  const speakText = (text: string) => {
    if (!voiceAudioEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = selectedPersona.gender === 'Female' ? 1.15 : 0.95;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Graceful fallback if speech synthesis is disabled or blocked
    }
  };

  // Start Call Flow
  const handleStartCall = () => {
    setCallState('dialing');
    setCallDuration(0);
    setTranscripts([]);
    setQualificationScore(40);
    setSentimentRate(78);

    setTimeout(() => {
      setCallState('ringing');
    }, 1200);

    setTimeout(() => {
      setCallState('connected');
      // AI initiates conversation with selected persona greeting
      const greetingMsg: TranscriptMessage = {
        id: 'msg-0',
        sender: 'ai',
        text: selectedPersona.greeting.replace('LeadFlow', 'LeadFlow AI'),
        timestamp: 'Just now',
        latencyMs: 145,
        intentTag: 'Intro & Hook',
        confidence: 99
      };
      setTranscripts([greetingMsg]);
      speakText(greetingMsg.text);
    }, 2800);
  };

  // End Call Flow
  const handleEndCall = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setCallState('ended');
    setQualificationScore((prev) => Math.min(100, prev + 25));
  };

  // Reset Call Flow
  const handleResetCall = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setCallState('idle');
    setCallDuration(0);
    setTranscripts([]);
    setQualificationScore(35);
  };

  // Send simulated customer answer and get AI response
  const handleCustomerReply = (replyText: string) => {
    if (!replyText.trim() || callState !== 'connected') return;

    const userMsg: TranscriptMessage = {
      id: `msg-${Date.now()}-user`,
      sender: 'customer',
      text: replyText.trim(),
      timestamp: formatTime(callDuration)
    };

    setTranscripts((prev) => [...prev, userMsg]);
    setCustomReplyInput('');
    setIsAiTyping(true);

    // Dynamic AI response logic
    setTimeout(() => {
      let aiResponse = '';
      let tag = 'Contextual Follow-Up';
      let scoreBoost = 15;

      const lower = replyText.toLowerCase();
      if (lower.includes('price') || lower.includes('cost') || lower.includes('pricing') || lower.includes('budget')) {
        aiResponse = "Our pricing is transparent and scalable, starting at $0.08 per completed conversational minute with unlimited concurrent channels. Compared to a standard $25/hr SDR dialer, companies typically cut customer acquisition cost by 62%. Would you like to review an ROI breakdown?";
        tag = 'Pricing Inquiry';
        scoreBoost = 20;
      } else if (lower.includes('demo') || lower.includes('meeting') || lower.includes('thursday') || lower.includes('schedule') || lower.includes('yes') || lower.includes('looking')) {
        aiResponse = "That sounds fantastic! I have an opening with our solutions architect this Thursday at 2:00 PM EST, or Friday morning at 10:30 AM EST. Which of those two slots works best for your calendar?";
        tag = 'Demo Booking Intent';
        scoreBoost = 30;
      } else if (lower.includes('crm') || lower.includes('hubspot') || lower.includes('salesforce') || lower.includes('integrate')) {
        aiResponse = "We offer bi-directional native integration with HubSpot, Salesforce, Pipedrive, and custom webhooks. All call recordings, transcripts, and qualification tags sync directly into your contact record within 3 seconds of call wrap-up.";
        tag = 'CRM Integration';
        scoreBoost = 15;
      } else if (lower.includes('not interested') || lower.includes('later') || lower.includes('busy')) {
        aiResponse = "I completely understand! Timing is everything. How about I shoot a quick 90-second case study to your inbox, and we reconnect next month when your team has more breathing room?";
        tag = 'Objection Handled';
        scoreBoost = 5;
      } else {
        aiResponse = `Got it, that makes total sense regarding your ${selectedLead.industry} workflow. Our voice agents are specifically tailored to automate that exact bottleneck so your team can focus exclusively on closing qualified prospects.`;
        tag = 'Value Proposition';
        scoreBoost = 12;
      }

      const aiMsg: TranscriptMessage = {
        id: `msg-${Date.now()}-ai`,
        sender: 'ai',
        text: aiResponse,
        timestamp: formatTime(callDuration + 2),
        latencyMs: Math.floor(Math.random() * 60) + 120,
        intentTag: tag,
        confidence: 97
      };

      setTranscripts((prev) => [...prev, aiMsg]);
      setIsAiTyping(false);
      setQualificationScore((prev) => Math.min(98, prev + scoreBoost));
      setSentimentRate((prev) => Math.min(96, prev + 5));
      speakText(aiResponse);
    }, 900);
  };

  const copySummaryNote = () => {
    const note = `[LeadFlow AI Call Summary]\nLead: ${selectedLead.name} (${selectedLead.company})\nAgent: ${selectedPersona.name}\nQualification Score: ${qualificationScore}/100\nKey Takeaways: Customer confirmed interest in AI-powered voice outreach. Qualified on BANT criteria.\nStatus: Meeting Scheduled.`;
    navigator.clipboard.writeText(note);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2000);
  };

  const filteredFaqs = useMemo(() => {
    if (!searchFaq.trim()) return FAQS;
    return FAQS.filter(
      (f) =>
        f.q.toLowerCase().includes(searchFaq.toLowerCase()) ||
        f.a.toLowerCase().includes(searchFaq.toLowerCase())
    );
  }, [searchFaq]);

  return (
    <div className="w-full flex flex-col pb-16">
      {/* Page Header */}
      <div className="flex-none mb-6">
        <PageHeader
          breadcrumbs={[{ label: 'Voice AI', href: '#' }, { label: 'Calling AI Agent Studio' }]}
          title="Calling AI Agent Studio"
          description="Next-generation autonomous voice platform for human-like outbound sales, inbound support, and automated CRM lead qualification."
        />

        {/* Live Engine Status Banner & Telemetry Bar */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-4 p-4 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 border border-indigo-800/40 text-white shadow-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 z-10">
              <div className="relative flex h-3.5 w-3.5 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-wide text-white">
                    Voice Engine Active · v2.4 Low-Latency
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold uppercase tracking-wider">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Whisper Large v3 (STT) + Groq Llama 3 70B (Orchestration) + Piper/Cartesia Neural (TTS)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 z-10 w-full md:w-auto">
              <button
                onClick={() => {
                  setActiveTab('studio');
                  if (callState === 'idle') handleStartCall();
                }}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition-all"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                Launch Live Simulator
              </button>
              <button
                onClick={() => setActiveTab('campaigns')}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur transition-all border border-white/15"
              >
                <Rocket className="w-3.5 h-3.5 text-blue-300" />
                Dispatch Campaign
              </button>
            </div>

            {/* Subtle background glow */}
            <div className="absolute right-0 top-0 bottom-0 w-96 bg-blue-500/10 blur-3xl pointer-events-none" />
          </div>

          {/* Quick Metrics */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Audio Latency</div>
              <div className="text-lg font-black text-slate-900">&lt; 480ms</div>
              <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Sub-second speech turnaround
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Intent Accuracy</div>
              <div className="text-lg font-black text-slate-900">98.7%</div>
              <div className="text-[11px] text-slate-500 font-medium">B2B conversational precision</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Concurrency</div>
              <div className="text-lg font-black text-slate-900">50 Lines</div>
              <div className="text-[11px] text-emerald-600 font-medium">Auto-scales to 1,000+</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">CRM Auto-Sync</div>
              <div className="text-lg font-black text-slate-900">Real-Time</div>
              <div className="text-[11px] text-slate-500 font-medium">Audio, Notes &amp; BANT scores</div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/70 backdrop-blur-md rounded-2xl border border-slate-200/70 inline-flex mt-6 overflow-x-auto w-full md:w-auto max-w-full">
          {[
            { id: 'studio', label: 'Live Voice Studio', icon: AudioWaveform },
            { id: 'campaigns', label: 'Outbound Campaigns', icon: PhoneOutgoing },
            { id: 'personas', label: 'Agent Personas & Voices', icon: Bot },
            { id: 'workflow', label: 'Workflow & Pipeline', icon: Layers },
            { id: 'architecture', label: 'Architecture & Security', icon: ShieldCheck },
            { id: 'faq', label: 'Knowledge Base & FAQ', icon: MessageCircle }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ActiveTab)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-semibold whitespace-nowrap',
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-blue-600' : 'text-slate-400')} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1">
        {/* ========================================================= */}
        {/* TAB 1: LIVE VOICE STUDIO & CALL SIMULATOR */}
        {/* ========================================================= */}
        {activeTab === 'studio' && (
          <div className="space-y-6">
            {/* Top configuration toolbar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Active Persona:
                  </div>
                  <div className="flex items-center gap-2">
                    {PERSONAS.map((persona) => (
                      <button
                        key={persona.id}
                        onClick={() => {
                          setSelectedPersona(persona);
                          if (callState === 'idle') {
                            setTranscripts([]);
                          }
                        }}
                        className={cn(
                          'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5',
                          selectedPersona.id === persona.id
                            ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        )}
                      >
                        <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${persona.avatarBg}`} />
                        {persona.name.split(' ')[0]} ({persona.role.split(' ')[0]})
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">Test Target Lead:</span>
                    <select
                      value={selectedLead.id}
                      onChange={(e) => {
                        const found = TEST_LEADS.find((l) => l.id === e.target.value);
                        if (found) setSelectedLead(found);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      {TEST_LEADS.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} · {l.company}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => setVoiceAudioEnabled(!voiceAudioEnabled)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all',
                      voiceAudioEnabled
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                    )}
                    title="Enable real browser speech synthesis playback"
                  >
                    {voiceAudioEnabled ? (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                        Speech Audio On
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                        Audio Muted
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Call Console Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Phone Simulator & Transcript (7 Cols) */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col min-h-[580px]">
                {/* Console Header Bar */}
                <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${selectedPersona.avatarBg} text-white flex items-center justify-center font-black shadow-sm text-sm`}
                    >
                      {selectedPersona.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{selectedPersona.name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                          {selectedPersona.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        Targeting: <span className="font-semibold text-slate-700">{selectedLead.name}</span> ({selectedLead.phone})
                      </p>
                    </div>
                  </div>

                  {/* Call State Pill */}
                  <div className="flex items-center gap-2">
                    {callState === 'idle' && (
                      <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                        Ready to Call
                      </span>
                    )}
                    {callState === 'dialing' && (
                      <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold animate-pulse flex items-center gap-1.5">
                        <PhoneOutgoing className="w-3.5 h-3.5" />
                        Dialing carrier...
                      </span>
                    )}
                    {callState === 'ringing' && (
                      <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold animate-pulse flex items-center gap-1.5">
                        <PhoneCall className="w-3.5 h-3.5" />
                        Ringing...
                      </span>
                    )}
                    {callState === 'connected' && (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                          Live {formatTime(callDuration)}
                        </span>
                      </div>
                    )}
                    {callState === 'ended' && (
                      <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-bold">
                        Call Concluded
                      </span>
                    )}
                  </div>
                </div>

                {/* Animated Voice Waveform Display */}
                <div className="p-4 bg-gradient-to-b from-slate-950 to-slate-900 text-white flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-blue-500/5 blur-xl pointer-events-none" />

                  {callState === 'connected' ? (
                    <div className="flex flex-col items-center py-2 gap-2 z-10 w-full">
                      <div className="flex items-center gap-1.5 h-12">
                        {waveformBars.map((height, i) => (
                          <div
                            key={i}
                            style={{ height: `${height}%` }}
                            className={cn(
                              'w-1.5 rounded-full transition-all duration-100',
                              isAiTyping ? 'bg-blue-400' : 'bg-emerald-400'
                            )}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-300">
                        <span className="flex items-center gap-1 font-mono">
                          <Mic className="w-3.5 h-3.5 text-blue-400" />
                          Full-Duplex VAD Active
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="font-mono text-emerald-400">16kHz HD Audio</span>
                        <span className="text-slate-600">·</span>
                        <span className="font-mono text-slate-400">&lt;140ms Latency</span>
                      </div>
                    </div>
                  ) : callState === 'dialing' || callState === 'ringing' ? (
                    <div className="py-4 flex flex-col items-center gap-2 z-10 text-center">
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-400/40 flex items-center justify-center animate-spin">
                        <Radio className="w-5 h-5 text-blue-400" />
                      </div>
                      <p className="text-xs font-semibold text-slate-300">
                        Establishing secure WebRTC voice tunnel with carrier...
                      </p>
                    </div>
                  ) : callState === 'ended' ? (
                    <div className="py-3 flex items-center gap-2 text-xs font-semibold text-slate-300 z-10">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Call completed in {formatTime(callDuration)}. Recording and transcript compiled.
                    </div>
                  ) : (
                    <div className="py-4 flex flex-col items-center gap-1 text-center z-10">
                      <p className="text-xs font-semibold text-slate-300">
                        Live Call Sandbox is ready for testing.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Click &quot;Initiate AI Call&quot; to experience sub-second voice conversations in real time.
                      </p>
                    </div>
                  )}
                </div>

                {/* Live Transcript Bubble Feed */}
                <div className="flex-1 p-5 overflow-y-auto max-h-[380px] space-y-4 bg-slate-50/40">
                  {transcripts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                      <PhoneCall className="w-12 h-12 text-slate-300 mb-3 stroke-1" />
                      <p className="font-semibold text-slate-700 text-sm">No Active Conversation Yet</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">
                        Start the call to observe real-time speech transcription, latency timing, and automated intent classification.
                      </p>
                    </div>
                  ) : (
                    transcripts.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex flex-col max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed transition-all shadow-xs',
                          msg.sender === 'ai'
                            ? 'bg-white border border-slate-200 text-slate-800 self-start'
                            : 'bg-blue-600 text-white self-end ml-auto'
                        )}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1 text-[11px] font-semibold opacity-75">
                          <span>{msg.sender === 'ai' ? selectedPersona.name : selectedLead.name}</span>
                          <span className="font-mono">{msg.timestamp}</span>
                        </div>
                        <p>{msg.text}</p>
                        {msg.intentTag && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px]">
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-100">
                              {msg.intentTag}
                            </span>
                            {msg.latencyMs && (
                              <span className="text-slate-400 font-mono">
                                ⚡ {msg.latencyMs}ms response
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {isAiTyping && (
                    <div className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-2xl w-fit text-xs font-semibold text-slate-500 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-100" />
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-200" />
                      <span className="ml-1 text-slate-600">AI is formulating speech...</span>
                    </div>
                  )}
                  <div ref={transcriptBottomRef} />
                </div>

                {/* Quick Reply Prompts (Customer Answers) */}
                {callState === 'connected' && (
                  <div className="p-3 bg-white border-t border-slate-100 space-y-2">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                      Quick Customer Voice Prompts (Click to Test AI Reaction):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        'Yes, we are actively looking for an automation solution.',
                        'What does your pricing look like for 1,000 leads?',
                        'Does this automatically sync with HubSpot CRM?',
                        'Book a demo for Thursday 2 PM EST.',
                        'Not interested right now, send an email instead.'
                      ].map((prompt, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleCustomerReply(prompt)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-medium transition-colors border border-slate-200/80 text-left"
                        >
                          &quot;{prompt}&quot;
                        </button>
                      ))}
                    </div>

                    {/* Custom text reply input */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Or type a custom prospect question..."
                        value={customReplyInput}
                        onChange={(e) => setCustomReplyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCustomerReply(customReplyInput);
                        }}
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <button
                        onClick={() => handleCustomerReply(customReplyInput)}
                        disabled={!customReplyInput.trim()}
                        className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-50 hover:bg-blue-500 transition-colors flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Reply
                      </button>
                    </div>
                  </div>
                )}

                {/* Call Controller Bottom Bar */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {callState === 'idle' ? (
                      <button
                        onClick={handleStartCall}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all active:scale-95"
                      >
                        <Phone className="w-4 h-4" />
                        Initiate AI Call
                      </button>
                    ) : callState === 'connected' || callState === 'ringing' || callState === 'dialing' ? (
                      <button
                        onClick={handleEndCall}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-500/20 transition-all active:scale-95"
                      >
                        <PhoneOff className="w-4 h-4" />
                        Hang Up Call
                      </button>
                    ) : (
                      <button
                        onClick={handleResetCall}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reset Simulation
                      </button>
                    )}

                    {callState === 'connected' && (
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={cn(
                          'p-2.5 rounded-xl border transition-all text-xs font-medium',
                          isMuted
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        )}
                        title="Mute microphone"
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{selectedPersona.voiceName}</span>
                    <span>·</span>
                    <span>16kHz WebRTC</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Call Intelligence & CRM Sync (5 Cols) */}
              <div className="lg:col-span-5 space-y-5">
                {/* Real-time BANT Qualification & Scorecard */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">Live AI Lead Qualification</h3>
                      <p className="text-xs text-slate-500">Autonomous BANT evaluation in real time</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-blue-600">{qualificationScore}/100</div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Lead Score
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500 rounded-full"
                      style={{ width: `${qualificationScore}%` }}
                    />
                  </div>

                  {/* BANT Checklist */}
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      BANT Qualification Criteria:
                    </div>

                    {[
                      {
                        label: 'Budget Verified',
                        val: qualificationScore > 40 ? '$25k - $50k Automation Budget' : 'Pending Inquiry',
                        done: qualificationScore > 40
                      },
                      {
                        label: 'Authority Confirmed',
                        val: `${selectedLead.title} (Decision Maker)`,
                        done: qualificationScore > 30
                      },
                      {
                        label: 'Need Identified',
                        val: qualificationScore > 50 ? 'Manual SDR follow-up bottleneck' : 'Assessing Fit',
                        done: qualificationScore > 50
                      },
                      {
                        label: 'Timeline Locked',
                        val: qualificationScore > 65 ? 'Immediate Q3 Deployment' : 'To Be Decided',
                        done: qualificationScore > 65
                      }
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          {item.done ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
                          )}
                          <span className="font-semibold text-slate-700">{item.label}</span>
                        </div>
                        <span className={cn('font-medium', item.done ? 'text-emerald-700 font-bold' : 'text-slate-400')}>
                          {item.val}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Sentiment Meter */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-700">Sentiment &amp; Buying Intent:</span>
                      <span className="font-bold text-emerald-600">{sentimentRate}% Positive</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                        style={{ width: `${sentimentRate}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Live CRM Sync Card */}
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                        <Database className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">CRM Auto-Sync Webhook</h4>
                        <p className="text-[11px] text-slate-400">HubSpot / Salesforce live integration</p>
                      </div>
                    </div>
                    <button
                      onClick={copySummaryNote}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Copy CRM note"
                    >
                      {copiedNote ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy Note
                        </>
                      )}
                    </button>
                  </div>

                  {/* Note Preview Box */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 leading-relaxed space-y-1">
                    <div className="text-slate-400 font-bold mb-1">// Auto-Generated CRM Summary</div>
                    <p>
                      <strong>Contact:</strong> {selectedLead.name} ({selectedLead.company})
                    </p>
                    <p>
                      <strong>Disposition:</strong>{' '}
                      {qualificationScore >= 70
                        ? 'Hot Lead · Demo Requested'
                        : 'Warm Lead · Qualification in Progress'}
                    </p>
                    <p>
                      <strong>Next Action:</strong> Auto-scheduled solutions review for Thursday.
                    </p>
                    <p className="text-emerald-600 font-bold">
                      ✓ Audio Recording &amp; Transcript Uploaded to CRM
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>Contact ID: #LFA-8942</span>
                    <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Webhook 200 OK
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: OUTBOUND CAMPAIGNS */}
        {/* ========================================================= */}
        {activeTab === 'campaigns' && (
          <div className="space-y-6">
            {/* Campaigns Header Action Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Voice Calling Campaigns</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Launch mass autonomous outbound outreach across your filtered CRM lead lists with automatic retries and AMD.
                </p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => alert('New Campaign Wizard: Select leads from the Leads tab or CSV, pick persona, and set calling hours.')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all"
                >
                  <Rocket className="w-4 h-4" />
                  Create Voice Campaign
                </button>
              </div>
            </div>

            {/* Campaign Summary Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Calls Dispatched</div>
                <div className="text-2xl font-black text-slate-900 mt-1">2,414</div>
                <div className="text-xs text-emerald-600 font-semibold mt-1">↑ 18% vs last week</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Connection Rate</div>
                <div className="text-2xl font-black text-slate-900 mt-1">68.4%</div>
                <div className="text-xs text-slate-500 font-medium mt-1">Local presence caller ID</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Qualified Leads (BANT)</div>
                <div className="text-2xl font-black text-blue-600 mt-1">826 Leads</div>
                <div className="text-xs text-blue-600 font-semibold mt-1">34.2% conversion rate</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Call Duration</div>
                <div className="text-2xl font-black text-slate-900 mt-1">2m 48s</div>
                <div className="text-xs text-slate-500 font-medium mt-1">High engagement dialogue</div>
              </div>
            </div>

            {/* Active Campaigns Table */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm">Campaign Deployments</h4>
                <span className="text-xs text-slate-400 font-medium">4 Total Campaigns</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="py-3 px-5">Campaign Name</th>
                      <th className="py-3 px-5">Assigned Persona</th>
                      <th className="py-3 px-5">Progress</th>
                      <th className="py-3 px-5">Status</th>
                      <th className="py-3 px-5">Connected</th>
                      <th className="py-3 px-5">Qualified</th>
                      <th className="py-3 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {MOCK_CAMPAIGNS.map((camp) => (
                      <tr key={camp.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-5 font-bold text-slate-900">
                          <div>{camp.name}</div>
                          <div className="text-[11px] text-slate-400 font-normal">Started: {camp.startedAt}</div>
                        </td>
                        <td className="py-4 px-5">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold">
                            {camp.persona}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <div className="w-36">
                            <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                              <span>
                                {camp.completedCount} / {camp.leadsCount}
                              </span>
                              <span>{Math.round((camp.completedCount / camp.leadsCount) * 100)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-blue-600 h-full rounded-full"
                                style={{ width: `${(camp.completedCount / camp.leadsCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <span
                            className={cn(
                              'px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider',
                              camp.status === 'Running'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : camp.status === 'Scheduled'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-600'
                            )}
                          >
                            {camp.status}
                          </span>
                        </td>
                        <td className="py-4 px-5 font-semibold text-slate-700">{camp.connectionRate}</td>
                        <td className="py-4 px-5 font-bold text-emerald-700">{camp.qualificationRate}</td>
                        <td className="py-4 px-5 text-right space-x-2">
                          <button
                            onClick={() => {
                              setActiveTab('studio');
                              handleStartCall();
                            }}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-[11px]"
                          >
                            Test Dial
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: AGENT PERSONAS & VOICE STUDIO */}
        {/* ========================================================= */}
        {activeTab === 'personas' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">AI Voice Personas &amp; Prompt Engineering</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Customize voice tones, pitch, accents, conversational objectives, and guardrails for every outreach persona.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {PERSONAS.map((persona) => {
                const isSelected = selectedPersona.id === persona.id;
                return (
                  <div
                    key={persona.id}
                    className={cn(
                      'bg-white border rounded-3xl p-6 shadow-sm flex flex-col justify-between transition-all hover:shadow-md',
                      isSelected ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-slate-200'
                    )}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div
                          className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${persona.avatarBg} text-white flex items-center justify-center font-black shadow-sm text-base`}
                        >
                          {persona.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </div>
                        {isSelected && (
                          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold uppercase tracking-wider">
                            Active in Studio
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 text-base">{persona.name}</h4>
                        <p className="text-xs text-blue-600 font-semibold">{persona.role}</p>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{persona.tagline}</p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Voice Engine:</span>
                          <span className="font-semibold text-slate-700">{persona.voiceName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Energy &amp; Style:</span>
                          <span className="font-semibold text-slate-700">{persona.energy}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Accent:</span>
                          <span className="font-semibold text-slate-700">{persona.accent}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-5 mt-4 border-t border-slate-100">
                      <button
                        onClick={() => {
                          setSelectedPersona(persona);
                          setActiveTab('studio');
                        }}
                        className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-700 text-xs font-bold transition-all border border-slate-200/80 flex items-center justify-center gap-1.5"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Select &amp; Test in Studio
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Persona Guidance & Guardrails Details */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-900 text-sm">System Prompt &amp; Behavioral Guardrails</h4>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 leading-relaxed">
                <span className="text-slate-400">// System Prompt Injection for {selectedPersona.name}:</span>
                <br />
                &quot;You are {selectedPersona.name}, acting as a professional {selectedPersona.role} for LeadFlow AI.
                Your tone is {selectedPersona.energy}. Never break character. Never state you are an AI unless explicitly asked.
                Keep spoken replies under 30 words per turn to encourage a natural two-way conversation.
                Prioritize gathering decision-maker status and budget before offering a calendar booking.&quot;
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: WORKFLOW & PIPELINE */}
        {/* ========================================================= */}
        {activeTab === 'workflow' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">End-to-End Voice Automation Architecture</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect every stage of the real-time voice pipeline from lead selection to automated CRM sync.
              </p>
            </div>

            {/* Stepper Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {WORKFLOW_STEPS.map((ws) => {
                const isActive = activeWorkflowStep === ws.step;
                return (
                  <div
                    key={ws.step}
                    onClick={() => setActiveWorkflowStep(ws.step)}
                    className={cn(
                      'cursor-pointer bg-white border rounded-2xl p-5 shadow-sm transition-all duration-200 relative overflow-hidden',
                      isActive ? 'border-blue-500 ring-2 ring-blue-500/10 shadow-md' : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <span className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        STAGE {ws.step}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100">
                        {ws.latency}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm mb-1">{ws.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed mb-3">{ws.desc}</p>
                    <span className="inline-block text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                      {ws.badge}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Selected Step Technical Payload Inspection */}
            {activeWorkflowStep && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Stage {activeWorkflowStep} Technical Payload &amp; Event Stream
                    </span>
                  </div>
                  <span className="text-xs font-mono font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    {WORKFLOW_STEPS[activeWorkflowStep - 1]?.badge} · {WORKFLOW_STEPS[activeWorkflowStep - 1]?.latency}
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 font-mono text-xs text-slate-700 leading-relaxed">
                  <p className="text-blue-600 font-bold mb-1">
                    // Component: {WORKFLOW_STEPS[activeWorkflowStep - 1]?.title}
                  </p>
                  <p className="text-slate-600">{WORKFLOW_STEPS[activeWorkflowStep - 1]?.technical}</p>
                  <div className="mt-3 text-[11px] font-bold text-emerald-700">
                    STATUS: ACTIVE_PIPELINE_OK | STREAMING_CHUNK: 160ms | BUFFER_HEALTH: 100%
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: ARCHITECTURE & SECURITY */}
        {/* ========================================================= */}
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Technical Stack &amp; Enterprise Compliance</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Built on an ultra-low latency modular stack with SOC-2, HIPAA, and TCPA safety controls.
              </p>
            </div>

            {/* Tech Stack Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { name: 'FastAPI / Python', role: 'Microservices & WebSockets', icon: Zap },
                { name: 'Whisper Large v3', role: 'Real-time Streaming STT', icon: Mic },
                { name: 'Llama 3 70B / Groq', role: 'Contextual Dialogue Engine', icon: Brain },
                { name: 'Piper / Cartesia', role: 'Neural Low-Latency TTS', icon: AudioLines },
                { name: 'Twilio / SIP Trunk', role: 'Carrier HD Voice Gateway', icon: Phone },
                { name: 'MongoDB & Redis', role: 'Stateful Session Storage', icon: Database }
              ].map((tech) => {
                const Icon = tech.icon;
                return (
                  <div
                    key={tech.name}
                    className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col items-center text-center gap-2 hover:shadow-md transition-all"
                  >
                    <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h5 className="font-bold text-slate-900 text-xs">{tech.name}</h5>
                    <p className="text-[11px] text-slate-500">{tech.role}</p>
                  </div>
                );
              })}
            </div>

            {/* Enterprise Security Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 w-fit">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">SOC-2 Type II &amp; HIPAA Ready</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  All audio streams and database records are encrypted at rest with AES-256 and in transit via TLS 1.3.
                  Includes automated PII redaction on transcripts.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
                <div className="p-3 rounded-xl bg-blue-50 text-blue-600 w-fit">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">TCPA Compliance &amp; DNC Scrub</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Real-time national and state Do-Not-Call (DNC) registry checking. Calls are automatically restricted to
                  legal calling hours (8:00 AM - 8:00 PM local prospect time).
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
                <div className="p-3 rounded-xl bg-purple-50 text-purple-600 w-fit">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">STIR/SHAKEN Attestation</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Full A-level STIR/SHAKEN cryptographic caller ID verification prevents calls from being labeled as
                  &quot;Scam Likely&quot; or blocked by mobile carrier filters.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: FAQ & KNOWLEDGE BASE */}
        {/* ========================================================= */}
        {activeTab === 'faq' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Frequently Asked Questions</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Everything you need to know about the Calling AI Voice Agent architecture and deployment.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={searchFaq}
                  onChange={(e) => setSearchFaq(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Accordion List */}
            <div className="space-y-3">
              {filteredFaqs.map((faq, index) => {
                const isOpen = openFaq === index;
                return (
                  <div
                    key={faq.q}
                    className={cn(
                      'bg-white border rounded-2xl shadow-xs transition-colors duration-200',
                      isOpen ? 'border-blue-200 ring-2 ring-blue-500/5' : 'border-slate-200'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="w-full flex items-center justify-between gap-4 px-6 py-4.5 text-left"
                    >
                      <span className="font-bold text-slate-900 text-sm">{faq.q}</span>
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200',
                          isOpen && 'rotate-180 text-blue-600'
                        )}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-5 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-100">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
