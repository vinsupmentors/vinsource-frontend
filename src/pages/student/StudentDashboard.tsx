import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Loader2, CalendarCheck, Award, Briefcase, BookOpen, Trophy, FileText,
  ListChecks, ClipboardList, ArrowRight, Sparkles, AlertCircle,
} from 'lucide-react';

interface Enrollment {
  id: string;
  schedule: {
    code?: string | null;
    timing?: string;
    course: { id: string; name: string };
    batch: { code: string; status: string };
    trainers: { trainer: { firstName: string; lastName: string } }[];
  };
}

interface CourseBlock {
  courseId: string;
  courseName: string;
  modules: { covered: boolean }[];
}

const TRACK_LABEL: Record<string, string> = {
  JRP: 'Job Ready Program', IOP: 'Industry Oriented Program', PAP: 'Placement Assurance Program',
};

export default function StudentDashboard() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [certCount, setCertCount] = useState(0);
  const [courseProgress, setCourseProgress] = useState<Record<string, { covered: number; total: number }>>({});
  const [pendingProjects, setPendingProjects] = useState(0);
  const [pendingFeedback, setPendingFeedback] = useState(0);
  const [rank, setRank] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get('/api/student-portal/enrollments'),
      api.get('/api/student-portal/attendance'),
      api.get('/api/student-portal/certificates'),
      api.get('/api/student-portal/course-content'),
      api.get('/api/student-portal/projects'),
      api.get('/api/student-portal/feedback-forms'),
      api.get('/api/student-portal/rank-card'),
    ])
      .then(([e, a, c, cc, pr, fb, rk]) => {
        if (e.status === 'fulfilled') setEnrollments(e.value.data.data || []);
        if (a.status === 'fulfilled') setAttendancePct(a.value.data.meta?.percentage ?? null);
        if (c.status === 'fulfilled') setCertCount((c.value.data.data || []).length);
        if (cc.status === 'fulfilled') {
          const map: Record<string, { covered: number; total: number }> = {};
          (cc.value.data.data || []).forEach((b: CourseBlock) => {
            map[b.courseId] = { covered: b.modules.filter((m) => m.covered).length, total: b.modules.length };
          });
          setCourseProgress(map);
        }
        if (pr.status === 'fulfilled') {
          const rows = pr.value.data.data || [];
          setPendingProjects(rows.filter((p: any) => !p.submission && !p.mySubmission && p.status !== 'SUBMITTED').length || rows.filter((p: any) => !p.submittedAt).length);
        }
        if (fb.status === 'fulfilled') {
          const rows = fb.value.data.data || [];
          setPendingFeedback(rows.filter((f: any) => !f.responded && !f.myResponse && !f.submittedAt).length);
        }
        if (rk.status === 'fulfilled') {
          const rows = rk.value.data.data || [];
          const first = Array.isArray(rows) ? rows[0] : rows;
          if (first?.rank) setRank(`#${first.rank}`);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const totalPending = pendingProjects + pendingFeedback;
  const firstName = user?.student?.firstName || 'Student';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900 via-blue-800 to-cyan-700 text-white p-6 sm:p-8">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{greeting}, {firstName} 👋</h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
              <span className="bg-white/15 border border-white/20 rounded-full px-2.5 py-1 font-medium">{user?.student?.studentCode}</span>
              <span className="bg-white/15 border border-white/20 rounded-full px-2.5 py-1 font-medium">{TRACK_LABEL[user?.student?.track || ''] || user?.student?.track}</span>
              <span className="bg-emerald-400/20 border border-emerald-300/30 rounded-full px-2.5 py-1 font-medium text-emerald-100">{user?.student?.status}</span>
            </div>
          </div>
          {totalPending > 0 ? (
            <Link to={pendingProjects > 0 ? '/student/projects' : '/student/feedback-forms'}
              className="flex items-center gap-2 bg-amber-400/20 border border-amber-300/40 rounded-xl px-4 py-3 hover:bg-amber-400/30 transition-colors">
              <AlertCircle className="w-5 h-5 text-amber-300" />
              <div className="text-sm">
                <p className="font-semibold">{totalPending} pending task{totalPending > 1 ? 's' : ''}</p>
                <p className="text-xs text-blue-100">{pendingProjects} project(s) · {pendingFeedback} feedback</p>
              </div>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-4 py-3">
              <Sparkles className="w-5 h-5 text-cyan-300" />
              <p className="text-sm font-medium">All caught up — nothing pending!</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={CalendarCheck} tint="text-blue-600 bg-blue-50" label="Attendance" to="/student/attendance"
          value={attendancePct !== null ? `${attendancePct}%` : '—'}
          bar={attendancePct ?? undefined}
          barColor={attendancePct !== null && attendancePct < 75 ? 'bg-red-500' : 'bg-blue-600'}
          sub={attendancePct !== null && attendancePct < 75 ? 'Below 75% — catch up!' : undefined}
        />
        <StatCard icon={Trophy} tint="text-amber-600 bg-amber-50" label="Class Rank" value={rank ?? '—'} to="/student/rank-card" />
        <StatCard icon={FileText} tint="text-purple-600 bg-purple-50" label="Pending Projects" value={String(pendingProjects)} to="/student/projects" />
        <StatCard icon={Award} tint="text-emerald-600 bg-emerald-50" label="Certificates" value={String(certCount)} to="/student/certificates" />
      </div>

      {/* ── Courses with progress ── */}
      <div className="bg-card rounded-2xl border p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4"><BookOpen className="w-4 h-4 text-blue-600" /> My Courses</h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">You're not enrolled in any course yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {enrollments.map((en) => {
              const prog = courseProgress[en.schedule.course.id];
              const pct = prog && prog.total > 0 ? Math.round((prog.covered / prog.total) * 100) : 0;
              return (
                <Link key={en.id} to="/student/course-content"
                  className="border rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold group-hover:text-blue-700 transition-colors">{en.schedule.course.name}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium shrink-0">{en.schedule.batch.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {en.schedule.batch.code}{en.schedule.timing ? ` · ${en.schedule.timing}` : ''}
                    {en.schedule.trainers.length > 0 && ` · ${en.schedule.trainers.map((t) => `${t.trainer.firstName} ${t.trainer.lastName}`).join(', ')}`}
                  </p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span>{prog ? `${prog.covered} / ${prog.total} modules covered` : 'Syllabus pending'}</span>
                      <span className="font-semibold">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickAction icon={ClipboardList} label="Take a Test" to="/student/test" />
        <QuickAction icon={ListChecks} label="Give Feedback" to="/student/feedback-forms" badge={pendingFeedback || undefined} />
        <QuickAction icon={Briefcase} label="Placements" to="/student/placements" />
        <QuickAction icon={Sparkles} label="Build Portfolio" to="/student/portfolio" />
      </div>

      {user?.student?.joiningDate && (
        <p className="text-xs text-muted-foreground text-center">Joined Vinsup Skill Academy on {formatDate(user.student.joiningDate)}</p>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, tint, label, value, to, bar, barColor, sub }: {
  icon: typeof CalendarCheck; tint: string; label: string; value: string; to: string;
  bar?: number; barColor?: string; sub?: string;
}) {
  return (
    <Link to={to} className="bg-card rounded-2xl border p-4 hover:shadow-md hover:border-blue-200 transition-all">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${tint}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      {bar !== undefined && (
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-2">
          <div className={`h-full rounded-full ${barColor || 'bg-blue-600'}`} style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      )}
      {sub && <p className="text-[10px] text-red-500 font-medium mt-1">{sub}</p>}
    </Link>
  );
}

function QuickAction({ icon: Icon, label, to, badge }: { icon: typeof CalendarCheck; label: string; to: string; badge?: number }) {
  return (
    <Link to={to} className="relative flex items-center gap-2.5 bg-card border rounded-xl px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all text-sm font-medium">
      <Icon className="w-4 h-4 text-blue-600" /> {label}
      {badge ? (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{badge}</span>
      ) : null}
      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
    </Link>
  );
}
