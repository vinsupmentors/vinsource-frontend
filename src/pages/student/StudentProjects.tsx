import { useEffect, useState } from 'react';
import api, { BASE_URL } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { formatDate } from '@/lib/utils';
import { Loader2, FileText, Upload, Link as LinkIcon, CheckCircle2 } from 'lucide-react';

// Files uploaded by the backend (project briefs, student submissions) come back as
// relative paths like "/uploads/...". A bare <a href> resolves those against the
// frontend's own origin, not the API, which is why the PDF link 404s. Absolute
// URLs (e.g. a pasted link submission) are left untouched.
const fileUrl = (path: string) => (/^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`);

interface ProjectRelease {
  releaseId: string;
  status: 'ACTIVE' | 'CLOSED';
  releasedAt: string;
  project: {
    id: string;
    title: string;
    description: string | null;
    resourceUrl: string;
    module: { id: string; title: string; order: number };
  };
  mySubmission: {
    id: string;
    fileUrl: string | null;
    linkUrl: string | null;
    note: string | null;
    status: 'SUBMITTED' | 'REVIEWED';
    submittedAt: string;
    reviewNote: string | null;
  } | null;
}

export default function StudentProjects() {
  const [releases, setReleases] = useState<ProjectRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { linkUrl: string; note: string; file: File | null }>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    api.get('/api/student-portal/projects').then((r) => setReleases(r.data.data || [])).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const updateDraft = (releaseId: string, field: 'linkUrl' | 'note' | 'file', value: string | File | null) => {
    setDrafts((d) => ({ ...d, [releaseId]: { linkUrl: '', note: '', file: null, ...d[releaseId], [field]: value } }));
  };

  const submit = async (release: ProjectRelease) => {
    const draft = drafts[release.releaseId] || { linkUrl: '', note: '', file: null };
    if (!draft.file && !draft.linkUrl) {
      toast({ title: 'Add a file or a link', description: 'Submit either a file or a link to your work.', variant: 'error' });
      return;
    }
    setSubmittingId(release.releaseId);
    try {
      const fd = new FormData();
      if (draft.file) fd.append('file', draft.file);
      if (draft.linkUrl) fd.append('linkUrl', draft.linkUrl);
      if (draft.note) fd.append('note', draft.note);
      await api.post(`/api/student-portal/projects/${release.releaseId}/submit`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast({ title: 'Project submitted', description: 'Your trainer will review it shortly.' });
      load();
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
        <h1 className="text-xl font-bold">Projects</h1>
        <p className="text-sm text-muted-foreground mt-1">Module projects released by your trainer. Submit a file or a link to your work.</p>
      </div>

      {releases.length === 0 ? (
        <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground text-sm">No projects have been released to you yet.</div>
      ) : (
        <div className="space-y-4">
          {releases.map((r) => {
            const draft = drafts[r.releaseId] || { linkUrl: '', note: '', file: null };
            const closed = r.status === 'CLOSED';
            return (
              <div key={r.releaseId} className="bg-card rounded-xl border p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Module: {r.project.module.title}</p>
                    <h2 className="font-semibold text-sm mt-0.5">{r.project.title}</h2>
                    {r.project.description && <p className="text-sm text-muted-foreground mt-1">{r.project.description}</p>}
                    <a href={fileUrl(r.project.resourceUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline mt-2">
                      <FileText className="w-3.5 h-3.5" /> View project brief (PDF)
                    </a>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${closed ? 'bg-muted text-muted-foreground' : 'bg-green-50 text-green-700'}`}>
                    {closed ? 'Closed' : 'Open'}
                  </span>
                </div>

                {r.mySubmission ? (
                  <div className="border-t pt-3 space-y-1.5">
                    <p className="text-xs flex items-center gap-1.5 font-medium text-green-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Submitted {formatDate(r.mySubmission.submittedAt)}
                      {r.mySubmission.status === 'REVIEWED' && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">Reviewed</span>}
                    </p>
                    {r.mySubmission.fileUrl && <a href={fileUrl(r.mySubmission.fileUrl)} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline block">View your submitted file</a>}
                    {r.mySubmission.linkUrl && <a href={r.mySubmission.linkUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline block">{r.mySubmission.linkUrl}</a>}
                    {r.mySubmission.note && <p className="text-xs text-muted-foreground">Note: {r.mySubmission.note}</p>}
                    {r.mySubmission.reviewNote && (
                      <p className="text-xs bg-blue-50 text-blue-700 rounded-lg px-2.5 py-1.5 mt-1">Trainer review: {r.mySubmission.reviewNote}</p>
                    )}
                    {!closed && (
                      <p className="text-xs text-muted-foreground pt-1">You can resubmit below to replace your current submission.</p>
                    )}
                  </div>
                ) : null}

                {!closed && (
                  <div className="border-t pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Upload a file</label>
                      <input
                        type="file"
                        onChange={(e) => updateDraft(r.releaseId, 'file', e.target.files?.[0] || null)}
                        className="mt-1 w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><LinkIcon className="w-3.5 h-3.5" /> Or paste a link</label>
                      <input
                        value={draft.linkUrl}
                        onChange={(e) => updateDraft(r.releaseId, 'linkUrl', e.target.value)}
                        placeholder="https://..."
                        className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
                      <textarea
                        rows={2}
                        value={draft.note}
                        onChange={(e) => updateDraft(r.releaseId, 'note', e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        onClick={() => submit(r)}
                        disabled={submittingId === r.releaseId}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {submittingId === r.releaseId ? 'Submitting...' : r.mySubmission ? 'Resubmit' : 'Submit project'}
                      </button>
                    </div>
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
