import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import { RangeBar, useLive, useRange, errMsg, fmtDT, fmtD } from './BrdLiveSheets';
import SheetTable, { type Col } from './SheetTable';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const Msg = ({ error, loading }: { error: string; loading: boolean }) =>
  error ? <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div> : loading ? <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p> : null;
const Tiles = ({ items }: { items: [string, string, string?][] }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {items.map(([l, v, c]) => <div key={l} className="border rounded-xl p-3 bg-card"><p className="text-xs text-muted-foreground">{l}</p><p className={`text-lg font-bold ${c || ''}`}>{v}</p></div>)}
  </div>
);
const Search = ({ q, setQ }: { q: string; setQ: (v: string) => void }) => (
  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student, advisor, phone, transaction ID…" className="w-full max-w-sm px-3 py-1.5 border rounded-lg text-sm bg-background" />
);
const match = (q: string, ...vals: (string | number | null | undefined)[]) => !q || vals.join(' ').toLowerCase().includes(q.toLowerCase());
const HEAD_BLUE = '#a4c2f4', HEAD_YEL = '#fff2cc', HEAD_PINK = '#ead1dc';

// ── Approval ──
interface ApRow { id: string; at: string; advisor: string; tl: string; selection: string; student: string; email: string; phone: string; course: string; courseFees: number; slot: string; courseType: string; source: string; amount: number; mode: string; reference: string; hasProof: boolean; amountMatched: boolean | null; ocrAmount: number | null; kind: string; status: string; approvedBy: string; approvedAt: string | null; rejectReason: string; month: string; onboarded: string }
interface ApData { rows: ApRow[]; totals: { count: number; amount: number; approved: number; withFinance: number; rejected: number } }
const ST_BG: Record<string, string> = { Approved: '#b6d7a8', 'With Finance': '#ffe599', Rejected: '#ea9999' };

const num = (n: number) => n.toLocaleString('en-IN');
const apCols = (openProof: (id: string) => void): Col<ApRow>[] => {
  const B = { bg: HEAD_BLUE }, Y = { bg: HEAD_YEL }, P = { bg: HEAD_PINK };
  return [
    { key: 'at', label: 'Timestamp', ...B, get: (x) => fmtDT(x.at), sortVal: (x) => x.at, cls: 'whitespace-nowrap' },
    { key: 'advisor', label: 'Advisor', ...B, get: (x) => x.advisor }, { key: 'tl', label: 'TL', ...B, get: (x) => x.tl },
    { key: 'sel', label: 'Selection', ...B, get: (x) => x.selection, cls: 'whitespace-nowrap' },
    { key: 'student', label: 'Student Name', ...B, get: (x) => x.student }, { key: 'email', label: 'Student Mail ID', ...B, get: (x) => x.email },
    { key: 'phone', label: 'Student Number', ...B, get: (x) => x.phone }, { key: 'course', label: 'Course', ...B, get: (x) => x.course },
    { key: 'fees', label: 'Course Fees', ...B, get: (x) => (x.courseFees ? num(x.courseFees) : ''), sortVal: (x) => x.courseFees, cls: 'text-right' },
    { key: 'ctype', label: 'Course Type', ...B, get: (x) => x.courseType, cls: 'whitespace-nowrap' }, { key: 'slot', label: 'Slot', ...B, get: (x) => x.slot },
    { key: 'source', label: 'Source', ...B, get: (x) => x.source },
    { key: 'kind', label: 'Payment For', ...Y, get: (x) => x.kind },
    { key: 'amount', label: 'Payment Amount', ...Y, get: (x) => num(x.amount), sortVal: (x) => x.amount, cls: 'text-right font-medium',
      render: (x) => <>{num(x.amount)}{x.amountMatched === false && <span className="text-red-600" title={`Screenshot shows ${inr(x.ocrAmount || 0)}`}> ⚠</span>}</> },
    { key: 'mode', label: 'Mode Of Payment', ...Y, get: (x) => x.mode, cls: 'whitespace-nowrap' }, { key: 'ref', label: 'Transaction ID', ...Y, get: (x) => x.reference },
    { key: 'proof', label: 'Screenshot', ...Y, noFilter: true, get: () => '', cls: 'text-center', render: (x) => (x.hasProof ? <button onClick={() => openProof(x.id)} className="text-blue-600 hover:underline">View</button> : '—') },
    { key: 'status', label: 'Status', ...P, get: (x) => x.status, cls: 'text-center font-semibold whitespace-nowrap', cellBg: (x) => ST_BG[x.status] },
    { key: 'by', label: 'Approved By', ...P, get: (x) => x.approvedBy }, { key: 'month', label: 'Month', ...P, get: (x) => x.month, cls: 'text-center' },
    { key: 'onb', label: 'Onboarding', ...P, get: (x) => x.onboarded, cls: 'text-center', cellBg: (x) => (x.onboarded === 'Yes' ? '#b6d7a8' : undefined) },
  ];
};

