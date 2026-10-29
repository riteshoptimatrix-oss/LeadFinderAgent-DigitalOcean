"use client";

import {
  ShieldCheck,
  ShieldOff,
  Globe,
  Lock,
  Server,
  TrendingUp,
  UserCheck,
  Mail,
  Phone,
  MapPin,
  Link2,
} from "lucide-react";
import { cn } from "@/src/lib/utils";

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  icon,
  positive,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[12px] text-gray-400 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "text-[13px] font-semibold text-right truncate max-w-[55%]",
          value === "—" ? "text-gray-300" : positive ? "text-green-600" : "text-gray-700"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function WebsiteStatusCard({
  onlineLabel,
  onlineTone,
  ssl,
  domain,
  hosting,
}: {
  onlineLabel: string;
  onlineTone: "online" | "offline" | "pending";
  ssl: boolean | null | undefined;
  domain?: string | null;
  hosting?: string | null;
}) {
  const sslLabel =
    ssl === undefined || ssl === null ? "—" : ssl ? "Enabled" : "Missing";
  const tone =
    onlineTone === "online"
      ? "text-green-600 bg-green-50"
      : onlineTone === "offline"
        ? "text-red-600 bg-red-50"
        : "text-blue-600 bg-blue-50";

  return (
    <Block title="Website Status">
      <div className="space-y-2">
        <Row
          label="Status"
          icon={<Globe className="w-3.5 h-3.5" />}
          value={onlineLabel}
          positive={onlineTone === "online"}
        />
        <Row
          label="SSL"
          icon={
            sslLabel === "Enabled" ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : sslLabel === "Missing" ? (
              <ShieldOff className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )
          }
          value={sslLabel}
          positive={sslLabel === "Enabled"}
        />
        <Row label="Domain" icon={<Link2 className="w-3.5 h-3.5" />} value={domain || "—"} />
        <Row label="Hosting" icon={<Server className="w-3.5 h-3.5" />} value={hosting || "—"} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", tone)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", onlineTone === "pending" && "animate-pulse", onlineTone === "online" ? "bg-green-500" : onlineTone === "offline" ? "bg-red-500" : "bg-blue-500")} />
          {onlineLabel}
        </span>
      </div>
    </Block>
  );
}

export function LeadQualityCard({
  leadQuality,
  opportunity,
}: {
  leadQuality: string;
  opportunity: string;
}) {
  const qualityTone =
    leadQuality === "Excellent" || leadQuality === "Very High"
      ? "text-green-600"
      : leadQuality === "Good" || leadQuality === "High"
        ? "text-blue-600"
        : "text-gray-700";
  const oppTone =
    opportunity === "Very High" || opportunity === "High"
      ? "text-green-600"
      : opportunity === "Medium"
        ? "text-amber-600"
        : "text-gray-700";

  return (
    <Block title="Lead Assessment">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-gray-400 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" />
            Lead Quality
          </span>
          <span className={cn("text-[13px] font-semibold", qualityTone)}>
            {leadQuality}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-gray-400 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Business Opportunity
          </span>
          <span className={cn("text-[13px] font-semibold", oppTone)}>
            {opportunity}
          </span>
        </div>
      </div>
    </Block>
  );
}

export function ContactInfoCard({
  email,
  phone,
  website,
  address,
}: {
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
}) {
  return (
    <Block title="Contact Information">
      <div className="space-y-2">
        <Row label="Email" icon={<Mail className="w-3.5 h-3.5" />} value={email || "—"} />
        <Row label="Phone" icon={<Phone className="w-3.5 h-3.5" />} value={phone || "—"} />
        <Row label="Website" icon={<Globe className="w-3.5 h-3.5" />} value={website || "—"} />
        <Row label="Address" icon={<MapPin className="w-3.5 h-3.5" />} value={address || "—"} />
      </div>
    </Block>
  );
}
