'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useRole } from '@/hooks/useAuth';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { DashboardStats } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Users, UserCheck, Clock, Calendar, TrendingUp, Cake,
  AlertCircle, Loader2, ArrowUpRight,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const StatCard = ({
  title, value, icon: Icon, color, subtitle
}: {
  title: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
  color: string; subtitle?: string;
}) => (
  <div className="bg-white dark:bg-gray-900 rounded-xl border p-5 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm text-muted-foreground">{title}</p>
      {subtitle && <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5"><ArrowUpRight className="w-3 h-3" />{subtitle}</p>}
    </div>
  </div>
);

export default function DashboardPage() {
  const { role } = useRole();
  const user = useSelector((s: RootState) => s.auth.user);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get('/api/dashboard/stats');
        setStats(data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const employee = user?.employee;
  const firstName = employee?.firstName || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {greeting}, {firstName}! 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-medium">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            System Online
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Employees" value={stats.totalEmployees} icon={Users} color="bg-blue-500" subtitle={`${stats.newJoineeThisMonth} new this month`} />
          <StatCard title="Present Today" value={stats.presentToday} icon={UserCheck} color="bg-green-500" />
          <StatCard title="On Leave Today" value={stats.onLeaveToday} icon={Calendar} color="bg-orange-500" />
          <StatCard title="Pending Leaves" value={stats.pendingLeaves} icon={Clock} color="bg-purple-500" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trend */}
        {stats?.attendanceTrend && (
          <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" /> Attendance Trend (7 days)
              </h2>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.attendanceTrend}>
                <defs>
                  <linearGradient id="attendanceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#attendanceGrad)" strokeWidth={2} name="Present" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Upcoming Birthdays */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Cake className="w-4 h-4 text-pink-500" /> Upcoming Birthdays
          </h2>
          {stats?.upcomingBirthdays && stats.upcomingBirthdays.length > 0 ? (
            <div className="space-y-3">
              {stats.upcomingBirthdays.map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 text-xs font-bold">
                    {b.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(b.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No upcoming birthdays this week</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-5">
        <h2 className="font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Check In', href: '/attendance', color: 'bg-green-50 text-green-700 hover:bg-green-100' },
            { label: 'Apply Leave', href: '/leave', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
            { label: 'View Payslip', href: '/payroll', color: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
            { label: 'Raise Ticket', href: '/helpdesk', color: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
          ].map((a) => (
            <a
              key={a.label}
              href={a.href}
              className={`p-3 rounded-lg text-sm font-medium text-center transition-colors ${a.color}`}
            >
              {a.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
