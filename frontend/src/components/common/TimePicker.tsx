'use client';

import React, { useMemo, useState, useRef, useCallback } from 'react';
import { Clock, Sun, Moon, Sparkles } from 'lucide-react';

interface TimePickerProps {
  value: string; // "HH:MM" in 24-hour format
  onChange: (time24: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  clockSize?: number; // diameter in pixels (default 210)
  showPresets?: boolean;
}

export default function TimePicker({
  value = '09:00',
  onChange,
  disabled = false,
  label,
  className = '',
  clockSize = 210,
  showPresets = true,
}: TimePickerProps) {
  // Mode for interactive clock clicking: 'hour' or 'minute'
  const [activeMode, setActiveMode] = useState<'hour' | 'minute'>('hour');
  const clockRef = useRef<SVGSVGElement>(null);

  // Parse 24h string "HH:MM" into hour (1-12), minute (0-59), period (AM/PM)
  const { hour12, minute, period, hour24 } = useMemo(() => {
    const parts = (value || '09:00').split(':');
    const h24 = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;

    const p = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;

    return {
      hour12: h12,
      minute: m,
      period: p as 'AM' | 'PM',
      hour24: h24,
    };
  }, [value]);

  const updateTime = useCallback(
    (newH12: number, newM: number, newP: 'AM' | 'PM') => {
      let h24 = newH12 % 12;
      if (newP === 'PM') h24 += 12;
      const formatted = `${String(h24).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
      onChange(formatted);
    },
    [onChange]
  );

  const handleHourChange = (newH: number) => {
    updateTime(newH, minute, period);
  };

  const handleMinuteChange = (newM: number) => {
    updateTime(hour12, newM, period);
  };

  const handlePeriodChange = (newP: 'AM' | 'PM') => {
    updateTime(hour12, minute, newP);
  };

  // Clock Hand Angles (Degrees from 12 o'clock / top)
  const hourAngle = useMemo(() => {
    return ((hour12 % 12) + minute / 60) * 30;
  }, [hour12, minute]);

  const minuteAngle = useMemo(() => {
    return minute * 6;
  }, [minute]);

  // Second / Accent Hand angle: fixed at 0 or 300 to match the clean accent aesthetic in Image 2
  const secondAccentAngle = 318; // ~10:36 position as seen in Image 2

  // Interactivity: clicking anywhere on the analog clock dial
  const handleClockClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (disabled || !clockRef.current) return;
    const rect = clockRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const x = e.clientX - cx;
    const y = e.clientY - cy;

    const distFromCenter = Math.sqrt(x * x + y * y);
    const radiusRatio = distFromCenter / (rect.width / 2);

    // Calculate angle in degrees from top (12 o'clock)
    let angleRad = Math.atan2(x, -y);
    let angleDeg = (angleRad * (180 / Math.PI) + 360) % 360;

    // If clicked on inner region (or in hour mode), set hour; if outer or minute mode, set minute
    if (activeMode === 'hour' || (radiusRatio < 0.65 && activeMode !== 'minute')) {
      let h = Math.round(angleDeg / 30) % 12;
      if (h === 0) h = 12;
      handleHourChange(h);
      // Auto toggle to minute mode for smooth two-step selection
      setActiveMode('minute');
    } else {
      let m = Math.round(angleDeg / 6) % 60;
      // Snap to nearest 5 mins if close
      const remainder = m % 5;
      if (remainder <= 1) m -= remainder;
      else if (remainder >= 4) m = (m + (5 - remainder)) % 60;
      handleMinuteChange(m);
    }
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

  // SVG Geometry Constants (viewBox 0 0 240 240)
  const CX = 120;
  const CY = 120;

  // Generate tick marks for the clock face
  const ticks = useMemo(() => {
    const list = [];
    for (let i = 0; i < 60; i++) {
      const isHour = i % 5 === 0;
      const angle = (i * 6 * Math.PI) / 180;
      const rOuter = 95;
      const rInner = isHour ? 84 : 89;
      const x1 = CX + rInner * Math.sin(angle);
      const y1 = CY - rInner * Math.cos(angle);
      const x2 = CX + rOuter * Math.sin(angle);
      const y2 = CY - rOuter * Math.cos(angle);

      list.push({
        key: i,
        x1,
        y1,
        x2,
        y2,
        isHour,
      });
    }
    return list;
  }, []);

  // Numbers 1 to 12 coordinates
  const clockNumbers = useMemo(() => {
    const list = [];
    for (let n = 1; n <= 12; n++) {
      const angle = (n * 30 * Math.PI) / 180;
      const r = 70;
      const x = CX + r * Math.sin(angle);
      const y = CY - r * Math.cos(angle) + 4.5; // subtle vertical alignment
      list.push({ num: n, x, y });
    }
    return list;
  }, []);

  return (
    <div className={`space-y-3.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            <span>{label}</span>
          </label>
          <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
            Asia/Kolkata (IST)
          </span>
        </div>
      )}

      {/* Main Analog Clock Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex flex-col items-center">
        {/* Interactive Mode Switcher (Hour / Minute) */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl mb-3 border border-slate-200/70">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setActiveMode('hour')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeMode === 'hour'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hour: {String(hour12).padStart(2, '0')}
          </button>
          <span className="text-slate-400 font-bold">:</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setActiveMode('minute')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeMode === 'minute'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Minute: {String(minute).padStart(2, '0')}
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ROUND ANALOG WALL CLOCK (Matching Image 2)                  */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div className="relative flex items-center justify-center select-none">
          <svg
            ref={clockRef}
            onClick={handleClockClick}
            width={clockSize}
            height={clockSize}
            viewBox="0 0 240 240"
            className={`cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99] ${
              disabled ? 'opacity-50 pointer-events-none' : ''
            }`}
            style={{ filter: 'drop-shadow(0 10px 15px rgba(15, 23, 42, 0.15))' }}
          >
            <defs>
              {/* Outer Bezel Gradient */}
              <radialGradient id="bezelGradient" cx="50%" cy="50%" r="50%">
                <stop offset="85%" stopColor="#1e2430" />
                <stop offset="96%" stopColor="#0f131a" />
                <stop offset="100%" stopColor="#2b3240" />
              </radialGradient>

              {/* Dial Face Subtle Gradient */}
              <radialGradient id="dialGradient" cx="50%" cy="45%" r="50%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="90%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </radialGradient>
            </defs>

            {/* 1. Outer Dark Circular Bezel / Casing */}
            <circle
              cx={CX}
              cy={CY}
              r={116}
              fill="url(#bezelGradient)"
              stroke="#0f172a"
              strokeWidth="4"
            />
            {/* Inner Bezel Highlight Ring */}
            <circle
              cx={CX}
              cy={CY}
              r={105}
              fill="none"
              stroke="#334155"
              strokeWidth="1.5"
            />

            {/* 2. White Dial Face */}
            <circle
              cx={CX}
              cy={CY}
              r={101}
              fill="url(#dialGradient)"
              stroke="#cbd5e1"
              strokeWidth="1"
            />

            {/* 3. Perimeter Tick Marks (60 ticks: 12 bold hour ticks, 48 minute ticks) */}
            {ticks.map((t) => (
              <line
                key={t.key}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.isHour ? '#0f172a' : '#64748b'}
                strokeWidth={t.isHour ? 2.5 : 1}
                strokeLinecap="round"
              />
            ))}

            {/* 4. Numbers 1 through 12 */}
            {clockNumbers.map((cn) => (
              <text
                key={cn.num}
                x={cn.x}
                y={cn.y}
                textAnchor="middle"
                fontSize="15"
                fontWeight="700"
                fill="#0f172a"
                style={{
                  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                  userSelect: 'none',
                }}
              >
                {cn.num}
              </text>
            ))}

            {/* 5. Clock Hands */}
            {/* 5a. Hour Hand (Black, thicker, reaches ~48px) */}
            <g transform={`rotate(${hourAngle}, ${CX}, ${CY})`}>
              <line
                x1={CX}
                y1={CY + 8}
                x2={CX}
                y2={CY - 48}
                stroke="#0f172a"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </g>

            {/* 5b. Minute Hand (Black, longer, reaches ~74px) */}
            <g transform={`rotate(${minuteAngle}, ${CX}, ${CY})`}>
              <line
                x1={CX}
                y1={CY + 12}
                x2={CX}
                y2={CY - 74}
                stroke="#1e293b"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            </g>

            {/* 5c. Second / Accent Hand (Red with counterweight tail, like Image 2) */}
            <g transform={`rotate(${secondAccentAngle}, ${CX}, ${CY})`}>
              {/* Back counterweight tail */}
              <line
                x1={CX}
                y1={CY + 16}
                x2={CX}
                y2={CY}
                stroke="#dc2626"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Long needle pointing */}
              <line
                x1={CX}
                y1={CY}
                x2={CX}
                y2={CY - 82}
                stroke="#dc2626"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </g>

