import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { Lock, Plus, X, Wallet, TrendingUp, Receipt, Search, Trash2, CheckCircle2, Ban } from 'lucide-react';

type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING' | 'CHEQUE' | 'OTHER';
type FeePlanType = 'FULL' | 'PART' | 'EMI';
type FeePlanStatus = 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
type FeeInstallmentStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'WAIVED';

interface EmployeeLite { id: string; firstName: string; lastName: string; }

interface Collection {
  id: string;
  studentName: string;
  amount: number;
  mode: PaymentMode;
  receiptNo?: string | null;
  remarks?: string | null;
  collectedAt: string;
  lead?: { id: string; name: string; courseInterest?: string | null } | null;
  receivedBy?: EmployeeLite | null;
}

interface Stats {
  totalCollected: number;
  collectedThisMonth: number;
  modeTotals: Record<string, number>;
  totalTransactions: number;
}

const MODES: PaymentMode[] = ['CASH', 'UPI', 'CARD', 'NET_BANKING', 'CHEQUE', 'OTHER'];

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

// ── Fee declarations (Full / Part-payment / EMI) ──────────────────────────
interface LeadLite {
  id: string; name: string; phone: string; email?: string | null; city?: string | null;
  assignedToId?: string | null; assignedTo?: EmployeeLite | null;
}
interface Installment {
  id: string; dueDate: string; amount: number; status: FeeInstallmentStatus;
  paidAt?: string | null; mode?: PaymentMode | null; receivedBy?: EmployeeLite | null;
}
interface FeePlan {
  id: string; courseName: string; totalFee: number; planType: FeePlanType;
  interestAmount?: number | null; status: FeePlanStatus; createdAt: string;
  lead: LeadLite; createdBy?: EmployeeLite | null; installments: Installment[];
}

const PLAN_TYPE_LABEL: Record<FeePlanType, string> = { FULL: 'Full Payment', PART: 'Part Payment', EMI: 'EMI' };
const PLAN_STATUS_COLOR: Record<FeePlanStatus, string> = {
  ACTIVE: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
};
const INSTALLMENT_STATUS_COLOR: Record<FeeInstallmentStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600', PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700', WAIVED: 'bg-amber-100 text-amber-700',
};

function totalPaidOf(plan: FeePlan): number {
  return plan.installments.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.amount, 0);
}
function nextDueOf(plan: FeePlan): Installment | null {
  const pending = plan.installments.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE');
  if (pending.length === 0) return null;
  return pending.reduce((a, b) => (new Date(a.dueDate) < new Date(b.dueDate) ? a : b));
}

