'use client';

import React, { useMemo } from 'react';
import { Clock, Sun, Moon } from 'lucide-react';

interface TimePickerProps {
  value: string; // "HH:MM" in 24-hour format
  onChange: (time24: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export default function TimePicker({
  value = '09:00',
  onChange,
  disabled = false,
  label,
  className = '',
}: TimePickerProps) {
  // Parse 24h string "HH:MM" into hour (1-12), minute (0-59), period (AM/PM)
  const { hour12, minute, period } = useMemo(() => {
    const parts = (value || '09:00').split(':');
    const h24 = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;

    const p = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;

    return {
      hour12: h12,
      minute: m,
      period: p,
    };
  }, [value]);

  const updateTime = (newH12: number, newM: number, newP: 'AM' | 'PM') => {
    let h24 = newH12 % 12;
    if (newP === 'PM') h24 += 12;
    const formatted = `${String(h24).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    onChange(formatted);
  };

  const handleHourChange = (newH: number) => {
    updateTime(newH, minute, period as 'AM' | 'PM');
  };

  const handleMinuteChange = (newM: number) => {
    updateTime(hour12, newM, period as 'AM' | 'PM');
  };

  const handlePeriodChange = (newP: 'AM' | 'PM') => {
    updateTime(hour12, minute, newP);
  };

  const hoursList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const minutesList = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const presets = [
    { label: '09:00 AM', val: '09:00' },
    { label: '12:00 PM', val: '12:00' },
    { label: '02:00 PM', val: '14:00' },
    { label: '06:00 PM', val: '18:00' },
    { label: '08:00 PM', val: '20:00' },
    { label: '11:00 PM', val: '23:00' },
  ];

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-teal-600" />
          <span>{label}</span>
          <span className="text-[10px] font-normal text-slate-400">(Asia/Kolkata IST)</span>
        </label>
      )}

      {/* Main Time Selector Box */}
      <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 shadow-2xs">
        <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
          {/* Digital Display */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200/90 rounded-lg px-3 py-1.5 shadow-2xs">
            <Clock className="w-4 h-4 text-teal-600 shrink-0" />
            <span className="text-sm font-extrabold text-slate-900 tracking-wider">
              {String(hour12).padStart(2, '0')}:{String(minute).padStart(2, '0')}
            </span>
            <span className="text-xs font-bold text-teal-700 ml-0.5">{period}</span>
            <span className="text-[10px] font-medium text-slate-400 ml-1">IST</span>
          </div>

          {/* Selectors: Hour + Minute + AM/PM */}
          <div className="flex items-center gap-1.5">
            {/* Hour select */}
            <div className="flex items-center">
              <select
                disabled={disabled}
                value={hour12}
                onChange={(e) => handleHourChange(parseInt(e.target.value, 10))}
                className="bg-white border border-slate-200 text-xs font-bold text-slate-800 rounded-lg px-2 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 cursor-pointer disabled:opacity-50"
              >
                {hoursList.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')} hr
                  </option>
                ))}
              </select>
            </div>

            <span className="text-slate-400 font-bold">:</span>

            {/* Minute select */}
            <div className="flex items-center">
              <select
                disabled={disabled}
                value={minute}
                onChange={(e) => handleMinuteChange(parseInt(e.target.value, 10))}
                className="bg-white border border-slate-200 text-xs font-bold text-slate-800 rounded-lg px-2 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 cursor-pointer disabled:opacity-50"
              >
                {minutesList.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')} min
                  </option>
                ))}
              </select>
            </div>

            {/* AM / PM Segmented Control */}
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                disabled={disabled}
                onClick={() => handlePeriodChange('AM')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  period === 'AM'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                } disabled:opacity-50`}
              >
                <Sun className="w-2.5 h-2.5" />
                AM
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => handlePeriodChange('PM')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  period === 'PM'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                } disabled:opacity-50`}
              >
                <Moon className="w-2.5 h-2.5" />
                PM
              </button>
            </div>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Presets:</span>
          {presets.map((p) => {
            const isSelected = value === p.val;
            return (
              <button
                key={p.val}
                type="button"
                disabled={disabled}
                onClick={() => onChange(p.val)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-teal-50 border-teal-300 text-teal-700 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                } disabled:opacity-50`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
