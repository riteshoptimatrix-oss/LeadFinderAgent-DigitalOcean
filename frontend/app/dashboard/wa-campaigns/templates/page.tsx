'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Templates are now managed in /dashboard/whatsapp (Templates tab).
 * This page redirects for backwards compatibility.
 */
export default function WATemplatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/whatsapp');
  }, [router]);
  return null;
}
