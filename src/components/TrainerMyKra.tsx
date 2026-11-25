import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Loader2, Save, Pencil, Trash2, Plus, CheckCircle2 } from 'lucide-react';

const errMsg = (e: unknown): string => (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong';

interface BatchKra { id: string; summary: string; achievements: string | null; notes: string | null }
interface CompletedBatch {
  schedule: {
    id: string; code: string | null; timing: string; classesCompletedAt: string | null; projectPresentationDate: string | null;
    course: { name: string }; batch: { code: string }; _count: { enrollments: number };
  };
  kra: BatchKra | null;
}
interface OtherWork { id: string; date: string; category: string; description: string; notes: string | null }

const CATEGORIES = ['Interview preparation', 'Content / material creation', 'Student mentoring', 'Doubt clearing', 'Evaluation / project review', 'Meetings / training', 'Demo / counselling support', 'Admin / reports', 'Other'];
const today = () => new Date().toISOString().slice(0, 10);

export default function TrainerMyKra() {
  const [section, setSection] = useState<'batch' | 'other'>('batch');
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border p-0.5 bg-muted/40 text-sm">
        {([['batch', 'Completed batches'], ['other', 'Other work']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSection(k)} className={`px-3 py-1.5 rounded-md font-medium ${section === k ? 'bg-background shadow-sm text-blue-600' : 'text-muted-foreground'}`}>{l}</button>
        ))}
      </div>
      {section === 'batch' ? <CompletedBatches /> : <OtherWorkSection />}
    </div>
  );
}

function CompletedBatches() {
  const [rows, setRows] = useState<CompletedBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [achievements, setAchievements] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/api/trainer-portal/batch-kra').then((r) => setRows(r.data.data || [])).catch((e) => setError(errMsg(e))).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const open = (r: CompletedBatch) => {
    setOpenId(r.schedule.id);
    setSummary(r.kra?.summary || '');
    setAchievements(r.kra?.achievements || '');
    setNotes(r.kra?.notes || '');
    setError('');
  };

  const save = async (scheduleId: string) => {
    setSaving(true); setError('');
    try {
      await api.put(`/api/trainer-portal/schedules/${scheduleId}/batch-kra`, { summary, achievements, notes });
      setOpenId(null);
      load();
    } catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
        A sub-batch you train appears here once you mark its classes completed. Enter your KRA for it — what you delivered, results and anything to flag.
      </p>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      {rows.length === 0 && <div className="bg-card rounded-xl border p-8 text-center text-sm text-muted-foreground">No completed batches yet. Mark a batch's classes completed in My Batches and it will show up here.</div>}
      {rows.map((r) => {
        const s = r.schedule;
        const isOpen = openId === s.id;
        return (
          <div key={s.id} className="bg-card rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{s.code ?? s.batch.code} — {s.course.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.timing} · {s._count.enrollments} students · Completed {s.classesCompletedAt ? formatDate(s.classesCompletedAt) : '—'}</p>
              </div>
              {!isOpen && (
                <button onClick={() => open(r)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted shrink-0">
                  {r.kra ? <><Pencil className="w-3.5 h-3.5" /> Edit KRA</> : <><Plus className="w-3.5 h-3.5" /> Enter KRA</>}
                </button>
              )}
            </div>

            {!isOpen && r.kra && (
              <div className="mt-3 text-sm space-y-1.5">
                <p className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> KRA submitted</p>
                <p className="whitespace-pre-wrap">{r.kra.summary}</p>
                {r.kra.achievements && <p className="text-xs text-muted-foreground whitespace-pre-wrap"><span className="font-medium text-foreground">Achievements: </span>{r.kra.achievements}</p>}
                {r.kra.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap"><span className="font-medium text-foreground">Notes: </span>{r.kra.notes}</p>}
              </div>
            )}

            {isOpen && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">KRA summary *</label>
                  <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Syllabus covered, class performance, projects completed…" className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Achievements / results (optional)</label>
                  <textarea rows={2} value={achievements} onChange={(e) => setAchievements(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Notes (optional)</label>
                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => save(s.id)} disabled={saving || !summary.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save KRA
                  </button>
                  <button onClick={() => setOpenId(null)} className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted">Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OtherWorkSection() {
  const [rows, setRows] = useState<OtherWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/api/trainer-portal/other-work').then((r) => setRows(r.data.data || [])).catch((e) => setError(errMsg(e))).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const reset = () => { setEditingId(null); setDate(today()); setCategory(CATEGORIES[0]); setDescription(''); setNotes(''); };

  const submit = async () => {
    if (!date || !category || !description.trim()) return;
    setSaving(true); setError('');
    try {
      const body = { date, category, description: description.trim(), notes: notes.trim() };
      if (editingId) await api.put(`/api/trainer-portal/other-work/${editingId}`, body);
      else await api.post('/api/trainer-portal/other-work', body);
      reset(); load();
    } catch (e) { setError(errMsg(e)); } finally { setSaving(false); }
  };

  const edit = (w: OtherWork) => {
    setEditingId(w.id); setDate(w.date.slice(0, 10)); setCategory(w.category); setDescription(w.description); setNotes(w.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this entry?')) return;
    try { await api.delete(`/api/trainer-portal/other-work/${id}`); load(); } catch (e) { setError(errMsg(e)); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">Log work you did other than taking classes — interview prep, material creation, mentoring, meetings and so on.</p>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-card rounded-xl border p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-2 py-1.5 rounded-md border bg-background text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-2 py-1.5 rounded-md border bg-background text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              {!CATEGORIES.includes(category) && <option value={category}>{category}</option>}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">What did you do? *</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Notes (optional)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />
        </div>
        <div className="flex gap-2">
          <button onClick={submit} disabled={saving || !description.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {editingId ? 'Update entry' : 'Add entry'}
          </button>
          {editingId && <button onClick={reset} className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted">Cancel</button>}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-xl border p-8 text-center text-sm text-muted-foreground">No other work logged yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((w) => (
            <div key={w.id} className="bg-card rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="font-medium text-foreground">{formatDate(w.date)}</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted font-medium">{w.category}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => edit(w)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(w.id)} className="p-1.5 rounded-md hover:bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <p className="text-sm mt-2 whitespace-pre-wrap">{w.description}</p>
              {w.notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{w.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
