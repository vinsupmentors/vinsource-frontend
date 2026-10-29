import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { errMsg } from '@/lib/liveClasses';
import { Star, MessageSquareHeart, Copy, X } from 'lucide-react';

interface Info { student: string; course: string; trainer: string; submitted: boolean }
const PACE = [['TOO_FAST', 'Too fast'], ['JUST_RIGHT', 'Just right'], ['TOO_SLOW', 'Too slow']];
const DOUBTS = [['YES', 'Yes, all'], ['PARTLY', 'Partly'], ['NO', 'No']];
const INTENT = [['YES', 'Yes, I want to join'], ['MAYBE', 'Maybe / thinking'], ['NO', 'Not now']];

const Stars = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} star`}>
        <Star className={`w-8 h-8 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
      </button>
    ))}
  </div>
);
const Choice = ({ opts, value, onChange }: { opts: string[][]; value: string; onChange: (v: string) => void }) => (
  <div className="flex flex-wrap gap-2">
    {opts.map(([v, l]) => (
      <button key={v} type="button" onClick={() => onChange(v)} className={`px-3 py-2 rounded-lg border text-sm ${value === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>{l}</button>
    ))}
  </div>
);

/** The student-facing review form. Used on the rep's screen (modal) and on the public link page. */
export function FeedbackForm({ token, onDone }: { token: string; onDone?: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ overall: 0, trainer: 0, content: 0, pace: '', doubts: '', joinIntent: '', liked: '', improve: '' });
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { api.get(`/api/public/demo-feedback/${token}`).then((r) => setInfo(r.data.data)).catch((e) => setErr(errMsg(e, 'This link is not valid'))); }, [token]);

  const submit = async () => {
    setErr('');
    if (!f.overall || !f.trainer || !f.content) return setErr('Please give a star rating for all three questions');
    if (!f.pace || !f.doubts || !f.joinIntent) return setErr('Please answer all the questions');
    setBusy(true);
    try { await api.post(`/api/public/demo-feedback/${token}`, f); setSent(true); onDone?.(); }
    catch (e) { setErr(errMsg(e, 'Could not submit')); }
    finally { setBusy(false); }
  };

  if (sent || info?.submitted) return <div className="text-center py-10"><p className="text-xl font-semibold">Thank you{info ? `, ${info.student.split(' ')[0]}` : ''}! 🙏</p><p className="text-sm text-gray-500 mt-2">Your feedback has been recorded.</p></div>;
  if (!info) return err ? <p className="text-red-600 text-sm py-6 text-center">{err}</p> : <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>;
  const q = 'block text-sm font-medium text-gray-800 mb-2';
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">How was your demo{info.course ? ` of ${info.course}` : ''}?</h2>
        <p className="text-sm text-gray-500">Hi {info.student}, a minute of your honest feedback helps us a lot.{info.trainer ? ` Your trainer: ${info.trainer}.` : ''}</p>
      </div>
      {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
      <div><span className={q}>1. Overall, how was the demo?</span><Stars value={f.overall} onChange={(n) => set('overall', n)} /></div>
      <div><span className={q}>2. How well did the trainer explain?</span><Stars value={f.trainer} onChange={(n) => set('trainer', n)} /></div>
      <div><span className={q}>3. How useful was the content?</span><Stars value={f.content} onChange={(n) => set('content', n)} /></div>
      <div><span className={q}>4. How was the pace?</span><Choice opts={PACE} value={f.pace} onChange={(v) => set('pace', v)} /></div>
      <div><span className={q}>5. Were your doubts answered?</span><Choice opts={DOUBTS} value={f.doubts} onChange={(v) => set('doubts', v)} /></div>
      <div><span className={q}>6. Would you like to join the course?</span><Choice opts={INTENT} value={f.joinIntent} onChange={(v) => set('joinIntent', v)} /></div>
      <label className="block"><span className={q}>7. What did you like the most? (optional)</span><textarea rows={2} value={f.liked} onChange={(e) => set('liked', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></label>
      <label className="block"><span className={q}>8. What can we improve? (optional)</span><textarea rows={2} value={f.improve} onChange={(e) => set('improve', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></label>
      <button onClick={submit} disabled={busy} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">{busy ? 'Submitting…' : 'Submit feedback'}</button>
    </div>
  );
}

/** Rep-side button: releases the questions → form opens on this screen for the student; link can also be copied/sent. */
export function ReleaseFeedbackButton({ demoId, className = '' }: { demoId: string; className?: string }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = token ? `${window.location.origin}/demo-feedback/${token}` : '';
  const open = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/sales/demos/${demoId}/feedback/release`); setToken(r.data.data.token); }
    catch (e) { window.alert(errMsg(e, 'Could not release the questions')); }
    finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={open} disabled={busy} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-300 text-blue-700 text-xs font-medium hover:bg-blue-50 disabled:opacity-50 ${className}`}>
        <MessageSquareHeart className="w-3.5 h-3.5" /> {busy ? 'Opening…' : 'Release review questions'}
      </button>
      {token && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4">
          <div className="bg-white text-gray-900 rounded-2xl w-full max-w-xl max-h-[94vh] overflow-y-auto p-6 relative">
            <button onClick={() => setToken('')} className="absolute top-3 right-3 p-1 rounded hover:bg-gray-100" aria-label="Close"><X className="w-5 h-5" /></button>
            <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
              <span>Hand the screen to the student, or send them this link:</span>
              <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Copy className="w-3 h-3" /> {copied ? 'Copied' : 'Copy link'}</button>
            </div>
            <FeedbackForm token={token} />
          </div>
        </div>
      )}
    </>
  );
}
