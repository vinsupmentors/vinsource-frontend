import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { errMsg } from '@/lib/liveClasses';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import { Loader2, Video, Timer } from 'lucide-react';

interface Joined { token: string; url: string; title: string; course: string; expiresAt: string }

/** Public page a prospect opens from the approval email: code + email → join the running class as a normal participant for a limited time. */
export default function DemoJoinPage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState((params.get('code') || '').toUpperCase());
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [ended, setEnded] = useState('');
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const finished = useRef(false); // set once joined or failed, so the poll never starts/continues

  const stopPoll = () => { if (poll.current) { clearInterval(poll.current); poll.current = null; } };
  const attempt = useCallback(() => {
    return api.post('/api/public/demo-join', { code, email })
      .then((r) => {
        if (r.data.data.waiting) { setWaiting(true); return; }
        finished.current = true; stopPoll(); setWaiting(false); setJoined(r.data.data);
      })
      .catch((e) => { finished.current = true; stopPoll(); setWaiting(false); setError(errMsg(e, 'Could not join.')); });
  }, [code, email]);

  const submit = async () => {
    setError(''); finished.current = false;
    await attempt();
    if (!finished.current && !poll.current) poll.current = setInterval(attempt, 8000); // wait for the trainer to start the class
  };
  // The interval stops itself once joined/failed (stopPoll in attempt).
  useEffect(() => stopPoll, []);

  if (ended) return <Shell><p className="text-white text-lg">{ended}</p></Shell>;

  if (joined) {
    return (
      <LiveKitRoom serverUrl={joined.url} token={joined.token} connect video audio data-lk-theme="default" style={{ height: '100vh' }}
        onDisconnected={() => setEnded('Your demo time is over. Thank you for joining — our team will be in touch!')}>
        <RoomAudioRenderer />
        <Countdown expiresAt={joined.expiresAt} title={`${joined.course} — demo`} onDone={() => setEnded('Your demo time is over. Thank you for joining — our team will be in touch!')} />
        <VideoConference />
      </LiveKitRoom>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4 text-left">
        <div className="text-center space-y-1"><Video className="w-8 h-8 text-blue-600 mx-auto" /><h1 className="font-semibold text-lg">Join your demo class</h1>
          <p className="text-xs text-gray-500">Enter the code from your approval email and the email address it was sent to.</p></div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {waiting ? (
          <div className="text-center space-y-2 py-2"><Loader2 className="w-5 h-5 animate-spin text-blue-600 mx-auto" />
            <p className="text-sm text-gray-600">The class hasn't started yet. This page will open it automatically when the trainer begins.</p></div>
        ) : (
          <>
            <input className="w-full border rounded-lg px-3 py-2 text-sm tracking-widest uppercase" placeholder="Access code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button onClick={submit} disabled={code.length < 6 || !/^\S+@\S+\.\S+$/.test(email)} className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">Join Class</button>
            <p className="text-xs text-gray-500 text-center">You'll have 20 minutes in the class, starting when you enter. You can see, speak and share your screen.</p>
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-[#0f1115] flex items-center justify-center z-50 p-4 text-center">{children}</div>;
}

function Countdown({ expiresAt, title, onDone }: { expiresAt: string; title: string; onDone: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setLeft(l);
      if (l <= 0) { clearInterval(t); onDone(); }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onDone]);
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return (
    <div className="absolute top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-2 bg-black/60 backdrop-blur-sm text-white text-sm">
      <span className="font-medium truncate">{title}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${left < 120000 ? 'text-red-300' : ''}`}><Timer className="w-3.5 h-3.5" /> {m}:{String(s).padStart(2, '0')} left</span>
    </div>
  );
}
