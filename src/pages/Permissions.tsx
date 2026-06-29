import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Loader2, AlertCircle, Check, X, Clock, Plus, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/useAuth';

interface PermissionRecord {
  id: string;
  date: string;
  fromTime: string;
  toTime: string;
  type: string;
  session?: string;
  reason: string;
  status: string;
  managerNote?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

const todayStr = new Date().toISOString().slice(0, 10);

export default function PermissionsPage() {
  const { isSuperAdmin } = useRole();
  const [records, setRecords] = useState<PermissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState<'list' | 'apply'>('list');
  const [applying, setApplying] = useState(false);

  const [form, setForm] = useState({
    type: 'PERMISSION',
    date: todayStr,
    fromTime: '09:00',
    toTime: '11:00',
    session: 'MORNING',
    reason: '',
  });

  const fetchRecords = async () => {
    try {
      const r = await api.get<{ data: PermissionRecord[] }>('/api/permissions/my');
      setRecords(r.data.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!isSuperAdmin) fetchRecords(); }, [isSuperAdmin]);

  if (isSuperAdmin) return <CompanyPermissionOverview />;

  const handleSubmit = async () => {
    if (!form.date || !form.reason.trim()) { setError('Date and reason are required'); return; }
    setApplying(true); setError('');
    try {
      const payload: any = { date: form.date, reason: form.reason, type: form.type };
      if (form.type === 'PERMISSION') { payload.fromTime = form.fromTime; payload.toTime = form.toTime; }
      if (form.type === 'HALF_DAY') payload.session = form.session;
      await api.post('/api/permissions', payload);
      setSuccess('Request submitted successfully!');
      setTimeout(() => setSuccess(''), 3000);
      setForm({ type: 'PERMISSION', date: todayStr, fromTime: '09:00', toTime: '11:00', session: 'MORNING', reason: '' });
      setTab('list');
      fetchRecords();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to submit');
    } finally { setApplying(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6 text-purple-500" /> Permissions
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Request short-time permission or half-day leave</p>
        </div>
        <button onClick={() => setTab(tab === 'apply' ? 'list' : 'apply')}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
          <Plus className="w-4 h-4" /> New Request
        </button>
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

      {/* Apply form */}
      {tab === 'apply' && (
        <div className="bg-card border rounded-xl p-6 max-w-lg">
          <h2 className="font-semibold mb-5 flex items-center gap-2">
            <Plus className="w-4 h-4 text-purple-500" /> New Permission / Half Day Request
          </h2>
          <div className="space-y-4">
            {/* Type selector */}
            <div>
              <label className="block text-sm font-medium mb-2">Request Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'PERMISSION', label: 'Permission', desc: 'Leave early / come late (few hours)' },
                  { id: 'HALF_DAY',   label: 'Half Day',   desc: 'Morning or afternoon off' },
                ].map((t) => (
                  <button key={t.id} onClick={() => setForm(f => ({ ...f, type: t.id }))}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all',
                      form.type === t.id ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20' : 'border-muted hover:border-muted-foreground/40'
                    )}>
                    <p className="text-sm font-semibold">{t.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Date</label>
              <input type="date" value={form.date} min={todayStr}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            {form.type === 'PERMISSION' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">From Time</label>
                  <input type="time" value={form.fromTime}
                    onChange={(e) => setForm(f => ({ ...f, fromTime: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">To Time</label>
                  <input type="time" value={form.toTime}
                    onChange={(e) => setForm(f => ({ ...f, toTime: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            )}

            {form.type === 'HALF_DAY' && (
              <div>
                <label className="block text-sm font-medium mb-2">Session</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'MORNING',   label: '🌅 Morning',   desc: 'First half off (till lunch)' },
                    { id: 'AFTERNOON', label: '🌇 Afternoon', desc: 'Second half off (post lunch)' },
                  ].map((s) => (
                    <button key={s.id} onClick={() => setForm(f => ({ ...f, session: s.id }))}
                      className={cn(
                        'p-3 rounded-xl border text-left transition-all',
                        form.session === s.id ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20' : 'border-muted hover:border-muted-foreground/40'
                      )}>
                      <p className="text-sm font-semibold">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">Reason</label>
              <textarea value={form.reason} onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
                rows={3} placeholder="Brief reason…"
                className="w-full px-3 py-2.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={handleSubmit} disabled={applying || !form.reason.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60 transition-colors">
                {applying && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Request
              </button>
              <button onClick={() => setTab('list')} className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {tab === 'list' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="text-left px-5 py-3 font-medium">Date</th>
                <th className="text-left px-5 py-3 font-medium">Type</th>
                <th className="text-left px-5 py-3 font-medium">Time / Session</th>
                <th className="text-left px-5 py-3 font-medium">Reason</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-16 text-muted-foreground">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>No permission requests yet</p>
                  <button onClick={() => setTab('apply')} className="mt-2 text-sm text-purple-600 hover:underline">Make your first request</button>
                </td></tr>
              ) : records.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3 font-medium">{fmtDate(r.date)}</td>
                  <td className="px-5 py-3">
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                      r.type === 'HALF_DAY' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    )}>
                      {r.type === 'HALF_DAY' ? 'Half Day' : 'Permission'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">
                    {r.type === 'HALF_DAY' ? r.session : `${r.fromTime} – ${r.toTime}`}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground truncate max-w-[200px]">{r.reason}</td>
                  <td className="px-5 py-3">
                    <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', STATUS_COLORS[r.status] ?? STATUS_COLORS.PENDING)}>
                      {r.status}
                    </span>
                    {r.managerNote && r.status === 'REJECTED' && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{r.managerNote}</p>
                    )}
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

interface AllPermissionRecord extends PermissionRecord {
  employee?: { firstName: string; lastName: string; employeeCode: string };
  manager?: { firstName: string; lastName: string } | null;
}

// Company-wide permission/half-day oversight for SUPER_ADMIN. Pooranam
// doesn't apply for permission — this is a read-only audit of every
// employee's requests and the manager's decision.
function CompanyPermissionOverview() {
  const [records, setRecords] = useState<AllPermissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const r = await api.get<{ data: AllPermissionRecord[] }>('/api/permissions/all');
        setRecords(r.data.data ?? []);
      } catch (e: any) {
        setError(e.response?.data?.message ?? 'Failed to load company permission data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  const filtered = statusFilter === 'ALL' ? records : records.filter((r) => r.status === statusFilter);
  const statusOptions = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6 text-purple-500" /> Permissions
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Company-wide permission / half-day requests and manager decisions</p>
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
              statusFilter === s ? 'bg-purple-600 text-white border-purple-600' : 'border-muted text-muted-foreground hover:border-foreground/30'
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
              <th className="text-left px-5 py-3 font-medium">Date</th>
              <th className="text-left px-5 py-3 font-medium">Type</th>
              <th className="text-left px-5 py-3 font-medium">Time / Session</th>
              <th className="text-left px-5 py-3 font-medium">Reason</th>
              <th className="text-left px-5 py-3 font-medium">Status</th>
              <th className="text-left px-5 py-3 font-medium">Manager</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-16 text-muted-foreground">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No permission requests found
              </td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-5 py-3">
                  <p className="font-medium">{r.employee?.firstName} {r.employee?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{r.employee?.employeeCode}</p>
                </td>
                <td className="px-5 py-3 font-medium">{fmtDate(r.date)}</td>
                <td className="px-5 py-3">
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                    r.type === 'HALF_DAY' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  )}>
                    {r.type === 'HALF_DAY' ? 'Half Day' : 'Permission'}
                  </span>
                </td>
                <td className="px-5 py-3 text-muted-foreground text-xs">
                  {r.type === 'HALF_DAY' ? r.session : `${r.fromTime} – ${r.toTime}`}
                </td>
                <td className="px-5 py-3 text-muted-foreground truncate max-w-[200px]">{r.reason}</td>
                <td className="px-5 py-3">
                  <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', STATUS_COLORS[r.status] ?? STATUS_COLORS.PENDING)}>
                    {r.status}
                  </span>
                  {r.managerNote && r.status === 'REJECTED' && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{r.managerNote}</p>
                  )}
                </td>
                <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                  {r.manager ? `${r.manager.firstName} ${r.manager.lastName}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
