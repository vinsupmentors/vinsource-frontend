import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { errMsg, formatTimeRange } from '@/lib/liveClasses';
import { Loader2, Plus, X, Check, Ban, Presentation, Mail, MapPin } from 'lucide-react';

interface Trainer { trainer: { id: string; firstName: string; lastName: string } }
interface TodayClass {
  id: string; title: string; topic: string | null; startTime: string; endTime: string; status: 'SCHEDULED' | 'LIVE';
  schedule: { id: string; code: string | null; timing: string; batch: { code: string }; course: { id: string; name: string }; trainers: Trainer[] };
}
interface DemoReq {
  id: string; mode: 'ONLINE' | 'OFFLINE'; attendeeName: string; attendeeEmail: string | null; attendeePhone: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; maxMinutes: number; createdAt: string; reviewNote: string | null;
  joinedAt: string | null; expiresAt: string | null; requestedByName: string | null; reviewedByName: string | null;
  canReview: boolean; isMine: boolean; liveClass: TodayClass | null;
}

const BADGE: Record<DemoReq['status'], string> = {
  PENDING: 'bg-amber-50 text-amber-700', APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700', CANCELLED: 'bg-gray-100 text-gray-600',
};
const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm';
const trainerNames = (c: TodayClass) => c.schedule.trainers.map((t) => `${t.trainer.firstName} ${t.trainer.lastName}`).join(', ') || '—';

