import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/utils';
import { Loader2, ClipboardList, Clock, AlertTriangle, CheckCircle2, XCircle, Lock } from 'lucide-react';

// ── Offline / trainer-graded module tests (ModuleTest + ModuleMark) ─────────
interface MarkRow {
  id: string;
  marksObtained: number | null;
  remarks?: string | null;
  graded: boolean;
  test: {
    title: string;
    testDate: string;
    maxMarks: number;
    module: { title: string };
    schedule: { course: { name: string } };
  };
}

// ── Online (self-administered, auto-graded) tests ───────────────────────────
interface TestListItem {
  releaseId: string;
  status: 'ACTIVE' | 'CLOSED';
  activatedAt: string;
  test: { id: string; title: string; durationMinutes: number; module: { id: string; title: string; order: number }; questionCount: number };
  myAttempt: {
    id: string;
    status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED_VIOLATION' | 'EXPIRED';
    startedAt: string;
    deadlineAt: string;
    score: number | null;
    totalMarks: number | null;
  } | null;
}

interface AttemptQuestion { id: string; order: number; prompt: string; options: string[]; marks: number; }

interface ActiveAttempt {
  attemptId: string;
  releaseId: string;
  testTitle: string;
  deadlineAt: string;
  questions: AttemptQuestion[];
  answers: Record<string, number>;
}

function statusLabel(status: string) {
  switch (status) {
    case 'SUBMITTED': return 'Submitted';
    case 'AUTO_SUBMITTED_VIOLATION': return 'Auto-submitted (tab switch)';
    case 'EXPIRED': return 'Time expired';
    default: return status;
  }
}

