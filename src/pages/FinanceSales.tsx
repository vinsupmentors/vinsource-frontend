import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { Lock, Plus, X, Wallet, TrendingUp, Receipt, Search, Trash2, CheckCircle2, Ban, Users, AlertTriangle, Percent } from 'lucide-react';

type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING' | 'CHEQUE' | 'OTHER';
type FeePlanType = 'FULL' | 'PART' | 'EMI';
type FeePlanStatus = 'ACTIVE' | 'CANCELLED' | 'COMPLETED' | 'REFUNDED';
type FeeInstallmentStatus = 'PENDING' | 'PENDING_APPROVAL' | 'PAID' | 'OVERDUE' | 'WAIVED';

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
  refundRequestedAt?: string | null; refundAmount?: number | null; refundReason?: string | null; refundCompletedAt?: string | null;
  deletionRequestedAt?: string | null; deletionReason?: string | null;
}
// A collected-but-unconfirmed installment, as returned by the approval queue.
interface ApprovalItem {
  id: string; amount: number; mode?: PaymentMode | null; paidAt?: string | null; status: FeeInstallmentStatus;
  receivedBy?: EmployeeLite | null;
  plan: { id: string; courseName: string; totalFee: number; planType: FeePlanType; lead: LeadLite };
}
// A plan sitting with a pending refund or deletion request.
interface RequestItem extends FeePlan {
  refundRequestedBy?: EmployeeLite | null;
  deletionRequestedBy?: EmployeeLite | null;
}
interface ApprovalHistoryItem extends ApprovalItem {
  approvedAt?: string | null;
  approvedBy?: EmployeeLite | null;
}
interface RefundHistoryItem extends RequestItem {
  refundCompletedBy?: EmployeeLite | null;
}
// Snapshot of a deleted plan — the plan row itself is gone, this is all
// that's left, so it deliberately doesn't share a shape with FeePlan.
interface DeletionLogItem {
  id: string; leadName: string; leadPhone: string; courseName: string; totalFee: number;
  planType: string; status: string; totalPaid: number; deletionReason?: string | null;
  requestedAt: string; requestedBy?: EmployeeLite | null;
  approvedAt: string; approvedBy?: EmployeeLite | null;
}

// ── Dashboard KPI aggregation ──────────────────────────────────────────────
interface DashboardBucket {
  key: string; label: string; sub?: string | null;
  studentCount: number; totalFeeValue: number; collected: number; awaitingApproval: number; outstanding: number;
}
interface OverdueEmiItem {
  id: string; studentName: string; studentPhone: string; courseName: string; amount: number;
  dueDate: string; assignedTo?: { firstName: string; lastName: string } | null;
}
interface DashboardData {
  overview: {
    totalStudents: number; activeCount: number; completedCount: number; cancelledCount: number; refundedCount: number;
    totalFeeValue: number; totalCollected: number; totalAwaitingApproval: number; totalOutstanding: number; totalRefunded: number;
    pendingApprovalsCount: number; pendingRefundRequests: number; pendingDeletionRequests: number;
  };
  bySalesPerson: DashboardBucket[];
  byCourse: DashboardBucket[];
  emi: { emiPlansCount: number; totalDueSoFar: number; overdueCount: number; defaultRatePct: number; overdueInstallments: OverdueEmiItem[] };
}

const PLAN_TYPE_LABEL: Record<FeePlanType, string> = { FULL: 'Full Payment', PART: 'Part Payment', EMI: 'EMI' };
const PLAN_STATUS_COLOR: Record<FeePlanStatus, string> = {
  ACTIVE: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700', REFUNDED: 'bg-orange-100 text-orange-700',
};
const INSTALLMENT_STATUS_COLOR: Record<FeeInstallmentStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600', PENDING_APPROVAL: 'bg-purple-100 text-purple-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700', WAIVED: 'bg-amber-100 text-amber-700',
};

function totalPaidOf(plan: FeePlan): number {
  return plan.installments.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.amount, 0);
}
/** Money physically collected by Sales, whether or not Admin has approved
 * it yet — used for balance math so a not-yet-approved advance still counts
 * against what's left to schedule. */
function totalCollectedOf(plan: FeePlan): number {
  return plan.installments.filter((i) => i.status === 'PAID' || i.status === 'PENDING_APPROVAL').reduce((s, i) => s + i.amount, 0);
}
function totalAwaitingApprovalOf(plan: FeePlan): number {
  return plan.installments.filter((i) => i.status === 'PENDING_APPROVAL').reduce((s, i) => s + i.amount, 0);
}
function nextDueOf(plan: FeePlan): Installment | null {
  const pending = plan.installments.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE');
  if (pending.length === 0) return null;
  return pending.reduce((a, b) => (new Date(a.dueDate) < new Date(b.dueDate) ? a : b));
}
/** True once a student's advance has been registered but nobody has said
 * yet how the remaining balance will be paid (Full/Part/EMI + schedule) —
 * i.e. the plan has a balance outstanding and every installment on file so
 * far is the one already-collected advance (approved or still awaiting
 * approval). This drives the "Declare Payment" action on each student,
 * separate from just registering them. */
