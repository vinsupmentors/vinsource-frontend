import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/utils';
import { useRole } from '@/hooks/useAuth';
import {
  Clock, LogIn, LogOut, Loader2, AlertCircle,
  CheckCircle, ChevronLeft, ChevronRight, Home, Wifi,
  Calendar as CalendarIcon, HelpCircle, Send, ListChecks, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
  workHours?: number;
  locationType?: string;
  wfhStatus?: string;
  isRegularized?: boolean;
}

interface TodayAtt {
  id?: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  workHours?: number;
  locationType?: string;
  wfhStatus?: string;
}

interface RegularizationRequest {
  id: string;
  date: string;
  requestedCheckIn?: string | null;
  requestedCheckOut?: string | null;
  requestedStatus: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  managerNote?: string | null;
  actedAt?: string | null;
  createdAt: string;
}

interface TeamRegRequest extends RegularizationRequest {
  employee: { firstName: string; lastName: string; employeeCode: string };
}

const REG_STATUS_CFG: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400' },
  APPROVED: { bg: 'bg-green-100 dark:bg-green-950/40', text: 'text-green-700 dark:text-green-400' },
  REJECTED: { bg: 'bg-red-100 dark:bg-red-950/40', text: 'text-red-600 dark:text-red-400' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function calendarDays(year: number, month: number) {
  const first = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { first, daysInMonth };
}

// Status → color/label
const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  PRESENT: { bg: 'bg-green-100 dark:bg-green-950/50', text: 'text-green-700 dark:text-green-400', label: 'Present' },
  ABSENT: { bg: 'bg-red-100 dark:bg-red-950/50', text: 'text-red-600 dark:text-red-400', label: 'Absent' },
  HALF_DAY: { bg: 'bg-amber-100 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-400', label: 'Half Day' },
  ON_LEAVE: { bg: 'bg-blue-100 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-400', label: 'On Leave' },
  HOLIDAY: { bg: 'bg-purple-100 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-400', label: 'Holiday' },
  WEEKEND: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-400', label: 'Weekend' },
  WFH: { bg: 'bg-indigo-100 dark:bg-indigo-950/50', text: 'text-indigo-700 dark:text-indigo-400', label: 'WFH' },
  WFH_PENDING: { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-600 dark:text-orange-400', label: 'WFH (Pending)' },
};

function getStatusKey(r: AttendanceRecord) {
  if (r.locationType === 'WFH') {
    return r.wfhStatus === 'APPROVED' ? 'WFH' : 'WFH_PENDING';
  }
  return r.status;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { can, isSuperAdmin } = useRole();
  const [activeTab, setActiveTab] = useState<'attendance' | 'my-queries' | 'team-requests'>('attendance');

  const [today, setToday] = useState<TodayAtt | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [viewDate, setViewDate] = useState(new Date());
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);
  const [wfhMode, setWfhMode] = useState(false);

  // WFH pending list (for managers)
  const [wfhPending, setWfhPending] = useState<any[]>([]);

  // Manager: team regularization requests (all statuses)
  const [teamRequests, setTeamRequests] = useState<TeamRegRequest[]>([]);
  const [teamFilter, setTeamFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamActionId, setTeamActionId] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [noteText, setNoteText] = useState('');

  // Comp Off
  const [compOffDate, setCompOffDate] = useState<string | null>(null);
  const [compOffReason, setCompOffReason] = useState('');
  const [compOffSubmitting, setCompOffSubmitting] = useState(false);
  const [compOffSuccess, setCompOffSuccess] = useState('');

  // Attendance regularization (raise a query to the reporting manager)
  const [myRegRequests, setMyRegRequests] = useState<RegularizationRequest[]>([]);
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [regForm, setRegForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    requestedCheckIn: '',
    requestedCheckOut: '',
    requestedStatus: 'PRESENT',
    reason: '',
  });
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regSuccess, setRegSuccess] = useState('');

  const openRegModal = (prefillDate?: string) => {
    setRegForm({
      date: prefillDate ?? new Date().toISOString().slice(0, 10),
      requestedCheckIn: '',
      requestedCheckOut: '',
      requestedStatus: 'PRESENT',
      reason: '',
    });
    setRegSuccess('');
    setRegModalOpen(true);
  };

  const fetchMyRegRequests = useCallback(async () => {
    try {
      const r = await api.get<{ data: RegularizationRequest[] }>('/api/attendance-regularization/my');
      setMyRegRequests(r.data.data ?? []);
    } catch { /* ignore */ }
  }, []);

  const fetchTeamRequests = useCallback(async (filter: string = 'ALL') => {
    if (!can('MANAGER')) return;
    setTeamLoading(true);
    try {
      const q = filter !== 'ALL' ? `?status=${filter}` : '';
      const r = await api.get<{ data: TeamRegRequest[] }>(`/api/attendance-regularization/team${q}`);
      setTeamRequests(r.data.data ?? []);
    } catch { /* ignore */ } finally {
      setTeamLoading(false);
    }
  }, [can]);

  const handleTeamAction = async (id: string, action: 'approve' | 'reject', note: string) => {
    setTeamActionId(id);
    try {
      await api.put(`/api/attendance-regularization/${id}/${action}`, { note });
      setSuccess(`Request ${action}d successfully`);
      setTimeout(() => setSuccess(''), 3000);
      await fetchTeamRequests(teamFilter);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Action failed');
    } finally {
      setTeamActionId(null);
      setNoteModal(null);
      setNoteText('');
    }
  };

  const handleRegSubmit = async () => {
    if (!regForm.reason.trim()) { setError('Please describe the issue'); return; }
    setRegSubmitting(true);
    setError('');
    try {
      await api.post('/api/attendance-regularization', regForm);
      setRegSuccess('Request sent to your reporting manager for approval.');
      await fetchMyRegRequests();
      setTimeout(() => { setRegModalOpen(false); setRegSuccess(''); }, 2500);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to submit request');
    } finally {
      setRegSubmitting(false);
    }
  };

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const month = viewDate.getMonth() + 1;
      const year = viewDate.getFullYear();
      const [todayRes, histRes] = await Promise.all([
        api.get<{ data: TodayAtt }>('/api/attendance/today'),
        api.get<{ data: AttendanceRecord[] }>(`/api/attendance/history?month=${month}&year=${year}&limit=60`),
      ]);
      setToday(todayRes.data.data ?? null);
      setRecords(histRes.data.data ?? []);

      // Managers fetch WFH pending
      if (can('MANAGER')) {
        api.get<{ data: any[] }>('/api/attendance/wfh-pending')
          .then((r) => setWfhPending(r.data.data ?? []))
          .catch(() => {});
      }
    } catch {
      if (!silent) setError('Failed to load attendance');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [viewDate, can]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchMyRegRequests(); }, [fetchMyRegRequests]);
  useEffect(() => {
    if (activeTab === 'team-requests') fetchTeamRequests(teamFilter);
  }, [activeTab, teamFilter, fetchTeamRequests]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    setError('');
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch { /* GPS denied — backend treats as outside office */ }

      const r = await api.post<{ message: string }>('/api/attendance/check-in', { lat, lng });
      await fetchAll(true);
      setSuccess(r.data.message || 'Checked in!');
      setTimeout(() => setSuccess(''), 5000);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    setError('');
    try {
      await api.post('/api/attendance/check-out', {});
      await fetchAll(true);
      setSuccess('Checked out successfully!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveWfh = async (id: string, action: 'approve' | 'reject') => {
    try {
      await api.put(`/api/attendance/${id}/approve-wfh`, { action });
      await fetchAll(true);
      setSuccess(`WFH ${action}d`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Action failed');
    }
  };

  // Build a map of date string → record for the calendar
  const recordMap: Record<string, AttendanceRecord> = {};
  records.forEach((r) => {
    const key = r.date.slice(0, 10); // YYYY-MM-DD
    recordMap[key] = r;
  });

  const checkedIn = !!today?.checkIn && !today?.checkOut;
  const hasCheckedOut = !!today?.checkOut;

  const { first, daysInMonth } = calendarDays(viewDate.getFullYear(), viewDate.getMonth());
  const todayStr = new Date().toISOString().slice(0, 10);

  const prevMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  }

  if (isSuperAdmin) return <OwnerAttendanceView />;

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-muted-foreground text-sm">Track your daily attendance and WFH status</p>
        </div>
        {activeTab === 'attendance' && (
          <button
            onClick={() => openRegModal()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
          >
            <HelpCircle className="w-4 h-4" /> Raise Attendance Query
          </button>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b">
        {[
          { key: 'attendance', label: 'Attendance', icon: CalendarIcon },
          { key: 'my-queries', label: 'My Queries', icon: ListChecks, badge: myRegRequests.filter(r => r.status === 'PENDING').length },
          ...(can('MANAGER') ? [{ key: 'team-requests', label: 'Team Requests', icon: Users, badge: teamRequests.filter(r => r.status === 'PENDING').length }] : []),
        ].map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
            {badge != null && badge > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Global alerts ── */}
      {error && (
        <div className="flex items-center gap-3 text-red-500 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 text-green-600 p-3.5 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB: MY QUERIES
          ═══════════════════════════════════════════════════ */}
      {activeTab === 'my-queries' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {myRegRequests.length === 0
                ? 'No queries raised yet.'
                : `${myRegRequests.length} request${myRegRequests.length > 1 ? 's' : ''} total`}
            </p>
            <button
              onClick={() => openRegModal()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" /> Raise New Query
            </button>
          </div>

          {myRegRequests.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <HelpCircle className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No attendance queries raised</p>
              <p className="text-sm mt-1">Use "Raise New Query" to report a missing or wrong attendance record</p>
            </div>
          ) : (
            <div className="bg-card border rounded-xl overflow-hidden">
              {myRegRequests.map((r, i) => {
                const cfg = REG_STATUS_CFG[r.status];
                return (
                  <div key={r.id} className={cn('px-5 py-4', i !== 0 && 'border-t')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">
                            {new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', cfg.bg, cfg.text)}>
                            {r.status}
                          </span>
                          {r.requestedStatus && (
                            <span className="text-[10px] text-muted-foreground border px-2 py-0.5 rounded-full">
                              Requested: {r.requestedStatus.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        {(r.requestedCheckIn || r.requestedCheckOut) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {r.requestedCheckIn && <>In: {r.requestedCheckIn}</>}
                            {r.requestedCheckIn && r.requestedCheckOut && ' · '}
                            {r.requestedCheckOut && <>Out: {r.requestedCheckOut}</>}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{r.reason}</p>
                        {r.managerNote && (
                          <p className="text-xs mt-1.5 italic text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg">
                            Manager note: {r.managerNote}
                          </p>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground whitespace-nowrap mt-0.5 flex-shrink-0">
                        {new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    {r.actedAt && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {r.status === 'APPROVED' ? '✓ Approved' : '✗ Rejected'} on {new Date(r.actedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB: TEAM REQUESTS (manager only)
          ═══════════════════════════════════════════════════ */}
      {activeTab === 'team-requests' && can('MANAGER') && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTeamFilter(f)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                  teamFilter === f
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                {f === 'PENDING' && teamRequests.filter(r => r.status === 'PENDING').length > 0 && (
                  <span className="ml-1.5 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {teamRequests.filter(r => r.status === 'PENDING').length}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => fetchTeamRequests(teamFilter)}
              className="ml-auto px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-lg hover:bg-muted transition-colors"
            >
              Refresh
            </button>
          </div>

          {teamLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : teamRequests.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No {teamFilter !== 'ALL' ? teamFilter.toLowerCase() : ''} requests</p>
            </div>
          ) : (
            <div className="bg-card border rounded-xl overflow-hidden">
              {teamRequests.map((r, i) => {
                const cfg = REG_STATUS_CFG[r.status];
                const isActing = teamActionId === r.id;
                return (
                  <div key={r.id} className={cn('px-5 py-4', i !== 0 && 'border-t')}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">
                            {r.employee.firstName} {r.employee.lastName}
                          </p>
                          <span className="text-xs text-muted-foreground">{r.employee.employeeCode}</span>
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', cfg.bg, cfg.text)}>
                            {r.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Date: <strong>{new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                          {r.requestedCheckIn && <> · In: {r.requestedCheckIn}</>}
                          {r.requestedCheckOut && <> · Out: {r.requestedCheckOut}</>}
                          {' · '}Requested: {r.requestedStatus.replace('_', ' ')}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">{r.reason}</p>
                        {r.managerNote && (
                          <p className="text-xs italic text-muted-foreground mt-1">Your note: {r.managerNote}</p>
                        )}
                        {r.actedAt && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {r.status === 'APPROVED' ? '✓ Approved' : '✗ Rejected'} on {new Date(r.actedAt).toLocaleDateString('en-IN')}
                          </p>
                        )}
                      </div>

                      {r.status === 'PENDING' && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            disabled={isActing}
                            onClick={() => { setNoteModal({ id: r.id, action: 'approve' }); setNoteText(''); }}
                            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
                          >
                            {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Approve'}
                          </button>
                          <button
                            disabled={isActing}
                            onClick={() => { setNoteModal({ id: r.id, action: 'reject' }); setNoteText(''); }}
                            className="px-3 py-1.5 text-xs bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400 rounded-lg hover:bg-red-200 disabled:opacity-50 font-medium transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Raised on {new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Note / Confirm modal for approve or reject ── */}
      {noteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setNoteModal(null)}>
          <div className="bg-card border rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-base mb-1 capitalize">{noteModal.action} Request</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {noteModal.action === 'approve'
                ? 'The attendance record will be corrected immediately upon approval.'
                : 'The employee will be notified of the rejection.'}
            </p>
            <div className="mb-4">
              <label className="block text-xs text-muted-foreground mb-1">Note (optional)</label>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={2}
                placeholder="Add a comment for the employee…"
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleTeamAction(noteModal.id, noteModal.action, noteText)}
                disabled={!!teamActionId}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60',
                  noteModal.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                )}
              >
                {teamActionId ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirm {noteModal.action === 'approve' ? 'Approval' : 'Rejection'}
              </button>
              <button onClick={() => setNoteModal(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          TAB: ATTENDANCE (existing content below)
          ═══════════════════════════════════════════════════ */}
      {activeTab === 'attendance' && <>

      {/* ── Top row: Clock card + Today stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Clock / check-in */}
        <div className="md:col-span-1 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-6 text-white">
          <div className="flex items-center gap-2 mb-3 opacity-70">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">Live Clock</span>
          </div>
          <p className="text-4xl font-bold tracking-tight font-mono">
            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}
          </p>
          <p className="text-blue-200 text-sm mt-1">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
          </p>

          <div className="mt-5 flex flex-col gap-2">
            {actionLoading ? (
              <div className="flex items-center gap-2 text-blue-200 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Please wait…
              </div>
            ) : checkedIn ? (
              <button onClick={handleCheckOut}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors backdrop-blur-sm">
                <LogOut className="w-4 h-4" /> Check Out
              </button>
            ) : (
              <button onClick={handleCheckIn}
                className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-semibold transition-colors shadow-sm">
                <LogIn className="w-4 h-4" /> {hasCheckedOut ? 'Check In Again' : 'Check In'}
              </button>
            )}

            {/* Location info */}
            {today?.locationType && (
              <div className="flex items-center gap-1.5 text-[11px] mt-1">
                {today.locationType === 'WFH' ? (
                  <Wifi className="w-3 h-3 text-orange-300" />
                ) : (
                  <Home className="w-3 h-3 text-green-300" />
                )}
                <span className={cn(
                  today.locationType === 'WFH' ? 'text-orange-200' : 'text-green-200'
                )}>
                  {today.locationType === 'WFH'
                    ? `WFH — ${today.wfhStatus === 'APPROVED' ? '✓ Approved' : today.wfhStatus === 'REJECTED' ? '✗ Rejected' : '⏳ Awaiting approval'}`
                    : 'Office'}
                </span>
              </div>
            )}

            {/* Status pill */}
            <div className="mt-2">
              <span className={cn(
                'text-[11px] font-medium px-2.5 py-1 rounded-full border',
                checkedIn
                  ? 'bg-green-400/20 text-green-200 border-green-400/30'
                  : hasCheckedOut
                    ? 'bg-white/10 text-blue-100 border-white/20'
                    : 'bg-white/10 text-blue-200 border-white/10'
              )}>
                {checkedIn ? '● Active session'
                  : hasCheckedOut ? `✓ ${(today?.workHours ?? 0).toFixed(1)}h logged today`
                    : '○ Not checked in'}
              </span>
            </div>
          </div>
        </div>

        {/* Today stats */}
        <div className="md:col-span-2 grid grid-cols-3 gap-4">
          <StatBox label="Check In" value={today?.checkIn ? formatTime(today.checkIn) : '—'} icon={LogIn} color="text-green-500" />
          <StatBox label="Check Out" value={today?.checkOut ? formatTime(today.checkOut) : '—'} icon={LogOut} color="text-red-500" />
          <StatBox label="Work Hours" value={today?.workHours != null ? `${today.workHours.toFixed(1)}h` : '—'} icon={Clock} color="text-blue-500" />
        </div>
      </div>

      {/* ── WFH Pending Approvals (manager view) ── */}
      {can('MANAGER') && wfhPending.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-xl p-5">
          <h2 className="font-semibold text-orange-700 dark:text-orange-400 mb-3 flex items-center gap-2">
            <Wifi className="w-4 h-4" /> Pending WFH Approvals ({wfhPending.length})
          </h2>
          <div className="space-y-2">
            {wfhPending.map((w) => (
              <div key={w.id} className="flex items-center justify-between bg-white dark:bg-background rounded-lg px-4 py-3 border">
                <div>
                  <p className="font-medium text-sm">{w.employee?.firstName} {w.employee?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{w.employee?.employeeCode} · {new Date(w.date).toLocaleDateString('en-IN')}</p>
                  {w.checkIn && <p className="text-xs text-muted-foreground">In: {formatTime(w.checkIn)} {w.checkOut ? `· Out: ${formatTime(w.checkOut)}` : ''}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApproveWfh(w.id, 'approve')}
                    className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium">
                    Approve
                  </button>
                  <button onClick={() => handleApproveWfh(w.id, 'reject')}
                    className="px-3 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors font-medium dark:bg-red-950/30 dark:text-red-400">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Calendar ── */}
      <div className="bg-card border rounded-xl overflow-hidden">
        {/* Calendar header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </h2>
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 px-5 py-2.5 border-b bg-muted/30">
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <span key={k} className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', v.bg, v.text)}>
              {v.label}
            </span>
          ))}
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b">
          {DAYS.map((d) => (
            <div key={d} className={cn(
              'text-center text-xs font-medium py-2.5',
              d === 'Sun' ? 'text-muted-foreground/60' : 'text-muted-foreground'
            )}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {/* Leading empty cells */}
          {Array.from({ length: first }).map((_, i) => (
            <div key={`e-${i}`} className="border-b border-r min-h-[90px] bg-muted/10" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const rec = recordMap[dateStr];
            const isToday = dateStr === todayStr;
            const isFuture = dateStr > todayStr;
            const col = (first + i) % 7; // 0=Sun, 6=Sat
            const isWeekend = col === 0; // Only Sunday is a non-working day

            const statusKey = rec ? getStatusKey(rec) : (isWeekend ? 'WEEKEND' : null);
            const cfg = statusKey ? STATUS_CONFIG[statusKey] : null;

            return (
              <div
                key={dateStr}
                onClick={() => {
                  if (rec && !isFuture) setSelected(rec);
                  if (col === 0 && !isFuture && dateStr < todayStr) {
                    setCompOffDate(dateStr);
                    setCompOffReason('');
                  }
                }}
                className={cn(
                  'border-b border-r min-h-[90px] p-2 relative transition-colors',
                  (rec || (col === 0 && !isFuture && dateStr < todayStr)) && 'cursor-pointer hover:bg-muted/30',
                  isToday && 'ring-2 ring-inset ring-blue-500',
                  isWeekend && !rec && 'bg-muted/20',
                  isFuture && 'opacity-40'
                )}
              >
                {/* Day number */}
                <div className={cn(
                  'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1',
                  isToday ? 'bg-blue-600 text-white' : 'text-foreground'
                )}>
                  {day}
                </div>

                {/* Status badge */}
                {cfg && (
                  <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full block w-fit', cfg.bg, cfg.text)}>
                    {cfg.label}
                  </span>
                )}

                {/* Check-in / check-out times */}
                {rec?.checkIn && (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[9px] text-green-600 dark:text-green-400 flex items-center gap-0.5">
                      <span className="font-bold">↑</span> {formatTime(rec.checkIn)}
                    </p>
                    {rec.checkOut && (
                      <p className="text-[9px] text-red-500 dark:text-red-400 flex items-center gap-0.5">
                        <span className="font-bold">↓</span> {formatTime(rec.checkOut)}
                      </p>
                    )}
                    {rec.workHours != null && rec.workHours > 0 && (
                      <p className="text-[9px] text-muted-foreground">{rec.workHours.toFixed(1)}h</p>
                    )}
                  </div>
                )}

                {/* Comp Off hint on past Sundays */}
                {col === 0 && !isFuture && dateStr < todayStr && !cfg && (
                  <p className="text-[8px] text-blue-400 mt-1 leading-tight">+ Comp Off</p>
                )}

                {/* WFH pending dot */}
                {rec?.locationType === 'WFH' && rec.wfhStatus === 'PENDING' && (
                  <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-500 animate-pulse" title="WFH approval pending" />
                )}

                {/* Regularized indicator */}
                {rec?.isRegularized && (
                  <div className="absolute bottom-1 right-1.5 text-[8px] text-muted-foreground/60">REG</div>
                )}
              </div>
            );
          })}

          {/* Trailing empty cells to complete last row */}
          {(() => {
            const total = first + daysInMonth;
            const trailing = (7 - (total % 7)) % 7;
            return Array.from({ length: trailing }).map((_, i) => (
              <div key={`t-${i}`} className="border-b border-r min-h-[90px] bg-muted/10" />
            ));
          })()}
        </div>
      </div>

      </> /* end attendance tab */}

      {/* ── Comp Off Request Modal ── */}
      {compOffDate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCompOffDate(null)}>
          <div className="bg-card border rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">Log Comp Off Work</h3>
              <button onClick={() => setCompOffDate(null)} className="text-muted-foreground text-xl leading-none hover:text-foreground">×</button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              You worked on <strong>{new Date(compOffDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}</strong>.
              Submit this to earn 1 Comp Off day that you can use as leave on a weekday.
            </p>
            {compOffSuccess ? (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2 text-sm">
                <CheckCircle className="w-4 h-4" /> {compOffSuccess}
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1.5">What did you work on? (optional)</label>
                  <textarea
                    value={compOffReason}
                    onChange={(e) => setCompOffReason(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    placeholder="Brief description of work done…"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setCompOffSubmitting(true);
                      try {
                        await api.post('/api/comp-off', { workDate: compOffDate, reason: compOffReason });
                        setCompOffSuccess('Request submitted! Your manager will review it.');
                        setTimeout(() => { setCompOffDate(null); setCompOffSuccess(''); }, 3000);
                      } catch (e: any) {
                        setError(e.response?.data?.message ?? 'Failed to submit');
                        setCompOffDate(null);
                      } finally {
                        setCompOffSubmitting(false);
                      }
                    }}
                    disabled={compOffSubmitting}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    {compOffSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Submit Request
                  </button>
                  <button onClick={() => setCompOffDate(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Day Detail Modal ── */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-card border rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">
                {new Date(selected.date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </h3>
              <button onClick={() => setSelected(null)} className="text-muted-foreground text-xl leading-none hover:text-foreground">×</button>
            </div>

            {/* Status */}
            {(() => {
              const sk = getStatusKey(selected);
              const cfg = STATUS_CONFIG[sk];
              return cfg ? (
                <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', cfg.bg, cfg.text)}>
                  {cfg.label}
                </span>
              ) : null;
            })()}

            <div className="mt-4 space-y-3 text-sm">
              {selected.checkIn && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Check In</span>
                  <span className="font-medium text-green-600">{formatTime(selected.checkIn)}</span>
                </div>
              )}
              {selected.checkOut && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Check Out</span>
                  <span className="font-medium text-red-500">{formatTime(selected.checkOut)}</span>
                </div>
              )}
              {selected.workHours != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Work Hours</span>
                  <span className="font-medium">{selected.workHours.toFixed(2)}h</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location</span>
                <span className="font-medium flex items-center gap-1">
                  {selected.locationType === 'WFH' ? <Wifi className="w-3 h-3" /> : <Home className="w-3 h-3" />}
                  {selected.locationType || 'OFFICE'}
                </span>
              </div>
              {selected.locationType === 'WFH' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WFH Status</span>
                  <span className={cn('font-medium text-xs px-2 py-0.5 rounded-full',
                    selected.wfhStatus === 'APPROVED' ? 'bg-green-100 text-green-700' :
                    selected.wfhStatus === 'REJECTED' ? 'bg-red-100 text-red-600' :
                    'bg-orange-100 text-orange-600'
                  )}>
                    {selected.wfhStatus || 'PENDING'}
                  </span>
                </div>
              )}
              {selected.isRegularized && (
                <p className="text-xs text-muted-foreground italic border-t pt-2">This record was regularized</p>
              )}
            </div>

            {(selected.status === 'ABSENT' || (!selected.checkIn && !selected.checkOut)) && (
              <button
                onClick={() => { openRegModal(selected.date.slice(0, 10)); setSelected(null); }}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-900 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <HelpCircle className="w-4 h-4" /> Raise a query for this day
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Attendance Regularization Request Modal ── */}
      {regModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRegModalOpen(false)}>
          <div className="bg-card border rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">Raise Attendance Query</h3>
              <button onClick={() => setRegModalOpen(false)} className="text-muted-foreground text-xl leading-none hover:text-foreground">×</button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              E.g. forgot to check in and got marked absent. Describe what happened — this goes to your reporting manager for approval.
            </p>
            {regSuccess ? (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2 text-sm">
                <CheckCircle className="w-4 h-4" /> {regSuccess}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Date</label>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={regForm.date}
                    onChange={(e) => setRegForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Check In (optional)</label>
                    <input
                      type="time"
                      value={regForm.requestedCheckIn}
                      onChange={(e) => setRegForm((f) => ({ ...f, requestedCheckIn: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Check Out (optional)</label>
                    <input
                      type="time"
                      value={regForm.requestedCheckOut}
                      onChange={(e) => setRegForm((f) => ({ ...f, requestedCheckOut: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Mark as</label>
                  <select
                    value={regForm.requestedStatus}
                    onChange={(e) => setRegForm((f) => ({ ...f, requestedStatus: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="PRESENT">Present</option>
                    <option value="HALF_DAY">Half Day</option>
                    <option value="WFH">Work From Home</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Reason *</label>
                  <textarea
                    value={regForm.reason}
                    onChange={(e) => setRegForm((f) => ({ ...f, reason: e.target.value }))}
                    rows={3}
                    placeholder="e.g. Forgot to check in this morning, was present at office all day"
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleRegSubmit}
                    disabled={regSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors"
                  >
                    {regSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit to Manager
                  </button>
                  <button onClick={() => setRegModalOpen(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Owner Attendance View ────────────────────────────────────────────────────

function OwnerAttendanceView() {
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.get<{ data: any[] }>('/api/attendance/summary').then(r => {
        setSummary(r.data.data ?? []);
      }).catch(() => {}).finally(() => setLoading(false));
    });
  }, []);

  const statusDot: Record<string, string> = {
    PRESENT:  'bg-green-500',
    ABSENT:   'bg-red-500',
    LATE:     'bg-amber-500',
    HALF_DAY: 'bg-blue-500',
    ON_LEAVE: 'bg-orange-400',
    HOLIDAY:  'bg-purple-400',
    WEEKEND:  'bg-gray-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Attendance Overview</h1>
          <p className="text-muted-foreground text-sm">Live company-wide attendance — owner view</p>
        </div>
        <div className="bg-slate-800 text-white rounded-xl px-5 py-3 font-mono text-xl font-bold">
          {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-5 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
        <Clock className="w-4 h-4 flex-shrink-0" />
        As the company owner, your account does not have attendance check-in/out. You have full access to monitor and manage all employee records.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : summary.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No attendance records for today yet</p>
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
            <span className="text-sm font-semibold">Today's Attendance — {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
            <span className="text-xs text-muted-foreground">{summary.length} employees</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Employee</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Department</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Check In</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Check Out</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.map((row: any) => (
                <tr key={row.employeeId} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{row.firstName} {row.lastName}</p>
                    <p className="text-xs text-muted-foreground">{row.employeeCode}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.department ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', statusDot[row.status] ?? 'bg-gray-400')} />
                      <span className="text-xs">{row.status ?? 'ABSENT'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{row.checkIn ? new Date(row.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs">{row.checkOut ? new Date(row.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—'}</td>
                  <td className="px-4 py-2.5 text-xs">{row.workHours != null ? `${Number(row.workHours).toFixed(1)}h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-4 text-center">
      <Icon className={cn('w-5 h-5 mx-auto mb-2', color)} />
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
