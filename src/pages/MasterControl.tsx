import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ModuleName, AccessLevel } from '@/types';
import {
  KeyRound, Building2, Users, Loader2, AlertCircle, CheckCircle2,
  X, ShieldCheck, ShieldOff, ChevronRight,
} from 'lucide-react';

const MODULES: { key: ModuleName; label: string }[] = [
  { key: 'SALES', label: 'Sales' },
  { key: 'FINANCE_SALES', label: 'Finance (Sales)' },
  { key: 'FINANCE_ADMIN', label: 'Finance (Admin)' },
  { key: 'ADMIN', label: 'Admin & Ops' },
  { key: 'HR', label: 'HR' },
  { key: 'PRODUCTION_TRAINING', label: 'Production' },
  { key: 'PLACEMENTS', label: 'Placements' },
  { key: 'DIGITAL_MARKETING', label: 'Digital Marketing' },
];

const LEVELS: { key: AccessLevel; label: string }[] = [
  { key: 'NONE', label: 'No access' },
  { key: 'VIEW', label: 'View' },
  { key: 'EDIT', label: 'Edit' },
  { key: 'ADMIN', label: 'Admin' },
];

const LEVEL_COLOR: Record<AccessLevel, string> = {
  NONE: 'bg-gray-100 text-gray-400 dark:bg-gray-800/40',
  VIEW: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  EDIT: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  ADMIN: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
};

interface DeptDefault {
  id: string;
  name: string;
  code: string;
  moduleAccessDefaults: { id: string; module: ModuleName; accessLevel: AccessLevel }[];
}

interface DirectoryEntry {
  id: string;
  userId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  status: string;
  department?: { id: string; name: string; code: string } | null;
  designation?: { id: string; name: string } | null;
  user?: { id: string; email: string; role: string; canManageAccess: boolean } | null;
  effectiveAccess: Partial<Record<ModuleName, AccessLevel>>;
}

type Tab = 'directory' | 'departments';

