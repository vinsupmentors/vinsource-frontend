'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Attendance } from '@/types';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Clock, CheckCircle, XCircle, Loader2, MapPin, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusColor: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-100 text-red-700',
  HALF_DAY: 'bg-yellow-100 text-yellow-700',
  ON_LEAVE: 'bg-blue-100 text-blue-700',
  HOLIDAY: 'bg-purple-100 text-purple-700',
  WEEKEND: 'bg-gray-100 text-gray-600',
};

export default function AttendancePage() {
  const [today, setToday] = useState<Attendance | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [month] = useState(new Date().getMonth() + 1);
  const [year] = useState(new Date().getFullYear());

  const fetchAll = async () => {
    try {
      const [todayRes, historyRes, summaryRes] = await Promise.all([
        api.get('/api/attendance/today'),
        api.get(`/api/attendance/history?month=${month}&year=${year}&limit=31`),
        api.get(`/api/attendance/summary?month=${month}&year=${year}`),
      ]);
      setToday(todayRes.data.data);
      setHistory(historyRes.data.data);
      setSummary(summaryRes.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      await api.post('/api/attendance/check-in', { method: 'WEB' });
      await fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e.response?.data?.message || 'Error');
    }
    setActionLoading(false);
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    try {
      await api.post('/api/attendance/check-out', { method: 'WEB' });
      await fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e.response?.data?.message || 'Error');
    }
    setActionLoading(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  );

  const canCheckIn = !today?.checkIn;
  const canCheckOut = today?.checkIn && !today?.checkOut;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-muted-foreground text-sm">Track your daily attendance</p>
      </div>

      {/* Today's card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-semibold text-lg">Today's Attendance</h2>
            <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          {today?.status && (
            <span className={cn('px-3 py-1 rounded-full text-sm font-medium', statusColor[today.status])}>
              {today.status.replace('_', ' ')}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-muted/30 rounded-xl">
            <Clock className="w-6 h-6 mx-auto mb-2 text-green-500" />
            <p className="text-xs text-muted-foreground">Check In</p>
            <p className="font-semibold">{today?.checkIn ? new Date(today.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
          </div>
          <div className="text-center p-4 bg-muted/30 rounded-xl">
            <Clock className="w-6 h-6 mx-auto mb-2 text-red-500" />
            <p className="text-xs text-muted-foreground">Check Out</p>
            <p className="font-semibold">{today?.checkOut ? new Date(today.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
          </div>
          <div className="text-center p-4 bg-muted/30 rounded-xl">
            <Monitor className="w-6 h-6 mx-auto mb-2 text-blue-500" />
            <p className="text-xs text-muted-foreground">Work Hours</p>
            <p className="font-semibold">{today?.workHours ? `${today.workHours.toFixed(1)}h` : '--'}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCheckIn}
            disabled={!canCheckIn || actionLoading}
            className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Check In
          </button>
          <button
            onClick={handleCheckOut}
            disabled={!canCheckOut || actionLoading}
            className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Check Out
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Present', value: summary.PRESENT || 0, color: 'text-green-600' },
            { label: 'Absent', value: summary.ABSENT || 0, color: 'text-red-600' },
            { label: 'Half Day', value: summary.HALF_DAY || 0, color: 'text-yellow-600' },
            { label: 'On Leave', value: summary.ON_LEAVE || 0, color: 'text-blue-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">Attendance History — {new Date(year, month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Check In</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Check Out</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Hours</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No records</td></tr>
              ) : history.map((a) => (
                <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">{formatDate(a.date)}</td>
                  <td className="px-5 py-3">{a.checkIn ? new Date(a.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td className="px-5 py-3">{a.checkOut ? new Date(a.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td className="px-5 py-3">{a.workHours ? `${a.workHours.toFixed(1)}h` : '-'}</td>
                  <td className="px-5 py-3">
                    <span className={cn('px-2 py-1 rounded-md text-xs font-medium', statusColor[a.status] || 'bg-gray-100 text-gray-600')}>
                      {a.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
