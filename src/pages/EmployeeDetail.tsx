import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Employee } from '@/types';
import { formatDate, formatCurrency, getInitials } from '@/lib/utils';
import {
  ArrowLeft, Mail, Phone, Building2, Briefcase, Calendar, CreditCard,
  MapPin, User, Shield, Loader2, AlertCircle, FileText, DollarSign, Clock, Edit2, Check, X,
  KeyRound, Eye, EyeOff, RefreshCw, Trash2, Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/useAuth';

type Tab = 'overview' | 'salary' | 'bank' | 'attendance';

interface AttRecord {
  id: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
  workHours?: number;
  locationType?: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PRESENT:  { bg: 'bg-green-100 dark:bg-green-950/40', text: 'text-green-700 dark:text-green-400' },
  ABSENT:   { bg: 'bg-red-100 dark:bg-red-950/40',   text: 'text-red-600 dark:text-red-400' },
  HALF_DAY: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400' },
  ON_LEAVE: { bg: 'bg-blue-100 dark:bg-blue-950/40',  text: 'text-blue-700 dark:text-blue-400' },
  HOLIDAY:  { bg: 'bg-purple-100 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-400' },
  WEEKEND:  { bg: 'bg-gray-100 dark:bg-gray-800',     text: 'text-gray-500' },
};

function formatTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isHR, isSuperAdmin } = useRole();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  // Salary edit state (HR only)
  const [salaryEdit, setSalaryEdit] = useState(false);
  const [salaryNet, setSalaryNet] = useState('');
  const [salaryHasPf, setSalaryHasPf] = useState(false);
  const [salaryPreview, setSalaryPreview] = useState<any>(null);
  const [salarySaving, setSalarySaving] = useState(false);
  const [salaryError, setSalaryError] = useState('');

  // Reset password state (HR only)
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [resetPwdNew, setResetPwdNew] = useState('');
  const [resetPwdShow, setResetPwdShow] = useState(false);
  const [resetPwdSaving, setResetPwdSaving] = useState(false);
  const [resetPwdDone, setResetPwdDone] = useState(false);
  const [resetPwdError, setResetPwdError] = useState('');

  // Delete state (SUPER_ADMIN only)
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit employee code (SUPER_ADMIN only)
  const [editCodeOpen, setEditCodeOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [codeSaving, setCodeSaving] = useState(false);
  const [codeError, setCodeError] = useState('');

  // Employment edit state (HR / SUPER_ADMIN)
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const [desigs, setDesigs] = useState<{ id: string; name: string }[]>([]);
  const [editEmp, setEditEmp] = useState(false);
  const [editForm, setEditForm] = useState({ departmentId: '', designationId: '', role: '', status: '', joiningDate: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Attendance history for this employee
  const [attRecords, setAttRecords] = useState<AttRecord[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [attMonth, setAttMonth] = useState(new Date().getMonth() + 1);
  const [attYear, setAttYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!id) return;
    api.get<{ data: Employee }>(`/api/employees/${id}`)
      .then((r) => setEmp(r.data.data))
      .catch(() => setError('Employee not found'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!isHR) return;
    api.get<{ data: { id: string; name: string }[] }>('/api/departments').then(r => setDepts(r.data.data || [])).catch(() => {});
    api.get<{ data: { id: string; name: string }[] }>('/api/designations').then(r => setDesigs(r.data.data || [])).catch(() => {});
  }, [isHR]);

  useEffect(() => {
    if (tab !== 'attendance' || !id) return;
    setAttLoading(true);
    api.get<{ data: AttRecord[] }>(`/api/attendance/history?month=${attMonth}&year=${attYear}&limit=60`, {
      // Note: this fetches the logged-in user's attendance, not the viewed employee's.
      // For HR to view another employee's attendance, a separate endpoint would be needed.
    } as any)
      .then((r) => setAttRecords(r.data.data ?? []))
      .catch(() => setAttRecords([]))
      .finally(() => setAttLoading(false));
  }, [tab, id, attMonth, attYear]);

  const generatePwd = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const rand = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `Vinsup@${rand}`;
  };

  const openResetPwd = () => {
    setResetPwdNew(generatePwd());
    setResetPwdShow(false);
    setResetPwdDone(false);
    setResetPwdError('');
    setResetPwdOpen(true);
  };

  const doResetPassword = async () => {
    if (!resetPwdNew || resetPwdNew.length < 6) { setResetPwdError('Password must be at least 6 characters'); return; }
    setResetPwdSaving(true);
    setResetPwdError('');
    try {
      await api.put('/api/auth/reset-password', { userId: emp?.userId, newPassword: resetPwdNew });
      setResetPwdDone(true);
    } catch (e: any) {
      setResetPwdError(e.response?.data?.message ?? 'Failed to reset password');
    } finally {
      setResetPwdSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!emp) return;
    setDeleting(true);
    try {
      await api.delete(`/api/employees/${id}`);
      navigate('/employees');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to terminate employee');
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const openEditCode = () => {
    setNewCode(emp?.employeeCode ?? '');
    setCodeError('');
    setEditCodeOpen(true);
  };

  const saveEmpCode = async () => {
    if (!newCode.trim()) return;
    setCodeSaving(true);
    setCodeError('');
    try {
      const r = await api.patch(`/api/employees/${id}/empcode`, { employeeCode: newCode.trim().toUpperCase() });
      setEmp(prev => prev ? { ...prev, employeeCode: r.data.data.employeeCode } : prev);
      setEditCodeOpen(false);
    } catch (e: any) {
      setCodeError(e?.response?.data?.message || 'Failed to update employee code');
    } finally {
      setCodeSaving(false);
    }
  };

  const openEditEmp = () => {
    setEditForm({
      departmentId: emp?.department?.id ?? '',
      designationId: emp?.designation?.id ?? '',
      role: emp?.user?.role ?? 'EMPLOYEE',
      status: emp?.status ?? 'ACTIVE',
      joiningDate: emp?.joiningDate ? new Date(emp.joiningDate).toISOString().split('T')[0] : '',
    });
    setEditError('');
    setEditEmp(true);
  };

  const saveEditEmp = async () => {
    setEditSaving(true);
    setEditError('');
    try {
      await api.put(`/api/employees/${id}`, editForm);
      const r = await api.get<{ data: Employee }>(`/api/employees/${id}`);
      setEmp(r.data.data);
      setEditEmp(false);
    } catch (e: any) {
      setEditError(e.response?.data?.message ?? 'Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  }

  if (error || !emp) {
    return (
      <div className="flex items-center gap-3 text-red-500 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200">
        <AlertCircle className="w-4 h-4" /> {error || 'Employee not found'}
      </div>
    );
  }

  const fullName = `${emp.firstName} ${emp.lastName}`;
  const salary = (emp as any).salaryStructure;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',   label: 'Overview' },
    ...(isHR ? [
      { id: 'salary' as Tab,     label: 'Salary' },
      { id: 'bank' as Tab,       label: 'Bank Details' },
    ] : []),
    { id: 'attendance', label: 'Attendance' },
  ];

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Employees
      </button>

      {/* Profile card */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-blue-600 to-indigo-600" />
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-10 mb-5">
            <div className="w-20 h-20 bg-white dark:bg-gray-900 rounded-2xl border-4 border-card flex items-center justify-center text-2xl font-bold text-blue-600 flex-shrink-0">
              {getInitials(fullName)}
            </div>
            <div className="pb-1">
              <h1 className="text-xl font-bold">{fullName}</h1>
              <p className="text-muted-foreground text-sm">
                {emp.designation?.name ?? '—'} · {emp.department?.name ?? '—'}
              </p>
            </div>
            <div className="ml-auto pb-1 flex items-center gap-2">
              {isSuperAdmin && (
                <button
                  onClick={openEditCode}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Hash className="w-3.5 h-3.5" /> Edit Code
                </button>
              )}
              {isHR && (
                <button
                  onClick={openResetPwd}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Reset Password
                </button>
              )}
              {isSuperAdmin && (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Terminate
                </button>
              )}
              <span className={cn(
                'text-xs font-medium px-3 py-1 rounded-full',
                emp.status === 'ACTIVE'
                  ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400'
                  : 'bg-gray-100 text-gray-600'
              )}>
                {emp.status?.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{emp.user?.email}</div>
            {emp.phone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{emp.phone}</div>}
            <div className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />{emp.employeeCode}</div>
            <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Joined {formatDate(emp.joiningDate)}</div>
            <div className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />{emp.user?.role?.replace(/_/g, ' ')}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Personal */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" /> Personal Information
            </h2>
            <InfoRow label="Full Name" value={fullName} />
            <InfoRow label="Date of Birth" value={emp.dateOfBirth ? formatDate(emp.dateOfBirth) : '—'} />
            <InfoRow label="Gender" value={emp.gender ?? '—'} />
            <InfoRow label="Blood Group" value={emp.bloodGroup ?? '—'} />
            <InfoRow label="Marital Status" value={emp.maritalStatus ?? '—'} />
          </div>

          {/* Employment */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-purple-500" /> Employment Details
              </h2>
              {isHR && !editEmp && (
                <button
                  onClick={openEditEmp}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
              )}
            </div>

            {editEmp ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Department</label>
                  <select
                    value={editForm.departmentId}
                    onChange={e => setEditForm(f => ({ ...f, departmentId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">— Select Department —</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Designation</label>
                  <select
                    value={editForm.designationId}
                    onChange={e => setEditForm(f => ({ ...f, designationId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">— Select Designation —</option>
                    {desigs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Role</label>
                  <select
                    value={editForm.role}
                    onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'].map(r => (
                      <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Status</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {['ACTIVE', 'ON_PROBATION', 'INACTIVE', 'TERMINATED'].map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Joining Date</label>
                  <input
                    type="date"
                    value={editForm.joiningDate}
                    onChange={e => setEditForm(f => ({ ...f, joiningDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {editError && <p className="text-xs text-red-500">{editError}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditEmp(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button
                    onClick={saveEditEmp}
                    disabled={editSaving}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                  >
                    {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <InfoRow label="Employee Code" value={emp.employeeCode} mono />
                <InfoRow label="Department" value={emp.department?.name ?? '—'} />
                <InfoRow label="Designation" value={emp.designation?.name ?? '—'} />
                <InfoRow label="Branch" value={emp.branch?.name ?? '—'} />
                <InfoRow label="Joining Date" value={formatDate(emp.joiningDate)} />
                <InfoRow label="Probation End" value={emp.probationEndDate ? formatDate(emp.probationEndDate) : '—'} />
                {emp.manager && (
                  <InfoRow label="Reporting Manager" value={`${emp.manager.firstName} ${emp.manager.lastName}`} />
                )}
              </div>
            )}
          </div>

          {/* Address */}
          {emp.address && (
            <div className="bg-card border rounded-xl p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-rose-500" /> Address
              </h2>
              {emp.address.current && <InfoRow label="Current" value={emp.address.current} />}
              {emp.address.city && <InfoRow label="City" value={`${emp.address.city}${emp.address.state ? ', ' + emp.address.state : ''} ${emp.address.pincode ?? ''}`} />}
              {emp.address.country && <InfoRow label="Country" value={emp.address.country} />}
            </div>
          )}
        </div>
      )}

      {/* ── Salary ── */}
      {tab === 'salary' && (
        <div className="max-w-lg space-y-4">
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-500" /> Salary Breakdown (Monthly)
              </h2>
              {isHR && !salaryEdit && (
                <button
                  onClick={() => {
                    setSalaryNet(salary?.netSalary?.toString() ?? '');
                    setSalaryHasPf(salary?.hasPf ?? false);
                    setSalaryPreview(null);
                    setSalaryError('');
                    setSalaryEdit(true);
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Salary
                </button>
              )}
            </div>

            {/* Edit form */}
            {isHR && salaryEdit && (
              <div className="mb-6 p-4 bg-muted/30 rounded-xl border space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update Salary</p>

                {/* PF checkbox */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={salaryHasPf}
                    onChange={e => {
                      setSalaryHasPf(e.target.checked);
                      setSalaryPreview(null);
                    }}
                    className="w-4 h-4 mt-0.5 rounded accent-blue-600"
                  />
                  <div>
                    <p className="text-sm font-medium">PF Applicable (Permanent Employee)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When enabled, 12% of basic is deducted as employee PF contribution. The employer also contributes 12% (company cost). The gross salary is recalculated so the employee still gets the entered net take-home.
                    </p>
                  </div>
                </label>

                {/* Net salary input */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Monthly Net Take-Home (₹) *</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={salaryNet}
                      onChange={e => { setSalaryNet(e.target.value); setSalaryPreview(null); }}
                      placeholder="e.g. 20000"
                      className="flex-1 px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const net = parseFloat(salaryNet);
                        if (!net || net <= 0) return;
                        try {
                          const r = await api.post<{ data: any }>('/api/employees/calc-salary', { net, hasPf: salaryHasPf });
                          setSalaryPreview(r.data.data);
                        } catch {
                          // fallback: show local estimate
                          const basic = Math.round(net * 0.4);
                          setSalaryPreview({ gross: net + 200 + (salaryHasPf ? Math.round(basic * 0.12) : 0), pf: salaryHasPf ? Math.round(basic * 0.12) : 0 });
                        }
                      }}
                      className="px-3 py-2 text-xs bg-muted border rounded-lg hover:bg-muted/70 transition-colors"
                    >Preview</button>
                  </div>
                </div>

                {/* Preview breakdown */}
                {salaryPreview && (
                  <div className="text-xs bg-background border rounded-lg p-3 space-y-1.5">
                    <p className="font-semibold mb-2">Calculated Breakdown</p>
                    <div className="flex justify-between"><span className="text-muted-foreground">Gross Salary</span><span>₹{(salaryPreview.grossSalary ?? salaryPreview.gross ?? 0).toLocaleString('en-IN')}</span></div>
                    {salaryHasPf && <div className="flex justify-between text-red-500"><span>Employee PF (12% basic)</span><span>-₹{(salaryPreview.pf ?? 0).toLocaleString('en-IN')}</span></div>}
                    {salaryHasPf && <div className="flex justify-between text-amber-600"><span>Employer PF (12% basic)</span><span>₹{(salaryPreview.pf ?? 0).toLocaleString('en-IN')} (company cost)</span></div>}
                    <div className="flex justify-between text-red-500"><span>Professional Tax</span><span>-₹200</span></div>
                    <div className="flex justify-between font-semibold border-t pt-1.5 mt-1"><span>Net Take-Home</span><span className="text-green-600">₹{parseFloat(salaryNet).toLocaleString('en-IN')}</span></div>
                  </div>
                )}

                {salaryError && <p className="text-xs text-red-500">{salaryError}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setSalaryEdit(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted transition-colors"
                  ><X className="w-3.5 h-3.5" /> Cancel</button>
                  <button
                    onClick={async () => {
                      const net = parseFloat(salaryNet);
                      if (!net || net <= 0) { setSalaryError('Enter a valid net salary'); return; }
                      setSalarySaving(true);
                      setSalaryError('');
                      try {
                        await api.put(`/api/employees/${id}/salary`, { netSalary: net, hasPf: salaryHasPf });
                        const r = await api.get<{ data: Employee }>(`/api/employees/${id}`);
                        setEmp(r.data.data);
                        setSalaryEdit(false);
                      } catch (e: any) {
                        setSalaryError(e.response?.data?.message ?? 'Failed to save');
                      } finally {
                        setSalarySaving(false);
                      }
                    }}
                    disabled={salarySaving || !salaryNet}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                  >
                    {salarySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {salary ? (
              <div className="space-y-3">
                {/* PF status badge */}
                <div className="flex items-center gap-2 mb-4">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border',
                    salary.hasPf
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
                      : 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
                  )}>
                    {salary.hasPf ? '✓ PF Applicable' : '✗ No PF'}
                  </span>
                  {salary.hasPf && (
                    <span className="text-[10px] text-muted-foreground">Employer also contributes ₹{formatCurrency(salary.pf)}/mo</span>
                  )}
                </div>

                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Earnings</p>
                <InfoRow label="Basic" value={formatCurrency(salary.basic)} />
                <InfoRow label="HRA" value={formatCurrency(salary.hra)} />
                <InfoRow label="Conveyance" value={formatCurrency(salary.conveyance)} />
                <InfoRow label="Medical Allowance" value={formatCurrency(salary.medicalAllowance)} />
                <InfoRow label="Special Allowance" value={formatCurrency(salary.specialAllowance)} />
                <div className="border-t pt-3 mt-1">
                  <InfoRow label="Gross Salary" value={formatCurrency(salary.grossSalary)} bold />
                </div>

                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-5 mb-3">Deductions</p>
                {salary.hasPf && <InfoRow label="PF (Employee 12%)" value={`-${formatCurrency(salary.pf)}`} red />}
                {salary.esi > 0 && <InfoRow label="ESI" value={`-${formatCurrency(salary.esi)}`} red />}
                <InfoRow label="Professional Tax" value={`-${formatCurrency(salary.professionalTax)}`} red />
                {salary.tds > 0 && <InfoRow label="TDS" value={`-${formatCurrency(salary.tds)}`} red />}
                <div className="border-t pt-3 mt-1">
                  <InfoRow label="Net Take-Home" value={formatCurrency(salary.netSalary)} bold green />
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-4">
                No salary structure set.{isHR ? ' Click "Edit Salary" to configure.' : ' Contact HR.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bank ── */}
      {tab === 'bank' && (
        <div className="bg-card border rounded-xl p-5 max-w-lg">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-green-500" /> Bank Details
          </h2>
          {emp.bankDetails && emp.bankDetails.length > 0 ? (
            <div className="space-y-5">
              {emp.bankDetails.map((b: any) => (
                <div key={b.id} className="space-y-3">
                  {b.isPrimary && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Primary</span>
                  )}
                  <InfoRow label="Bank Name" value={b.bankName ?? '—'} />
                  <InfoRow label="Account Number" value={b.accountNumber ?? '—'} mono />
                  <InfoRow label="IFSC Code" value={b.ifscCode ?? '—'} mono />
                  <InfoRow label="Account Type" value={b.accountType ?? '—'} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No bank details on file.</p>
          )}
        </div>
      )}

      {/* ── Attendance ── */}
      {tab === 'attendance' && (
        <div className="space-y-4">
          {/* Month picker */}
          <div className="flex items-center gap-3">
            <select
              value={attMonth}
              onChange={(e) => setAttMonth(Number(e.target.value))}
              className="px-3 py-2 text-sm border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input
              type="number"
              value={attYear}
              min={2020} max={2030}
              onChange={(e) => setAttYear(Number(e.target.value))}
              className="px-3 py-2 text-sm border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 w-24"
            />
            {attLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          </div>

          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="text-left px-5 py-3 font-medium">Date</th>
                  <th className="text-left px-5 py-3 font-medium">Check In</th>
                  <th className="text-left px-5 py-3 font-medium">Check Out</th>
                  <th className="text-left px-5 py-3 font-medium">Hours</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {attRecords.length === 0 && !attLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-14 text-muted-foreground">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No attendance records for this period
                    </td>
                  </tr>
                ) : attRecords.map((a) => {
                  const cfg = STATUS_COLORS[a.status] ?? STATUS_COLORS.ABSENT;
                  return (
                    <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-medium">
                        {new Date(a.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', weekday: 'short' })}
                      </td>
                      <td className="px-5 py-3 text-green-600">{formatTime(a.checkIn)}</td>
                      <td className="px-5 py-3 text-red-500">{formatTime(a.checkOut)}</td>
                      <td className="px-5 py-3">{a.workHours != null ? `${a.workHours.toFixed(1)}h` : '—'}</td>
                      <td className="px-5 py-3">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.bg, cfg.text)}>
                          {a.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{a.locationType ?? 'OFFICE'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {resetPwdOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-500" /> Reset Password
              </h2>
              <button onClick={() => setResetPwdOpen(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            <div className="p-6 space-y-4">
              {resetPwdDone ? (
                <div className="text-center space-y-3 py-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <Check className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="font-semibold">Password Reset Successfully</p>
                  <p className="text-sm text-muted-foreground">
                    New credentials have been emailed to <strong>{emp?.user?.email}</strong>.<br />
                    Nancy must change her password on next login.
                  </p>
                  <button
                    onClick={() => setResetPwdOpen(false)}
                    className="mt-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Set a new temporary password for <strong>{fullName}</strong>. An email with the new credentials will be sent to <strong>{emp?.user?.email}</strong> automatically.
                  </p>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">New Password</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={resetPwdShow ? 'text' : 'password'}
                          value={resetPwdNew}
                          onChange={e => setResetPwdNew(e.target.value)}
                          className="w-full px-3 py-2 pr-10 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                          placeholder="Enter new password"
                        />
                        <button
                          type="button"
                          onClick={() => setResetPwdShow(s => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {resetPwdShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setResetPwdNew(generatePwd())}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs border rounded-lg hover:bg-muted transition-colors"
                        title="Generate new password"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Generate
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Employee will be forced to change this on next login.</p>
                  </div>

                  {resetPwdError && (
                    <p className="text-xs text-red-500 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> {resetPwdError}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setResetPwdOpen(false)}
                      className="flex-1 px-4 py-2 text-sm border rounded-xl hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={doResetPassword}
                      disabled={resetPwdSaving || !resetPwdNew}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-60"
                    >
                      {resetPwdSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                      Reset & Send Email
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Employee Code Modal (SUPER_ADMIN) ── */}
      {editCodeOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <Hash className="w-4 h-4 text-blue-500" /> Edit Employee Code
              </h2>
              <button onClick={() => setEditCodeOpen(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Current: <span className="font-mono font-semibold text-foreground">{emp?.employeeCode}</span>
              </p>
              <div>
                <label className="text-sm font-medium block mb-1.5">New Employee Code</label>
                <input
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  placeholder="e.g. V7009"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Format: V7001 … V7065 (must be unique)</p>
              </div>
              {codeError && <p className="text-xs text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{codeError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditCodeOpen(false)} className="flex-1 px-4 py-2 text-sm border rounded-xl hover:bg-muted transition-colors">Cancel</button>
                <button
                  onClick={saveEmpCode}
                  disabled={codeSaving || !newCode.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-colors disabled:opacity-60"
                >
                  {codeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Terminate / Delete Confirmation Modal (SUPER_ADMIN) ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl w-full max-w-sm shadow-xl">
            <div className="p-6 space-y-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div className="text-center">
                <h2 className="font-semibold text-lg">Terminate Employee?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  <strong>{emp?.firstName} {emp?.lastName}</strong> will be marked as <span className="text-red-600 font-medium">TERMINATED</span> and their login will be disabled.
                </p>
                <p className="text-xs text-muted-foreground mt-2">This can be undone by updating their status back to ACTIVE.</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 text-sm border rounded-xl hover:bg-muted transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Yes, Terminate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono, bold, red, green }: {
  label: string; value: string; mono?: boolean; bold?: boolean; red?: boolean; green?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className={cn(
        'font-medium text-right',
        mono && 'font-mono text-xs',
        bold && 'font-semibold',
        red && 'text-red-500',
        green && 'text-green-600'
      )}>
        {value}
      </span>
    </div>
  );
}
