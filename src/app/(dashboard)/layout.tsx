'use client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { SidebarProvider } from '@/components/layout/SidebarContext';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface OnboardingStatus {
  status: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const token = useSelector((s: RootState) => s.auth.token);
  const router = useRouter();
  const pathname = usePathname();

  const [onbChecked, setOnbChecked] = useState(false);

  useSocket(token);

  useEffect(() => {
    if (!loading && !token) router.push('/login');
  }, [loading, token, router]);

  // Employees may not reach the dashboard until onboarding is fully COMPLETED
  // (profile filled in, documents uploaded, policy agreed, documents signed,
  // original documents confirmed, and HR's final approval granted).
  useEffect(() => {
    if (!user || user.role !== 'EMPLOYEE') { setOnbChecked(true); return; }
    api.get('/api/onboarding/my')
      .then(r => {
        const data = r.data.data as OnboardingStatus | null;
        if (data && data.status !== 'COMPLETED') {
          router.push('/setup');
          return;
        }
        setOnbChecked(true);
      })
      .catch(() => setOnbChecked(true));
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user.role === 'EMPLOYEE' && !onbChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Header />
        <main className="pl-0 lg:pl-64 pt-16 min-h-screen">
          <div className="p-3 sm:p-6 animate-fade-in">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
