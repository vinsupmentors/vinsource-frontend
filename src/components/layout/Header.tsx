import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { fetchNotifications, markAllRead } from '@/store/slices/notificationSlice';
import { logout } from '@/store/slices/authSlice';
import { useAuth } from '@/hooks/useAuth';
import { Bell, Sun, Moon, Search, ChevronDown, CheckCheck, Settings, User, Lock, LogOut, Menu } from 'lucide-react';
import { cn, timeAgo, getInitials } from '@/lib/utils';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { useSidebarContext } from './SidebarContext';

export function Header() {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useAuth();
  const { unreadCount, items } = useSelector((s: RootState) => s.notifications);
  const { toggle: toggleSidebar } = useSidebarContext();

  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [showNotif, setShowNotif] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => { dispatch(fetchNotifications()); }, [dispatch]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUser(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const emp = user?.employee;
  const fullName = emp ? `${emp.firstName} ${emp.lastName}` : user?.email ?? '';

  const notifIconMap: Record<string, string> = {
    LEAVE_REQUEST: '📋', LEAVE_APPROVED: '✅', LEAVE_REJECTED: '❌',
    PAYROLL_GENERATED: '💰', BIRTHDAY: '🎂', ANNIVERSARY: '🎉', SYSTEM: '🔔',
  };

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-card border-b border-border z-30 flex items-center px-3 sm:px-5 gap-2 sm:gap-4">
      {/* Mobile hamburger */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors flex-shrink-0"
        title="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-sm hidden sm:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            placeholder="Search…"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* Dark mode */}
        <button
          onClick={() => setDark((d) => !d)}
          className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          title="Toggle dark mode"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setShowNotif((v) => !v); setShowUser(false); }}
            className="relative w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotif && (
            <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-14 sm:top-11 w-auto sm:w-96 bg-card border rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <h3 className="font-semibold text-sm">Notifications</h3>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => dispatch(markAllRead())}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <CheckCheck className="w-3 h-3" /> Mark all read
                    </button>
                  )}
                  <Link
                    to="/notifications"
                    onClick={() => setShowNotif(false)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    View all
                  </Link>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y">
                {items.slice(0, 8).length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Bell className="w-6 h-6 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : items.slice(0, 8).map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40',
                      !n.isRead && 'bg-blue-50/60 dark:bg-blue-950/20'
                    )}
                  >
                    <span className="text-xl flex-shrink-0">{notifIconMap[n.type] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        {!n.isRead && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative ml-1" ref={userRef}>
          <button
            onClick={() => { setShowUser((v) => !v); setShowNotif(false); }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-bold">
              {getInitials(fullName)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium leading-tight">{fullName}</p>
              <p className="text-[10px] text-muted-foreground capitalize">
                {user?.role?.replace(/_/g, ' ').toLowerCase()}
              </p>
            </div>
            <ChevronDown className="w-3 h-3 text-muted-foreground hidden sm:block" />
          </button>

          {showUser && (
            <div className="absolute right-0 top-11 w-52 bg-card border rounded-xl shadow-xl z-50 overflow-hidden py-1">
              <Link to="/profile" onClick={() => setShowUser(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors">
                <User className="w-4 h-4 text-muted-foreground" /> My Profile
              </Link>
              <button
                onClick={() => { setShowUser(false); setShowChangePw(true); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-left"
              >
                <Lock className="w-4 h-4 text-muted-foreground" /> Change Password
              </button>
              <Link to="/settings" onClick={() => setShowUser(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted transition-colors">
                <Settings className="w-4 h-4 text-muted-foreground" /> Settings
              </Link>
              <div className="border-t my-1" />
              <button
                onClick={() => { setShowUser(false); dispatch(logout()); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </header>
  );
}
