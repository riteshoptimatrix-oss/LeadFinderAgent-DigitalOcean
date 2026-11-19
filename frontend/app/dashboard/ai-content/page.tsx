'use client';

import React, { useState } from 'react';
import api from '@/src/lib/axios';
import { PageHeader } from '@/src/components/common/PageHeader';
import ChatPanel from '@/src/components/ai-content/ChatPanel';
import OutputPanel from '@/src/components/ai-content/OutputPanel';
import ModifyModal from '@/src/components/ai-content/ModifyModal';
import { ChatMessage } from '@/src/components/ai-content/types';
import { toast } from 'sonner';

export default function AIContentGeneratorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentOutput, setCurrentOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isModifying, setIsModifying] = useState<boolean>(false);
  const [isModifyModalOpen, setIsModifyModalOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Generate initial social media post
  const handleGenerate = async (query: string) => {
    setIsLoading(true);
    setError(null);

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `user-${Date.now()}`;
    
    // Add user message to conversation
    setMessages(prev => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: query,
        timestamp: now,
        type: 'generate'
      }
    ]);

    try {
      const res = await api.post('/ai-content/generate', {
        user_query: query
      });

      if (res.data?.success && res.data?.response) {
        const generatedText = res.data.response;
        setCurrentOutput(generatedText);

        setMessages(prev => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: generatedText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'generate'
          }
        ]);
        toast.success('Social media post generated successfully!');
      } else {
        const errMsg = res.data?.error || 'Content generation failed. Please try again.';
        setError(errMsg);
        setMessages(prev => [
          ...prev,
          {
            id: `ai-err-${Date.now()}`,
            sender: 'ai',
            text: `Error: ${errMsg}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            error: true
          }
        ]);
        toast.error(errMsg);
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string; error?: string } }; message?: string };
      const errMsg =
        errorObj?.response?.data?.detail ||
        errorObj?.response?.data?.error ||
        errorObj?.message ||
        'Network error or Gemini automation failure.';
      setError(errMsg);
      setMessages(prev => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'ai',
          text: `Error: ${errMsg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          error: true
        }
      ]);
      toast.error(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Modify existing generated response
  const handleModify = async (modificationQuery: string) => {
    if (!currentOutput) {
      toast.error('No existing content to modify. Please generate content first.');
      return;
    }

    setIsModifying(true);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages(prev => [
      ...prev,
      {
        id: `user-mod-${Date.now()}`,
        sender: 'user',
        text: `Requested Change: ${modificationQuery}`,
        timestamp: now,
        type: 'modify'
      }
    ]);

    try {
      const res = await api.post('/ai-content/modify', {
        response: currentOutput,
        user_query: modificationQuery
      });

      if (res.data?.success && res.data?.response) {
        const updatedText = res.data.response;
        // Replace existing right-panel content with updated response
        setCurrentOutput(updatedText);

        setMessages(prev => [
          ...prev,
          {
            id: `ai-mod-${Date.now()}`,
            sender: 'ai',
            text: updatedText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'modify'
          }
        ]);
        toast.success('Content modified successfully!');
      } else {
        const errMsg = res.data?.error || 'Modification failed. Retained previous output.';
        toast.error(errMsg);
        throw new Error(errMsg);
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string; error?: string } }; message?: string };
      const errMsg =
        errorObj?.response?.data?.detail ||
        errorObj?.response?.data?.error ||
        errorObj?.message ||
        'Modification request failed. Previous output was retained.';
      toast.error(errMsg);
      throw new Error(errMsg);
    } finally {
      setIsModifying(false);
    }
  };

  const handleClearOutput = () => {
    setCurrentOutput('');
    setError(null);
    toast.info('Output cleared.');
  };

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
    toast.info('Chat history cleared.');
  };

  return (
    <div className="w-full flex flex-col pb-12 animate-in fade-in">
      {/* Page Header */}
      <div className="flex-none mb-6">
        <PageHeader
          title={
            <div className="flex items-center gap-3">
              <span>AI Content Generator</span>
            </div>
          }
          description="Generate and refine high-converting social media content through Gemini Web Playwright automation."
          action={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                New Page
              </span>
            </div>
          }
        />
      </div>

      {/* Two-Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full items-start">
        {/* LEFT PANEL — Chat / User Input */}
        <ChatPanel
          messages={messages}
          onGenerate={handleGenerate}
          isLoading={isLoading || isModifying}
          onClearChat={handleClearChat}
        />

        {/* RIGHT PANEL — Generated Output */}
        <OutputPanel
          content={currentOutput}
          isLoading={isLoading}
          isModifying={isModifying}
          error={error}
          onClear={handleClearOutput}
          onOpenModify={() => setIsModifyModalOpen(true)}
          historyCount={messages.filter(m => m.sender === 'ai' && !m.error).length}
        />
      </div>

      {/* Modify Modal ("Change this Output") */}
      <ModifyModal
        isOpen={isModifyModalOpen}
        onClose={() => setIsModifyModalOpen(false)}
        onSubmit={handleModify}
        existingContent={currentOutput}
        isModifying={isModifying}
      />
    </div>
  );
}
