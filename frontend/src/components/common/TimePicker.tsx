'use client';

import React, { useMemo, useState, useRef, useCallback } from 'react';
import { Clock } from 'lucide-react';

interface TimePickerProps {
  value: string; // "HH:MM" in 24-hour format
  onChange: (time24: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  clockSize?: number; // diameter in pixels (default 170)
  showPresets?: boolean;
}

export default function TimePicker({
  value = '09:00',
  onChange,
  disabled = false,
  label,
  className = '',
  clockSize = 170,
  showPresets = false,
}: TimePickerProps) {
  const clockRef = useRef<SVGSVGElement>(null);
  const [activeUnit, setActiveUnit] = useState<'hour' | 'minute'>('minute');
  const [isDragging, setIsDragging] = useState<boolean>(false);

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

  const handleHourChange = useCallback((newH: number) => {
    updateTime(newH, minute, period);
  }, [updateTime, minute, period]);

  const handleMinuteChange = useCallback((newM: number) => {
    updateTime(hour12, newM, period);
  }, [updateTime, hour12, period]);

  const handlePeriodChange = useCallback((newP: 'AM' | 'PM') => {
    updateTime(hour12, minute, newP);
  }, [updateTime, hour12, minute]);

  // Clock Hand Angles (Degrees from 12 o'clock / top)
  const hourAngle = useMemo(() => {
    return ((hour12 % 12) + minute / 60) * 30;
  }, [hour12, minute]);

  const minuteAngle = useMemo(() => {
    return minute * 6;
  }, [minute]);

  // Second / Accent Hand angle: fixed at ~10:36 matching Image 2
  const secondAccentAngle = 318;

  // Unified Pointer Handler for Click & Drag on the Clock Dial
  const handlePointerInteraction = useCallback((clientX: number, clientY: number) => {
    if (disabled || !clockRef.current) return;
    const rect = clockRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const x = clientX - cx;
    const y = clientY - cy;

    // Calculate angle in degrees from top (12 o'clock)
    const angleRad = Math.atan2(x, -y);
    const angleDeg = (angleRad * (180 / Math.PI) + 360) % 360;

    if (activeUnit === 'minute') {
      // Calculate minutes (0-59)
      let m = Math.round(angleDeg / 6) % 60;
      // Snap to exact 5-min mark if within 1 minute of a 5-min step
      const rem = m % 5;
      if (rem === 1) m -= 1;
      else if (rem === 4) m = (m + 1) % 60;
      handleMinuteChange(m);
    } else {
      // Calculate hour (1-12)
      let h = Math.round(angleDeg / 30) % 12;
      if (h === 0) h = 12;
      handleHourChange(h);
      // Auto-switch to minute mode after setting hour
      setActiveUnit('minute');
    }
  }, [activeUnit, disabled, handleHourChange, handleMinuteChange]);

  const hoursList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  // 60 minutes list so any minute (0-59) is supported in dropdown
  const minutesList = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

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

      list.push({ key: i, x1, y1, x2, y2, isHour });
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
      const y = CY - r * Math.cos(angle) + 4.5;
      list.push({ num: n, x, y });
    }
    return list;
  }, []);

  return (
    <div className={`space-y-2.5 ${className}`}>
      {label && (
        <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            <span>{label}</span>
          </span>
          <span className="text-[10px] font-semibold text-slate-400">Asia/Kolkata (IST)</span>
        </label>
      )}

      {/* Main Minimal Analog Clock Container */}
      <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-3 flex flex-col items-center">
        {/* Unit Selector Pills (Hour vs Minute) */}
        <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl text-xs font-bold mb-1 shadow-2xs">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setActiveUnit('hour')}
            className={`px-3.5 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1 ${
              activeUnit === 'hour'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/40'
            }`}
          >
            <span>Hour:</span>
            <span className="font-mono">{String(hour12).padStart(2, '0')}</span>
          </button>
          <span className="text-slate-400 font-black">:</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setActiveUnit('minute')}
            className={`px-3.5 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1 ${
              activeUnit === 'minute'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/40'
            }`}
          >
            <span>Minute:</span>
            <span className="font-mono">{String(minute).padStart(2, '0')}</span>
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* ROUND ANALOG WALL CLOCK (Matching Image 2)                  */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div className="relative flex items-center justify-center select-none py-1">
          <svg
            ref={clockRef}
            width={clockSize}
            height={clockSize}
            viewBox="0 0 240 240"
            className={`cursor-pointer touch-none transition-transform ${
              isDragging ? 'scale-[1.02]' : 'hover:scale-[1.01]'
            } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
            style={{ filter: 'drop-shadow(0 6px 12px rgba(15, 23, 42, 0.12))' }}
            onPointerDown={(e) => {
              if (disabled) return;
              e.preventDefault();
              try {
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
              } catch {}
              setIsDragging(true);
              handlePointerInteraction(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (disabled) return;
              if (isDragging) {
                e.preventDefault();
                handlePointerInteraction(e.clientX, e.clientY);
              }
            }}
            onPointerUp={(e) => {
              try {
                (e.currentTarget as Element).releasePointerCapture(e.pointerId);
              } catch {}
              setIsDragging(false);
            }}
            onPointerCancel={() => setIsDragging(false)}
            onClick={(e) => {
              if (disabled) return;
              handlePointerInteraction(e.clientX, e.clientY);
            }}
          >
            <defs>
              <radialGradient id="bezelGradMin" cx="50%" cy="50%" r="50%">
                <stop offset="85%" stopColor="#1e2430" />
                <stop offset="96%" stopColor="#0f131a" />
                <stop offset="100%" stopColor="#2b3240" />
              </radialGradient>
              <radialGradient id="dialGradMin" cx="50%" cy="45%" r="50%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="90%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#f1f5f9" />
              </radialGradient>
            </defs>

            <g className="pointer-events-none select-none">
              {/* 1. Outer Dark Circular Bezel / Casing */}
              <circle
                cx={CX}
                cy={CY}
                r={116}
                fill="url(#bezelGradMin)"
                stroke="#0f172a"
                strokeWidth="4"
              />
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
                fill="url(#dialGradMin)"
                stroke="#cbd5e1"
                strokeWidth="1"
              />

              {/* 3. Perimeter Tick Marks (60 ticks: 12 bold, 48 light) */}
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
                  }}
                >
                  {cn.num}
                </text>
              ))}

              {/* 5. Clock Hands */}
              {/* Hour Hand */}
              <g transform={`rotate(${hourAngle}, ${CX}, ${CY})`}>
                <line
                  x1={CX}
                  y1={CY + 8}
                  x2={CX}
                  y2={CY - 48}
                  stroke={activeUnit === 'hour' ? '#0f766e' : '#0f172a'}
                  strokeWidth={activeUnit === 'hour' ? '5.5' : '4.8'}
                  strokeLinecap="round"
                />
                {activeUnit === 'hour' && (
                  <circle cx={CX} cy={CY - 48} r={3.5} fill="#0f766e" stroke="#ffffff" strokeWidth="1.2" />
                )}
              </g>

              {/* Minute Hand (Highlighted in Teal when activeUnit is minute) */}
              <g transform={`rotate(${minuteAngle}, ${CX}, ${CY})`}>
                <line
                  x1={CX}
                  y1={CY + 12}
                  x2={CX}
                  y2={CY - 74}
                  stroke={activeUnit === 'minute' ? '#0d9488' : '#1e293b'}
                  strokeWidth={activeUnit === 'minute' ? '4.2' : '3.2'}
                  strokeLinecap="round"
                />
                {/* Active Minute Pointer Tip Indicator */}
                {activeUnit === 'minute' && (
                  <circle cx={CX} cy={CY - 74} r={3.8} fill="#0d9488" stroke="#ffffff" strokeWidth="1.2" />
                )}
              </g>

              {/* Second / Accent Needle Hand (Red with counterweight, like Image 2) */}
              <g transform={`rotate(${secondAccentAngle}, ${CX}, ${CY})`}>
                <line
                  x1={CX}
                  y1={CY + 16}
                  x2={CX}
                  y2={CY}
                  stroke="#dc2626"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <line
                  x1={CX}
                  y1={CY}
                  x2={CY - 82}
                  stroke="#dc2626"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </g>

              {/* Center Pivot Dot */}
              <circle cx={CX} cy={CY} r={5} fill="#dc2626" />
              <circle cx={CX} cy={CY} r={2.5} fill="#0f172a" />
            </g>
          </svg>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* SLEEK MINIMAL TIME CONTROLS                                 */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-slate-200/60 w-full">
          {/* Digital HH:MM Dropdown Pair */}
          <div className="flex items-center bg-white border border-slate-200/90 rounded-xl px-2.5 py-1 shadow-2xs">
            <select
              disabled={disabled}
              value={hour12}
              onFocus={() => setActiveUnit('hour')}
              onChange={(e) => {
                handleHourChange(parseInt(e.target.value, 10));
                setActiveUnit('hour');
              }}
              className={`bg-transparent text-sm font-black cursor-pointer focus:outline-hidden pr-0.5 ${
                activeUnit === 'hour' ? 'text-teal-700 font-extrabold' : 'text-slate-900'
              }`}
            >
              {hoursList.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}
                </option>
              ))}
            </select>
            <span className="text-slate-400 font-black px-0.5">:</span>
            <select
              disabled={disabled}
              value={minute}
              onFocus={() => setActiveUnit('minute')}
              onChange={(e) => {
                handleMinuteChange(parseInt(e.target.value, 10));
                setActiveUnit('minute');
              }}
              className={`bg-transparent text-sm font-black cursor-pointer focus:outline-hidden pl-0.5 ${
                activeUnit === 'minute' ? 'text-teal-700 font-extrabold' : 'text-slate-900'
              }`}
            >
              {minutesList.map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>

          {/* AM / PM Segmented Control */}
          <div className="flex items-center bg-slate-200/80 border border-slate-200 rounded-xl p-0.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => handlePeriodChange('AM')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'AM'
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              } disabled:opacity-50`}
            >
              AM
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => handlePeriodChange('PM')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                period === 'PM'
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              } disabled:opacity-50`}
            >
              PM
            </button>
          </div>

          <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg">
            IST
          </span>
        </div>

        <span className="text-[10px] text-slate-400 text-center block mt-1.5 font-medium">
          Click or drag dial to set <strong className="text-teal-700 uppercase tracking-wider">{activeUnit}</strong>
        </span>

        {/* Optional Presets */}
        {showPresets && (
          <div className="w-full pt-2 mt-2 border-t border-slate-200/60">
            <div className="grid grid-cols-3 gap-1">
              {presets.map((p) => {
                const isSelected = value === p.val;
                return (
                  <button
                    key={p.val}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(p.val)}
                    className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer text-center ${
                      isSelected
                        ? 'bg-teal-50 border-teal-400 text-teal-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
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