function Approval() {
  const r = useRange(false, true);
  const { data, error, loading, reload } = useLive<ApData>('REV_APPROVAL', r.params);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const openProof = async (id: string) => {
    try { const res = await api.get(`/api/report-sheets/proof/${id}`, { responseType: 'blob' }); window.open(URL.createObjectURL(res.data), '_blank'); }
    catch { window.alert('Screenshot not available'); }
  };
  const rows = (data?.rows || []).filter((x) => (!status || x.status === status) && match(q, x.student, x.advisor, x.tl, x.phone, x.reference, x.course));
  return (
    <div className="space-y-3">
      <RangeBar {...r} allowAll loading={loading} onReload={reload} />
      {data && <Tiles items={[['Payments', String(data.totals.count)], ['Amount', inr(data.totals.amount)], ['Approved', inr(data.totals.approved), 'text-green-700'], ['With Finance', inr(data.totals.withFinance), 'text-amber-700']]} />}
      <div className="flex flex-wrap gap-2 items-center">
        <Search q={q} setQ={setQ} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm bg-background"><option value="">All statuses</option><option>Approved</option><option>With Finance</option><option>Rejected</option></select>
      </div>
      <Msg error={error} loading={loading && !data} />
      {data && <SheetTable rows={rows} cols={apCols(openProof)} rowKey={(x) => x.id} empty="No payments in this range" />}
      <p className="text-[11px] text-muted-foreground">Every payment the sales team has submitted (registration, down payment, EMIs, other payments), with Finance's decision. Approve or reject in Finance (Sales) → Approvals.</p>
    </div>
  );
}

// ── Payment Details ──
interface PdRow { planId: string; date: string; month: string; year: number; totalFees: number; paid: number; awaiting: number; balance: number; discontinued: string; refund: string; advisor: string; tl: string; student: string; email: string; phone: string; course: string; courseFees: number; batchMonth: string; courseType: string; slot: string; batchConfirmation: string; studentId: string; emi: string; program: string; source: string }
interface PdData { rows: PdRow[]; totals: { count: number; total: number; paid: number; balance: number } }

