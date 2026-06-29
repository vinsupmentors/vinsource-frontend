import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { Loader2, Star, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeedbackQuestion {
  id: string;
  order: number;
  type: 'RATING' | 'TEXT' | 'MCQ';
  prompt: string;
  options?: string[] | null;
  required: boolean;
}

interface FeedbackFormRelease {
  releaseId: string;
  status: 'ACTIVE' | 'CLOSED';
  releasedAt: string;
  form: {
    id: string;
    title: string;
    module: { id: string; title: string; order: number };
    questions: FeedbackQuestion[];
  };
  alreadyResponded: boolean;
}

type AnswerDraft = { ratingValue?: number; textValue?: string; optionValue?: string };

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

export default function StudentFeedbackForms() {
  const [releases, setReleases] = useState<FeedbackFormRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Record<string, AnswerDraft>>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    api.get('/api/student-portal/feedback-forms').then((r) => setReleases(r.data.data || [])).finally(() => setLoading(false));
  }, []);

  const updateAnswer = (releaseId: string, questionId: string, field: keyof AnswerDraft, value: number | string) => {
    setDrafts((d) => ({
      ...d,
      [releaseId]: { ...d[releaseId], [questionId]: { ...d[releaseId]?.[questionId], [field]: value } },
    }));
  };

  const submit = async (release: FeedbackFormRelease) => {
    const answersMap = drafts[release.releaseId] || {};
    for (const q of release.form.questions) {
      if (q.required && !answersMap[q.id]) {
        toast({ title: 'Missing answer', description: `Please answer: "${q.prompt}"`, variant: 'error' });
        return;
      }
    }
    const answers = Object.entries(answersMap).map(([questionId, a]) => ({ questionId, ...a }));
    setSubmittingId(release.releaseId);
    try {
      await api.post(`/api/student-portal/feedback-forms/${release.releaseId}/submit`, { answers });
      toast({ title: 'Feedback submitted', description: 'Thanks for your response.' });
      setReleases((rs) => rs.map((r) => (r.releaseId === release.releaseId ? { ...r, alreadyResponded: true } : r)));
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      toast({ title: 'Submission failed', description: e2.response?.data?.message || 'Please try again.', variant: 'error' });
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Feedback Forms</h1>
        <p className="text-sm text-muted-foreground mt-1">Module feedback forms released by your trainer.</p>
      </div>

      {releases.length === 0 ? (
        <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground text-sm">No feedback forms have been released to you yet.</div>
      ) : (
        <div className="space-y-4">
          {releases.map((r) => {
            const closed = r.status === 'CLOSED';
            const answersMap = drafts[r.releaseId] || {};
            return (
              <div key={r.releaseId} className="bg-card rounded-xl border p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Module: {r.form.module.title}</p>
                    <h2 className="font-semibold text-sm mt-0.5">{r.form.title}</h2>
                  </div>
                  {r.alreadyResponded ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium flex items-center gap-1 whitespace-nowrap"><CheckCircle2 className="w-3.5 h-3.5" /> Submitted</span>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${closed ? 'bg-muted text-muted-foreground' : 'bg-amber-50 text-amber-700'}`}>{closed ? 'Closed' : 'Pending'}</span>
                  )}
                </div>

                {r.alreadyResponded ? (
                  <p className="text-xs text-muted-foreground">You've already submitted this feedback form. Thank you!</p>
                ) : closed ? (
                  <p className="text-xs text-muted-foreground">This form is no longer accepting responses.</p>
                ) : (
                  <div className="space-y-4">
                    {r.form.questions.sort((a, b) => a.order - b.order).map((q) => {
                      const a = answersMap[q.id] || {};
                      return (
                        <div key={q.id}>
                          <label className="text-sm font-medium">{q.prompt} {q.required && <span className="text-red-500">*</span>}</label>
                          {q.type === 'RATING' && (
                            <div className="mt-1.5"><StarPicker value={a.ratingValue || 0} onChange={(v) => updateAnswer(r.releaseId, q.id, 'ratingValue', v)} /></div>
                          )}
                          {q.type === 'TEXT' && (
                            <textarea
                              rows={2}
                              value={a.textValue || ''}
                              onChange={(e) => updateAnswer(r.releaseId, q.id, 'textValue', e.target.value)}
                              className="mt-1.5 w-full px-3 py-2 rounded-lg border bg-background text-sm"
                            />
                          )}
                          {q.type === 'MCQ' && (
                            <div className="mt-1.5 flex flex-col gap-1.5">
                              {(q.options || []).map((opt) => (
                                <label key={opt} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name={`${r.releaseId}-${q.id}`}
                                    checked={a.optionValue === opt}
                                    onChange={() => updateAnswer(r.releaseId, q.id, 'optionValue', opt)}
                                  />
                                  {opt}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      onClick={() => submit(r)}
                      disabled={submittingId === r.releaseId}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {submittingId === r.releaseId ? 'Submitting...' : 'Submit feedback'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
