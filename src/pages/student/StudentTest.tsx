import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Loader2, ClipboardList, Clock, AlertTriangle, CheckCircle2, XCircle, Lock, X, ListChecks } from 'lucide-react';

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

interface ReviewQuestion extends AttemptQuestion { correctIndex: number; selectedIndex: number | null; isCorrect: boolean; }

interface ActiveAttempt {
  attemptId: string;
  releaseId: string;
  testTitle: string;
  deadlineAt: string;
  questions: AttemptQuestion[];
  answers: Record<string, number>;
  violationCount: number;
}

const MAX_WARNINGS = 2; // 1st + 2nd violation = warning, 3rd ends the test

// Kill switch — camera proctoring turned off in the field on 2026-08-06:
// students were getting blocked from writing their tests because of it. Flip
// back to true once it's been retested properly. Tab-switch detection below
// is unaffected and keeps working either way.
const CAMERA_PROCTORING_ENABLED = false;

// ── Camera proctoring: face-api.js + its pretrained TinyFaceDetector weights
// are loaded from a CDN at runtime rather than bundled, so there's no build
// step or multi-MB binary model files to ship in this repo. This is a
// face-presence/count/orientation check, not literal eyeball/gaze tracking —
// a lightweight, honest approximation of "is someone here, is it one person,
// are they facing the screen."
const FACE_API_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/tiny_face_detector';
const FACE_CHECK_INTERVAL_MS = 5000;
const NO_FACE_STREAK_THRESHOLD = 3; // ~15s of no detected face before it counts as a violation
const LOOKING_AWAY_STREAK_THRESHOLD = 3; // ~15s of an off-center face before it counts
const LOOKING_AWAY_OFFSET_RATIO = 0.3; // face center offset from frame center, as a fraction of frame width

type ViolationType = 'TAB_SWITCH' | 'NO_FACE' | 'MULTIPLE_FACES' | 'LOOKING_AWAY';
type CameraStatus = 'idle' | 'loading' | 'active' | 'unavailable';

interface FaceApiBox { x: number; y: number; width: number; height: number; }
interface FaceApiDetection { box: FaceApiBox; }
interface FaceApiGlobal {
  nets: { tinyFaceDetector: { loadFromUri: (uri: string) => Promise<void> } };
  TinyFaceDetectorOptions: new () => unknown;
  detectAllFaces: (input: HTMLVideoElement, options: unknown) => Promise<FaceApiDetection[]>;
}

let faceApiLoadPromise: Promise<void> | null = null;
function loadFaceApi(): Promise<void> {
  const w = window as unknown as { faceapi?: FaceApiGlobal };
  if (w.faceapi) return Promise.resolve();
  if (faceApiLoadPromise) return faceApiLoadPromise;
  faceApiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = FACE_API_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load face-api.js'));
    document.head.appendChild(script);
  });
  return faceApiLoadPromise;
}

function captureSnapshot(video: HTMLVideoElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(null); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7);
  });
}

