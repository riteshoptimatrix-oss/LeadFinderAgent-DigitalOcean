'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Send, X, Check, Loader2, Trash2, Calendar, ShieldCheck, Info } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <span>Auto Send to EasyAdServer</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                      EAS
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Configure daily automated background dispatch of leads
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
                  <p className="text-xs font-semibold">Loading current schedule...</p>
                </div>
              ) : (
                <>
                  {/* Master Automation Switch */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <div className="space-y-0.5">
                      <span className="text-xs font-extrabold text-slate-800 block">
                        Schedule Status
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {isActive ? 'Automation is ACTIVE and will fire daily' : 'Automation is currently PAUSED'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsActive(!isActive)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        isActive ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          isActive ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Time Picker */}
                  <TimePicker
                    value={scheduleTime}
                    onChange={(val) => setScheduleTime(val)}
                    disabled={!isActive}
                    label="Auto Send Daily Execution Time"
                  />

                  {/* Status Banner */}
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                      <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Daily Schedule: Every day at {formatTime12(scheduleTime)} IST
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800/90 leading-relaxed pl-6">
                      All available leads in your account will automatically be dispatched to EasyAdServer without needing any manual button click.
                    </p>
                  </div>

                  {/* Duplicate Handling Info */}
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-600 text-[11px] leading-relaxed">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-800">Duplicate Prevention:</strong> Uses the exact duplicate-checking logic as the manual Send button. Leads already dispatched to EasyAdServer are automatically identified and skipped.
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100">
              {scheduleData?.has_schedule ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleRemove}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Schedule</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || isLoading}
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-sm cursor-pointer disabled:opacity-50 active:scale-98"
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
