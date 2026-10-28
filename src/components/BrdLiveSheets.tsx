import { Fragment, useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';

const errMsg = (e: unknown, fb: string) => (e as { response?: { data?: { message?: string } } }).response?.data?.message || fb;
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ist(new Date(new Date(`${s}T00:00:00+05:30`).getTime() + n * 86400000));
const fmtDate = (s: string) => { const [y, m, d] = s.split('-'); return `${m}/${d}/${y}`; };
const fmtDT = (v: string) => new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
const fmtD = (v: string) => new Date(v).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });

const heatPct = (p: number) => (p >= 100 ? '#57bb8a' : p >= 50 ? '#b7cf6e' : p >= 25 ? '#f6b26b' : '#e67c73');
const heatAvg = (v: number) => (v >= 1 ? '#57bb8a' : v >= 0.6 ? '#b7cf6e' : v >= 0.4 ? '#ffd966' : v >= 0.2 ? '#f6b26b' : '#e67c73');

const TH = 'border border-[#9aa0a6] px-2 py-1 text-center font-semibold whitespace-nowrap';
const TD = 'border border-[#c6c6c6] px-2 py-1';

// ── shared: data loading + date range ──
function useLive<T>(liveKey: string, params: Record<string, string>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(params);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { const r = await api.get(`/api/report-sheets/live/${liveKey}`, { params: JSON.parse(key) }); setData(r.data.data); setError(''); }
    catch (e) { setError(errMsg(e, 'Could not load this report')); }
    finally { setLoading(false); }
  }, [liveKey, key]);
  useEffect(() => { load(); const t = setInterval(() => load(true), 60000); return () => clearInterval(t); }, [load]);
  return { data, error, loading, reload: () => load() };
}

function RangeBar({ from, to, setFrom, setTo, single, loading, onReload }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; single?: boolean; loading: boolean; onReload: () => void }) {
  const today = ist(new Date());
  const preset = (a: string, b: string) => { setFrom(a); setTo(b); };
  const monthStart = `${today.slice(0, 7)}-01`;
  const dow = (new Date(`${today}T00:00:00+05:30`).getDay() + 6) % 7;
  return (
    <div className="flex flex-wrap items-end gap-3 border rounded-lg px-3 py-2 bg-card">
      <label className="text-xs text-muted-foreground">{single ? 'Date' : 'Start date'}<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (single) setTo(e.target.value); else if (e.target.value > to) setTo(e.target.value); }} className="block mt-0.5 px-2 py-1 border rounded text-sm text-foreground bg-background" /></label>
      {!single && <label className="text-xs text-muted-foreground">End date<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="block mt-0.5 px-2 py-1 border rounded text-sm text-foreground bg-background" /></label>}
      <div className="flex gap-1.5">
        <button onClick={() => preset(today, today)} className="px-2.5 py-1 text-xs border rounded hover:bg-muted">Today</button>
        <button onClick={() => preset(addDays(today, -1), addDays(today, -1))} className="px-2.5 py-1 text-xs border rounded hover:bg-muted">Yesterday</button>
        {!single && <button onClick={() => preset(addDays(today, -dow), today)} className="px-2.5 py-1 text-xs border rounded hover:bg-muted">This week</button>}
        {!single && <button onClick={() => preset(monthStart, today)} className="px-2.5 py-1 text-xs border rounded hover:bg-muted">This month</button>}
      </div>
      <button onClick={onReload} className="ml-auto px-2.5 py-1 text-xs border rounded hover:bg-muted">{loading ? 'Loading…' : 'Refresh'}</button>
      <span className="text-[11px] text-muted-foreground">Live from Sales data · updates every minute</span>
    </div>
  );
}