function violationLabel(type: ViolationType) {
  switch (type) {
    case 'NO_FACE': return 'Face not visible to the camera';
    case 'MULTIPLE_FACES': return 'More than one person in frame';
    case 'LOOKING_AWAY': return 'Looking away from the screen';
    default: return 'Tab switch / window change';
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'SUBMITTED': return 'Submitted';
    case 'AUTO_SUBMITTED_VIOLATION': return 'Auto-submitted (policy violation)';
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
  const [reviewAttemptId, setReviewAttemptId] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const submittedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceCheckIntervalRef = useRef<number | null>(null);
  const noFaceStreakRef = useRef(0);
  const awayStreakRef = useRef(0);
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
        violationCount: attempt.violationCount ?? 0,
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

  const finishAttempt = useCallback(async () => {
    if (!active || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await api.post(`/api/student-portal/online-tests/attempts/${active.attemptId}/submit`, {});
      const graded = res.data.data;
      setActive(null);
      load();
      toast({ title: 'Test submitted', description: `Score: ${graded.score} / ${graded.totalMarks}` });
    } catch {
      setActive(null);
      load();
    } finally {
      setSubmitting(false);
    }
  }, [active, load, toast]);

  // Violation policy (tab-switch OR camera-based): the server counts
  // violations of any type per attempt. The first two are just warnings
  // (test keeps going); the third ends it. Server-counted rather than
  // client-decided, so a student can't dodge the rule by editing anything
  // running in the browser. Camera violations carry a snapshot image as
  // evidence for later review by the Trainer/PM.
  const recordViolation = useCallback(async (type: ViolationType, snapshotBlob?: Blob | null) => {
    if (!active || submittedRef.current) return;
    try {
      const form = new FormData();
      form.append('type', type);
      if (snapshotBlob) form.append('snapshot', snapshotBlob, `${type.toLowerCase()}_${Date.now()}.jpg`);
      const res = await api.post(`/api/student-portal/online-tests/attempts/${active.attemptId}/violation`, form);
      const { action, violationCount } = res.data.data as { action: 'warning' | 'ended' | 'none'; violationCount: number };

      if (action === 'warning') {
        setActive((a) => (a ? { ...a, violationCount } : a));
        const isFinal = violationCount >= MAX_WARNINGS;
        toast({
          title: isFinal ? 'Final warning' : `Warning ${violationCount} of ${MAX_WARNINGS}`,
          description: isFinal
            ? `${violationLabel(type)}. This is your last warning — one more violation will end your test immediately.`
            : `${violationLabel(type)}. One more after this and your test will end.`,
          variant: 'error',
        });
        return;
      }

      // 'ended' (3rd violation) or 'none' (attempt already ended some other way, e.g. expired) — either way it's over.
      submittedRef.current = true;
      setActive(null);
      load();
      if (action === 'ended') {
        toast({ title: 'Test ended', description: `Your test was ended after ${MAX_WARNINGS + 1} policy violations.`, variant: 'error' });
      }
    } catch {
      // Transient failure recording the violation — don't punish the student for a network blip.
    }
  }, [active, load, toast]);

  // Interval callbacks below are set up once per attempt (see the camera
  // effect) and would otherwise close over a stale `recordViolation` from
  // the render that started them — recordViolation itself is recreated
  // every time `active` changes identity (e.g. on every answer pick). A ref
  // keeps the interval always calling the latest version.
  const recordViolationRef = useRef(recordViolation);
  useEffect(() => { recordViolationRef.current = recordViolation; }, [recordViolation]);

  const onTabViolation = useCallback(() => { recordViolation('TAB_SWITCH'); }, [recordViolation]);

  // Countdown timer.
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const ms = new Date(active.deadlineAt).getTime() - Date.now();
      setRemainingMs(Math.max(0, ms));
      if (ms <= 0) finishAttempt();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, finishAttempt]);

  // Tab-switch / minimize detection — see recordViolation for the warn/end policy.
  useEffect(() => {
    if (!active) return;
    const onBlur = () => onTabViolation();
    const onVisibility = () => { if (document.hidden) onTabViolation(); };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, onTabViolation]);

  // Camera proctoring: request the camera once per attempt, load face-api.js
  // + the TinyFaceDetector weights from a CDN, then poll every few seconds
  // for face presence/count/orientation. Fails open — if the camera or the
  // model can't be loaded (permission denied, no camera, CDN blocked), the
  // test still runs on tab-switch detection alone rather than blocking the
  // student. Keyed on attemptId (not the whole `active` object, which gets a
  // new identity on every answer pick) so this only runs once per attempt.
  useEffect(() => {
    if (!active || !CAMERA_PROCTORING_ENABLED) return;
    let cancelled = false;
    noFaceStreakRef.current = 0;
    awayStreakRef.current = 0;

    const setup = async () => {
      try {
        setCameraStatus('loading');
        await loadFaceApi();
        const faceapi = (window as unknown as { faceapi: FaceApiGlobal }).faceapi;
        await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraStatus('active');

        faceCheckIntervalRef.current = window.setInterval(async () => {
          const video = videoRef.current;
          if (!video || submittedRef.current) return;
          try {
            const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
            if (detections.length === 0) {
              awayStreakRef.current = 0;
              noFaceStreakRef.current += 1;
              if (noFaceStreakRef.current >= NO_FACE_STREAK_THRESHOLD) {
                noFaceStreakRef.current = 0;
                const blob = await captureSnapshot(video);
                recordViolationRef.current('NO_FACE', blob);
              }
            } else if (detections.length > 1) {
              noFaceStreakRef.current = 0;
              awayStreakRef.current = 0;
              const blob = await captureSnapshot(video);
              recordViolationRef.current('MULTIPLE_FACES', blob);
            } else {
              noFaceStreakRef.current = 0;
              const box = detections[0].box;
              const frameWidth = video.videoWidth || 320;
              const offset = Math.abs((box.x + box.width / 2) - frameWidth / 2) / frameWidth;
              if (offset > LOOKING_AWAY_OFFSET_RATIO) {
                awayStreakRef.current += 1;
                if (awayStreakRef.current >= LOOKING_AWAY_STREAK_THRESHOLD) {
                  awayStreakRef.current = 0;
                  const blob = await captureSnapshot(video);
                  recordViolationRef.current('LOOKING_AWAY', blob);
                }
              } else {
                awayStreakRef.current = 0;
              }
            }
          } catch {
            // Detection glitch on this tick — skip it, try again next interval.
          }
        }, FACE_CHECK_INTERVAL_MS);
      } catch {
        if (!cancelled) setCameraStatus('unavailable');
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (faceCheckIntervalRef.current !== null) { window.clearInterval(faceCheckIntervalRef.current); faceCheckIntervalRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
      setCameraStatus('idle');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.attemptId]);

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
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Do not switch tabs or minimize this window. You'll get {MAX_WARNINGS} warnings — the next violation after that ends your test immediately.
          {active.violationCount > 0 && (
            <span className="font-semibold shrink-0">({active.violationCount} / {MAX_WARNINGS} warnings used)</span>
          )}
        </div>

        {/* Small always-visible camera preview — transparency that proctoring is active, not hidden surveillance. Hidden while CAMERA_PROCTORING_ENABLED is off. */}
        {CAMERA_PROCTORING_ENABLED && (
          <div className="fixed bottom-4 right-4 z-20 rounded-lg overflow-hidden border-2 border-white shadow-lg bg-black w-28 h-20 sm:w-36 sm:h-24">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${cameraStatus === 'active' ? 'bg-green-400' : cameraStatus === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
            {cameraStatus === 'unavailable' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-[10px] text-center px-1">
                Camera unavailable — tab monitoring only
              </div>
            )}
          </div>
        )}

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
          onClick={() => finishAttempt()}
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
                      <>
                        <span className={`flex items-center gap-1.5 text-sm font-semibold ${attempt.status === 'SUBMITTED' ? 'text-green-700' : 'text-red-600'}`}>
                          {attempt.status === 'SUBMITTED' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                          {attempt.score ?? 0} / {attempt.totalMarks ?? 0} · {statusLabel(attempt.status)}
                        </span>
                        <button
                          onClick={() => setReviewAttemptId(attempt.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted"
                        >
                          <ListChecks className="w-3.5 h-3.5" /> View answers
                        </button>
                      </>
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

      {reviewAttemptId && (
        <TestReviewModal attemptId={reviewAttemptId} onClose={() => setReviewAttemptId(null)} />
      )}
    </div>
  );
}

function TestReviewModal({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    attempt: { score: number | null; totalMarks: number | null; startedAt: string; submittedAt: string | null };
    testTitle: string;
    questions: ReviewQuestion[];
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/student-portal/online-tests/attempts/${attemptId}/review`)
      .then((r) => setData(r.data.data))
      .catch((e) => setError(e?.response?.data?.message || 'Could not load your answers.'))
      .finally(() => setLoading(false));
  }, [attemptId]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">{data?.testTitle || 'Your answers'}</h3>
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
            {data!.questions.map((q, idx) => (
              <div key={q.id} className="rounded-xl border p-4">
                <p className="text-sm font-medium">
                  {idx + 1}. {q.prompt}{' '}
                  <span className="text-xs text-muted-foreground font-normal">({q.marks} mark{q.marks === 1 ? '' : 's'})</span>
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {q.options.map((opt, i) => {
                    const isCorrectOption = i === q.correctIndex;
                    const isMyPick = i === q.selectedIndex;
                    const cls = isCorrectOption
                      ? 'bg-green-50 border-green-300 text-green-800'
                      : isMyPick
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'border-transparent';
                    return (
                      <div key={i} className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg border ${cls}`}>
                        {isCorrectOption ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : isMyPick ? <XCircle className="w-3.5 h-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                        <span>{opt}</span>
                        {isMyPick && !isCorrectOption && <span className="text-xs ml-auto shrink-0">(your answer)</span>}
                        {isCorrectOption && <span className="text-xs ml-auto shrink-0">(correct answer)</span>}
                      </div>
                    );
                  })}
                  {q.selectedIndex === null && (
                    <p className="text-xs text-muted-foreground">You did not answer this question.</p>
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
