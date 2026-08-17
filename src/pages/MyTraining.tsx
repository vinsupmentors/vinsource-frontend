import { useEffect, useState } from 'react';
import api, { BASE_URL } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { Loader2, Users, CalendarCheck, ClipboardList, MessageSquareText, Save, FileText, Rocket, X, CheckCircle2, XCircle, ArrowLeft, ChevronRight, Lock, Star, NotebookPen, Pencil, Trash2, RotateCcw, RefreshCw, ListChecks } from 'lucide-react';

// Files uploaded by the backend (project submissions) come back as relative
// paths like "/uploads/...". A bare <a href> resolves those against the
// frontend's own origin, not the API, which is why the link re-opens the app
// instead of the file. Absolute URLs (e.g. a pasted link submission) are left untouched.
const fileUrl = (path: string) => (/^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`);

// Proctoring violation types recorded during an online test attempt — see
// OnlineTestViolationSnapshot on the backend. Face-presence/count/orientation
// checks (not literal gaze tracking), plus the original tab-switch check.
function violationTypeLabel(type: 'TAB_SWITCH' | 'NO_FACE' | 'MULTIPLE_FACES' | 'LOOKING_AWAY') {
  switch (type) {
    case 'NO_FACE': return 'Face not visible';
    case 'MULTIPLE_FACES': return 'Multiple people';
    case 'LOOKING_AWAY': return 'Looking away';
    default: return 'Tab switch';
  }
}

interface ScheduleAssignment {
  id: string;
  schedule: {
    id: string;
    code: string | null;
    timing: string;
    course: { id: string; name: string; modules: { id: string; title: string; order: number }[] };
    batch: { id: string; code: string; startDate: string; endDate: string; status: string };
    _count: { enrollments: number };
  };
}

type Tab = 'batches' | 'attendance' | 'marks' | 'feedback' | 'kra' | 'content';

export default function MyTraining() {
  const [tab, setTab] = useState<Tab>('batches');
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [attendanceScheduleId, setAttendanceScheduleId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/trainer-portal/schedules').then((r) => {
      const data = r.data.data || [];
      setAssignments(data);
      if (data.length) setSelectedScheduleId(data[0].schedule.id);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  if (!assignments.length) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">My Training</h1>
        <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground text-sm">
          You aren't currently assigned as a trainer on any sub-batch.
        </div>
      </div>
    );
  }

  const selected = assignments.find((a) => a.schedule.id === selectedScheduleId)?.schedule;

  const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'batches', label: 'My Batches', icon: Users },
    { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
    { key: 'marks', label: 'Marks', icon: ClipboardList },
    { key: 'feedback', label: 'Feedback', icon: MessageSquareText },
    { key: 'kra', label: 'Daily KRA', icon: NotebookPen },
    { key: 'content', label: 'Projects / Feedback / Tests', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">My Training</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage attendance, marks, and feedback for the sub-batches you train.</p>
      </div>

      <div className="flex items-center gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab !== 'batches' && tab !== 'attendance' && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground">Sub-batch:</label>
          <select
            value={selectedScheduleId || ''}
            onChange={(e) => setSelectedScheduleId(e.target.value)}
            className="px-3 py-2 rounded-lg border bg-background text-sm"
          >
            {assignments.map((a) => (
              <option key={a.schedule.id} value={a.schedule.id}>
                {a.schedule.code ?? a.schedule.batch.code} — {a.schedule.course.name} ({a.schedule.timing})
              </option>
            ))}
          </select>
        </div>
      )}

      {tab === 'batches' && <BatchesTab assignments={assignments} />}
      {tab === 'attendance' && (
        attendanceScheduleId ? (
          <AttendanceTab
            schedule={assignments.find((a) => a.schedule.id === attendanceScheduleId)!.schedule}
            onBack={() => setAttendanceScheduleId(null)}
          />
        ) : (
          <AttendanceBatchPicker assignments={assignments} onSelect={setAttendanceScheduleId} />
        )
      )}
      {tab === 'marks' && selected && <MarksTab schedule={selected} />}
      {tab === 'feedback' && selected && <FeedbackTab schedule={selected} />}
      {tab === 'kra' && selected && <KraTab schedule={selected} />}
      {tab === 'content' && selected && <ContentReleaseTab schedule={selected} />}
    </div>
  );
}

function BatchesTab({ assignments }: { assignments: ScheduleAssignment[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {assignments.map((a) => (
        <div key={a.id} className="bg-card rounded-xl border p-5">
          <p className="text-sm font-semibold">{a.schedule.code ?? a.schedule.batch.code}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{a.schedule.course.name} · {a.schedule.timing}</p>
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <span>{formatDate(a.schedule.batch.startDate)} – {formatDate(a.schedule.batch.endDate)}</span>
            <span className="px-2 py-0.5 rounded-full bg-muted font-medium">{a.schedule.batch.status}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {a.schedule._count.enrollments} students enrolled</p>
        </div>
      ))}
    </div>
  );
}

interface RosterStudent { id: string; studentCode: string; firstName: string; lastName: string; }

function AttendanceBatchPicker({ assignments, onSelect }: { assignments: ScheduleAssignment[]; onSelect: (scheduleId: string) => void }) {
  const active = assignments.filter((a) => a.schedule.batch.status === 'ONGOING');
  const others = assignments.filter((a) => a.schedule.batch.status !== 'ONGOING');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium mb-3">Active sub-batches</p>
        {active.length === 0 ? (
          <div className="bg-card rounded-xl border p-8 text-center text-sm text-muted-foreground">No ongoing sub-batches assigned to you right now.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a.schedule.id)}
                className="bg-card rounded-xl border p-5 text-left hover:border-blue-400 hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{a.schedule.code ?? a.schedule.batch.code}</p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.schedule.course.name} · {a.schedule.timing}</p>
                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <span>{formatDate(a.schedule.batch.startDate)} – {formatDate(a.schedule.batch.endDate)}</span>
                  <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">ONGOING</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {a.schedule._count.enrollments} students enrolled</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {others.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3 text-muted-foreground">Other sub-batches</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {others.map((a) => (
              <button
                key={a.id}
                onClick={() => onSelect(a.schedule.id)}
                className="bg-card rounded-xl border p-5 text-left opacity-70 hover:opacity-100 hover:border-blue-400 transition"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{a.schedule.code ?? a.schedule.batch.code}</p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.schedule.course.name} · {a.schedule.timing}</p>
                <span className="inline-block mt-3 px-2 py-0.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">{a.schedule.batch.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AttendanceTab({ schedule, onBack }: { schedule: ScheduleAssignment['schedule']; onBack: () => void }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState<{ student: RosterStudent; status: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    api.get(`/api/trainer-portal/schedules/${schedule.id}/attendance`, { params: { date } })
      .then((r) => setRoster(r.data.data || []))
      .finally(() => setLoading(false));
  }, [schedule.id, date]);

  const setStatus = (studentId: string, status: string) => {
    setRoster((rows) => rows.map((r) => (r.student.id === studentId ? { ...r, status } : r)));
  };

  const save = async () => {
    const markedCount = roster.filter((r) => r.status).length;
    setSaving(true);
    try {
      await api.post(`/api/trainer-portal/schedules/${schedule.id}/attendance`, {
        date,
        records: roster.filter((r) => r.status).map((r) => ({ studentId: r.student.id, status: r.status })),
      });
      toast({
        title: 'Attendance saved',
        description: `${markedCount} of ${roster.length} student${roster.length === 1 ? '' : 's'} marked for ${date}.`,
        variant: 'success',
      });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast({
        title: 'Could not save attendance',
        description: err.response?.data?.message || 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> {schedule.code ?? schedule.batch.code} — {schedule.course.name} · {schedule.timing}
        </button>
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-lg border bg-background text-sm" />
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save attendance
          </button>
        </div>
      </div>
      {!loading && roster.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-3 py-2">
          No active students are enrolled in this sub-batch yet.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Student</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {roster.map((r) => (
                <tr key={r.student.id}>
                  <td className="px-4 py-3">{r.student.firstName} {r.student.lastName} <span className="text-xs text-muted-foreground">({r.student.studentCode})</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {(['PRESENT', 'LATE', 'ABSENT'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatus(r.student.id, s)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium border transition ${
                            r.status === s
                              ? s === 'PRESENT' ? 'bg-green-600 text-white border-green-600' : s === 'LATE' ? 'bg-amber-500 text-white border-amber-500' : 'bg-red-600 text-white border-red-600'
                              : 'bg-background text-muted-foreground border-border hover:bg-muted'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
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

/**
 * Read-only results dashboard. Marks are never entered here — once a PM-authored
 * Online Test is activated for this schedule (see the "Projects / Feedback / Tests"
 * tab) and students complete it, scores show up automatically.
 */
function MarksTab({ schedule }: { schedule: ScheduleAssignment['schedule'] }) {
  const [content, setContent] = useState<ReleasableContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [roster, setRoster] = useState<TestRosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED'>('ALL');

  useEffect(() => {
    setLoading(true);
    api.get(`/api/trainer-portal/schedules/${schedule.id}/releasable-content`)
      .then((r) => {
        const data: ReleasableContent = r.data.data;
        setContent(data);
        const released = data.onlineTests.filter((t) => t.releases[0]);
        setSelectedReleaseId(released[0]?.releases[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, [schedule.id]);

  useEffect(() => {
    if (!selectedReleaseId) { setRoster([]); return; }
    setRosterLoading(true);
    api.get(`/api/trainer-portal/schedules/${schedule.id}/test-releases/${selectedReleaseId}/results`)
      .then((r) => setRoster(r.data.data?.roster || []))
      .finally(() => setRosterLoading(false));
  }, [schedule.id, selectedReleaseId]);

  const releasedTests = (content?.onlineTests || []).filter((t) => t.releases[0]);

  const filteredRoster = roster.filter((row) => {
    const matchesSearch = !search || `${row.student.firstName} ${row.student.lastName} ${row.student.studentCode}`.toLowerCase().includes(search.toLowerCase());
    const effectiveStatus = !row.attempt ? 'NOT_STARTED' : row.attempt.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'COMPLETED';
    const matchesStatus = statusFilter === 'ALL' || statusFilter === effectiveStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  if (releasedTests.length === 0) {
    return (
      <div className="bg-card rounded-xl border p-8 text-center text-sm text-muted-foreground">
        No online test has been released to this sub-batch yet. Marks will appear here automatically once a test is activated under "Projects / Feedback / Tests" and students complete it.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <select value={selectedReleaseId || ''} onChange={(e) => setSelectedReleaseId(e.target.value)} className="px-3 py-2 rounded-lg border bg-background text-sm min-w-[260px]">
          {releasedTests.map((t) => (
            <option key={t.releases[0].id} value={t.releases[0].id}>
              {t.module.title} — {t.title} {t.releases[0].status === 'CLOSED' ? '(closed)' : ''}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input
            placeholder="Search student…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 rounded-lg border bg-background text-sm"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="px-3 py-2 rounded-lg border bg-background text-sm">
            <option value="ALL">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="NOT_STARTED">Not started</option>
          </select>
        </div>
      </div>

      {rosterLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Student</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRoster.map((row) => (
                <tr key={row.student.id}>
                  <td className="px-4 py-3">{row.student.firstName} {row.student.lastName} <span className="text-xs text-muted-foreground">({row.student.studentCode})</span></td>
                  <td className="px-4 py-3">
                    {row.attempt ? (
                      <span className={`flex items-center gap-1 text-xs font-medium ${row.attempt.status === 'IN_PROGRESS' ? 'text-amber-600' : 'text-green-700'}`}>
                        {row.attempt.status === 'IN_PROGRESS' ? <Loader2 className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        {row.attempt.status.replace('_', ' ')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><XCircle className="w-3.5 h-3.5" /> Not started</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.attempt && row.attempt.score !== null ? `${row.attempt.score} / ${row.attempt.totalMarks}` : '—'}
                  </td>
                </tr>
              ))}
              {filteredRoster.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">No students match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type FeedbackStudentStatus = 'ENROLLED' | 'ONBOARDED' | 'ACTIVE' | 'INACTIVE' | 'COMPLETED' | 'IN_PLACEMENT' | 'PLACED' | 'BATCH_TRANSFER';
interface FeedbackStudent { id: string; studentCode: string; firstName: string; lastName: string; status?: FeedbackStudentStatus; }

type FeedbackSubTab = 'internal' | 'module';

function FeedbackTab({ schedule }: { schedule: ScheduleAssignment['schedule'] }) {
  const [subTab, setSubTab] = useState<FeedbackSubTab>('module');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b">
        <button
          onClick={() => setSubTab('module')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition ${subTab === 'module' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <MessageSquareText className="w-4 h-4" /> Module Feedback
        </button>
        <button
          onClick={() => setSubTab('internal')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition ${subTab === 'internal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Lock className="w-4 h-4" /> Internal Notes
        </button>
      </div>
      {subTab === 'module' ? <ModuleFeedbackPanel schedule={schedule} /> : <InternalFeedbackPanel schedule={schedule} />}
    </div>
  );
}

interface ModuleFeedbackEntry { id: string; studentId: string; moduleId: string; rating: number | null; comments: string; }

function ModuleFeedbackPanel({ schedule }: { schedule: ScheduleAssignment['schedule'] }) {
  const [students, setStudents] = useState<FeedbackStudent[]>([]);
  const [modules, setModules] = useState<{ id: string; title: string; order: number }[]>([]);
  const [feedback, setFeedback] = useState<ModuleFeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get(`/api/trainer-portal/schedules/${schedule.id}/module-feedback`)
      .then((r) => {
        setStudents(r.data.data?.students || []);
        setModules(r.data.data?.modules || []);
        setFeedback(r.data.data?.feedback || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [schedule.id]);

  useEffect(() => {
    const existing = feedback.find((f) => f.studentId === studentId && f.moduleId === moduleId);
    setRating(existing?.rating ?? null);
    setComments(existing?.comments ?? '');
  }, [studentId, moduleId, feedback]);

  const save = async () => {
    if (!studentId || !moduleId || !comments.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/trainer-portal/schedules/${schedule.id}/module-feedback`, { studentId, moduleId, rating, comments });
      load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
        Module feedback is visible to the student on their Rank Card.
      </p>

      <div className="bg-card rounded-xl border p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Student</label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="w-full px-2 py-1.5 rounded-md border bg-background text-sm">
              <option value="">Select student</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.studentCode})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Module</label>
            <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="w-full px-2 py-1.5 rounded-md border bg-background text-sm">
              <option value="">Select module</option>
              {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
        </div>

        {studentId && moduleId && (
          <>
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">Rating</label>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <button key={i} type="button" onClick={() => setRating(i + 1)} className="text-amber-500">
                    <Star className="w-5 h-5" fill={rating !== null && i < rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">Comments</label>
              <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" placeholder="Module-wise feedback for this student..." />
            </div>
            <button onClick={save} disabled={saving || !comments.trim()} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save feedback
            </button>
          </>
        )}
      </div>

      {feedback.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">Given so far</h3>
          {feedback.map((f) => {
            const s = students.find((x) => x.id === f.studentId);
            const m = modules.find((x) => x.id === f.moduleId);
            return (
              <div key={f.id} className="bg-card rounded-xl border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{s ? `${s.firstName} ${s.lastName}` : 'Student'} — {m?.title || 'Module'}</p>
                  {f.rating !== null && (
                    <span className="flex items-center gap-0.5 text-amber-500 shrink-0">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5" fill={i < f.rating! ? 'currentColor' : 'none'} />
                      ))}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{f.comments}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STUDENT_STATUS_LABEL: Record<FeedbackStudentStatus, string> = {
  ENROLLED: 'Enrolled', ONBOARDED: 'Onboarded', ACTIVE: 'Active', INACTIVE: 'Inactive',
  COMPLETED: 'Completed', IN_PLACEMENT: 'In Placement Pool', PLACED: 'Placed', BATCH_TRANSFER: 'Batch Transfer',
};

function InternalFeedbackPanel({ schedule }: { schedule: ScheduleAssignment['schedule'] }) {
  const [students, setStudents] = useState<FeedbackStudent[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, { performanceRating?: number; placementReadinessNote?: string; jrpToIopRecommended?: boolean; certificateEligible?: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/api/trainer-portal/schedules/${schedule.id}/students`),
      api.get('/api/trainer-portal/feedback'),
    ]).then(([enrollRes, fbRes]) => {
      const enrolled: FeedbackStudent[] = (enrollRes.data.data || []).map((e: { student: FeedbackStudent }) => e.student);
      setStudents(enrolled);
      const map: Record<string, { performanceRating?: number; placementReadinessNote?: string; jrpToIopRecommended?: boolean; certificateEligible?: boolean }> = {};
      for (const fb of fbRes.data.data || []) {
        if (fb.course.id === schedule.course.id) map[fb.student.id] = fb;
      }
      setFeedbackMap(map);
    }).finally(() => setLoading(false));
  }, [schedule.id, schedule.course.id]);

  const update = (studentId: string, field: string, value: unknown) => {
    setFeedbackMap((m) => ({ ...m, [studentId]: { ...m[studentId], [field]: value } }));
  };

  const save = async (studentId: string) => {
    setSavingId(studentId);
    try {
      const fb = feedbackMap[studentId] || {};
      await api.post('/api/trainer-portal/feedback', { studentId, courseId: schedule.course.id, ...fb });
      toast({ title: 'Feedback saved', variant: 'success' });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast({ title: 'Could not save feedback', description: err.response?.data?.message || 'Please try again.', variant: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  const pushToPlacement = async (studentId: string) => {
    if (!window.confirm('Transfer this student to the Placement Pool? This starts their placement SLA clock.')) return;
    setPushingId(studentId);
    try {
      const res = await api.post(`/api/trainer-portal/students/${studentId}/push-to-placement`, { courseId: schedule.course.id });
      setStudents((rows) => rows.map((r) => (r.id === studentId ? { ...r, status: res.data.data.status } : r)));
      toast({ title: 'Moved to Placement Pool', description: 'This will now show in Production and in the Placements menu.', variant: 'success' });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast({ title: 'Could not transfer to Placement Pool', description: err.response?.data?.message || 'Please try again.', variant: 'error' });
    } finally {
      setPushingId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        This feedback is internal only — students never see ratings, placement-readiness notes, or certificate-eligibility status.
      </p>
      {students.map((s) => {
        const fb = feedbackMap[s.id] || {};
        const alreadyInPool = s.status === 'IN_PLACEMENT' || s.status === 'PLACED';
        const locked = s.status === 'PLACED' || s.status === 'BATCH_TRANSFER';
        return (
          <div key={s.id} className="bg-card rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-semibold">{s.firstName} {s.lastName} <span className="text-xs text-muted-foreground font-normal">({s.studentCode})</span></p>
              {s.status && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${alreadyInPool ? 'bg-indigo-100 text-indigo-700' : 'bg-muted text-muted-foreground'}`}>
                  {STUDENT_STATUS_LABEL[s.status]}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Performance rating (1–5)</label>
                <input type="number" min={1} max={5} value={fb.performanceRating ?? ''} onChange={(e) => update(s.id, 'performanceRating', Number(e.target.value))} className="w-24 px-2 py-1.5 rounded-md border bg-background text-sm" />
              </div>
              <div className="flex items-center gap-4 pt-5">
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!fb.jrpToIopRecommended} onChange={(e) => update(s.id, 'jrpToIopRecommended', e.target.checked)} /> Recommend JRP→IOP</label>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!fb.certificateEligible} onChange={(e) => update(s.id, 'certificateEligible', e.target.checked)} /> Certificate eligible</label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">Placement-readiness note</label>
              <textarea rows={2} value={fb.placementReadinessNote ?? ''} onChange={(e) => update(s.id, 'placementReadinessNote', e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => save(s.id)} disabled={savingId === s.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
                {savingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save feedback
              </button>
              {!alreadyInPool && !locked && (
                <button
                  onClick={() => pushToPlacement(s.id)}
                  disabled={pushingId === s.id || !fb.certificateEligible}
                  title={fb.certificateEligible ? 'Send this student to the Placement Pool' : 'Save feedback with "Certificate eligible" checked first'}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pushingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Transfer to Placement Pool
                </button>
              )}
              {alreadyInPool && (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" /> Already in Placement Pool</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Daily KRA — topics covered, per sub-batch (track), per day ────────────

interface KraEntry {
  id: string;
  scheduleId: string;
  moduleId: string | null;
  trainerId: string | null;
  track: 'JRP' | 'IOP' | 'PAP' | null;
  date: string;
  topicsCovered: string;
  notes: string | null;
  module: { id: string; title: string; order: number } | null;
}

function KraTab({ schedule }: { schedule: ScheduleAssignment['schedule'] }) {
  const [entries, setEntries] = useState<KraEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [track, setTrack] = useState<'' | 'JRP' | 'IOP' | 'PAP'>('');
  const [moduleId, setModuleId] = useState('');
  const [topicsCovered, setTopicsCovered] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTopics, setEditTopics] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const errMsg = (e: unknown): string => {
    const ax = e as { response?: { data?: { message?: string } } };
    return ax?.response?.data?.message || 'Something went wrong';
  };

  const load = () => {
    setLoading(true);
    api.get(`/api/trainer-portal/schedules/${schedule.id}/kra`)
      .then((r) => setEntries(r.data.data || []))
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [schedule.id]);

  const resetForm = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setTrack('');
    setModuleId('');
    setTopicsCovered('');
    setNotes('');
  };

  const submit = async () => {
    if (!date || !topicsCovered.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/api/trainer-portal/schedules/${schedule.id}/kra`, {
        date,
        track: track || undefined,
        moduleId: moduleId || undefined,
        topicsCovered: topicsCovered.trim(),
        notes: notes.trim() || undefined,
      });
      resetForm();
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (entry: KraEntry) => {
    setEditingId(entry.id);
    setEditTopics(entry.topicsCovered);
    setEditNotes(entry.notes || '');
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      await api.put(`/api/trainer-portal/kra/${id}`, { topicsCovered: editTopics.trim(), notes: editNotes.trim() || undefined });
      setEditingId(null);
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this KRA entry?')) return;
    setBusyId(id);
    setError('');
    try {
      await api.delete(`/api/trainer-portal/kra/${id}`);
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
        Log what topics were covered for this sub-batch, per day. Leave "Track" blank if the topic applies to the whole schedule rather than one track.
      </p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-card rounded-xl border p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-2 py-1.5 rounded-md border bg-background text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Track (optional)</label>
            <select value={track} onChange={(e) => setTrack(e.target.value as typeof track)} className="w-full px-2 py-1.5 rounded-md border bg-background text-sm">
              <option value="">Whole schedule</option>
              <option value="JRP">JRP</option>
              <option value="IOP">IOP</option>
              <option value="PAP">PAP</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Module (optional)</label>
            <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="w-full px-2 py-1.5 rounded-md border bg-background text-sm">
              <option value="">No specific module</option>
              {schedule.course.modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Topics covered</label>
          <textarea rows={2} value={topicsCovered} onChange={(e) => setTopicsCovered(e.target.value)} placeholder="e.g. React hooks, useEffect cleanup, custom hooks" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Notes (optional)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        </div>
        <button onClick={submit} disabled={saving || !date || !topicsCovered.trim()} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Log entry
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : entries.length === 0 ? (
        <div className="bg-card rounded-xl border p-8 text-center text-sm text-muted-foreground">No KRA entries logged yet for this sub-batch.</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="bg-card rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="font-medium text-foreground">{formatDate(e.date)}</span>
                  {e.track && <span className="px-2 py-0.5 rounded-full bg-muted font-medium">{e.track}</span>}
                  {e.module && <span className="px-2 py-0.5 rounded-full bg-muted font-medium">{e.module.title}</span>}
                </div>
                {editingId !== e.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(e)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(e.id)} disabled={busyId === e.id} className="p-1.5 rounded-md hover:bg-red-50 text-red-600 disabled:opacity-60">
                      {busyId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>

              {editingId === e.id ? (
                <div className="mt-2 space-y-2">
                  <textarea rows={2} value={editTopics} onChange={(ev) => setEditTopics(ev.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
                  <textarea rows={2} value={editNotes} onChange={(ev) => setEditNotes(ev.target.value)} placeholder="Notes (optional)" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveEdit(e.id)} disabled={busyId === e.id || !editTopics.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
                      {busyId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm mt-2">{e.topicsCovered}</p>
                  {e.notes && <p className="text-xs text-muted-foreground mt-1">{e.notes}</p>}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Projects / Feedback Forms / Online Tests — release & conduct ──────────

function MiniModal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6 space-y-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface ReleaseInfo { id: string; status: 'ACTIVE' | 'CLOSED'; }
interface ReleasableModule { id: string; title: string; order: number; }
interface ReleasableProject { id: string; title: string; description: string | null; moduleId: string; module: ReleasableModule; releases: ReleaseInfo[]; }
interface ReleasableFeedbackForm { id: string; title: string; moduleId: string; module: ReleasableModule; questions?: unknown[]; releases: ReleaseInfo[]; }
interface ReleasableOnlineTest { id: string; title: string; moduleId: string; durationMinutes: number; module: ReleasableModule; releases: ReleaseInfo[]; _count: { questions: number }; }

interface ReleasableContent { projects: ReleasableProject[]; feedbackForms: ReleasableFeedbackForm[]; onlineTests: ReleasableOnlineTest[]; }

type ContentSubTab = 'projects' | 'feedback' | 'tests';

function ContentReleaseTab({ schedule }: { schedule: ScheduleAssignment['schedule'] }) {
  const [subTab, setSubTab] = useState<ContentSubTab>('projects');
  const [content, setContent] = useState<ReleasableContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [drillProject, setDrillProject] = useState<{ releaseId: string; title: string } | null>(null);
  const [drillTest, setDrillTest] = useState<{ releaseId: string; title: string } | null>(null);
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});

  const load = () => {
    setLoading(true);
    api.get(`/api/trainer-portal/schedules/${schedule.id}/releasable-content`)
      .then((r) => setContent(r.data.data))
      .catch(() => setError('Failed to load content'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [schedule.id]);

  const SUB_TABS: { key: ContentSubTab; label: string; icon: typeof FileText }[] = [
    { key: 'projects', label: 'Projects', icon: FileText },
    { key: 'feedback', label: 'Feedback Forms', icon: MessageSquareText },
    { key: 'tests', label: 'Online Tests', icon: ClipboardList },
  ];

  const errMsg = (e: unknown): string => {
    const ax = e as { response?: { data?: { message?: string } } };
    return ax?.response?.data?.message || 'Something went wrong';
  };

  const releaseProject = async (projectId: string) => {
    setBusyId(projectId);
    setError('');
    try {
      const deadline = deadlines[projectId] ? new Date(deadlines[projectId]).toISOString() : undefined;
      await api.post(`/api/trainer-portal/schedules/${schedule.id}/release-project`, { projectId, deadline });
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const releaseFeedbackForm = async (formId: string) => {
    setBusyId(formId);
    setError('');
    try {
      const deadline = deadlines[formId] ? new Date(deadlines[formId]).toISOString() : undefined;
      await api.post(`/api/trainer-portal/schedules/${schedule.id}/release-feedback-form`, { formId, deadline });
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const activateTest = async (testId: string) => {
    setBusyId(testId);
    setError('');
    try {
      const deadline = deadlines[testId] ? new Date(deadlines[testId]).toISOString() : undefined;
      await api.post(`/api/trainer-portal/schedules/${schedule.id}/activate-test`, { testId, deadline });
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const DeadlineInput = ({ id }: { id: string }) => (
    <input
      type="datetime-local"
      value={deadlines[id] || ''}
      onChange={(e) => setDeadlines((d) => ({ ...d, [id]: e.target.value }))}
      title="Optional deadline — students, the Production Manager and trainer get emailed; students get 3/2/1-day reminders if not yet submitted"
      className="px-2 py-1.5 rounded-lg border text-xs"
    />
  );

  const closeRelease = async (kind: 'project' | 'feedback' | 'test', releaseId: string) => {
    if (!window.confirm('Close this release? Students will no longer be able to access it.')) return;
    setBusyId(releaseId);
    setError('');
    try {
      await api.post(`/api/trainer-portal/schedules/${schedule.id}/close-release`, { kind, releaseId });
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (!content) return <div className="text-sm text-muted-foreground">Failed to load content.</div>;

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="flex items-center gap-1 border-b">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition ${subTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {subTab === 'projects' && (
        content.projects.length === 0 ? (
          <div className="bg-card rounded-xl border p-8 text-center text-sm text-muted-foreground">No projects authored for this course yet.</div>
        ) : (
          <div className="space-y-2">
            {content.projects.map((p) => {
              const release = p.releases[0];
              const active = release?.status === 'ACTIVE';
              return (
                <div key={p.id} className="bg-card rounded-xl border p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">Module: {p.module.title}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {release ? (
                      <>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>{release.status}</span>
                        <button onClick={() => setDrillProject({ releaseId: release.id, title: p.title })} className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted">Submissions</button>
                        {active && (
                          <button onClick={() => closeRelease('project', release.id)} disabled={busyId === release.id} className="px-3 py-1.5 rounded-lg border text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">Close</button>
                        )}
                      </>
                    ) : (
                      <>
                        <DeadlineInput id={p.id} />
                        <button onClick={() => releaseProject(p.id)} disabled={busyId === p.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
                          {busyId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Release
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {subTab === 'feedback' && (
        content.feedbackForms.length === 0 ? (
          <div className="bg-card rounded-xl border p-8 text-center text-sm text-muted-foreground">No feedback forms authored for this course yet.</div>
        ) : (
          <div className="space-y-2">
            {content.feedbackForms.map((f) => {
              const release = f.releases[0];
              const active = release?.status === 'ACTIVE';
              return (
                <div key={f.id} className="bg-card rounded-xl border p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="text-xs text-muted-foreground">Module: {f.module.title}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {release ? (
                      <>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>{release.status}</span>
                        <span title="Only the Production Manager can view submitted feedback responses" className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium text-muted-foreground cursor-not-allowed">
                          <Lock className="w-3.5 h-3.5" /> Responses (PM only)
                        </span>
                        {active && (
                          <button onClick={() => closeRelease('feedback', release.id)} disabled={busyId === release.id} className="px-3 py-1.5 rounded-lg border text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">Close</button>
                        )}
                      </>
                    ) : (
                      <>
                        <DeadlineInput id={f.id} />
                        <button onClick={() => releaseFeedbackForm(f.id)} disabled={busyId === f.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
                          {busyId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Release
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {subTab === 'tests' && (
        content.onlineTests.length === 0 ? (
          <div className="bg-card rounded-xl border p-8 text-center text-sm text-muted-foreground">No online tests authored for this course yet.</div>
        ) : (
          <div className="space-y-2">
            {content.onlineTests.map((t) => {
              const release = t.releases[0];
              const active = release?.status === 'ACTIVE';
              const noQuestions = t._count.questions === 0;
              return (
                <div key={t.id} className="bg-card rounded-xl border p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{t.title}</p>
                    <p className="text-xs text-muted-foreground">Module: {t.module.title} · {t.durationMinutes} min · {t._count.questions} question{t._count.questions === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {release ? (
                      <>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{release.status}</span>
                        <button onClick={() => setDrillTest({ releaseId: release.id, title: t.title })} className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted">Results</button>
                        {active ? (
                          <button onClick={() => closeRelease('test', release.id)} disabled={busyId === release.id} className="px-3 py-1.5 rounded-lg border text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">Close</button>
                        ) : (
                          <>
                            <DeadlineInput id={t.id} />
                            <button
                              onClick={() => activateTest(t.id)}
                              disabled={busyId === t.id}
                              title="Reopen so students who missed it can take the test"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-60"
                            >
                              {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Reopen
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {!noQuestions && <DeadlineInput id={t.id} />}
                        <button
                          onClick={() => activateTest(t.id)}
                          disabled={busyId === t.id || noQuestions}
                          title={noQuestions ? 'Add questions to this test first' : undefined}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60"
                        >
                          {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Activate
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {drillProject && (
        <ProjectSubmissionsModal
          schedule={schedule}
          releaseId={drillProject.releaseId}
          title={drillProject.title}
          onClose={() => setDrillProject(null)}
        />
      )}
      {drillTest && (
        <TestResultsModal
          schedule={schedule}
          releaseId={drillTest.releaseId}
          title={drillTest.title}
          onClose={() => setDrillTest(null)}
        />
      )}
    </div>
  );
}

interface SubmissionRosterRow {
  student: RosterStudent;
  submission: {
    id: string;
    fileUrl: string | null;
    linkUrl: string | null;
    note: string | null;
    status: 'SUBMITTED' | 'REVIEWED';
    submittedAt: string;
    reviewNote: string | null;
    grade: number | null;
    maxGrade: number | null;
  } | null;
}

function ProjectSubmissionsModal({ schedule, releaseId, title, onClose }: { schedule: ScheduleAssignment['schedule']; releaseId: string; title: string; onClose: () => void }) {
  const [roster, setRoster] = useState<SubmissionRosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [maxGradeDrafts, setMaxGradeDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get(`/api/trainer-portal/schedules/${schedule.id}/project-releases/${releaseId}/submissions`)
      .then((r) => setRoster(r.data.data?.roster || []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [schedule.id, releaseId]);

  const review = async (submissionId: string) => {
    setSavingId(submissionId);
    try {
      await api.post(`/api/trainer-portal/schedules/${schedule.id}/project-submissions/${submissionId}/review`, {
        reviewNote: noteDrafts[submissionId] || undefined,
        grade: gradeDrafts[submissionId] !== undefined && gradeDrafts[submissionId] !== '' ? Number(gradeDrafts[submissionId]) : undefined,
        maxGrade: maxGradeDrafts[submissionId] !== undefined && maxGradeDrafts[submissionId] !== '' ? Number(maxGradeDrafts[submissionId]) : undefined,
      });
      load();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <MiniModal title={`Submissions — ${title}`} onClose={onClose} wide>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-3">
          {roster.map((row) => (
            <div key={row.student.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{row.student.firstName} {row.student.lastName} <span className="text-xs text-muted-foreground font-normal">({row.student.studentCode})</span></p>
                {row.submission ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.submission.status === 'REVIEWED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{row.submission.status}</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">Not submitted</span>
                )}
              </div>
              {row.submission && (
                <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  <p>Submitted {formatDate(row.submission.submittedAt)}</p>
                  {row.submission.fileUrl && <p><a href={fileUrl(row.submission.fileUrl)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View submitted file</a></p>}
                  {row.submission.linkUrl && <p><a href={row.submission.linkUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{row.submission.linkUrl}</a></p>}
                  {row.submission.note && <p>Note: {row.submission.note}</p>}
                  {row.submission.grade !== null && (
                    <p className="font-medium text-green-700">Current grade: {row.submission.grade} / {row.submission.maxGrade ?? 100}</p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      placeholder="Review note (optional)"
                      defaultValue={row.submission.reviewNote || ''}
                      onChange={(e) => setNoteDrafts((m) => ({ ...m, [row.submission!.id]: e.target.value }))}
                      className="flex-1 px-2 py-1.5 rounded-md border bg-background text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Grade"
                      defaultValue={row.submission.grade ?? ''}
                      onChange={(e) => setGradeDrafts((m) => ({ ...m, [row.submission!.id]: e.target.value }))}
                      className="w-20 px-2 py-1.5 rounded-md border bg-background text-xs"
                    />
                    <span className="text-muted-foreground">/</span>
                    <input
                      type="number"
                      placeholder="Max"
                      defaultValue={row.submission.maxGrade ?? 100}
                      onChange={(e) => setMaxGradeDrafts((m) => ({ ...m, [row.submission!.id]: e.target.value }))}
                      className="w-16 px-2 py-1.5 rounded-md border bg-background text-xs"
                    />
                    <button
                      onClick={() => review(row.submission!.id)}
                      disabled={savingId === row.submission.id}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                    >
                      {row.submission.status === 'REVIEWED' ? 'Update review' : 'Mark reviewed'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </MiniModal>
  );
}

interface TestRosterRow {
  student: RosterStudent;
  attempt: {
    id: string;
    status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED';
    score: number | null;
    totalMarks: number | null;
    startedAt: string;
    submittedAt: string | null;
    violationCount: number;
  } | null;
}

function TestResultsModal({ schedule, releaseId, title, onClose }: { schedule: ScheduleAssignment['schedule']; releaseId: string; title: string; onClose: () => void }) {
  const [roster, setRoster] = useState<TestRosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reviewStudent, setReviewStudent] = useState<{ id: string; label: string } | null>(null);

  const errMsg = (e: unknown): string => {
    const ax = e as { response?: { data?: { message?: string } } };
    return ax?.response?.data?.message || 'Something went wrong';
  };

  const load = () => {
    setLoading(true);
    return api.get(`/api/trainer-portal/schedules/${schedule.id}/test-releases/${releaseId}/results`)
      .then((r) => setRoster(r.data.data?.roster || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule.id, releaseId]);

  const reassign = async (studentId: string | null, label: string) => {
    const confirmMsg = studentId
      ? `Reassign this test to ${label}? Their previous attempt (if finished) will be cleared and they can take it again.`
      : `Reassign this test to the whole class? Every finished attempt will be cleared and every student can take it again.`;
    if (!window.confirm(confirmMsg)) return;
    const key = studentId || '__all__';
    setBusyKey(key);
    setError('');
    try {
      await api.post(`/api/trainer-portal/schedules/${schedule.id}/test-releases/${releaseId}/reassign`, studentId ? { studentId } : {});
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <MiniModal title={`Results — ${title}`} onClose={onClose} wide>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              onClick={() => reassign(null, 'the whole class')}
              disabled={busyKey !== null}
              title="Clear every finished attempt so the whole class can retake this test"
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            >
              {busyKey === '__all__' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Reassign all
            </button>
          </div>
          <div className="bg-card rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Student</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Score</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {roster.map((row) => {
                  const studentLabel = `${row.student.firstName} ${row.student.lastName}`;
                  const canReassign = row.attempt && row.attempt.status !== 'IN_PROGRESS';
                  return (
                    <tr key={row.student.id}>
                      <td className="px-4 py-3">{studentLabel} <span className="text-xs text-muted-foreground">({row.student.studentCode})</span></td>
                      <td className="px-4 py-3">
                        {row.attempt ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`flex items-center gap-1 text-xs font-medium ${row.attempt.status === 'IN_PROGRESS' ? 'text-amber-600' : 'text-green-700'}`}>
                              {row.attempt.status === 'IN_PROGRESS' ? <Loader2 className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              {row.attempt.status.replace('_', ' ')}
                            </span>
                            {row.attempt.violationCount > 0 && (
                              <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                                {row.attempt.violationCount} violation{row.attempt.violationCount === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><XCircle className="w-3.5 h-3.5" /> Not started</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.attempt && row.attempt.score !== null ? `${row.attempt.score} / ${row.attempt.totalMarks}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canReassign && (
                            <button
                              onClick={() => setReviewStudent({ id: row.student.id, label: studentLabel })}
                              title="See what this student picked for each question, vs. the correct answer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium hover:bg-muted"
                            >
                              <ListChecks className="w-3.5 h-3.5" /> View answers
                            </button>
                          )}
                          {canReassign ? (
                            <button
                              onClick={() => reassign(row.student.id, studentLabel)}
                              disabled={busyKey !== null}
                              title="Clear this student's attempt so they can retake the test"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium hover:bg-muted disabled:opacity-60"
                            >
                              {busyKey === row.student.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Reassign
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reviewStudent && (
        <StudentAnswerReviewModal
          schedule={schedule}
          releaseId={releaseId}
          studentId={reviewStudent.id}
          studentLabel={reviewStudent.label}
          onClose={() => setReviewStudent(null)}
        />
      )}
    </MiniModal>
  );
}

function StudentAnswerReviewModal({
  schedule, releaseId, studentId, studentLabel, onClose,
}: {
  schedule: ScheduleAssignment['schedule'];
  releaseId: string;
  studentId: string;
  studentLabel: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    attempt: { score: number | null; totalMarks: number | null; startedAt: string; submittedAt: string | null; violationCount: number };
    testTitle: string;
    questions: { id: string; order: number; prompt: string; options: string[]; marks: number; correctIndex: number; selectedIndex: number | null; isCorrect: boolean }[];
    violations: { id: string; type: 'TAB_SWITCH' | 'NO_FACE' | 'MULTIPLE_FACES' | 'LOOKING_AWAY'; snapshotUrl: string | null; createdAt: string }[];
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get(`/api/trainer-portal/schedules/${schedule.id}/test-releases/${releaseId}/students/${studentId}/review`)
      .then((r) => setData(r.data.data))
      .catch((e) => setError(e?.response?.data?.message || 'Could not load this student\'s answers.'))
      .finally(() => setLoading(false));
  }, [schedule.id, releaseId, studentId]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">{studentLabel}{data ? ` — ${data.testTitle}` : ''}</h3>
            {data && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Score: {data.attempt.score ?? 0} / {data.attempt.totalMarks ?? 0}
                {data.attempt.submittedAt ? ` · Submitted ${formatDateTime(data.attempt.submittedAt)}` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <div className="space-y-4">
            {data!.violations.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                  Proctoring: {data!.attempt.violationCount} violation{data!.attempt.violationCount === 1 ? '' : 's'} recorded
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {data!.violations.map((v) => (
                    <div key={v.id} className="w-32 rounded-lg border bg-white overflow-hidden">
                      {v.snapshotUrl ? (
                        <a href={fileUrl(v.snapshotUrl)} target="_blank" rel="noopener noreferrer">
                          <img src={fileUrl(v.snapshotUrl)} alt={violationTypeLabel(v.type)} className="w-full h-24 object-cover" />
                        </a>
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center bg-muted text-muted-foreground text-[10px] text-center px-1">No snapshot</div>
                      )}
                      <div className="p-1.5">
                        <p className="text-[10px] font-medium leading-tight">{violationTypeLabel(v.type)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatDateTime(v.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data!.questions.map((q, idx) => (
              <div key={q.id} className="rounded-xl border p-4">
                <p className="text-sm font-medium">
                  {idx + 1}. {q.prompt}{' '}
                  <span className="text-xs text-muted-foreground font-normal">({q.marks} mark{q.marks === 1 ? '' : 's'})</span>
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {q.options.map((opt, i) => {
                    const isCorrectOption = i === q.correctIndex;
                    const isTheirPick = i === q.selectedIndex;
                    const cls = isCorrectOption
                      ? 'bg-green-50 border-green-300 text-green-800'
                      : isTheirPick
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'border-transparent';
                    return (
                      <div key={i} className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg border ${cls}`}>
                        {isCorrectOption ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : isTheirPick ? <XCircle className="w-3.5 h-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                        <span>{opt}</span>
                        {isTheirPick && !isCorrectOption && <span className="text-xs ml-auto shrink-0">(their answer)</span>}
                        {isCorrectOption && <span className="text-xs ml-auto shrink-0">(correct answer)</span>}
                      </div>
                    );
                  })}
                  {q.selectedIndex === null && (
                    <p className="text-xs text-muted-foreground">This student did not answer this question.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
