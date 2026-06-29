import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Loader2, CalendarCheck, ClipboardList, Award, Briefcase, BookOpen } from 'lucide-react';

interface Enrollment {
  id: string;
  schedule: {
    course: { id: string; name: string };
    batch: { code: string; status: string };
    trainers: { trainer: { firstName: string; lastName: string } }[];
  };
}

export default function StudentDashboard() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [certCount, setCertCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/student-portal/enrollments'),
      api.get('/api/student-portal/attendance'),
      api.get('/api/student-portal/certificates'),
    ])
      .then(([e, a, c]) => {
        setEnrollments(e.data.data || []);
        setAttendancePct(a.data.meta?.percentage ?? null);
        setCertCount((c.data.data || []).length);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Welcome back, {user?.student?.firstName}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {user?.student?.studentCode} &middot; {user?.student?.track} track &middot; Status: {user?.student?.status}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={CalendarCheck} label="Attendance" value={attendancePct !== null ? `${attendancePct}%` : '—'} to="/student/attendance" />
        <StatCard icon={ClipboardList} label="Enrollments" value={String(enrollments.length)} to="/student/test" />
        <StatCard icon={Award} label="Certificates" value={String(certCount)} to="/student/certificates" />
        <StatCard icon={Briefcase} label="Placements" value="View" to="/student/placements" />
      </div>

      <div className="bg-card rounded-xl border p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4"><BookOpen className="w-4 h-4 text-blue-600" /> My Courses</h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">You're not enrolled in any course yet.</p>
        ) : (
          <div className="space-y-3">
            {enrollments.map((en) => (
              <div key={en.id} className="flex items-center justify-between border rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{en.schedule.course.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Batch {en.schedule.batch.code}
                    {en.schedule.trainers.length > 0 && ` · Trainer: ${en.schedule.trainers.map((t) => `${t.trainer.firstName} ${t.trainer.lastName}`).join(', ')}`}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">{en.schedule.batch.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {user?.student?.joiningDate && (
        <p className="text-xs text-muted-foreground">Joined on {formatDate(user.student.joiningDate)}</p>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, to }: { icon: typeof CalendarCheck; label: string; value: string; to: string }) {
  return (
    <Link to={to} className="bg-card rounded-xl border p-4 hover:shadow-md transition-shadow">
      <Icon className="w-5 h-5 text-blue-600 mb-2" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}