export default function StudentTest() {
  const [marks, setMarks] = useState<MarkRow[]>([]);
  const [releases, setReleases] = useState<TestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveAttempt | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/student-portal/marks').then((r) => setMarks(r.data.data || [])),
      api.get('/api/student-portal/online-tests').then((r) => setReleases(r.data.data || [])),
    ]).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const start = async (release: TestListItem) => {
    setStarting(release.releaseId);
    try {
      await api.post(`/api/student-portal/online-tests/${release.releaseId}/start`, {});
      // Fetch full state (handles both fresh start and resume) including any saved answers.
      const listRes = await api.get('/api/student-portal/online-tests');
      const fresh: TestListItem[] = listRes.data.data || [];
      setReleases(fresh);
      const updated = fresh.find((r) => r.releaseId === release.releaseId);
      if (!updated?.myAttempt) throw new Error('Could not start attempt');
      const attemptRes = await api.get(`/api/student-portal/online-tests/attempts/${updated.myAttempt.id}`);
      const { attempt, questions, answers } = attemptRes.data.data;
      if (attempt.status !== 'IN_PROGRESS') {
        // Expired the instant we tried to resume.
        load();
        toast({ title: 'Attempt closed', description: 'This attempt is no longer in progress.', variant: 'error' });
        return;
      }
      submittedRef.current = false;
      const answersMap: Record<string, number> = {};
      for (const a of answers || []) {
        if (a.selectedIndex !== null && a.selectedIndex !== undefined) answersMap[a.questionId] = a.selectedIndex;
      }
      setActive({
        attemptId: attempt.id,
        releaseId: release.releaseId,
        testTitle: release.test.title,
        deadlineAt: attempt.deadlineAt,
        questions: questions.sort((a: AttemptQuestion, b: AttemptQuestion) => a.order - b.order),
        answers: answersMap,
      });
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      toast({ title: 'Could not start test', description: e2.response?.data?.message || 'Please try again.', variant: 'error' });
    } finally {
      setStarting(null);
    }
  };

  const selectAnswer = (questionId: string, selectedIndex: number) => {
    if (!active) return;
    setActive((a) => (a ? { ...a, answers: { ...a.answers, [questionId]: selectedIndex } } : a));
    api.post(`/api/student-portal/online-tests/attempts/${active.attemptId}/answer`, { questionId, selectedIndex }).catch(() => {});
  };

  const finishAttempt = useCallback(async (violation: boolean) => {
    if (!active || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await api.post(`/api/student-portal/online-tests/attempts/${active.attemptId}/submit`, { violation });
      const graded = res.data.data;
      setActive(null);
      load();
      if (violation) {
        toast({ title: 'Test auto-submitted', description: 'Switching tabs during a test ends your attempt immediately.', variant: 'error' });
      } else {
        toast({ title: 'Test submitted', description: `Score: ${graded.score} / ${graded.totalMarks}` });
      }
    } catch {
      setActive(null);
      load();
    } finally {
      setSubmitting(false);
    }
  }, [active, load, toast]);

  // Countdown timer.
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const ms = new Date(active.deadlineAt).getTime() - Date.now();
      setRemainingMs(Math.max(0, ms));
      if (ms <= 0) finishAttempt(false);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, finishAttempt]);

  // Strictest tab-switch policy: any blur or visibility loss during an active attempt auto-submits immediately.
  useEffect(() => {
    if (!active) return;
    const onBlur = () => finishAttempt(true);
    const onVisibility = () => { if (document.hidden) finishAttempt(true); };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, finishAttempt]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  // ── Full-screen attempt mode ───────────────────────────────────────────
  if (active) {
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    const answeredCount = Object.keys(active.answers).length;
    return (
      <div className="space-y-4">
        <div className="sticky top-0 z-10 bg-card border rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-semibold text-sm">{active.testTitle}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{answeredCount} / {active.questions.length} answered</p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-sm font-semibold ${remainingMs < 60000 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'}`}>
            <Clock className="w-4 h-4" /> {mins}:{secs.toString().padStart(2, '0')}
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Do not switch tabs or minimize this window — doing so will immediately auto-submit your test.
        </div>

        <div className="space-y-4">
          {active.questions.map((q, idx) => (
            <div key={q.id} className="bg-card rounded-xl border p-4">
              <p className="text-sm font-medium">{idx + 1}. {q.prompt} <span className="text-xs text-muted-foreground font-normal">({q.marks} mark{q.marks === 1 ? '' : 's'})</span></p>
              <div className="mt-2 flex flex-col gap-1.5">
                {q.options.map((opt, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer">
                    <input type="radio" name={q.id} checked={active.answers[q.id] === i} onChange={() => selectAnswer(q.id, i)} />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => finishAttempt(false)}
          disabled={submitting}
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? 'Submitting...' : 'Submit test'}
        </button>
      </div>
    );
  }

  const noTests = marks.length === 0 && releases.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Test</h1>
        <p className="text-sm text-muted-foreground mt-1">All tests for your courses — take an online test when it&apos;s open, or check marks for trainer-graded tests once released. Anything not yet available shows as locked.</p>
      </div>

      {noTests ? (
        <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground text-sm">No tests yet.</div>
      ) : (
        <div className="space-y-3">
          {/* Online (self-administered) tests — take / resume / view score */}
          {releases.map((r) => {
            const closed = r.status === 'CLOSED';
            const attempt = r.myAttempt;
            return (
              <div key={`online-${r.releaseId}`} className="bg-card rounded-xl border p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">Module: {r.test.module.title}</p>
                  <h2 className="font-semibold text-sm mt-0.5 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> {r.test.title}</h2>
                  <p className="text-xs text-muted-foreground mt-1">{r.test.durationMinutes} minutes · {r.test.questionCount} questions</p>
                </div>
                <div className="flex items-center gap-2">
                  {attempt ? (
                    attempt.status === 'IN_PROGRESS' ? (
                      <button onClick={() => start(r)} disabled={starting === r.releaseId} className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60">
                        {starting === r.releaseId ? 'Resuming...' : 'Resume attempt'}
                      </button>
                    ) : (
                      <span className={`flex items-center gap-1.5 text-sm font-semibold ${attempt.status === 'SUBMITTED' ? 'text-green-700' : 'text-red-600'}`}>
                        {attempt.status === 'SUBMITTED' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {attempt.score ?? 0} / {attempt.totalMarks ?? 0} · {statusLabel(attempt.status)}
                      </span>
                    )
                  ) : closed ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium flex items-center gap-1"><Lock className="w-3 h-3" /> Locked</span>
                  ) : (
                    <button onClick={() => start(r)} disabled={starting === r.releaseId} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                      {starting === r.releaseId ? 'Starting...' : 'Start test'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Offline / trainer-graded module tests — locked until marks are entered */}
          {marks.map((r) => {
            const pct = r.graded && r.marksObtained !== null ? Math.round((r.marksObtained / r.test.maxMarks) * 100) : 0;
            return (
              <div key={`mark-${r.id}`} className="bg-card rounded-xl border p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">Module: {r.test.module.title} · {r.test.schedule.course.name}</p>
                  <h2 className="font-semibold text-sm mt-0.5 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> {r.test.title}</h2>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(r.test.testDate)}{r.remarks ? ` · ${r.remarks}` : ''}</p>
                </div>
                {r.graded ? (
                  <span className={`font-medium text-sm ${pct >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                    {r.marksObtained} / {r.test.maxMarks}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium flex items-center gap-1"><Lock className="w-3 h-3" /> Locked</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
