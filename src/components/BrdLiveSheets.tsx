import { Fragment, useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import SheetTable, { type Col } from './SheetTable';

export const errMsg = (e: unknown, fb: string) => (e as { response?: { data?: { message?: string } } }).response?.data?.message || fb;
export const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ist(new Date(new Date(`${s}T00:00:00+05:30`).getTime() + n * 86400000));
export const fmtDate = (s: string) => { const [y, m, d] = s.split('-'); return `${m}/${d}/${y}`; };
export const fmtDT = (v: string) => new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
export const fmtD = (v: string) => new Date(v).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });

const heatPct = (p: number) => (p >= 100 ? '#57bb8a' : p >= 50 ? '#b7cf6e' : p >= 25 ? '#f6b26b' : '#e67c73');
const heatAvg = (v: number) => (v >= 1 ? '#57bb8a' : v >= 0.6 ? '#b7cf6e' : v >= 0.4 ? '#ffd966' : v >= 0.2 ? '#f6b26b' : '#e67c73');

export const TH = 'border border-[#9aa0a6] px-2 py-1 text-center font-semibold whitespace-nowrap';
export const TD = 'border border-[#c6c6c6] px-2 py-1';

// ── shared: data loading + date range ──
export function useLive<T>(liveKey: string, params: Record<string, string>) {
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

export function RangeBar({ from, to, setFrom, setTo, single, loading, onReload, allowAll }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; single?: boolean; loading: boolean; onReload: () => void; allowAll?: boolean }) {
  const today = ist(new Date());
  const preset = (a: string, b: string) => { setFrom(a); setTo(b); };
  const monthStart = `${today.slice(0, 7)}-01`;
  const dow = (new Date(`${today}T00:00:00+05:30`).getDay() + 6) % 7;
  return (
    <div className="flex flex-wrap items-end gap-3 border rounded-lg px-3 py-2 bg-card">
      <label className="text-xs text-muted-foreground">{single ? 'Date' : 'Start date'}<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (single) setTo(e.target.value); else if (e.target.value > to || !to) setTo(e.target.value); }} className="block mt-0.5 px-2 py-1 border rounded text-sm text-foreground bg-background" /></label>
      {!single && <label className="text-xs text-muted-foreground">End date<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="block mt-0.5 px-2 py-1 border rounded text-sm text-foreground bg-background" /></label>}
      <div className="flex gap-1.5">
        <button onClick={() => preset(today, today)} className="px-2.5 py-1 text-xs border rounded hover:bg-muted">Today</button>
        <button onClick={() => preset(addDays(today, -1), addDays(today, -1))} className="px-2.5 py-1 text-xs border rounded hover:bg-muted">Yesterday</button>
        {!single && <button onClick={() => preset(addDays(today, -dow), today)} className="px-2.5 py-1 text-xs border rounded hover:bg-muted">This week</button>}
        {!single && <button onClick={() => preset(monthStart, today)} className="px-2.5 py-1 text-xs border rounded hover:bg-muted">This month</button>}
        {allowAll && <button onClick={() => preset('', '')} className="px-2.5 py-1 text-xs border rounded hover:bg-muted">All time</button>}
      </div>
      <button onClick={onReload} className="ml-auto px-2.5 py-1 text-xs border rounded hover:bg-muted">{loading ? 'Loading…' : 'Refresh'}</button>
      <span className="text-[11px] text-muted-foreground">Live from Sales data · updates every minute</span>
    </div>
  );
}

