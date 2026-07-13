import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Loader2, AlertCircle, Check, X, ClipboardList, Coffee, Clock, HelpCircle, History } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  days?: number;
  totalDays?: number;
  reason?: string;
  status: string;
  managerNote?: string | null;
  managerActedAt?: string | null;
  leaveType?: { name: string; isPaid?: boolean };
  employee?: { firstName: string; lastName: string; employeeCode: string };
}

interface CompOffRequest {
  id: string;
  workDate: string;
  reason?: string;
  status: string;
  managerNote?: string | null;
  createdAt?: string;
  employee?: { firstName: string; lastName: string; employeeCode: string };
}

interface PermissionRequest {
  id: string;
  date: string;
  fromTime: string;
  toTime: string;
  type: string;
  session?: string;
  reason: string;
  status: string;
  managerNote?: string | null;
  createdAt?: string;
  employee?: { firstName: string; lastName: string; employeeCode: string };
}

interface AttendanceRegRequest {
  id: string;
  date: string;
  requestedCheckIn?: string | null;
  requestedCheckOut?: string | null;
  requestedStatus: string;
  reason: string;
  status: string;
  managerNote?: string | null;
  actedAt?: string | null;
  createdAt?: string;
  employee?: { firstName: string; lastName: string; employeeCode: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE: Record<string, string> = {
  PENDING:  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', STATUS_BADGE[status] ?? 'bg-muted text-muted-foreground')}>
      {status}
    </span>
  );
}

type Tab = 'leave' | 'compoff' | 'permission' | 'attendance';
type View = 'pending' | 'history';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeaveRequests() {
  const [tab, setTab] = useState<Tab>('leave');
  const [view, setView] = useState<View>('pending');

  // Pending counts (for badges)
  const [pendingLeave, setPendingLeave]   = useState<LeaveRequest[]>([]);
  const [pendingCompOff, setPendingCompOff] = useState<CompOffRequest[]>([]);
  const [pendingPerms, setPendingPerms]   = useState<PermissionRequest[]>([]);
  const [pendingAttReg, setPendingAttReg] = useState<AttendanceRegRequest[]>([]);

  // History (all statuses)
  const [histLeave, setHistLeave]     = useState<LeaveRequest[]>([]);
  const [histCompOff, setHistCompOff] = useState<CompOffRequest[]>([]);
  const [histPerms, setHistPerms]     = useState<PermissionRequest[]>([]);
  const [histAttReg, setHistAttReg]   = useState<AttendanceRegRequest[]>([]);

  const [loading, setLoading]     = useState(true);
  const [histLoading, setHistLoading] = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [actionId, setActionId]   = useState<string | null>(null);

  // ── Fetch pending ─────────────────────────────────────────────────────────
  const fetchPending = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [leaveRes, compOffRes, permRes, attRegRes] = await Promise.all([
        api.get<{ data: LeaveRequest[] }>('/api/leave/pending'),
        api.get<{ data: CompOffRequest[] }>('/api/comp-off/pending'),
        api.get<{ data: PermissionRequest[] }>('/api/permissions/pending'),
        api.get<{ data: AttendanceRegRequest[] }>('/api/attendance-regularization/pending'),
      ]);
      setPendingLeave(leaveRes.data.data ?? []);
      setPendingCompOff(compOffRes.data.data ?? []);
      setPendingPerms(permRes.data.data ?? []);
      setPendingAttReg(attRegRes.data.data ?? []);
    } catch {
      if (!silent) setError('Failed to load requests');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ── Fetch history ─────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const [leaveRes, compOffRes, permRes, attRegRes] = await Promise.all([
        api.get<{ data: LeaveRequest[] }>('/api/leave/team'),
        api.get<{ data: CompOffRequest[] }>('/api/comp-off/team'),
        api.get<{ data: PermissionRequest[] }>('/api/permissions/team'),
        api.get<{ data: AttendanceRegRequest[] }>('/api/attendance-regularization/team'),
      ]);
      setHistLeave(leaveRes.data.data ?? []);
      setHistCompOff(compOffRes.data.data ?? []);
      setHistPerms(permRes.data.data ?? []);
      setHistAttReg(attRegRes.data.data ?? []);
    } catch {
      setError('Failed to load history');
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);
  useEffect(() => { if (view === 'history') fetchHistory(); }, [view, fetchHistory]);

  // ── Approve / Reject ──────────────────────────────────────────────────────
  const act = async (url: string, id: string) => {
    setActionId(id); setError('');
    try {
      await api.put(url, {});
      setSuccess('Done!');
      setTimeout(() => setSuccess(''), 3000);
      await fetchPending(true);
      // Refresh history if visible
      if (view === 'history') fetchHistory();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Action failed');
    } finally { setActionId(null); }
  };

