import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { LeaveRequest, LeaveBalance } from '@/types';
import { formatDate } from '@/lib/utils';
import { useRole } from '@/hooks/useAuth';
import { Check, X, Loader2, AlertCircle, Plus, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'my-leaves' | 'apply' | 'pending';

interface CompanyLeaveType {
  id: string;
  type: string;
  name: string;
  isPaid: boolean;
  maxDaysPerYear: number;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400',
  CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  ESCALATED: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
};

export default function LeavePage() {
  const { can, isSuperAdmin } = useRole();
  const [tab, setTab] = useState<Tab>('my-leaves');
  const [myLeaves, setMyLeaves] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<CompanyLeaveType[]>([]);
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  // Apply form
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
  const [compWorkDate, setCompWorkDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDaySession, setHalfDaySession] = useState<'MORNING' | 'AFTERNOON'>('MORNING');
  const [applying, setApplying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [leavesRes, balRes, typesRes] = await Promise.all([
        api.get<{ data: LeaveRequest[] }>('/api/leave/my-requests'),
        api.get<{ data: LeaveBalance[] }>('/api/leave/my-balances'),
        api.get<{ data: CompanyLeaveType[] }>('/api/leave/types'),
      ]);
      setMyLeaves(leavesRes.data.data ?? []);
      setBalances(balRes.data.data ?? []);
      setLeaveTypes(typesRes.data.data ?? []);

      if (can('MANAGER')) {
        const pendingRes = await api.get<{ data: LeaveRequest[] }>('/api/leave/pending');
        setPending(pendingRes.data.data ?? []);
      }
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to load leave data');
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => { if (!isSuperAdmin) fetchData(); }, [fetchData, isSuperAdmin]);

  if (isSuperAdmin) return <CompanyLeaveOverview />;

  const handleApply = async () => {
    if (!form.leaveTypeId || !form.startDate || !form.endDate || !form.reason.trim()) {
      setError('Please fill all fields');
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setError('End date must be after start date');
      return;
    }
    setApplying(true);
    setError('');
    try {
      const payload: any = { ...form };
      if (isCompOff && compWorkDate) {
        payload.reason = `Compensating work date: ${compWorkDate}${form.reason ? ' | ' + form.reason : ''}`;
      }
      if (isHalfDay) {
        payload.isHalfDay = true;
        payload.halfDaySession = halfDaySession;
        payload.endDate = payload.startDate; // half-day = 1 day
      }
      await api.post('/api/leave/apply', payload);
      setSuccess('Leave request submitted!');
      setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
      setCompWorkDate('');
      setIsHalfDay(false);
      setTab('my-leaves');
      setTimeout(() => setSuccess(''), 3000);
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to apply');
    } finally {
      setApplying(false);
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionId(id);
    setError('');
    try {
      await api.put(`/api/leave/${id}/${action}`, { note: action === 'approve' ? 'Approved' : 'Rejected' });
      setSuccess(`Leave ${action}d successfully`);
      setTimeout(() => setSuccess(''), 3000);
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.message ?? `Failed to ${action}`);
    } finally {
      setActionId(null);
    }
  };

  const tabs: { id: Tab; label: string; show?: boolean }[] = [
    { id: 'my-leaves', label: 'My Leaves' },
    { id: 'apply', label: 'Apply Leave' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  }

  // Balance lookup by leave type id
  const balanceByType: Record<string, LeaveBalance> = {};
  balances.forEach((b) => { balanceByType[b.leaveTypeId] = b; });

  // Selected leave type info
  const selectedType = leaveTypes.find((t) => t.id === form.leaveTypeId);
  const isLOP = selectedType ? (!selectedType.isPaid || selectedType.type === 'LOSS_OF_PAY' || selectedType.type === 'UNPAID') : false;
  const isCompOff = selectedType?.type === 'COMPENSATORY';
  const selectedBalance = form.leaveTypeId ? balanceByType[form.leaveTypeId] : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Leave Management</h1>
          <p className="text-muted-foreground text-sm">Manage your leave requests</p>
        </div>
        {can('HR') && (
          <button
            onClick={async () => {
              try {
                const r = await api.post<{ message: string }>('/api/leave/accrue-monthly', {});
                setSuccess((r.data as any).message ?? 'Monthly CL accrued');
                setTimeout(() => setSuccess(''), 5000);
              } catch (e: any) {
                setError(e.response?.data?.message ?? 'Failed to accrue CL');
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Accrue Monthly CL
          </button>
        )}
      </div>

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

      {/* Leave balance cards */}
      {balances.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {balances.map((b) => {
            const remaining = b.totalDays - b.usedDays - b.pendingDays;
            const pct = Math.min(100, (remaining / (b.totalDays || 1)) * 100);
            return (
              <div key={b.id} className="bg-card border rounded-xl p-3.5 text-center">
                <p className="text-xs text-muted-foreground truncate">{b.leaveType?.name ?? '—'}</p>
                <p className="text-2xl font-bold mt-1 text-blue-600">{remaining}</p>
                <p className="text-[10px] text-muted-foreground">of {b.totalDays} days</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                {b.pendingDays > 0 && (
                  <p className="text-[10px] text-amber-500 mt-1">{b.pendingDays} pending</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b gap-1">
        {tabs.filter((t) => t.show !== false).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* My Leaves */}
      {tab === 'my-leaves' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="text-left px-5 py-3 font-medium">Type</th>
                <th className="text-left px-5 py-3 font-medium">From</th>
                <th className="text-left px-5 py-3 font-medium">To</th>
                <th className="text-left px-5 py-3 font-medium">Days</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {myLeaves.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14 text-muted-foreground">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No leave requests yet</p>
                    <button
                      onClick={() => setTab('apply')}
                      className="mt-2 text-primary text-sm hover:underline"
                    >
                      Apply for leave
                    </button>
                  </td>
                </tr>
              ) : myLeaves.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3 font-medium">{l.leaveType?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(l.startDate)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(l.endDate)}</td>
                  <td className="px-5 py-3">{l.days ?? l.totalDays}</td>
                  <td className="px-5 py-3">
                    <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', STATUS_COLORS[l.status] ?? STATUS_COLORS.PENDING)}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground truncate max-w-[200px]">{l.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Apply */}
      {tab === 'apply' && (
        <div className="bg-card border rounded-xl p-6 max-w-lg">
          <h2 className="font-semibold mb-5 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-500" /> Apply for Leave
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Leave Type</label>
              <select
                value={form.leaveTypeId}
                onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select leave type…</option>
                {leaveTypes.map((t) => {
                  const bal = balanceByType[t.id];
                  const isUnpaid = !t.isPaid || t.type === 'LOSS_OF_PAY' || t.type === 'UNPAID';
                  const remaining = bal ? bal.totalDays - bal.usedDays - bal.pendingDays : null;
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name}{isUnpaid ? ' (Salary Deduction)' : remaining !== null ? ` — ${remaining} days left` : ''}
                    </option>
                  );
                })}
              </select>

              {/* Balance / LOP / Comp Off info banner */}
              {selectedType && (
                isCompOff ? (
                  <div className="mt-2 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                    Comp Off — you worked an extra day and are compensating it with this leave. No balance deducted. Manager approval required.
                  </div>
                ) : isLOP ? (
                  <div className="mt-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    Loss of Pay — these days will be deducted from your monthly salary. Your manager must approve before it is processed.
                  </div>
                ) : selectedBalance ? (
                  <div className="mt-2 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                    Available: <strong>{selectedBalance.totalDays - selectedBalance.usedDays - selectedBalance.pendingDays}</strong> of {selectedBalance.totalDays} days
                    {selectedBalance.pendingDays > 0 && <span className="text-amber-600 ml-1">({selectedBalance.pendingDays} pending)</span>}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-lg px-3 py-2">
                    No balance assigned for this leave type. Only LOP is available. Contact HR to assign a balance.
                  </div>
                )
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* Half Day toggle (not for Comp Off or LOP) */}
            {!isCompOff && !isLOP && form.leaveTypeId && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsHalfDay((v) => !v)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    isHalfDay ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950/30 dark:text-purple-400' : 'bg-muted text-muted-foreground border-muted hover:border-foreground/30'
                  )}>
                  {isHalfDay ? '☑' : '☐'} Half Day
                </button>
                {isHalfDay && (
                  <div className="flex gap-2">
                    {(['MORNING', 'AFTERNOON'] as const).map((s) => (
                      <button key={s} onClick={() => setHalfDaySession(s)}
                        className={cn(
                          'px-3 py-1 rounded-lg text-xs font-medium border transition-all',
                          halfDaySession === s ? 'bg-purple-600 text-white border-purple-600' : 'border-muted text-muted-foreground hover:border-foreground/30'
                        )}>
                        {s === 'MORNING' ? '🌅 Morning' : '🌇 Afternoon'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Day count preview */}
            {form.startDate && form.endDate && new Date(form.endDate) >= new Date(form.startDate) && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                {Math.ceil((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} day(s) requested
              </div>
            )}

            {/* Comp Off: compensating work date */}
            {isCompOff && (
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Date You Worked <span className="text-red-500">*</span>
                  <span className="text-muted-foreground font-normal ml-1 text-xs">(the Sunday/holiday you compensated)</span>
                </label>
                <input
                  type="date"
                  value={compWorkDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setCompWorkDate(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">
                Reason {isCompOff && <span className="font-normal text-muted-foreground text-xs">(optional)</span>}
              </label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="Brief reason for leave…"
              />
            </div>

            <button
              onClick={handleApply}
              disabled={applying || !form.leaveTypeId || !form.startDate || !form.endDate || (!isCompOff && !form.reason.trim()) || (isCompOff && !compWorkDate)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {applying && <Loader2 className="w-4 h-4 animate-spin" />}
              {isCompOff ? 'Submit Comp Off Request' : isLOP ? 'Submit LOP Request' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}

      {/* Pending Approvals (managers only) */}
      {tab === 'pending' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="text-left px-5 py-3 font-medium">Employee</th>
                <th className="text-left px-5 py-3 font-medium">Type</th>
                <th className="text-left px-5 py-3 font-medium">Duration</th>
                <th className="text-left px-5 py-3 font-medium">Reason</th>
                <th className="text-left px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-14 text-muted-foreground">
                    <Check className="w-7 h-7 mx-auto mb-2 text-green-500 opacity-60" />
                    No pending approvals
                  </td>
                </tr>
              ) : pending.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium">{l.employee?.firstName} {l.employee?.lastName}</p>
                    <p className="text-xs text-muted-foreground">{l.employee?.employeeCode}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-medium">{l.leaveType?.name}</span>
                    {l.leaveType?.isPaid === false && (
                      <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full dark:bg-orange-950/30 dark:text-orange-400">LOP</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(l.startDate)} – {formatDate(l.endDate)}
                    <span className="text-xs ml-1">({l.days ?? l.totalDays}d)</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground truncate max-w-[160px]">{l.reason}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAction(l.id, 'approve')}
                        disabled={actionId === l.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
                      >
                        {actionId === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(l.id, 'reject')}
                        disabled={actionId === l.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-medium hover:bg-red-200 dark:bg-red-950/30 dark:hover:bg-red-950/50 disabled:opacity-60 transition-colors"
                      >
                        <X className="w-3 h-3" /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface AllLeaveRequest extends LeaveRequest {
  managerName?: string | null;
  employee?: { firstName: string; lastName: string; employeeCode: string };
}

// Company-wide leave oversight for SUPER_ADMIN. Pooranam doesn't apply for
// leave — this is a read-only audit view of every employee's requests and
// whether their manager approved or rejected them.
function CompanyLeaveOverview() {
  const [requests, setRequests] = useState<AllLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get<{ data: AllLeaveRequest[] }>('/api/leave/all');
        setRequests(res.data.data ?? []);
      } catch (e: any) {
        setError(e.response?.data?.message ?? 'Failed to load company leave data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  }

  const filtered = statusFilter === 'ALL' ? requests : requests.filter((r) => r.status === statusFilter);
  const statusOptions = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ESCALATED'];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Leave Management</h1>
        <p className="text-muted-foreground text-sm">Company-wide leave requests and manager decisions</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 text-red-500 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {statusOptions.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'border-muted text-muted-foreground hover:border-foreground/30'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="text-left px-5 py-3 font-medium">Employee</th>
              <th className="text-left px-5 py-3 font-medium">Type</th>
              <th className="text-left px-5 py-3 font-medium">From</th>
              <th className="text-left px-5 py-3 font-medium">To</th>
              <th className="text-left px-5 py-3 font-medium">Days</th>
              <th className="text-left px-5 py-3 font-medium">Status</th>
              <th className="text-left px-5 py-3 font-medium">Manager</th>
              <th className="text-left px-5 py-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-14 text-muted-foreground">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No leave requests found
                </td>
              </tr>
            ) : filtered.map((l) => (
              <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-5 py-3">
                  <p className="font-medium">{l.employee?.firstName} {l.employee?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{l.employee?.employeeCode}</p>
                </td>
                <td className="px-5 py-3 font-medium">{l.leaveType?.name ?? '—'}</td>
                <td className="px-5 py-3 text-muted-foreground">{formatDate(l.startDate)}</td>
                <td className="px-5 py-3 text-muted-foreground">{formatDate(l.endDate)}</td>
                <td className="px-5 py-3">{l.days ?? l.totalDays}</td>
                <td className="px-5 py-3">
                  <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', STATUS_COLORS[l.status] ?? STATUS_COLORS.PENDING)}>
                    {l.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{l.managerName ?? '—'}</td>
                <td className="px-5 py-3 text-muted-foreground truncate max-w-[200px]">{l.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