            {/* 5d. Central Pivot Hub (Red and black concentric cap) */}
            <circle cx={CX} cy={CY} r={5} fill="#dc2626" />
            <circle cx={CX} cy={CY} r={2.5} fill="#0f172a" />
          </svg>
        </div>

        <p className="text-[10px] text-slate-400 mt-2 font-medium">
          Click dial to adjust {activeMode === 'hour' ? 'Hour' : 'Minute'}
        </p>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* DIGITAL READOUT & MANUAL ADJUSTMENTS                        */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div className="w-full mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            {/* Digital Display Box */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/90 rounded-xl px-3 py-1.5">
              <Clock className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="text-sm font-black text-slate-900 tracking-wider">
                {String(hour12).padStart(2, '0')}:{String(minute).padStart(2, '0')}
              </span>
              <span className="text-xs font-bold text-teal-700 ml-0.5">{period}</span>
              <span className="text-[10px] font-semibold text-slate-400 ml-1">IST</span>
            </div>

            {/* AM / PM Toggle */}
            <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
              <button
                type="button"
                disabled={disabled}
                onClick={() => handlePeriodChange('AM')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  period === 'AM'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                } disabled:opacity-50`}
              >
                <Sun className="w-3 h-3" />
                AM
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => handlePeriodChange('PM')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  period === 'PM'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                } disabled:opacity-50`}
              >
                <Moon className="w-3 h-3" />
                PM
              </button>
            </div>
          </div>

          {/* Steppers: Hour and Minute Dropdowns for fine tuning */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                Hour
              </label>
              <select
                disabled={disabled}
                value={hour12}
                onChange={(e) => handleHourChange(parseInt(e.target.value, 10))}
                className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 cursor-pointer disabled:opacity-50"
              >
                {hoursList.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')} : 00
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                Minute
              </label>
              <select
                disabled={disabled}
                value={minute}
                onChange={(e) => handleMinuteChange(parseInt(e.target.value, 10))}
                className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 cursor-pointer disabled:opacity-50"
              >
                {minutesList.map((m) => (
                  <option key={m} value={m}>
                    :{String(m).padStart(2, '0')} min
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Quick Presets Strip */}
        {showPresets && (
          <div className="w-full pt-2.5 mt-2.5 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Quick Presets:
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {presets.map((p) => {
                const isSelected = value === p.val;
                return (
                  <button
                    key={p.val}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(p.val)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                      isSelected
                        ? 'bg-teal-50 border-teal-400 text-teal-800 shadow-2xs'
                        : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    } disabled:opacity-50`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
