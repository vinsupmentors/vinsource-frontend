import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import {
  UserPlus, ClipboardList, CalendarClock, Tags, Wallet, Settings2, X, Loader2,
  Search, CheckCircle2, PlusCircle,
} from 'lucide-react';

function errMsg(err: unknown, fallback: string) {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || fallback;
}

function money(n: number | null | undefined) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Shared primitives ────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex flex-col overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm';

// ── Types ────────────────────────────────────────────────────────────────────
const TRACKS = ['JRP_RECORDED', 'JRP', 'IOP', 'PT', 'ELITE'] as const;
type Track = (typeof TRACKS)[number];
const TRACK_LABELS: Record<Track, string> = {
  JRP_RECORDED: 'JRP Recorded',
  JRP: 'JRP',
  IOP: 'IOP',
  PT: 'PT',
  ELITE: 'Elite',
};

type PaymentMethod = 'SPOT' | 'FULL' | 'PART' | 'EMI';
const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'SPOT', label: 'Spot (same day, 8% off)' },
  { id: 'FULL', label: 'Full (before batch start, 5% off)' },
  { id: 'PART', label: 'Part Payment' },
  { id: 'EMI', label: 'EMI' },
];

interface Course { id: string; name: string }
interface SeatInfo { total: number | null; booked: number; available: number | null; status: 'OPEN' | 'LIMITED' | 'ALMOST_FULL' | 'FULL' }
interface Schedule {
  id: string; code: string | null; timing: string; startDate: string;
  course: { id: string; name: string };
  batch: { id: string; code: string };
  seats: SeatInfo;
}
interface FeeBreakdown {
  baseFee: number; couponCode: string | null; couponDiscount: number; netCourseFee: number; paymentMethod: PaymentMethod;
  paymentDiscountPct?: number; paymentDiscountAmount?: number; finalPayable?: number;
  registrationFee?: number; orientationBalance?: number;
  interestRatePct?: number; interestAmount?: number; emiTotal?: number; downPaymentPct?: number; downPayment?: number;
  emiBalance?: number; emiMonths?: number; monthlyInstallments?: number[];
}
interface Admission {
  id: string; admissionId: string; admissionStatus: string; planType: PaymentMethod; totalFee: number;
  couponDiscount: number | null; paymentStatus: string; totalPaid: number; balance: number; createdAt: string;
  lead: { name: string; phone: string; email: string | null };
  course: { id: string; name: string } | null; track: string | null;
  schedule: { id: string; code: string | null; batch: { code: string } } | null;
  coupon: { code: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
}
interface Coupon {
  id: string; code: string; name: string; discountType: 'FIXED' | 'PERCENTAGE'; discountValue: number;
  status: 'ACTIVE' | 'INACTIVE'; validFrom: string; validUntil: string; maxUsage: number | null;
  course: { name: string } | null; _count?: { usages: number };
}
interface CourseFee { id: string; course: { name: string }; track: string; baseFee: number; effectiveDate: string; isActive: boolean }
interface AdmissionConfig {
  spotDiscountPct: number; fullDiscountPct: number; registrationFee: number;
  emiInterest3To4MonthPct: number; emiInterest5PlusMonthPct: number; downPaymentPct: number;
  portalApprovalMinPaidPct: number; trackEmiMonthLimits: Record<string, number>;
}

type Tab = 'new' | 'list' | 'batches' | 'coupons' | 'fees' | 'config';
const VALID_TABS: Tab[] = ['new', 'list', 'batches', 'coupons', 'fees', 'config'];
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }[] = [
  { id: 'new', label: 'New Admission', icon: UserPlus },
  { id: 'list', label: 'Admissions', icon: ClipboardList },
  { id: 'batches', label: 'Upcoming Batches', icon: CalendarClock },
  { id: 'coupons', label: 'Coupons', icon: Tags },
  { id: 'fees', label: 'Course Fees', icon: Wallet, adminOnly: true },
  { id: 'config', label: 'Config', icon: Settings2, adminOnly: true },
];

