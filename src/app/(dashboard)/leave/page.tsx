'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { LeaveRequest, LeaveBalance } from '@/types';
import { formatDate } from '@/lib/utils';
import { Calendar, Plus, Clock, CheckCircle, XCircle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusColor: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

export default function LeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });

  const fetchAll = async () => {
    try {
      const [reqRes, balRes] = await Promise.all([
        api.get('/api/leave/my-requests?limit=20'),
        api.get('/api/leave/my-balances'),
      ]);
      setRequests(reqRes.data.data);
      setBalances(balRes.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/leave/apply', form);
      setShowForm(false);
      setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
      await fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e.response?.data?.message || 'Failed to apply leave');
    }
    setSubmitting(false);
  };

  if (loading) return <div className="flex justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary mt-24" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Management</h1>
          <p className="text-muted-foreground text-sm">Apply and track your leaves</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
        >
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {balances.map((b) => {
          const available = b.totalDays - b.usedDays - b.pendingDays;
          return (
            <div key={b.id} className="bg-white dark:bg-gray-900 border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-primary">{available}</p>
              <p className="text-xs text-muted-foreground mt-1">{b.leaveType.name}</p>
              <p className="text-[10px] text-muted-foreground">{b.usedDays} used / {b.totalDays} total</p>
            </div>
          );
        })}
      </div>

      {/* Apply form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">Apply for Leave</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleApply} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Leave Type</label>
                <select
                  value={form.leaveTypeId}
                  onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
                  required
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                >
                  <option value="">Select leave type</option>
                  {balances.map((b) => (
                    <option key={b.id} value={b.leaveType.type}>{b.leaveType.name} ({b.totalDays - b.usedDays - b.pendingDays} available)</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">From</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">To</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason</label>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3} placeholder="Reason for leave..."
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border rounded-lg font-medium hover:bg-muted transition text-sm">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Requests */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">My Leave Requests</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Type</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">From</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">To</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Days</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Status</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No leave requests</td></tr>
              ) : requests.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium">{r.leaveType.name}</td>
                  <td className="px-5 py-3">{formatDate(r.startDate)}</td>
                  <td className="px-5 py-3">{formatDate(r.endDate)}</td>
                  <td className="px-5 py-3">{r.days}</td>
                  <td className="px-5 py-3">
                    <span className={cn('px-2 py-1 rounded-md text-xs font-medium', statusColor[r.status])}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
