import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useAuth';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { api } from '@/lib/api';
import { DashboardStats, LeaveBalance, LeaveRequest, Payslip, Notification as AppNotification } from '@/types';
import { formatDate, formatTime } from '@/lib/utils';
import {
  Users, Clock, Calendar, UserCheck, UserX,
  TrendingUp, Loader2, AlertCircle, LogIn, LogOut,
  User, Building2, CheckCircle2, Briefcase, ListTodo,
  Wallet, FileText, Package, HelpCircle, Bell, Plane,
  Timer, LogOut as ResignIcon, Plus, ArrowRight, BadgeIndianRupee,
  Megaphone, ShieldCheck, Factory, GraduationCap, LineChart
} from 'lucide-react';

interface AttendanceSession {
  id: string;
  checkIn: string;
  checkOut: string | null;
  durationHours: number | null;
}

interface TeamMemberLog {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  profilePhoto: string | null;
  designation: string | null;
  attendance: {
    id?: string;
    checkIn?: string;
    checkOut?: string;
    status?: string;
    workHours?: number;
    sessions?: AttendanceSession[];
  } | null;
}

function fmtDuration(hours: number | null | undefined): string {
  if (hours == null || hours <= 0) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function SessionLog({ sessions, workHours, checkIn, checkOut }: {
  sessions?: AttendanceSession[];
  workHours?: number;
  checkIn?: string;
  checkOut?: string;
}) {
  if (!sessions || sessions.length === 0) {
    if (!checkIn) return <p className="text-xs text-muted-foreground italic">No check-ins yet today</p>;
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
        <span className="text-muted-foreground">In:</span>
        <span className="font-medium">{formatTime(checkIn)}</span>
        {checkOut && <>
          <span className="text-muted-foreground mx-1">→</span>
          <span className="text-muted-foreground">Out:</span>
          <span className="font-medium">{formatTime(checkOut)}</span>
        </>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {sessions.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground/50 w-4 text-right flex-shrink-0">{i + 1}.</span>
          <LogIn className="w-3 h-3 text-green-500 flex-shrink-0" />
          <span className="font-medium">{formatTime(s.checkIn)}</span>
          {s.checkOut ? (
            <>
              <span className="text-muted-foreground mx-0.5">→</span>
              <LogOut className="w-3 h-3 text-red-400 flex-shrink-0" />
              <span className="font-medium">{formatTime(s.checkOut)}</span>
              <span className="ml-auto text-muted-foreground">{fmtDuration(s.durationHours)}</span>
            </>
          ) : (
            <span className="ml-auto text-green-600 font-medium text-[10px] uppercase tracking-wide">Active</span>
          )}
        </div>
      ))}
      {workHours != null && workHours > 0 && (
        <div className="pt-1 border-t text-xs flex justify-between text-muted-foreground">
          <span>Total today</span>
          <span className="font-semibold text-foreground">{fmtDuration(workHours)}</span>
        </div>
      )}
    </div>
  );
}

interface MyDocument {
  id: string;
  type: string;
  name: string;
  isVerified: boolean;
  uploadedAt: string;
}

interface MyAssetAssignment {
  id: string;
  assignedAt: string;
  asset?: { id: string; name: string; type: string; serialNumber?: string };
}

interface MyTicket {
  id: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  createdAt: string;
}

interface MyExpense {
  id: string;
  amount: number;
  category?: string;
  status: string;
  createdAt: string;
}

interface MyStats {
  presentDays: number;
  halfDays: number;
  totalWorkHours: number;
  pendingLeaves: number;
  approvedThisMonth: LeaveRequest[];
  balances: LeaveBalance[];
  isProbation: boolean;
  probationEnds: string | null;
  monthName: string;
}
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

