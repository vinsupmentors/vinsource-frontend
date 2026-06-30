import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SidebarProvider } from './SidebarContext';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface OnboardingStatus {
  status: string;
}

export function DashboardLayout() {
  const { user, loading } = useAuth();
  const token = useSelector((s: RootState) => s.auth.token);
  const navigate = useNavigate();
  const [onbChecked, setOnbChecked] = useState(false);

  useSocket(token);

  useEffect(() => {
    if (!loading && !token) navigate('/login');
  }, [loading, token, navigate]);

  // Students never land on the employee dashboard — bounce them to their own portal.
  useEffect(() => {
    if (user?.role === 'STUDENT') navigate('/student', { replace: true });
  }, [user, navigate]);

  // Employees must change their temporary password before anything else.
  useEffect(() => {
    if (user && user.mustChangePassword) navigate('/change-password', { replace: true });
  }, [user, navigate]);

  // Employees may not reach the dashboard until onboarding is fully COMPLETED:
  // profile filled in, documents uploaded, policy agreed, documents signed,
  // original documents confirmed, and HR's final approval granted.
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'EMPLOYEE') {
      setOnbChecked(true);
      return;
    }
    let cancelled = false;
    api.get('/api/onboarding/my')
      .then(r => {
        if (cancelled) return;
        const data = r.data?.data as OnboardingStatus | null;
        if (data && data.status !== 'COMPLETED') {
          navigate('/setup');
          return;
        }
        setOnbChecked(true);
      })
      .catch(() => { if (!cancelled) setOnbChecked(true); });
    return () => { cancelled = true; };
  }, [user, navigate]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (user.role === 'EMPLOYEE' && !onbChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking onboarding status…</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
          <Header />
          <main className="flex-1 pt-16 overflow-auto">
            <div className="p-3 sm:p-6 animate-fade-in">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
