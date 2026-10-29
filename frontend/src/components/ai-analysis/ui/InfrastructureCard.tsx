"use client";

import { Cpu, HardDrive, Server, Wifi } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface InfrastructureCardProps {
  cpu: number;
  memory: number;
  worker: string;
  wsConnected: boolean;
}

function Meter({ label, icon, value }: { label: string; icon: React.ReactNode; value: number }) {
  const ready = value > 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-gray-500 flex items-center gap-1.5">
          <span className="text-gray-400">{icon}</span>
          {label}
        </span>
        <span className="text-[12px] font-semibold text-gray-700 tabular-nums">
          {ready ? `${value.toFixed(1)}%` : "—"}
        </span>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            value > 75 ? "bg-amber-500" : value > 50 ? "bg-blue-500" : "bg-green-500"
          )}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

export function InfrastructureCard({ cpu, memory, worker, wsConnected }: InfrastructureCardProps) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
      <h3 className="text-[13px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <Server className="w-4 h-4 text-gray-400" />
        Infrastructure
      </h3>
      <div className="space-y-3">
        <Meter label="CPU Usage" icon={<Cpu className="w-3.5 h-3.5" />} value={cpu} />
        <Meter label="Memory" icon={<HardDrive className="w-3.5 h-3.5" />} value={memory} />
        <div className="pt-1 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[12px] text-gray-500 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-gray-400" />
            {worker || "Worker 1"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5",
              wsConnected ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-600"
            )}
          >
            <Wifi className="w-3 h-3" />
            {wsConnected ? "Connected" : "Reconnecting"}
          </span>
        </div>
      </div>
    </section>
  );
}
