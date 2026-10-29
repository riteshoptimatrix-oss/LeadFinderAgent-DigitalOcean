'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';

interface HeatmapCell {
  x: string;
  y: string;
  value: number;
  count: number;
}

interface HeatmapsData {
  technology_industry: HeatmapCell[];
  industry_score: HeatmapCell[];
  country_opportunity: HeatmapCell[];
  country_seo: HeatmapCell[];
  business_opportunity_geo: HeatmapCell[];
}

function getColor(value: number, maxVal: number, scheme: 'green' | 'blue' | 'orange' | 'purple' = 'blue'): string {
  if (maxVal === 0) return 'rgba(100,116,139,0.1)';
  const intensity = value / maxVal;
  const schemes: Record<string, [string, string]> = {
    blue: ['214,226,255', '37,99,235'],
    green: ['209,250,229', '5,150,105'],
    orange: ['255,237,213', '234,88,12'],
    purple: ['237,233,254', '109,40,217'],
  };
  const [light, dark] = schemes[scheme];
  const r1 = parseInt(light.split(',')[0]);
  const g1 = parseInt(light.split(',')[1]);
  const b1 = parseInt(light.split(',')[2]);
  const r2 = parseInt(dark.split(',')[0]);
  const g2 = parseInt(dark.split(',')[1]);
  const b2 = parseInt(dark.split(',')[2]);
  const r = Math.round(r1 + (r2 - r1) * intensity);
  const g = Math.round(g1 + (g2 - g1) * intensity);
  const b = Math.round(b1 + (b2 - b1) * intensity);
  return `rgb(${r},${g},${b})`;
}

interface HeatmapGridProps {
  title: string;
  data: HeatmapCell[];
  xLabel: string;
  yLabel: string;
  scheme?: 'green' | 'blue' | 'orange' | 'purple';
  valueLabel?: string;
}

function HeatmapGrid({ title, data, xLabel, yLabel, scheme = 'blue', valueLabel = 'Value' }: HeatmapGridProps) {
  const [tooltip, setTooltip] = useState<{ cell: HeatmapCell; x: number; y: number } | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-2">{title}</h4>
        <div className="h-[160px] flex items-center justify-center text-xs text-slate-400">No data yet</div>
      </div>
    );
  }

  const xKeys = [...new Set(data.map(c => c.x))].slice(0, 12);
  const yKeys = [...new Set(data.map(c => c.y))].slice(0, 8);
  const maxVal = Math.max(...data.map(c => c.value), 1);

  const cellMap = new Map(data.map(c => [`${c.x}||${c.y}`, c]));

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm relative">
      <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-4">{title}</h4>

      <div className="overflow-x-auto">
        <div style={{ minWidth: xKeys.length * 56 + 120 }}>
          {/* X axis labels */}
          <div className="flex mb-1" style={{ marginLeft: 100 }}>
            {xKeys.map(x => (
              <div key={x} className="text-[9px] text-slate-400 truncate text-center" style={{ width: 52, minWidth: 52 }}>
                {x}
              </div>
            ))}
          </div>

          {/* Rows */}
          {yKeys.map(y => (
            <div key={y} className="flex items-center mb-1">
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate shrink-0 text-right pr-2" style={{ width: 96 }}>
                {y}
              </div>
              {xKeys.map(x => {
                const cell = cellMap.get(`${x}||${y}`);
                const val = cell?.value ?? 0;
                const bg = getColor(val, maxVal, scheme);
                return (
                  <motion.div
                    key={x}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="rounded-md cursor-pointer relative"
                    style={{ width: 48, minWidth: 48, height: 32, backgroundColor: bg, margin: '0 2px' }}
                    onMouseEnter={(e) => {
                      if (cell) setTooltip({ cell, x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {val > 0 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90">
                        {val.toFixed(0)}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl px-3 py-2 text-xs"
          style={{ left: tooltip.x + 12, top: tooltip.y - 60 }}
        >
          <p className="font-bold text-slate-800 dark:text-white">{tooltip.cell.x} × {tooltip.cell.y}</p>
          <p className="text-slate-500">{valueLabel}: <span className="font-bold text-slate-700 dark:text-slate-300">{tooltip.cell.value.toFixed(1)}</span></p>
          <p className="text-slate-400">Sites: {tooltip.cell.count}</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4">
        <span className="text-[10px] text-slate-400">Low</span>
        <div className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ background: `linear-gradient(90deg, ${getColor(0, maxVal, scheme)}, ${getColor(maxVal, maxVal, scheme)})` }}
        />
        <span className="text-[10px] text-slate-400">High ({maxVal.toFixed(0)})</span>
      </div>
    </div>
  );
}

interface HeatmapsProps {
  data: HeatmapsData;
}

export default function Heatmaps({ data }: HeatmapsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <HeatmapGrid
        title="Technology × Industry"
        data={data.technology_industry || []}
        xLabel="Technology"
        yLabel="Industry"
        scheme="blue"
        valueLabel="Count"
      />
      <HeatmapGrid
        title="Industry × Opportunity Score"
        data={data.industry_score || []}
        xLabel="Priority"
        yLabel="Industry"
        scheme="orange"
        valueLabel="Avg Opportunity"
      />
      <HeatmapGrid
        title="Country × Business Opportunity"
        data={data.country_opportunity || []}
        xLabel="Priority Level"
        yLabel="Country"
        scheme="purple"
        valueLabel="Avg Opportunity"
      />
      <HeatmapGrid
        title="Country × SEO Score"
        data={data.country_seo || []}
        xLabel="Industry"
        yLabel="Country"
        scheme="green"
        valueLabel="Avg SEO"
      />
      <div className="lg:col-span-2">
        <HeatmapGrid
          title="Geographic Business Opportunity"
          data={data.business_opportunity_geo || []}
          xLabel="Country"
          yLabel="City"
          scheme="orange"
          valueLabel="Avg Opportunity"
        />
      </div>
    </div>
  );
}