export default function FinanceSalesPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.FINANCE_SALES;
  const canEdit = hasModule('FINANCE_SALES', 'EDIT');

  const [tab, setTab] = useState<'ledger' | 'plans'>('plans');

  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [plans, setPlans] = useState<FeePlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [planSearch, setPlanSearch] = useState('');
  const [planStatusFilter, setPlanStatusFilter] = useState<FeePlanStatus | ''>('');
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const [listRes, statsRes] = await Promise.all([
        api.get('/api/finance-sales', { params }),
        api.get('/api/finance-sales/stats'),
      ]);
      setCollections(listRes.data.data);
      setStats(statsRes.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, [search]);

  const fetchPlans = useCallback(async () => {
    setPlansLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (planSearch) params.search = planSearch;
      if (planStatusFilter) params.status = planStatusFilter;
      const res = await api.get('/api/finance-sales/plans', { params });
      setPlans(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load fee plans');
    } finally {
      setPlansLoading(false);
    }
  }, [planSearch, planStatusFilter]);

  useEffect(() => { if (level && tab === 'ledger') fetchAll(); }, [level, tab, fetchAll]);
  useEffect(() => { if (level && tab === 'plans') fetchPlans(); }, [level, tab, fetchPlans]);

  useEffect(() => {
    if (!level) return;
    api.get('/api/employees').then((res) => setEmployees(res.data.data)).catch(() => setEmployees([]));
  }, [level]);

  if (loaded && !level) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <Lock className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">No access to Finance (Sales)</p>
          <p className="text-sm text-muted-foreground">
            Ask someone with Master Control to grant you access to this module.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Finance (Sales)</h1>
          <p className="text-muted-foreground text-sm">Fee declarations, installments, and student fee collections</p>
        </div>
        {canEdit && tab === 'plans' && (
          <button
            onClick={() => setShowNewPlan(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Declaration
          </button>
        )}
        {canEdit && tab === 'ledger' && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Record Collection
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex items-center gap-1 border-b">
        {([{ id: 'plans' as const, label: 'Fee Declarations' }, { id: 'ledger' as const, label: 'Collections Ledger' }]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ledger' ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Wallet} label="Total Collected" value={fmt(stats?.totalCollected ?? 0)} />
            <StatCard icon={TrendingUp} label="This Month" value={fmt(stats?.collectedThisMonth ?? 0)} />
            <StatCard icon={Receipt} label="Transactions" value={stats?.totalTransactions ?? 0} />
            <StatCard icon={Wallet} label="Via UPI" value={fmt(stats?.modeTotals?.UPI ?? 0)} />
          </div>

          <div className="flex items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student name or receipt no..."
              className="px-3 py-2 border rounded-lg text-sm w-72"
            />
          </div>

          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Receipt No.</th>
                  <th className="px-4 py-3">Received By</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : collections.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No collections recorded</td></tr>
                ) : collections.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      {c.studentName}
                      {c.lead?.courseInterest && <p className="text-xs text-muted-foreground">{c.lead.courseInterest}</p>}
                    </td>
                    <td className="px-4 py-3 font-semibold">{fmt(c.amount)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">{c.mode.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.receiptNo || '—'}</td>
                    <td className="px-4 py-3">{c.receivedBy ? `${c.receivedBy.firstName} ${c.receivedBy.lastName}` : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(c.collectedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={planSearch}
                onChange={(e) => setPlanSearch(e.target.value)}
                placeholder="Search by student name or phone..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <select className="px-3 py-2 border rounded-lg text-sm" value={planStatusFilter} onChange={(e) => setPlanStatusFilter(e.target.value as FeePlanStatus | '')}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <p className="text-sm text-muted-foreground">{plans.length} plan{plans.length === 1 ? '' : 's'}</p>
          </div>

          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Paid / Total</th>
                  <th className="px-4 py-3">Next Due</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {plansLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : plans.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No fee declarations yet</td></tr>
                ) : plans.map((p) => {
                  const paid = totalPaidOf(p);
                  const next = nextDueOf(p);
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setOpenPlanId(p.id)}>
                      <td className="px-4 py-3 font-medium">
                        <span className="text-blue-600 hover:underline">{p.lead.name}</span>
                        <p className="text-xs text-muted-foreground font-normal">{p.lead.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.courseName}</td>
                      <td className="px-4 py-3 text-xs">{PLAN_TYPE_LABEL[p.planType]}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{fmt(paid)}</span>
                        <span className="text-muted-foreground"> / {fmt(p.totalFee)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {next ? (
                          <span className={next.status === 'OVERDUE' ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                            {fmt(next.amount)} · {new Date(next.dueDate).toLocaleDateString()}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-medium rounded-full px-2 py-1 ${PLAN_STATUS_COLOR[p.status]}`}>{p.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showAdd && (
        <AddCollectionModal
          employees={employees}
          saving={saving}
          setSaving={setSaving}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchAll(); }}
          setError={setError}
        />
      )}

      {showNewPlan && (
        <NewDeclarationModal
          employees={employees}
          canEdit={canEdit}
          onClose={() => setShowNewPlan(false)}
          onSaved={(id) => { setShowNewPlan(false); fetchPlans(); setOpenPlanId(id); }}
        />
      )}

      {openPlanId && (
        <PlanDetailModal
          planId={openPlanId}
          employees={employees}
          canEdit={canEdit}
          onClose={() => setOpenPlanId(null)}
          onChanged={() => fetchPlans()}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-green-600" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

function AddCollectionModal({ employees, saving, setSaving, onClose, onSaved, setError }: {
  employees: EmployeeLite[]; saving: boolean; setSaving: (v: boolean) => void;
  onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({
    studentName: '', amount: '', mode: 'UPI' as PaymentMode, receivedById: '', receiptNo: '', remarks: '',
  });

  const submit = async () => {
    if (!form.studentName || !form.amount) { setError('Student name and amount are required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/finance-sales', { ...form, receivedById: form.receivedById || undefined, receiptNo: form.receiptNo || undefined });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to record collection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Record Fee Collection</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Student Name *" value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} />
          <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Amount *" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as PaymentMode })}>
            {MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Receipt No." value={form.receiptNo} onChange={(e) => setForm({ ...form, receiptNo: e.target.value })} />
          {employees.length > 0 && (
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.receivedById} onChange={(e) => setForm({ ...form, receivedById: e.target.value })}>
              <option value="">Received by...</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          )}
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Remarks" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Record'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Declaration wizard ─────────────────────────────────────────────────
interface DraftInstallment { dueDate: string; amount: string; }

function NewDeclarationModal({ employees, canEdit, onClose, onSaved }: {
  employees: EmployeeLite[]; canEdit: boolean; onClose: () => void; onSaved: (planId: string) => void;
}) {
  const [studentMode, setStudentMode] = useState<'existing' | 'new'>('new');
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<LeadLite[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadLite | null>(null);
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '' });

  const [courseName, setCourseName] = useState('');
  const [totalFee, setTotalFee] = useState('');
  const [planType, setPlanType] = useState<FeePlanType>('FULL');

  const [firstAmount, setFirstAmount] = useState('');
  const [firstMode, setFirstMode] = useState<PaymentMode>('UPI');
  const [firstReceivedById, setFirstReceivedById] = useState('');
  const [firstDate, setFirstDate] = useState(new Date().toISOString().slice(0, 10));

  const [installments, setInstallments] = useState<DraftInstallment[]>([{ dueDate: '', amount: '' }]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (studentMode !== 'existing' || !leadQuery.trim()) { setLeadResults([]); return; }
    const t = setTimeout(() => {
      api.get('/api/finance-sales/leads-search', { params: { q: leadQuery } })
        .then((res) => setLeadResults(res.data.data))
        .catch(() => setLeadResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [studentMode, leadQuery]);

  const addInstallmentRow = () => setInstallments([...installments, { dueDate: '', amount: '' }]);
  const removeInstallmentRow = (idx: number) => setInstallments(installments.filter((_, i) => i !== idx));
  const updateInstallmentRow = (idx: number, field: keyof DraftInstallment, value: string) => {
    setInstallments(installments.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const total = Number(totalFee) || 0;
  const scheduledSum = installments.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const firstAmt = Number(firstAmount) || 0;
  const grandTotal = firstAmt + (planType === 'FULL' ? 0 : scheduledSum);

  const submit = async () => {
    setError('');
    if (studentMode === 'existing' && !selectedLead) { setError('Select an existing student, or switch to "New student"'); return; }
    if (studentMode === 'new' && (!newLead.name || !newLead.phone || !newLead.email)) { setError('Name, phone, and email are required for a new student'); return; }
    if (!courseName || !totalFee) { setError('Course and total fee are required'); return; }
    if (!firstAmount) { setError('The amount collected today is required'); return; }
    if (planType !== 'FULL' && installments.every((r) => !r.dueDate || !r.amount)) { setError('Add at least one scheduled installment for Part-payment/EMI'); return; }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        courseName, totalFee: total, planType,
        firstPayment: { amount: firstAmt, mode: firstMode, receivedById: firstReceivedById || undefined, collectedAt: firstDate },
      };
      if (studentMode === 'existing' && selectedLead) payload.leadId = selectedLead.id;
      else payload.newLead = newLead;
      if (planType !== 'FULL') {
        payload.installments = installments.filter((r) => r.dueDate && r.amount).map((r) => ({ dueDate: r.dueDate, amount: Number(r.amount) }));
      }
      const res = await api.post('/api/finance-sales/plans', payload);
      onSaved(res.data.data.id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to create the fee declaration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-lg">New Fee Declaration</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Student</p>
            <div className="flex gap-2">
              <button onClick={() => setStudentMode('new')} className={`px-3 py-1.5 text-sm rounded-lg border ${studentMode === 'new' ? 'bg-blue-600 text-white border-blue-600' : ''}`}>New student</button>
              <button onClick={() => setStudentMode('existing')} className={`px-3 py-1.5 text-sm rounded-lg border ${studentMode === 'existing' ? 'bg-blue-600 text-white border-blue-600' : ''}`}>Existing lead</button>
            </div>
            {studentMode === 'new' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input className="px-3 py-2 border rounded-lg text-sm" placeholder="Name *" value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} />
                <input className="px-3 py-2 border rounded-lg text-sm" placeholder="Phone *" value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} />
                <input className="px-3 py-2 border rounded-lg text-sm" placeholder="Email *" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} />
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Search by name or phone..."
                  value={selectedLead ? `${selectedLead.name} — ${selectedLead.phone}` : leadQuery}
                  onChange={(e) => { setSelectedLead(null); setLeadQuery(e.target.value); }}
                />
                {!selectedLead && leadResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                    {leadResults.map((l) => (
                      <button key={l.id} onClick={() => { setSelectedLead(l); setLeadResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50">
                        {l.name} — {l.phone}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Course &amp; Fee</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input className="px-3 py-2 border rounded-lg text-sm" placeholder="Course (e.g. Digital Marketing - IOP) *" value={courseName} onChange={(e) => setCourseName(e.target.value)} />
              <input type="number" className="px-3 py-2 border rounded-lg text-sm" placeholder="Total Fee *" value={totalFee} onChange={(e) => setTotalFee(e.target.value)} />
            </div>
            <div className="flex gap-2">
              {(['FULL', 'PART', 'EMI'] as FeePlanType[]).map((t) => (
                <button key={t} onClick={() => setPlanType(t)} className={`px-3 py-1.5 text-sm rounded-lg border ${planType === t ? 'bg-blue-600 text-white border-blue-600' : ''}`}>
                  {PLAN_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Amount Collected Today</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input type="number" className="px-3 py-2 border rounded-lg text-sm" placeholder="Amount *" value={firstAmount} onChange={(e) => setFirstAmount(e.target.value)} />
              <select className="px-3 py-2 border rounded-lg text-sm" value={firstMode} onChange={(e) => setFirstMode(e.target.value as PaymentMode)}>
                {MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
              <select className="px-3 py-2 border rounded-lg text-sm" value={firstReceivedById} onChange={(e) => setFirstReceivedById(e.target.value)}>
                <option value="">Received by...</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
              <input type="date" className="px-3 py-2 border rounded-lg text-sm" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
            </div>
          </div>

          {planType !== 'FULL' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                  {planType === 'EMI' ? 'EMI Schedule' : 'Remaining Installments'}
                </p>
                <button onClick={addInstallmentRow} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add row</button>
              </div>
              <div className="space-y-2">
                {installments.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input type="date" className="flex-1 px-3 py-2 border rounded-lg text-sm" value={row.dueDate} onChange={(e) => updateInstallmentRow(idx, 'dueDate', e.target.value)} />
                    <input type="number" className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Amount" value={row.amount} onChange={(e) => updateInstallmentRow(idx, 'amount', e.target.value)} />
                    <button onClick={() => removeInstallmentRow(idx)} className="p-2 text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              {planType === 'EMI' && <p className="text-xs text-muted-foreground">Interest can be added afterward, once the EMI case is reviewed — leave it out for now.</p>}
              <p className={`text-xs ${grandTotal !== total ? 'text-amber-600' : 'text-green-700'}`}>
                Scheduled so far: {fmt(grandTotal)} of {fmt(total)} total{grandTotal !== total ? ` (${fmt(total - grandTotal)} unscheduled)` : ' ✓'}
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving || !canEdit} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Create Declaration'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Plan detail: installments, collect payment, edit, cancel ──────────────
function PlanDetailModal({ planId, employees, canEdit, onClose, onChanged }: {
  planId: string; employees: EmployeeLite[]; canEdit: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [collectForm, setCollectForm] = useState({ amount: '', mode: 'UPI' as PaymentMode, receivedById: '', collectedAt: new Date().toISOString().slice(0, 10) });
  const [interestDraft, setInterestDraft] = useState('');
  const [savingInterest, setSavingInterest] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/finance-sales/plans/${planId}`);
      setPlan(res.data.data);
      setInterestDraft(res.data.data.interestAmount != null ? String(res.data.data.interestAmount) : '');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  const startCollect = (inst: Installment) => {
    setCollectingId(inst.id);
    setCollectForm({ amount: String(inst.amount), mode: 'UPI', receivedById: '', collectedAt: new Date().toISOString().slice(0, 10) });
  };

  const submitCollect = async () => {
    if (!collectingId) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/finance-sales/installments/${collectingId}/collect`, {
        amount: collectForm.amount, mode: collectForm.mode,
        receivedById: collectForm.receivedById || undefined, collectedAt: collectForm.collectedAt,
      });
      setCollectingId(null);
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to record the payment');
    } finally {
      setBusy(false);
    }
  };

  const saveInterest = async () => {
    setSavingInterest(true);
    setError('');
    try {
      await api.put(`/api/finance-sales/plans/${planId}`, { interestAmount: interestDraft === '' ? null : Number(interestDraft) });
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to save interest');
    } finally {
      setSavingInterest(false);
    }
  };

  const cancelPlan = async () => {
    if (!window.confirm('Cancel this fee plan? Every pending installment will be waived and reminders will stop. This does not affect enrollment.')) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/finance-sales/plans/${planId}/cancel`);
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to cancel the plan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-semibold text-lg">{plan ? plan.lead.name : 'Loading…'}</h2>
            {plan && <p className="text-xs text-muted-foreground">{plan.lead.phone} · {plan.courseName}</p>}
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          {loading || !plan ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="border rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Fee</p>
                  <p className="font-bold">{fmt(plan.totalFee)}</p>
                </div>
                <div className="border rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="font-bold text-green-700">{fmt(totalPaidOf(plan))}</p>
                </div>
                <div className="border rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Due</p>
                  <p className="font-bold text-amber-600">{fmt(Math.max(0, plan.totalFee - totalPaidOf(plan)))}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] font-medium rounded-full px-2 py-1 ${PLAN_STATUS_COLOR[plan.status]}`}>{plan.status}</span>
                <span className="text-[11px] font-medium rounded-full px-2 py-1 bg-gray-100 text-gray-600">{PLAN_TYPE_LABEL[plan.planType]}</span>
                {canEdit && plan.status === 'ACTIVE' && (
                  <button onClick={cancelPlan} disabled={busy} className="ml-auto flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-50">
                    <Ban className="w-3.5 h-3.5" /> Cancel plan
                  </button>
                )}
              </div>

              {plan.planType === 'EMI' && (
                <div className="border rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Interest (filled in by the EMI reviewer)</p>
                  <div className="flex items-center gap-2">
                    <input type="number" className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Interest amount" value={interestDraft} onChange={(e) => setInterestDraft(e.target.value)} disabled={!canEdit} />
                    {canEdit && (
                      <button onClick={saveInterest} disabled={savingInterest} className="px-3 py-2 text-sm rounded-lg border disabled:opacity-50">
                        {savingInterest ? 'Saving…' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Installments</p>
                <div className="border rounded-xl overflow-hidden divide-y">
                  {plan.installments.map((inst) => (
                    <div key={inst.id} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{fmt(inst.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {inst.status === 'PAID' && inst.paidAt ? `Paid ${new Date(inst.paidAt).toLocaleDateString()}${inst.mode ? ` · ${inst.mode.replace('_', ' ')}` : ''}` : `Due ${new Date(inst.dueDate).toLocaleDateString()}`}
                            {inst.receivedBy ? ` · ${inst.receivedBy.firstName} ${inst.receivedBy.lastName}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-medium rounded-full px-2 py-1 ${INSTALLMENT_STATUS_COLOR[inst.status]}`}>{inst.status}</span>
                          {canEdit && (inst.status === 'PENDING' || inst.status === 'OVERDUE') && plan.status === 'ACTIVE' && (
                            <button onClick={() => startCollect(inst)} className="flex items-center gap-1 text-xs text-green-700 hover:underline">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Collect
                            </button>
                          )}
                        </div>
                      </div>
                      {collectingId === inst.id && (
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 bg-muted/20 rounded-lg p-3">
                          <input type="number" className="px-2 py-1.5 border rounded-lg text-sm" placeholder="Amount" value={collectForm.amount} onChange={(e) => setCollectForm({ ...collectForm, amount: e.target.value })} />
                          <select className="px-2 py-1.5 border rounded-lg text-sm" value={collectForm.mode} onChange={(e) => setCollectForm({ ...collectForm, mode: e.target.value as PaymentMode })}>
                            {MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                          </select>
                          <select className="px-2 py-1.5 border rounded-lg text-sm" value={collectForm.receivedById} onChange={(e) => setCollectForm({ ...collectForm, receivedById: e.target.value })}>
                            <option value="">Received by...</option>
                            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                          </select>
                          <input type="date" className="px-2 py-1.5 border rounded-lg text-sm" value={collectForm.collectedAt} onChange={(e) => setCollectForm({ ...collectForm, collectedAt: e.target.value })} />
                          <div className="col-span-2 md:col-span-4 flex justify-end gap-2">
                            <button onClick={() => setCollectingId(null)} className="px-3 py-1.5 text-xs rounded-lg border">Cancel</button>
                            <button onClick={submitCollect} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white disabled:opacity-50">
                              {busy ? 'Saving…' : 'Confirm Collected'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