const PD_COLS: Col<PdRow>[] = (() => {
  const C = { bg: '#00ffff' }, V = { bg: '#b4a7d6' }, Y = { bg: '#ffff00' };
  const yn = (v: string) => (v === 'Yes' ? '#f4cccc' : '#d9ead3');
  return [
    { key: 'date', label: 'Date', ...C, get: (x) => fmtD(x.date), sortVal: (x) => x.date, cls: 'whitespace-nowrap' }, { key: 'month', label: 'Month', ...C, get: (x) => x.month, cls: 'text-center' }, { key: 'year', label: 'Year', ...C, get: (x) => x.year, cls: 'text-center' },
    { key: 'total', label: 'Total Fees', ...C, get: (x) => num(x.totalFees), sortVal: (x) => x.totalFees, cls: 'text-right' },
    { key: 'paid', label: 'Paid', ...C, get: (x) => num(x.paid), sortVal: (x) => x.paid, cls: 'text-right', render: (x) => <>{num(x.paid)}{x.awaiting > 0 && <span className="text-[11px] text-amber-700"> (+{num(x.awaiting)})</span>}</> },
    { key: 'bal', label: 'Balance', ...C, get: (x) => num(x.balance), sortVal: (x) => x.balance, cls: 'text-right', cellBg: (x) => (x.balance > 0 ? '#f4cccc' : undefined) },
    { key: 'disc', label: 'Discontinued', ...C, get: (x) => x.discontinued, cls: 'text-center', cellBg: (x) => yn(x.discontinued) }, { key: 'refund', label: 'Refund', ...C, get: (x) => x.refund, cls: 'text-center', cellBg: (x) => yn(x.refund) },
    { key: 'advisor', label: 'Advisor', ...V, get: (x) => x.advisor }, { key: 'tl', label: 'TL', ...V, get: (x) => x.tl }, { key: 'student', label: 'Student Name', ...V, get: (x) => x.student },
    { key: 'email', label: 'Student Mail ID', ...V, get: (x) => x.email }, { key: 'phone', label: 'Student Number', ...V, get: (x) => x.phone }, { key: 'course', label: 'Course', ...V, get: (x) => x.course },
    { key: 'cf', label: 'Course Fees', ...V, get: (x) => (x.courseFees ? num(x.courseFees) : ''), sortVal: (x) => x.courseFees, cls: 'text-right' },
    { key: 'bm', label: 'Batch Month', ...V, get: (x) => x.batchMonth, cls: 'text-center' }, { key: 'ct', label: 'Course Type', ...V, get: (x) => x.courseType, cls: 'whitespace-nowrap' }, { key: 'slot', label: 'Slot', ...V, get: (x) => x.slot },
    { key: 'bc', label: 'Batch Confirmation', ...Y, get: (x) => x.batchConfirmation, cls: 'text-center', cellBg: (x) => (x.batchConfirmation ? '#b6d7a8' : undefined) },
    { key: 'sid', label: 'Student ID', ...Y, get: (x) => x.studentId, cls: 'text-center' }, { key: 'emi', label: 'EMI / Non EMI', ...Y, get: (x) => x.emi, cls: 'text-center' },
    { key: 'prog', label: 'Program', ...Y, get: (x) => x.program, cls: 'text-center' }, { key: 'source', label: 'Source', ...Y, get: (x) => x.source },
  ];
})();

function PaymentDetails() {
  const r = useRange(false, true);
  const { data, error, loading, reload } = useLive<PdData>('REV_PAYMENT_DETAILS', r.params);
  const [q, setQ] = useState('');
  const [balOnly, setBalOnly] = useState(false);
  const rows = (data?.rows || []).filter((x) => (!balOnly || x.balance > 0) && match(q, x.student, x.advisor, x.tl, x.phone, x.studentId, x.course));
  return (
    <div className="space-y-3">
      <RangeBar {...r} allowAll loading={loading} onReload={reload} />
      {data && <Tiles items={[['Students', String(data.totals.count)], ['Total fees', inr(data.totals.total)], ['Paid (approved)', inr(data.totals.paid), 'text-green-700'], ['Balance', inr(data.totals.balance), 'text-red-600']]} />}
      <div className="flex flex-wrap gap-3 items-center">
        <Search q={q} setQ={setQ} />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={balOnly} onChange={(e) => setBalOnly(e.target.checked)} /> Only with balance</label>
      </div>
      <Msg error={error} loading={loading && !data} />
      {data && <SheetTable rows={rows} cols={PD_COLS} rowKey={(x) => x.planId} empty="No students in this range" />}
      <p className="text-[11px] text-muted-foreground">One line per student fee plan. Paid counts only what Finance has approved (payments still with Finance are shown in brackets). Batch Confirmation, Student ID and Program come from the student record once they are enrolled.</p>
    </div>
  );
}

