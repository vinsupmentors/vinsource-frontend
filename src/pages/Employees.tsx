import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Employee, ApiMeta } from '@/types';
import { getInitials, formatDate } from '@/lib/utils';
import { useRole } from '@/hooks/useAuth';
import {
  Search, Plus, Filter, Loader2, AlertCircle, ChevronLeft, ChevronRight,
  Eye, Mail, Users, X, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dept  { id: string; name: string }
interface Desig { id: string; name: string }
interface Branch { id: string; name: string }
interface EmpOption { id: string; firstName: string; lastName: string; employeeCode: string }

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  INACTIVE: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  ON_NOTICE: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  TERMINATED: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400',
  ON_PROBATION: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
};

// ─── Add Employee Modal ───────────────────────────────────────────────────────

// Auto-calculate salary components preview from net take-home
function calcPreview(netStr: string, hasPf = false) {
  const net = parseFloat(netStr);
  if (!net || net <= 0) return null;
  let gross: number;
  let pf: number;
  if (!hasPf) {
    gross = Math.round(net + 200); // only PT deducted
    pf = 0;
  } else {
    const grossWithTds = (net - 841.67) / 0.902;
    gross = grossWithTds > 20833 ? Math.round(grossWithTds) : Math.round((net + 200) / 0.952);
    pf = Math.round(gross * 0.4 * 0.12);
  }
  const basic = Math.round(gross * 0.4);
  const hra = Math.round(basic * 0.4);
  const tds = gross > 20833 ? Math.round((gross * 12 - 250000) * 0.05 / 12) : 0;
  return { gross, basic, hra, pf, tds, pt: 200, hasPf };
}

const DOC_TYPES_FOR_JOINING = [
  { type: 'AADHAAR',      label: 'Aadhaar Card',         required: true },
  { type: 'PAN',          label: 'PAN Card',             required: true },
  { type: 'MARKSHEET_10', label: '10th Marksheet',       required: true },
  { type: 'MARKSHEET_12', label: '12th Marksheet',       required: true },
  { type: 'DEGREE',       label: 'UG Degree Certificate', required: false },
  { type: 'DEGREE_PG',    label: 'PG Degree Certificate', required: false },
  { type: 'RESUME',       label: 'Resume / CV',          required: true },
  { type: 'OTHER',        label: 'Other Document',       required: false },
];

function AddEmployeeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (pw: string) => void }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    gender: '', dateOfBirth: '', joiningDate: '',
    role: 'EMPLOYEE',
    departmentId: '', designationId: '', branchId: '', managerId: '',
    netSalary: '',
    isProbation: true,
    currentCLBalance: '',
    hasPf: false,
  });
  const [depts, setDepts]     = useState<Dept[]>([]);
  const [desigs, setDesigs]   = useState<Desig[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<EmpOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [metaLoading, setMetaLoading] = useState(true);
  // Step 2: document collection after employee created
  const [createdEmpId, setCreatedEmpId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [docsCollected, setDocsCollected] = useState<Record<string, boolean>>({});
  const [docsSubmitting, setDocsSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ data: Dept[] }>('/api/departments').catch(() => ({ data: { data: [] } })),
      api.get<{ data: Desig[] }>('/api/designations').catch(() => ({ data: { data: [] } })),
      api.get<{ data: Branch[] }>('/api/branches').catch(() => ({ data: { data: [] } })),
      api.get<{ data: EmpOption[] }>('/api/employees?limit=200').catch(() => ({ data: { data: [] } })),
    ]).then(([d, des, b, e]) => {
      setDepts(d.data.data ?? []);
      setDesigs(des.data.data ?? []);
      setBranches(b.data.data ?? []);
      setManagers((e.data as any).data ?? []);
    }).finally(() => setMetaLoading(false));
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.joiningDate) {
      setError('First name, last name, email, and joining date are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await api.post<{ data: any }>('/api/employees', form);
      const created = r.data.data;
      setTempPassword(created?.tempPassword ?? '');
      setCreatedEmpId(created?.employee?.id ?? created?.id ?? null);
      // init all required doc types as checked by default
      const init: Record<string, boolean> = {};
      DOC_TYPES_FOR_JOINING.forEach(d => { init[d.type] = d.required; });
      setDocsCollected(init);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to create employee');
    } finally {
      setLoading(false);
    }
  };

  const handleDocsSubmit = async () => {
    const types = Object.entries(docsCollected).filter(([, v]) => v).map(([k]) => k);
    setDocsSubmitting(true);
    try {
      if (types.length > 0 && createdEmpId) {
        await api.post('/api/documents/collect-originals', { employeeId: createdEmpId, types });
      }
    } catch (_) {
      // non-fatal — employee was already created
    } finally {
      setDocsSubmitting(false);
      onCreated(tempPassword);
    }
  };

  // Step 2: document collection screen
  if (createdEmpId) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-lg">Documents Collected at Joining</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Mark which original documents were physically received today</p>
          </div>
          <div className="p-6 space-y-3">
            {DOC_TYPES_FOR_JOINING.map(d => (
              <label key={d.type} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={!!docsCollected[d.type]}
                  onChange={e => setDocsCollected(p => ({ ...p, [d.type]: e.target.checked }))}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm font-medium group-hover:text-primary transition-colors">{d.label}</span>
                {d.required && <span className="text-[10px] text-amber-500 ml-auto">required</span>}
              </label>
            ))}
            <div className="pt-4 flex justify-between gap-3">
              <button
                onClick={() => onCreated(tempPassword)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleDocsSubmit}
                disabled={docsSubmitting}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-60"
              >
                {docsSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save &amp; Finish
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card z-10">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" /> Add New Employee
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {metaLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 dark:bg-red-950/30 p-3 rounded-xl border border-red-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            {/* Personal info */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Personal Information</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name *" value={form.firstName} onChange={set('firstName')} placeholder="Ankit" />
                <Field label="Last Name *" value={form.lastName} onChange={set('lastName')} placeholder="Verma" />
                <Field label="Email *" type="email" value={form.email} onChange={set('email')} placeholder="ankit@company.com" />
                <Field label="Phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Gender</label>
                  <select value={form.gender} onChange={set('gender')} className={selectCls}>
                    <option value="">Select</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <Field label="Date of Birth" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
              </div>
            </div>

            {/* Employment */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Employment Details</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Joining Date *" type="date" value={form.joiningDate} onChange={set('joiningDate')} />
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Probation Status</label>
                  <select
                    value={form.isProbation ? 'true' : 'false'}
                    onChange={(e) => setForm((f) => ({ ...f, isProbation: e.target.value === 'true' }))}
                    className={selectCls}
                  >
                    <option value="true">On Probation (new employee)</option>
                    <option value="false">Confirmed (existing employee)</option>
                  </select>
                </div>
                {!form.isProbation && (
                  <Field
                    label="Current CL Balance"
                    type="number"
                    value={form.currentCLBalance}
                    onChange={set('currentCLBalance')}
                    placeholder="e.g. 5"
                  />
                )}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Role</label>
                  <select value={form.role} onChange={set('role')} className={selectCls}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MANAGER">Manager</option>
                    <option value="HR">HR</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Department</label>
                  <select value={form.departmentId} onChange={set('departmentId')} className={selectCls}>
                    <option value="">Select department</option>
                    {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Designation</label>
                  <select value={form.designationId} onChange={set('designationId')} className={selectCls}>
                    <option value="">Select designation</option>
                    {desigs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Branch</label>
                  <select value={form.branchId} onChange={set('branchId')} className={selectCls}>
                    <option value="">Select branch</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Reporting Manager</label>
                  <select value={form.managerId} onChange={set('managerId')} className={selectCls}>
                    <option value="">No manager</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.employeeCode})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Salary */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Salary</p>
              {/* PF checkbox */}
              <label className="flex items-start gap-3 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.hasPf as boolean}
                  onChange={e => setForm(f => ({ ...f, hasPf: e.target.checked }))}
                  className="w-4 h-4 mt-0.5 rounded accent-blue-600"
                />
                <div>
                  <p className="text-sm font-medium">PF Applicable (Permanent Employee)</p>
                  <p className="text-[11px] text-muted-foreground">When enabled, PF (12% basic) is deducted. Gross is auto-increased so net take-home stays the same.</p>
                </div>
              </label>
              <Field
                label="Monthly Net Take-Home (₹)"
                type="number"
                value={form.netSalary}
                onChange={set('netSalary')}
                placeholder="e.g. 20000"
              />
              {(() => {
                const p = calcPreview(form.netSalary, form.hasPf as boolean);
                if (!p) return null;
                return (
                  <div className="mt-3 bg-muted/40 rounded-xl p-3.5 text-xs space-y-1.5">
                    <p className="font-semibold text-foreground mb-2">Auto-calculated breakdown</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <Row label="Gross Salary" value={`₹${p.gross.toLocaleString('en-IN')}`} />
                      <Row label="Basic" value={`₹${p.basic.toLocaleString('en-IN')}`} />
                      <Row label="HRA" value={`₹${p.hra.toLocaleString('en-IN')}`} />
                      <Row label="Conveyance" value="₹1,600" />
                      <Row label="Medical" value="₹1,250" />
                      {p.hasPf && <Row label="PF (employee 12%)" value={`-₹${p.pf.toLocaleString('en-IN')}`} highlight="red" />}
                      {p.hasPf && <Row label="PF (employer 12%)" value={`₹${p.pf.toLocaleString('en-IN')}`} highlight="amber" />}
                      <Row label="Prof. Tax" value={`-₹${p.pt.toLocaleString('en-IN')}`} highlight="red" />
                      {p.tds > 0 && <Row label="TDS" value={`-₹${p.tds.toLocaleString('en-IN')}`} highlight="red" />}
                    </div>
                    <p className="mt-2 font-semibold text-green-600">Net Take-Home: ₹{parseFloat(form.netSalary).toLocaleString('en-IN')}</p>
                  </div>
                );
              })()}
            </div>

            {/* Note about password */}
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-3.5 text-sm text-blue-700 dark:text-blue-300">
              A temporary password will be auto-generated and shown after creation. The employee must change it on first login.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-60">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {loading ? 'Creating…' : 'Create Employee'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

const selectCls = 'w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30';

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: 'red' | 'amber' }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium text-right', highlight === 'red' ? 'text-red-500' : highlight === 'amber' ? 'text-amber-600' : 'text-foreground')}>
        {value}
      </span>
    </>
  );
}

// ─── Success banner showing temp password ─────────────────────────────────────

function TempPasswordBanner({ password, onDismiss }: { password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
            <Check className="w-4 h-4" /> Employee created successfully!
          </p>
          <p className="text-sm text-green-600 dark:text-green-300 mt-1">
            Share this temporary password with the employee. They must change it on first login.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="text-sm font-mono bg-white dark:bg-background border px-3 py-1.5 rounded-lg text-green-800 dark:text-green-200">
              {password}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="text-xs px-2.5 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <button onClick={onDismiss} className="text-green-600 hover:text-green-800 flex-shrink-0"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Employees() {
  const navigate = useNavigate();
  const { can } = useRole();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (statusFilter) params.append('status', statusFilter);
      const r = await api.get<{ data: Employee[]; meta: ApiMeta }>(`/api/employees?${params}`);
      setEmployees(r.data.data ?? []);
      setMeta(r.data.meta);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const handleCreated = (pw: string) => {
    setShowAddModal(false);
    setTempPassword(pw);
    fetchEmployees();
  };

  return (
    <div className="space-y-5">
      {/* Add Employee Modal */}
      {showAddModal && (
        <AddEmployeeModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-muted-foreground text-sm">{meta?.total ?? 0} total employees</p>
        </div>
        {can('HR') && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        )}
      </div>

      {/* Temp password banner */}
      {tempPassword && (
        <TempPasswordBanner password={tempPassword} onDismiss={() => setTempPassword('')} />
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            placeholder="Search by name, code, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="text-sm border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ON_PROBATION">On Probation</option>
            <option value="ON_NOTICE">On Notice</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 text-red-500 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : employees.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No employees found</p>
          {can('HR') && !debouncedSearch && (
            <button onClick={() => setShowAddModal(true)}
              className="mt-3 text-sm text-blue-600 hover:underline flex items-center gap-1 mx-auto">
              <Plus className="w-3.5 h-3.5" /> Add your first employee
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {employees.map((emp) => (
            <div
              key={emp.id}
              className="bg-card border rounded-xl p-5 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => navigate(`/employees/${emp.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {getInitials(`${emp.firstName} ${emp.lastName}`)}
                </div>
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  STATUS_COLORS[emp.status] ?? STATUS_COLORS.INACTIVE
                )}>
                  {emp.status?.replace(/_/g, ' ')}
                </span>
              </div>
              <h3 className="font-semibold text-sm">{emp.firstName} {emp.lastName}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{emp.designation?.name ?? '—'}</p>
              <p className="text-xs text-muted-foreground truncate">{emp.department?.name ?? '—'}</p>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md font-mono">
                  {emp.employeeCode}
                </span>
                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {emp.user?.email && (
                    <button onClick={(e) => { e.stopPropagation(); window.location.href = `mailto:${emp.user?.email}`; }}
                      className="p-1.5 rounded-lg hover:bg-muted" title="Email">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/employees/${emp.id}`); }}
                    className="p-1.5 rounded-lg hover:bg-muted" title="View profile">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.totalPages} · {meta.total} employees
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="p-2 rounded-lg border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page === meta.totalPages}
              className="p-2 rounded-lg border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
