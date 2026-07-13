import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useRole } from '@/hooks/useAuth';
import {
  Lock, Plus, X, Wallet, Clock, CheckCircle2, BookOpen, PiggyBank, PieChart,
  Store, Repeat, Pencil, Trash2, Sparkles, RefreshCw, FileBarChart, Download, RotateCcw, History,
} from 'lucide-react';

type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
interface EmployeeLite { id: string; firstName: string; lastName: string; employeeCode?: string; }
interface VendorLite { id: string; name: string; category?: string | null; status?: 'ACTIVE' | 'INACTIVE'; }
interface Vendor extends VendorLite {
  contactPerson?: string | null; phone?: string | null; email?: string | null; address?: string | null;
  gstNumber?: string | null; panNumber?: string | null; bankName?: string | null; bankAccountNo?: string | null; ifscCode?: string | null;
  notes?: string | null;
}
interface RecurringTemplate {
  id: string; title: string; category?: string | null; amount: number; paymentMode?: string | null;
  notes?: string | null; isActive: boolean; vendor?: VendorLite | null;
}
interface Expense {
  id: string; title: string; category?: string | null; miscDescription?: string | null; amount: number; status: ExpenseStatus;
  voucherNo?: string | null; billNo?: string | null; paymentMode?: string | null; expenseDate: string;
  billCopyUrl?: string | null; paymentProofUrl?: string | null;
  notes?: string | null; createdAt: string; paidAt?: string | null;
  requestedBy?: EmployeeLite | null; approvedBy?: EmployeeLite | null; vendor?: VendorLite | null;
}
interface Stats { statusTotals: Record<string, { amount: number; count: number }>; spentThisMonth: number; }
interface LedgerRow {
  date: string; type: 'CREDIT' | 'DEBIT'; particulars: string; voucherNo?: string | null;
  billNo?: string | null; paymentMode?: string | null; party?: string | null;
  debit: number; credit: number; balance: number; notes?: string | null;
}
interface LedgerData { openingBalance: number; totalCredits: number; totalDebits: number; closingBalance: number; entries: LedgerRow[]; }
interface FundReceipt { id: string; amount: number; receivedDate: string; notes?: string | null; recordedBy?: EmployeeLite | null; }
interface CategoryRow { category: string; amount: number; }
interface ReportBreakdownRow { key: string; amount: number; count: number; }
interface ReportData {
  entries: Expense[]; totalAmount: number; count: number;
  byCategory: ReportBreakdownRow[]; byPaymentMode: ReportBreakdownRow[]; byVendor: ReportBreakdownRow[]; byUser: ReportBreakdownRow[];
}
interface BudgetAllocationRow {
  id: string; amount: number; notes?: string | null; allocatedDate: string;
  employee?: EmployeeLite | null; allocatedBy?: EmployeeLite | null; employeeId?: string;
}
interface BudgetSummaryRow { employeeId: string; employee: EmployeeLite; allocated: number; spent: number; balance: number; }
interface MyBudget { allocated: number; spent: number; balance: number; allocations: BudgetAllocationRow[]; }
interface AuditLogEntry {
  id: string;
  action: string;
  entityId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  createdAt: string;
  user?: { id: string; email: string; employee?: { firstName: string; lastName: string; employeeCode?: string } | null } | null;
}

const STATUSES: ExpenseStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'PAID'];
const STATUS_COLOR: Record<ExpenseStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
  PAID: 'bg-green-100 text-green-700',
};
const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EXPENSE_CATEGORIES = [
  'Stationery', 'Internet & Telephone', 'Electricity', 'Rent', 'Housekeeping',
  'Courier & Postage', 'Travel & Conveyance', 'Refreshments', 'Repairs & Maintenance',
  'Printing & Photocopying', 'Miscellaneous',
];
const BACKEND_URL = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_URL || 'http://localhost:5000';

type Tab = 'register' | 'ledger' | 'funds' | 'vendors' | 'recurring' | 'summary' | 'report' | 'budgets' | 'audit';
const VALID_TABS: Tab[] = ['register', 'ledger', 'funds', 'vendors', 'recurring', 'summary', 'report', 'budgets', 'audit'];
const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'UPI', 'Card', 'Cheque'];
const EMPTY_REPORT_FILTERS = { from: '', to: '', category: '', paymentMode: '', status: '', vendorId: '', requestedById: '', search: '' };

