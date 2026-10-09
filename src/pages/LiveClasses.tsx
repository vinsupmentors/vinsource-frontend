import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import RecordingVideoPlayer from '@/components/ProtectedVideoPlayer';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import {
  LiveClass, ScheduleOption, LiveClassDashboard, STATUS_BADGE, LiveClassSummaryRow,
  LiveClassAttendanceResponse, ATTENDANCE_BADGE, LiveClassAnalytics,
  LiveClassRecordingRecord, LiveClassPlaybackUrl, RECORDING_BADGE, formatDuration,
  formatTimeRange, formatClassDate, errMsg, dayPatternLabel, trainerNames,
} from '@/lib/liveClasses';
import {
  Video, PlayCircle, CalendarClock, CheckCircle2, X, Loader2, PlusCircle,
  Users, Radio, Clock, GraduationCap, ClipboardCheck, RefreshCw, BarChart3,
  MessageSquare, TrendingUp, XCircle, Film, CalendarPlus, Table2, Upload, Download,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] flex flex-col overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm';

type Tab = 'dashboard' | 'today' | 'upcoming' | 'completed' | 'summary' | 'analytics';
const VALID_TABS: Tab[] = ['dashboard', 'today', 'upcoming', 'completed', 'summary', 'analytics'];
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Video },
  { id: 'today', label: "Today's Classes", icon: PlayCircle },
  { id: 'upcoming', label: 'Upcoming Classes', icon: CalendarClock },
  { id: 'completed', label: 'Completed Classes', icon: CheckCircle2 },
  { id: 'summary', label: 'Summary', icon: Table2 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function LiveClassesPage() {
  const { hasModule } = useModuleAccess();
  const canEdit = hasModule('LIVE_CLASSES', 'EDIT');

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab>(tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'dashboard');
  const setTab = (t: Tab) => { setTabState(t); setSearchParams({ tab: t }, { replace: true }); };
  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== tab) setTabState(tabFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Live Classes</h1>
          <p className="text-muted-foreground text-sm">Virtual classrooms, scheduling, and class history for Production's batches.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setShowBulkUpload(true)} className="px-4 py-2 text-sm rounded-lg border inline-flex items-center gap-1.5 hover:bg-muted/40">
              <Upload className="w-4 h-4" /> Bulk Upload (Excel)
            </button>
            <button onClick={() => setShowBulkCreate(true)} className="px-4 py-2 text-sm rounded-lg border inline-flex items-center gap-1.5 hover:bg-muted/40">
              <CalendarPlus className="w-4 h-4" /> Bulk Create
            </button>
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white inline-flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4" /> Create Class
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center justify-between">
          {error}<button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {showCreate && (
        <CreateClassModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); setRefreshKey((n) => n + 1); setTab('upcoming'); }}
          setError={setError}
        />
      )}
      {showBulkCreate && (
        <BulkCreateClassModal
          onClose={() => setShowBulkCreate(false)}
          onSaved={() => { setShowBulkCreate(false); setRefreshKey((n) => n + 1); setTab('upcoming'); }}
          setError={setError}
        />
      )}
      {showBulkUpload && (
        <BulkUploadClassesModal
          onClose={() => setShowBulkUpload(false)}
          onSaved={() => { setShowBulkUpload(false); setRefreshKey((n) => n + 1); setTab('upcoming'); }}
          setError={setError}
        />
      )}

      {tab === 'dashboard' && <DashboardTab setError={setError} refreshKey={refreshKey} />}
      {tab === 'today' && <ClassListTab view="today" canEdit={canEdit} setError={setError} refreshKey={refreshKey} />}
      {tab === 'upcoming' && <ClassListTab view="upcoming" canEdit={canEdit} setError={setError} refreshKey={refreshKey} />}
      {tab === 'completed' && <ClassListTab view="completed" canEdit={canEdit} setError={setError} refreshKey={refreshKey} />}
      {tab === 'summary' && <SummaryTab setError={setError} refreshKey={refreshKey} />}
      {tab === 'analytics' && <AnalyticsTab setError={setError} />}
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab({ setError, refreshKey }: { setError: (s: string) => void; refreshKey: number }) {
  const [data, setData] = useState<LiveClassDashboard | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get('/api/live-classes/dashboard').then((r) => setData(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load the dashboard.')));
  }, [setError]);
  useEffect(() => { load(); }, [load, refreshKey]);
  // Live class count changes fast — refresh every 20s while this tab is open.
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  if (!data) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>;

  const cards = [
    { label: "Today's Classes", value: data.todayCount, icon: CalendarClock, color: 'text-blue-600' },
    { label: 'Live Now', value: data.liveCount, icon: Radio, color: 'text-red-600' },
    { label: 'Upcoming', value: data.upcomingCount, icon: Clock, color: 'text-amber-600' },
    { label: 'Completed Today', value: data.completedTodayCount, icon: CheckCircle2, color: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="border rounded-xl p-4">
            <c.icon className={`w-5 h-5 mb-2 ${c.color}`} />
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3">Live Now</h3>
        {data.live.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-xl p-6 text-center">Nothing is live right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.live.map((c) => (
              <div key={c.id} className="border-2 border-red-200 bg-red-50/40 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><Radio className="w-3 h-3 animate-pulse" /> LIVE</span>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="w-3 h-3" /> {c.liveParticipantCount ?? 0}</span>
                </div>
                <p className="font-semibold text-sm">{c.schedule.course.name} · {c.schedule.batch.code}</p>
                <p className="text-xs text-muted-foreground">{c.title}{c.topic ? ` — ${c.topic}` : ''}</p>
                <p className="text-xs text-muted-foreground">Trainer: {trainerNames(c)} · {formatTimeRange(c.startTime, c.endTime)}</p>
                <button onClick={() => navigate(`/live-classes/${c.id}/room`)} className="w-full mt-1 px-3 py-2 text-sm rounded-lg bg-red-600 text-white font-medium">
                  Join Class
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analytics ────────────────────────────────────────────────────────────────
function AnalyticsTab({ setError }: { setError: (s: string) => void }) {
  const [data, setData] = useState<LiveClassAnalytics | null>(null);

  useEffect(() => {
    api.get('/api/live-classes/analytics').then((r) => setData(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load analytics.')));
  }, [setError]);

  if (!data) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>;

  const cards = [
    { label: 'Classes Held', value: data.summary.completedClasses, icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Cancelled', value: data.summary.cancelledClasses, icon: XCircle, color: 'text-red-600' },
    { label: 'Avg. Attendance', value: `${data.summary.avgAttendancePercent}%`, icon: TrendingUp, color: 'text-blue-600' },
    { label: 'Avg. Chat / Class', value: data.summary.avgChatMessagesPerClass, icon: MessageSquare, color: 'text-purple-600' },
  ];

  const chartData = data.trend.map((t) => ({ date: formatClassDate(t.date), pct: t.avgAttendancePercent }));

  if (data.summary.totalClasses === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8 border rounded-xl">No completed classes yet — analytics fill in once classes start wrapping up.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="border rounded-xl p-4">
            <c.icon className={`w-5 h-5 mb-2 ${c.color}`} />
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      {chartData.length > 1 && (
        <div className="border rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-3">Attendance Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} formatter={(v: number) => [`${v}%`, 'Avg. attendance']} />
              <Area type="monotone" dataKey="pct" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold text-sm mb-3">By Trainer</h3>
          {data.byTrainer.length === 0 ? (
            <p className="text-sm text-muted-foreground border rounded-xl p-4 text-center">No data yet.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr><th className="text-left px-3 py-2 font-medium">Trainer</th><th className="text-left px-3 py-2 font-medium">Classes</th><th className="text-left px-3 py-2 font-medium">Avg. Attendance</th></tr>
                </thead>
                <tbody className="divide-y">
                  {data.byTrainer.map((t) => (
                    <tr key={t.trainerId}>
                      <td className="px-3 py-2">{t.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.classesHosted}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.avgAttendancePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-semibold text-sm mb-3">By Batch</h3>
          {data.byBatch.length === 0 ? (
            <p className="text-sm text-muted-foreground border rounded-xl p-4 text-center">No data yet.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr><th className="text-left px-3 py-2 font-medium">Batch</th><th className="text-left px-3 py-2 font-medium">Classes</th><th className="text-left px-3 py-2 font-medium">Avg. Attendance</th></tr>
                </thead>
                <tbody className="divide-y">
                  {data.byBatch.map((b) => (
                    <tr key={b.batchId}>
                      <td className="px-3 py-2">{b.code}</td>
                      <td className="px-3 py-2 text-muted-foreground">{b.classesCount}</td>
                      <td className="px-3 py-2 text-muted-foreground">{b.avgAttendancePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Class list (Today / Upcoming / Completed) ─────────────────────────────────
/** ISO timestamp -> local yyyy-mm-dd (matches how dates are displayed on the cards). */
function localYmd(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ClassListTab({ view, canEdit, setError, refreshKey }: { view: 'today' | 'upcoming' | 'completed'; canEdit: boolean; setError: (s: string) => void; refreshKey: number }) {
  const [classes, setClasses] = useState<LiveClass[] | null>(null);
  const [attendanceFor, setAttendanceFor] = useState<LiveClass | null>(null);
  const [recordingsFor, setRecordingsFor] = useState<LiveClass | null>(null);
  const [reportFor, setReportFor] = useState<LiveClass | null>(null);
  const [filterBatch, setFilterBatch] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterSession, setFilterSession] = useState('');
  const [filterMonth, setFilterMonth] = useState(''); // yyyy-mm
  const [filterDate, setFilterDate] = useState(''); // yyyy-mm-dd
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCancelling, setBulkCancelling] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get('/api/live-classes', { params: { view } }).then((r) => setClasses(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load classes.')));
  }, [view, setError]);
  useEffect(() => { load(); }, [load, refreshKey]);
  // Filter dropdowns (and any in-progress multi-select) reset whenever the
  // tab's underlying view changes, so switching from Upcoming to Completed
  // doesn't carry over a stale filter or selection that no longer applies.
  useEffect(() => { setFilterBatch(''); setFilterCourse(''); setFilterSession(''); setFilterMonth(''); setFilterDate(''); setSelectedIds(new Set()); }, [view]);

  const start = (id: string) => {
    api.post(`/api/live-classes/${id}/start`)
      .then(() => navigate(`/live-classes/${id}/room`))
      .catch((err) => setError(errMsg(err, 'Could not start the class.')));
  };

  const cancel = (c: LiveClass) => {
    const reason = window.prompt(`Cancel "${c.title}"? Enrolled students will be notified. Reason (optional):`);
    if (reason === null) return;
    api.post(`/api/live-classes/${c.id}/cancel`, { reason: reason || undefined })
      .then(load)
      .catch((err) => setError(errMsg(err, 'Could not cancel the class.')));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const cancelSelected = () => {
    if (!selectedIds.size) return;
    const reason = window.prompt(`Cancel ${selectedIds.size} selected class${selectedIds.size === 1 ? '' : 'es'}? Reason (optional):`);
    if (reason === null) return;
    setBulkCancelling(true);
    api.post('/api/live-classes/cancel-bulk', { ids: Array.from(selectedIds), reason: reason || undefined })
      .then((r) => {
        const results = r.data.data.results as { id: string; status: 'cancelled' | 'error'; message?: string }[];
        const failed = results.filter((x) => x.status === 'error');
        if (failed.length) setError(`${results.length - failed.length} cancelled, ${failed.length} could not be cancelled (${failed[0].message}${failed.length > 1 ? ', ...' : ''}).`);
        setSelectedIds(new Set());
        load();
      })
      .catch((err) => setError(errMsg(err, 'Could not cancel the selected classes.')))
      .finally(() => setBulkCancelling(false));
  };

  if (classes === null) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>;
  if (classes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8 border rounded-xl">
        {view === 'today' && 'No classes today.'}
        {view === 'upcoming' && (canEdit ? 'No upcoming classes yet — use Create Class to schedule one.' : 'No upcoming classes yet.')}
        {view === 'completed' && 'No completed classes yet.'}
      </p>
    );
  }

  // Filter options are derived from what's actually loaded for this tab,
  // rather than a separate lookup — keeps them automatically scoped to
  // whatever this person can already see (their own batches, if not admin).
  const batchOptions = Array.from(new Set(classes.map((c) => c.schedule.batch.code))).sort();
  const courseOptions = Array.from(new Set(classes.map((c) => c.schedule.course.name))).sort();
  const sessionOptions = Array.from(new Set(classes.map((c) => formatTimeRange(c.startTime, c.endTime)))).sort();

  const filtered = classes.filter((c) =>
    (!filterBatch || c.schedule.batch.code === filterBatch) &&
    (!filterCourse || c.schedule.course.name === filterCourse) &&
    (!filterSession || formatTimeRange(c.startTime, c.endTime) === filterSession) &&
    (!filterMonth || localYmd(c.scheduledDate).startsWith(filterMonth)) &&
    (!filterDate || localYmd(c.scheduledDate) === filterDate)
  );
  const cancelableIds = filtered.filter((c) => c.status === 'SCHEDULED').map((c) => c.id);
  const allCancelableSelected = cancelableIds.length > 0 && cancelableIds.every((id) => selectedIds.has(id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="border rounded-lg px-3 py-1.5 text-sm" value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="">All Batches</option>
          {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-1.5 text-sm" value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
          <option value="">All Courses</option>
          {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-1.5 text-sm" value={filterSession} onChange={(e) => setFilterSession(e.target.value)}>
          <option value="">All Sessions</option>
          {sessionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="month" title="Filter by month" className="border rounded-lg px-3 py-1.5 text-sm" value={filterMonth}
          onChange={(e) => { setFilterMonth(e.target.value); setFilterDate(''); }} />
        <input type="date" title="Filter by date" className="border rounded-lg px-3 py-1.5 text-sm" value={filterDate}
          onChange={(e) => { setFilterDate(e.target.value); setFilterMonth(''); }} />
        {(filterBatch || filterCourse || filterSession || filterMonth || filterDate) && (
          <button onClick={() => { setFilterBatch(''); setFilterCourse(''); setFilterSession(''); setFilterMonth(''); setFilterDate(''); }} className="text-xs text-muted-foreground underline">
            Clear filters
          </button>
        )}
        {canEdit && cancelableIds.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={allCancelableSelected}
              onChange={() => setSelectedIds(allCancelableSelected ? new Set() : new Set(cancelableIds))}
            />
            Select all scheduled
          </label>
        )}
      </div>

      {canEdit && selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <span className="text-sm text-red-800">{selectedIds.size} class{selectedIds.size === 1 ? '' : 'es'} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-xs rounded-lg border">Clear</button>
            <button onClick={cancelSelected} disabled={bulkCancelling} className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium disabled:opacity-50">
              {bulkCancelling ? 'Cancelling...' : 'Cancel Selected'}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 border rounded-xl">No classes match the selected filters.</p>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filtered.map((c) => (
        <div key={c.id} className={`border rounded-xl p-4 space-y-2 ${selectedIds.has(c.id) ? 'ring-2 ring-red-300' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              {canEdit && c.status === 'SCHEDULED' && (
                <input type="checkbox" className="mt-1" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} />
              )}
              <div>
                <p className="font-semibold text-sm">{c.schedule.course.name}</p>
                <p className="text-xs text-muted-foreground">{c.schedule.batch.code}</p>
              </div>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[c.status]}`}>{c.status}</span>
          </div>
          <p className="text-sm">{c.title}{c.topic ? <span className="text-muted-foreground"> — {c.topic}</span> : null}</p>
          <p className="text-xs text-muted-foreground">Trainer: {trainerNames(c)}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {formatClassDate(c.scheduledDate)} · {formatTimeRange(c.startTime, c.endTime)}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><GraduationCap className="w-3 h-3" /> {c.schedule._count?.enrollments ?? 0} students enrolled</p>
          {c.status === 'CANCELLED' && c.cancelReason && <p className="text-xs text-red-600">Reason: {c.cancelReason}</p>}

          <div className="flex gap-2 pt-1">
            {c.status === 'LIVE' && (
              <button onClick={() => navigate(`/live-classes/${c.id}/room`)} className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium">Join Class</button>
            )}
            {c.status === 'SCHEDULED' && canEdit && (
              <button onClick={() => start(c.id)} className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white font-medium">Start Class</button>
            )}
            {c.status === 'SCHEDULED' && canEdit && (
              <button onClick={() => cancel(c)} className="px-3 py-1.5 text-xs rounded-lg border text-red-600">Cancel</button>
            )}
            {(c.status === 'COMPLETED' || (c.status === 'SCHEDULED' && !canEdit)) && (
              <button onClick={() => navigate(`/live-classes/${c.id}/room`)} className="flex-1 px-3 py-1.5 text-xs rounded-lg border">View Details</button>
            )}
            {c.status === 'COMPLETED' && canEdit && (
              <button onClick={() => setAttendanceFor(c)} className="px-3 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1">
                <ClipboardCheck className="w-3 h-3" /> Attendance
              </button>
            )}
            {(c.status === 'COMPLETED' || c.status === 'LIVE') && canEdit && (
              <button onClick={() => setReportFor(c)} className="px-3 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1">
                <Table2 className="w-3 h-3" /> Report
              </button>
            )}
            {c.status === 'COMPLETED' && (
              <button onClick={() => setRecordingsFor(c)} className="px-3 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1">
                <Film className="w-3 h-3" /> Recording
              </button>
            )}
          </div>
        </div>
      ))}
      </div>
      )}
      {attendanceFor && <AttendanceModal liveClass={attendanceFor} onClose={() => setAttendanceFor(null)} setError={setError} />}
      {reportFor && <MeetingReportModal liveClass={reportFor} onClose={() => setReportFor(null)} setError={setError} />}
      {recordingsFor && <RecordingsModal liveClass={recordingsFor} onClose={() => setRecordingsFor(null)} setError={setError} />}
    </div>
  );
}

// ── Summary — one row per sub-batch (Batch, Sub-batch, Schedule From, Date
// Till, Total running days, classes created so far) ─────────────────────────
function SummaryTab({ setError, refreshKey }: { setError: (s: string) => void; refreshKey: number }) {
  const [rows, setRows] = useState<LiveClassSummaryRow[] | null>(null);
  const [filterBatch, setFilterBatch] = useState('');

  useEffect(() => {
    api.get('/api/live-classes/summary').then((r) => setRows(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load the summary.')));
  }, [refreshKey, setError]);

  if (rows === null) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground text-center py-8 border rounded-xl">No sub-batches to summarize yet.</p>;

  const batchOptions = Array.from(new Set(rows.map((r) => r.batch.code))).sort();
  const filtered = filterBatch ? rows.filter((r) => r.batch.code === filterBatch) : rows;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select className="border rounded-lg px-3 py-1.5 text-sm" value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="">All Batches</option>
          {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div className="border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Batch</th>
              <th className="text-left font-medium px-3 py-2">Sub-batch</th>
              <th className="text-left font-medium px-3 py-2">Course</th>
              <th className="text-left font-medium px-3 py-2">Schedule From</th>
              <th className="text-left font-medium px-3 py-2">Date Till</th>
              <th className="text-right font-medium px-3 py-2">Total Days</th>
              <th className="text-right font-medium px-3 py-2">Live Classes Created</th>
              <th className="text-right font-medium px-3 py-2">Created For (Days)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr key={r.scheduleId}>
                <td className="px-3 py-2 font-medium">{r.batch.code}</td>
                <td className="px-3 py-2">{r.code || '—'}</td>
                <td className="px-3 py-2">{r.course.name}</td>
                <td className="px-3 py-2">{formatClassDate(r.startDate)}</td>
                <td className="px-3 py-2">{r.endDate ? formatClassDate(r.endDate) : 'Ongoing'}</td>
                <td className="px-3 py-2 text-right">{r.totalRunningDays ?? '—'}</td>
                <td className="px-3 py-2 text-right">{r.classesScheduledCount}</td>
                <td className="px-3 py-2 text-right">{r.daysCreated}{r.totalRunningDays ? ` / ${r.totalRunningDays}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Recordings modal (staff + student, same component) ──────────────────────
interface MeetingReport {
  class: { title: string; status: string; scheduledDate: string; startTime: string; endTime: string; actualStartAt: string | null; actualEndAt: string | null; course: string; batch: string; subBatch: string | null };
  summary: { durationSec: number; participantCount: number; avgSec: number };
  participants: { name: string; code: string | null; role: string; firstJoinedAt: string; lastLeftAt: string; totalSec: number }[];
}
const hms = (sec: number) => `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—');
const ROLE_TXT: Record<string, string> = { HOST: 'Host', CO_TRAINER: 'Co-trainer', STUDENT: 'Student', DEMO: 'Demo guest' };

/** Meeting history — when the class actually ran and each participant's first-joined time and total time in the room. */
function MeetingReportModal({ liveClass, onClose, setError }: { liveClass: LiveClass; onClose: () => void; setError: (s: string) => void }) {
  const [data, setData] = useState<MeetingReport | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    api.get(`/api/live-classes/${liveClass.id}/report`).then((r) => setData(r.data.data)).catch((e) => { setError(errMsg(e, 'Could not load the meeting report.')); onClose(); });
  }, [liveClass.id, setError, onClose]);

  const exportCsv = () => {
    if (!data) return;
    const rows = data.participants.map((p) => ({ Name: p.name, Code: p.code || '', Role: ROLE_TXT[p.role] || p.role, 'First joined': clock(p.firstJoinedAt), 'Last left': clock(p.lastLeftAt), 'Time in call (HH:MM:SS)': hms(p.totalSec) }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Meeting report');
    XLSX.writeFile(wb, `meeting-report-${liveClass.classCode}.xlsx`);
  };

  const list = (data?.participants || []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={`Meeting Report — ${liveClass.title}`} onClose={onClose} wide>
      {!data ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div> : (
        <>
          <p className="text-sm text-muted-foreground">{data.class.course} · {data.class.batch}{data.class.subBatch ? ` / ${data.class.subBatch}` : ''} · {formatClassDate(data.class.scheduledDate)}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Started', clock(data.class.actualStartAt)],
              ['Ended', data.class.actualEndAt ? clock(data.class.actualEndAt) : data.class.status === 'LIVE' ? 'Live now' : '—'],
              ['Meeting duration', hms(data.summary.durationSec)],
              ['Participants', String(data.summary.participantCount)],
            ].map(([k, v]) => (
              <div key={k} className="border rounded-lg px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p><p className="font-semibold">{v}</p></div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Avg. time in call (students): <b>{hms(data.summary.avgSec)}</b></p>
          <div className="flex items-center gap-2">
            <input className={inputCls} placeholder="Search by participant name" value={q} onChange={(e) => setQ(e.target.value)} />
            <button onClick={exportCsv} className="px-3 py-2 text-xs rounded-lg border inline-flex items-center gap-1 whitespace-nowrap"><Download className="w-3.5 h-3.5" /> Export</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b"><th className="py-2">Name</th><th>First joined</th><th>Last left</th><th className="text-right">Time in call</th></tr></thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2">{p.name}{p.code ? <span className="text-xs text-muted-foreground"> ({p.code})</span> : null} {(p.role === 'HOST' || p.role === 'CO_TRAINER') && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{ROLE_TXT[p.role]}</span>}</td>
                  <td>{clock(p.firstJoinedAt)}</td><td>{clock(p.lastLeftAt)}</td><td className="text-right font-mono">{hms(p.totalSec)}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No participants.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}

function RecordingsModal({ liveClass, onClose, setError }: { liveClass: LiveClass; onClose: () => void; setError: (s: string) => void }) {
  const [recordings, setRecordings] = useState<LiveClassRecordingRecord[] | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playback, setPlayback] = useState<LiveClassPlaybackUrl | null>(null);

  useEffect(() => {
    api.get(`/api/live-classes/${liveClass.id}/recordings`).then((r) => setRecordings(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load recordings.')));
  }, [liveClass.id, setError]);

  const play = (recordingId: string) => {
    setPlayingId(recordingId);
    setPlayback(null);
    api.get(`/api/live-classes/${liveClass.id}/recordings/${recordingId}/play`)
      .then((r) => setPlayback(r.data.data))
      .catch((err) => { setError(errMsg(err, 'Could not load the recording.')); setPlayingId(null); });
  };

  return (
    <Modal title={`Recording — ${liveClass.title}`} onClose={onClose} wide>
      {!recordings ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
      ) : recordings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No recording available for this class.</p>
      ) : (
        <div className="space-y-3">
          {playingId && playback && (
            <RecordingVideoPlayer key={playback.url} url={playback.url} />
          )}
          {playingId && !playback && (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
          )}
          <div className="border rounded-lg divide-y">
            {recordings.map((r) => (
              <div key={r.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{formatClassDate(r.startedAt)} · {formatDuration(r.durationSec)}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RECORDING_BADGE[r.status]}`}>{r.status}</span>
                  {r.status === 'FAILED' && r.failReason && <p className="text-xs text-red-600 mt-1 break-words max-w-md">Reason: {r.failReason}</p>}
                </div>
                {r.status === 'READY' ? (
                  <button onClick={() => play(r.id)} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white font-medium inline-flex items-center gap-1">
                    <PlayCircle className="w-3 h-3" /> {playingId === r.id ? 'Playing' : 'Play'}
                  </button>
                ) : r.status === 'RECORDING' ? (
                  <span className="text-xs text-muted-foreground">Processing…</span>
                ) : (
                  <span className="text-xs text-red-600">Failed</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}


// ── Attendance modal (staff) ─────────────────────────────────────────────────
function AttendanceModal({ liveClass, onClose, setError }: { liveClass: LiveClass; onClose: () => void; setError: (s: string) => void }) {
  const [data, setData] = useState<LiveClassAttendanceResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  const load = useCallback(() => {
    api.get(`/api/live-classes/${liveClass.id}/attendance`).then((r) => setData(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load attendance.')));
  }, [liveClass.id, setError]);
  useEffect(() => { load(); }, [load]);

  const sync = () => {
    setSyncing(true);
    api.post(`/api/live-classes/${liveClass.id}/attendance/sync`)
      .then(() => setSynced(true))
      .catch((err) => setError(errMsg(err, 'Could not sync to daily attendance.')))
      .finally(() => setSyncing(false));
  };

  return (
    <Modal title={`Attendance — ${liveClass.title}`} onClose={onClose} wide>
      {!data ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
      ) : data.records.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No attendance computed for this class yet.</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">{data.records.length} enrolled student{data.records.length === 1 ? '' : 's'}</p>
            <button onClick={sync} disabled={syncing} className="px-3 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1.5 disabled:opacity-50">
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {synced ? 'Synced to Daily Attendance' : 'Sync to Daily Attendance'}
            </button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Student</th>
                  <th className="text-left px-3 py-2 font-medium">Time in class</th>
                  <th className="text-left px-3 py-2 font-medium">%</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.student.firstName} {r.student.lastName}</p>
                      <p className="text-xs text-muted-foreground">{r.student.studentCode}</p>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.attendedMinutes}m / {r.classMinutes}m</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.percentAttended}%</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ATTENDANCE_BADGE[r.status]}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Create Class modal ─────────────────────────────────────────────────────────
function CreateClassModal({ onClose, onSaved, setError }: { onClose: () => void; onSaved: () => void; setError: (s: string) => void }) {
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [batchId, setBatchId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/live-classes/schedules').then((r) => setSchedules(r.data.data)).catch(() => setSchedules([]));
  }, []);

  // Batch first, then sub-batch — flattening every batch/course into one
  // long list made it hard to find the right sub-batch once a batch had
  // several running at once, so pick the batch, then filter down to it.
  const batches = Array.from(new Map(schedules.map((s) => [s.batch.id, s.batch])).values());
  const batchSchedules = schedules.filter((s) => s.batch.id === batchId);

  const canSubmit = scheduleId && title.trim() && scheduledDate && startTime && endTime;

  const submit = () => {
    if (!canSubmit) return;
    setSaving(true);
    api.post('/api/live-classes', {
      scheduleId, title: title.trim(), topic: topic || undefined, description: description || undefined,
      scheduledDate, startTime, endTime,
    })
      .then(onSaved)
      .catch((err) => setError(errMsg(err, 'Could not create the class.')))
      .finally(() => setSaving(false));
  };

  return (
    <Modal title="Create Live Class" onClose={onClose}>
      <Field label="Batch *">
        <select className={inputCls} value={batchId} onChange={(e) => { setBatchId(e.target.value); setScheduleId(''); }}>
          <option value="">Select a batch</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.code}</option>
          ))}
        </select>
        {schedules.length === 0 && <p className="text-xs text-muted-foreground mt-1">No batches assigned to you yet — a Live Classes admin needs to assign you as a trainer, or grant Admin-level access.</p>}
      </Field>
      <Field label="Sub-batch / Course *">
        <select className={inputCls} value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} disabled={!batchId}>
          <option value="">{batchId ? 'Select a sub-batch & course' : 'Pick a batch first'}</option>
          {batchSchedules.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code ? `${s.code} — ` : ''}{s.course.name}{s.startTime ? ` (${s.startTime}–${s.endTime})` : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Class Title *"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Data Cleaning with Pandas" /></Field>
      <Field label="Topic"><input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Optional" /></Field>
      <Field label="Description"><textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Date *"><input type="date" className={inputCls} value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} /></Field>
        <Field label="Start Time *"><input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
        <Field label="End Time *"><input type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
        <button onClick={submit} disabled={!canSubmit || saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Creating...' : 'Create Class'}</button>
      </div>
    </Modal>
  );
}

// ── Bulk Create modal — one sub-batch, a timing, a date range -> one class ──
// per day the sub-batch actually runs on, instead of adding them one at a time.
interface BulkCreateResult { createdCount: number; skippedCount: number; skippedDates: string[]; notRunningCount: number; endDate?: string }

function BulkCreateClassModal({ onClose, onSaved, setError }: { onClose: () => void; onSaved: () => void; setError: (s: string) => void }) {
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [batchId, setBatchId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [rangeMode, setRangeMode] = useState<'endDate' | 'numDays'>('endDate');
  const [endDate, setEndDate] = useState('');
  const [numDays, setNumDays] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BulkCreateResult | null>(null);

  useEffect(() => {
    api.get('/api/live-classes/schedules').then((r) => setSchedules(r.data.data)).catch(() => setSchedules([]));
  }, []);

  // Batch first, then sub-batch — same two-step picker as Create Class, so
  // the long flat list of every sub-batch doesn't have to be scanned by eye.
  const batches = Array.from(new Map(schedules.map((s) => [s.batch.id, s.batch])).values());
  const batchSchedules = schedules.filter((s) => s.batch.id === batchId);

  const selected = schedules.find((s) => s.id === scheduleId) || null;

  // Prefill start/end time and a sensible date range from the picked
  // sub-batch as soon as it's chosen — the sub-batch's own startTime/endTime
  // and startDate/endDate are almost always exactly what's wanted here.
  useEffect(() => {
    if (!selected) return;
    if (selected.startTime && !startTime) setStartTime(selected.startTime);
    if (selected.endTime && !endTime) setEndTime(selected.endTime);
    if (!startDate) setStartDate(selected.startDate.slice(0, 10));
    // Only prefill End Date while that mode is actually active — otherwise
    // picking a sub-batch quietly fills in a real end date in the
    // background, and if the person then switches to "Number of running
    // days" without separately clearing it, that stale date would win at
    // submit time even though the number field looks like it's in control.
    if (rangeMode === 'endDate' && !endDate && selected.endDate) setEndDate(selected.endDate.slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId]);

  const canSubmit = Boolean(
    scheduleId && title.trim() && startDate && startTime && endTime &&
    (rangeMode === 'endDate' ? endDate && endDate >= startDate : numDays && Number(numDays) >= 1)
  );

  const submit = () => {
    if (!canSubmit) return;
    setSaving(true);
    setResult(null);
    api.post('/api/live-classes/bulk', {
      scheduleId, title: title.trim(), topic: topic || undefined, description: description || undefined,
      startDate, startTime, endTime,
      // Belt-and-suspenders: even though the fields now self-clear on mode
      // switch, only the field matching the active mode is ever sent —
      // never both, so a stray leftover value in the inactive field can't
      // silently win.
      endDate: rangeMode === 'endDate' ? (endDate || undefined) : undefined,
      numDays: rangeMode === 'numDays' ? (Number(numDays) || undefined) : undefined,
    })
      .then((r) => setResult(r.data.data))
      .catch((err) => setError(errMsg(err, 'Could not bulk-create the classes.')))
      .finally(() => setSaving(false));
  };

  return (
    <Modal title="Bulk Create Live Classes" onClose={onClose}>
      {result ? (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
            Created <strong>{result.createdCount}</strong> class{result.createdCount === 1 ? '' : 'es'}.
            {result.endDate && <> Last class: <strong>{formatClassDate(result.endDate)}</strong>.</>}
          </div>
          {result.skippedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Skipped {result.skippedCount} date{result.skippedCount === 1 ? '' : 's'} that already had a class on this batch: {result.skippedDates.join(', ')}
            </p>
          )}
          {result.notRunningCount > 0 && (
            <p className="text-xs text-muted-foreground">{result.notRunningCount} day{result.notRunningCount === 1 ? '' : 's'} in the range were skipped because the batch doesn't run that day.</p>
          )}
          <div className="flex justify-end pt-2">
            <button onClick={onSaved} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Done</button>
          </div>
        </div>
      ) : (
        <>
          <Field label="Batch *">
            <select className={inputCls} value={batchId} onChange={(e) => { setBatchId(e.target.value); setScheduleId(''); }}>
              <option value="">Select a batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.code}</option>
              ))}
            </select>
            {schedules.length === 0 && <p className="text-xs text-muted-foreground mt-1">No batches assigned to you yet — a Live Classes admin needs to assign you as a trainer, or grant Admin-level access.</p>}
          </Field>
          <Field label="Sub-batch / Course *">
            <select className={inputCls} value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} disabled={!batchId}>
              <option value="">{batchId ? 'Select a sub-batch & course' : 'Pick a batch first'}</option>
              {batchSchedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} — ` : ''}{s.course.name}{s.startTime ? ` (${s.startTime}–${s.endTime})` : ''}
                </option>
              ))}
            </select>
            {selected && <p className="text-xs text-muted-foreground mt-1">Runs: {dayPatternLabel(selected)} — a class is only created on days the batch actually runs.</p>}
          </Field>
          <Field label="Class Title *"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Data Cleaning with Pandas" /></Field>
          <Field label="Topic"><input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Optional — applied to every class created" /></Field>
          <Field label="Description"><textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></Field>
          <Field label="Start Date *"><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Range *</span>
            <div className="flex gap-3 mt-1 mb-2">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="radio" checked={rangeMode === 'endDate'} onChange={() => { setRangeMode('endDate'); setNumDays(''); }} /> End date
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="radio" checked={rangeMode === 'numDays'} onChange={() => { setRangeMode('numDays'); setEndDate(''); }} /> Number of running days
              </label>
            </div>
            {rangeMode === 'endDate' ? (
              <input
                type="date" className={inputCls} value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setRangeMode('endDate'); }}
              />
            ) : (
              <div>
                <input
                  type="number" min={1} max={300} className={inputCls} value={numDays}
                  onChange={(e) => { setNumDays(e.target.value); setRangeMode('numDays'); }} placeholder="e.g. 25"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Counts only the days {selected ? dayPatternLabel(selected).toLowerCase() : 'this sub-batch'} runs on —
                  skips off days automatically, so 25 means 25 actual classes, not 25 calendar days.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Time *"><input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
            <Field label="End Time *"><input type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
          </div>
          {rangeMode === 'endDate' && endDate && startDate && endDate < startDate && <p className="text-xs text-red-600">End date can't be before start date.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
            <button onClick={submit} disabled={!canSubmit || saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Creating...' : 'Create Classes'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Bulk Upload via Excel — one row per class, each with its own date/time;
// unlike Bulk Create's single sub-batch + day-pattern fill, this is for a
// mixed batch of classes (different sub-batches, one-off dates, makeup
// classes) laid out in a spreadsheet. Parsed client-side with the same
// xlsx library/pattern as Sales' lead bulk upload. ─────────────────────────
type BulkUploadRow = Record<string, string>;
type BulkUploadResult = { row: number; status: 'created' | 'error'; message?: string; classId?: string; date?: string };

function uploadField(row: BulkUploadRow, ...aliases: string[]): string {
  const normalized: Record<string, string> = {};
  for (const key of Object.keys(row)) normalized[key.trim().toLowerCase().replace(/\s+/g, '')] = String(row[key] ?? '').trim();
  for (const alias of aliases) {
    const v = normalized[alias];
    if (v) return v;
  }
  return '';
}

function BulkUploadClassesModal({ onClose, onSaved, setError }: { onClose: () => void; onSaved: () => void; setError: (s: string) => void }) {
  const [rows, setRows] = useState<BulkUploadRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<BulkUploadResult[] | null>(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { subBatchCode: 'B17-DA-MOR', title: 'Data Cleaning with Pandas', topic: 'Pandas', description: '', date: '2026-10-10', startDate: '', endDate: '', numDays: '', startTime: '09:30', endTime: '13:30' },
      { subBatchCode: 'B17-DA-MOR', title: 'EDA Basics', topic: '', description: '', date: '2026-10-11', startDate: '', endDate: '', numDays: '', startTime: '09:30', endTime: '13:30' },
      { subBatchCode: 'B17-DA-MOR', title: 'Regular Session', topic: '', description: '', date: '', startDate: '2026-10-13', endDate: '2026-10-24', numDays: '', startTime: '09:30', endTime: '13:30' },
      { subBatchCode: 'B17-DA-MOR', title: 'Regular Session', topic: '', description: '', date: '', startDate: '2026-11-02', endDate: '', numDays: '25', startTime: '09:30', endTime: '13:30' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Classes');
    XLSX.writeFile(wb, 'live_classes_bulk_upload_template.xlsx');
  };

  const onFile = (file: File) => {
    setFileName(file.name);
    setResults(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        // cellDates + dateNF: a date-formatted Excel cell (which is what you
        // get when you type a real date and Excel auto-formats the column,
        // as opposed to typing "2026-10-10" into a plain-text cell) comes
        // back from the sheet as a numeric day-serial (e.g. 46298) unless
        // told otherwise — that serial then fails to parse as a date
        // server-side and the row is silently skipped. This forces every
        // date cell to come through as the same "yyyy-mm-dd" string the
        // backend expects either way.
        const wb = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<BulkUploadRow>(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
        setRows(json);
      } catch {
        setError('Could not parse the file. Please use the template format.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const submit = async () => {
    if (!rows.length) { setError('Choose a file with class rows first'); return; }
    setUploading(true);
    setError('');
    try {
      const res = await api.post('/api/live-classes/bulk-upload', { classes: rows });
      setResults(res.data.data.results);
      onSaved();
    } catch (err) {
      setError(errMsg(err, 'Bulk upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const createdCount = results?.filter((r) => r.status === 'created').length ?? 0;
  const errorCount = results ? results.length - createdCount : 0;

  return (
    <Modal title="Bulk Upload Classes (Excel)" onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        Columns: <code>subBatchCode, title, topic, description, date, startDate, endDate, numDays, startTime, endTime</code>.
        Each row needs either a single <code>date</code> (one class), or a <code>startDate</code> with either
        <code>endDate</code> or <code>numDays</code> (fills every day the sub-batch runs on, same as Bulk Create —
        <code>numDays</code> counts only running days, e.g. 25 means 25 actual classes, skipping off days — leave
        <code>date</code> blank for this). Rows can mix all three styles and different sub-batches, so this also
        covers one-off makeup classes. <code>subBatchCode</code> must match a sub-batch code exactly (shown in Create
        Class's dropdown). A date that already has a class on that sub-batch is skipped and reported, so it's safe to
        re-upload the same file.
      </p>
      <button onClick={downloadTemplate} className="text-xs px-3 py-2 border rounded-lg hover:bg-muted/50 flex items-center gap-1">
        <Download className="w-3 h-3" /> Download template
      </button>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        className="w-full text-sm border rounded-lg px-3 py-2"
      />
      {fileName && !results && <p className="text-xs text-muted-foreground">{fileName} — {rows.length} row{rows.length === 1 ? '' : 's'} parsed.</p>}

      {rows.length > 0 && !results && (
        <div className="border rounded-lg max-h-44 overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 text-left sticky top-0">
              <tr>{['Sub-batch', 'Title', 'Date', 'Time'].map((h) => <th key={h} className="px-2 py-1 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {rows.slice(0, 10).map((r, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 whitespace-nowrap">{uploadField(r, 'subbatchcode', 'subbatch', 'code') || <span className="text-red-500">missing</span>}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{uploadField(r, 'title', 'classtitle') || '—'}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {uploadField(r, 'date', 'scheduleddate', 'classdate') ||
                      (uploadField(r, 'startdate', 'start date', 'from') && uploadField(r, 'enddate', 'end date', 'till', 'to')
                        ? `${uploadField(r, 'startdate', 'start date', 'from')} → ${uploadField(r, 'enddate', 'end date', 'till', 'to')}`
                        : '—')}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">{uploadField(r, 'starttime', 'start')}–{uploadField(r, 'endtime', 'end')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 10 && <p className="text-[10px] text-muted-foreground px-2 py-1">...and {rows.length - 10} more row(s)</p>}
        </div>
      )}

      {results && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            <span className="text-green-600">{createdCount} created</span>
            {errorCount > 0 && <span className="text-red-600"> · {errorCount} skipped</span>}
          </p>
          {errorCount > 0 && (
            <div className="border rounded-lg max-h-40 overflow-auto divide-y">
              {results.filter((r) => r.status === 'error').map((r, i) => (
                <div key={`${r.row}-${r.date || i}`} className="px-2 py-1.5 text-xs">
                  <span className="font-medium">Row {r.row}{r.date ? ` (${r.date})` : ''}:</span> {r.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">{results ? 'Close' : 'Cancel'}</button>
        {!results && (
          <button onClick={submit} disabled={uploading || !rows.length} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {uploading ? 'Uploading...' : `Upload ${rows.length || ''} Class${rows.length === 1 ? '' : 'es'}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
