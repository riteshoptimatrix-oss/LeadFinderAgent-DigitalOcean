import { Suspense } from 'react';
import ClientPage from './ClientPage';

// For static export with dynamic routes, we need to generate placeholder pages
export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ClientPage />
    </Suspense>
  );
}
