'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * WA Campaigns is now consolidated into /dashboard/whatsapp.
 * This page redirects for backwards compatibility.
 */
export default function WACampaignsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/whatsapp');
  }, [router]);
  return null;
}