export default function FinanceAdminPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.FINANCE_ADMIN;
  const canEdit = hasModule('FINANCE_ADMIN', 'EDIT');
  const canSeeAll = hasModule('FINANCE_ADMIN', 'ADMIN');
  // Register CRUD (edit / approve / delete) is SUPER_ADMIN only
  const { isSuperAdmin } = useRole();

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab>(tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'register');
  const setTab = (t: Tab) => { setTabState(t); setSearchParams({ tab: t }, { replace: true }); };
  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== tab) setTabState(tabFromUrl);
  }, [tabFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Budgets (SUPER_ADMIN manages; spenders see their own strip)
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummaryRow[]>([]);
  const [budgetAllocations, setBudgetAllocations] = useState<BudgetAllocationRow[]>([]);
  const [myBudget, setMyBudget] = useState<MyBudget | null>(null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetAllocationRow | null>(null);

  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [funds, setFunds] = useState<FundReceipt[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [prevMonthTotal, setPrevMonthTotal] = useState<number | null>(null);
  const [showAddFund, setShowAddFund] = useState(false);
  const [editingFund, setEditingFund] = useState<FundReceipt | null>(null);

  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  const [recurring, setRecurring] = useState<RecurringTemplate[]>([]);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTemplate | null>(null);
  const [generating, setGenerating] = useState(false);

  const [reportFilters, setReportFilters] = useState(EMPTY_REPORT_FILTERS);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchAll = useCallback(async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = { page: targetPage, limit: 50 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [listRes, statsRes] = await Promise.all([
        api.get('/api/finance-admin', { params }),
        api.get('/api/finance-admin/stats'),
      ]);
      setExpenses(listRes.data.data);
      setStats(statsRes.data.data);
      const meta = listRes.data.meta;
      if (meta) {
        setTotalPages(meta.pages ?? 1);
        setTotalCount(meta.total ?? 0);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  const fetchLedger = useCallback(async () => {
    if (!canSeeAll) return;
    try {
      const res = await api.get('/api/finance-admin/ledger', { params: { month, year } });
      setLedger(res.data.data);
    } catch { /* non-admins simply won't see this tab */ }
  }, [canSeeAll, month, year]);

  const fetchFunds = useCallback(async () => {
    if (!canSeeAll) return;
    try {
      const res = await api.get('/api/finance-admin/funds', { params: { month, year } });
      setFunds(res.data.data);
    } catch { /* ignore */ }
  }, [canSeeAll, month, year]);

  const fetchSummary = useCallback(async () => {
    if (!canSeeAll) return;
    try {
      const res = await api.get('/api/finance-admin/category-summary', { params: { month, year } });
      setCategories(res.data.data.categories);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const prevRes = await api.get('/api/finance-admin/category-summary', { params: { month: prevMonth, year: prevYear } });
      setPrevMonthTotal(prevRes.data.data.total ?? 0);
    } catch { /* ignore */ }
  }, [canSeeAll, month, year]);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await api.get('/api/finance-admin/vendors');
      setVendors(res.data.data || []);
    } catch { setVendors([]); }
  }, []);

  const fetchRecurring = useCallback(async () => {
    if (!canSeeAll) return;
    try {
      const res = await api.get('/api/finance-admin/recurring');
      setRecurring(res.data.data || []);
    } catch { /* ignore */ }
  }, [canSeeAll]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const params: Record<string, string> = {};
      Object.entries(reportFilters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await api.get('/api/finance-admin/report', { params });
      setReportData(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load report');
    } finally {
      setReportLoading(false);
    }
  }, [reportFilters]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (level) fetchAll(page); }, [level, page, fetchAll]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (level && tab === 'ledger') fetchLedger(); }, [level, tab, fetchLedger]);
  useEffect(() => { if (level && tab === 'funds') fetchFunds(); }, [level, tab, fetchFunds]);
  useEffect(() => { if (level && tab === 'summary') { fetchSummary(); fetchLedger(); } }, [level, tab, fetchSummary, fetchLedger]);
  useEffect(() => { if (level && tab === 'recurring') fetchRecurring(); }, [level, tab, fetchRecurring]);
  useEffect(() => { if (level && tab === 'report') fetchReport(); }, [level, tab, fetchReport]);

  useEffect(() => {
    api.get('/api/employees?limit=200').then((res) => setEmployees(res.data.data || [])).catch(() => setEmployees([]));
    if (level) fetchVendors();
  }, [level, fetchVendors]);

  const updateStatus = async (id: string, status: ExpenseStatus) => {
    try {
      await api.put(`/api/finance-admin/${id}/status`, { status });
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to update status');
    }
  };

  const fetchBudgets = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const { data } = await api.get('/api/finance-admin/budgets');
      setBudgetSummary(data.data?.summary || []);
      setBudgetAllocations(data.data?.allocations || []);
    } catch { /* ignore */ }
  }, [isSuperAdmin]);

  useEffect(() => { if (tab === 'budgets') fetchBudgets(); }, [tab, fetchBudgets]);

  const fetchAuditLogs = useCallback(async () => {
    if (!isSuperAdmin) return;
    setAuditLoading(true);
    try {
      const res = await api.get('/api/finance-admin/audit', { params: { limit: 200 } });
      setAuditLogs(res.data.data || []);
    } catch { /* ignore */ } finally { setAuditLoading(false); }
  }, [isSuperAdmin]);

  useEffect(() => { if (tab === 'audit') fetchAuditLogs(); }, [tab, fetchAuditLogs]);

  // Spender's own budget strip on the register tab
  useEffect(() => {
    if (tab !== 'register') return;
    api.get('/api/finance-admin/budgets/my')
      .then((r) => setMyBudget(r.data.data || null))
      .catch(() => setMyBudget(null));
  }, [tab]);

  const deleteBudget = async (b: BudgetAllocationRow) => {
    const who = b.employee ? `${b.employee.firstName} ${b.employee.lastName}` : 'employee';
    if (!confirm(`Delete this ${fmt(b.amount)} allocation to ${who}?`)) return;
    try {
      await api.delete(`/api/finance-admin/budgets/${b.id}`);
      fetchBudgets();
    } catch (err: unknown) {
      const er = err as { response?: { data?: { message?: string } } };
      setError(er.response?.data?.message || 'Failed to delete allocation');
    }
  };

  const deleteExpense = async (e: Expense) => {
    if (!confirm(`Delete expense "${e.title}" (${fmt(e.amount)})?\n\nThis cannot be undone.`)) return;
    try {
      await api.delete(`/api/finance-admin/${e.id}`);
      fetchAll();
    } catch (err: unknown) {
      const er = err as { response?: { data?: { message?: string } } };
      setError(er.response?.data?.message || 'Failed to delete expense');
    }
  };

  const deleteVendor = async (id: string) => {
    if (!confirm('Delete this vendor?')) return;
    try { await api.delete(`/api/finance-admin/vendors/${id}`); fetchVendors(); }
    catch (err: unknown) { const e = err as { response?: { data?: { message?: string } } }; setError(e.response?.data?.message || 'Failed to delete vendor'); }
  };

  const deleteRecurring = async (id: string) => {
    if (!confirm('Delete this recurring template?')) return;
    try { await api.delete(`/api/finance-admin/recurring/${id}`); fetchRecurring(); }
    catch (err: unknown) { const e = err as { response?: { data?: { message?: string } } }; setError(e.response?.data?.message || 'Failed to delete template'); }
  };

  const generateThisMonth = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await api.post('/api/finance-admin/recurring/generate', { month, year });
      fetchRecurring();
      fetchAll();
      alert(res.data.message || 'Generated');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to generate expenses');
    } finally {
      setGenerating(false);
    }
  };

  if (loaded && !level) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <Lock className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">No access to Finance (Admin)</p>
          <p className="text-sm text-muted-foreground">Ask someone with Master Control to grant you access to this module.</p>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'register', label: canSeeAll ? 'Expense Register' : 'My Expenses', icon: Wallet },
    { id: 'report', label: 'Reports', icon: FileBarChart },
    ...(canSeeAll ? [
      { id: 'ledger' as Tab, label: 'HO Ledger', icon: BookOpen },
      { id: 'funds' as Tab, label: 'HO Funds', icon: PiggyBank },
      { id: 'vendors' as Tab, label: 'Vendors', icon: Store },
      { id: 'recurring' as Tab, label: 'Recurring Expenses', icon: Repeat },
      { id: 'summary' as Tab, label: 'Category Summary', icon: PieChart },
    ] : []),
    ...(isSuperAdmin ? [
      { id: 'budgets' as Tab, label: 'Budgets', icon: PiggyBank },
      { id: 'audit' as Tab, label: 'Audit Log', icon: History },
    ] : []),
  ];

  const exportReportCsv = () => {
    if (!reportData || reportData.entries.length === 0) return;
    const headers = ['Date', 'Voucher No', 'Title', 'Category', 'Bill No', 'Vendor', 'Amount', 'Payment Mode', 'Spent By', 'Status'];
    const rows = reportData.entries.map((e) => [
      new Date(e.expenseDate).toLocaleDateString(),
      e.voucherNo || '',
      e.title,
      e.category === 'Miscellaneous' && e.miscDescription ? `Miscellaneous: ${e.miscDescription}` : (e.category || ''),
      e.billNo || '',
      e.vendor?.name || '',
      String(e.amount),
      e.paymentMode || '',
      e.requestedBy ? `${e.requestedBy.firstName} ${e.requestedBy.lastName}` : '',
      e.status,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Finance (Admin)</h1>
          <p className="text-muted-foreground text-sm">
            {canSeeAll
              ? 'Admin/office expenses funded monthly by Head Office (HO)'
              : 'Your admin/office expenses'}
          </p>
        </div>
        {tab === 'register' && canEdit && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Expense
          </button>
        )}
        {tab === 'report' && (
          <button onClick={exportReportCsv} disabled={!reportData || reportData.entries.length === 0} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        )}
        {tab === 'budgets' && isSuperAdmin && (
          <button onClick={() => { setEditingBudget(null); setShowBudgetModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Allot Budget
          </button>
        )}
        {tab === 'funds' && canSeeAll && (
          <button onClick={() => setShowAddFund(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Record HO Fund
          </button>
        )}
        {tab === 'vendors' && canSeeAll && (
          <button onClick={() => { setEditingVendor(null); setShowVendorModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Vendor
          </button>
        )}
        {tab === 'recurring' && canSeeAll && (
          <div className="flex items-center gap-2">
            <button onClick={generateThisMonth} disabled={generating} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} /> Generate for {MONTHS[month - 1]} {year}
            </button>
            <button onClick={() => { setEditingRecurring(null); setShowRecurringModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus className="w-4 h-4" /> New Template
            </button>
          </div>
        )}
      </div>

      {tabs.length > 1 && (
        <div className="flex items-center gap-1 border-b">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>
      )}

      {(tab === 'ledger' || tab === 'funds' || tab === 'summary' || tab === 'recurring') && (
        <div className="flex items-center gap-3">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border rounded-lg text-sm">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border rounded-lg text-sm">
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {tab === 'register' && (
        <>
          {myBudget && (
            <div className={`border rounded-xl p-4 flex flex-wrap items-center gap-x-8 gap-y-2 ${myBudget.balance < 0 ? 'bg-red-50 border-red-200' : 'bg-blue-50/50 border-blue-200'}`}>
              <p className="text-sm font-semibold flex items-center gap-2"><PiggyBank className="w-4 h-4" /> My Budget</p>
              <p className="text-sm">Given: <span className="font-bold">{fmt(myBudget.allocated)}</span></p>
              <p className="text-sm">Spent: <span className="font-bold">{fmt(myBudget.spent)}</span></p>
              <p className="text-sm">Balance: <span className={`font-bold ${myBudget.balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmt(myBudget.balance)}</span></p>
              {myBudget.balance < 0 && <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Over budget</span>}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Clock} label="Pending" value={stats?.statusTotals?.PENDING?.count ?? 0} sub={fmt(stats?.statusTotals?.PENDING?.amount ?? 0)} />
            <StatCard icon={CheckCircle2} label="Approved" value={stats?.statusTotals?.APPROVED?.count ?? 0} sub={fmt(stats?.statusTotals?.APPROVED?.amount ?? 0)} />
            <StatCard icon={Wallet} label="Paid" value={stats?.statusTotals?.PAID?.count ?? 0} sub={fmt(stats?.statusTotals?.PAID?.amount ?? 0)} />
            <StatCard icon={Wallet} label="Spent This Month" value={fmt(stats?.spentThisMonth ?? 0)} />
          </div>

          <div className="flex items-center gap-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title..." className="px-3 py-2 border rounded-lg text-sm w-64" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="bg-card border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Voucher</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Bill No.</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Amount</th>
                  {canSeeAll && <th className="px-4 py-3">Spent By</th>}
                  <th className="px-4 py-3">Attachments</th>
                  <th className="px-4 py-3">Status</th>
                  {isSuperAdmin && <th className="px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : expenses.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No expenses recorded</td></tr>
                ) : expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(e.expenseDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.voucherNo || '—'}</td>
                    <td className="px-4 py-3 font-medium">{e.title}{e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.category || '—'}
                      {e.category === 'Miscellaneous' && e.miscDescription && (
                        <p className="text-xs text-muted-foreground">{e.miscDescription}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.billNo || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.vendor?.name || '—'}</td>
                    <td className="px-4 py-3 font-semibold">{fmt(e.amount)}</td>
                    {canSeeAll && <td className="px-4 py-3">{e.requestedBy ? `${e.requestedBy.firstName} ${e.requestedBy.lastName}` : '—'}</td>}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {e.billCopyUrl && (
                          <a href={`${BACKEND_URL}${e.billCopyUrl}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Bill copy</a>
                        )}
                        {e.paymentProofUrl && (
                          <a href={`${BACKEND_URL}${e.paymentProofUrl}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Payment proof</a>
                        )}
                        {!e.billCopyUrl && !e.paymentProofUrl && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isSuperAdmin ? (
                        <select
                          value={e.status}
                          onChange={(ev) => updateStatus(e.id, ev.target.value as ExpenseStatus)}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${STATUS_COLOR[e.status]}`}
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLOR[e.status]}`}>{e.status}</span>
                      )}
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingExpense(e); setShowAdd(true); }}
                            title="Edit expense"
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteExpense(e)}
                            title="Delete expense"
                            className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Showing {expenses.length === 0 ? 0 : (page - 1) * 50 + 1}–{(page - 1) * 50 + expenses.length} of {totalCount} expenses
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-muted disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="px-2 font-medium">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-muted disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'report' && (
        <div className="space-y-4">
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Filters</p>
              <button
                onClick={() => setReportFilters(EMPTY_REPORT_FILTERS)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">From date</label>
                <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={reportFilters.from} onChange={(e) => setReportFilters({ ...reportFilters, from: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To date</label>
                <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={reportFilters.to} onChange={(e) => setReportFilters({ ...reportFilters, to: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <select className="w-full px-3 py-2 border rounded-lg text-sm" value={reportFilters.category} onChange={(e) => setReportFilters({ ...reportFilters, category: e.target.value })}>
                  <option value="">All categories</option>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Payment method</label>
                <select className="w-full px-3 py-2 border rounded-lg text-sm" value={reportFilters.paymentMode} onChange={(e) => setReportFilters({ ...reportFilters, paymentMode: e.target.value })}>
                  <option value="">All payment methods</option>
                  {PAYMENT_MODES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <select className="w-full px-3 py-2 border rounded-lg text-sm" value={reportFilters.status} onChange={(e) => setReportFilters({ ...reportFilters, status: e.target.value })}>
                  <option value="">All statuses</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {vendors.length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground">Vendor</label>
                  <select className="w-full px-3 py-2 border rounded-lg text-sm" value={reportFilters.vendorId} onChange={(e) => setReportFilters({ ...reportFilters, vendorId: e.target.value })}>
                    <option value="">All vendors</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}
              {canSeeAll && employees.length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground">User (Spent By)</label>
                  <select className="w-full px-3 py-2 border rounded-lg text-sm" value={reportFilters.requestedById} onChange={(e) => setReportFilters({ ...reportFilters, requestedById: e.target.value })}>
                    <option value="">All users</option>
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">Search title</label>
                <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Search..." value={reportFilters.search} onChange={(e) => setReportFilters({ ...reportFilters, search: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard icon={Wallet} label="Total Amount" value={fmt(reportData?.totalAmount ?? 0)} />
            <StatCard icon={FileBarChart} label="Matching Expenses" value={reportData?.count ?? 0} />
            <StatCard icon={PieChart} label="Categories Involved" value={reportData?.byCategory.length ?? 0} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BreakdownPanel title="By Category" rows={reportData?.byCategory ?? []} />
            <BreakdownPanel title="By Payment Method" rows={reportData?.byPaymentMode ?? []} />
            {canSeeAll ? (
              <BreakdownPanel title="By User" rows={reportData?.byUser ?? []} />
            ) : (
              <BreakdownPanel title="By Vendor" rows={reportData?.byVendor ?? []} />
            )}
          </div>

          <div className="bg-card border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Bill No.</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Payment Mode</th>
                  <th className="px-4 py-3">Amount</th>
                  {canSeeAll && <th className="px-4 py-3">Spent By</th>}
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reportLoading ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : !reportData || reportData.entries.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No expenses match these filters</td></tr>
                ) : reportData.entries.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(e.expenseDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium">{e.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.category || '—'}
                      {e.category === 'Miscellaneous' && e.miscDescription && (
                        <p className="text-xs text-muted-foreground">{e.miscDescription}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.billNo || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.vendor?.name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.paymentMode || '—'}</td>
                    <td className="px-4 py-3 font-semibold">{fmt(e.amount)}</td>
                    {canSeeAll && <td className="px-4 py-3">{e.requestedBy ? `${e.requestedBy.firstName} ${e.requestedBy.lastName}` : '—'}</td>}
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLOR[e.status]}`}>{e.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'ledger' && canSeeAll && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Wallet} label="Opening Balance" value={fmt(ledger?.openingBalance ?? 0)} />
            <StatCard icon={PiggyBank} label="Funds Received (HO)" value={fmt(ledger?.totalCredits ?? 0)} />
            <StatCard icon={Wallet} label="Total Expenses" value={fmt(ledger?.totalDebits ?? 0)} />
            <StatCard icon={CheckCircle2} label="Closing Balance" value={fmt(ledger?.closingBalance ?? 0)} />
          </div>
          <div className="bg-card border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Particulars</th>
                  <th className="px-4 py-3">Vendor/Employee</th>
                  <th className="px-4 py-3">Debit</th>
                  <th className="px-4 py-3">Credit</th>
                  <th className="px-4 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!ledger || ledger.entries.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No entries this month</td></tr>
                ) : ledger.entries.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(row.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium">{row.particulars}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.party || '—'}</td>
                    <td className="px-4 py-3">{row.debit ? fmt(row.debit) : '—'}</td>
                    <td className="px-4 py-3 text-green-700">{row.credit ? fmt(row.credit) : '—'}</td>
                    <td className="px-4 py-3 font-semibold">{fmt(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'funds' && canSeeAll && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Recorded By</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {funds.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No HO funds recorded this month</td></tr>
              ) : funds.map((f) => (
                <tr key={f.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(f.receivedDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{fmt(f.amount)}</td>
                  <td className="px-4 py-3">{f.recordedBy ? `${f.recordedBy.firstName} ${f.recordedBy.lastName}` : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{f.notes || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setEditingFund(f)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={async () => { if (!window.confirm('Delete this fund receipt?')) return; try { await api.delete(`/api/finance-admin/funds/${f.id}`); fetchFunds(); fetchLedger(); } catch { setError('Failed to delete fund receipt'); } }} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'vendors' && canSeeAll && (
        <div className="bg-card border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">GST / PAN</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vendors.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No vendors added yet</td></tr>
              ) : vendors.map((v) => (
                <tr key={v.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{v.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.category || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {v.contactPerson || '—'}{v.phone ? ` · ${v.phone}` : ''}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {v.gstNumber || '—'}{v.panNumber ? ` / ${v.panNumber}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${v.status === 'INACTIVE' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                      {v.status || 'ACTIVE'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => { setEditingVendor(v); setShowVendorModal(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteVendor(v.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'recurring' && canSeeAll && (
        <div className="bg-card border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recurring.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No recurring expense templates yet</td></tr>
              ) : recurring.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{r.title}{r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.category || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.vendor?.name || '—'}</td>
                  <td className="px-4 py-3 font-semibold">{fmt(r.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {r.isActive ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => { setEditingRecurring(r); setShowRecurringModal(true); }} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteRecurring(r.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'summary' && canSeeAll && (
        <div className="space-y-4">
          {(() => {
            const total = categories.reduce((s, c) => s + c.amount, 0);
            const top = categories.length > 0 ? categories.reduce((a, b) => (b.amount > a.amount ? b : a)) : null;
            const momChange = prevMonthTotal && prevMonthTotal > 0 ? ((total - prevMonthTotal) / prevMonthTotal) * 100 : null;
            const largest = ledger?.entries?.filter((e) => e.type === 'DEBIT').reduce((a, b) => (!a || b.debit > a.debit ? b : a), null as LedgerRow | null);
            if (!top && momChange === null && !largest) return null;
            return (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900 space-y-1">
                  <p className="font-semibold">Insights for {MONTHS[month - 1]} {year}</p>
                  {top && <p>Top category: <strong>{top.category}</strong> ({fmt(top.amount)})</p>}
                  {momChange !== null && (
                    <p>Spend is <strong>{momChange >= 0 ? `up ${momChange.toFixed(1)}%` : `down ${Math.abs(momChange).toFixed(1)}%`}</strong> vs. last month</p>
                  )}
                  {largest && <p>Largest single expense: <strong>{largest.particulars}</strong> ({fmt(largest.debit)})</p>}
                </div>
              </div>
            );
          })()}
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {categories.length === 0 ? (
                  <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">No expenses this month</td></tr>
                ) : categories.map((c) => (
                  <tr key={c.category} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{c.category}</td>
                    <td className="px-4 py-3 font-semibold">{fmt(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
              {categories.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/30 font-semibold">
                    <td className="px-4 py-3">Total Expenses</td>
                    <td className="px-4 py-3">{fmt(categories.reduce((s, c) => s + c.amount, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {tab === 'budgets' && isSuperAdmin && (
        <div className="space-y-6">
          {/* Per-employee position */}
          <div className="bg-card border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Total Given</th>
                  <th className="px-4 py-3">Spent</th>
                  <th className="px-4 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {budgetSummary.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No budgets allotted yet — click "Allot Budget" to give someone spending money.</td></tr>
                ) : budgetSummary.map((r) => (
                  <tr key={r.employeeId} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{r.employee.firstName} {r.employee.lastName} <span className="text-xs text-muted-foreground">({r.employee.employeeCode})</span></td>
                    <td className="px-4 py-3">{fmt(r.allocated)}</td>
                    <td className="px-4 py-3">{fmt(r.spent)}</td>
                    <td className={`px-4 py-3 font-bold ${r.balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {fmt(r.balance)}
                      {r.balance < 0 && <span className="ml-2 text-[10px] font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">OVER</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Allocation entries */}
          <div>
            <p className="text-sm font-medium mb-2">Allocation Entries</p>
            <div className="bg-card border rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Notes</th>
                    <th className="px-4 py-3">Allotted By</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {budgetAllocations.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No allocations yet</td></tr>
                  ) : budgetAllocations.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(b.allocatedDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-medium">{b.employee ? `${b.employee.firstName} ${b.employee.lastName}` : '—'}</td>
                      <td className="px-4 py-3 font-semibold">{fmt(b.amount)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.notes || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.allocatedBy ? `${b.allocatedBy.firstName} ${b.allocatedBy.lastName}` : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditingBudget(b); setShowBudgetModal(true); }} title="Edit"
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteBudget(b)} title="Delete"
                            className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && isSuperAdmin && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">All edits and deletes made on expense entries by admin users.</p>
            <button onClick={fetchAuditLogs} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-muted">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          <div className="bg-card border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3">Expense</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Done By</th>
                  <th className="px-4 py-3">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : auditLogs.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No audit entries yet — edits and deletes will appear here.</td></tr>
                ) : auditLogs.map((log) => {
                  const old = log.oldData || {};
                  const next = log.newData || {};
                  const isDelete = log.action === 'DELETE';
                  // For edits: find changed fields (skip timestamps, ids, relation objects)
                  const SKIP = new Set(['updatedAt', 'createdAt', 'id', 'requestedById', 'approvedById', 'vendorId', 'recurringTemplateId', 'requestedBy', 'approvedBy', 'vendor']);
                  const changed = isDelete ? [] : Object.keys(old).filter((k) => !SKIP.has(k) && JSON.stringify(old[k]) !== JSON.stringify(next[k]));
                  const who = log.user?.employee
                    ? `${log.user.employee.firstName} ${log.user.employee.lastName}`
                    : (log.user?.email || '—');
                  return (
                    <tr key={log.id} className="hover:bg-muted/30 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {new Date(log.createdAt).toLocaleDateString()}<br />
                        <span className="text-xs">{new Date(log.createdAt).toLocaleTimeString()}</span>
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[180px]">
                        <span className="line-clamp-2">{String(old.title || '—')}</span>
                        {!!old.category && <span className="text-xs text-muted-foreground">{String(old.category)}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${isDelete ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isDelete ? <Trash2 className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                          {isDelete ? 'DELETED' : 'EDITED'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold">{old.amount != null ? fmt(Number(old.amount)) : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {who}
                        {log.user?.employee?.employeeCode && (
                          <span className="block text-xs text-muted-foreground">{log.user.employee.employeeCode}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[240px]">
                        {isDelete ? (
                          <span className="text-red-600">Expense permanently removed</span>
                        ) : changed.length === 0 ? (
                          <span className="text-muted-foreground">No field changes recorded</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {changed.map((k) => (
                              <li key={k}>
                                <span className="font-medium capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>:{' '}
                                <span className="text-red-600 line-through">{old[k] != null ? String(old[k]) : '—'}</span>{' '}
                                → <span className="text-green-700">{next[k] != null ? String(next[k]) : '—'}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showBudgetModal && (
        <BudgetModal
          allocation={editingBudget}
          employees={employees}
          saving={saving}
          setSaving={setSaving}
          onClose={() => { setShowBudgetModal(false); setEditingBudget(null); }}
          onSaved={() => { setShowBudgetModal(false); setEditingBudget(null); fetchBudgets(); }}
          setError={setError}
        />
      )}

      {showAdd && (
        <AddExpenseModal
          expense={editingExpense}
          vendors={vendors}
          saving={saving}
          setSaving={setSaving}
          onClose={() => { setShowAdd(false); setEditingExpense(null); }}
          onSaved={() => { setShowAdd(false); setEditingExpense(null); fetchAll(); }}
          setError={setError}
        />
      )}

      {showAddFund && (
        <AddFundModal
          saving={saving}
          setSaving={setSaving}
          onClose={() => setShowAddFund(false)}
          onSaved={() => { setShowAddFund(false); fetchFunds(); fetchLedger(); }}
          setError={setError}
        />
      )}

      {editingFund && (
        <EditFundModal
          fund={editingFund}
          saving={saving}
          setSaving={setSaving}
          onClose={() => setEditingFund(null)}
          onSaved={() => { setEditingFund(null); fetchFunds(); fetchLedger(); }}
          setError={setError}
        />
      )}

      {showVendorModal && (
        <VendorModal
          vendor={editingVendor}
          saving={saving}
          setSaving={setSaving}
          onClose={() => { setShowVendorModal(false); setEditingVendor(null); }}
          onSaved={() => { setShowVendorModal(false); setEditingVendor(null); fetchVendors(); }}
          setError={setError}
        />
      )}

      {showRecurringModal && (
        <RecurringModal
          template={editingRecurring}
          vendors={vendors}
          saving={saving}
          setSaving={setSaving}
          onClose={() => { setShowRecurringModal(false); setEditingRecurring(null); }}
          onSaved={() => { setShowRecurringModal(false); setEditingRecurring(null); fetchRecurring(); }}
          setError={setError}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-orange-600" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function BreakdownPanel({ title, rows }: { title: string; rows: { key: string; amount: number; count: number }[] }) {
  return (
    <div className="bg-card border rounded-xl p-4">
      <p className="text-sm font-medium mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data</p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground truncate pr-2">{r.key} <span className="text-xs">({r.count})</span></span>
              <span className="font-medium whitespace-nowrap">{fmt(r.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddExpenseModal({ expense, vendors, saving, setSaving, onClose, onSaved, setError }: {
  expense?: Expense | null; vendors: Vendor[]; saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({
    title: expense?.title || '',
    category: expense?.category || '',
    miscDescription: expense?.miscDescription || '',
    amount: expense ? String(expense.amount) : '',
    notes: expense?.notes || '',
    vendorId: expense?.vendor?.id || '',
    voucherNo: expense?.voucherNo || '',
    billNo: expense?.billNo || '',
    paymentMode: expense?.paymentMode || '',
    expenseDate: (expense?.expenseDate || new Date().toISOString()).slice(0, 10),
  });
  const [billCopy, setBillCopy] = useState<File | null>(null);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);

  const submit = async () => {
    if (!form.title || !form.amount) { setError('Title and amount are required'); return; }
    if (form.category === 'Miscellaneous' && !form.miscDescription) { setError('Please describe the miscellaneous expense'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('category', form.category);
      if (form.category === 'Miscellaneous') fd.append('miscDescription', form.miscDescription);
      fd.append('amount', form.amount);
      fd.append('notes', form.notes);
      if (form.vendorId) fd.append('vendorId', form.vendorId);
      fd.append('voucherNo', form.voucherNo);
      fd.append('billNo', form.billNo);
      fd.append('paymentMode', form.paymentMode);
      fd.append('expenseDate', form.expenseDate);
      if (billCopy) fd.append('billCopy', billCopy);
      if (paymentProof) fd.append('paymentProof', paymentProof);
      if (expense) {
        await api.put(`/api/finance-admin/${expense.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/api/finance-admin', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || `Failed to ${expense ? 'update' : 'create'} expense`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{expense ? `Edit Expense — ${expense.title}` : 'New Admin Expense'}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">Select category</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {form.category === 'Miscellaneous' && (
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Describe the miscellaneous expense *" value={form.miscDescription} onChange={(e) => setForm({ ...form, miscDescription: e.target.value })} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Amount *" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Voucher No." value={form.voucherNo} onChange={(e) => setForm({ ...form, voucherNo: e.target.value })} />
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Bill No." value={form.billNo} onChange={(e) => setForm({ ...form, billNo: e.target.value })} />
          </div>
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
            <option value="">Payment mode (optional)</option>
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="UPI">UPI</option>
            <option value="Card">Card</option>
            <option value="Cheque">Cheque</option>
          </select>
          <div>
            <label className="text-xs text-muted-foreground">Bill copy (Airtel bill, invoice, etc.)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="w-full text-sm border rounded-lg px-3 py-2"
              onChange={(e) => setBillCopy(e.target.files?.[0] || null)} />
          </div>
          {form.paymentMode === 'UPI' && (
            <div>
              <label className="text-xs text-muted-foreground">Payment proof (GPay/UPI screenshot)</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="w-full text-sm border rounded-lg px-3 py-2"
                onChange={(e) => setPaymentProof(e.target.files?.[0] || null)} />
            </div>
          )}
          {vendors.length > 0 && (
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
              <option value="">Vendor (optional)</option>
              {vendors.filter((v) => v.status !== 'INACTIVE').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notes / Remarks" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

function AddFundModal({ saving, setSaving, onClose, onSaved, setError }: {
  saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({ amount: '', receivedDate: new Date().toISOString().slice(0, 10), notes: '' });

  const submit = async () => {
    if (!form.amount) { setError('Amount is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/finance-admin/funds', form);
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to record fund');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Record HO Fund Received</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Amount *" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} />
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Record'}</button>
        </div>
      </div>
    </div>
  );
}

function EditFundModal({ fund, saving, setSaving, onClose, onSaved, setError }: {
  fund: FundReceipt; saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({
    amount: String(fund.amount),
    receivedDate: fund.receivedDate.slice(0, 10),
    notes: fund.notes || '',
  });

  const submit = async () => {
    if (!form.amount) { setError('Amount is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/finance-admin/funds/${fund.id}`, form);
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to update fund receipt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Edit HO Fund Receipt</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Amount *" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.receivedDate} onChange={(e) => setForm({ ...form, receivedDate: e.target.value })} />
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Update'}</button>
        </div>
      </div>
    </div>
  );
}

function VendorModal({ vendor, saving, setSaving, onClose, onSaved, setError }: {
  vendor: Vendor | null; saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({
    name: vendor?.name || '', category: vendor?.category || '', contactPerson: vendor?.contactPerson || '',
    phone: vendor?.phone || '', email: vendor?.email || '', address: vendor?.address || '',
    gstNumber: vendor?.gstNumber || '', panNumber: vendor?.panNumber || '',
    bankName: vendor?.bankName || '', bankAccountNo: vendor?.bankAccountNo || '', ifscCode: vendor?.ifscCode || '',
    notes: vendor?.notes || '', status: vendor?.status || 'ACTIVE',
  });

  const submit = async () => {
    if (!form.name) { setError('Vendor name is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (vendor) await api.put(`/api/finance-admin/vendors/${vendor.id}`, form);
      else await api.post('/api/finance-admin/vendors', form);
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{vendor ? 'Edit Vendor' : 'New Vendor'}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Vendor name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Category (e.g. Stationery)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            {vendor && (
              <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Contact person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="GST number" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} />
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="PAN number" value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Bank name" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Account no." value={form.bankAccountNo} onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })} />
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="IFSC code" value={form.ifscCode} onChange={(e) => setForm({ ...form, ifscCode: e.target.value })} />
          </div>
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : vendor ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

function RecurringModal({ template, vendors, saving, setSaving, onClose, onSaved, setError }: {
  template: RecurringTemplate | null; vendors: Vendor[]; saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({
    title: template?.title || '', category: template?.category || '', amount: template ? String(template.amount) : '',
    vendorId: template?.vendor?.id || '', paymentMode: template?.paymentMode || '', notes: template?.notes || '',
    isActive: template?.isActive ?? true,
  });

  const submit = async () => {
    if (!form.title || !form.amount) { setError('Title and amount are required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, vendorId: form.vendorId || undefined };
      if (template) await api.put(`/api/finance-admin/recurring/${template.id}`, payload);
      else await api.post('/api/finance-admin/recurring', payload);
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{template ? 'Edit Recurring Expense' : 'New Recurring Expense'}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Title * (e.g. Office Rent)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Amount *" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          {vendors.length > 0 && (
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
              <option value="">Vendor (optional)</option>
              {vendors.filter((v) => v.status !== 'INACTIVE').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
            <option value="">Payment mode (optional)</option>
            <option value="Cash">Cash</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="UPI">UPI</option>
            <option value="Card">Card</option>
            <option value="Cheque">Cheque</option>
          </select>
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {template && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active (will be generated each month)
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : template ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

function BudgetModal({ allocation, employees, saving, setSaving, onClose, onSaved, setError }: {
  allocation?: BudgetAllocationRow | null; employees: EmployeeLite[]; saving: boolean;
  setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({
    employeeId: allocation?.employee?.id || '',
    amount: allocation ? String(allocation.amount) : '',
    notes: allocation?.notes || '',
    allocatedDate: (allocation?.allocatedDate || new Date().toISOString()).slice(0, 10),
  });

  const submit = async () => {
    if (!allocation && !form.employeeId) { setError('Select an employee'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError('Enter a positive amount'); return; }
    setSaving(true);
    setError('');
    try {
      if (allocation) {
        await api.put(`/api/finance-admin/budgets/${allocation.id}`, {
          amount: form.amount, notes: form.notes, allocatedDate: form.allocatedDate,
        });
      } else {
        await api.post('/api/finance-admin/budgets', {
          employeeId: form.employeeId, amount: form.amount, notes: form.notes, allocatedDate: form.allocatedDate,
        });
      }
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || `Failed to ${allocation ? 'update' : 'create'} allocation`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-semibold text-lg">
          {allocation
            ? `Edit Allocation — ${allocation.employee ? `${allocation.employee.firstName} ${allocation.employee.lastName}` : ''}`
            : 'Allot Budget'}
        </h2>
        {!allocation && (
          <div>
            <label className="text-xs text-muted-foreground">Employee *</label>
            <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}{e.employeeCode ? ` (${e.employeeCode})` : ''}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground">Amount (₹) *</label>
          <input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. 25000" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Date</label>
          <input type="date" value={form.allocatedDate} onChange={(e) => setForm({ ...form, allocatedDate: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Notes</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. July office spending" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving...' : allocation ? 'Save Changes' : 'Allot Budget'}
          </button>
        </div>
      </div>
    </div>
  );
}
