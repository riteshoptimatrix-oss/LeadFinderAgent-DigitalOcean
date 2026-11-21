'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, X, Check, Loader2, Trash2, ShieldCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { toast } from 'sonner';
import TimePicker from '@/src/components/common/TimePicker';

interface AutoSendEASModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduleUpdated?: () => void;
}

export default function AutoSendEASModal({
  isOpen,
  onClose,
  onScheduleUpdated,
}: AutoSendEASModalProps) {
  const queryClient = useQueryClient();
  const [scheduleTime, setScheduleTime] = useState<string>('18:00');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch current schedule
  const { data: scheduleData, isLoading, refetch } = useQuery({
    queryKey: ['eas-schedule'],
    queryFn: async () => {
      const res = await api.get('/easyadserver/schedule');
      return res.data;
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (scheduleData && scheduleData.has_schedule) {
      if (scheduleData.schedule_time) {
        setScheduleTime(scheduleData.schedule_time);
      }
      setIsActive(scheduleData.is_active ?? true);
    }
  }, [scheduleData]);

  // Format 24h time to 12h readable string
  const formatTime12 = (t24: string) => {
    if (!t24) return '';
    const [hStr, mStr] = t24.split(':');
    const h = parseInt(hStr, 10);
    const m = mStr || '00';
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(h12).padStart(2, '0')}:${m} ${period}`;
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await api.post('/easyadserver/schedule', {
        schedule_time: scheduleTime,
        is_active: isActive,
      });

      toast.success('Auto Send to EasyAdServer scheduled!', {
        description: `Leads will be dispatched automatically every day at ${formatTime12(scheduleTime)} IST.`,
      });

      queryClient.invalidateQueries({ queryKey: ['eas-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-tasks-live-monitor'] });
      refetch();
      if (onScheduleUpdated) onScheduleUpdated();
      onClose();
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj?.response?.data?.detail || errorObj?.message || 'Failed to save schedule.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Are you sure you want to remove the automated schedule for EasyAdServer?')) {
      return;
    }
    setIsSubmitting(true);
    try {
      await api.delete('/easyadserver/schedule');
      toast.success('Auto Send schedule removed successfully.');
      queryClient.invalidateQueries({ queryKey: ['eas-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-tasks-live-monitor'] });
      refetch();
      if (onScheduleUpdated) onScheduleUpdated();
      onClose();
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj?.response?.data?.detail || errorObj?.message || 'Failed to remove schedule.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="relative w-full max-w-sm sm:max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10"
          >
            {/* Minimal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    <span>Auto Send to EAS</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                      Daily
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Scheduled background lead dispatch
                  </p>
                </div>
              </div>

              {/* Status Toggle & Close Button */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-xl shadow-2xs">
                  <span className={`text-[10px] font-bold ${isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {isActive ? 'ACTIVE' : 'PAUSED'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      isActive ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-2xs ring-0 transition duration-200 ease-in-out ${
                        isActive ? 'translate-x-3.5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Minimal Body */}
            <div className="p-4 space-y-3">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-600 mb-2" />
                  <p className="text-xs font-semibold">Loading schedule...</p>
                </div>
              ) : (
                <>
                  {/* Clean Analog Wall Clock (Image 2 style) */}
                  <TimePicker
                    value={scheduleTime}
                    onChange={(val) => setScheduleTime(val)}
                    disabled={!isActive}
                    clockSize={165}
                    showPresets={false}
                  />

                  {/* 1-Line Subtle Summary */}
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      Runs daily at <strong className="text-slate-800">{formatTime12(scheduleTime)} IST</strong> • Duplicates skipped
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Minimal Footer */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-100">
              {scheduleData?.has_schedule ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleRemove}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || isLoading}
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-sm cursor-pointer disabled:opacity-50 active:scale-98"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save Schedule</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
