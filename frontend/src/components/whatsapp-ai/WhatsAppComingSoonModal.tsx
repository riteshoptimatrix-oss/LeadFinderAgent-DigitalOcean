'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Rocket, Home } from 'lucide-react';

interface WhatsAppComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WhatsAppComingSoonModal({ isOpen, onClose }: WhatsAppComingSoonModalProps) {
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-coming-soon-title"
    >
      <div
        className="relative bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-8 text-center animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 animate-in fade-in zoom-in-95 duration-500">
          <Rocket className="w-8 h-8 text-white" />
        </div>

        <h3 id="wa-coming-soon-title" className="text-2xl font-black text-slate-900 mb-2">
          🚀 WhatsApp Message Automation
        </h3>
        <p className="inline-block text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-3 py-1 mb-5">
          Coming Soon
        </p>

        <p className="text-sm leading-relaxed text-slate-500">
          The WhatsApp Message Automation engine is currently under development.
        </p>
        <p className="text-sm leading-relaxed text-slate-500 mt-2">
          This feature will soon allow you to automatically send personalized WhatsApp messages, manage
          campaigns, monitor delivery status, and track responses directly from the Lead Finder Agent.
        </p>
        <p className="text-sm font-semibold text-slate-700 mt-3">Stay tuned for the upcoming release.</p>

        <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 transition-all shadow-md shadow-blue-500/20 active:scale-[0.98]"
          >
            <Home className="w-4 h-4" />
            Go Home
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all active:scale-[0.98]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
