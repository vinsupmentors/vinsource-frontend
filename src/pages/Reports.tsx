import { useEffect, useState, useCallback, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api';
import {
  Download, Loader2, AlertCircle, Filter, RefreshCw,
  Users, Clock, DollarSign, Calendar, ChevronDown, X,
  TrendingUp, Building2, UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportType = 'attendance' | 'pay-scale' | 'leave' | 'employees';

interface FilterState {
  reportType: ReportType;
  rangeMode: 'month' | 'custom';
  month: string;   // 0-based string for API
  year: string;
  from: string;
  to: string;
  employeeId: string;
  departmentId: string;
  teamManagerId: string;
  leaveStatus: string;
  empStatus: string;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const REPORT_TABS: { key: ReportType; label: string; icon: React.ComponentType<{className?:string}> }[] = [
  { key: 'attendance', label: 'Attendance',     icon: Clock },
  { key: 'pay-scale',  label: 'Pay Scale',      icon: DollarSign },
  { key: 'leave',      label: 'Leave',          icon: Calendar },
  { key: 'employees',  label: 'Employee List',  icon: Users },
];

// ── Excel export helpers ──────────────────────────────────────────────────────

function exportXLSX(sheets: { name: string; rows: Record<string, any>[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    // Auto column widths
    const cols = Object.keys(s.rows[0] || {});
    ws['!cols'] = cols.map(k => ({ wch: Math.max(k.length, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN');
}

function fmtTime(d: string | Date | null | undefined) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtCur(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', color)}>{label}</span>;
}

const attColor: Record<string, string> = {
  PRESENT:  'bg-green-100 text-green-700',
  ABSENT:   'bg-red-100 text-red-600',
  LATE:     'bg-amber-100 text-amber-700',
  HALF_DAY: 'bg-blue-100 text-blue-700',
  HOLIDAY:  'bg-purple-100 text-purple-700',
  WEEKEND:  'bg-gray-100 text-gray-500',
  ON_LEAVE: 'bg-orange-100 text-orange-600',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const now = new Date();
  const [filters, setFilters] = useState<FilterState>({
    reportType: 'attendance',
    rangeMode: 'month',
    month: String(now.getMonth()),
    year: String(now.getFullYear()),
    from: '', to: '',
    employeeId: '', departmentId: '', teamManagerId: '',
    leaveStatus: '', empStatus: '',
  });

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterMeta, setFilterMeta] = useState<{ departments: any[]; managers: any[] }>({ departments: [], managers: [] });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const set = (k: keyof FilterState, v: string) => setFilters(f => ({ ...f, [k]: v }));

  // Load filter meta once
  useEffect(() => {
    api.get<{ data: any }>('/api/reports/filters').then(r => setFilterMeta(r.data.data)).catch(() => {});
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true); setError(''); setExpandedRows(new Set());
    try {
      const params: Record<string, string> = { year: filters.year };
      if (filters.rangeMode === 'month') {
        params.month = filters.month;
      } else {
        if (filters.from) params.from = filters.from;
        if (filters.to)   params.to   = filters.to;
      }
      if (filters.employeeId)   params.employeeId   = filters.employeeId;
      if (filters.departmentId) params.departmentId = filters.departmentId;
      if (filters.teamManagerId) params.teamManagerId = filters.teamManagerId;
      if (filters.leaveStatus)  params.status       = filters.leaveStatus;
      if (filters.empStatus)    params.status       = filters.empStatus;

      const r = await api.get<{ data: any[] }>(`/api/reports/${filters.reportType}`, { params });
      setData(r.data.data ?? []);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Failed to load report'); }
    finally { setLoading(false); }
  }, [filters]);

  // Auto-fetch on tab switch
  useEffect(() => { fetch(); }, [filters.reportType]);

  const toggleRow = (id: string) =>
    setExpandedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Excel exports ─────────────────────────────────────────────────────────

  const exportAttendance = () => {
    const summary = data.map(e => ({
      'Emp Code': e.employeeCode,
      'Name': e.name,
      'Department': e.department,
      'Designation': e.designation,
      'Reporting Manager': e.manager,
      'Present': e.present,
      'Half Day': e.halfDay,
      'Late': e.late,
      'Absent': e.absent,
      'WFH': e.wfh,
      'Effective Days': e.totalWorkingDays,
      'Total Hours': e.totalHours,
      'OT Hours': e.otHours,
    }));

    const daily: Record<string, any>[] = [];
    data.forEach(e => {
      (e.dailyRecords || []).forEach((d: any) => {
        daily.push({
          'Emp Code': e.employeeCode,
          'Name': e.name,
          'Department': e.department,
          'Date': fmtDate(d.date),
          'Status': d.status,
          'Check In': fmtTime(d.checkIn),
          'Check Out': fmtTime(d.checkOut),
          'Work Hours': d.workHours ?? '',
          'Location': d.locationType,
        });
      });
    });

    exportXLSX([
      { name: 'Summary', rows: summary.length ? summary : [{ Note: 'No data' }] },
      { name: 'Daily Records', rows: daily.length ? daily : [{ Note: 'No data' }] },
    ], `Attendance_Report_${MONTHS[Number(filters.month)]}_${filters.year}.xlsx`);
  };

  const exportPayScale = () => {
    const rows = data.map(e => ({
      'Emp Code': e.employeeCode,
      'Name': e.name,
      'Department': e.department,
      'Designation': e.designation,
      'Manager': e.manager,
      'Working Days': e.workingDays,
      'Present Days': e.presentDays,
      'LOP Days': e.lopDays,
      'Basic': e.basic,
      'HRA': e.hra,
      'Conveyance': e.conveyance,
      'Medical Allowance': e.medicalAllowance,
      'Special Allowance': e.specialAllowance,
      'Bonus': e.bonus,
      'Incentives': e.incentives,
      'Gross Salary': e.grossSalary,
      'PF': e.pf,
      'ESI': e.esi,
      'Prof Tax': e.professionalTax,
      'TDS': e.tds,
      'Loan Recovery': e.loanRecovery,
      'LOP Deduction': e.lopDeduction,
      'Total Deductions': e.totalDeductions,
      'Net Salary': e.netSalary,
      'Payslip Generated': e.payslipFound ? 'Yes' : 'No',
    }));
    exportXLSX([{ name: 'Pay Scale', rows: rows.length ? rows : [{ Note: 'No data' }] }],
      `PayScale_Report_${MONTHS[Number(filters.month)]}_${filters.year}.xlsx`);
  };

  const exportLeave = () => {
    const rows: Record<string, any>[] = [];
    data.forEach(e => {
      if (e.leaveRequests.length === 0) {
        rows.push({ 'Emp Code': e.employeeCode, 'Name': e.name, 'Department': e.department, 'Designation': e.designation, 'Manager': e.manager, 'Leave Type': '', 'From': '', 'To': '', 'Days': '', 'Status': 'No leaves', 'Reason': '' });
      } else {
        e.leaveRequests.forEach((l: any) => {
          rows.push({
            'Emp Code': e.employeeCode, 'Name': e.name, 'Department': e.department,
            'Designation': e.designation, 'Manager': e.manager,
            'Leave Type': l.leaveType?.name ?? '',
            'From': fmtDate(l.startDate), 'To': fmtDate(l.endDate),
            'Days': l.days, 'Status': l.status, 'Reason': l.reason ?? '',
          });
        });
      }
    });
    exportXLSX([{ name: 'Leave Report', rows: rows.length ? rows : [{ Note: 'No data' }] }],
      `Leave_Report_${MONTHS[Number(filters.month)]}_${filters.year}.xlsx`);
  };

  const exportEmployees = () => {
    const rows = data.map(e => ({
      'Emp Code': e.employeeCode, 'Name': e.name, 'Email': e.email, 'Phone': e.phone,
      'Gender': e.gender, 'DOB': fmtDate(e.dateOfBirth), 'Joining Date': fmtDate(e.joiningDate),
      'Confirmation Date': fmtDate(e.confirmationDate), 'Status': e.status,
      'Department': e.department, 'Designation': e.designation, 'Manager': e.manager,
      'Role': e.role, 'Net Salary': e.netSalary, 'Gross Salary': e.grossSalary,
    }));
    exportXLSX([{ name: 'Employees', rows: rows.length ? rows : [{ Note: 'No data' }] }],
      `Employee_Directory_${filters.year}.xlsx`);
  };

  const handleExport = () => {
    if (data.length === 0) return;
    if (filters.reportType === 'attendance') exportAttendance();
    else if (filters.reportType === 'pay-scale') exportPayScale();
    else if (filters.reportType === 'leave') exportLeave();
    else exportEmployees();
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const inputCls = 'px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30';
  const selCls = cn(inputCls, 'pr-8 cursor-pointer');

  const monthLabel = MONTHS[Number(filters.month)] ?? '';
  const totalEmployees = data.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm">Generate, filter and export HR reports</p>
        </div>
        <button
          onClick={handleExport}
          disabled={loading || data.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          Export Excel
        </button>
      </div>

      {/* Report tabs */}
      <div className="flex gap-1 flex-wrap border-b">
        {REPORT_TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => set('reportType', t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                filters.reportType === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}>
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1">
          <Filter className="w-4 h-4" />
          Filters
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          {/* Date range mode */}
          {filters.reportType !== 'employees' && (
            <>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Range</label>
                <select className={selCls} value={filters.rangeMode} onChange={e => set('rangeMode', e.target.value as any)}>
                  <option value="month">Monthly</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {filters.rangeMode === 'month' ? (
                <>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Month</label>
                    <select className={selCls} value={filters.month} onChange={e => set('month', e.target.value)}>
                      {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Year</label>
                    <select className={selCls} value={filters.year} onChange={e => set('year', e.target.value)}>
                      {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">From</label>
                    <input type="date" className={inputCls} value={filters.from} onChange={e => set('from', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">To</label>
                    <input type="date" className={inputCls} value={filters.to} onChange={e => set('to', e.target.value)} />
                  </div>
                </>
              )}
            </>
          )}

          {/* Department */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Department</label>
            <select className={selCls} value={filters.departmentId} onChange={e => set('departmentId', e.target.value)}>
              <option value="">All Departments</option>
              {filterMeta.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Manager / Team */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Team (Manager)</label>
            <select className={selCls} value={filters.teamManagerId} onChange={e => set('teamManagerId', e.target.value)}>
              <option value="">All Teams</option>
              {filterMeta.managers.map(m => (
                <option key={m.id} value={m.id}>{m.firstName} {m.lastName} — {m.designation?.name}</option>
              ))}
            </select>
          </div>

          {/* Leave status filter */}
          {filters.reportType === 'leave' && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Status</label>
              <select className={selCls} value={filters.leaveStatus} onChange={e => set('leaveStatus', e.target.value)}>
                <option value="">All</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          )}

          {/* Employee status filter */}
          {filters.reportType === 'employees' && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Status</label>
              <select className={selCls} value={filters.empStatus} onChange={e => set('empStatus', e.target.value)}>
                <option value="">All</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_PROBATION">On Probation</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          )}

          <button onClick={fetch} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Generate
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-500 p-3.5 bg-red-50 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Summary bar */}
      {!loading && data.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground bg-muted/40 px-4 py-2.5 rounded-xl border">
          <UserCheck className="w-4 h-4" />
          <span><strong className="text-foreground">{totalEmployees}</strong> employee{totalEmployees !== 1 ? 's' : ''}</span>
          {filters.reportType === 'attendance' && (
            <>
              <span>|</span>
              <span>Avg present: <strong className="text-foreground">
                {(data.reduce((s, e) => s + e.present, 0) / data.length).toFixed(1)} days
              </strong></span>
              <span>|</span>
              <span>Total OT: <strong className="text-foreground">
                {data.reduce((s, e) => s + e.otHours, 0).toFixed(1)} hrs
              </strong></span>
            </>
          )}
          {filters.reportType === 'pay-scale' && (
            <>
              <span>|</span>
              <span>Total Net Payout: <strong className="text-foreground">
                {fmtCur(data.reduce((s, e) => s + e.netSalary, 0))}
              </strong></span>
              <span>|</span>
              <span>Total Gross: <strong className="text-foreground">
                {fmtCur(data.reduce((s, e) => s + e.grossSalary, 0))}
              </strong></span>
            </>
          )}
          {filters.reportType === 'leave' && (
            <>
              <span>|</span>
              <span>Total leaves taken: <strong className="text-foreground">
                {data.reduce((s, e) => s + e.totalLeavesTaken, 0)} days
              </strong></span>
            </>
          )}
        </div>
      )}

      {/* ── ATTENDANCE TABLE ── */}
      {filters.reportType === 'attendance' && !loading && (
        <div className="bg-card border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Manager</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Present</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Half Day</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Late</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Absent</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">WFH</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Eff. Days</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Hours</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">OT Hrs</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.length === 0 && (
                <tr><td colSpan={12} className="text-center py-10 text-muted-foreground">No attendance records found</td></tr>
              )}
              {data.map(e => (
                <Fragment key={e.employeeCode}>
                  <tr className="hover:bg-muted/20 cursor-pointer" onClick={() => toggleRow(e.employeeCode)}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.employeeCode}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <p>{e.department}</p>
                      <p className="text-[10px]">{e.designation}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.manager || '—'}</td>
                    <td className="text-center px-3 py-3"><span className="font-semibold text-green-600">{e.present}</span></td>
                    <td className="text-center px-3 py-3 text-blue-600">{e.halfDay}</td>
                    <td className="text-center px-3 py-3 text-amber-600">{e.late}</td>
                    <td className="text-center px-3 py-3 text-red-500">{e.absent}</td>
                    <td className="text-center px-3 py-3 text-purple-600">{e.wfh}</td>
                    <td className="text-center px-3 py-3 font-semibold">{e.totalWorkingDays}</td>
                    <td className="text-center px-3 py-3 text-xs">{e.totalHours}h</td>
                    <td className="text-center px-3 py-3 text-xs text-orange-600">{e.otHours}h</td>
                    <td className="px-3 py-3">
                      <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', expandedRows.has(e.employeeCode) && 'rotate-180')} />
                    </td>
                  </tr>
                  {expandedRows.has(e.employeeCode) && (
                    <tr>
                      <td colSpan={12} className="px-4 pb-3 bg-muted/10">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs mt-1">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left py-1 pr-3">Date</th>
                                <th className="text-left py-1 pr-3">Status</th>
                                <th className="text-left py-1 pr-3">Check In</th>
                                <th className="text-left py-1 pr-3">Check Out</th>
                                <th className="text-left py-1 pr-3">Hours</th>
                                <th className="text-left py-1">Location</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(e.dailyRecords || []).map((d: any, i: number) => (
                                <tr key={i} className="border-t border-muted/30">
                                  <td className="py-1 pr-3">{fmtDate(d.date)}</td>
                                  <td className="py-1 pr-3"><Badge label={d.status} color={attColor[d.status] ?? 'bg-gray-100 text-gray-500'} /></td>
                                  <td className="py-1 pr-3">{fmtTime(d.checkIn) || '—'}</td>
                                  <td className="py-1 pr-3">{fmtTime(d.checkOut) || '—'}</td>
                                  <td className="py-1 pr-3">{d.workHours ? `${d.workHours}h` : '—'}</td>
                                  <td className="py-1">{d.locationType}</td>
                                </tr>
                              ))}
                              {(e.dailyRecords || []).length === 0 && (
                                <tr><td colSpan={6} className="py-2 text-muted-foreground">No daily records</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PAY SCALE TABLE ── */}
      {filters.reportType === 'pay-scale' && !loading && (
        <div className="bg-card border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Department</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Work Days</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Present</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">LOP</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground">Basic</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground">HRA</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground">Gross</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground">Deductions</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground">LOP Ded.</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Net Salary</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Payslip</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.length === 0 && (
                <tr><td colSpan={13} className="text-center py-10 text-muted-foreground">No salary data found</td></tr>
              )}
              {data.map(e => (
                <Fragment key={e.employeeCode}>
                  <tr className="hover:bg-muted/20 cursor-pointer" onClick={() => toggleRow(e.employeeCode)}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.employeeCode} · {e.designation}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{e.department}</td>
                    <td className="text-center px-3 py-3 text-xs">{e.workingDays}</td>
                    <td className="text-center px-3 py-3 text-xs text-green-600 font-semibold">{e.presentDays}</td>
                    <td className="text-center px-3 py-3 text-xs text-red-500">{e.lopDays}</td>
                    <td className="text-right px-3 py-3 text-xs">{e.basic ? fmtCur(e.basic) : '—'}</td>
                    <td className="text-right px-3 py-3 text-xs">{e.hra ? fmtCur(e.hra) : '—'}</td>
                    <td className="text-right px-3 py-3 text-xs font-medium">{e.grossSalary ? fmtCur(e.grossSalary) : '—'}</td>
                    <td className="text-right px-3 py-3 text-xs text-red-500">{e.totalDeductions ? fmtCur(e.totalDeductions) : '—'}</td>
                    <td className="text-right px-3 py-3 text-xs text-amber-600">{e.lopDeduction ? fmtCur(e.lopDeduction) : '—'}</td>
                    <td className="text-right px-4 py-3 font-bold text-green-700">{e.netSalary ? fmtCur(e.netSalary) : <span className="text-muted-foreground font-normal text-xs">No payslip</span>}</td>
                    <td className="text-center px-3 py-3">
                      <Badge label={e.payslipFound ? 'Generated' : 'Pending'} color={e.payslipFound ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'} />
                    </td>
                    <td className="px-3 py-3">
                      <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', expandedRows.has(e.employeeCode) && 'rotate-180')} />
                    </td>
                  </tr>
                  {expandedRows.has(e.employeeCode) && (
                    <tr>
                      <td colSpan={13} className="px-4 pb-3 bg-muted/10">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-xs">
                          {[
                            { label: 'Conveyance', val: e.conveyance },
                            { label: 'Medical', val: e.medicalAllowance },
                            { label: 'Special Allowance', val: e.specialAllowance },
                            { label: 'Bonus', val: e.bonus },
                            { label: 'Incentives', val: e.incentives },
                            { label: 'PF', val: e.pf },
                            { label: 'ESI', val: e.esi },
                            { label: 'Professional Tax', val: e.professionalTax },
                            { label: 'TDS', val: e.tds },
                            { label: 'Loan Recovery', val: e.loanRecovery },
                          ].map(r => (
                            <div key={r.label} className="flex justify-between bg-card border rounded-lg px-3 py-2">
                              <span className="text-muted-foreground">{r.label}</span>
                              <span className="font-medium">{fmtCur(r.val)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Structure: Gross {fmtCur(e.structureGross)} · Net {fmtCur(e.structureNet)} · Basic {fmtCur(e.structureBasic)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            {data.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="px-4 py-3 text-xs" colSpan={7}>Total ({data.length} employees)</td>
                  <td className="text-right px-3 py-3 text-xs">{fmtCur(data.reduce((s, e) => s + e.grossSalary, 0))}</td>
                  <td className="text-right px-3 py-3 text-xs text-red-500">{fmtCur(data.reduce((s, e) => s + e.totalDeductions, 0))}</td>
                  <td className="text-right px-3 py-3 text-xs text-amber-600">{fmtCur(data.reduce((s, e) => s + e.lopDeduction, 0))}</td>
                  <td className="text-right px-4 py-3 text-green-700">{fmtCur(data.reduce((s, e) => s + e.netSalary, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── LEAVE TABLE ── */}
      {filters.reportType === 'leave' && !loading && (
        <div className="bg-card border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Department</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Manager</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Requests</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Days Taken</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">CL Balance</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No leave data found</td></tr>
              )}
              {data.map(e => {
                const clBal = e.balances.find((b: any) => b.leaveType?.name?.toLowerCase().includes('casual'));
                return (
                  <Fragment key={e.employeeCode}>
                    <tr className="hover:bg-muted/20 cursor-pointer" onClick={() => toggleRow(e.employeeCode)}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.employeeCode} · {e.designation}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{e.department}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{e.manager || '—'}</td>
                      <td className="text-center px-3 py-3">{e.leaveRequests.length}</td>
                      <td className="text-center px-3 py-3 font-semibold text-amber-600">{e.totalLeavesTaken}</td>
                      <td className="px-4 py-3 text-xs">
                        {clBal
                          ? <span>{clBal.totalDays - clBal.usedDays} / {clBal.totalDays} remaining</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', expandedRows.has(e.employeeCode) && 'rotate-180')} />
                      </td>
                    </tr>
                    {expandedRows.has(e.employeeCode) && (
                      <tr>
                        <td colSpan={7} className="px-4 pb-3 bg-muted/10">
                          {e.leaveRequests.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">No leave requests in this period</p>
                          ) : (
                            <table className="w-full text-xs mt-1">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left py-1 pr-3">Type</th>
                                  <th className="text-left py-1 pr-3">From</th>
                                  <th className="text-left py-1 pr-3">To</th>
                                  <th className="text-left py-1 pr-3">Days</th>
                                  <th className="text-left py-1 pr-3">Status</th>
                                  <th className="text-left py-1">Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {e.leaveRequests.map((l: any) => (
                                  <tr key={l.id} className="border-t border-muted/30">
                                    <td className="py-1 pr-3">{l.leaveType?.name}</td>
                                    <td className="py-1 pr-3">{fmtDate(l.startDate)}</td>
                                    <td className="py-1 pr-3">{fmtDate(l.endDate)}</td>
                                    <td className="py-1 pr-3">{l.days}</td>
                                    <td className="py-1 pr-3">
                                      <Badge label={l.status}
                                        color={l.status === 'APPROVED' ? 'bg-green-100 text-green-700' : l.status === 'REJECTED' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'} />
                                    </td>
                                    <td className="py-1 text-muted-foreground">{l.reason || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── EMPLOYEE DIRECTORY TABLE ── */}
      {filters.reportType === 'employees' && !loading && (
        <div className="bg-card border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Department / Designation</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Manager</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Joining</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Net Salary</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No employees found</td></tr>
              )}
              {data.map(e => (
                <tr key={e.employeeCode} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.employeeCode} · {e.role}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>{e.department || '—'}</p>
                    <p className="text-muted-foreground">{e.designation || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{e.manager || '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    <p>{e.email}</p>
                    <p className="text-muted-foreground">{e.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(e.joiningDate)}</td>
                  <td className="text-center px-3 py-3">
                    <Badge label={e.status}
                      color={e.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : e.status === 'ON_PROBATION' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'} />
                  </td>
                  <td className="text-right px-4 py-3 text-xs font-medium">{e.netSalary ? fmtCur(e.netSalary) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
