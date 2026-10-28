import { useEffect, useRef, useState } from 'react';
import { X, Upload, Loader2, CheckCircle2, AlertTriangle, ImageIcon } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { readPaymentScreenshot } from '@/lib/paymentOcr';

const errMsg = (e: unknown, fb: string) => (e as { response?: { data?: { message?: string } } }).response?.data?.message || fb;
const MODES = ['UPI', 'CASH', 'CARD', 'NET_BANKING', 'CHEQUE', 'JODO', 'OTHER'];

export interface OnboardingInfo {
  id: string; courseName: string; daysType: string; timing: string; mode: string; paymentMethod: string;
  totalFee?: number | null; registrationPaid: boolean; createdAt: string;
}

// ── Payment block: amount + proof screenshot, read in the browser and cross-checked ──
interface PayState {
  amount: string; mode: string; reference: string; file: File | null;
  reading: boolean; readFailed: boolean; ocrAmounts: number[]; ocrReference: string | null;
}
const emptyPay = (): PayState => ({ amount: '', mode: 'UPI', reference: '', file: null, reading: false, readFailed: false, ocrAmounts: [], ocrReference: null });

function amountCheck(p: PayState): 'idle' | 'match' | 'mismatch' | 'unknown' {
  const a = Number(p.amount);
  if (!p.file || !a) return 'idle';
  if (p.reading) return 'idle';
  if (p.readFailed || p.ocrAmounts.length === 0) return 'unknown';
  return p.ocrAmounts.some((x) => Math.abs(x - a) < 0.5) ? 'match' : 'mismatch';
}
/** The amount from the screenshot closest to what was typed (sent to Finance when it does not match). */
function bestOcrAmount(p: PayState): number | null {
  const a = Number(p.amount);
  if (!p.ocrAmounts.length) return null;
  if (p.ocrAmounts.some((x) => Math.abs(x - a) < 0.5)) return a;
  return [...p.ocrAmounts].sort((x, y) => Math.abs(x - a) - Math.abs(y - a))[0];
}
function appendPay(fd: FormData, p: PayState) {
  fd.append('amount', p.amount); fd.append('mode', p.mode);
  if (p.reference) fd.append('reference', p.reference);
  const o = bestOcrAmount(p);
  if (o !== null) fd.append('ocrAmount', String(o));
  if (p.ocrReference) fd.append('ocrReference', p.ocrReference);
  if (p.file) fd.append('proof', p.file);
}

