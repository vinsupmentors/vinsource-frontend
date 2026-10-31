import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { errMsg } from '@/lib/liveClasses';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import { Lobby, PipButton, roomOptionsFrom, type LocalUserChoices } from '@/components/classroom/ClassroomExtras';
import { Timer, Copy, Eye, PhoneOff } from 'lucide-react';
import { RoomReleaseButton } from '@/components/DemoRoomFeedback';
import DateTimeField from '@/components/DateTimeField';

interface Joined { token: string; url: string; title: string; course?: string | null; expiresAt?: string | null; accessCode?: string; joinLink?: string; closed?: boolean }

/**
 * Portal-hosted sales demo room.
 *  /sales-demo/:id            → the BDA (host) — first entry starts the 2-hour clock
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
  const [endOpen, setEndOpen] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [feedback, setFeedback] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [ending, setEnding] = useState(false);
  const [endErr, setEndErr] = useState('');

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

  const endDemo = async () => {
    if (!outcome) { setEndErr('Pick the lead stage'); return; }
    if (outcome !== 'NOT_INTERESTED' && !followUp) { setEndErr('Pick the next follow-up date and time'); return; }
    setEnding(true); setEndErr('');
    try {
      await api.post(`/api/sales/demos/${id}/room/end`, { outcome, feedback: feedback.trim() || undefined, followUpAt: followUp ? new Date(followUp).toISOString() : undefined });
      nav('/sales');
    } catch (e) { setEndErr(errMsg(e, 'Could not end the demo.')); setEnding(false); }
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
    return <Lobby title="Sales demo" subtitle="You are the host — the 2-hour clock starts when you join" name="Host" joinLabel="Start / join demo" onSubmit={(c) => enter(c)} />;
  }

  if (!joined) return <Shell><p className="text-white">Opening the demo room…</p></Shell>;

  const onDone = () => setEnded(observe ? 'The demo has ended or you were disconnected.' : 'Demo time is over — the room has closed.');
  return (
    <LiveKitRoom serverUrl={joined.url} token={joined.token} connect video={observe ? false : choices.videoEnabled} audio={observe ? false : choices.audioEnabled}
      options={observe ? undefined : roomOptionsFrom(choices)} data-lk-theme="default" style={{ height: '100vh' }} onDisconnected={onDone}>
      <RoomAudioRenderer />
      <TopBar demoId={id || ''} joined={joined} observe={observe} onDone={onDone} onEnd={() => setEndOpen(true)} />
      <VideoConference />
      {endOpen && (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white text-gray-900 rounded-2xl w-full max-w-md p-5 space-y-3">
            <h3 className="font-semibold text-lg">End demo — update lead stage</h3>
            <p className="text-xs text-gray-500">Ends the room for everyone and marks the demo conducted. Pick the lead stage it moves to.</p>
            {endErr && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{endErr}</p>}
            <div className="grid grid-cols-2 gap-2">
              {([['INTERESTED', 'Demo Over - Positive', 'Lead stage'], ['NEED_FOLLOWUP', 'Demo Over - Need Follow up', 'Lead stage + follow-up task'], ['NOT_INTERESTED', 'Not Interested', 'Lead stage']] as const).map(([v, l, h]) => (
                <button key={v} type="button" onClick={() => setOutcome(v)} className={`text-left border rounded-lg px-3 py-2 text-sm ${outcome === v ? 'border-blue-600 bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <span className="font-medium block">{l}</span><span className="text-[11px] text-gray-500">{h}</span>
                </button>
              ))}
            </div>
            {outcome && outcome !== 'NOT_INTERESTED' && (
              <label className="text-xs text-gray-600 flex items-center gap-2">Next follow-up * <DateTimeField value={followUp} onChange={setFollowUp} min={new Date()} placeholder="Pick date & time" /></label>
            )}
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Comments (optional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEndOpen(false)} className="px-4 py-2 text-sm rounded-lg border">Keep going</button>
              <button onClick={endDemo} disabled={ending} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50">{ending ? 'Ending…' : 'End demo'}</button>
            </div>
          </div>
        </div>
      )}
    </LiveKitRoom>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-[#0f1115] flex items-center justify-center z-50 p-4 text-center">{children}</div>;
}

function TopBar({ demoId, joined, observe, onDone, onEnd }: { demoId: string; joined: Joined; observe: boolean; onDone: () => void; onEnd: () => void }) {
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
      {!observe && <RoomReleaseButton demoId={demoId} />}
      {!observe && <button onClick={onEnd} className="inline-flex items-center gap-1 text-xs bg-red-600 hover:bg-red-700 rounded px-2.5 py-1 font-medium"><PhoneOff className="w-3.5 h-3.5" /> End demo</button>}
    </div>
  );
}
