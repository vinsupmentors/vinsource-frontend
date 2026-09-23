import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import {
  LiveClass, LiveClassDashboard, STATUS_BADGE, ATTENDANCE_BADGE, LiveClassAttendanceResponse,
  LiveClassRecordingRecord, LiveClassPlaybackUrl, RECORDING_BADGE, formatDuration,
  formatTimeRange, formatClassDate, errMsg,
} from '@/lib/liveClasses';
import { Radio, Clock, CalendarClock, CheckCircle2, Loader2, X, Film, PlayCircle } from 'lucide-react';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

type Tab = 'today' | 'upcoming' | 'completed';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: "Today" },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
];

export default function StudentLiveClasses() {
  const [tab, setTab] = useState<Tab>('today');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Live Classes</h1>
        <p className="text-muted-foreground text-sm">Join your scheduled live sessions and catch up on class history.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center justify-between">
          {error}<button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      <LiveNowBanner setError={setError} onJoin={(id) => navigate(`/live-classes/${id}/room`)} />

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ClassList view={tab} setError={setError} />
    </div>
  );
}

function LiveNowBanner({ setError, onJoin }: { setError: (s: string) => void; onJoin: (id: string) => void }) {
  const [data, setData] = useState<LiveClassDashboard | null>(null);

  const load = useCallback(() => {
    api.get('/api/live-classes/dashboard').then((r) => setData(r.data.data)).catch((err) => setError(errMsg(err, 'Could not check for live classes.')));
  }, [setError]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  if (!data || data.live.length === 0) return null;

  return (
    <div className="space-y-3">
      {data.live.map((c) => (
        <div key={c.id} className="border-2 border-red-200 bg-red-50/50 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 mb-1"><Radio className="w-3 h-3 animate-pulse" /> LIVE NOW</span>
            <p className="font-semibold text-sm">{c.schedule.course.name} — {c.title}</p>
            <p className="text-xs text-muted-foreground">{formatTimeRange(c.startTime, c.endTime)} · Trainer: {c.createdBy ? `${c.createdBy.firstName} ${c.createdBy.lastName}` : '—'}</p>
          </div>
          <button onClick={() => onJoin(c.id)} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium">Join Class</button>
        </div>
      ))}
    </div>
  );
}

function ClassList({ view, setError }: { view: Tab; setError: (s: string) => void }) {
  const [classes, setClasses] = useState<LiveClass[] | null>(null);
  const [recordingsFor, setRecordingsFor] = useState<LiveClass | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get('/api/live-classes', { params: { view } }).then((r) => setClasses(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load classes.')));
  }, [view, setError]);
  useEffect(() => { load(); }, [load]);

  if (classes === null) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>;
  if (classes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8 border rounded-xl">
        {view === 'today' && 'No classes today.'}
        {view === 'upcoming' && 'No upcoming classes scheduled yet.'}
        {view === 'completed' && "You haven't attended any classes yet."}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {classes.map((c) => (
        <div key={c.id} className="border rounded-xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm">{c.schedule.course.name}</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[c.status]}`}>{c.status}</span>
          </div>
          <p className="text-sm">{c.title}{c.topic ? <span className="text-muted-foreground"> — {c.topic}</span> : null}</p>
          <p className="text-xs text-muted-foreground">Trainer: {c.createdBy ? `${c.createdBy.firstName} ${c.createdBy.lastName}` : '—'}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {formatClassDate(c.scheduledDate)} · {formatTimeRange(c.startTime, c.endTime)}</p>
          {c.status === 'CANCELLED' && c.cancelReason && <p className="text-xs text-red-600">Cancelled: {c.cancelReason}</p>}

          <div className="pt-1">
            {c.status === 'LIVE' && (
              <button onClick={() => navigate(`/live-classes/${c.id}/room`)} className="w-full px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium">Join Class</button>
            )}
            {c.status === 'SCHEDULED' && (
              <button disabled className="w-full px-3 py-1.5 text-xs rounded-lg border text-muted-foreground inline-flex items-center justify-center gap-1">
                <CalendarClock className="w-3 h-3" /> Not started yet
              </button>
            )}
            {c.status === 'COMPLETED' && (
              <div className="space-y-1.5">
                <MyAttendance liveClassId={c.id} />
                <button onClick={() => setRecordingsFor(c)} className="w-full px-3 py-1.5 text-xs rounded-lg border inline-flex items-center justify-center gap-1">
                  <Film className="w-3 h-3" /> Recording
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      {recordingsFor && <RecordingsModal liveClass={recordingsFor} onClose={() => setRecordingsFor(null)} setError={setError} />}
    </div>
  );
}

/** Own-class recording playback — same signed-URL flow as the staff page,
 * reachable here because a student who was enrolled in the class passes the
 * same assertCanJoin() ownership check the backend runs for every recording
 * endpoint (see liveClasses.controller.ts `recordings`/`playRecording`). */
function RecordingsModal({ liveClass, onClose, setError }: { liveClass: LiveClass; onClose: () => void; setError: (s: string) => void }) {
  const [recordings, setRecordings] = useState<LiveClassRecordingRecord[] | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playback, setPlayback] = useState<LiveClassPlaybackUrl | null>(null);

  useEffect(() => {
    api.get(`/api/live-classes/${liveClass.id}/recordings`).then((r) => setRecordings(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load the recording.')));
  }, [liveClass.id, setError]);

  const play = (recordingId: string) => {
    setPlayingId(recordingId);
    setPlayback(null);
    api.get(`/api/live-classes/${liveClass.id}/recordings/${recordingId}/play`)
      .then((r) => setPlayback(r.data.data))
      .catch((err) => { setError(errMsg(err, 'Could not load the recording.')); setPlayingId(null); });
  };

  return (
    <Modal title={`Recording — ${liveClass.title}`} onClose={onClose}>
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

/** Own attendance status for one completed class — fetched lazily per-card
 * (GET /:id/attendance self-scopes to the caller's own row for a student). */
function MyAttendance({ liveClassId }: { liveClassId: string }) {
  const [data, setData] = useState<LiveClassAttendanceResponse | null>(null);

  useEffect(() => {
    api.get(`/api/live-classes/${liveClassId}/attendance`).then((r) => setData(r.data.data)).catch(() => setData(null));
  }, [liveClassId]);

  const record = data?.records[0];
  if (!data || !data.computed || !record) {
    return (
      <button disabled className="w-full px-3 py-1.5 text-xs rounded-lg border text-muted-foreground inline-flex items-center justify-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> Completed
      </button>
    );
  }
  return (
    <div className={`w-full px-3 py-1.5 text-xs rounded-lg text-center font-medium ${ATTENDANCE_BADGE[record.status]}`}>
      {record.status === 'PRESENT' && 'Present'}
      {record.status === 'PARTIAL' && `Partial (${record.percentAttended}%)`}
      {record.status === 'ABSENT' && 'Absent'}
    </div>
  );
}
