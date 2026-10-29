'use client';

import { usePathname } from 'next/navigation';

const routeTitleMap: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/search': 'Lead Search Engine',
  '/dashboard/leads': 'Leads Database',
  '/dashboard/whatsapp-ai': 'WhatsApp AI Agent',
  '/dashboard/email-ai': 'Email AI Agent',
  '/dashboard/settings': 'Settings',
  '/dashboard/search/history': 'Search History',
  '/dashboard/search/details': 'Search Details',
  '/dashboard/search/job/detail': 'Search Execution Engine',
  '/dashboard/profile': 'My Profile',
  '/dashboard/admin': 'Admin Dashboard',
  '/dashboard/admin/user-activity': 'User Activity Center',
  '/forgot-password': 'Reset Password',
};

export default function PageHeader({ title }: { title?: string }) {
  const pathname = usePathname();
  
  // Try to match the exact pathname first, if not found, you can pass a custom title
  const resolvedTitle = title || routeTitleMap[pathname] || 'Overview';
  
  return (
    <h1 className="text-[15px] sm:text-[18px] font-semibold text-slate-700 text-left">
      {resolvedTitle}
    </h1>
  );
}
