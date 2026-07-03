import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import {
  Loader2, LayoutDashboard, CalendarCheck, ClipboardList, Award, Briefcase, UserCircle,
  LogOut, BookOpen, Trophy, Gift, FileText, ListChecks, BadgeCheck, ChevronDown, Lock, Menu,
} from 'lucide-react';
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
  const [showMenu, setShowMenu] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !token) navigate('/login');
  }, [loading, token, navigate]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const initials = `${user.student?.firstName?.[0] || ''}${user.student?.lastName?.[0] || ''}`.toUpperCase() || 'S';

  const sidebar = (
    <>
      {/* Brand */}
      <div className="h-20 flex flex-col items-center justify-center gap-1 px-5 border-b bg-white">
        <img src="/vinsup-logo.png" alt="Vinsup Skill Academy" className="h-9 w-auto" />
        <span className="text-[10px] font-semibold tracking-[0.2em] text-blue-900 uppercase">Student Portal</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileNav(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="hidden lg:flex flex-col w-64 border-r bg-card fixed inset-y-0">{sidebar}</aside>

      {/* Mobile slide-over nav */}
      {mobileNav && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-card flex flex-col shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 lg:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-2 lg:hidden">
            <button onClick={() => setMobileNav(true)} className="p-1.5 rounded-lg hover:bg-muted">
              <Menu className="w-5 h-5" />
            </button>
            <img src="/vinsup-logo.png" alt="Vinsup" className="h-7 w-auto" />
          </div>

          {/* Profile menu */}
          <div className="relative ml-auto" ref={menuRef}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="flex items-center gap-2.5 pl-2 pr-2.5 py-1.5 rounded-full hover:bg-muted transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white flex items-center justify-center text-xs font-bold">
                {initials}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <p className="text-sm font-medium">{user.student?.firstName} {user.student?.lastName}</p>
                <p className="text-[10px] text-muted-foreground">{user.student?.studentCode} · {user.student?.track}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-12 w-56 bg-card border rounded-xl shadow-xl z-50 overflow-hidden py-1">
                <div className="px-4 py-2.5 border-b">
                  <p className="text-sm font-semibold">{user.student?.firstName} {user.student?.lastName}</p>
                  <p className="text-[11px] text-muted-foreground">{user.student?.studentCode} · {user.student?.track} track</p>
                </div>
                <Link to="/student/profile" onClick={() => setShowMenu(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors">
                  <UserCircle className="w-4 h-4 text-muted-foreground" /> My Profile
                </Link>
                <Link to="/change-password" onClick={() => setShowMenu(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors">
                  <Lock className="w-4 h-4 text-muted-foreground" /> Change Password
                </Link>
                <div className="border-t my-1" />
                <button onClick={() => { setShowMenu(false); signOut(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 text-red-600 transition-colors text-left">
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
