import { Suspense } from 'react';
import ClientPage from '../job/detail/ClientPage';

export function generateStaticParams() {
  return [];
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ClientPage />
    </Suspense>
  );
}