  const totalPending = pendingLeave.length + pendingCompOff.length + pendingPerms.length + pendingAttReg.length;

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  const ActionBtns = ({ id, approveUrl, rejectUrl }: { id: string; approveUrl: string; rejectUrl: string }) => (
    <div className="flex items-center gap-2">
      <button onClick={() => act(approveUrl, id)} disabled={actionId === id}
        className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-60 transition-colors">
        {actionId === id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
      </button>
      <button onClick={() => act(rejectUrl, id)} disabled={actionId === id}
        className="flex items-center gap-1 px-2.5 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-medium hover:bg-red-200 dark:bg-red-950/30 dark:hover:bg-red-950/50 disabled:opacity-60 transition-colors">
        <X className="w-3 h-3" /> Reject
      </button>
    </div>
  );

  const EmptyState = ({ icon: Icon, label }: { icon: React.ComponentType<{className?: string}>; label: string }) => (
    <tr><td colSpan={6} className="text-center py-16 text-muted-foreground">
      <Icon className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="font-medium">{label}</p>
    </td></tr>
  );

  // ── Current data based on view ────────────────────────────────────────────
  const leaveData   = view === 'pending' ? pendingLeave   : histLeave;
  const compOffData = view === 'pending' ? pendingCompOff : histCompOff;
  const permData    = view === 'pending' ? pendingPerms   : histPerms;
  const attRegData  = view === 'pending' ? pendingAttReg  : histAttReg;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-500" /> Leave Requests
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and approve requests from your team
            {totalPending > 0 && (
              <span className="ml-2 text-xs bg-red-500 text-white rounded-full px-2 py-0.5">{totalPending} pending</span>
            )}
          </p>
        </div>

        {/* Pending / History toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setView('pending')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              view === 'pending' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ClipboardList className="w-3.5 h-3.5" /> Pending
            {totalPending > 0 && (
              <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{totalPending}</span>
            )}
          </button>
          <button
            onClick={() => setView('history')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              view === 'history' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <History className="w-3.5 h-3.5" /> All History
          </button>
        </div>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="flex items-center gap-3 text-red-500 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 text-green-600 p-3.5 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 text-sm">
          <Check className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex items-center border-b gap-1">
        {([
          { id: 'leave',      label: 'Leave',               icon: ClipboardList, count: pendingLeave.length },
          { id: 'permission', label: 'Permission / Half Day', icon: Clock,         count: pendingPerms.length },
          { id: 'compoff',    label: 'Comp Off',             icon: Coffee,        count: pendingCompOff.length },
          { id: 'attendance', label: 'Attendance Query',     icon: HelpCircle,    count: pendingAttReg.length },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5',
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count > 0 && <span className="ml-1 text-[10px] font-bold bg-amber-500 text-white rounded-full px-1.5 py-0.5">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── History loading spinner ── */}
      {view === 'history' && histLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!(view === 'history' && histLoading) && <>

      {/* ══════════════════════════════════════
          LEAVE
          ══════════════════════════════════════ */}
      {tab === 'leave' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="text-left px-5 py-3 font-medium">Employee</th>
                <th className="text-left px-5 py-3 font-medium">Type</th>
                <th className="text-left px-5 py-3 font-medium">Duration</th>
                <th className="text-left px-5 py-3 font-medium">Reason</th>
                {view === 'pending'
                  ? <th className="text-left px-5 py-3 font-medium">Actions</th>
                  : <th className="text-left px-5 py-3 font-medium">Status</th>
                }
              </tr>
            </thead>
            <tbody className="divide-y">
              {leaveData.length === 0
                ? <EmptyState icon={ClipboardList} label={view === 'pending' ? 'No pending leave requests' : 'No leave requests found'} />
                : leaveData.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium">{l.employee?.firstName} {l.employee?.lastName}</p>
                      <p className="text-xs text-muted-foreground">{l.employee?.employeeCode}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-medium">{l.leaveType?.name}</span>
                      {l.leaveType?.isPaid === false && (
                        <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full">LOP</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(l.startDate)} – {formatDate(l.endDate)}
                      <span className="text-xs ml-1">({l.days ?? l.totalDays}d)</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground truncate max-w-[160px]">
                      <p className="truncate">{l.reason}</p>
                      {l.managerNote && <p className="text-xs italic truncate">Note: {l.managerNote}</p>}
                    </td>
                    <td className="px-5 py-3">
                      {view === 'pending'
                        ? <ActionBtns id={l.id} approveUrl={`/api/leave/${l.id}/approve`} rejectUrl={`/api/leave/${l.id}/reject`} />
                        : <div className="space-y-1">
                            <StatusBadge status={l.status} />
                            {l.managerActedAt && <p className="text-[10px] text-muted-foreground">{formatDate(l.managerActedAt)}</p>}
                          </div>
                      }
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════
          PERMISSION / HALF DAY
          ══════════════════════════════════════ */}
      {tab === 'permission' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="text-left px-5 py-3 font-medium">Employee</th>
                <th className="text-left px-5 py-3 font-medium">Date</th>
                <th className="text-left px-5 py-3 font-medium">Type / Time</th>
                <th className="text-left px-5 py-3 font-medium">Reason</th>
                {view === 'pending'
                  ? <th className="text-left px-5 py-3 font-medium">Actions</th>
                  : <th className="text-left px-5 py-3 font-medium">Status</th>
                }
              </tr>
            </thead>
            <tbody className="divide-y">
              {permData.length === 0
                ? <EmptyState icon={Clock} label={view === 'pending' ? 'No pending permission requests' : 'No permission requests found'} />
                : permData.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium">{p.employee?.firstName} {p.employee?.lastName}</p>
                      <p className="text-xs text-muted-foreground">{p.employee?.employeeCode}</p>
                    </td>
                    <td className="px-5 py-3 font-medium">{formatDate(p.date)}</td>
                    <td className="px-5 py-3">
                      {p.type === 'HALF_DAY' ? (
                        <span className="text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 px-2 py-0.5 rounded-full">
                          Half Day – {p.session}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 px-2 py-0.5 rounded-full">
                          Permission {p.fromTime} – {p.toTime}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground truncate max-w-[160px]">{p.reason}</td>
                    <td className="px-5 py-3">
                      {view === 'pending'
                        ? <ActionBtns id={p.id} approveUrl={`/api/permissions/${p.id}/approve`} rejectUrl={`/api/permissions/${p.id}/reject`} />
                        : <div className="space-y-1">
                            <StatusBadge status={p.status} />
                            {p.createdAt && <p className="text-[10px] text-muted-foreground">{formatDate(p.createdAt)}</p>}
                          </div>
                      }
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════
          COMP OFF
          ══════════════════════════════════════ */}
      {tab === 'compoff' && (
        <div className="space-y-3">
          {view === 'pending' && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-xs text-blue-700 dark:text-blue-400">
              Approving a comp off request credits <strong>1 Comp Off leave day</strong> to the employee's balance.
            </div>
          )}
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="text-left px-5 py-3 font-medium">Employee</th>
                  <th className="text-left px-5 py-3 font-medium">Worked On</th>
                  <th className="text-left px-5 py-3 font-medium">Reason</th>
                  {view === 'pending'
                    ? <th className="text-left px-5 py-3 font-medium">Actions</th>
                    : <th className="text-left px-5 py-3 font-medium">Status</th>
                  }
                </tr>
              </thead>
              <tbody className="divide-y">
                {compOffData.length === 0
                  ? <EmptyState icon={Coffee} label={view === 'pending' ? 'No comp off requests' : 'No comp off requests found'} />
                  : compOffData.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium">{r.employee?.firstName} {r.employee?.lastName}</p>
                        <p className="text-xs text-muted-foreground">{r.employee?.employeeCode}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-medium">{formatDate(r.workDate)}</span>
                        <span className="ml-2 text-[10px] bg-orange-100 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-semibold">
                          {new Date(r.workDate).toLocaleDateString('en-IN', { weekday: 'long' })}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground truncate max-w-[200px]">{r.reason || '—'}</td>
                      <td className="px-5 py-3">
                        {view === 'pending'
                          ? <ActionBtns id={r.id} approveUrl={`/api/comp-off/${r.id}/approve`} rejectUrl={`/api/comp-off/${r.id}/reject`} />
                          : <div className="space-y-1">
                              <StatusBadge status={r.status} />
                              {r.createdAt && <p className="text-[10px] text-muted-foreground">{formatDate(r.createdAt)}</p>}
                            </div>
                        }
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          ATTENDANCE QUERY
          ══════════════════════════════════════ */}
      {tab === 'attendance' && (
        <div className="space-y-3">
          {view === 'pending' && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              Approving corrects the employee's attendance record for that date with the requested check-in/out and status.
            </div>
          )}
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="text-left px-5 py-3 font-medium">Employee</th>
                  <th className="text-left px-5 py-3 font-medium">Date</th>
                  <th className="text-left px-5 py-3 font-medium">Requested</th>
                  <th className="text-left px-5 py-3 font-medium">Reason</th>
                  {view === 'pending'
                    ? <th className="text-left px-5 py-3 font-medium">Actions</th>
                    : <th className="text-left px-5 py-3 font-medium">Status</th>
                  }
                </tr>
              </thead>
              <tbody className="divide-y">
                {attRegData.length === 0
                  ? <EmptyState icon={HelpCircle} label={view === 'pending' ? 'No attendance queries' : 'No attendance queries found'} />
                  : attRegData.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-medium">{r.employee?.firstName} {r.employee?.lastName}</p>
                        <p className="text-xs text-muted-foreground">{r.employee?.employeeCode}</p>
                      </td>
                      <td className="px-5 py-3 font-medium whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="px-5 py-3">
                        <span className="text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                          {r.requestedStatus}
                        </span>
                        {(r.requestedCheckIn || r.requestedCheckOut) && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {r.requestedCheckIn ?? '—'} – {r.requestedCheckOut ?? '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground truncate max-w-[180px]">{r.reason}</td>
                      <td className="px-5 py-3">
                        {view === 'pending'
                          ? <ActionBtns id={r.id} approveUrl={`/api/attendance-regularization/${r.id}/approve`} rejectUrl={`/api/attendance-regularization/${r.id}/reject`} />
                          : <div className="space-y-1">
                              <StatusBadge status={r.status} />
                              {r.actedAt && <p className="text-[10px] text-muted-foreground">{formatDate(r.actedAt)}</p>}
                            </div>
                        }
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>}
    </div>
  );
}