function useRange(single = false) {
  const today = ist(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const params: Record<string, string> = single ? { from } : { from, to };
  return { from, to, setFrom, setTo, params };
}

async function editTarget(e: { employeeId?: string; name: string }, kind: 'booking' | 'demo', days: number, onSaved: () => void) {
  if (!e.employeeId) return;
  const v = window.prompt(`Daily ${kind} target for ${e.name} (per day, ×${days} day${days === 1 ? '' : 's'} in this range)`);
  if (v === null || v.trim() === '' || !Number.isInteger(Number(v))) return;
  try { await api.put('/api/report-sheets/live-targets', { employeeId: e.employeeId, [kind === 'booking' ? 'bookingTarget' : 'demoTarget']: Number(v) }); onSaved(); }
  catch (err) { window.alert(errMsg(err, 'Could not save the target')); }
}

const Loading = ({ error, loading }: { error: string; loading: boolean }) =>
  error ? <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div> : loading ? <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p> : null;

// ── Booked VS Conducted ──
interface Blk { fixed: number; over: number; pct: number; interested: number; fifty: number; followup: number; notInterested: number }
interface BvcRow { employeeId?: string; name: string; tl?: string; target: number; over: number; achieved: number; online: Blk; offline: Blk }
interface BvcData { days: number; advisors: BvcRow[]; tls: BvcRow[]; total: BvcRow }

function BookedVsConducted({ canAdmin }: { canAdmin: boolean }) {
  const r = useRange();
  const { data, error, loading, reload } = useLive<BvcData>('BOOKED_VS_CONDUCTED', r.params);
  const blk = (b: Blk, tint?: string, off?: boolean) => {
    const base = off ? 'text-center' : 'text-center';
    return (
      <>
        <td className={`${TD} ${base}`} style={{ background: b.fixed > 0 ? '#b6d7a8' : tint }}>{b.fixed}</td>
        <td className={`${TD} ${base}`} style={{ background: b.over > 0 ? '#b6d7a8' : tint }}>{b.over}</td>
        <td className={`${TD} ${base}`} style={{ background: tint }}>{b.pct}%</td>
        <td className={`${TD} ${base}`} style={{ background: tint }}>{b.interested}</td>
        <td className={`${TD} ${base}`} style={{ background: tint }}>{b.fifty}</td>
        <td className={`${TD} ${base}`} style={{ background: tint }}>{b.followup}</td>
        <td className={`${TD} ${base}`} style={{ background: tint }}>{b.notInterested}</td>
      </>
    );
  };
  return (
    <div className="space-y-3">
      <RangeBar {...r} loading={loading} onReload={reload} />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <div className="overflow-auto border rounded-lg bg-white max-h-[68vh]">
          <table className="border-collapse text-[13px] text-black">
            <thead>
              <tr>
                <th colSpan={5} className={TH} style={{ background: '#ffff00' }}>{fmtDate(r.from)} → {fmtDate(r.to)} · {data.days} day{data.days === 1 ? '' : 's'}</th>
                <th colSpan={14} className={TH} style={{ background: '#45b8c4' }}>Demo Fixed Vs Conducted</th>
              </tr>
              <tr>
                <th colSpan={5} className={TH} style={{ background: '#fff' }} />
                <th colSpan={7} className={TH} style={{ background: '#00ffff' }}>Online</th>
                <th colSpan={7} className={TH} style={{ background: '#d5a6bd' }}>Offline</th>
              </tr>
              <tr>
                {['Advisor', 'TL', 'Target', 'Demo Over', 'Acheived'].map((t) => <th key={t} className={TH} style={{ background: '#ff6d00', color: '#fff' }}>{t}</th>)}
                {['Demo Fixed', 'Demo Over', '%'].map((t) => <th key={`a${t}`} className={TH} style={{ background: '#4a90e2', color: '#fff' }}>{t}</th>)}
                {['Interested', '50 - 50', 'Need to Followup', 'Not Interested'].map((t) => <th key={`b${t}`} className={TH} style={{ background: '#ffe599' }}>{t}</th>)}
                {['Demo Fixed', 'Demo Over', '%'].map((t) => <th key={`c${t}`} className={TH} style={{ background: '#f6b26b' }}>{t}</th>)}
                {['Interested', '50 - 50', 'Need to Followup', 'Not Interested'].map((t) => <th key={`d${t}`} className={TH} style={{ background: '#ffe599' }}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.advisors.map((a) => (
                <tr key={a.name}>
                  <td className={TD}>{a.name}</td><td className={`${TD} text-center`}>{a.tl}</td>
                  <td className={`${TD} text-center ${canAdmin ? 'cursor-pointer hover:underline' : ''}`} onClick={() => canAdmin && editTarget(a, 'demo', data.days, reload)} title={canAdmin ? 'Click to change the daily demo target' : undefined}>{a.target}</td>
                  <td className={`${TD} text-center`}>{a.over}</td>
                  <td className={`${TD} text-center`} style={{ background: heatPct(a.achieved) }}>{a.achieved}%</td>
                  {blk(a.online)}{blk(a.offline)}
                </tr>
              ))}
              {data.tls.map((t, i) => (
                <tr key={`tl${t.name}`}>
                  {i === 0 && <td rowSpan={data.tls.length} className={`${TD} text-center font-semibold`} style={{ background: '#00ffff' }}>Demo</td>}
                  <td className={`${TD} text-center`}>{t.name}</td><td className={`${TD} text-center`}>{t.target}</td><td className={`${TD} text-center`}>{t.over}</td>
                  <td className={`${TD} text-center`} style={{ background: heatPct(t.achieved) }}>{t.achieved}%</td>
                  {blk(t.online, '#c9daf8')}{blk(t.offline, '#fff2cc')}
                </tr>
              ))}
              <tr style={{ background: '#ea4335', color: '#fff', fontWeight: 700 }}>
                <td className={TD} /><td className={TD} />
                <td className={`${TD} text-center`}>{data.total.target}</td><td className={`${TD} text-center`}>{data.total.over}</td><td className={`${TD} text-center`}>{data.total.achieved}%</td>
                {[data.total.online, data.total.offline].map((b, k) => (
                  <Fragment key={k}>
                    <td className={`${TD} text-center`}>{b.fixed}</td><td className={`${TD} text-center`}>{b.over}</td><td className={`${TD} text-center`}>{b.pct}%</td>
                    <td className={`${TD} text-center`}>{b.interested}</td><td className={`${TD} text-center`}>{b.fifty}</td><td className={`${TD} text-center`}>{b.followup}</td><td className={`${TD} text-center`}>{b.notInterested}</td>
                  </Fragment>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Demo Fixed = demos scheduled in the range (rescheduled and cancelled ones are not counted). Demo Over = demos marked conducted, grouped by the outcome the advisor recorded. Advisor = the lead's owner.</p>
    </div>
  );
}

// ── Booking ──
interface BkRow { employeeId?: string; name: string; tl?: string; target: number; fresh: number; days: number[]; avg: number; resched: number }
interface BkData { days: number; advisors: BkRow[]; tls: BkRow[]; total: BkRow }

function Booking({ canAdmin }: { canAdmin: boolean }) {
  const r = useRange();
  const { data, error, loading, reload } = useLive<BkData>('BOOKING', r.params);
  const dd = (d: number[]) => d.join(' | ');
  return (
    <div className="space-y-3">
      <RangeBar {...r} loading={loading} onReload={reload} />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <div className="overflow-auto border rounded-lg bg-white max-h-[68vh]">
          <table className="border-collapse text-[13px] text-black">
            <thead>
              <tr>
                <th colSpan={3} className={TH} style={{ background: '#a4c2f4' }}>{fmtDate(r.from)} → {fmtDate(r.to)} · {data.days} day{data.days === 1 ? '' : 's'}</th>
                <th colSpan={4} className={TH} style={{ background: '#45b8c4' }}>Bookings</th>
              </tr>
              <tr>
                {['BDA', 'TL', 'Target', 'Fresh Booking'].map((t) => <th key={t} className={TH} style={{ background: '#d0e0e3' }}>{t}</th>)}
                <th className={TH} style={{ background: '#d0e0e3' }}>Demo Day<br />M | T | W | T | F | S | S</th>
                <th className={TH} style={{ background: '#d0e0e3' }}>Booking Avg</th>
                <th className={TH} style={{ background: '#d0e0e3' }}>Rescheduled Booking</th>
              </tr>
            </thead>
            <tbody>
              {data.advisors.map((a) => (
                <tr key={a.name}>
                  <td className={TD}>{a.name}</td><td className={TD}>{a.tl}</td>
                  <td className={`${TD} text-center ${canAdmin ? 'cursor-pointer hover:underline' : ''}`} onClick={() => canAdmin && editTarget(a, 'booking', data.days, reload)} title={canAdmin ? 'Click to change the daily booking target' : undefined}>{a.target}</td>
                  <td className={`${TD} text-center`} style={{ background: a.fresh > 0 ? '#ffff00' : undefined }}>{a.fresh}</td>
                  <td className={`${TD} text-center font-mono`}>{dd(a.days)}</td>
                  <td className={`${TD} text-center`} style={{ background: heatAvg(a.avg) }}>{a.avg.toFixed(1)}</td>
                  <td className={`${TD} text-center`}>{a.resched}</td>
                </tr>
              ))}
              {data.tls.map((t, i) => (
                <tr key={`tl${t.name}`} style={{ background: '#0b3d4a', color: '#fff', fontWeight: 700 }}>
                  {i === 0 && <td rowSpan={data.tls.length} className={`${TD} text-center`} style={{ background: '#00ffff', color: '#000' }}>Bookings</td>}
                  <td className={TD}>{t.name}</td><td className={`${TD} text-center`}>{t.target}</td><td className={`${TD} text-center`}>{t.fresh}</td>
                  <td className={`${TD} text-center font-mono`}>{dd(t.days)}</td>
                  <td className={`${TD} text-center`} style={{ background: heatAvg(t.avg), color: '#000' }}>{t.avg.toFixed(1)}</td>
                  <td className={`${TD} text-center`}>{t.resched}</td>
                </tr>
              ))}
              <tr style={{ background: '#ff6d00', color: '#fff', fontWeight: 700 }}>
                <td className={TD} /><td className={TD} />
                <td className={`${TD} text-center`}>{data.total.target}</td><td className={`${TD} text-center`}>{data.total.fresh}</td>
                <td className={`${TD} text-center font-mono`}>{dd(data.total.days)}</td><td className={`${TD} text-center`}>{data.total.avg.toFixed(1)}</td><td className={`${TD} text-center`}>{data.total.resched}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Fresh Booking = demos booked in the range (new, not rescheduled). Demo Day = which weekday those demos fall on. Booking Avg = fresh bookings ÷ target. Rescheduled Booking = bookings created by rescheduling.</p>
    </div>
  );
}

// ── Today Demo ──
interface TdData { date: string; total: number; rows: { name: string; tl: string; students: { name: string; time: string; mode: string; status: string }[] }[] }

function TodayDemo() {
  const r = useRange(true);
  const { data, error, loading, reload } = useLive<TdData>('TODAY_DEMO', r.params);
  return (
    <div className="space-y-3">
      <RangeBar {...r} single loading={loading} onReload={reload} />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <div className="overflow-auto border rounded-lg bg-white max-h-[68vh]">
          <table className="border-collapse text-[13px] text-black w-full max-w-3xl">
            <thead>
              <tr><th className={TH} style={{ background: '#ffff00' }}>{r.from === ist(new Date()) ? 'Today' : 'Date'}</th><th className={TH} style={{ background: '#ffff00' }} colSpan={2}>{fmtDate(data.date)} · {data.total} demo{data.total === 1 ? '' : 's'}</th></tr>
              <tr>{['BDA', 'TL', 'Student Name'].map((t) => <th key={t} className={TH} style={{ background: '#fbbc04' }}>{t}</th>)}</tr>
            </thead>
            <tbody>
              {data.rows.map((a) => (
                <tr key={a.name}>
                  <td className={`${TD} align-bottom`}>{a.name}</td><td className={`${TD} align-bottom`}>{a.tl}</td>
                  <td className={`${TD} text-center`}>
                    {a.students.length === 0 ? 'Nil' : a.students.map((s, i) => (
                      <div key={i}>{s.name} <span className="text-[11px] text-muted-foreground">{s.time} · {s.mode === 'ONLINE' ? 'Online' : 'Offline'}{s.status === 'COMPLETED' ? ' · done' : ''}</span></div>
                    ))}
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

// ── Booking Response ──
interface BrRow { id: string; student: string; bookedAt: string; advisor: string; tl: string; phone: string; mode: string; demoAt: string; slot: string; comments: string; source: string; status: string; statusComment: string; bookedOn: string; demoDay: string; outcome: string }
const STATUS_BG: Record<string, string> = { DNP: '#ffff00', Conducted: '#6aa84f', Rescheduled: '#6d9eeb', 'No Show': '#e67c73', Cancelled: '#cccccc', 'Outcome pending': '#ffd966', Booked: '#d9ead3' };

function BookingResponse() {
  const r = useRange();
  const { data, error, loading, reload } = useLive<{ rows: BrRow[] }>('BOOKING_RESPONSE', r.params);
  const [q, setQ] = useState('');
  const rows = (data?.rows || []).filter((x) => !q || `${x.student} ${x.advisor} ${x.tl} ${x.phone} ${x.source}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <RangeBar {...r} loading={loading} onReload={reload} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student, advisor, TL, phone…" className="w-full max-w-sm px-3 py-1.5 border rounded-lg text-sm bg-background" />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <div className="overflow-auto border rounded-lg bg-white max-h-[68vh]">
          <table className="border-collapse text-[13px] text-black">
            <thead className="sticky top-0 z-10">
              <tr>
                {['S:No', 'Student Name', 'Timestamp', 'Advisor Name', 'TL Name', 'Selection', 'Client Mobile Number', 'Demo Type', 'Demo Date', 'Demo Slot', 'Comments', 'Source'].map((t) => <th key={t} className={TH} style={{ background: '#4a86e8', color: '#fff' }}>{t}</th>)}
                {['Status', 'Comments'].map((t) => <th key={t} className={TH} style={{ background: '#c27ba0', color: '#fff' }}>{t}</th>)}
                {['Booked On', 'Day', 'Demo'].map((t) => <th key={t} className={TH} style={{ background: '#4a86e8', color: '#fff' }}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={17} className="text-center py-8 text-muted-foreground">No bookings in this range</td></tr> : rows.map((x, i) => (
                <tr key={x.id}>
                  <td className={`${TD} text-center`}>{i + 1}</td><td className={TD}>{x.student}</td><td className={`${TD} whitespace-nowrap`}>{fmtDT(x.bookedAt)}</td>
                  <td className={TD}>{x.advisor}</td><td className={TD}>{x.tl}</td><td className={`${TD} text-center`}>Booking</td><td className={`${TD} text-center`}>{x.phone}</td>
                  <td className={`${TD} text-center`}>{x.mode === 'ONLINE' ? 'Online' : 'Offline'}</td><td className={`${TD} text-center`}>{fmtD(x.demoAt)}</td><td className={`${TD} text-center`}>{x.slot}</td>
                  <td className={`${TD} max-w-[280px] whitespace-pre-wrap`}>{x.comments}</td><td className={TD}>{x.source}</td>
                  <td className={`${TD} text-center font-semibold whitespace-nowrap`} style={{ background: STATUS_BG[x.status] }}>{x.status}</td>
                  <td className={`${TD} max-w-[220px] whitespace-pre-wrap`}>{x.statusComment}</td>
                  <td className={`${TD} text-center`} style={{ background: '#e8e8e8' }}>{fmtDate(x.bookedOn)}</td><td className={`${TD} text-center`}>{x.demoDay}</td><td className={`${TD} text-center`}>{x.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Demo Response ──
interface DrRow { id: string; student: string; doneAt: string; advisor: string; tl: string; phone: string; outcome: string; comments: string; source: string; demoDate: string; stage: string; stageComment: string }
const OUTCOME_BG: Record<string, string> = { Interested: '#b6d7a8', '50 - 50': '#ffe599', 'Need to Followup': '#f9cb9c', 'Not Interested': '#ea9999' };

function DemoResponse() {
  const r = useRange();
  const { data, error, loading, reload } = useLive<{ rows: DrRow[] }>('DEMO_RESPONSE', r.params);
  const [q, setQ] = useState('');
  const rows = (data?.rows || []).filter((x) => !q || `${x.student} ${x.advisor} ${x.tl} ${x.phone} ${x.source}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <RangeBar {...r} loading={loading} onReload={reload} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student, advisor, TL, phone…" className="w-full max-w-sm px-3 py-1.5 border rounded-lg text-sm bg-background" />
      <Loading error={error} loading={loading && !data} />
      {data && (
        <div className="overflow-auto border rounded-lg bg-white max-h-[68vh]">
          <table className="border-collapse text-[13px] text-black">
            <thead className="sticky top-0 z-10">
              <tr>
                {['S:No', 'Name', 'Timestamp', 'Advisor', 'TL', 'Selection', 'Phone Number', 'Demo Status', 'Comments', 'Source', 'Demo Done Date'].map((t) => <th key={t} className={TH} style={{ background: '#ffc000' }}>{t}</th>)}
                {['Lead Stage Now', 'Latest Note'].map((t) => <th key={t} className={TH} style={{ background: '#ff6d00', color: '#fff' }}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">No demos conducted in this range</td></tr> : rows.map((x, i) => (
                <tr key={x.id}>
                  <td className={`${TD} text-center`}>{i + 1}</td><td className={`${TD} text-center`}>{x.student}</td><td className={`${TD} whitespace-nowrap`}>{fmtDT(x.doneAt)}</td>
                  <td className={TD}>{x.advisor}</td><td className={TD}>{x.tl}</td><td className={`${TD} text-center`}>Demo Over</td><td className={`${TD} text-center`}>{x.phone}</td>
                  <td className={`${TD} text-center whitespace-nowrap`} style={{ background: OUTCOME_BG[x.outcome] }}>{x.outcome}</td>
                  <td className={`${TD} max-w-[330px] whitespace-pre-wrap`}>{x.comments}</td><td className={`${TD} text-center`}>{x.source}</td><td className={`${TD} text-center`}>{fmtD(x.demoDate)}</td>
                  <td className={`${TD} text-center font-medium whitespace-nowrap`}>{x.stage}</td><td className={`${TD} max-w-[300px] whitespace-pre-wrap`}>{x.stageComment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function LiveSheet({ liveKey, canAdmin }: { liveKey: string; canAdmin: boolean }) {
  switch (liveKey) {
    case 'BOOKING': return <Booking canAdmin={canAdmin} />;
    case 'BOOKED_VS_CONDUCTED': return <BookedVsConducted canAdmin={canAdmin} />;
    case 'TODAY_DEMO': return <TodayDemo />;
    case 'BOOKING_RESPONSE': return <BookingResponse />;
    case 'DEMO_RESPONSE': return <DemoResponse />;
    default: return <p className="text-sm text-muted-foreground">Unknown report.</p>;
  }
}
