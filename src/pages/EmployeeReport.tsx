import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getInitials, formatDate } from '@/lib/utils';
import { BarChart3, Loader2, Users, ChevronDown, ChevronRight, Download, ClipboardList, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface PendingOnboarding {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  joiningDate: string;
  createdAt: string;
  firstLoginAt?: string | null;
  employee?: {
    department?: { name: string } | null;
    designation?: { name: string } | null;
  } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMP_STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  ON_PROBATION: 'bg-blue-100 text-blue-700',
};

const ONB_STATUS_LABEL: Record<string, string> = {
  ACCOUNT_CREATED: 'Not Started',
  PROFILE_COMPLETE: 'Form Partial',
  PENDING: 'Pending Review',
  AWAITING_APPROVAL: 'Awaiting Approval',
  REJECTED: 'Rejected',
};

const ONB_STATUS_COLOR: Record<string, string> = {
  ACCOUNT_CREATED: 'bg-gray-100 text-gray-500',
  PROFILE_COMPLETE: 'bg-blue-100 text-blue-600',
  PENDING: 'bg-yellow-100 text-yellow-700',
  AWAITING_APPROVAL: 'bg-orange-100 text-orange-700',
  REJECTED: 'bg-red-100 text-red-600',
};

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function EmployeeReportPage() {
  const [tab, setTab] = useState<'employees' | 'onboarding'>('employees');

  // Employee report state
  const [groups, setGroups] = useState<DeptGroup[]>([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [deptCount, setDeptCount] = useState(0);

  // Onboarding pending state
  const [pending, setPending] = useState<PendingOnboarding[]>([]);
  const [onbLoading, setOnbLoading] = useState(true);

  useEffect(() => {
    api.get('/api/employees/report/departments')
      .then(r => {
        setGroups(r.data.data ?? []);
        setTotal(r.data.meta?.total ?? 0);
        setDeptCount(r.data.meta?.departments ?? 0);
      })
      .finally(() => setEmpLoading(false));

    // Fetch all non-completed onboarding
    api.get('/api/onboarding?limit=200')
      .then(r => {
        const all: PendingOnboarding[] = r.data.data ?? [];
        setPending(all.filter(o => !['COMPLETED'].includes(o.status)));
      })
      .finally(() => setOnbLoading(false));
  }, []);

  const toggle = (dept: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(dept) ? next.delete(dept) : next.add(dept);
      return next;
    });
  };

  // ── CSV exports ──────────────────────────────────────────────────────────────

  const exportEmpCSV = () => {
    const rows = [['Department', 'Emp Code', 'Name', 'Designation', 'Status', 'Reporting Manager', 'Manager Code']];
    for (const g of groups) {
      for (const e of g.employees) {
        rows.push([
          g.department,
          e.employeeCode,
          `${e.firstName} ${e.lastName}`,
          e.designation?.name ?? '',
          e.status.replace(/_/g, ' '),
          e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : '',
          e.manager?.employeeCode ?? '',
        ]);
      }
    }
    downloadCSV(rows, `active-employees-${today()}.csv`);
  };

  const exportOnbCSV = () => {
    const rows = [['Name', 'Email', 'Department', 'Designation', 'Stage', 'Joining Date', 'Days Pending']];
    for (const o of pending) {
      rows.push([
        `${o.firstName} ${o.lastName}`,
        o.email,
        o.employee?.department?.name ?? '',
        o.employee?.designation?.name ?? '',
        ONB_STATUS_LABEL[o.status] ?? o.status,
        formatDate(o.joiningDate),
        String(daysSince(o.createdAt)),
      ]);
    }
    downloadCSV(rows, `onboarding-pending-${today()}.csv`);
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: filename,
    });
    a.click();
  };

  const today = () => new Date().toISOString().slice(0, 10);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Reports</h1>
            <p className="text-muted-foreground text-sm">Active employees & onboarding status</p>
          </div>
        </div>
        <button
          onClick={tab === 'employees' ? exportEmpCSV : exportOnbCSV}
          className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium hover:bg-muted transition-colors"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: 'employees', label: `Active Employees (${total})`, icon: Users },
          { key: 'onboarding', label: `Onboarding Pending (${pending.length})`, icon: ClipboardList },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Active Employees ── */}
      {tab === 'employees' && (
        <>
          {empLoading ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
          ) : (
            <>
              {/* Dept summary chips */}
              <div className="flex flex-wrap gap-2">
                {groups.map(g => (
                  <button key={g.department} onClick={() => toggle(g.department)}
                    className="px-3 py-1.5 bg-card border rounded-lg text-xs font-medium hover:border-primary/50 transition-colors">
                    {g.department} <span className="text-muted-foreground ml-1">{g.employees.length}</span>
                  </button>
                ))}
              </div>

              {/* Department tables */}
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
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
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
                                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', EMP_STATUS_COLOR[emp.status] ?? 'bg-gray-100 text-gray-600')}>
                                  {emp.status.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                {emp.manager ? (
                                  <div>
                                    <p className="font-medium">{emp.manager.firstName} {emp.manager.lastName}</p>
                                    <p className="text-[10px] text-muted-foreground font-mono">{emp.manager.employeeCode}</p>
                                  </div>
                                ) : <span className="text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* ── Tab: Onboarding Pending ── */}
      {tab === 'onboarding' && (
        <>
          {onbLoading ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
          ) : pending.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>All onboardings are complete!</p>
            </div>
          ) : (
            <div className="bg-card border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold text-sm">{pending.length} pending onboarding{pending.length !== 1 ? 's' : ''}</span>
                </div>
                <p className="text-xs text-muted-foreground">Employees who haven't completed the onboarding wizard</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Employee</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Department</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Joining Date</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Stage</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Days Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pending
                      .sort((a, b) => daysSince(b.createdAt) - daysSince(a.createdAt))
                      .map(o => {
                        const days = daysSince(o.createdAt);
                        return (
                          <tr key={o.id} className="hover:bg-muted/20">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                  {(o.firstName[0] ?? '') + (o.lastName[0] ?? '')}
                                </div>
                                <div>
                                  <p className="font-medium">{o.firstName} {o.lastName}</p>
                                  <p className="text-[10px] text-muted-foreground">{o.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">
                              {o.employee?.department?.name ?? '—'}
                              {o.employee?.designation?.name && (
                                <p className="text-[10px]">{o.employee.designation.name}</p>
                              )}
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">{formatDate(o.joiningDate)}</td>
                            <td className="px-5 py-3">
                              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', ONB_STATUS_COLOR[o.status] ?? 'bg-gray-100 text-gray-500')}>
                                {ONB_STATUS_LABEL[o.status] ?? o.status}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span className={cn(
                                'font-semibold text-sm',
                                days > 14 ? 'text-red-600' : days > 7 ? 'text-amber-600' : 'text-muted-foreground'
                              )}>
                                {days}d
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
