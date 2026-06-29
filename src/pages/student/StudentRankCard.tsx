import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Loader2, Trophy, Briefcase, MessageSquareText, Star, Lock } from 'lucide-react';

interface ProjectRow {
  id: string;
  projectTitle: string;
  moduleTitle: string;
  status: 'SUBMITTED' | 'REVIEWED';
  submittedAt: string;
  graded: boolean;
  grade: number | null;
  maxGrade: number | null;
  reviewNote: string | null;
}

interface ModuleFeedbackRow {
  id: string;
  moduleTitle: string;
  rating: number | null;
  comments: string;
  trainerName: string | null;
  updatedAt: string;
}

interface RankRow {
  scheduleId: string;
  courseId: string;
  courseName: string;
  rank: number | null;
  totalStudents: number;
  marksObtained: number;
  marksMax: number;
  percentage: number;
  classAverage: number;
  projects: ProjectRow[];
  moduleFeedback: ModuleFeedbackRow[];
}

export default function StudentRankCard() {
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/student-portal/rank-card').then((r) => setRows(r.data.data || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Rank Card</h1>

      {rows.length === 0 && (
        <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground text-sm">
          No rank data yet — you're not enrolled in a batch schedule.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {rows.map((r) => (
          <div key={r.scheduleId} className="bg-card rounded-xl border p-5 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">{r.courseName}</h2>
                <Trophy className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-end gap-2 mb-1">
                <span className="text-3xl font-bold text-blue-600">{r.rank ?? '—'}</span>
                <span className="text-sm text-muted-foreground pb-1">of {r.totalStudents} students</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Your score</div>
                  <div className="font-medium">{r.marksObtained} / {r.marksMax} ({r.percentage}%)</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Class average</div>
                  <div className="font-medium">{r.classAverage}%</div>
                </div>
              </div>
            </div>

            {/* Project submissions + trainer grade */}
            {r.projects.length > 0 && (
              <div className="border-t pt-3">
                <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                  <Briefcase className="w-3.5 h-3.5" /> Projects
                </h3>
                <div className="space-y-2">
                  {r.projects.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <div>
                        <p className="font-medium">{p.projectTitle}</p>
                        <p className="text-xs text-muted-foreground">{p.moduleTitle} &middot; submitted {formatDate(p.submittedAt)}</p>
                      </div>
                      {p.graded ? (
                        <span className="text-sm font-semibold text-green-600 shrink-0">{p.grade} / {p.maxGrade}</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium flex items-center gap-1 shrink-0">
                          <Lock className="w-3 h-3" /> Not graded yet
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trainer's module-wise feedback */}
            {r.moduleFeedback.length > 0 && (
              <div className="border-t pt-3">
                <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
                  <MessageSquareText className="w-3.5 h-3.5" /> Module Feedback
                </h3>
                <div className="space-y-3">
                  {r.moduleFeedback.map((f) => (
                    <div key={f.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{f.moduleTitle}</p>
                        {f.rating !== null && (
                          <span className="flex items-center gap-0.5 text-amber-500 shrink-0">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className="w-3 h-3" fill={i < f.rating! ? 'currentColor' : 'none'} />
                            ))}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{f.comments}</p>
                      {f.trainerName && <p className="text-[11px] text-muted-foreground mt-1">&mdash; {f.trainerName}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