// ── Loan ──
interface LnRow { id: string; studentName: string; phone: string | null; email: string | null; paymentFor: string; paidOn: string; emiAmount: number; interestAmount: number; vinsupAmount: number; transactionId: string | null; lender: string | null; batch: string | null; mode: string | null; comments: string | null; verified: boolean }
interface LnData { rows: LnRow[]; totals: { count: number; emi: number; interest: number; vinsup: number; verified: number } }
const LOAN_MODES = ['Account Transfer', 'POS Machine ( Scan Payment )', 'POS Machine ( Debit Card Payment )', 'POS Machine ( Credit Card Payment )', 'Cash'];

const patchLoan = (id: string, body: Record<string, string>) => api.patch(`/api/report-sheets/loan/${id}`, body);
const lnCols = (canEdit: boolean, canAdmin: boolean, toggle: (x: LnRow) => void, del: (x: LnRow) => void): Col<LnRow>[] => {
  const B = { bg: HEAD_BLUE }, Y = { bg: HEAD_YEL };
  const txt = (key: string, label: string, f: keyof LnRow & string, cls = ''): Col<LnRow> => ({ key, label, ...B, get: (x) => String(x[f] ?? ''), cls, edit: (x, v) => patchLoan(x.id, { [f]: v }) });
  const amt = (key: string, label: string, f: 'emiAmount' | 'interestAmount' | 'vinsupAmount', extra = ''): Col<LnRow> => ({ key, label, ...B, get: (x) => num(x[f]), sortVal: (x) => x[f], cls: `text-right ${extra}`, editVal: (x) => String(x[f]), edit: (x, v) => patchLoan(x.id, { [f]: v }) });
  const cols: Col<LnRow>[] = [
    { key: 'paidOn', label: 'Payment Date', ...B, get: (x) => fmtD(x.paidOn), sortVal: (x) => x.paidOn, cls: 'whitespace-nowrap', editVal: (x) => x.paidOn.slice(0, 10), edit: (x, v) => patchLoan(x.id, { paidOn: v }) },
    txt('name', 'Student Name', 'studentName'), txt('phone', 'Phone', 'phone'), txt('for', 'Payment For', 'paymentFor'),
    amt('emi', 'EMI Amount', 'emiAmount'), amt('int', 'Interest Amount', 'interestAmount'), amt('vin', 'Vinsup Amount', 'vinsupAmount', 'font-medium'),
    txt('txn', 'Transaction ID', 'transactionId'), txt('lender', 'Lender', 'lender'), txt('batch', 'Batch', 'batch'), txt('mode', 'Mode Of Payment', 'mode', 'whitespace-nowrap'), txt('comments', 'Comments', 'comments', 'max-w-[240px]'),
    { key: 'ver', label: 'Verification', ...Y, get: (x) => (x.verified ? 'Verified' : 'Pending'), cls: 'text-center', render: (x) => <input type="checkbox" checked={x.verified} disabled={!canAdmin} onChange={() => toggle(x)} /> },
  ];
  if (canAdmin) cols.push({ key: 'del', label: '', ...Y, noFilter: true, get: () => '', render: (x) => <button onClick={() => del(x)} className="text-xs text-red-600 hover:underline">Delete</button> });
  void canEdit;
  return cols;
};

