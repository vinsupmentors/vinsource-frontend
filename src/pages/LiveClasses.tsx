import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import {
  LiveClass, ScheduleOption, LiveClassDashboard, STATUS_BADGE,
  LiveClassAttendanceResponse, ATTENDANCE_BADGE, LiveClassAnalytics,
  LiveClassRecordingRecord, LiveClassPlaybackUrl, RECORDING_BADGE, formatDuration,
  formatTimeRange, formatClassDate, errMsg,
} from '@/lib/liveClasses';
import {
  Video, PlayCircle, CalendarClock, CheckCircle2, X, Loader2, PlusCircle,
  Users, Radio, Clock, GraduationCap, ClipboardCheck, RefreshCw, BarChart3,
  MessageSquare, TrendingUp, XCircle, Film,
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

type Tab = 'dashboard' | 'today' | 'upcoming' | 'completed' | 'analytics';
const VALID_TABS: Tab[] = ['dashboard', 'today', 'upcoming', 'completed', 'analytics'];
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Video },
  { id: 'today', label: "Today's Classes", icon: PlayCircle },
  { id: 'upcoming', label: 'Upcoming Classes', icon: CalendarClock },
  { id: 'completed', label: 'Completed Classes', icon: CheckCircle2 },
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
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Live Classes</h1>
          <p className="text-muted-foreground text-sm">Virtual classrooms, scheduling, and class history for Production's batches.</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white inline-flex items-center gap-1.5">
            <PlusCircle className="w-4 h-4" /> Create Class
          </button>
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

      {tab === 'dashboard' && <DashboardTab setError={setError} refreshKey={refreshKey} />}
      {tab === 'today' && <ClassListTab view="today" canEdit={canEdit} setError={setError} refreshKey={refreshKey} />}
      {tab === 'upcoming' && <ClassListTab view="upcoming" canEdit={canEdit} setError={setError} refreshKey={refreshKey} />}
      {tab === 'completed' && <ClassListTab view="completed" canEdit={canEdit} setError={setError} refreshKey={refreshKey} />}
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
                <p className="text-xs text-muted-foreground">Trainer: {c.createdBy ? `${c.createdBy.firstName} ${c.createdBy.lastName}` : '—'} · {formatTimeRange(c.startTime, c.endTime)}</p>
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
function ClassListTab({ view, canEdit, setError, refreshKey }: { view: 'today' | 'upcoming' | 'completed'; canEdit: boolean; setError: (s: string) => void; refreshKey: number }) {
  const [classes, setClasses] = useState<LiveClass[] | null>(null);
  const [attendanceFor, setAttendanceFor] = useState<LiveClass | null>(null);
  const [recordingsFor, setRecordingsFor] = useState<LiveClass | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get('/api/live-classes', { params: { view } }).then((r) => setClasses(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load classes.')));
  }, [view, setError]);
  useEffect(() => { load(); }, [load, refreshKey]);

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {classes.map((c) => (
        <div key={c.id} className="border rounded-xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-sm">{c.schedule.course.name}</p>
              <p className="text-xs text-muted-foreground">{c.schedule.batch.code}</p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[c.status]}`}>{c.status}</span>
          </div>
          <p className="text-sm">{c.title}{c.topic ? <span className="text-muted-foreground"> — {c.topic}</span> : null}</p>
          <p className="text-xs text-muted-foreground">Trainer: {c.createdBy ? `${c.createdBy.firstName} ${c.createdBy.lastName}` : '—'}</p>
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
            {c.status === 'COMPLETED' && (
              <button onClick={() => setRecordingsFor(c)} className="px-3 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1">
                <Film className="w-3 h-3" /> Recording
              </button>
            )}
          </div>
        </div>
      ))}
      {attendanceFor && <AttendanceModal liveClass={attendanceFor} onClose={() => setAttendanceFor(null)} setError={setError} />}
      {recordingsFor && <RecordingsModal liveClass={recordingsFor} onClose={() => setRecordingsFor(null)} setError={setError} />}
    </div>
  );
}

// ── Recordings modal (staff + student, same component) ──────────────────────
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

// ── Recording playback — native controls (play/pause/seek/volume/fullscreen)
// plus explicit speed buttons, since browsers don't consistently expose fast
// playback speeds (2x/4x) in their built-in controls UI. ─────────────────────
const PLAYBACK_RATES = [1, 1.5, 2, 4];
function RecordingVideoPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [rate, setRate] = useState(1);

  const setPlaybackRate = (r: number) => {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  };

  return (
    <div className="space-y-2">
      <video ref={videoRef} src={url} controls autoPlay className="w-full rounded-lg bg-black max-h-[50vh]" />
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Speed:</span>
        {PLAYBACK_RATES.map((r) => (
          <button
            key={r}
            onClick={() => setPlaybackRate(r)}
            className={`px-2.5 py-1 text-xs rounded-md border font-medium ${rate === r ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-muted'}`}
          >
            {r}x
          </button>
        ))}
      </div>
    </div>
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
      <Field label="Batch / Course *">
        <select className={inputCls} value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
          <option value="">Select a batch & course</option>
          {schedules.map((s) => (
            <option key={s.id} value={s.id}>
              {s.batch.code} — {s.course.name}{s.startTime ? ` (${s.startTime}–${s.endTime})` : ''}
            </option>
          ))}
        </select>
        {schedules.length === 0 && <p className="text-xs text-muted-foreground mt-1">No batches assigned to you yet — a Live Classes admin needs to assign you as a trainer, or grant Admin-level access.</p>}
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
