import AuthGuard from '@/src/components/AuthGuard';
import Sidebar from '@/src/components/Sidebar';
import Navbar from '@/src/components/Navbar';
import { GlobalSyncProvider } from '@/src/providers/GlobalSyncProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <GlobalSyncProvider>
        <div className="flex h-screen bg-background overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-transparent">
            <Navbar />
            <div className="flex-1 px-4 sm:px-6 lg:px-8 py-6 w-full">
              {children}
            </div>
          </main>
        </div>
      </GlobalSyncProvider>
    </AuthGuard>
  );
}
