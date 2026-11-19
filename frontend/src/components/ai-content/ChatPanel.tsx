'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Loader2,
  MessageSquare,
  User,
  Bot,
  RotateCcw,
  AlertCircle,
  Lightbulb
} from 'lucide-react';
import { ChatMessage } from './types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onGenerate: (query: string) => Promise<void>;
  isLoading: boolean;
  onClearChat: () => void;
}

const TOPIC_IDEAS = [
  'Marketing Email: Cold outreach email pitching B2B lead generation software to agency owners',
  'LinkedIn Post: Thought leadership post on how AI agents are transforming sales workflows in 2026',
  'Instagram Caption: Launching our new premium organic winter coffee blend with emojis and hashtags',
  'Blog Post: 5 actionable strategies to increase organic website conversions without ads',
  'Promotional Copy: Exclusive 30% discount announcement for early users of our AI tool'
];

const FORMAT_TAGS = [
  { label: 'Marketing Email', prefix: 'Write a high-converting marketing email: ' },
  { label: 'LinkedIn Post', prefix: 'Create an engaging LinkedIn post with hook: ' },
  { label: 'Social Caption', prefix: 'Write an Instagram/Facebook caption with hashtags: ' },
  { label: 'Blog Post', prefix: 'Write a structured, informative blog post: ' },
  { label: 'Promotional Copy', prefix: 'Create compelling promotional ad copy with CTA: ' },
];

export default function ChatPanel({
  messages,
  onGenerate,
  isLoading,
  onClearChat
}: ChatPanelProps) {
  const [query, setQuery] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setLocalError('Please enter a topic or instruction before generating.');
      return;
    }
    if (isLoading) return;

    setLocalError(null);
    const textToSend = trimmed;
    setQuery('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      await onGenerate(textToSend);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setLocalError(errorObj?.message || 'Failed to generate content. Please try again.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);
    if (localError) setLocalError(null);

    // Auto-expand textarea up to 160px
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
  };

  const handlePickIdea = (idea: string) => {
    setQuery(idea);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex flex-col h-[700px]">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 text-base">Chat Panel</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 uppercase tracking-wider">
                Left Side
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Emails, LinkedIn posts, captions, blogs & promos
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={onClearChat}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            title="Reset conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear Chat</span>
          </button>
        )}
      </div>

      {/* Message History Container */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center p-6 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-400 mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">What would you like to create?</p>
            <p className="text-xs text-slate-400 max-w-sm mt-1 mb-5">
              Generate high-converting marketing emails, LinkedIn posts, social captions, blogs, or promotional ad copy.
            </p>

            {/* Suggested quick topics */}
            <div className="w-full max-w-md space-y-2">
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider justify-center">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                <span>Example Ideas:</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {TOPIC_IDEAS.map((idea, i) => (
                  <button
                    key={i}
                    onClick={() => handlePickIdea(idea)}
                    className="text-left text-xs px-3 py-2 rounded-xl bg-slate-50 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200/80 border border-slate-200/70 text-slate-600 transition-colors"
                  >
                    &ldquo;{idea}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-xl bg-blue-50 border border-blue-200/70 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${isUser
                    ? 'bg-slate-900 text-white rounded-br-xs shadow-xs'
                    : msg.error
                      ? 'bg-rose-50 text-rose-800 border border-rose-200/80'
                      : 'bg-slate-100 text-slate-800 rounded-bl-xs border border-slate-200/60'
                    }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1 opacity-70 text-[10px]">
                    <span className="font-semibold uppercase tracking-wider">
                      {isUser ? 'You' : msg.type === 'modify' ? 'Gemini (Modified)' : 'Gemini AI'}
                    </span>
                    <span>{msg.timestamp}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                </div>
                {isUser && (
                  <div className="w-7 h-7 rounded-xl bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Live Loading bubble */}
        {isLoading && (
          <div className="flex gap-3 justify-start items-center">
            <div className="w-7 h-7 rounded-xl bg-blue-50 border border-blue-200/70 flex items-center justify-center text-blue-600 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-slate-100 rounded-2xl rounded-bl-xs p-3 text-xs text-slate-600 border border-slate-200/60 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span>Generating response via AI...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error alert if any */}
      {localError && (
        <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{localError}</span>
        </div>
      )}

      {/* Input Form Area */}
      <form onSubmit={handleSubmit} className="pt-3 border-t border-slate-100 shrink-0 space-y-2">
        {/* Quick Format Tags */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-0.5">
            Format:
          </span>
          {FORMAT_TAGS.map((tag, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => {
                setQuery(prev => prev.startsWith(tag.prefix) ? prev : `${tag.prefix}${prev.replace(/^(Write a|Create an?|Write an?) [^:]+:\s*/i, '')}`);
                if (textareaRef.current) textareaRef.current.focus();
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-slate-600 border border-slate-200/60 transition-colors whitespace-nowrap shrink-0"
            >
              {tag.label}
            </button>
          ))}
        </div>

        <div className="relative bg-slate-50 border border-slate-200 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all p-3">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="What would you like to generate? (e.g. Marketing email, LinkedIn post, caption, blog, or promotional copy...)"
            rows={2}
            disabled={isLoading}
            className="w-full text-xs sm:text-sm text-slate-900 bg-transparent outline-none resize-none placeholder:text-slate-400 max-h-[160px]"
          />

          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-1">
            <span className="text-[11px] text-slate-400">
              Shift + Enter for new line
            </span>

            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all disabled:opacity-40 disabled:hover:bg-blue-600 cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <span>Generate</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
