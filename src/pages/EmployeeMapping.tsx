import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { Loader2, Network, Save, AlertCircle, CheckCircle, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MappingEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  status: string;
  managerId: string | null;
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
  manager: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
}

export default function EmployeeMappingPage() {
  const [employees, setEmployees] = useState<MappingEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  // local override map: employeeId → managerId (or '')
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get('/api/employees/mapping')
      .then(r => setEmployees(r.data.data ?? []))
      .catch(() => setError('Failed to load employees'))
      .finally(() => setLoading(false));
  }, []);

  const departments = useMemo(() => {
    const set = new Set(employees.map(e => e.department?.name ?? '—').filter(Boolean));
    return [...set].sort();
  }, [employees]);

  const filtered = useMemo(() =>
    deptFilter ? employees.filter(e => e.department?.name === deptFilter) : employees,
    [employees, deptFilter]
  );

  // Employees who can be managers (non-EMPLOYEE role implied by being listed; just show all)
  // Actually show all so HR/managers can be selected
  const managerOptions = employees;

  const currentManager = (emp: MappingEmployee) =>
    overrides[emp.id] !== undefined ? overrides[emp.id] : (emp.managerId ?? '');

  const changed = Object.entries(overrides).filter(([empId, newMgrId]) => {
    const emp = employees.find(e => e.id === empId);
    return emp && (emp.managerId ?? '') !== newMgrId;
  });

  const handleSave = async () => {
    if (changed.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const mappings = changed.map(([employeeId, managerId]) => ({
        employeeId,
        managerId: managerId || null,
      }));
      await api.put('/api/employees/mapping', { mappings });
      // Commit overrides into employees state
      setEmployees(prev => prev.map(e => {
        if (overrides[e.id] !== undefined) {
          const newMgr = employees.find(m => m.id === overrides[e.id]) ?? null;
          return { ...e, managerId: overrides[e.id] || null, manager: newMgr };
        }
        return e;
      }));
      setOverrides({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const unmapped = employees.filter(e => !e.managerId && !overrides[e.id] && e.status !== 'TERMINATED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Employee Mapping</h1>
            <p className="text-muted-foreground text-sm">Assign reporting managers to all employees</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" /> Saved
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || changed.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes {changed.length > 0 && `(${changed.length})`}
          </button>
        </div>
      </div>

      {/* Stats + filter */}
      <div className="flex flex-wrap items-center gap-3">
        {unmapped > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4" />
            {unmapped} employee{unmapped !== 1 ? 's' : ''} without a manager
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-card border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Emp Code</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Department</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Designation</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground w-56">Reporting Manager</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((emp, i) => {
                const mgrId = currentManager(emp);
                const isChanged = overrides[emp.id] !== undefined && (emp.managerId ?? '') !== overrides[emp.id];
                const noManager = !mgrId;
                return (
                  <tr
                    key={emp.id}
                    className={cn(
                      'hover:bg-muted/20 transition-colors',
                      i % 2 === 0 ? 'bg-background' : 'bg-muted/10',
                      isChanged && 'bg-blue-50/40',
                    )}
                  >
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-muted-foreground">{emp.employeeCode}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                          {emp.firstName[0]}{emp.lastName[0]}
                        </div>
                        <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{emp.department?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{emp.designation?.name ?? '—'}</td>
                    <td className="px-5 py-3">
                      <select
                        value={mgrId}
                        onChange={e => setOverrides(prev => ({ ...prev, [emp.id]: e.target.value }))}
                        className={cn(
                          'w-full text-sm border rounded-lg px-2.5 py-1.5 bg-background transition',
                          noManager ? 'border-red-300 text-red-600' : 'border-border',
                          isChanged && 'border-blue-400 ring-1 ring-blue-200',
                        )}
                      >
                        <option value="">— No Manager —</option>
                        {managerOptions
                          .filter(m => m.id !== emp.id) // can't report to self
                          .map(m => (
                            <option key={m.id} value={m.id}>
                              {m.firstName} {m.lastName} ({m.employeeCode})
                            </option>
                          ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">No employees found</div>
          )}
        </div>
      )}
    </div>
  );
}