function PaymentBlock({ pay, setPay }: { pay: PayState; setPay: (fn: (p: PayState) => PayState) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pick = async (file: File | null) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setPay((p) => ({ ...p, file, reading: true, readFailed: false, ocrAmounts: [], ocrReference: null }));
    try {
      const r = await readPaymentScreenshot(file);
      setPay((p) => ({ ...p, reading: false, ocrAmounts: r.amounts, ocrReference: r.reference, reference: p.reference || r.reference || '' }));
    } catch {
      setPay((p) => ({ ...p, reading: false, readFailed: true }));
    }
  };
  const check = amountCheck(pay);
  const a = Number(pay.amount);
  return (
    <div className="space-y-3 border rounded-xl p-3 bg-muted/20">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-muted-foreground">Amount collected (₹)
          <input type="number" min={1} value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-background" placeholder="2000" />
        </label>
        <label className="text-xs text-muted-foreground">Payment mode
          <select value={pay.mode} onChange={(e) => setPay((p) => ({ ...p, mode: e.target.value }))} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-background">
            {MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </label>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Payment screenshot (required)</p>
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0] || null)} />
        <button type="button" onClick={() => input.current?.click()} className="flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg text-sm hover:bg-muted/50">
          {pay.file ? <ImageIcon className="w-4 h-4" /> : <Upload className="w-4 h-4" />} {pay.file ? pay.file.name : 'Attach screenshot'}
        </button>
        {preview && <img src={preview} alt="Payment proof" className="mt-2 max-h-40 rounded-lg border" />}
      </div>
      <label className="block text-xs text-muted-foreground">Transaction ID / UTR
        <input value={pay.reference} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-background" placeholder="Read from the screenshot — edit if wrong" />
      </label>
      {pay.reading && <p className="text-xs text-blue-700 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the screenshot…</p>}
      {check === 'match' && <p className="text-xs text-green-700 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Screenshot shows {formatCurrency(a)} — matches.</p>}
      {check === 'mismatch' && <p className="text-xs text-red-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Screenshot shows {pay.ocrAmounts.slice(0, 4).map((x) => formatCurrency(x)).join(' / ')} but you entered {formatCurrency(a)}. Check the amount — Finance will see this flag.</p>}
      {check === 'unknown' && <p className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Couldn't read an amount from the screenshot. Finance will verify it manually.</p>}
    </div>
  );
}

const Pills = ({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) => (
  <div className="flex flex-wrap gap-2">
    {options.map(([v, l]) => (
      <button key={v} type="button" onClick={() => onChange(v)} className={`px-3 py-1.5 rounded-lg border text-sm ${value === v ? 'bg-blue-600 border-blue-600 text-white' : 'hover:bg-muted/50'}`}>{l}</button>
    ))}
  </div>
);

export interface EmiQuote { downPaymentPct: number; downPayment: number; balance: number; ratePct: number; interest: number; totalPayable: number; monthly: number[]; months: number }

// ── Onboarding form ──
export function OnboardingModal({ leadId, leadName, defaultCourse, onClose, onDone }: { leadId: string; leadName: string; defaultCourse?: string | null; onClose: () => void; onDone: () => void }) {
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [course, setCourse] = useState(defaultCourse || '');
  const [daysType, setDaysType] = useState('');
  const [timing, setTiming] = useState('');
  const [mode, setMode] = useState('');
  const [method, setMethod] = useState('');
  const [totalFee, setTotalFee] = useState('');
  const [emiMonths, setEmiMonths] = useState(0);
  const [allowed, setAllowed] = useState<number[]>([]);
  const [quote, setQuote] = useState<EmiQuote | null>(null);
  const [feeMaster, setFeeMaster] = useState<{ courseName: string; fee: number }[]>([]);
  const [regPaid, setRegPaid] = useState(false);
  const [pay, setPay] = useState<PayState>(emptyPay());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/api/sales/courses').then((r) => setCourses(r.data.data)).catch(() => setCourses([]));
    api.get('/api/sales/course-fees').then((r) => setFeeMaster(r.data.data)).catch(() => setFeeMaster([]));
  }, []);
  useEffect(() => {
    const m = feeMaster.find((f) => f.courseName.toLowerCase() === course.trim().toLowerCase());
    if (m) setTotalFee(String(m.fee));
  }, [course, feeMaster]);

  useEffect(() => {
    if (method !== 'EMI' || !Number(totalFee)) { setAllowed([]); setEmiMonths(0); setQuote(null); return; }
    api.get('/api/sales/emi/quote', { params: { fee: totalFee } }).then((r) => {
      const a: number[] = r.data.data.allowedMonths || [];
      setAllowed(a);
      setEmiMonths((m) => (a.includes(m) ? m : 0));
    }).catch(() => setAllowed([]));
  }, [method, totalFee]);
  useEffect(() => {
    if (method !== 'EMI' || !emiMonths || !Number(totalFee)) { setQuote(null); return; }
    api.get('/api/sales/emi/quote', { params: { fee: totalFee, months: emiMonths } }).then((r) => setQuote(r.data.data)).catch(() => setQuote(null));
  }, [method, emiMonths, totalFee]);

  const submit = async () => {
    setError('');
    if (!course.trim()) return setError('Choose the course');
    if (!daysType) return setError('Choose Weekday or Weekend');
    if (!timing) return setError('Choose the timing');
    if (!mode) return setError('Choose Offline or Online');
    if (!method) return setError('Choose the payment method');
    if (method === 'EMI' && !Number(totalFee)) return setError('Enter the course fee to set up the EMI');
    if (method === 'EMI' && !emiMonths) return setError('Choose the number of EMI months');
    if (quote && regPaid && Number(pay.amount) > quote.downPayment + 0.5) return setError(`The amount collected can't be more than the down payment (${formatCurrency(quote.downPayment)})`);
    if (regPaid && (!Number(pay.amount) || !pay.file)) return setError('Enter the amount collected and attach the screenshot');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('courseName', course.trim()); fd.append('daysType', daysType); fd.append('timing', timing); fd.append('mode', mode); fd.append('paymentMethod', method);
      if (totalFee) fd.append('totalFee', totalFee);
      if (method === 'EMI') fd.append('emiMonths', String(emiMonths));
      fd.append('registrationPaid', String(regPaid));
      if (regPaid) appendPay(fd, pay);
      await api.post(`/api/sales/leads/${leadId}/onboarding`, fd);
      onDone();
    } catch (e) { setError(errMsg(e, 'Could not onboard this lead')); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div><h3 className="font-semibold text-lg">Onboard {leadName}</h3><p className="text-xs text-muted-foreground">Fill the batch preference and payment details.</p></div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

        <label className="block text-xs text-muted-foreground">Course
          <input list="onb-courses" value={course} onChange={(e) => setCourse(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-background" placeholder="Select or type the course" />
          <datalist id="onb-courses">{courses.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </label>
        <div><p className="text-xs text-muted-foreground mb-1">Batch days</p><Pills value={daysType} onChange={setDaysType} options={[['WEEKDAY', 'Weekday'], ['WEEKEND', 'Weekend']]} /></div>
        <div><p className="text-xs text-muted-foreground mb-1">Timing</p><Pills value={timing} onChange={setTiming} options={[['MORNING', 'Morning'], ['AFTERNOON', 'Afternoon'], ['EVENING', 'Evening']]} /></div>
        <div><p className="text-xs text-muted-foreground mb-1">Mode</p><Pills value={mode} onChange={setMode} options={[['OFFLINE', 'Offline'], ['ONLINE', 'Online']]} /></div>
        <div><p className="text-xs text-muted-foreground mb-1">Payment method</p><Pills value={method} onChange={setMethod} options={[['FULL', 'Full payment'], ['PART', 'Part payment'], ['EMI', 'EMI']]} /></div>
        <label className="block text-xs text-muted-foreground">Total course fee (₹ — auto-filled from the course, change if needed)
          <input type="number" min={0} value={totalFee} onChange={(e) => setTotalFee(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-background" />
        </label>

        {method === 'EMI' && (
          <div className="border rounded-xl p-3 space-y-2 bg-muted/20">
            <p className="text-xs text-muted-foreground">EMI months{!Number(totalFee) ? ' — enter the course fee first' : ''}</p>
            <Pills value={String(emiMonths)} onChange={(v) => setEmiMonths(Number(v))} options={allowed.map((m) => [String(m), `${m} months`] as [string, string])} />
            {quote && (
              <div className="text-xs space-y-0.5">
                <p>Down payment ({quote.downPaymentPct}%): <b>{formatCurrency(quote.downPayment)}</b> · Balance: <b>{formatCurrency(quote.balance)}</b></p>
                <p>Interest {quote.ratePct}% on the balance only: <b>{formatCurrency(quote.interest)}</b> · Total payable: <b>{formatCurrency(quote.totalPayable)}</b></p>
                <p>Monthly EMI: <b>{formatCurrency(quote.monthly[0])}</b> × {quote.months}</p>
              </div>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input type="checkbox" checked={regPaid} onChange={(e) => setRegPaid(e.target.checked)} className="w-4 h-4" /> Registration paid
        </label>
        {regPaid && <PaymentBlock pay={pay} setPay={(fn) => setPay(fn)} />}
        <p className="text-xs text-muted-foreground">The registration payment goes to Finance (Sales) for approval, and a short fees note is added to the lead.</p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Onboard'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Add a further payment (goes to Finance) ──
function RecordPaymentModal({ leadId, needFee, installment, onClose, onDone }: { leadId: string; needFee: boolean; installment?: { id: string; amount: number; title: string }; onClose: () => void; onDone: () => void }) {
  const [pay, setPay] = useState<PayState>({ ...emptyPay(), amount: installment ? String(installment.amount) : '' });
  const [totalFee, setTotalFee] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    if (!Number(pay.amount)) return setError('Enter the amount collected');
    if (!pay.file) return setError('Attach the payment screenshot');
    setSaving(true);
    try {
      const fd = new FormData();
      appendPay(fd, pay);
      if (totalFee && !installment) fd.append('totalFee', totalFee);
      await api.post(installment ? `/api/sales/installments/${installment.id}/pay` : `/api/sales/leads/${leadId}/payments`, fd);
      onDone();
    } catch (e) { setError(errMsg(e, 'Could not record the payment')); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between"><h3 className="font-semibold text-lg">{installment ? installment.title : 'Add payment'}</h3><button onClick={onClose}><X className="w-4 h-4" /></button></div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <PaymentBlock pay={pay} setPay={(fn) => setPay(fn)} />
        {needFee && !installment && (
          <label className="block text-xs text-muted-foreground">Total course fee (₹, optional)
            <input type="number" min={0} value={totalFee} onChange={(e) => setTotalFee(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-background" />
          </label>
        )}
        <p className="text-xs text-muted-foreground">Finance approves this once it is submitted.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Sending…' : 'Send to Finance'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Fees tab ──
interface FeeInst {
  id: string; dueDate: string; amount: number; status: 'PENDING' | 'PENDING_APPROVAL' | 'PAID' | 'OVERDUE' | 'WAIVED';
  paidAt?: string | null; mode?: string | null; reference?: string | null; hasProof?: boolean; amountMatched?: boolean | null; ocrAmount?: number | null;
  rejected?: boolean; rejectReason?: string | null; emiMonthNumber?: number | null; scheduled?: boolean; kind?: string | null;
}
interface FeeData {
  total: number; totalKnown: boolean; paid: number; awaiting: number; overdue: number; balance: number; pct: number; nextDue: { dueDate: string; amount: number } | null;
  plans: { id: string; courseName: string; totalFee: number; planType: string; admissionId?: string | null; status: string; installments: FeeInst[] }[];
}
const FEE_STATUS: Record<string, { label: string; cls: string }> = {
  PAID: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  PENDING_APPROVAL: { label: 'With Finance', cls: 'bg-amber-100 text-amber-700' },
  PENDING: { label: 'Due', cls: 'bg-slate-100 text-slate-700' },
  OVERDUE: { label: 'Overdue', cls: 'bg-red-100 text-red-700' },
  WAIVED: { label: 'Waived', cls: 'bg-slate-100 text-slate-500' },
};
const LABEL: Record<string, string> = { WEEKDAY: 'Weekday', WEEKEND: 'Weekend', MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening', OFFLINE: 'Offline', ONLINE: 'Online', FULL: 'Full payment', PART: 'Part payment', EMI: 'EMI' };

/** Inline payment screenshot (loaded through the authenticated API); click to open full size. */
export function ProofThumb({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let obj: string | null = null;
    api.get(url, { responseType: 'blob' }).then((r) => { obj = URL.createObjectURL(r.data); setSrc(obj); }).catch(() => setFailed(true));
    return () => { if (obj) URL.revokeObjectURL(obj); };
  }, [url]);
  if (failed) return <span className="text-[11px] text-muted-foreground">Screenshot unavailable</span>;
  if (!src) return <span className="text-[11px] text-muted-foreground">Loading…</span>;
  return <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="Payment proof" className="mt-1 h-24 rounded border object-cover" /></a>;
}

/** Fee master: what each course costs. Sales Admin / Finance (Sales) Admin only. */
export function CourseFeesModal({ base, onClose }: { base: '/api/sales' | '/api/finance-sales'; onClose: () => void }) {
  const [rows, setRows] = useState<{ id: string; courseName: string; fee: number }[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');
  const [error, setError] = useState('');
  const load = () => api.get(`${base}/course-fees`).then((r) => setRows(r.data.data)).catch((e) => setError(errMsg(e, 'Could not load')));
  useEffect(() => { load(); api.get('/api/sales/courses').then((r) => setCourses(r.data.data)).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (courseName: string, f: string) => {
    setError('');
    try { await api.put(`${base}/course-fees`, { courseName, fee: Number(f) }); setName(''); setFee(''); load(); }
    catch (e) { setError(errMsg(e, 'Could not save')); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between"><div><h3 className="font-semibold text-lg">Course fees</h3><p className="text-xs text-muted-foreground">Onboarding pre-fills the total fee from here. Salespeople can still change a student's fee.</p></div><button onClick={onClose}><X className="w-4 h-4" /></button></div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2">
          <input list="cf-courses" value={name} onChange={(e) => setName(e.target.value)} placeholder="Course" className="flex-1 px-3 py-2 border rounded-lg text-sm bg-background" />
          <datalist id="cf-courses">{courses.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          <input type="number" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Fee ₹" className="w-28 px-3 py-2 border rounded-lg text-sm bg-background" />
          <button onClick={() => save(name, fee)} disabled={!name.trim() || !Number(fee)} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">Add</button>
        </div>
        <div className="border rounded-xl divide-y">
          {rows.length === 0 ? <p className="p-4 text-sm text-center text-muted-foreground">No course fees yet</p> : rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1">{r.courseName}</span>
              <input type="number" defaultValue={r.fee} onBlur={(e) => { if (Number(e.target.value) > 0 && Number(e.target.value) !== r.fee) save(r.courseName, e.target.value); }} className="w-28 px-2 py-1 border rounded-lg text-sm bg-background" />
              <button onClick={async () => { await api.delete(`${base}/course-fees/${r.id}`).catch(() => {}); load(); }} className="text-xs text-red-600 hover:underline">Remove</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProofLink({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const res = await api.get(`/api/sales/payment-proofs/${id}`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { /* ignore */ } finally { setBusy(false); }
  };
  return <button onClick={open} disabled={busy} className="text-xs text-blue-600 hover:underline disabled:opacity-50">{busy ? '…' : 'View'}</button>;
}

export function LeadFeesPanel({ leadId, onboarding, canEdit, isAdmin, onChanged }: { leadId: string; onboarding: OnboardingInfo; canEdit: boolean; isAdmin: boolean; onChanged: () => void }) {
  const [data, setData] = useState<FeeData | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [collecting, setCollecting] = useState<{ id: string; amount: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const editFee = async () => {
    const v = window.prompt('New total course fee (₹)', data?.totalKnown ? String(data.total) : '');
    if (!v) return;
    const reason = window.prompt('Reason for the change (e.g. course changed)', '') || '';
    setBusy(true);
    try { await api.put(`/api/sales/leads/${leadId}/total-fee`, { totalFee: Number(v), reason }); load(); onChanged(); }
    catch (e) { setError(errMsg(e, 'Could not change the fee')); } finally { setBusy(false); }
  };
  const undo = async () => {
    if (!window.confirm('Undo this onboarding? Any payments still waiting for Finance will be removed.')) return;
    setBusy(true);
    try { await api.delete(`/api/sales/leads/${leadId}/onboarding`); onChanged(); }
    catch (e) { setError(errMsg(e, 'Could not undo')); } finally { setBusy(false); }
  };
  const load = () => {
    api.get(`/api/sales/leads/${leadId}/fees`).then((r) => setData(r.data.data))
      .catch((err: unknown) => setError(errMsg(err, 'Could not load fees')));
  };
  useEffect(load, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const pct = Math.min(100, Math.round(data.pct * 100));
  const rows = data.plans.flatMap((p) => p.installments.map((i) => ({ ...i, course: p.courseName })));
  return (
    <div className="space-y-4">
      <div className="border rounded-xl p-3 text-sm bg-muted/20 flex flex-wrap items-center justify-between gap-2">
        <span><span className="font-medium">{onboarding.courseName}</span> · {LABEL[onboarding.daysType]} · {LABEL[onboarding.timing]} · {LABEL[onboarding.mode]} · {LABEL[onboarding.paymentMethod]}</span>
        <span className="flex items-center gap-2">
          {canEdit && <button onClick={editFee} disabled={busy} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted/50">Edit course fee</button>}
          {isAdmin && <button onClick={undo} disabled={busy} className="px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50">Undo onboarding</button>}
          {canEdit && <button onClick={() => setAdding(true)} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white">+ Add payment</button>}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([['Course fee', data.totalKnown ? formatCurrency(data.total) : 'Not set', ''], ['Approved', formatCurrency(data.paid), 'text-green-700'], ['With Finance', formatCurrency(data.awaiting), 'text-amber-700'], ['Balance', data.totalKnown ? formatCurrency(data.balance) : '—', '']] as [string, string, string][]).map(([l, v, c]) => (
          <div key={l} className="border rounded-xl p-3"><p className="text-xs text-muted-foreground">{l}</p><p className={`text-lg font-bold ${c}`}>{v}</p></div>
        ))}
      </div>
      {data.totalKnown && <div><div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div><p className="text-xs text-muted-foreground mt-1">{pct}% paid</p></div>}
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground bg-muted/40"><tr><th className="px-4 py-2">Date</th><th>For</th><th>Amount</th><th>Status</th><th>Mode / ref</th><th>Proof</th></tr></thead>
          <tbody className="divide-y">
            {rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No payments yet</td></tr> : rows.map((i) => {
              const st = i.rejected ? { label: 'Rejected', cls: 'bg-red-100 text-red-700' } : i.status === 'PENDING' && new Date(i.dueDate) < new Date() ? FEE_STATUS.OVERDUE : FEE_STATUS[i.status];
              return (
                <tr key={i.id}>
                  <td className="px-4 py-2">{formatDate(i.status === 'PENDING' || i.status === 'OVERDUE' ? i.dueDate : (i.paidAt || i.dueDate))}</td>
                  <td className="text-xs">{i.kind === 'EMI' ? `EMI ${i.emiMonthNumber}` : i.kind === 'DOWN_PAYMENT' ? 'Down payment' : i.kind === 'REGISTRATION_FEE' ? 'Registration' : 'Payment'}</td>
                  <td>{formatCurrency(i.amount)}{i.amountMatched === false && <span title={`Screenshot shows ${formatCurrency(i.ocrAmount || 0)}`} className="ml-1 text-red-600">⚠</span>}</td>
                  <td><span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span></td>
                  <td className="text-xs text-muted-foreground">{i.mode ? i.mode.replace('_', ' ') : '—'}{i.reference ? ` · ${i.reference}` : ''}{i.rejected && i.rejectReason && <p className="text-red-600">Reason: {i.rejectReason}</p>}</td>
                  <td>{i.hasProof ? <ProofLink id={i.id} /> : (i.status === 'PENDING' || i.status === 'OVERDUE') && canEdit ? <button onClick={() => setCollecting({ id: i.id, amount: i.amount, title: `Collect ${i.kind === 'EMI' ? `EMI ${i.emiMonthNumber}` : 'down payment'}` })} className="text-xs text-blue-600 hover:underline">Collect</button> : <span className="text-xs text-muted-foreground">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Add each payment here with its screenshot. Finance approves it, and the lead stage then moves automatically (Registration Done → Partial Payment at 60% → Enrolled when fully paid).</p>
      {collecting && <RecordPaymentModal leadId={leadId} needFee={false} installment={collecting} onClose={() => setCollecting(null)} onDone={() => { setCollecting(null); load(); onChanged(); }} />}
      {adding && <RecordPaymentModal leadId={leadId} needFee={!data.totalKnown} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); onChanged(); }} />}
    </div>
  );
}

// ── EMI menu ──
interface EmiRow {
  planId: string; courseName: string; months?: number | null; ratePct?: number | null; fee: number; total: number; paid: number; awaiting: number; balance: number;
  paidCount: number; overdueCount: number; overdueAmount: number; nextDue: { dueDate: string; amount: number } | null;
  lead: { id: string; name: string; phone: string; assignedTo?: { firstName: string; lastName: string } | null };
}
export function EmiPanel() {
  const [rows, setRows] = useState<EmiRow[] | null>(null);
  const [error, setError] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  useEffect(() => {
    api.get('/api/emi/plans').then((r) => setRows(r.data.data)).catch((e) => setError(errMsg(e, 'Could not load EMI students')));
  }, []);
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>;
  if (!rows) return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  const list = onlyOverdue ? rows.filter((r) => r.overdueCount > 0) : rows;
  const sum = (f: (r: EmiRow) => number) => list.reduce((n, r) => n + f(r), 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([['EMI students', String(list.length), ''], ['Collected', formatCurrency(sum((r) => r.paid)), 'text-green-700'], ['Balance to collect', formatCurrency(sum((r) => r.balance)), ''], ['Overdue', formatCurrency(sum((r) => r.overdueAmount)), 'text-red-600']] as [string, string, string][]).map(([l, v, c]) => (
          <div key={l} className="border rounded-xl p-3"><p className="text-xs text-muted-foreground">{l}</p><p className={`text-lg font-bold ${c}`}>{v}</p></div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> Only students with overdue EMIs</label>
      <div className="border rounded-xl overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground bg-muted/40"><tr><th className="px-4 py-2">Student</th><th>Course</th><th>Owner</th><th>Plan</th><th>Paid</th><th>Balance</th><th>Next due</th><th>Overdue</th></tr></thead>
          <tbody className="divide-y">
            {list.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No EMI students</td></tr> : list.map((r) => (
              <tr key={r.planId} className="hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{r.lead.name}<p className="text-xs text-muted-foreground font-normal">{r.lead.phone}</p></td>
                <td>{r.courseName}</td>
                <td className="text-xs">{r.lead.assignedTo ? `${r.lead.assignedTo.firstName} ${r.lead.assignedTo.lastName}` : '—'}</td>
                <td className="text-xs">{r.months ?? '—'} months{r.ratePct != null ? ` · ${r.ratePct}%` : ''}<p className="text-muted-foreground">{r.paidCount}/{r.months ?? '?'} EMIs paid</p></td>
                <td className="text-green-700">{formatCurrency(r.paid)}{r.awaiting > 0 && <p className="text-[11px] text-amber-700">+{formatCurrency(r.awaiting)} with Finance</p>}</td>
                <td>{formatCurrency(r.balance)}</td>
                <td className="text-xs">{r.nextDue ? `${formatDate(r.nextDue.dueDate)} · ${formatCurrency(r.nextDue.amount)}` : '—'}</td>
                <td className={r.overdueCount ? 'text-red-600 font-medium' : 'text-muted-foreground'}>{r.overdueCount ? `${r.overdueCount} · ${formatCurrency(r.overdueAmount)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