export function useRange(single = false, monthToDate = false) {
  const today = ist(new Date());
  const [from, setFrom] = useState(monthToDate ? `${today.slice(0, 7)}-01` : today);
  const [to, setTo] = useState(today);
  const params: Record<string, string> = single ? { from } : from || to ? { from, to } : {};
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
const BLUE = { bg: '#4a86e8', fg: '#fff' }, PINK = { bg: '#c27ba0', fg: '#fff' };
const patchDemo = (id: string, body: Record<string, string>) => api.patch(`/api/report-sheets/demo/${id}`, body);

function BookingResponse({ canEdit }: { canEdit: boolean }) {
  const r = useRange();
  const { data, error, loading, reload } = useLive<{ rows: BrRow[] }>('BOOKING_RESPONSE', r.params);
  const cols: Col<BrRow>[] = [
    { key: 'n', label: 'S:No', ...BLUE, noFilter: true, get: () => '', render: (_x, i) => i + 1, cls: 'text-center' },
    { key: 'student', label: 'Student Name', ...BLUE, get: (x) => x.student },
    { key: 'at', label: 'Timestamp', ...BLUE, get: (x) => fmtDT(x.bookedAt), sortVal: (x) => x.bookedAt, cls: 'whitespace-nowrap' },
    { key: 'advisor', label: 'Advisor Name', ...BLUE, get: (x) => x.advisor },
    { key: 'tl', label: 'TL Name', ...BLUE, get: (x) => x.tl },
    { key: 'sel', label: 'Selection', ...BLUE, get: () => 'Booking', cls: 'text-center' },
    { key: 'phone', label: 'Client Mobile Number', ...BLUE, get: (x) => x.phone, cls: 'text-center' },
    { key: 'mode', label: 'Demo Type', ...BLUE, get: (x) => (x.mode === 'ONLINE' ? 'Online' : 'Offline'), cls: 'text-center' },
    { key: 'demoAt', label: 'Demo Date', ...BLUE, get: (x) => fmtD(x.demoAt), sortVal: (x) => x.demoAt, cls: 'text-center' },
    { key: 'slot', label: 'Demo Slot', ...BLUE, get: (x) => x.slot, cls: 'text-center' },
    { key: 'comments', label: 'Comments', ...BLUE, get: (x) => x.comments, cls: 'max-w-[280px] whitespace-pre-wrap', multiline: true, edit: (x, v) => patchDemo(x.id, { comments: v }) },
    { key: 'source', label: 'Source', ...BLUE, get: (x) => x.source, edit: (x, v) => patchDemo(x.id, { source: v }) },
    { key: 'status', label: 'Status', ...PINK, get: (x) => x.status, cls: 'text-center font-semibold whitespace-nowrap', cellBg: (x) => STATUS_BG[x.status] },
    { key: 'sc', label: 'Comments ', ...PINK, get: (x) => x.statusComment, cls: 'max-w-[220px] whitespace-pre-wrap' },
    { key: 'bookedOn', label: 'Booked On', ...BLUE, get: (x) => fmtDate(x.bookedOn), sortVal: (x) => x.bookedOn, cls: 'text-center', cellBg: () => '#e8e8e8' },
    { key: 'day', label: 'Day', ...BLUE, get: (x) => x.demoDay, cls: 'text-center' },
    { key: 'outcome', label: 'Demo', ...BLUE, get: (x) => x.outcome, cls: 'text-center' },
  ];
  return (
    <div className="space-y-3">
      <RangeBar {...r} loading={loading} onReload={reload} />
      <Loading error={error} loading={loading && !data} />
      {data && <SheetTable rows={data.rows} cols={cols} rowKey={(x) => x.id} empty="No bookings in this range" canEdit={canEdit} onChanged={reload} maxH="68vh" />}
      {data && canEdit && <p className="text-[11px] text-muted-foreground">Double-click a Comments or Source cell to edit it. Use the arrow on each heading to sort or filter.</p>}
    </div>
  );
}

// ── Demo Response ──
interface DrRow { id: string; student: string; doneAt: string; advisor: string; tl: string; phone: string; outcome: string; comments: string; source: string; demoDate: string; stage: string; stageComment: string }
const OUTCOME_BG: Record<string, string> = { Interested: '#b6d7a8', '50 - 50': '#ffe599', 'Need to Followup': '#f9cb9c', 'Not Interested': '#ea9999' };
const YEL = { bg: '#ffc000', fg: '#000' }, ORG = { bg: '#ff6d00', fg: '#fff' };

function DemoResponse({ canEdit }: { canEdit: boolean }) {
  const r = useRange();
  const { data, error, loading, reload } = useLive<{ rows: DrRow[] }>('DEMO_RESPONSE', r.params);
  const cols: Col<DrRow>[] = [
    { key: 'n', label: 'S:No', ...YEL, noFilter: true, get: () => '', render: (_x, i) => i + 1, cls: 'text-center' },
    { key: 'student', label: 'Name', ...YEL, get: (x) => x.student, cls: 'text-center' },
    { key: 'at', label: 'Timestamp', ...YEL, get: (x) => fmtDT(x.doneAt), sortVal: (x) => x.doneAt, cls: 'whitespace-nowrap' },
    { key: 'advisor', label: 'Advisor', ...YEL, get: (x) => x.advisor },
    { key: 'tl', label: 'TL', ...YEL, get: (x) => x.tl },
    { key: 'sel', label: 'Selection', ...YEL, get: () => 'Demo Over', cls: 'text-center' },
    { key: 'phone', label: 'Phone Number', ...YEL, get: (x) => x.phone, cls: 'text-center' },
    { key: 'outcome', label: 'Demo Status', ...YEL, get: (x) => x.outcome, cls: 'text-center whitespace-nowrap', cellBg: (x) => OUTCOME_BG[x.outcome] },
    { key: 'comments', label: 'Comments', ...YEL, get: (x) => x.comments, cls: 'max-w-[330px] whitespace-pre-wrap', multiline: true, edit: (x, v) => patchDemo(x.id, { feedback: v }) },
    { key: 'source', label: 'Source', ...YEL, get: (x) => x.source, cls: 'text-center', edit: (x, v) => patchDemo(x.id, { source: v }) },
    { key: 'date', label: 'Demo Done Date', ...YEL, get: (x) => fmtD(x.demoDate), sortVal: (x) => x.demoDate, cls: 'text-center' },
    { key: 'stage', label: 'Lead Stage Now', ...ORG, get: (x) => x.stage, cls: 'text-center font-medium whitespace-nowrap' },
    { key: 'note', label: 'Latest Note', ...ORG, get: (x) => x.stageComment, cls: 'max-w-[300px] whitespace-pre-wrap' },
  ];
  return (
    <div className="space-y-3">
      <RangeBar {...r} loading={loading} onReload={reload} />
      <Loading error={error} loading={loading && !data} />
      {data && <SheetTable rows={data.rows} cols={cols} rowKey={(x) => x.id} empty="No demos conducted in this range" canEdit={canEdit} onChanged={reload} maxH="68vh" />}
      {data && <p className="text-[11px] text-muted-foreground">Fills automatically when the sales team marks a demo as Conducted (date shown is when it was marked).{canEdit ? ' Double-click Comments or Source to edit.' : ''}</p>}
    </div>
  );
}

// ── Student Response (demo reviews filled by students) ──
interface SrRow { id: string; demoId: string; student: string; phone: string; advisor: string; tl: string; demoAt: string; mode: string; releasedAt: string; submittedAt: string | null; status: string; overall: number | null; trainer: number | null; content: number | null; pace: string; doubts: string; joinIntent: string; liked: string; improve: string }
const GRN = { bg: '#6aa84f', fg: '#fff' };
const star = (n: number | null) => (n ? `${n}/5` : '');
const RATE_BG = (n: number | null) => (n == null ? undefined : n >= 4 ? '#b6d7a8' : n === 3 ? '#ffe599' : '#ea9999');
const INTENT_BG: Record<string, string> = { Yes: '#b6d7a8', Maybe: '#ffe599', No: '#ea9999' };

function StudentResponse() {
  const r = useRange();
  const { data, error, loading, reload } = useLive<{ rows: SrRow[] }>('STUDENT_RESPONSE', r.params);
  const rows = data?.rows || [];
  const done = rows.filter((x) => x.overall != null);
  const avg = (k: 'overall' | 'trainer' | 'content') => (done.length ? (done.reduce((a, x) => a + (x[k] || 0), 0) / done.length).toFixed(1) : '—');
  const cols: Col<SrRow>[] = [
    { key: 'n', label: 'S:No', ...GRN, noFilter: true, get: () => '', render: (_x, i) => i + 1, cls: 'text-center' },
    { key: 'student', label: 'Student', ...GRN, get: (x) => x.student },
    { key: 'phone', label: 'Phone', ...GRN, get: (x) => x.phone, cls: 'text-center' },
    { key: 'advisor', label: 'Advisor', ...GRN, get: (x) => x.advisor },
    { key: 'tl', label: 'TL', ...GRN, get: (x) => x.tl },
    { key: 'demoAt', label: 'Demo Date', ...GRN, get: (x) => fmtD(x.demoAt), sortVal: (x) => x.demoAt, cls: 'text-center' },
    { key: 'status', label: 'Status', ...GRN, get: (x) => x.status, cls: 'text-center font-semibold', cellBg: (x) => (x.status === 'Submitted' ? '#b6d7a8' : '#ffe599') },
    { key: 'at', label: 'Submitted On', ...GRN, get: (x) => (x.submittedAt ? fmtDT(x.submittedAt) : ''), sortVal: (x) => x.submittedAt || '', cls: 'whitespace-nowrap' },
    { key: 'overall', label: 'Overall', ...GRN, get: (x) => star(x.overall), sortVal: (x) => x.overall ?? 0, cls: 'text-center', cellBg: (x) => RATE_BG(x.overall) },
    { key: 'trainer', label: 'Trainer', ...GRN, get: (x) => star(x.trainer), sortVal: (x) => x.trainer ?? 0, cls: 'text-center', cellBg: (x) => RATE_BG(x.trainer) },
    { key: 'content', label: 'Content', ...GRN, get: (x) => star(x.content), sortVal: (x) => x.content ?? 0, cls: 'text-center', cellBg: (x) => RATE_BG(x.content) },
    { key: 'pace', label: 'Pace', ...GRN, get: (x) => x.pace, cls: 'text-center' },
    { key: 'doubts', label: 'Doubts Cleared', ...GRN, get: (x) => x.doubts, cls: 'text-center' },
    { key: 'intent', label: 'Will Join?', ...GRN, get: (x) => x.joinIntent, cls: 'text-center font-medium', cellBg: (x) => INTENT_BG[x.joinIntent] },
    { key: 'liked', label: 'Liked Most', ...GRN, get: (x) => x.liked, cls: 'max-w-[260px] whitespace-pre-wrap' },
    { key: 'improve', label: 'Can Improve', ...GRN, get: (x) => x.improve, cls: 'max-w-[260px] whitespace-pre-wrap' },
  ];
  return (
    <div className="space-y-3">
      <RangeBar {...r} loading={loading} onReload={reload} />
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {([['Released', String(rows.length)], ['Filled', String(done.length)], ['Avg overall', avg('overall')], ['Avg trainer', avg('trainer')], ['Avg content', avg('content')]] as [string, string][]).map(([l, v]) => (
            <div key={l} className="border rounded-xl p-3 bg-card"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-bold">{v}</p></div>
          ))}
        </div>
      )}
      <Loading error={error} loading={loading && !data} />
      {data && <SheetTable rows={rows} cols={cols} rowKey={(x) => x.id} empty="No student reviews yet — release the demo questions from a demo card" maxH="64vh" />}
      <p className="text-[11px] text-muted-foreground">Reviews appear here as soon as the student submits the form that the sales team released after the demo.</p>
    </div>
  );
}

export default function LiveSheet({ liveKey, canAdmin, canEdit = false }: { liveKey: string; canAdmin: boolean; canEdit?: boolean }) {
  switch (liveKey) {
    case 'BOOKING': return <Booking canAdmin={canAdmin} />;
    case 'BOOKED_VS_CONDUCTED': return <BookedVsConducted canAdmin={canAdmin} />;
    case 'TODAY_DEMO': return <TodayDemo />;
    case 'BOOKING_RESPONSE': return <BookingResponse canEdit={canEdit} />;
    case 'DEMO_RESPONSE': return <DemoResponse canEdit={canEdit} />;
    case 'STUDENT_RESPONSE': return <StudentResponse />;
    default: return <p className="text-sm text-muted-foreground">Unknown report.</p>;
  }
}
