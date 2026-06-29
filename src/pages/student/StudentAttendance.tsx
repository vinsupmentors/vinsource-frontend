import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface AttendanceRow {
  id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
  schedule: { course: { name: string } };
}

interface Meta {
  total: number;
  present: number;
  late: number;
  absent: number;
  percentage: number;
}

export default function StudentAttendance() {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/student-portal/attendance')
      .then((r) => { setRows(r.data.data || []); setMeta(r.data.meta || null); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">My Attendance</h1>

      {meta && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetaCard label="Overall" value={`${meta.percentage}%`} />
          <MetaCard label="Present" value={String(meta.present)} color="text-green-600" />
          <MetaCard label="Late" value={String(meta.late)} color="text-amber-600" />
          <MetaCard label="Absent" value={String(meta.absent)} color="text-red-600" />
        </div>
      )}

      <div className="bg-card rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Course</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No attendance records yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{formatDate(r.date)}</td>
                <td className="px-4 py-3">{r.schedule.course.name}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetaCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <p className={`text-lg font-bold ${color || ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: AttendanceRow['status'] }) {
  const map = {
    PRESENT: { icon: CheckCircle2, cls: 'bg-green-50 text-green-700' },
    LATE: { icon: Clock, cls: 'bg-amber-50 text-amber-700' },
    ABSENT: { icon: XCircle, cls: 'bg-red-50 text-red-700' },
  } as const;
  const { icon: Icon, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${cls}`}>
      <Icon className="w-3 h-3" /> {status}
    </span>
  );
}
