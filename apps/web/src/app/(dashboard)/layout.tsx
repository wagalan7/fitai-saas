import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import ProfileGuard from '@/components/dashboard/ProfileGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <ProfileGuard />
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Desktop-only top header */}
        <div className="hidden lg:block">
          <Header />
        </div>
        {/*
          Mobile: pt-14 = clear the fixed top bar (h-14)
                  pb-16 = clear the fixed bottom nav (~56px + safe area)
          Desktop: normal padding
        */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pt-[72px] pb-[80px] lg:pt-6 lg:pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
