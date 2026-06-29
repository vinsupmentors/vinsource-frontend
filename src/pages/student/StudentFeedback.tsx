import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Enrollment {
  scheduleId: string;
  schedule: { course: { id: string; name: string } };
}

interface Feedback {
  id: string;
  scheduleId: string;
  courseId: string;
  trainerRating?: number;
  contentRating?: number;
  comments?: string;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star className={cn('w-5 h-5', n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
        </button>
      ))}
    </div>
  );
}

export default function StudentFeedback() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [feedbackByCourse, setFeedbackByCourse] = useState<Record<string, Feedback>>({});
  const [drafts, setDrafts] = useState<Record<string, { trainerRating: number; contentRating: number; comments: string }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      api.get('/api/student-portal/enrollments'),
      api.get('/api/student-portal/feedback'),
    ]).then(([enrRes, fbRes]) => {
      const enr = enrRes.data.data || [];
      const fb = fbRes.data.data || [];
      setEnrollments(enr);
      const map: Record<string, Feedback> = {};
      const draftMap: Record<string, { trainerRating: number; contentRating: number; comments: string }> = {};
      fb.forEach((f: Feedback) => { map[f.scheduleId] = f; });
      enr.forEach((e: Enrollment) => {
        const existing = map[e.scheduleId];
        draftMap[e.scheduleId] = {
          trainerRating: existing?.trainerRating || 0,
          contentRating: existing?.contentRating || 0,
          comments: existing?.comments || '',
        };
      });
      setFeedbackByCourse(map);
      setDrafts(draftMap);
    }).finally(() => setLoading(false));
  }, []);

  const updateDraft = (scheduleId: string, field: 'trainerRating' | 'contentRating' | 'comments', value: number | string) => {
    setDrafts((d) => ({ ...d, [scheduleId]: { ...d[scheduleId], [field]: value } }));
  };

  const submit = async (e: Enrollment) => {
    setSavingId(e.scheduleId);
    try {
      const draft = drafts[e.scheduleId];
      const res = await api.post('/api/student-portal/feedback', {
        scheduleId: e.scheduleId,
        courseId: e.schedule.course.id,
        trainerRating: draft.trainerRating || undefined,
        contentRating: draft.contentRating || undefined,
        comments: draft.comments || undefined,
      });
      setFeedbackByCourse((m) => ({ ...m, [e.scheduleId]: res.data.data }));
      toast({ title: 'Feedback saved', description: 'Thanks for sharing your feedback.' });
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      toast({ title: 'Failed to save feedback', description: e2.response?.data?.message || 'Please try again.', variant: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Course Feedback</h1>
        <p className="text-sm text-muted-foreground mt-1">Tell us how the trainer and course content are going. You can update this anytime.</p>
      </div>

      {enrollments.length === 0 && (
        <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground text-sm">
          No enrollments to give feedback on yet.
        </div>
      )}

      <div className="space-y-4">
        {enrollments.map((e) => {
          const draft = drafts[e.scheduleId] || { trainerRating: 0, contentRating: 0, comments: '' };
          const already = !!feedbackByCourse[e.scheduleId];
          return (
            <div key={e.scheduleId} className="bg-card rounded-xl border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">{e.schedule.course.name}</h2>
                {already && <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">Submitted</span>}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Trainer rating</label>
                  <div className="mt-1"><StarPicker value={draft.trainerRating} onChange={(v) => updateDraft(e.scheduleId, 'trainerRating', v)} /></div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Course content rating</label>
                  <div className="mt-1"><StarPicker value={draft.contentRating} onChange={(v) => updateDraft(e.scheduleId, 'contentRating', v)} /></div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Comments (optional)</label>
                <textarea
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  rows={3}
                  value={draft.comments}
                  onChange={(ev) => updateDraft(e.scheduleId, 'comments', ev.target.value)}
                  placeholder="Anything you'd like us to know..."
                />
              </div>
              <button
                onClick={() => submit(e)}
                disabled={savingId === e.scheduleId}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingId === e.scheduleId ? 'Saving...' : already ? 'Update feedback' : 'Submit feedback'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
