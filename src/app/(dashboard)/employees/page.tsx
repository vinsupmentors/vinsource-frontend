'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Employee } from '@/types';
import { formatDate, getInitials } from '@/lib/utils';
import { Users, Search, Plus, Filter, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const statusColor: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  ON_PROBATION: 'bg-yellow-100 text-yellow-700',
  INACTIVE: 'bg-gray-100 text-gray-600',
  RESIGNED: 'bg-red-100 text-red-700',
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      const { data } = await api.get(`/api/employees?${params}`);
      setEmployees(data.data);
      setTotal(data.meta?.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEmployees(); }, [page, search, status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" /> Employees
          </h1>
          <p className="text-muted-foreground text-sm">{total} total employees</p>
        </div>
        <Link href="/employees/new" className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition text-sm">
          <Plus className="w-4 h-4" /> Add Employee
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Search by name, code, email..."
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="ON_PROBATION">On Probation</option>
          <option value="INACTIVE">Inactive</option>
          <option value="RESIGNED">Resigned</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Employee</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Code</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Department</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Designation</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Joining Date</th>
                  <th className="text-left px-5 py-3 text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employees.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No employees found</td></tr>
                ) : employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/employees/${emp.id}`} className="flex items-center gap-3 hover:text-primary">
                        <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {emp.profilePhoto
                            ? <img src={emp.profilePhoto} alt="" className="w-8 h-8 rounded-full object-cover" />
                            : getInitials(`${emp.firstName} ${emp.lastName}`)
                          }
                        </div>
                        <div>
                          <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-muted-foreground">{emp.email}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{emp.employeeCode}</td>
                    <td className="px-5 py-3">{emp.department?.name || '-'}</td>
                    <td className="px-5 py-3">{emp.designation?.name || '-'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(emp.joiningDate)}</td>
                    <td className="px-5 py-3">
                      <span className={cn('px-2 py-1 rounded-md text-xs font-medium', statusColor[emp.status] || 'bg-gray-100 text-gray-600')}>
                        {emp.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-between px-5 py-3 border-t">
            <p className="text-sm text-muted-foreground">Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-muted">Previous</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= total}
                className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-muted">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
