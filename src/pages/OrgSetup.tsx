import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useRole } from '@/hooks/useAuth';
import {
  Plus, Pencil, Trash2, Loader2, AlertCircle, CheckCircle2,
  Building2, Briefcase, X, Users, ChevronRight, ChevronDown, Network, Check
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  _count?: { employees: number };
}

interface Designation {
  id: string;
  name: string;
  code: string;
  level: number;
  description?: string;
  _count?: { employees: number };
}

interface OrgEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  managerId?: string | null;
  department?: { name: string } | null;
  designation?: { name: string } | null;
}

type Tab = 'departments' | 'designations' | 'orgchart';

const REPORTING_GUIDE = [
  { dept: 'Sales',            manager: 'VP Sales',             color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { dept: 'Digital Marketing', manager: 'CGO',                 color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { dept: 'Placements',       manager: 'CGO',                  color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { dept: 'Production',       manager: 'Learning Delivery Manager', color: 'bg-green-50 text-green-700 border-green-200' },
  { dept: 'Admin',            manager: 'Asst Manager - General', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { dept: 'B2B',              manager: 'Senior B2B Manager',   color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { dept: 'Finance',          manager: '(assign as needed)',   color: 'bg-gray-50 text-gray-600 border-gray-200' },
];

export default function OrgSetupPage() {
  const { can } = useRole();
  const isHR = can('HR');

  const [tab, setTab] = useState<Tab>('departments');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<OrgEmployee[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgLoaded, setOrgLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingManagerFor, setEditingManagerFor] = useState<string | null>(null);
  const [savingManager, setSavingManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Forms
  const [deptForm, setDeptForm] = useState({ name: '', code: '', description: '' });
  const [desigForm, setDesigForm] = useState({ name: '', code: '', level: '2', description: '' });
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editingDesig, setEditingDesig] = useState<Designation | null>(null);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showDesigModal, setShowDesigModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchDepts = useCallback(async () => {
    const r = await api.get<{ data: Department[] }>('/api/departments');
    setDepartments(r.data.data ?? []);
  }, []);

  const fetchDesigs = useCallback(async () => {
    const r = await api.get<{ data: Designation[] }>('/api/designations');
    setDesignations(r.data.data ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchDepts(), fetchDesigs()]).finally(() => setLoading(false));
  }, [fetchDepts, fetchDesigs]);

  const fetchEmployees = useCallback(async () => {
    setOrgLoading(true);
    try {
      const r = await api.get<{ data: OrgEmployee[] }>('/api/employees?limit=1000');
      setEmployees(r.data.data ?? []);
      setOrgLoaded(true);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to load org chart');
    } finally {
      setOrgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'orgchart' && !orgLoaded) fetchEmployees();
  }, [tab, orgLoaded, fetchEmployees]);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  // Returns ids of an employee and all of their descendants — used to prevent
  // reassigning a manager to someone who reports (directly or indirectly) to them.
  const getSubtreeIds = (empId: string): Set<string> => {
    const result = new Set<string>([empId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of employees) {
        if (e.managerId && result.has(e.managerId) && !result.has(e.id)) {
          result.add(e.id);
          changed = true;
        }
      }
    }
    return result;
  };

  const handleChangeManager = async (empId: string, newManagerId: string) => {
    setSavingManager(true);
    setError('');
    try {
      await api.put(`/api/employees/${empId}`, { managerId: newManagerId || null });
      await fetchEmployees();
      flash('Reporting manager updated');
      setEditingManagerFor(null);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to update manager');
    } finally {
      setSavingManager(false);
    }
  };

  const toggleCollapsed = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openDeptEdit = (d: Department) => {
    setEditingDept(d);
    setDeptForm({ name: d.name, code: d.code, description: d.description || '' });
    setShowDeptModal(true);
  };

  const openDesigEdit = (d: Designation) => {
    setEditingDesig(d);
    setDesigForm({ name: d.name, code: d.code, level: String(d.level), description: d.description || '' });
    setShowDesigModal(true);
  };

  const closeDeptModal = () => {
    setShowDeptModal(false);
    setEditingDept(null);
    setDeptForm({ name: '', code: '', description: '' });
  };

  const closeDesigModal = () => {
    setShowDesigModal(false);
    setEditingDesig(null);
    setDesigForm({ name: '', code: '', level: '2', description: '' });
  };

  const handleDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (editingDept) {
        await api.put(`/api/departments/${editingDept.id}`, deptForm);
        flash('Department updated');
      } else {
        await api.post('/api/departments', deptForm);
        flash('Department created');
      }
      await fetchDepts();
      closeDeptModal();
    } catch (e: any) { setError(e.response?.data?.message ?? 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDesigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (editingDesig) {
        await api.put(`/api/designations/${editingDesig.id}`, desigForm);
        flash('Designation updated');
      } else {
        await api.post('/api/designations', desigForm);
        flash('Designation created');
      }
      await fetchDesigs();
      closeDesigModal();
    } catch (e: any) { setError(e.response?.data?.message ?? 'Failed'); }
    finally { setSubmitting(false); }
  };

  const handleDeleteDept = async (id: string) => {
    if (!confirm('Deactivate this department?')) return;
    setDeleting(id);
    try {
      await api.delete(`/api/departments/${id}`);
      await fetchDepts();
      flash('Department deactivated');
    } catch (e: any) { setError(e.response?.data?.message ?? 'Cannot delete'); }
    finally { setDeleting(null); }
  };

  const handleDeleteDesig = async (id: string) => {
    if (!confirm('Deactivate this designation?')) return;
    setDeleting(id);
    try {
      await api.delete(`/api/designations/${id}`);
      await fetchDesigs();
      flash('Designation deactivated');
    } catch (e: any) { setError(e.response?.data?.message ?? 'Cannot delete'); }
    finally { setDeleting(null); }
  };

  const levelLabel = (level: number) => {
    if (level >= 9) return { label: 'Senior Manager', color: 'bg-purple-100 text-purple-700' };
    if (level >= 7) return { label: 'Manager', color: 'bg-blue-100 text-blue-700' };
    if (level >= 5) return { label: 'Asst Manager', color: 'bg-indigo-100 text-indigo-700' };
    if (level >= 3) return { label: 'Senior', color: 'bg-green-100 text-green-700' };
    return { label: 'Executive', color: 'bg-gray-100 text-gray-600' };
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  const inputCls = 'w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30';

  function OrgNode({ emp, depth }: { emp: OrgEmployee; depth: number }) {
    const children = employees.filter(e => e.managerId === emp.id);
    const isCollapsed = collapsed.has(emp.id);
    const isEditing = editingManagerFor === emp.id;
    const subtree = isEditing ? getSubtreeIds(emp.id) : new Set<string>();
    return (
      <div>
        <div className="flex items-center gap-2 py-1.5 group" style={{ paddingLeft: depth * 24 }}>
          {children.length > 0 ? (
            <button onClick={() => toggleCollapsed(emp.id)} className="p-0.5 text-muted-foreground hover:text-foreground flex-shrink-0">
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="w-4 flex-shrink-0" />}
          <div className="w-7 h-7 bg-blue-50 dark:bg-blue-950/30 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
            {emp.firstName?.[0]}{emp.lastName?.[0] ?? ''}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{emp.firstName} {emp.lastName}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {emp.designation?.name ?? '—'}{emp.department?.name ? ` · ${emp.department.name}` : ''} · {emp.employeeCode}
            </p>
          </div>
          {children.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 flex-shrink-0">{children.length}</span>
          )}
          {isHR && (
            <button
              onClick={() => setEditingManagerFor(isEditing ? null : emp.id)}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              title="Change reporting manager"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        {isEditing && (
          <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: depth * 24 + 24 }}>
            <select
              defaultValue={emp.managerId ?? ''}
              disabled={savingManager}
              onChange={e => handleChangeManager(emp.id, e.target.value)}
              className="text-xs px-2 py-1.5 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">No manager (top level)</option>
              {employees.filter(o => !subtree.has(o.id)).map(o => (
                <option key={o.id} value={o.id}>{o.firstName} {o.lastName} ({o.employeeCode})</option>
              ))}
            </select>
            {savingManager && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            {!savingManager && <Check className="w-3.5 h-3.5 text-green-500 opacity-0" />}
            <button onClick={() => setEditingManagerFor(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        )}
        {!isCollapsed && children.map(c => <OrgNode key={c.id} emp={c} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Organisation Setup</h1>
          <p className="text-muted-foreground text-sm">Manage departments and designations</p>
        </div>
        {isHR && (
          <button
            onClick={() => tab === 'departments' ? setShowDeptModal(true) : setShowDesigModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Add {tab === 'departments' ? 'Department' : 'Designation'}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-500 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-600 p-3.5 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* Reporting structure quick guide */}
      <div className="bg-card border rounded-xl p-5">
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          Reporting Structure
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {REPORTING_GUIDE.map(r => (
            <div key={r.dept} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-xs', r.color)}>
              <div className="min-w-0">
                <p className="font-semibold truncate">{r.dept}</p>
                <div className="flex items-center gap-1 text-[10px] opacity-70 truncate">
                  <ChevronRight className="w-2.5 h-2.5 flex-shrink-0" />
                  <span className="truncate">{r.manager}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Assign the correct <strong>Reporting Manager</strong> when adding employees to link them to the right team.
          One manager can lead multiple departments (e.g. CGO leads Digital Marketing &amp; Placements).
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['departments', 'designations', 'orgchart'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors flex items-center gap-1.5',
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'orgchart' && <Network className="w-3.5 h-3.5" />}
            {t === 'departments'
              ? `Departments (${departments.length})`
              : t === 'designations'
              ? `Designations (${designations.length})`
              : 'Org Chart'
            }
          </button>
        ))}
      </div>

      {/* Departments */}
      {tab === 'departments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map(d => (
            <div key={d.id} className="bg-card border rounded-xl p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950/30 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{d.name}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{d.code}</p>
                  </div>
                </div>
                {isHR && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openDeptEdit(d)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteDept(d.id)}
                      disabled={deleting === d.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"
                    >
                      {deleting === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
              {d.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{d.description}</p>}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                {d._count?.employees ?? 0} employee{(d._count?.employees ?? 0) !== 1 ? 's' : ''}
              </div>
            </div>
          ))}
          {departments.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No departments yet</p>
            </div>
          )}
        </div>
      )}

      {/* Designations */}
      {tab === 'designations' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Designation</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Level</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Note</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Employees</th>
                {isHR && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {designations.map(d => {
                const { label, color } = levelLabel(d.level);
                return (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Briefcase className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-medium">{d.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{d.code}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', color)}>
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-xs truncate">
                      {d.description ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground text-right">
                      {d._count?.employees ?? 0}
                    </td>
                    {isHR && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openDesigEdit(d)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDesig(d.id)}
                            disabled={deleting === d.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"
                          >
                            {deleting === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {designations.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No designations yet</div>
          )}
        </div>
      )}

      {/* Org Chart */}
      {tab === 'orgchart' && (
        <div className="bg-card border rounded-xl p-5">
          {orgLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No employees yet</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-4">
                {isHR
                  ? 'Hover an employee and click the pencil to change who they report to.'
                  : 'Visual reporting hierarchy across the organisation.'}
              </p>
              <div className="overflow-x-auto">
                {employees
                  .filter(e => !e.managerId || !employees.some(m => m.id === e.managerId))
                  .map(root => (
                    <OrgNode key={root.id} emp={root} depth={0} />
                  ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Department modal */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold">{editingDept ? 'Edit Department' : 'Add Department'}</h2>
              <button onClick={closeDeptModal}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <form onSubmit={handleDeptSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">Department Name *</label>
                  <input className={inputCls} value={deptForm.name} onChange={e => setDeptForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Digital Marketing" required />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Code *</label>
                  <input className={inputCls} value={deptForm.code} onChange={e => setDeptForm(f => ({...f, code: e.target.value.toUpperCase()}))} placeholder="e.g. DM" required maxLength={10} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">Description</label>
                  <input className={inputCls} value={deptForm.description} onChange={e => setDeptForm(f => ({...f, description: e.target.value}))} placeholder="Optional" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeDeptModal} className="flex-1 py-2.5 text-sm border rounded-xl hover:bg-muted">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : editingDept ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Designation modal */}
      {showDesigModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold">{editingDesig ? 'Edit Designation' : 'Add Designation'}</h2>
              <button onClick={closeDesigModal}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <form onSubmit={handleDesigSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">Designation Name *</label>
                  <input className={inputCls} value={desigForm.name} onChange={e => setDesigForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Sales Executive" required />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Code *</label>
                  <input className={inputCls} value={desigForm.code} onChange={e => setDesigForm(f => ({...f, code: e.target.value.toUpperCase()}))} placeholder="e.g. SE" required maxLength={10} />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Level (1–10)</label>
                  <select className={inputCls} value={desigForm.level} onChange={e => setDesigForm(f => ({...f, level: e.target.value}))}>
                    <option value="9">9 — Senior Manager (CGO / VP)</option>
                    <option value="7">7 — Manager (LDM / Sr B2B)</option>
                    <option value="6">6 — Asst Manager</option>
                    <option value="5">5 — Team Lead</option>
                    <option value="3">3 — Senior Executive</option>
                    <option value="2">2 — Executive</option>
                    <option value="1">1 — Junior / Support</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">Description / Notes</label>
                  <input className={inputCls} value={desigForm.description} onChange={e => setDesigForm(f => ({...f, description: e.target.value}))} placeholder="e.g. Reports to VP Sales" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeDesigModal} className="flex-1 py-2.5 text-sm border rounded-xl hover:bg-muted">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : editingDesig ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
