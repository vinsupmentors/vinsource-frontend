import { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, LayoutDashboard, CalendarCheck, ClipboardList, Award, Briefcase, UserCircle, LogOut, GraduationCap, BookOpen, Trophy, Gift, FileText, ListChecks, BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/student/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/student/test', label: 'Test', icon: ClipboardList },
  { to: '/student/course-content', label: 'Course Content', icon: BookOpen },
  { to: '/student/projects', label: 'Projects', icon: FileText },
  { to: '/student/feedback-forms', label: 'Feedback', icon: ListChecks },
  { to: '/student/rank-card', label: 'Rank Card', icon: Trophy },
  { to: '/student/portfolio', label: 'Portfolio', icon: BadgeCheck },
  { to: '/student/certificates', label: 'Certificates', icon: Award },
  { to: '/student/placements', label: 'Placements', icon: Briefcase },
  { to: '/student/refer-friend', label: 'Refer a Friend', icon: Gift },
  { to: '/student/profile', label: 'Profile', icon: UserCircle },
];

export function StudentLayout() {
  const { user, loading, signOut } = useAuth();
  const token = useSelector((s: RootState) => s.auth.token);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !token) navigate('/login');
  }, [loading, token, navigate]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Non-students should never see this shell.
  if (user.role !== 'STUDENT') return <Navigate to="/dashboard" replace />;

  // Force first-login password change + MIS completion before anything else.
  const mustOnboard = user.mustChangePassword || !user.student?.profileCompletedAt;
  if (mustOnboard) return <Navigate to="/student/complete-profile" replace />;

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:flex flex-col w-64 border-r bg-card fixed inset-y-0">
        <div className="h-16 flex items-center gap-2 px-5 border-b">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <GraduationCap className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-semibold text-sm">Student Portal</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 lg:px-6 sticky top-0 z-10">
          <div className="lg:hidden font-semibold text-sm">Student Portal</div>
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-sm font-medium">{user.student?.firstName} {user.student?.lastName}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{user.student?.studentCode}</span>
            <button onClick={signOut} className="lg:hidden text-muted-foreground">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
