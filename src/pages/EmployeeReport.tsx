import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import { BarChart3, Loader2, Users, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  status: string;
  designation?: { name: string } | null;
  manager?: { firstName: string; lastName: string; employeeCode: string } | null;
}

interface DeptGroup {
  department: string;
  employees: ReportEmployee[];
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  ON_PROBATION: 'bg-blue-100 text-blue-700',
};

export default function EmployeeReportPage() {
  const [groups, setGroups] = useState<DeptGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [deptCount, setDeptCount] = useState(0);

  useEffect(() => {
    api.get('/api/employees/report/departments')
      .then(r => {
        setGroups(r.data.data ?? []);
        setTotal(r.data.meta?.total ?? 0);
        setDeptCount(r.data.meta?.departments ?? 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggle = (dept: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(dept) ? next.delete(dept) : next.add(dept);
      return next;
    });
  };

  const exportCSV = () => {
    const rows = [['Department', 'Employee Code', 'Name', 'Designation', 'Status', 'Reporting Manager']];
    for (const g of groups) {
      for (const e of g.employees) {
        rows.push([
          g.department,
          e.employeeCode,
          `${e.firstName} ${e.lastName}`,
          e.designation?.name ?? '',
          e.status.replace(/_/g, ' '),
          e.manager ? `${e.manager.firstName} ${e.manager.lastName} (${e.manager.employeeCode})` : 'None',
        ]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `employee-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Employee Report</h1>
            <p className="text-muted-foreground text-sm">{total} active employees across {deptCount} departments</p>
          </div>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium hover:bg-muted transition-colors"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {groups.map(g => (
          <button
            key={g.department}
            onClick={() => toggle(g.department)}
            className="px-3 py-1.5 bg-card border rounded-lg text-xs font-medium hover:border-primary/50 transition-colors"
          >
            {g.department} <span className="text-muted-foreground ml-1">{g.employees.length}</span>
          </button>
        ))}
      </div>

      {/* Department sections */}
      {groups.map(g => (
        <div key={g.department} className="bg-card border rounded-2xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
            onClick={() => toggle(g.department)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold">{g.department}</p>
                <p className="text-xs text-muted-foreground">{g.employees.length} employee{g.employees.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {collapsed.has(g.department)
              ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />
            }
          </button>

          {!collapsed.has(g.department) && (
            <div className="border-t overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Employee</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Designation</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Reporting Manager</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {g.employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                            {getInitials(`${emp.firstName} ${emp.lastName}`)}
                          </div>
                          <div>
                            <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{emp.employeeCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{emp.designation?.name ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', STATUS_COLOR[emp.status] ?? 'bg-gray-100 text-gray-600')}>
                          {emp.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {emp.manager ? (
                          <div>
                            <p className="font-medium">{emp.manager.firstName} {emp.manager.lastName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{emp.manager.employeeCode}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
