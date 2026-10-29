import { useEffect, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import api from '@/lib/api';
import { errMsg } from '@/lib/liveClasses';
import { MessageSquareHeart, Copy, X } from 'lucide-react';
import { FeedbackForm } from './DemoFeedbackForm';

const TOPIC = 'demo-feedback';

/** Host (inside the demo room): releases the review questions — they pop up on the student's screen in the room. */
export function RoomReleaseButton({ demoId }: { demoId: string }) {
  const room = useRoomContext();
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = token ? `${window.location.origin}/demo-feedback/${token}` : '';

  const release = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/sales/demos/${demoId}/feedback/release`);
      const t = r.data.data.token as string;
      setToken(t);
      await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ token: t })), { reliable: true, topic: TOPIC });
      setSent(true);
    } catch (e) { window.alert(errMsg(e, 'Could not release the review questions')); }
    finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={release} disabled={busy} className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 rounded px-2.5 py-1 font-medium disabled:opacity-50">
        <MessageSquareHeart className="w-3.5 h-3.5" /> {busy ? 'Releasing…' : 'Release review'}
      </button>
      {sent && (
        <div className="fixed bottom-4 left-4 z-[95] bg-white text-gray-900 rounded-xl shadow-xl p-3 text-xs space-y-1 max-w-xs">
          <div className="flex justify-between gap-3"><b>Review questions sent to the student's screen</b><button onClick={() => setSent(false)}><X className="w-3.5 h-3.5" /></button></div>
          <p className="text-gray-500">Answers appear in Report Sheets → BRD Tracker → Student Response.</p>
          <div className="flex gap-3">
            <button onClick={release} className="text-blue-600 hover:underline">Send again</button>
            <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Copy className="w-3 h-3" /> {copied ? 'Copied' : 'Copy link'}</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Student side (inside the room): shows the form when the host releases it. */
export function StudentFeedbackListener() {
  const room = useRoomContext();
  const [token, setToken] = useState('');
  useEffect(() => {
    const h = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (topic !== TOPIC) return;
      try { const d = JSON.parse(new TextDecoder().decode(payload)); if (d?.token) setToken(String(d.token)); } catch { /* ignore */ }
    };
    room.on(RoomEvent.DataReceived, h);
    return () => { room.off(RoomEvent.DataReceived, h); };
  }, [room]);
  if (!token) return null;
  return (
    <div className="fixed inset-0 z-[95] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white text-gray-900 rounded-2xl w-full max-w-xl max-h-[94vh] overflow-y-auto p-6 relative text-left">
        <button onClick={() => setToken('')} className="absolute top-3 right-3 p-1 rounded hover:bg-gray-100" aria-label="Close"><X className="w-5 h-5" /></button>
        <FeedbackForm token={token} />
      </div>
    </div>
  );
}