export default function AdmissionPage() {
  const { hasModule } = useModuleAccess();
  const canEdit = hasModule('ADMISSION', 'EDIT');
  const canAdmin = hasModule('ADMISSION', 'ADMIN');

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab>(tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'new');
  const setTab = (t: Tab) => { setTabState(t); setSearchParams({ tab: t }, { replace: true }); };
  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== tab) setTabState(tabFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  const [error, setError] = useState('');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admission</h1>
        <p className="text-muted-foreground text-sm">Enroll new students, calculate fees, track batch seats, and manage coupons.</p>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.filter((t) => !t.adminOnly || canAdmin).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center justify-between">
          {error}<button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {tab === 'new' && <NewAdmissionTab canEdit={canEdit} setError={setError} />}
      {tab === 'list' && <AdmissionsListTab setError={setError} />}
      {tab === 'batches' && <BatchesTab setError={setError} />}
      {tab === 'coupons' && <CouponsTab canEdit={canEdit} setError={setError} />}
      {tab === 'fees' && canAdmin && <CourseFeesTab setError={setError} />}
      {tab === 'config' && canAdmin && <ConfigTab setError={setError} />}
    </div>
  );
}

// ── New Admission tab ────────────────────────────────────────────────────────
function NewAdmissionTab({ canEdit, setError }: { canEdit: boolean; setError: (s: string) => void }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [degree, setDegree] = useState('');
  const [college, setCollege] = useState('');
  const [passedOutYear, setPassedOutYear] = useState('');
  const [currentStatus, setCurrentStatus] = useState('');

  const [courseId, setCourseId] = useState('');
  const [track, setTrack] = useState<Track | ''>('');
  const [scheduleId, setScheduleId] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('SPOT');
  const [emiMonths, setEmiMonths] = useState(3);

  const [breakdown, setBreakdown] = useState<FeeBreakdown | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState('');

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<Admission | null>(null);

  useEffect(() => {
    api.get('/api/admissions/courses').then((r) => setCourses(r.data.data)).catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    if (!courseId) { setSchedules([]); return; }
    api.get('/api/admissions/batches/upcoming', { params: { courseId } })
      .then((r) => setSchedules(r.data.data))
      .catch(() => setSchedules([]));
  }, [courseId]);

  const calculate = useCallback(() => {
    if (!courseId || !track || !paymentMethod) return;
    setCalculating(true);
    setCalcError('');
    api.post('/api/admissions/calculate-fee', {
      courseId, track, scheduleId: scheduleId || undefined,
      couponCode: couponCode || undefined, paymentMethod,
      emiMonths: paymentMethod === 'EMI' ? emiMonths : undefined,
    })
      .then((r) => {
        setBreakdown(r.data.data);
        const due = r.data.data.finalPayable ?? r.data.data.registrationFee ?? r.data.data.downPayment ?? 0;
        setPaymentAmount(String(due));
      })
      .catch((err) => { setBreakdown(null); setCalcError(errMsg(err, 'Could not calculate fee.')); })
      .finally(() => setCalculating(false));
  }, [courseId, track, scheduleId, couponCode, paymentMethod, emiMonths]);

  useEffect(() => { calculate(); }, [calculate]);

  const canSubmit = canEdit && name.trim() && phone.trim() && courseId && track && scheduleId && breakdown && !calcError;

  const submit = () => {
    if (!canSubmit) return;
    setSaving(true);
    api.post('/api/admissions', {
      newLead: { name, phone, email: email || undefined, city: city || undefined, degree: degree || undefined, college: college || undefined, passedOutYear: passedOutYear || undefined, currentStatus: currentStatus || undefined },
      courseId, track, scheduleId, couponCode: couponCode || undefined, paymentMethod,
      emiMonths: paymentMethod === 'EMI' ? emiMonths : undefined,
      payment: { amount: Number(paymentAmount || 0), mode: paymentMode },
    })
      .then((r) => {
        setSuccess(r.data.data);
        setName(''); setPhone(''); setEmail(''); setCity(''); setDegree(''); setCollege(''); setPassedOutYear(''); setCurrentStatus('');
        setCourseId(''); setTrack(''); setScheduleId(''); setCouponCode(''); setPaymentMethod('SPOT'); setBreakdown(null); setPaymentAmount('');
      })
      .catch((err) => setError(errMsg(err, 'Could not create the admission.')))
      .finally(() => setSaving(false));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-green-800">Admission {success.admissionId} confirmed.</p>
              <p className="text-green-700">The payment is awaiting Admin approval in Finance (Sales) before the receipt is emailed.</p>
            </div>
            <button onClick={() => setSuccess(null)} className="ml-auto"><X className="w-4 h-4 text-green-700" /></button>
          </div>
        )}

        <div className="border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm">Student Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Mobile Number *"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="Email"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="City"><input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
            <Field label="Degree"><input className={inputCls} value={degree} onChange={(e) => setDegree(e.target.value)} /></Field>
            <Field label="College"><input className={inputCls} value={college} onChange={(e) => setCollege(e.target.value)} /></Field>
            <Field label="Passed Out Year"><input className={inputCls} value={passedOutYear} onChange={(e) => setPassedOutYear(e.target.value)} /></Field>
            <Field label="Current Status"><input className={inputCls} value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)} /></Field>
          </div>
        </div>

        <div className="border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm">Course, Track &amp; Batch</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Course *">
              <select className={inputCls} value={courseId} onChange={(e) => { setCourseId(e.target.value); setScheduleId(''); }}>
                <option value="">Select course</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Track *">
              <select className={inputCls} value={track} onChange={(e) => setTrack(e.target.value as Track)}>
                <option value="">Select track</option>
                {TRACKS.map((t) => <option key={t} value={t}>{TRACK_LABELS[t]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Batch *">
            <select className={inputCls} value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} disabled={!courseId}>
              <option value="">{courseId ? 'Select batch' : 'Select a course first'}</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.batch.code}{s.code ? ` / ${s.code}` : ''} — {s.timing} — starts {formatDate(s.startDate)}
                  {s.seats.total != null ? ` — ${s.seats.available}/${s.seats.total} seats left` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm">Payment</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Coupon Code">
              <input className={inputCls} value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Optional" />
            </Field>
            <Field label="Payment Method *">
              <select className={inputCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            {paymentMethod === 'EMI' && (
              <Field label="EMI Duration (months)">
                <input type="number" min={1} className={inputCls} value={emiMonths} onChange={(e) => setEmiMonths(Number(e.target.value))} />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount Collected Now">
              <input type="number" className={inputCls} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
            </Field>
            <Field label="Payment Mode">
              <select className={inputCls} value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                {['CASH', 'UPI', 'CARD', 'NET_BANKING', 'CHEQUE', 'OTHER'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {canEdit ? (
          <button onClick={submit} disabled={!canSubmit || saving} className="px-5 py-2.5 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Confirming...' : 'Confirm Admission'}
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">You have view-only access to Admission — confirming a new admission needs Edit access.</p>
        )}
      </div>

      <div className="lg:col-span-1">
        <div className="border rounded-xl p-5 sticky top-6 space-y-3">
          <h3 className="font-semibold text-sm">Fee Breakdown {calculating && <Loader2 className="w-3.5 h-3.5 inline animate-spin ml-1" />}</h3>
          {calcError && <p className="text-xs text-red-600">{calcError}</p>}
          {!breakdown && !calcError && <p className="text-xs text-muted-foreground">Select a course, track, and payment method to see the fee.</p>}
          {breakdown && (
            <div className="text-sm space-y-1.5">
              <Row label="Base Fee" value={money(breakdown.baseFee)} />
              {breakdown.couponDiscount > 0 && <Row label={`Coupon (${breakdown.couponCode})`} value={`− ${money(breakdown.couponDiscount)}`} />}
              <Row label="Net Course Fee" value={money(breakdown.netCourseFee)} bold />
              {breakdown.paymentDiscountAmount != null && (
                <Row label={`${paymentMethod === 'SPOT' ? 'Spot' : 'Full'} Discount (${breakdown.paymentDiscountPct}%)`} value={`− ${money(breakdown.paymentDiscountAmount)}`} />
              )}
              {breakdown.finalPayable != null && <Row label="Payable Now" value={money(breakdown.finalPayable)} bold highlight />}
              {breakdown.registrationFee != null && (
                <>
                  <Row label="Registration Fee (now)" value={money(breakdown.registrationFee)} bold highlight />
                  <Row label="Orientation Balance (later)" value={money(breakdown.orientationBalance)} />
                </>
              )}
              {breakdown.interestAmount != null && (
                <>
                  <Row label={`Interest (${breakdown.interestRatePct}%)`} value={money(breakdown.interestAmount)} />
                  <Row label="EMI Total" value={money(breakdown.emiTotal)} />
                  <Row label={`Down Payment (${breakdown.downPaymentPct}%, now)`} value={money(breakdown.downPayment)} bold highlight />
                  <Row label="EMI Balance" value={money(breakdown.emiBalance)} />
                  {breakdown.monthlyInstallments && (
                    <div className="pt-1 text-xs text-muted-foreground">
                      {breakdown.monthlyInstallments.map((m, i) => (
                        <div key={i} className="flex justify-between"><span>EMI {i + 1}</span><span>{money(m)}</span></div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''} ${highlight ? 'text-blue-700' : ''}`}>
      <span className={bold ? '' : 'text-muted-foreground'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ── Admissions list tab ──────────────────────────────────────────────────────
function AdmissionsListTab({ setError }: { setError: (s: string) => void }) {
  const [rows, setRows] = useState<Admission[] | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    api.get('/api/admissions', { params: search ? { search } : {} })
      .then((r) => setRows(r.data.data))
      .catch((err) => setError(errMsg(err, 'Could not load admissions.')));
  }, [search, setError]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className={`${inputCls} pl-9`} placeholder="Search by name, phone, or admission ID" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {rows === null ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No admissions yet.</p>
      ) : (
        <div className="border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Admission ID</th>
                <th className="text-left px-4 py-2">Student</th>
                <th className="text-left px-4 py-2">Course / Track</th>
                <th className="text-left px-4 py-2">Batch</th>
                <th className="text-left px-4 py-2">Method</th>
                <th className="text-left px-4 py-2">Paid / Balance</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2.5 font-medium">{a.admissionId}</td>
                  <td className="px-4 py-2.5">{a.lead.name}<div className="text-xs text-muted-foreground">{a.lead.phone}</div></td>
                  <td className="px-4 py-2.5">{a.course?.name || '—'}<div className="text-xs text-muted-foreground">{a.track}</div></td>
                  <td className="px-4 py-2.5">{a.schedule?.batch.code || '—'}</td>
                  <td className="px-4 py-2.5">{a.planType}</td>
                  <td className="px-4 py-2.5">{money(a.totalPaid)} / {money(a.balance)}</td>
                  <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{a.admissionStatus}</span></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Upcoming Batches tab ─────────────────────────────────────────────────────
const SEAT_STYLES: Record<SeatInfo['status'], string> = {
  OPEN: 'bg-green-50 text-green-700 border-green-200',
  LIMITED: 'bg-amber-50 text-amber-700 border-amber-200',
  ALMOST_FULL: 'bg-orange-50 text-orange-700 border-orange-200',
  FULL: 'bg-red-50 text-red-700 border-red-200',
};
const SEAT_LABELS: Record<SeatInfo['status'], string> = { OPEN: 'Available', LIMITED: 'Limited', ALMOST_FULL: 'Almost Full', FULL: 'Full' };

function BatchesTab({ setError }: { setError: (s: string) => void }) {
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);

  useEffect(() => {
    api.get('/api/admissions/batches/upcoming', { params: { includeFull: 'true' } })
      .then((r) => setSchedules(r.data.data))
      .catch((err) => setError(errMsg(err, 'Could not load batches.')));
  }, [setError]);

  if (schedules === null) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>;
  if (schedules.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">No upcoming batches configured.</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {schedules.map((s) => (
        <div key={s.id} className={`border rounded-xl p-4 space-y-2 ${SEAT_STYLES[s.seats.status]}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-sm text-foreground">{s.batch.code}{s.code ? ` / ${s.code}` : ''}</p>
              <p className="text-xs text-muted-foreground">{s.course.name}</p>
            </div>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full border">{SEAT_LABELS[s.seats.status]}</span>
          </div>
          <p className="text-xs text-muted-foreground">{s.timing} · Starts {formatDate(s.startDate)}</p>
          <p className="text-sm font-medium">
            {s.seats.total != null ? `${s.seats.available} of ${s.seats.total} seats available` : 'Unlimited seats'}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Coupons tab ───────────────────────────────────────────────────────────────
function CouponsTab({ canEdit, setError }: { canEdit: boolean; setError: (s: string) => void }) {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    api.get('/api/admissions/coupons').then((r) => setCoupons(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load coupons.')));
  }, [setError]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {canEdit && (
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white inline-flex items-center gap-1.5">
          <PlusCircle className="w-4 h-4" /> New Coupon
        </button>
      )}
      {showAdd && <AddCouponModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} setError={setError} />}

      {coupons === null ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
      ) : coupons.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No coupons yet.</p>
      ) : (
        <div className="border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Code</th>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Discount</th>
                <th className="text-left px-4 py-2">Scope</th>
                <th className="text-left px-4 py-2">Valid</th>
                <th className="text-left px-4 py-2">Usage</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 font-medium">{c.code}</td>
                  <td className="px-4 py-2.5">{c.name}</td>
                  <td className="px-4 py-2.5">{c.discountType === 'FIXED' ? money(c.discountValue) : `${c.discountValue}%`}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.course?.name || 'All courses'}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(c.validFrom)} – {formatDate(c.validUntil)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{c._count?.usages ?? 0}{c.maxUsage ? ` / ${c.maxUsage}` : ''}</td>
                  <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs ${c.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddCouponModal({ onClose, onSaved, setError }: { onClose: () => void; onSaved: () => void; setError: (s: string) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENTAGE'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [maxUsage, setMaxUsage] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = () => {
    if (!code || !name || !discountValue || !validFrom || !validUntil) return;
    setSaving(true);
    api.post('/api/admissions/coupons', {
      code, name, discountType, discountValue: Number(discountValue),
      validFrom, validUntil, maxUsage: maxUsage || undefined,
    })
      .then(onSaved)
      .catch((err) => setError(errMsg(err, 'Could not create coupon.')))
      .finally(() => setSaving(false));
  };

  return (
    <Modal title="New Coupon" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code *"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
        <Field label="Name *"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Discount Type">
          <select className={inputCls} value={discountType} onChange={(e) => setDiscountType(e.target.value as 'FIXED' | 'PERCENTAGE')}>
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED">Fixed Amount</option>
          </select>
        </Field>
        <Field label="Discount Value *"><input type="number" className={inputCls} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} /></Field>
        <Field label="Valid From *"><input type="date" className={inputCls} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></Field>
        <Field label="Valid Until *"><input type="date" className={inputCls} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
        <Field label="Max Usage"><input type="number" className={inputCls} value={maxUsage} onChange={(e) => setMaxUsage(e.target.value)} placeholder="Unlimited" /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Create Coupon'}</button>
      </div>
    </Modal>
  );
}

// ── Course Fees tab (Admin only) ─────────────────────────────────────────────
function CourseFeesTab({ setError }: { setError: (s: string) => void }) {
  const [fees, setFees] = useState<CourseFee[] | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [track, setTrack] = useState<Track | ''>('');
  const [baseFee, setBaseFee] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get('/api/admissions/course-fees').then((r) => setFees(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load course fees.')));
  }, [setError]);
  useEffect(() => { load(); api.get('/api/admissions/courses').then((r) => setCourses(r.data.data)).catch(() => setCourses([])); }, [load]);

  const submit = () => {
    if (!courseId || !track || !baseFee) return;
    setSaving(true);
    api.post('/api/admissions/course-fees', { courseId, track, baseFee: Number(baseFee) })
      .then(() => { setShowAdd(false); setCourseId(''); setTrack(''); setBaseFee(''); load(); })
      .catch((err) => setError(errMsg(err, 'Could not save fee.')))
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setShowAdd(true)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white inline-flex items-center gap-1.5">
        <PlusCircle className="w-4 h-4" /> New Course Fee
      </button>
      {showAdd && (
        <Modal title="New Course Fee" onClose={() => setShowAdd(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Course *">
              <select className={inputCls} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Select course</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Track *">
              <select className={inputCls} value={track} onChange={(e) => setTrack(e.target.value as Track)}>
                <option value="">Select track</option>
                {TRACKS.map((t) => <option key={t} value={t}>{TRACK_LABELS[t]}</option>)}
              </select>
            </Field>
            <Field label="Base Fee (₹) *"><input type="number" className={inputCls} value={baseFee} onChange={(e) => setBaseFee(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {fees === null ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
      ) : fees.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No course fees configured yet — Admission cannot calculate a fee until one exists for each course/track.</p>
      ) : (
        <div className="border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Course</th>
                <th className="text-left px-4 py-2">Track</th>
                <th className="text-left px-4 py-2">Base Fee</th>
                <th className="text-left px-4 py-2">Effective From</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {fees.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-2.5">{f.course.name}</td>
                  <td className="px-4 py-2.5">{f.track}</td>
                  <td className="px-4 py-2.5 font-medium">{money(f.baseFee)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(f.effectiveDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Config tab (Admin only) ──────────────────────────────────────────────────
function ConfigTab({ setError }: { setError: (s: string) => void }) {
  const [config, setConfig] = useState<AdmissionConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/api/admissions/config').then((r) => setConfig(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load config.')));
  }, [setError]);

  if (!config) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>;

  const set = <K extends keyof AdmissionConfig>(key: K, value: AdmissionConfig[K]) => setConfig({ ...config, [key]: value });

  const submit = () => {
    setSaving(true);
    setSaved(false);
    api.put('/api/admissions/config', config)
      .then((r) => { setConfig(r.data.data); setSaved(true); })
      .catch((err) => setError(errMsg(err, 'Could not save config.')))
      .finally(() => setSaving(false));
  };

  return (
    <div className="max-w-2xl border rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-sm">Admission Rates &amp; Rules</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Spot Discount %"><input type="number" className={inputCls} value={config.spotDiscountPct} onChange={(e) => set('spotDiscountPct', Number(e.target.value))} /></Field>
        <Field label="Full Payment Discount %"><input type="number" className={inputCls} value={config.fullDiscountPct} onChange={(e) => set('fullDiscountPct', Number(e.target.value))} /></Field>
        <Field label="Registration Fee (₹)"><input type="number" className={inputCls} value={config.registrationFee} onChange={(e) => set('registrationFee', Number(e.target.value))} /></Field>
        <Field label="Down Payment %"><input type="number" className={inputCls} value={config.downPaymentPct} onChange={(e) => set('downPaymentPct', Number(e.target.value))} /></Field>
        <Field label="EMI Interest 3–4 months %"><input type="number" className={inputCls} value={config.emiInterest3To4MonthPct} onChange={(e) => set('emiInterest3To4MonthPct', Number(e.target.value))} /></Field>
        <Field label="EMI Interest 5+ months %"><input type="number" className={inputCls} value={config.emiInterest5PlusMonthPct} onChange={(e) => set('emiInterest5PlusMonthPct', Number(e.target.value))} /></Field>
        <Field label="Portal Approval — Min Paid % (non-EMI)"><input type="number" className={inputCls} value={config.portalApprovalMinPaidPct} onChange={(e) => set('portalApprovalMinPaidPct', Number(e.target.value))} /></Field>
      </div>

      <h4 className="font-semibold text-xs pt-2">EMI Month Limit per Track</h4>
      <div className="grid grid-cols-2 gap-3">
        {TRACKS.map((t) => (
          <Field key={t} label={TRACK_LABELS[t]}>
            <input
              type="number"
              className={inputCls}
              value={config.trackEmiMonthLimits[t] ?? ''}
              onChange={(e) => set('trackEmiMonthLimits', { ...config.trackEmiMonthLimits, [t]: Number(e.target.value) })}
            />
          </Field>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
        {saved && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
      </div>
    </div>
  );
}