function needsDeclaration(plan: FeePlan): boolean {
  return (
    plan.status === 'ACTIVE' &&
    plan.installments.length > 0 &&
    plan.installments.every((i) => i.status === 'PAID' || i.status === 'PENDING_APPROVAL') &&
    totalCollectedOf(plan) < plan.totalFee
  );
}
function isRefundPending(plan: FeePlan): boolean {
  return !!plan.refundRequestedAt && !plan.refundCompletedAt;
}
function isDeletionPending(plan: FeePlan): boolean {
  return !!plan.deletionRequestedAt;
}

export default function FinanceSalesPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.FINANCE_SALES;
  const canEdit = hasModule('FINANCE_SALES', 'EDIT');
  const canApprove = hasModule('FINANCE_SALES', 'ADMIN');

  const [tab, setTab] = useState<'ledger' | 'plans' | 'approvals' | 'dashboard'>('plans');

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
  const [planSalesPersonFilter, setPlanSalesPersonFilter] = useState('');
  const [planCourseFilter, setPlanCourseFilter] = useState('');
  const [planTypeFilter, setPlanTypeFilter] = useState<FeePlanType | ''>('');
  const [planFromFilter, setPlanFromFilter] = useState('');
  const [planToFilter, setPlanToFilter] = useState('');
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  const hasPlanFilters = !!(planSearch || planStatusFilter || planSalesPersonFilter || planCourseFilter || planTypeFilter || planFromFilter || planToFilter);
  const clearPlanFilters = () => {
    setPlanSearch(''); setPlanStatusFilter(''); setPlanSalesPersonFilter('');
    setPlanCourseFilter(''); setPlanTypeFilter(''); setPlanFromFilter(''); setPlanToFilter('');
  };
  // Distinct course names ever seen — the closest thing to a "batch" list,
  // since courseName is free text captured at intake rather than a real FK
  // to the Batch/enrollment tables. Accumulated (never shrinks) so picking a
  // course filter doesn't collapse the dropdown down to just that option.
  const [courseOptions, setCourseOptions] = useState<string[]>([]);

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
      if (planSalesPersonFilter) params.salesPersonId = planSalesPersonFilter;
      if (planCourseFilter) params.courseName = planCourseFilter;
      if (planTypeFilter) params.planType = planTypeFilter;
      if (planFromFilter) params.from = planFromFilter;
      if (planToFilter) params.to = planToFilter;
      const res = await api.get('/api/finance-sales/plans', { params });
      setPlans(res.data.data);
      setCourseOptions((prev) => Array.from(new Set([...prev, ...res.data.data.map((p: FeePlan) => p.courseName)])).sort());
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load fee plans');
    } finally {
      setPlansLoading(false);
    }
  }, [planSearch, planStatusFilter, planSalesPersonFilter, planCourseFilter, planTypeFilter, planFromFilter, planToFilter]);

  const deleteCollection = async (id: string) => {
    if (!window.confirm('Delete this collections ledger entry? This cannot be undone.')) return;
    try {
      await api.delete(`/api/finance-sales/${id}`);
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to delete the entry');
    }
  };

  const requestDelete = async (planId: string) => {
    const reason = window.prompt('Reason for deleting this fee declaration (optional):') || undefined;
    try {
      await api.post(`/api/finance-sales/plans/${planId}/delete-request`, { reason });
      fetchPlans();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to submit the deletion request');
    }
  };

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
            <Plus className="w-4 h-4" /> Add Student
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
        {([
          { id: 'plans' as const, label: 'Fee Declarations' },
          { id: 'ledger' as const, label: 'Collections Ledger' },
          ...(canApprove ? [{ id: 'approvals' as const, label: 'Approvals' }] : []),
          ...(canApprove ? [{ id: 'dashboard' as const, label: 'Dashboard' }] : []),
        ]).map((t) => (
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

      {tab === 'dashboard' ? (
        <DashboardPanel employees={employees} />
      ) : tab === 'approvals' ? (
        <ApprovalsPanel onChanged={fetchPlans} />
      ) : tab === 'ledger' ? (
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
                  {canApprove && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : collections.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No collections recorded</td></tr>
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
                    {canApprove && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteCollection(c.id)}
                          title="Delete this ledger entry"
                          className="text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
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
              <option value="REFUNDED">Refunded</option>
            </select>
            {canApprove && employees.length > 0 && (
              <select className="px-3 py-2 border rounded-lg text-sm" value={planSalesPersonFilter} onChange={(e) => setPlanSalesPersonFilter(e.target.value)}>
                <option value="">All sales people</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
            )}
            {courseOptions.length > 0 && (
              <select className="px-3 py-2 border rounded-lg text-sm max-w-[200px]" value={planCourseFilter} onChange={(e) => setPlanCourseFilter(e.target.value)}>
                <option value="">All courses / batches</option>
                {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <select className="px-3 py-2 border rounded-lg text-sm" value={planTypeFilter} onChange={(e) => setPlanTypeFilter(e.target.value as FeePlanType | '')}>
              <option value="">All plan types</option>
              <option value="FULL">Full Payment</option>
              <option value="PART">Part Payment</option>
              <option value="EMI">EMI</option>
            </select>
            <div className="flex items-center gap-1 text-sm">
              <input type="date" className="px-2 py-2 border rounded-lg text-sm" value={planFromFilter} onChange={(e) => setPlanFromFilter(e.target.value)} title="From" />
              <span className="text-muted-foreground">–</span>
              <input type="date" className="px-2 py-2 border rounded-lg text-sm" value={planToFilter} onChange={(e) => setPlanToFilter(e.target.value)} title="To" />
            </div>
            {hasPlanFilters && (
              <button onClick={clearPlanFilters} className="text-xs text-blue-600 hover:underline whitespace-nowrap">Clear filters</button>
            )}
            <p className="text-sm text-muted-foreground ml-auto">{plans.length} plan{plans.length === 1 ? '' : 's'}</p>
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
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {plansLoading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : plans.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No students registered yet</td></tr>
                ) : plans.map((p) => {
                  const paid = totalPaidOf(p);
                  const next = nextDueOf(p);
                  const declare = needsDeclaration(p);
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setOpenPlanId(p.id)}>
                      <td className="px-4 py-3 font-medium">
                        <span className="text-blue-600 hover:underline">{p.lead.name}</span>
                        <p className="text-xs text-muted-foreground font-normal">{p.lead.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.courseName}</td>
                      <td className="px-4 py-3 text-xs">
                        {declare ? <span className="text-amber-600 font-medium">Not declared</span> : PLAN_TYPE_LABEL[p.planType]}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{fmt(paid)}</span>
                        <span className="text-muted-foreground"> / {fmt(p.totalFee)}</span>
                        {totalAwaitingApprovalOf(p) > 0 && (
                          <p className="text-[11px] text-purple-700">+{fmt(totalAwaitingApprovalOf(p))} awaiting approval</p>
                        )}
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
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                          {declare && canEdit && (
                            <button
                              onClick={() => setOpenPlanId(p.id)}
                              className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                            >
                              Declare Payment
                            </button>
                          )}
                          {isRefundPending(p) && (
                            <span className="text-[11px] text-orange-700 whitespace-nowrap">Refund pending</span>
                          )}
                          {canEdit && (
                            isDeletionPending(p) ? (
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">Deletion pending</span>
                            ) : (
                              <button
                                onClick={() => requestDelete(p.id)}
                                title="Request deletion"
                                className="text-muted-foreground hover:text-red-600 flex-shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </div>
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
        <AddStudentModal
          canEdit={canEdit}
          onClose={() => setShowNewPlan(false)}
          onSaved={(id) => { setShowNewPlan(false); fetchPlans(); setOpenPlanId(id); }}
        />
      )}

      {openPlanId && (
        <PlanDetailModal
          planId={openPlanId}
          canEdit={canEdit}
          canApprove={canApprove}
          onClose={() => setOpenPlanId(null)}
          onChanged={fetchPlans}
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

// ── Add Student: register the student + the advance collected today.
// Deliberately does NOT ask for Full/Part/EMI here — that's declared
// separately afterward (per-student "Declare Payment" once the balance is
// known), since at intake all Sales has is who's joining and what they've
// paid so far. ──────────────────────────────────────────────────────────
interface DraftInstallment { dueDate: string; amount: string; }

function AddStudentModal({ canEdit, onClose, onSaved }: {
  canEdit: boolean; onClose: () => void; onSaved: (planId: string) => void;
}) {
  const [studentMode, setStudentMode] = useState<'existing' | 'new'>('new');
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<LeadLite[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadLite | null>(null);
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '' });

  const [courseName, setCourseName] = useState('');
  const [totalFee, setTotalFee] = useState('');

  const [firstAmount, setFirstAmount] = useState('');
  const [firstMode, setFirstMode] = useState<PaymentMode>('UPI');
  const [firstDate, setFirstDate] = useState(new Date().toISOString().slice(0, 10));

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

  const total = Number(totalFee) || 0;
  const firstAmt = Number(firstAmount) || 0;
  const balance = Math.max(0, total - firstAmt);

  const submit = async () => {
    setError('');
    if (studentMode === 'existing' && !selectedLead) { setError('Select an existing student, or switch to "New student"'); return; }
    if (studentMode === 'new' && (!newLead.name || !newLead.phone || !newLead.email)) { setError('Name, phone, and email are required for a new student'); return; }
    if (!courseName || !totalFee) { setError('Course and total fee are required'); return; }
    if (!firstAmount) { setError('The amount collected today is required'); return; }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        courseName, totalFee: total, planType: 'FULL' as FeePlanType,
        firstPayment: { amount: firstAmt, mode: firstMode, collectedAt: firstDate },
      };
      if (studentMode === 'existing' && selectedLead) payload.leadId = selectedLead.id;
      else payload.newLead = newLead;
      const res = await api.post('/api/finance-sales/plans', payload);
      onSaved(res.data.data.id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to register the student');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-lg">Add Student</h2>
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
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Advance Collected Today</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <input type="number" className="px-3 py-2 border rounded-lg text-sm" placeholder="Amount *" value={firstAmount} onChange={(e) => setFirstAmount(e.target.value)} />
              <select className="px-3 py-2 border rounded-lg text-sm" value={firstMode} onChange={(e) => setFirstMode(e.target.value as PaymentMode)}>
                {MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
              <input type="date" className="px-3 py-2 border rounded-lg text-sm" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
            </div>
            {total > 0 && firstAmt > 0 && (
              <p className="text-xs text-muted-foreground">
                Balance after this: <span className={balance > 0 ? 'text-amber-600 font-medium' : 'text-green-700 font-medium'}>{fmt(balance)}</span>
                {balance > 0 ? ' — you\'ll declare how it\'s paid (Full / Part / EMI) from the student\'s row afterward.' : ' — fully paid.'}
              </p>
            )}
            <p className="text-xs text-muted-foreground">This amount sits as awaiting approval until Admin confirms it's received.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving || !canEdit} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Register Student'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Plan detail: installments, collect payment, edit, cancel ──────────────
function PlanDetailModal({ planId, canEdit, canApprove, onClose, onChanged }: {
  planId: string; canEdit: boolean; canApprove: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [collectForm, setCollectForm] = useState({ amount: '', mode: 'UPI' as PaymentMode, collectedAt: new Date().toISOString().slice(0, 10) });
  const [interestDraft, setInterestDraft] = useState('');
  const [savingInterest, setSavingInterest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [declarePlanType, setDeclarePlanType] = useState<'PART' | 'EMI'>('PART');
  const [declareRows, setDeclareRows] = useState<DraftInstallment[]>([{ dueDate: '', amount: '' }]);
  const [declaring, setDeclaring] = useState(false);

  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundForm, setRefundForm] = useState({ amount: '', reason: '' });
  const [requestingRefund, setRequestingRefund] = useState(false);

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
    setCollectForm({ amount: String(inst.amount), mode: 'UPI', collectedAt: new Date().toISOString().slice(0, 10) });
  };

  const submitCollect = async () => {
    if (!collectingId) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/finance-sales/installments/${collectingId}/collect`, {
        amount: collectForm.amount, mode: collectForm.mode, collectedAt: collectForm.collectedAt,
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

  const approveInstallment = async (id: string) => {
    setApprovingId(id);
    setError('');
    try {
      await api.post(`/api/finance-sales/installments/${id}/approve`);
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to approve the payment');
    } finally {
      setApprovingId(null);
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

  const addDeclareRow = () => setDeclareRows([...declareRows, { dueDate: '', amount: '' }]);
  const removeDeclareRow = (idx: number) => setDeclareRows(declareRows.filter((_, i) => i !== idx));
  const updateDeclareRow = (idx: number, field: keyof DraftInstallment, value: string) => {
    setDeclareRows(declareRows.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const submitDeclare = async () => {
    if (!plan) return;
    const rows = declareRows.filter((r) => r.dueDate && r.amount);
    if (rows.length === 0) { setError('Add at least one installment for the balance'); return; }
    setDeclaring(true);
    setError('');
    try {
      await api.put(`/api/finance-sales/plans/${plan.id}`, { planType: declarePlanType });
      for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/api/finance-sales/plans/${plan.id}/installments`, { dueDate: row.dueDate, amount: Number(row.amount) });
      }
      setDeclareRows([{ dueDate: '', amount: '' }]);
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to declare the payment plan');
    } finally {
      setDeclaring(false);
    }
  };

  const submitRefundRequest = async () => {
    if (!plan) return;
    setRequestingRefund(true);
    setError('');
    try {
      await api.post(`/api/finance-sales/plans/${plan.id}/refund`, {
        amount: refundForm.amount || undefined, reason: refundForm.reason || undefined,
      });
      setShowRefundForm(false);
      setRefundForm({ amount: '', reason: '' });
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to submit the refund request');
    } finally {
      setRequestingRefund(false);
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
                  <p className="font-bold text-amber-600">{fmt(Math.max(0, plan.totalFee - totalCollectedOf(plan)))}</p>
                </div>
              </div>

              {totalAwaitingApprovalOf(plan) > 0 && (
                <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                  {fmt(totalAwaitingApprovalOf(plan))} collected but awaiting Admin approval before it's confirmed and the receipt is emailed.
                </p>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[11px] font-medium rounded-full px-2 py-1 ${PLAN_STATUS_COLOR[plan.status]}`}>{plan.status}</span>
                <span className="text-[11px] font-medium rounded-full px-2 py-1 bg-gray-100 text-gray-600">
                  {needsDeclaration(plan) ? 'Not declared' : PLAN_TYPE_LABEL[plan.planType]}
                </span>
                {isRefundPending(plan) && (
                  <span className="text-[11px] font-medium rounded-full px-2 py-1 bg-orange-100 text-orange-700">Refund pending</span>
                )}
                {isDeletionPending(plan) && (
                  <span className="text-[11px] font-medium rounded-full px-2 py-1 bg-gray-200 text-gray-700">Deletion pending</span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  {canEdit && !isRefundPending(plan) && (plan.status === 'ACTIVE' || plan.status === 'COMPLETED') && (
                    <button onClick={() => setShowRefundForm((v) => !v)} className="flex items-center gap-1 text-xs text-orange-600 hover:underline">
                      Request Refund
                    </button>
                  )}
                  {canEdit && plan.status === 'ACTIVE' && (
                    <button onClick={cancelPlan} disabled={busy} className="flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-50">
                      <Ban className="w-3.5 h-3.5" /> Cancel plan
                    </button>
                  )}
                </div>
              </div>

              {showRefundForm && (
                <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-orange-800">Request Refund</p>
                  <p className="text-xs text-orange-700">Admin does the actual transfer outside the app and marks it completed from the Approvals tab.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input type="number" className="px-3 py-2 border rounded-lg text-sm bg-white" placeholder="Refund amount" value={refundForm.amount} onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })} />
                    <input className="px-3 py-2 border rounded-lg text-sm bg-white" placeholder="Reason" value={refundForm.reason} onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowRefundForm(false)} className="px-3 py-1.5 text-xs rounded-lg border">Cancel</button>
                    <button onClick={submitRefundRequest} disabled={requestingRefund} className="px-3 py-1.5 text-xs rounded-lg bg-orange-600 text-white disabled:opacity-50">
                      {requestingRefund ? 'Submitting…' : 'Submit Refund Request'}
                    </button>
                  </div>
                </div>
              )}

              {needsDeclaration(plan) && (
                <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Declare Payment Plan</p>
                    <p className="text-xs text-amber-700">
                      Balance of {fmt(Math.max(0, plan.totalFee - totalCollectedOf(plan)))} hasn't been scheduled yet — pick how it'll be paid.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {(['PART', 'EMI'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setDeclarePlanType(t)}
                        className={`px-3 py-1.5 text-sm rounded-lg border ${declarePlanType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}
                        disabled={!canEdit}
                      >
                        {PLAN_TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-amber-800 tracking-wide">
                        {declarePlanType === 'EMI' ? 'EMI Schedule' : 'Installments'}
                      </p>
                      {canEdit && (
                        <button onClick={addDeclareRow} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Add row
                        </button>
                      )}
                    </div>
                    {declareRows.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input type="date" className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white" value={row.dueDate} onChange={(e) => updateDeclareRow(idx, 'dueDate', e.target.value)} disabled={!canEdit} />
                        <input type="number" className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white" placeholder="Amount" value={row.amount} onChange={(e) => updateDeclareRow(idx, 'amount', e.target.value)} disabled={!canEdit} />
                        {canEdit && (
                          <button onClick={() => removeDeclareRow(idx)} className="p-2 text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))}
                    {declarePlanType === 'EMI' && <p className="text-xs text-amber-700">Interest can be filled in below once this is saved.</p>}
                  </div>
                  {canEdit && (
                    <div className="flex justify-end">
                      <button onClick={submitDeclare} disabled={declaring} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
                        {declaring ? 'Saving…' : 'Save Declaration'}
                      </button>
                    </div>
                  )}
                </div>
              )}

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
                            {(inst.status === 'PAID' || inst.status === 'PENDING_APPROVAL') && inst.paidAt
                              ? `${inst.status === 'PAID' ? 'Paid' : 'Collected'} ${new Date(inst.paidAt).toLocaleDateString()}${inst.mode ? ` · ${inst.mode.replace('_', ' ')}` : ''}`
                              : `Due ${new Date(inst.dueDate).toLocaleDateString()}`}
                            {inst.receivedBy ? ` · ${inst.receivedBy.firstName} ${inst.receivedBy.lastName}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-medium rounded-full px-2 py-1 ${INSTALLMENT_STATUS_COLOR[inst.status]}`}>{inst.status.replace('_', ' ')}</span>
                          {canEdit && (inst.status === 'PENDING' || inst.status === 'OVERDUE') && plan.status === 'ACTIVE' && (
                            <button onClick={() => startCollect(inst)} className="flex items-center gap-1 text-xs text-green-700 hover:underline">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Collect
                            </button>
                          )}
                          {canApprove && inst.status === 'PENDING_APPROVAL' && (
                            <button
                              onClick={() => approveInstallment(inst.id)}
                              disabled={approvingId === inst.id}
                              className="flex items-center gap-1 text-xs text-purple-700 hover:underline disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> {approvingId === inst.id ? 'Approving…' : 'Approve'}
                            </button>
                          )}
                        </div>
                      </div>
                      {collectingId === inst.id && (
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 bg-muted/20 rounded-lg p-3">
                          <input type="number" className="px-2 py-1.5 border rounded-lg text-sm" placeholder="Amount" value={collectForm.amount} onChange={(e) => setCollectForm({ ...collectForm, amount: e.target.value })} />
                          <select className="px-2 py-1.5 border rounded-lg text-sm" value={collectForm.mode} onChange={(e) => setCollectForm({ ...collectForm, mode: e.target.value as PaymentMode })}>
                            {MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                          </select>
                          <input type="date" className="px-2 py-1.5 border rounded-lg text-sm" value={collectForm.collectedAt} onChange={(e) => setCollectForm({ ...collectForm, collectedAt: e.target.value })} />
                          <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
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

// ── Approvals: three sub-tabs (Payments / Refunds / Deletions), each with
// a Pending queue and a permanent History view. ───────────────────────────
const APPROVAL_SUBTABS = [
  { id: 'payments' as const, label: 'Payments' },
  { id: 'refunds' as const, label: 'Refunds' },
  { id: 'deletions' as const, label: 'Deletions' },
];

function ApprovalsPanel({ onChanged }: { onChanged: () => void }) {
  const [subTab, setSubTab] = useState<'payments' | 'refunds' | 'deletions'>('payments');
  const [view, setView] = useState<'pending' | 'history'>('pending');

  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryItem[]>([]);
  const [refundRequests, setRefundRequests] = useState<RequestItem[]>([]);
  const [refundHistory, setRefundHistory] = useState<RefundHistoryItem[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<RequestItem[]>([]);
  const [deletionLog, setDeletionLog] = useState<DeletionLogItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (subTab === 'payments') {
        const res = await api.get(view === 'pending' ? '/api/finance-sales/approvals' : '/api/finance-sales/approval-history');
        if (view === 'pending') setApprovals(res.data.data); else setApprovalHistory(res.data.data);
      } else if (subTab === 'refunds') {
        const res = await api.get(view === 'pending' ? '/api/finance-sales/refund-requests' : '/api/finance-sales/refund-history');
        if (view === 'pending') setRefundRequests(res.data.data); else setRefundHistory(res.data.data);
      } else {
        const res = await api.get(view === 'pending' ? '/api/finance-sales/deletion-requests' : '/api/finance-sales/deletion-log');
        if (view === 'pending') setDeletionRequests(res.data.data); else setDeletionLog(res.data.data);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [subTab, view]);

  useEffect(() => { load(); }, [load]);

  const switchSubTab = (t: typeof subTab) => { setSubTab(t); setView('pending'); };

  const approvePayment = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/api/finance-sales/installments/${id}/approve`);
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to approve the payment');
    } finally {
      setBusyId(null);
    }
  };

  const completeRefund = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/api/finance-sales/plans/${id}/refund/complete`);
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to complete the refund');
    } finally {
      setBusyId(null);
    }
  };

  const rejectRefund = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/api/finance-sales/plans/${id}/refund/reject`);
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to reject the refund request');
    } finally {
      setBusyId(null);
    }
  };

  const approveDelete = async (id: string) => {
    if (!window.confirm('Permanently delete this fee declaration and its installments? The collections ledger keeps its history either way. This cannot be undone.')) return;
    setBusyId(id);
    try {
      await api.post(`/api/finance-sales/plans/${id}/delete-request/approve`);
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to delete the plan');
    } finally {
      setBusyId(null);
    }
  };

  const rejectDelete = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/api/finance-sales/plans/${id}/delete-request/reject`);
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to reject the deletion request');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center flex-wrap gap-3">
        <div className="flex items-center gap-1">
          {APPROVAL_SUBTABS.map((t) => (
            <button
              key={t.id}
              onClick={() => switchSubTab(t.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border ${subTab === t.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 border rounded-lg p-0.5">
          {(['pending', 'history'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded-md capitalize ${view === v ? 'bg-gray-900 text-white' : 'text-muted-foreground'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {subTab === 'payments' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Collected By</th>
                <th className="px-4 py-3">Date</th>
                {view === 'pending' ? <th className="px-4 py-3">Action</th> : <th className="px-4 py-3">Approved By</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : view === 'pending' ? (
                approvals.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nothing awaiting approval</td></tr>
                ) : approvals.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      {a.plan.lead.name}
                      <p className="text-xs text-muted-foreground font-normal">{a.plan.lead.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.plan.courseName}</td>
                    <td className="px-4 py-3 font-semibold">{fmt(a.amount)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-purple-100 text-purple-700">{(a.mode || 'UPI').replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3">{a.receivedBy ? `${a.receivedBy.firstName} ${a.receivedBy.lastName}` : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.paidAt ? new Date(a.paidAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => approvePayment(a.id)}
                        disabled={busyId === a.id}
                        className="flex items-center gap-1 text-xs font-medium text-purple-700 hover:underline disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> {busyId === a.id ? 'Approving…' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                ))
              ) : approvalHistory.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No approvals yet</td></tr>
              ) : approvalHistory.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    {a.plan.lead.name}
                    <p className="text-xs text-muted-foreground font-normal">{a.plan.lead.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.plan.courseName}</td>
                  <td className="px-4 py-3 font-semibold">{fmt(a.amount)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">{(a.mode || 'UPI').replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3">{a.receivedBy ? `${a.receivedBy.firstName} ${a.receivedBy.lastName}` : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.paidAt ? new Date(a.paidAt).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {a.approvedBy ? `${a.approvedBy.firstName} ${a.approvedBy.lastName}` : '—'}
                    {a.approvedAt && <span className="block text-[11px]">{new Date(a.approvedAt).toLocaleDateString()}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'refunds' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Refund Amount</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Requested By</th>
                {view === 'pending' ? <th className="px-4 py-3">Action</th> : <th className="px-4 py-3">Transferred By</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : view === 'pending' ? (
                refundRequests.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No refund requests</td></tr>
                ) : refundRequests.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      {r.lead.name}
                      <p className="text-xs text-muted-foreground font-normal">{r.lead.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.courseName}</td>
                    <td className="px-4 py-3 font-semibold">{r.refundAmount != null ? fmt(r.refundAmount) : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate" title={r.refundReason || ''}>{r.refundReason || '—'}</td>
                    <td className="px-4 py-3">{r.refundRequestedBy ? `${r.refundRequestedBy.firstName} ${r.refundRequestedBy.lastName}` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => completeRefund(r.id)}
                          disabled={busyId === r.id}
                          className="flex items-center gap-1 text-xs font-medium text-green-700 hover:underline disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> {busyId === r.id ? 'Saving…' : 'Mark Transferred'}
                        </button>
                        <button
                          onClick={() => rejectRefund(r.id)}
                          disabled={busyId === r.id}
                          className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : refundHistory.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No refunds yet</td></tr>
              ) : refundHistory.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    {r.lead.name}
                    <p className="text-xs text-muted-foreground font-normal">{r.lead.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.courseName}</td>
                  <td className="px-4 py-3 font-semibold">{r.refundAmount != null ? fmt(r.refundAmount) : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate" title={r.refundReason || ''}>{r.refundReason || '—'}</td>
                  <td className="px-4 py-3">{r.refundRequestedBy ? `${r.refundRequestedBy.firstName} ${r.refundRequestedBy.lastName}` : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.refundCompletedBy ? `${r.refundCompletedBy.firstName} ${r.refundCompletedBy.lastName}` : '—'}
                    {r.refundCompletedAt && <span className="block text-[11px]">{new Date(r.refundCompletedAt).toLocaleDateString()}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'deletions' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Requested By</th>
                {view === 'pending' ? <th className="px-4 py-3">Action</th> : <th className="px-4 py-3">Deleted By</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : view === 'pending' ? (
                deletionRequests.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No deletion requests</td></tr>
                ) : deletionRequests.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      {r.lead.name}
                      <p className="text-xs text-muted-foreground font-normal">{r.lead.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.courseName}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate" title={r.deletionReason || ''}>{r.deletionReason || '—'}</td>
                    <td className="px-4 py-3">{r.deletionRequestedBy ? `${r.deletionRequestedBy.firstName} ${r.deletionRequestedBy.lastName}` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => approveDelete(r.id)}
                          disabled={busyId === r.id}
                          className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> {busyId === r.id ? 'Deleting…' : 'Approve Delete'}
                        </button>
                        <button
                          onClick={() => rejectDelete(r.id)}
                          disabled={busyId === r.id}
                          className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : deletionLog.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No deletions yet</td></tr>
              ) : deletionLog.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    {r.leadName}
                    <p className="text-xs text-muted-foreground font-normal">{r.leadPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.courseName}
                    <p className="text-[11px]">{fmt(r.totalPaid)} paid of {fmt(r.totalFee)}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate" title={r.deletionReason || ''}>{r.deletionReason || '—'}</td>
                  <td className="px-4 py-3">{r.requestedBy ? `${r.requestedBy.firstName} ${r.requestedBy.lastName}` : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.approvedBy ? `${r.approvedBy.firstName} ${r.approvedBy.lastName}` : '—'}
                    <span className="block text-[11px]">{new Date(r.approvedAt).toLocaleDateString()}</span>
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

// ── Dashboard: cross-cutting KPIs — revenue collected/outstanding overall,
// by sales person (who still has revenue "yet to complete"), by course/
// batch, and EMI default tracking. ─────────────────────────────────────────
function DashboardPanel({ employees: _employees }: { employees: EmployeeLite[] }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [breakdownView, setBreakdownView] = useState<'salesperson' | 'course'>('salesperson');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get('/api/finance-sales/dashboard', { params });
      setData(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load the dashboard');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground text-center py-12">Loading dashboard…</p>;
  }
  if (error && !data) {
    return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>;
  }
  if (!data) return null;

  const buckets = breakdownView === 'salesperson' ? data.bySalesPerson : data.byCourse;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Filter by registration date</p>
        <div className="flex items-center gap-1 text-sm">
          <input type="date" className="px-2 py-2 border rounded-lg text-sm" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
          <span className="text-muted-foreground">–</span>
          <input type="date" className="px-2 py-2 border rounded-lg text-sm" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo(''); }} className="text-xs text-blue-600 hover:underline">Clear</button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Users} label="Students" value={data.overview.totalStudents} />
        <StatCard icon={Wallet} label="Total Fee Value" value={fmt(data.overview.totalFeeValue)} />
        <StatCard icon={TrendingUp} label="Collected" value={fmt(data.overview.totalCollected)} />
        <StatCard icon={Receipt} label="Awaiting Approval" value={fmt(data.overview.totalAwaitingApproval)} />
        <StatCard icon={AlertTriangle} label="Yet to Complete" value={fmt(data.overview.totalOutstanding)} />
        <StatCard icon={Ban} label="Refunded" value={fmt(data.overview.totalRefunded)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">{data.overview.activeCount} Active</span>
        <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">{data.overview.completedCount} Completed</span>
        <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium">{data.overview.cancelledCount} Cancelled</span>
        <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">{data.overview.refundedCount} Refunded</span>
        <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">{data.overview.pendingApprovalsCount} payments awaiting approval</span>
        {data.overview.pendingRefundRequests > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">{data.overview.pendingRefundRequests} refund requests pending</span>
        )}
        {data.overview.pendingDeletionRequests > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-gray-200 text-gray-700 font-medium">{data.overview.pendingDeletionRequests} deletion requests pending</span>
        )}
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-sm font-semibold">Revenue Yet to Complete</p>
          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <button
              onClick={() => setBreakdownView('salesperson')}
              className={`px-3 py-1 text-xs rounded-md ${breakdownView === 'salesperson' ? 'bg-gray-900 text-white' : 'text-muted-foreground'}`}
            >
              By Sales Person
            </button>
            <button
              onClick={() => setBreakdownView('course')}
              className={`px-3 py-1 text-xs rounded-md ${breakdownView === 'course' ? 'bg-gray-900 text-white' : 'text-muted-foreground'}`}
            >
              By Course / Batch
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{breakdownView === 'salesperson' ? 'Sales Person' : 'Course / Batch'}</th>
              <th className="px-4 py-3">Students</th>
              <th className="px-4 py-3">Total Fee</th>
              <th className="px-4 py-3">Collected</th>
              <th className="px-4 py-3">Awaiting Approval</th>
              <th className="px-4 py-3">Yet to Complete</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {buckets.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No data for this range</td></tr>
            ) : buckets.map((b) => (
              <tr key={b.key} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  {b.label}
                  {b.sub && <p className="text-xs text-muted-foreground font-normal">{b.sub}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{b.studentCount}</td>
                <td className="px-4 py-3">{fmt(b.totalFeeValue)}</td>
                <td className="px-4 py-3 text-green-700">{fmt(b.collected)}</td>
                <td className="px-4 py-3 text-purple-700">{b.awaitingApproval > 0 ? fmt(b.awaitingApproval) : '—'}</td>
                <td className="px-4 py-3 font-semibold">
                  {b.outstanding > 0 ? <span className="text-amber-600">{fmt(b.outstanding)}</span> : <span className="text-muted-foreground">{fmt(0)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-sm font-semibold">EMI Default Tracking</p>
          <div className="flex items-center gap-2 text-xs">
            <Percent className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold">{data.emi.defaultRatePct}%</span>
            <span className="text-muted-foreground">default rate · {data.emi.overdueCount} of {data.emi.totalDueSoFar} due EMI installments overdue · {data.emi.emiPlansCount} EMI plans</span>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Sales Person</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.emi.overdueInstallments.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No overdue EMI installments</td></tr>
            ) : data.emi.overdueInstallments.map((o) => (
              <tr key={o.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  {o.studentName}
                  <p className="text-xs text-muted-foreground font-normal">{o.studentPhone}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{o.courseName}</td>
                <td className="px-4 py-3 font-semibold">{fmt(o.amount)}</td>
                <td className="px-4 py-3 text-red-600 font-medium">{new Date(o.dueDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-muted-foreground">{o.assignedTo ? `${o.assignedTo.firstName} ${o.assignedTo.lastName}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
