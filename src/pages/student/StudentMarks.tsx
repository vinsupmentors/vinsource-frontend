import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface MarkRow {
  id: string;
  marksObtained: number;
  remarks?: string;
  test: {
    title: string;
    testDate: string;
    maxMarks: number;
    module: { title: string };
    schedule: { course: { name: string } };
  };
}

export default function StudentMarks() {
  const [rows, setRows] = useState<MarkRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/student-portal/marks').then((r) => setRows(r.data.data || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">My Marks</h1>

      <div className="bg-card rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Course</th>
              <th className="text-left px-4 py-3 font-medium">Module</th>
              <th className="text-left px-4 py-3 font-medium">Test</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Marks</th>
              <th className="text-left px-4 py-3 font-medium">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No test results yet.</td></tr>
            )}
            {rows.map((r) => {
              const pct = Math.round((r.marksObtained / r.test.maxMarks) * 100);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.test.schedule.course.name}</td>
                  <td className="px-4 py-3">{r.test.module.title}</td>
                  <td className="px-4 py-3">{r.test.title}</td>
                  <td className="px-4 py-3">{formatDate(r.test.testDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${pct >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                      {r.marksObtained} / {r.test.maxMarks}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.remarks || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