function Loan({ canEdit, canAdmin }: { canEdit: boolean; canAdmin: boolean }) {
  const r = useRange(false, true);
  const { data, error, loading, reload } = useLive<LnData>('REV_LOAN', r.params);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const rows = (data?.rows || []).filter((x) => match(q, x.studentName, x.phone, x.transactionId, x.lender, x.paymentFor));
  const toggle = async (x: LnRow) => { try { await api.put(`/api/report-sheets/loan/${x.id}/verify`, { verified: !x.verified }); reload(); } catch (e) { window.alert(errMsg(e, 'Could not update')); } };
  const del = async (x: LnRow) => { if (!window.confirm(`Delete the ${x.paymentFor} entry for ${x.studentName}?`)) return; try { await api.delete(`/api/report-sheets/loan/${x.id}`); reload(); } catch (e) { window.alert(errMsg(e, 'Could not delete')); } };
  return (
    <div className="space-y-3">
      <RangeBar {...r} allowAll loading={loading} onReload={reload} />
      {data && <Tiles items={[['Entries', String(data.totals.count)], ['EMI amount', inr(data.totals.emi)], ['Interest', inr(data.totals.interest), 'text-red-600'], ['Vinsup amount', inr(data.totals.vinsup), 'text-green-700']]} />}
      <div className="flex flex-wrap gap-3 items-center">
        <Search q={q} setQ={setQ} />
        {canEdit && <button onClick={() => setAdding(true)} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white">+ Add loan payment</button>}
      </div>
      <Msg error={error} loading={loading && !data} />
      {data && <SheetTable rows={rows} cols={lnCols(canEdit, canAdmin, toggle, del)} rowKey={(x) => x.id} empty="No loan payments in this range" canEdit={canEdit} onChanged={reload} />}
      {data && canEdit && <p className="text-[11px] text-muted-foreground">Double-click any cell to edit it.</p>}
      {adding && <LoanForm onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function LoanForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ studentName: '', phone: '', email: '', paymentFor: 'EMI - 1', paidOn: new Date().toISOString().slice(0, 10), emiAmount: '', interestAmount: '', transactionId: '', lender: '', batch: '', mode: 'Account Transfer', comments: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const vinsup = Math.max(0, (Number(f.emiAmount) || 0) - (Number(f.interestAmount) || 0));
  const save = async () => {
    setErr(''); setSaving(true);
    try { await api.post('/api/report-sheets/loan', { ...f, vinsupAmount: vinsup }); onDone(); } catch (e) { setErr(errMsg(e, 'Could not save')); } finally { setSaving(false); }
  };
  const inp = 'mt-1 w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-background';
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 space-y-3">
        <div className="flex justify-between"><h3 className="font-semibold text-lg">Add loan payment</h3><button onClick={onClose}>×</button></div>
        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground col-span-2">Student name<input value={f.studentName} onChange={(e) => set('studentName', e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted-foreground">Phone<input value={f.phone} onChange={(e) => set('phone', e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted-foreground">Email<input value={f.email} onChange={(e) => set('email', e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted-foreground">Payment for<input value={f.paymentFor} onChange={(e) => set('paymentFor', e.target.value)} className={inp} placeholder="EMI - 1 / Processing Fees" /></label>
          <label className="text-xs text-muted-foreground">Payment date<input type="date" value={f.paidOn} onChange={(e) => set('paidOn', e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted-foreground">EMI amount (₹)<input type="number" value={f.emiAmount} onChange={(e) => set('emiAmount', e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted-foreground">Interest amount (₹)<input type="number" value={f.interestAmount} onChange={(e) => set('interestAmount', e.target.value)} className={inp} /></label>
          <p className="col-span-2 text-xs">Vinsup amount (EMI − interest): <b>{inr(vinsup)}</b></p>
          <label className="text-xs text-muted-foreground">Transaction ID<input value={f.transactionId} onChange={(e) => set('transactionId', e.target.value)} className={inp} /></label>
          <label className="text-xs text-muted-foreground">Lender<input value={f.lender} onChange={(e) => set('lender', e.target.value)} className={inp} placeholder="SR Bankers" /></label>
          <label className="text-xs text-muted-foreground">Batch<input value={f.batch} onChange={(e) => set('batch', e.target.value)} className={inp} placeholder="Apr 26" /></label>
          <label className="text-xs text-muted-foreground">Mode of payment<select value={f.mode} onChange={(e) => set('mode', e.target.value)} className={inp}>{LOAN_MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className="text-xs text-muted-foreground col-span-2">Comments<input value={f.comments} onChange={(e) => set('comments', e.target.value)} className={inp} /></label>
        </div>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Cancel</button><button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button></div>
      </div>
    </div>
  );
}

// ── Jodo ──
interface JdRow { id: string; paymentRef: string; jodoStudentId: string | null; studentName: string; rollNumber: string | null; stream: string | null; grade: string | null; product: string | null; payMode: string | null; amount: number; feeAmount: number | null; paidDate: string | null; settlementUtr: string | null; settlementBank: string | null; settlementDate: string | null; phone: string | null; leadId: string | null; matchedStudent: string; advisor: string; portalPayment: string }
interface JdData { rows: JdRow[]; totals: { count: number; amount: number; fee: number; unmatched: number } }

// Header names in the JODO export → our fields (matched loosely, lower-case).
const JODO_COLS: [string, string[]][] = [
  ['paymentRef', ['payment reference']], ['jodoStudentId', ['jodo student id']], ['studentName', ['student name']], ['rollNumber', ['roll number']], ['instituteName', ['institute']],
  ['stream', ['stream']], ['grade', ['grade']], ['product', ['jodo product']], ['payMode', ['payment mode']], ['amount', ['transaction amount']], ['feeAmount', ['amount (utr']],
  ['paidDate', ['paid date']], ['settlementUtr', ['settlement utr']], ['settlementBank', ['settlement bank']], ['phone', ['phone']], ['settlementDate', ['date']],
];
const cellDate = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString() : ''; }
  return v ? String(v) : '';
};

const JD_COLS: Col<JdRow>[] = (() => {
  const B = { bg: HEAD_BLUE }, O = { bg: '#fce5cd' }, G = { bg: '#d9ead3' };
  const d = (v: string | null) => (v ? fmtD(v) : '');
  return [
    { key: 'name', label: 'Student Name', ...B, get: (x) => x.studentName }, { key: 'stream', label: 'Stream', ...B, get: (x) => x.stream || '' }, { key: 'grade', label: 'Grade', ...B, get: (x) => x.grade || '' },
    { key: 'roll', label: 'Roll Number', ...B, get: (x) => x.rollNumber || '' }, { key: 'jid', label: 'Jodo Student ID', ...B, get: (x) => x.jodoStudentId || '' },
    { key: 'amt', label: 'Amount (₹)', ...B, get: (x) => num(x.amount), sortVal: (x) => x.amount, cls: 'text-right' },
    { key: 'fee', label: 'Fee (₹)', ...B, get: (x) => (x.feeAmount != null ? num(x.feeAmount) : ''), sortVal: (x) => x.feeAmount ?? 0, cls: 'text-right' },
    { key: 'paid', label: 'Paid Date', ...B, get: (x) => d(x.paidDate), sortVal: (x) => x.paidDate || '', cls: 'whitespace-nowrap' }, { key: 'ref', label: 'Payment Reference Id', ...B, get: (x) => x.paymentRef },
    { key: 'prod', label: 'Product', ...B, get: (x) => x.product || '', cls: 'text-center' }, { key: 'pm', label: 'Mode', ...B, get: (x) => x.payMode || '', cls: 'text-center' },
    { key: 'utr', label: 'Settlement UTR', ...O, get: (x) => x.settlementUtr || '' }, { key: 'bank', label: 'Bank', ...O, get: (x) => x.settlementBank || '' }, { key: 'phone', label: 'Phone', ...O, get: (x) => x.phone || '' },
    { key: 'sd', label: 'Settled On', ...O, get: (x) => d(x.settlementDate), sortVal: (x) => x.settlementDate || '', cls: 'whitespace-nowrap' },
    { key: 'ms', label: 'Matched Student', ...G, get: (x) => x.matchedStudent || 'Not found', cellBg: (x) => (x.leadId ? undefined : '#f4cccc') },
    { key: 'adv', label: 'Advisor', ...G, get: (x) => x.advisor }, { key: 'pp', label: 'In Portal', ...G, get: (x) => x.portalPayment || '—', cls: 'text-center', cellBg: (x) => (x.portalPayment ? '#b6d7a8' : undefined) },
  ];
})();

function Jodo({ canEdit }: { canEdit: boolean }) {
  const r = useRange(false, true);
  const { data, error, loading, reload } = useLive<JdData>('REV_JODO', r.params);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const rows = (data?.rows || []).filter((x) => match(q, x.studentName, x.phone, x.paymentRef, x.settlementUtr, x.matchedStudent));

  const onFile = async (f: File | null) => {
    if (!f) return;
    setBusy(true); setMsg('');
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (raw.length === 0) throw new Error('The file has no rows');
      const headers = Object.keys(raw[0]);
      const pick = (needles: string[], used: Set<string>) => headers.find((h) => !used.has(h) && needles.some((n) => h.toLowerCase().includes(n)));
      const map: Record<string, string> = {};
      const used = new Set<string>();
      for (const [field, needles] of JODO_COLS) {
        // "Date" is the settlement date: only an exact "date" header, never "Paid Date".
        const h = field === 'settlementDate' ? headers.find((x) => x.trim().toLowerCase() === 'date' && !used.has(x)) : pick(needles, used);
        if (h) { map[field] = h; used.add(h); }
      }
      if (!map.paymentRef || !map.amount) throw new Error('Could not find the "Payment Reference Id" and "Transaction Amount" columns in this file');
      const payload = raw.map((row) => {
        const o: Record<string, unknown> = {};
        for (const [field, h] of Object.entries(map)) o[field] = ['paidDate', 'settlementDate'].includes(field) ? cellDate(row[h]) : row[h];
        return o;
      });
      const res = await api.post('/api/report-sheets/jodo/import', { rows: payload });
      const d = res.data.data as { added: number; skipped: number; matched: number };
      setMsg(`Imported ${d.added} new settlement${d.added === 1 ? '' : 's'} (${d.matched} matched to a student). ${d.skipped} already existed.`);
      reload();
    } catch (e) { setMsg(errMsg(e, (e as Error).message || 'Could not import the file')); }
    finally { setBusy(false); if (file.current) file.current.value = ''; }
  };

  return (
    <div className="space-y-3">
      <RangeBar {...r} allowAll loading={loading} onReload={reload} />
      {data && <Tiles items={[['Settlements', String(data.totals.count)], ['Amount', inr(data.totals.amount)], ['JODO fee', inr(data.totals.fee), 'text-red-600'], ['No student found', String(data.totals.unmatched), data.totals.unmatched ? 'text-amber-700' : '']]} />}
      <div className="flex flex-wrap gap-3 items-center">
        <Search q={q} setQ={setQ} />
        {canEdit && (
          <>
            <input ref={file} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
            <button onClick={() => file.current?.click()} disabled={busy} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{busy ? 'Importing…' : 'Import JODO file'}</button>
          </>
        )}
      </div>
      {msg && <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-4 py-2">{msg}</div>}
      <Msg error={error} loading={loading && !data} />
      {data && <SheetTable rows={rows} cols={JD_COLS} rowKey={(x) => x.id} empty="No JODO settlements in this range — import the JODO file" />}
      <p className="text-[11px] text-muted-foreground">Import the settlement file from JODO (Excel/CSV). Lines already imported are skipped. Each line is matched to a student by phone number; "In Portal" shows whether a JODO payment with the same reference was entered in the sales Fees tab.</p>
    </div>
  );
}

export default function RevenueSheet({ liveKey, canEdit, canAdmin }: { liveKey: string; canEdit: boolean; canAdmin: boolean }) {
  switch (liveKey) {
    case 'REV_APPROVAL': return <Approval />;
    case 'REV_PAYMENT_DETAILS': return <PaymentDetails />;
    case 'REV_LOAN': return <Loan canEdit={canEdit} canAdmin={canAdmin} />;
    case 'REV_JODO': return <Jodo canEdit={canEdit} />;
    default: return <p className="text-sm text-muted-foreground">Unknown report.</p>;
  }
}