interface TodayAttendance {
  id?: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  workHours?: number;
  sessions?: AttendanceSession[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const { can, isSuperAdmin, role } = useRole();
  const { hasModule } = useModuleAccess();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [todayAtt, setTodayAtt] = useState<TodayAttendance | null>(null);
  const [teamLogs, setTeamLogs] = useState<TeamMemberLog[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [attLoading, setAttLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [attMsg, setAttMsg] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Self-service widgets — payslip, documents, assets, helpdesk, notifications
  const [latestPayslip, setLatestPayslip] = useState<Payslip | null>(null);
  const [myDocuments, setMyDocuments] = useState<MyDocument[]>([]);
  const [myAssets, setMyAssets] = useState<MyAssetAssignment[]>([]);
  const [myTickets, setMyTickets] = useState<MyTicket[]>([]);
  const [myNotifications, setMyNotifications] = useState<AppNotification[]>([]);
  const [myExpenses, setMyExpenses] = useState<MyExpense[]>([]);
  const [widgetsLoading, setWidgetsLoading] = useState(true);

  const isPlainManager = role === 'MANAGER';
  const isManagerOrAbove = can('MANAGER');

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [statsRes, myStatsRes] = await Promise.allSettled([
        api.get<{ data: DashboardStats }>('/api/dashboard/stats'),
        api.get<{ data: MyStats }>('/api/dashboard/my-stats'),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.data);
      if (myStatsRes.status === 'fulfilled') setMyStats(myStatsRes.value.data.data);
    } catch {
      setError('Failed to load dashboard stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchAttendance = useCallback(async (silent = false) => {
    if (!silent) setAttLoading(true);
    try {
      const r = await api.get<{ data: TodayAttendance }>('/api/attendance/today');
      setTodayAtt(r.data.data ?? null);
    } catch {
      setTodayAtt(null);
    } finally {
      if (!silent) setAttLoading(false);
    }
  }, []);

  const fetchTeamLogs = useCallback(async () => {
    setTeamLoading(true);
    try {
      const r = await api.get<{ data: TeamMemberLog[] }>('/api/attendance/team-today-logs');
      setTeamLogs(r.data.data ?? []);
    } catch {
      setTeamLogs([]);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  const fetchWidgets = useCallback(async () => {
    setWidgetsLoading(true);
    try {
      const calls: Promise<any>[] = [
        api.get<{ data: Payslip[] }>('/api/payroll/my-payslips'),
        api.get<{ data: MyDocument[] }>('/api/documents/my'),
        api.get<{ data: MyAssetAssignment[] }>('/api/assets/my'),
        api.get<{ data: MyTicket[] }>('/api/helpdesk/my'),
        api.get<{ notifications: AppNotification[]; total: number }>('/api/notifications?limit=5'),
      ];
      if (hasModule('FINANCE_ADMIN')) {
        calls.push(api.get<{ data: MyExpense[] }>('/api/finance-admin?limit=5'));
      }
      const results = await Promise.allSettled(calls);
      if (results[0].status === 'fulfilled') {
        const slips = results[0].value.data.data ?? [];
        setLatestPayslip(slips[0] ?? null);
      }
      if (results[1].status === 'fulfilled') setMyDocuments(results[1].value.data.data ?? []);
      if (results[2].status === 'fulfilled') setMyAssets(results[2].value.data.data ?? []);
      if (results[3].status === 'fulfilled') setMyTickets(results[3].value.data.data ?? []);
      if (results[4].status === 'fulfilled') setMyNotifications(results[4].value.data.notifications ?? []);
      if (results[5]?.status === 'fulfilled') setMyExpenses(results[5].value.data.data ?? []);
    } finally {
      setWidgetsLoading(false);
    }
  }, [hasModule]);

  useEffect(() => {
    fetchStats();
    if (!isSuperAdmin) fetchAttendance();
    if (!isSuperAdmin) fetchWidgets();
    if (isManagerOrAbove && !isSuperAdmin) fetchTeamLogs();
  }, [fetchStats, fetchAttendance, fetchWidgets, fetchTeamLogs, isSuperAdmin, isManagerOrAbove]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    setAttMsg('');
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch { /* GPS denied */ }

      const r = await api.post<{ message: string }>('/api/attendance/check-in', { lat, lng });
      await fetchAttendance(true);
      if (isManagerOrAbove) fetchTeamLogs();
      setAttMsg(r.data.message ?? 'Checked in!');
      setTimeout(() => setAttMsg(''), 5000);
    } catch (e: any) {
      setAttMsg(e.response?.data?.message ?? 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    setAttMsg('');
    try {
      await api.post('/api/attendance/check-out', {});
      await fetchAttendance(true);
      if (isManagerOrAbove) fetchTeamLogs();
      setAttMsg('Checked out successfully!');
      setTimeout(() => setAttMsg(''), 4000);
      fetchStats();
    } catch (e: any) {
      setAttMsg(e.response?.data?.message ?? 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  };

  const emp = user?.employee;
  const firstName = emp?.firstName ?? user?.email?.split('@')[0] ?? 'User';
  const managerName = emp?.manager
    ? `${emp.manager.firstName} ${emp.manager.lastName}`
    : null;

  const checkedIn = !!todayAtt?.checkIn && !todayAtt?.checkOut;
  const hasCheckedOut = !!todayAtt?.checkOut;

  const statCards = [
    {
      label: isPlainManager ? 'My Team' : 'Total Employees',
      value: stats?.totalEmployees ?? 0,
      icon: Users,
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: 'Present Today',
      value: stats?.presentToday ?? 0,
      icon: UserCheck,
      color: 'text-green-600 bg-green-50 dark:bg-green-950/30',
    },
    {
      label: 'On Leave',
      value: stats?.onLeaveToday ?? 0,
      icon: Calendar,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
    },
    {
      label: 'Absent Today',
      value: stats?.absentToday ?? 0,
      icon: UserX,
      color: 'text-red-500 bg-red-50 dark:bg-red-950/30',
    },
    {
      label: 'Pending Leaves',
      value: stats?.pendingLeaves ?? 0,
      icon: Clock,
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30',
    },
    {
      label: 'New This Month',
      value: stats?.newJoineeThisMonth ?? 0,
      icon: TrendingUp,
      color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">Good {getGreeting()}, {firstName}!</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{formatDate(new Date().toISOString())}</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 text-red-500 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Top row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isSuperAdmin ? (
          <div className="md:col-span-2 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 text-white flex flex-col justify-between">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-1">Owner Dashboard</p>
                <p className="text-3xl font-bold font-mono tracking-tight">
                  {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: 'Total Employees', value: stats?.totalEmployees ?? '—' },
                { label: 'Present Today',   value: stats?.presentToday ?? '—' },
                { label: 'Pending Leaves',  value: stats?.pendingLeaves ?? '—' },
              ].map(c => (
                <div key={c.label} className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-center">
                  <p className="text-2xl font-bold">{c.value}</p>
                  <p className="text-slate-400 text-[10px] mt-0.5">{c.label}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Today's sessions card */
          <div className="md:col-span-2 bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold">Today's Sessions</p>
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold font-mono tabular-nums">
                  {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </p>
                {(todayAtt?.workHours ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">{fmtDuration(todayAtt?.workHours)} today</p>
                )}
              </div>
            </div>

            {attMsg && (
              <p className="text-sm text-blue-600 dark:text-blue-400 mb-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2">{attMsg}</p>
            )}

            {attLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="space-y-3">
                <SessionLog
                  sessions={todayAtt?.sessions}
                  workHours={todayAtt?.workHours}
                  checkIn={todayAtt?.checkIn}
                  checkOut={todayAtt?.checkOut}
                />
                <div className="flex items-center gap-3 pt-2 border-t flex-wrap">
                  {actionLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Please wait…
                    </div>
                  ) : checkedIn ? (
                    <button onClick={handleCheckOut}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors border border-red-200">
                      <LogOut className="w-3.5 h-3.5" /> Check Out
                    </button>
                  ) : (
                    <button onClick={handleCheckIn}
                      className="flex items-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-medium transition-colors border border-green-200">
                      <LogIn className="w-3.5 h-3.5" /> {hasCheckedOut ? 'Check In Again' : 'Check In'}
                    </button>
                  )}
                  <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full',
                    checkedIn ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-muted text-muted-foreground border'
                  )}>
                    {checkedIn ? '● Active' : hasCheckedOut ? '✓ Done for now' : '○ Not checked in'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Profile card */}
        <div className="bg-card border rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0">
              {firstName[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{firstName} {emp?.lastName ?? ''}</p>
              <p className="text-xs text-muted-foreground truncate">{emp?.designation?.name ?? user?.role?.replace(/_/g, ' ')}</p>
              {emp?.employeeCode && (
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{emp.employeeCode}</p>
              )}
            </div>
          </div>
          <div className="space-y-2.5 text-sm">
            {emp?.department && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{emp.department.name}</span>
              </div>
            )}
            {managerName && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Reporting Manager</p>
                  <p className="text-xs font-medium text-foreground truncate">{managerName}</p>
                </div>
              </div>
            )}
            {emp?.branch && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate text-xs">{emp.branch.name}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions — self-service shortcuts to the rest of the portal */}
      {!isSuperAdmin && emp && (
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { to: '/leave', label: 'Apply Leave', icon: Plane, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
              { to: '/permissions', label: 'Permission', icon: Timer, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
              { to: '/helpdesk', label: 'Raise Ticket', icon: HelpCircle, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30' },
              { to: '/payroll', label: 'My Payslips', icon: Wallet, color: 'text-green-600 bg-green-50 dark:bg-green-950/30' },
              { to: '/documents', label: 'My Documents', icon: FileText, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' },
              { to: '/resignation', label: 'Resignation', icon: ResignIcon, color: 'text-red-500 bg-red-50 dark:bg-red-950/30' },
            ].map((a) => {
              const Icon = a.icon;
              return (
                <Link key={a.to} to={`/${a.to.replace(/^\//, '')}`}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border hover:shadow-sm hover:border-foreground/20 transition-all text-center">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', a.color)}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-xs font-medium leading-tight">{a.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Self-service widgets — payslip, documents, assets, helpdesk, notifications */}
      {!isSuperAdmin && emp && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Latest Payslip */}
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-muted-foreground" /> Latest Payslip
              </h3>
              <Link to="/payroll" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {widgetsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : latestPayslip ? (
              <div>
                <p className="text-2xl font-bold flex items-center gap-1">
                  <BadgeIndianRupee className="w-4 h-4 text-muted-foreground" />
                  {latestPayslip.netSalary?.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Net pay — {new Date(latestPayslip.year, latestPayslip.month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No payslips generated yet.</p>
            )}
          </div>

          {/* My Documents */}
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" /> My Documents
              </h3>
              <Link to="/documents" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                Manage <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {widgetsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : myDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No documents uploaded yet.</p>
            ) : (
              <div>
                <p className="text-2xl font-bold">{myDocuments.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {myDocuments.filter(d => d.isVerified).length} verified · {myDocuments.filter(d => !d.isVerified).length} pending
                </p>
              </div>
            )}
          </div>

          {/* My Assets */}
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" /> My Assets
              </h3>
              <Link to="/assets" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {widgetsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : myAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No assets assigned.</p>
            ) : (
              <div className="space-y-1.5">
                {myAssets.slice(0, 3).map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{a.asset?.name ?? 'Asset'}</span>
                    <span className="text-xs text-muted-foreground">{a.asset?.type}</span>
                  </div>
                ))}
                {myAssets.length > 3 && (
                  <p className="text-xs text-muted-foreground pt-1">+{myAssets.length - 3} more</p>
                )}
              </div>
            )}
          </div>

          {/* Helpdesk tickets */}
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-muted-foreground" /> Helpdesk
              </h3>
              <Link to="/helpdesk" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                <Plus className="w-3 h-3" /> New ticket
              </Link>
            </div>
            {widgetsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : myTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No tickets raised.</p>
            ) : (
              <div className="space-y-1.5">
                {myTickets.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate">{t.subject}</span>
                    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0',
                      t.status === 'OPEN' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      t.status === 'IN_PROGRESS' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      t.status === 'RESOLVED' ? 'bg-green-50 text-green-700 border-green-200' :
                      'bg-gray-50 text-gray-600 border-gray-200'
                    )}>{t.status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent notifications */}
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Bell className="w-4 h-4 text-muted-foreground" /> Notifications
              </h3>
              <Link to="/notifications" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {widgetsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : myNotifications.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">You're all caught up.</p>
            ) : (
              <div className="space-y-2">
                {myNotifications.slice(0, 3).map((n) => (
                  <div key={n.id} className="text-sm">
                    <p className={cn('truncate', !n.isRead && 'font-medium')}>{n.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Finance Admin: my expenses (self-scoped) */}
          {hasModule('FINANCE_ADMIN') && (
            <div className="bg-card border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <BadgeIndianRupee className="w-4 h-4 text-muted-foreground" /> My Expenses
                </h3>
                <Link to="/finance/admin" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {widgetsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : myExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No expenses submitted.</p>
              ) : (
                <div className="space-y-1.5">
                  {myExpenses.slice(0, 3).map((e) => (
                    <div key={e.id} className="flex items-center justify-between text-sm gap-2">
                      <span className="truncate">{e.category ?? 'Expense'}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">₹{e.amount?.toLocaleString('en-IN')} · {e.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Department modules I have access to — quick links into module-wide tools */}
      {!isSuperAdmin && (hasModule('SALES') || hasModule('FINANCE_SALES') || hasModule('PRODUCTION_TRAINING') || hasModule('PLACEMENTS') || hasModule('DIGITAL_MARKETING')) && (
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-4">My Modules</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { module: 'SALES' as const, to: '/sales', label: 'Sales', icon: TrendingUp, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30' },
              { module: 'FINANCE_SALES' as const, to: '/finance/sales', label: 'Finance (Sales)', icon: LineChart, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
              { module: 'PRODUCTION_TRAINING' as const, to: '/production', label: 'Production', icon: Factory, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30' },
              { module: 'PLACEMENTS' as const, to: '/placements', label: 'Placements', icon: GraduationCap, color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30' },
              { module: 'DIGITAL_MARKETING' as const, to: '/digital-marketing', label: 'Digital Marketing', icon: Megaphone, color: 'text-pink-600 bg-pink-50 dark:bg-pink-950/30' },
            ].filter(m => hasModule(m.module)).map((m) => {
              const Icon = m.icon;
              return (
                <Link key={m.to} to={m.to}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border hover:shadow-sm hover:border-foreground/20 transition-all text-center">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', m.color)}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="text-xs font-medium leading-tight">{m.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Manager/HR: stat cards + attendance trend */}
      {isManagerOrAbove && (
        <>
          {statsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-card border rounded-xl p-4 h-24 animate-pulse bg-muted/50" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {statCards.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="bg-card border rounded-xl p-4 hover:shadow-sm transition-shadow">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', s.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className="text-2xl font-bold leading-tight">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                );
              })}
            </div>
          )}

          {stats?.attendanceTrend && stats.attendanceTrend.length > 0 && (
            <div className="bg-card border rounded-xl p-5">
              <h2 className="font-semibold mb-4">Attendance Trend (Last 7 Days)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={stats.attendanceTrend}>
                  <defs>
                    <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                    formatter={(v: number) => [v, 'Present']}
                  />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#attGrad)" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Manager: team today log */}
      {isManagerOrAbove && !isSuperAdmin && (
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-4">
            {isPlainManager ? "My Team's" : "Employees'"} Today Log
          </h2>
          {teamLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading team logs…
            </div>
          ) : teamLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {teamLogs.map(member => {
                const att = member.attendance;
                const statusColor = !att ? 'bg-red-50 text-red-700 border-red-200' :
                  att.status === 'PRESENT' ? 'bg-green-50 text-green-700 border-green-200' :
                  att.status === 'HALF_DAY' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  att.status === 'ON_LEAVE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  'bg-red-50 text-red-700 border-red-200';
                const statusLabel = !att ? 'Absent' :
                  att.status === 'PRESENT' ? 'Present' :
                  att.status === 'HALF_DAY' ? 'Half Day' :
                  att.status === 'ON_LEAVE' ? 'On Leave' : 'Absent';

                return (
                  <div key={member.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {member.firstName[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{member.firstName} {member.lastName}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{member.designation ?? member.employeeCode}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {att?.workHours != null && att.workHours > 0 && (
                          <span className="text-xs text-muted-foreground">{fmtDuration(att.workHours)}</span>
                        )}
                        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border', statusColor)}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    <SessionLog
                      sessions={att?.sessions}
                      workHours={att?.workHours}
                      checkIn={att?.checkIn}
                      checkOut={att?.checkOut}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Employee personal metrics */}
      {!isSuperAdmin && myStats && (
        <div className="space-y-4">
          <h2 className="font-semibold text-base">
            My {myStats.monthName} Overview
            {myStats.isProbation && (
              <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 px-2 py-0.5 rounded-full">
                Probation{myStats.probationEnds ? ` · ends ${formatDate(myStats.probationEnds)}` : ''}
              </span>
            )}
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 text-green-600 bg-green-50 dark:bg-green-950/30">
                <UserCheck className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold">{myStats.presentDays}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Present Days</p>
              {myStats.halfDays > 0 && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">+{myStats.halfDays} half-days</p>
              )}
            </div>
            <div className="bg-card border rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 text-blue-600 bg-blue-50 dark:bg-blue-950/30">
                <Clock className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold">{(myStats.totalWorkHours ?? 0).toFixed(1)}h</p>
              <p className="text-xs text-muted-foreground mt-0.5">Work Hours</p>
            </div>
            <div className="bg-card border rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 text-purple-600 bg-purple-50 dark:bg-purple-950/30">
                <ListTodo className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold">{myStats.pendingLeaves}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pending Approvals</p>
            </div>
            <div className="bg-card border rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold">{myStats.approvedThisMonth.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Approved Leaves</p>
            </div>
          </div>

          {myStats.balances.length > 0 && (
            <div className="bg-card border rounded-xl p-5">
              <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-muted-foreground" />
                Leave Balances
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {myStats.balances.map((b) => {
                  const remaining = b.totalDays - b.usedDays - b.pendingDays;
                  const pct = b.totalDays > 0 ? (remaining / b.totalDays) * 100 : 0;
                  return (
                    <div key={b.id} className="border rounded-lg p-3">
                      <p className="text-xs font-medium text-muted-foreground truncate">{b.leaveType.name}</p>
                      <p className="text-xl font-bold mt-1">{remaining}</p>
                      <p className="text-[10px] text-muted-foreground">of {b.totalDays} remaining</p>
                      <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {myStats.approvedThisMonth.length > 0 && (
            <div className="bg-card border rounded-xl p-5">
              <h3 className="font-medium text-sm mb-3">Approved Leaves This Month</h3>
              <div className="space-y-2">
                {myStats.approvedThisMonth.map((lr) => (
                  <div key={lr.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span>{lr.leaveType?.name ?? 'Leave'}</span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {formatDate(lr.startDate)} – {formatDate(lr.endDate)}
                      <span className="ml-2 font-medium text-foreground">{lr.days}d</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upcoming birthdays */}
      {stats?.upcomingBirthdays && stats.upcomingBirthdays.length > 0 && (
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-3">🎂 Upcoming Birthdays</h2>
          <div className="flex flex-wrap gap-3">
            {stats.upcomingBirthdays.map((b) => (
              <div key={b.name} className="flex items-center gap-2.5 px-3 py-2 bg-pink-50 dark:bg-pink-950/20 border border-pink-100 dark:border-pink-900 rounded-lg">
                <span className="text-lg">🎂</span>
                <div>
                  <p className="text-sm font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(b.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