export default function DemoRequestsPage() {
  const [rows, setRows] = useState<DemoReq[] | null>(null);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    api.get('/api/demo-requests').then((r) => setRows(r.data.data)).catch((e) => setError(errMsg(e, 'Could not load demo requests.')));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = (id: string, action: 'approve' | 'reject' | 'cancel') => {
    let note: string | undefined;
    if (action === 'reject') { const n = window.prompt('Reason for rejecting (optional):'); if (n === null) return; note = n || undefined; }
    if (action === 'cancel' && !window.confirm('Cancel this demo request?')) return;
    setBusyId(id); setError('');
    api.post(`/api/demo-requests/${id}/${action}`, { note })
      .then(load).catch((e) => setError(errMsg(e, `Could not ${action}.`))).finally(() => setBusyId(''));
  };

  const pending = (rows || []).filter((r) => r.canReview);
  const rest = (rows || []).filter((r) => !r.canReview);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Presentation className="w-6 h-6" /> Demo Requests</h1>
          <p className="text-sm text-muted-foreground">Prospects sit in on a class that's running today. The Production Manager or the sub-batch trainer approves.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Request a Demo</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}
      {rows === null ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div> : (
        <>
          {pending.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-amber-700">Waiting for your approval ({pending.length})</h2>
              {pending.map((r) => <Card key={r.id} r={r} busy={busyId === r.id} onAct={act} />)}
            </section>
          )}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{pending.length ? 'Other requests' : 'Requests'}</h2>
            {rest.length === 0 ? <p className="text-sm text-muted-foreground border rounded-xl text-center py-8">Nothing here yet.</p>
              : rest.map((r) => <Card key={r.id} r={r} busy={busyId === r.id} onAct={act} />)}
          </section>
        </>
      )}

      {showNew && <NewRequestModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function Card({ r, busy, onAct }: { r: DemoReq; busy: boolean; onAct: (id: string, a: 'approve' | 'reject' | 'cancel') => void }) {
  const c = r.liveClass;
  return (
    <div className="border rounded-xl p-4 bg-card space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="font-semibold">{r.attendeeName} <span className="text-xs font-normal text-muted-foreground">{r.mode === 'ONLINE' ? <><Mail className="w-3 h-3 inline" /> Online · {r.attendeeEmail}</> : <><MapPin className="w-3 h-3 inline" /> Offline (in person)</>}</span></p>
          {c && <p className="text-sm text-muted-foreground">{c.schedule.course.name} · {c.schedule.batch.code}{c.schedule.code ? ` / ${c.schedule.code}` : ''} · {formatTimeRange(c.startTime, c.endTime)} · Trainer: {trainerNames(c)}</p>}
          <p className="text-xs text-muted-foreground">Requested by {r.requestedByName || '—'} · {new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{r.reviewedByName ? ` · Reviewed by ${r.reviewedByName}` : ''}</p>
          {r.reviewNote && <p className="text-xs text-muted-foreground">Note: {r.reviewNote}</p>}
          {r.mode === 'ONLINE' && r.status === 'APPROVED' && (
            <p className="text-xs text-emerald-700 mt-1">{r.joinedAt ? `Joined ${new Date(r.joinedAt).toLocaleTimeString('en-IN', { timeStyle: 'short' })} — ${r.maxMinutes}-min window` : `Access email sent — ${r.maxMinutes}-min window starts when they join`}</p>
          )}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BADGE[r.status]}`}>{r.status}</span>
      </div>
      <div className="flex gap-2">
        {r.canReview && (
          <>
            <button disabled={busy} onClick={() => onAct(r.id, 'approve')} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white font-medium inline-flex items-center gap-1 disabled:opacity-50"><Check className="w-3.5 h-3.5" /> Approve{r.mode === 'ONLINE' ? ' & email access' : ''}</button>
            <button disabled={busy} onClick={() => onAct(r.id, 'reject')} className="px-3 py-1.5 text-xs rounded-lg border text-red-600 inline-flex items-center gap-1 disabled:opacity-50"><Ban className="w-3.5 h-3.5" /> Reject</button>
          </>
        )}
        {r.isMine && (r.status === 'PENDING' || r.status === 'APPROVED') && (
          <button disabled={busy} onClick={() => onAct(r.id, 'cancel')} className="px-3 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1 disabled:opacity-50">Cancel request</button>
        )}
      </div>
    </div>
  );
}

function NewRequestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [classes, setClasses] = useState<TodayClass[] | null>(null);
  const [mode, setMode] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [courseId, setCourseId] = useState('');
  const [classId, setClassId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.get('/api/demo-requests/options').then((r) => setClasses(r.data.data)).catch((e) => { setClasses([]); setErr(errMsg(e, 'Could not load today\'s classes.')); }); }, []);

  const courses = useMemo(() => {
    const m = new Map<string, string>();
    (classes || []).forEach((c) => m.set(c.schedule.course.id, c.schedule.course.name));
    return Array.from(m, ([id, n]) => ({ id, name: n })).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);
  const slots = (classes || []).filter((c) => c.schedule.course.id === courseId);

  const submit = () => {
    setErr(''); setSaving(true);
    api.post('/api/demo-requests', { mode, liveClassId: classId, attendeeName: name, attendeeEmail: email, attendeePhone: phone })
      .then(onDone).catch((e) => setErr(errMsg(e, 'Could not raise the request.'))).finally(() => setSaving(false));
  };
  const ready = classId && name.trim().length >= 2 && (mode === 'OFFLINE' || /^\S+@\S+\.\S+$/.test(email));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b"><h2 className="font-semibold text-lg">Request a Demo</h2><button onClick={onClose}><X className="w-4 h-4" /></button></div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          <div className="flex gap-2">
            {(['ONLINE', 'OFFLINE'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 text-sm rounded-lg border font-medium ${mode === m ? 'bg-blue-600 text-white border-blue-600' : ''}`}>{m === 'ONLINE' ? 'Online' : 'Offline (in person)'}</button>
            ))}
          </div>
          {classes === null ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : courses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center border rounded-lg py-4">There are no open classes scheduled for today.</p>
          ) : (
            <>
              <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">Course *</span>
                <select className={inputCls} value={courseId} onChange={(e) => { setCourseId(e.target.value); setClassId(''); }}>
                  <option value="">Select course…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
              {courseId && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Today's timings *</span>
                  {slots.map((c) => (
                    <label key={c.id} className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer ${classId === c.id ? 'border-blue-600 bg-blue-50' : ''}`}>
                      <input type="radio" name="slot" className="mt-1" checked={classId === c.id} onChange={() => setClassId(c.id)} />
                      <span>
                        <span className="font-medium">{formatTimeRange(c.startTime, c.endTime)}</span> · {c.schedule.batch.code}{c.schedule.code ? ` / ${c.schedule.code}` : ''} {c.status === 'LIVE' && <span className="text-xs text-red-600 font-semibold">● LIVE now</span>}
                        <span className="block text-xs text-muted-foreground">{c.title} · Trainer: {trainerNames(c)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">Prospect name *</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></label>
          {mode === 'ONLINE' ? (
            <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">Prospect email * (the access link + code are sent here)</span>
              <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          ) : (
            <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">Phone (optional)</span>
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          )}
          <p className="text-xs text-muted-foreground">The request goes to the Production Manager and the sub-batch trainer. {mode === 'ONLINE' ? 'Once approved, the prospect can join the running class for 20 minutes.' : 'Once approved, the prospect can attend the class in person.'}</p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border">Close</button>
            <button onClick={submit} disabled={!ready || saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50">{saving ? 'Sending...' : 'Raise Request'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