export default function MasterControlPage() {
  const [tab, setTab] = useState<Tab>('directory');
  const [departments, setDepartments] = useState<DeptDefault[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<DirectoryEntry | null>(null);
  const [search, setSearch] = useState('');

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };
  const fail = (e: any, fallback: string) => setError(e.response?.data?.message ?? fallback);

  const fetchAll = useCallback(async () => {
    const [deptRes, dirRes] = await Promise.all([
      api.get('/api/access/department-defaults'),
      api.get('/api/access/directory'),
    ]);
    setDepartments(deptRes.data.data ?? []);
    setDirectory(dirRes.data.data ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchAll()
      .catch((e) => fail(e, 'Failed to load Master Control data'))
      .finally(() => setLoading(false));
  }, [fetchAll]);

  const setDeptDefault = async (departmentId: string, module: ModuleName, accessLevel: AccessLevel) => {
    const key = `${departmentId}:${module}`;
    setSavingKey(key);
    setError('');
    try {
      await api.put(`/api/access/department-defaults/${departmentId}`, { module, accessLevel });
      setDepartments((prev) =>
        prev.map((d) => {
          if (d.id !== departmentId) return d;
          const rest = d.moduleAccessDefaults.filter((m) => m.module !== module);
          return accessLevel === 'NONE'
            ? { ...d, moduleAccessDefaults: rest }
            : { ...d, moduleAccessDefaults: [...rest, { id: key, module, accessLevel }] };
        })
      );
      flash('Department default updated');
    } catch (e: any) { fail(e, 'Failed to update default'); }
    finally { setSavingKey(null); }
  };

  const setUserOverride = async (userId: string, module: ModuleName, accessLevel: AccessLevel) => {
    const key = `${userId}:${module}`;
    setSavingKey(key);
    setError('');
    try {
      if (accessLevel === 'NONE') {
        await api.delete(`/api/access/users/${userId}/override/${module}`);
      } else {
        await api.put(`/api/access/users/${userId}/override`, { module, accessLevel });
      }
      await fetchAll();
      flash('Access override saved');
    } catch (e: any) { fail(e, 'Failed to save override'); }
    finally { setSavingKey(null); }
  };

  const toggleMasterControl = async (userId: string, canManageAccess: boolean) => {
    setSavingKey(`mc:${userId}`);
    setError('');
    try {
      await api.put(`/api/access/users/${userId}/master-control`, { canManageAccess });
      await fetchAll();
      flash(canManageAccess ? 'Master Control granted' : 'Master Control revoked');
    } catch (e: any) { fail(e, 'Failed to update Master Control'); }
    finally { setSavingKey(null); }
  };

  const filteredDirectory = directory.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      e.employeeCode.toLowerCase().includes(q) ||
      e.department?.name.toLowerCase().includes(q) ||
      e.user?.email.toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
          <KeyRound className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Master Control</h1>
          <p className="text-muted-foreground text-sm">
            Grant or revoke module access for anyone, regardless of department
          </p>
        </div>
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

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['directory', 'departments'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'directory' ? `Employee Access (${directory.length})` : `Department Defaults (${departments.length})`}
          </button>
        ))}
      </div>

      {/* Department defaults */}
      {tab === 'departments' && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Sets the baseline access every employee in a department gets for each module. Per-user overrides
            (Employee Access tab) take precedence over these defaults.
          </p>
          {departments.map((d) => {
            const accessFor = (m: ModuleName) => d.moduleAccessDefaults.find((x) => x.module === m)?.accessLevel ?? 'NONE';
            return (
              <div key={d.id} className="bg-card border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/30">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <p className="font-semibold text-sm">{d.name}</p>
                  <span className="text-[10px] font-mono text-muted-foreground">{d.code}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
                  {MODULES.map((m) => {
                    const level = accessFor(m.key);
                    const key = `${d.id}:${m.key}`;
                    return (
                      <div key={m.key} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-background">
                        <span className="text-xs font-medium truncate">{m.label}</span>
                        <select
                          className={cn('text-[11px] font-semibold rounded-md px-1.5 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-primary/30', LEVEL_COLOR[level])}
                          value={level}
                          disabled={savingKey === key}
                          onChange={(e) => setDeptDefault(d.id, m.key, e.target.value as AccessLevel)}
                        >
                          {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Employee directory */}
      {tab === 'directory' && (
        <div className="space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, employee code, department, or email…"
            className="w-full max-w-md px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Department / Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Access</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Master Control</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredDirectory.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.firstName} {e.lastName}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{e.employeeCode}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-xs">{e.department?.name ?? '—'}</p>
                      <p className="text-[11px] text-muted-foreground">{e.designation?.name ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {Object.entries(e.effectiveAccess).length === 0 && (
                          <span className="text-[11px] text-muted-foreground">No access</span>
                        )}
                        {Object.entries(e.effectiveAccess).map(([mod, level]) => (
                          <span key={mod} className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', LEVEL_COLOR[level as AccessLevel])}>
                            {MODULES.find((m) => m.key === mod)?.label ?? mod}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.user && (
                        <button
                          onClick={() => toggleMasterControl(e.user!.id, !e.user!.canManageAccess)}
                          disabled={savingKey === `mc:${e.user.id}`}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors',
                            e.user.canManageAccess
                              ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800/40'
                          )}
                        >
                          {e.user.canManageAccess ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                          {e.user.canManageAccess ? 'Granted' : 'Off'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditingEmployee(e)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Edit access <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredDirectory.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No employees match your search</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit-access modal */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold">
                  {editingEmployee.firstName} {editingEmployee.lastName}
                </h2>
              </div>
              <button onClick={() => setEditingEmployee(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                Setting a module here overrides the department default for this person only.
                Choosing "No access" explicitly revokes the module even if their department grants it.
              </p>
              {MODULES.map((m) => {
                const level = editingEmployee.effectiveAccess[m.key] ?? 'NONE';
                const key = `${editingEmployee.userId}:${m.key}`;
                return (
                  <div key={m.key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border bg-background">
                    <span className="text-sm font-medium">{m.label}</span>
                    <select
                      className={cn('text-xs font-semibold rounded-md px-2 py-1.5 border-0 focus:outline-none focus:ring-2 focus:ring-primary/30', LEVEL_COLOR[level])}
                      value={level}
                      disabled={savingKey === key}
                      onChange={async (ev) => {
                        const newLevel = ev.target.value as AccessLevel;
                        await setUserOverride(editingEmployee.userId, m.key, newLevel);
                        setEditingEmployee((prev) =>
                          prev ? { ...prev, effectiveAccess: { ...prev.effectiveAccess, [m.key]: newLevel === 'NONE' ? undefined : newLevel } } : prev
                        );
                      }}
                    >
                      {LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 border-t flex justify-end">
              <button onClick={() => setEditingEmployee(null)} className="px-4 py-2 text-sm border rounded-xl hover:bg-muted">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
