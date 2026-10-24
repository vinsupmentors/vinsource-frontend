import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { errMsg } from '@/lib/liveClasses';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import { Lobby, PipButton, roomOptionsFrom, type LocalUserChoices } from '@/components/classroom/ClassroomExtras';
import { Timer, Copy, Eye } from 'lucide-react';

interface Joined { token: string; url: string; title: string; course?: string | null; expiresAt?: string | null; accessCode?: string; joinLink?: string; closed?: boolean }

/**
 * Portal-hosted sales demo room.
 *  /sales-demo/:id            → the BDA (host) — first entry starts the 60-minute clock
 *  /sales-demo/:id?observe=1  → Sales Admin watching silently (no mic/camera)
 * When the time is up the room closes; the host can then request a reopen,
 * which a Sales Admin has to approve.
 */
export default function SalesDemoRoomPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const observe = params.get('observe') === '1';
  const nav = useNavigate();
  const [joined, setJoined] = useState<Joined | null>(null);
  const [choices, setChoices] = useState<LocalUserChoices | null>(observe ? { audioEnabled: false, videoEnabled: false } as LocalUserChoices : null);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState('');
  const [reopenNote, setReopenNote] = useState('');
  const [reopenSent, setReopenSent] = useState(false);

  const enter = (c?: LocalUserChoices) => {
    if (c) setChoices(c);
    setError('');
    api.post(`/api/sales/demos/${id}/room/${observe ? 'observe' : 'host'}`)
      .then((r) => setJoined(r.data.data))
      .catch((e) => { setChoices(null); setError(errMsg(e, 'Could not open the demo room.')); });
  };

  // Observers skip the lobby and connect straight away.
  useEffect(() => { if (observe) enter(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const requestReopen = () => {
    api.post(`/api/sales/demos/${id}/room/reopen-request`, { note: reopenNote })
      .then(() => setReopenSent(true))
      .catch((e) => setError(errMsg(e, 'Could not send the request.')));
  };

  if (ended || (error && !joined)) {
    const closed = error.toLowerCase().includes('closed') || !!ended;
    return (
      <Shell>
        <div className="max-w-md w-full bg-white rounded-2xl p-6 space-y-4 text-left">
          <p className="font-semibold">{ended || error}</p>
          {!observe && closed && (reopenSent ? (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">Reopen request sent. Your Sales Admin has been notified — reopen this page once they approve.</p>
          ) : (
            <>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Why do you need more time? (optional)" value={reopenNote} onChange={(e) => setReopenNote(e.target.value)} />
              <button onClick={requestReopen} className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium">Request Sales Admin to reopen</button>
            </>
          ))}
          <button onClick={() => nav('/sales')} className="w-full py-2 rounded-lg border text-sm">Back to Sales</button>
        </div>
      </Shell>
    );
  }

  if (!choices) {
    return <Lobby title="Sales demo" subtitle="You are the host — the 60-minute clock starts when you join" name="Host" joinLabel="Start / join demo" onSubmit={(c) => enter(c)} />;
  }

  if (!joined) return <Shell><p className="text-white">Opening the demo room…</p></Shell>;

  const onDone = () => setEnded(observe ? 'The demo has ended or you were disconnected.' : 'Demo time is over — the room has closed.');
  return (
    <LiveKitRoom serverUrl={joined.url} token={joined.token} connect video={observe ? false : choices.videoEnabled} audio={observe ? false : choices.audioEnabled}
      options={observe ? undefined : roomOptionsFrom(choices)} data-lk-theme="default" style={{ height: '100vh' }} onDisconnected={onDone}>
      <RoomAudioRenderer />
      <TopBar joined={joined} observe={observe} onDone={onDone} />
      <VideoConference />
    </LiveKitRoom>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-[#0f1115] flex items-center justify-center z-50 p-4 text-center">{children}</div>;
}

function TopBar({ joined, observe, onDone }: { joined: Joined; observe: boolean; onDone: () => void }) {
  const [left, setLeft] = useState(() => (joined.expiresAt ? Math.max(0, new Date(joined.expiresAt).getTime() - Date.now()) : 0));
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!joined.expiresAt) return;
    const t = setInterval(() => {
      const l = Math.max(0, new Date(joined.expiresAt!).getTime() - Date.now());
      setLeft(l);
      if (l <= 0) { clearInterval(t); onDone(); }
    }, 1000);
    return () => clearInterval(t);
  }, [joined.expiresAt, onDone]);
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  const copy = () => {
    if (!joined.joinLink) return;
    navigator.clipboard?.writeText(`${joined.joinLink}\nCode: ${joined.accessCode}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <div className="absolute top-0 left-0 right-0 z-[60] flex items-center justify-between gap-3 px-4 py-2 bg-black/60 backdrop-blur-sm text-white text-sm">
      <span className="font-medium truncate flex items-center gap-2">
        {observe && <span className="inline-flex items-center gap-1 text-xs bg-amber-500/80 rounded px-1.5 py-0.5"><Eye className="w-3 h-3" /> Observing</span>}
        {joined.title}{joined.course ? ` · ${joined.course}` : ''}
      </span>
      {!observe && joined.joinLink && (
        <button onClick={copy} className="inline-flex items-center gap-1 text-xs bg-white/15 hover:bg-white/25 rounded px-2 py-1"><Copy className="w-3 h-3" /> {copied ? 'Copied' : `Copy student link · code ${joined.accessCode}`}</button>
      )}
      {joined.expiresAt && (
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${left < 300000 ? 'text-red-300' : ''}`}><Timer className="w-3.5 h-3.5" /> {m}:{String(s).padStart(2, '0')} left</span>
      )}
      <PipButton />
    </div>
  );
}
