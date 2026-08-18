import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { BASE_URL } from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import {
  UserPlus, FileText, BarChart2, X, Loader2, Upload, CheckCircle2, XCircle,
  Users, GraduationCap, MapPin, ShieldCheck, Search, Receipt,
} from 'lucide-react';

function errMsg(err: unknown, fallback: string) {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || fallback;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Shared small UI primitives (kept local — this page intentionally doesn't
// couple to Production.tsx's internals, even though the Add Student form
// mirrors it exactly) ────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6 space-y-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSubmit, saving, label }: { onClose: () => void; onSubmit: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
      <button onClick={onSubmit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : label}</button>
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────
type BatchTiming = 'MORNING' | 'AFTERNOON' | 'EVENING';
type BatchCourseSchedule = { id: string; code?: string | null; course: { id: string; name: string }; timing: BatchTiming };
type Batch = { id: string; code: string; schedules: BatchCourseSchedule[] };

interface DocumentTemplate {
  id: string;
  title: string;
  fileUrl: string;
  isActive: boolean;
  order: number;
  applicableTracks: string[] | null;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string } | null;
  _count: { signatures: number };
}

const TRACKS = ['JRP', 'IOP', 'PAP', 'PT'] as const;

interface BatchSummary {
  id: string;
  code: string;
  status: string;
  startDate: string;
  endDate: string | null;
  totalStudents: number;
  profileCompleted: number;
  documentsCompleted: number;
}

interface BatchStudent {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone: string;
  photo?: string | null;
  courses: string[];
  profileCompletedAt: string | null;
  documentsCompletedAt: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  education: { degree: string; institution: string; fieldOfStudy?: string; year?: string; grade?: string }[] | null;
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  documents: { templateId: string; title: string; signed: boolean; signedAt: string | null; location: string | null; signedPdfUrl: string | null }[];
}

type Tab = 'add' | 'documents' | 'approval' | 'reports';
const VALID_TABS: Tab[] = ['add', 'documents', 'approval', 'reports'];
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'add', label: 'Add Student', icon: UserPlus },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'approval', label: 'Approval', icon: ShieldCheck },
  { id: 'reports', label: 'Reports', icon: BarChart2 },
];

export default function StudentOnboardingPage() {
  const { hasModule } = useModuleAccess();
  const canEdit = hasModule('STUDENT_ONBOARDING', 'EDIT');

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab>(tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'add');
  const setTab = (t: Tab) => { setTabState(t); setSearchParams({ tab: t }, { replace: true }); };
  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== tab) setTabState(tabFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  const [error, setError] = useState('');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Student Onboarding</h1>
        <p className="text-muted-foreground text-sm">Add new students, manage onboarding documents, and track batch-wise onboarding progress</p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center justify-between">{error}<button onClick={() => setError('')}><X className="w-4 h-4" /></button></div>}

      {tab === 'add' && <AddStudentTab canEdit={canEdit} setError={setError} />}
      {tab === 'documents' && <DocumentsTab canEdit={canEdit} setError={setError} />}
      {tab === 'approval' && <ApprovalTab canEdit={canEdit} setError={setError} />}
      {tab === 'reports' && <ReportsTab setError={setError} />}
    </div>
  );
}

// ── Add Student tab ──────────────────────────────────────────────────────────
interface RecentStudent {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  track: string;
  createdAt: string;
  enrollments?: { schedule: { course: { name: string }; batch: { code: string } } }[];
}

function AddStudentTab({ canEdit, setError }: { canEdit: boolean; setError: (s: string) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [recent, setRecent] = useState<RecentStudent[] | null>(null);

  const loadRecent = useCallback(() => {
    api.get('/api/production/students', { params: { pageSize: 10, page: 1 } })
      .then((res) => setRecent(res.data.data))
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  return (
    <div className="space-y-6">
      <div className="border rounded-xl p-8 text-center space-y-3">
        <UserPlus className="w-10 h-10 text-blue-600 mx-auto" />
        <h3 className="font-semibold">Create a new student</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          This uses the exact same student intake as Production — the student is emailed a temporary
          password, resets it, fills in their profile, and then reads &amp; signs any onboarding
          documents you've set up under the Documents tab before they can enter the classroom.
        </p>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white inline-flex items-center gap-1.5">
            <UserPlus className="w-4 h-4" /> New Student
          </button>
        )}
        {showAdd && (
          <AddStudentModal onClose={() => setShowAdd(false)} setError={setError} onSaved={() => { setShowAdd(false); loadRecent(); }} />
        )}
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3">Recently added students</h3>
        {recent === null ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No students added yet.</p>
        ) : (
          <div className="border rounded-xl divide-y">
            {recent.map((s) => {
              const enr = s.enrollments?.[0];
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.studentCode} · {s.phone}{s.email ? ` · ${s.email}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium">
                      {enr ? `${enr.schedule.batch.code} — ${enr.schedule.course.name}` : <span className="text-muted-foreground">No batch</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{s.track} · added {formatDate(s.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'];

function AddStudentModal({ onClose, setError, onSaved }: { onClose: () => void; setError: (s: string) => void; onSaved: () => void }) {
  const [studentCode, setStudentCode] = useState('');
  const [email, setEmail] = useState('');
  const [track, setTrack] = useState('JRP');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [subBatchCode, setSubBatchCode] = useState('');
  const [saving, setSaving] = useState(false);

  // Fee/enrollment intake — filled onto the onboarding agreement PDF at
  // signing time alongside the student's name/ID/contact details.
  const [trainingMode, setTrainingMode] = useState<'Offline' | 'Online'>('Offline');
  const [totalProgramFee, setTotalProgramFee] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const balanceAmount = (() => {
    const total = parseFloat(totalProgramFee);
    const paid = parseFloat(amountPaid);
    if (Number.isNaN(total) || Number.isNaN(paid)) return null;
    return total - paid;
  })();

  useEffect(() => { api.get('/api/production/batches').then((res) => setBatches(res.data.data)).catch(() => setBatches([])); }, []);

  const selectedBatch = batches.find((b) => b.id === batchId);

  const applySubBatchCode = (raw: string) => {
    const code = raw.toUpperCase();
    setSubBatchCode(code);
    for (const b of batches) {
      const match = b.schedules.find((s) => (s.code || '').toUpperCase() === code.trim());
      if (match) { setBatchId(b.id); setScheduleId(match.id); return; }
    }
    setScheduleId('');
  };

  const codeValid = !subBatchCode.trim() || Boolean(scheduleId);

  const submit = async () => {
    if (!studentCode || !email || !scheduleId) { setError('Student ID, email, and a sub-batch (code or selection) are required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/production/students', {
        studentCode, email, track, scheduleId,
        trainingMode,
        totalProgramFee: totalProgramFee || undefined,
        amountPaid: amountPaid || undefined,
        paymentMode: paymentMode || undefined,
      });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to add student')); } finally { setSaving(false); }
  };

  return (
    <Modal title="New Student" onClose={onClose}>
      <div className="space-y-3 text-left">
        <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Student ID *" value={studentCode} onChange={(e) => setStudentCode(e.target.value)} />
        <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Email *" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="w-full px-3 py-2 border rounded-lg text-sm" value={track} onChange={(e) => setTrack(e.target.value)}>
          <option value="JRP">JRP — Job Ready Program</option>
          <option value="IOP">IOP — Industry Oriented Program</option>
          <option value="PAP">PAP — Placement Assurance Program</option>
        </select>

        <div>
          <input
            className={`w-full px-3 py-2 border rounded-lg text-sm font-mono ${subBatchCode && !codeValid ? 'border-red-400' : subBatchCode && scheduleId ? 'border-green-400' : ''}`}
            placeholder="Sub-Batch Code (e.g. B14-DA-EVE)"
            value={subBatchCode}
            onChange={(e) => applySubBatchCode(e.target.value)}
          />
          {subBatchCode && scheduleId && selectedBatch && (
            <p className="text-[11px] text-green-600 mt-1">
              ✓ {selectedBatch.code} — {selectedBatch.schedules.find((s) => s.id === scheduleId)?.course.name} ({selectedBatch.schedules.find((s) => s.id === scheduleId)?.timing})
            </p>
          )}
          {subBatchCode.trim() && !scheduleId && <p className="text-[11px] text-red-500 mt-1">No sub-batch found with this code</p>}
        </div>

        <p className="text-center text-[11px] text-muted-foreground">— or pick manually —</p>

        <select className="w-full px-3 py-2 border rounded-lg text-sm" value={batchId} onChange={(e) => { setBatchId(e.target.value); setScheduleId(''); setSubBatchCode(''); }}>
          <option value="">Select Batch</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </select>
        <select className="w-full px-3 py-2 border rounded-lg text-sm" value={scheduleId} onChange={(e) => { setScheduleId(e.target.value); setSubBatchCode(''); }} disabled={!selectedBatch}>
          <option value="">Select Course</option>
          {selectedBatch?.schedules.map((s) => <option key={s.id} value={s.id}>{s.code ? `${s.code} — ` : ''}{s.course.name} ({s.timing})</option>)}
        </select>

        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Training &amp; Fee Details</p>
          <p className="text-xs text-muted-foreground">
            Filled onto the onboarding agreement automatically — course name and batch number come from the sub-batch above.
          </p>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Training Mode:</span>
            {(['Offline', 'Online'] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="trainingMode" checked={trainingMode === m} onChange={() => setTrainingMode(m)} />
                {m}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Total Program Fee (₹)</label>
              <input
                type="number"
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="0"
                value={totalProgramFee}
                onChange={(e) => setTotalProgramFee(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Amount Paid (₹)</label>
              <input
                type="number"
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="0"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </div>
          </div>

          {balanceAmount !== null && (
            <p className="text-xs text-muted-foreground">
              Balance Amount: <span className={`font-medium ${balanceAmount > 0 ? 'text-amber-600' : 'text-green-600'}`}>₹{balanceAmount.toLocaleString('en-IN')}</span>
            </p>
          )}

          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
            <option value="">Payment Mode (optional)</option>
            {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <p className="text-xs text-muted-foreground">
          The student will fill in their own name, phone, photo, and other details, then read and sign onboarding documents, before they can access the portal.
        </p>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Create" />
    </Modal>
  );
}

// ── Documents tab ─────────────────────────────────────────────────────────────
function DocumentsTab({ canEdit, setError }: { canEdit: boolean; setError: (s: string) => void }) {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/student-onboarding/templates')
      .then((res) => setTemplates(res.data.data))
      .catch((err) => setError(errMsg(err, 'Failed to load documents')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (t: DocumentTemplate) => {
    try {
      await api.put(`/api/student-onboarding/templates/${t.id}`, { isActive: !t.isActive });
      load();
    } catch (err) { setError(errMsg(err, 'Failed to update document')); }
  };

  const toggleTrack = async (t: DocumentTemplate, track: string) => {
    const current = t.applicableTracks || [];
    const next = current.includes(track) ? current.filter((x) => x !== track) : [...current, track];
    try {
      await api.put(`/api/student-onboarding/templates/${t.id}`, { applicableTracks: next });
      load();
    } catch (err) { setError(errMsg(err, 'Failed to update applicable tracks')); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Every active document here is shown to every student during onboarding — they must read the full PDF and sign it before entering the classroom.</p>
        {canEdit && (
          <button onClick={() => setShowUpload(true)} className="px-3 py-2 text-sm rounded-lg border flex items-center gap-1.5 shrink-0 ml-4">
            <Upload className="w-4 h-4" /> Upload Document
          </button>
        )}
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded yet.</p>
      ) : (
        <div className="border rounded-xl divide-y">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <a href={`${BASE_URL}${t.fileUrl}`} target="_blank" rel="noreferrer" className="font-medium text-sm hover:underline">{t.title}</a>
                  <p className="text-xs text-muted-foreground">
                    {t._count.signatures} signed · uploaded {formatDate(t.createdAt)}{t.createdBy ? ` by ${t.createdBy.firstName} ${t.createdBy.lastName}` : ''}
                  </p>
                  <div className="flex items-center gap-1 mt-1.5">
                    {(t.applicableTracks?.length ?? 0) === 0 && !canEdit && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">All tracks</span>
                    )}
                    {(canEdit || (t.applicableTracks?.length ?? 0) > 0) && TRACKS.map((tr) => {
                      const on = (t.applicableTracks || []).includes(tr);
                      return (
                        <button
                          key={tr}
                          disabled={!canEdit}
                          onClick={() => toggleTrack(t, tr)}
                          title={on ? `Applies to ${tr} — click to remove` : `Doesn't apply to ${tr} — click to add`}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${on ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'} ${canEdit ? 'hover:opacity-80 cursor-pointer' : ''}`}
                        >
                          {tr}
                        </button>
                      );
                    })}
                    {canEdit && (t.applicableTracks?.length ?? 0) === 0 && (
                      <span className="text-[10px] text-muted-foreground ml-1">(all tracks — click to scope)</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                  {t.isActive ? 'Active' : 'Inactive'}
                </span>
                {canEdit && (
                  <button onClick={() => toggleActive(t)} className="text-xs font-medium text-blue-600 hover:underline">
                    {t.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <UploadTemplateModal onClose={() => setShowUpload(false)} setError={setError} onSaved={() => { setShowUpload(false); load(); }} />
      )}
    </div>
  );
}

function UploadTemplateModal({ onClose, setError, onSaved }: { onClose: () => void; setError: (s: string) => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [tracks, setTracks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleTrack = (tr: string) => {
    setTracks((ts) => (ts.includes(tr) ? ts.filter((x) => x !== tr) : [...ts, tr]));
  };

  const submit = async () => {
    if (!title.trim() || !file) { setError('A title and a PDF file are required'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('file', file);
      if (tracks.length > 0) fd.append('applicableTracks', tracks.join(','));
      await api.post('/api/student-onboarding/templates', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to upload document')); } finally { setSaving(false); }
  };

  return (
    <Modal title="Upload Onboarding Document" onClose={onClose}>
      <div className="space-y-3 text-left">
        <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Title (e.g. Enrollment Agreement)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-sm" />
        <div>
          <p className="text-xs font-medium mb-1.5">Applies to</p>
          <div className="flex items-center gap-2">
            {TRACKS.map((tr) => (
              <button
                key={tr}
                type="button"
                onClick={() => toggleTrack(tr)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border ${tracks.includes(tr) ? 'bg-blue-600 text-white border-blue-600' : 'border-muted-foreground/30 text-muted-foreground'}`}
              >
                {tr}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Leave all unselected to apply this document to every track.</p>
        </div>
        <p className="text-xs text-muted-foreground">PDF only, up to 20 MB. Every matching student will be required to read and sign this.</p>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Upload" />
    </Modal>
  );
}

// ── Approval tab ─────────────────────────────────────────────────────────────
interface ApprovalStudent {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  photo?: string | null;
  track: string;
  profileCompletedAt: string | null;
  documentsCompletedAt: string | null;
  requiredCount: number;
}

interface ApprovalItem {
  kind: 'template' | 'fee_declaration';
  id: string;
  title: string;
  signed: boolean;
  signedAt: string | null;
  signatureUrl?: string | null;
  photoUrl?: string | null;
  location?: string | null;
  signedPdfUrl?: string | null;
}

interface ApprovalStudentDetail {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone: string;
  track: string;
  photo?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  aadharNumber?: string | null;
  aadharPhoto?: string | null;
  fatherName?: string | null;
  fatherPhone?: string | null;
  motherName?: string | null;
  motherPhone?: string | null;
}

function ApprovalTab({ canEdit, setError }: { canEdit: boolean; setError: (s: string) => void }) {
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<ApprovalStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/student-onboarding/approvals', { params: search.trim() ? { search: search.trim() } : {} })
      .then((res) => setStudents(res.data.data))
      .catch((err) => setError(errMsg(err, 'Failed to load approvals')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Students who've completed their profile and signed every required document — review and approve before their dashboard unlocks.
      </p>
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No students waiting on approval right now.</p>
      ) : (
        <div className="border rounded-xl divide-y">
          {students.map((s) => (
            <button key={s.id} onClick={() => setOpenId(s.id)} className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition">
              <div className="flex items-center gap-3">
                {s.photo ? (
                  <img src={`${BASE_URL}${s.photo}`} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"><GraduationCap className="w-4 h-4 text-muted-foreground" /></div>
                )}
                <div>
                  <p className="font-medium text-sm">{s.firstName} {s.lastName} <span className="text-muted-foreground font-normal">({s.studentCode})</span></p>
                  <p className="text-xs text-muted-foreground">{s.phone} · {s.track} track</p>
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium shrink-0">Awaiting approval</span>
            </button>
          ))}
        </div>
      )}

      {openId && (
        <ApprovalDetailModal
          studentId={openId}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onApproved={() => { setOpenId(null); load(); }}
          setError={setError}
        />
      )}
    </div>
  );
}

function ApprovalDetailModal({ studentId, canEdit, onClose, onApproved, setError }: {
  studentId: string; canEdit: boolean; onClose: () => void; onApproved: () => void; setError: (s: string) => void;
}) {
  const [student, setStudent] = useState<ApprovalStudentDetail | null>(null);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [allSigned, setAllSigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/api/student-onboarding/approvals/${studentId}`)
      .then((res) => {
        setStudent(res.data.data.student);
        setItems(res.data.data.items);
        setAllSigned(res.data.data.allSigned);
      })
      .catch((err) => setError(errMsg(err, 'Failed to load student')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const approve = async () => {
    setApproving(true);
    try {
      await api.post(`/api/student-onboarding/approvals/${studentId}/approve`);
      onApproved();
    } catch (err) { setError(errMsg(err, 'Failed to approve')); } finally { setApproving(false); }
  };

  const reject = async () => {
    setRejecting(true);
    setError('');
    try {
      await api.post(`/api/student-onboarding/approvals/${studentId}/reject`, { reason: rejectReason.trim() || undefined });
      onApproved(); // same effect as approving: leave this modal, refresh the list
    } catch (err) { setError(errMsg(err, 'Failed to reject')); } finally { setRejecting(false); }
  };

  return (
    <Modal title={student ? `${student.firstName} ${student.lastName}` : 'Student'} onClose={onClose} wide>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : !student ? null : (
        <div className="space-y-4 text-left">
          <div className="flex items-start gap-4">
            {student.photo ? (
              <img src={`${BASE_URL}${student.photo}`} alt="Profile" className="w-16 h-16 rounded-xl object-cover border shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center border shrink-0"><GraduationCap className="w-6 h-6 text-muted-foreground" /></div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs flex-1">
              <Field label="Student ID" value={student.studentCode} />
              <Field label="Track" value={student.track} />
              <Field label="Phone" value={student.phone} />
              <Field label="Email" value={student.email} />
              <Field label="City" value={student.city} />
              <Field label="Address" value={student.address} />
              <Field label="Father" value={student.fatherName ? `${student.fatherName} (${student.fatherPhone || '—'})` : null} />
              <Field label="Mother" value={student.motherName ? `${student.motherName} (${student.motherPhone || '—'})` : null} />
              <Field label="Aadhar number" value={student.aadharNumber} />
            </div>
          </div>

          {student.aadharPhoto && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Aadhar card</p>
              <a href={`${BASE_URL}${student.aadharPhoto}`} target="_blank" rel="noreferrer">
                <img src={`${BASE_URL}${student.aadharPhoto}`} alt="Aadhar card" className="h-28 rounded-lg border object-cover hover:opacity-90 transition" />
              </a>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Documents</p>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="border rounded-lg px-2.5 py-2 bg-white space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      {it.signed ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                      {it.title}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      {it.signed && it.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {it.location}</span>}
                      {it.signed ? formatDateTime(it.signedAt) : 'Pending'}
                    </span>
                  </div>
                  {it.signed && it.signedPdfUrl ? (
                    <div className="pl-5 space-y-1">
                      <iframe
                        src={`${BASE_URL}${it.signedPdfUrl}`}
                        title={`${it.title} — signed copy`}
                        className="w-full h-80 rounded-lg border bg-white"
                      />
                      <a href={`${BASE_URL}${it.signedPdfUrl}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline">
                        Open full document in a new tab
                      </a>
                    </div>
                  ) : it.signed && (it.signatureUrl || it.photoUrl) ? (
                    // Signed before the signed-PDF stamp existed — fall back to the raw images.
                    <div className="flex items-center gap-3 pl-5">
                      {it.signatureUrl && (
                        <a href={`${BASE_URL}${it.signatureUrl}`} target="_blank" rel="noreferrer" className="text-center">
                          <img src={`${BASE_URL}${it.signatureUrl}`} alt="Signature" className="h-14 w-24 object-contain border rounded-md bg-white hover:opacity-90 transition" />
                          <p className="text-[10px] text-muted-foreground mt-0.5">Signature</p>
                        </a>
                      )}
                      {it.photoUrl && (
                        <a href={`${BASE_URL}${it.photoUrl}`} target="_blank" rel="noreferrer" className="text-center">
                          <img src={`${BASE_URL}${it.photoUrl}`} alt="Selfie taken while signing" className="h-14 w-14 object-cover border rounded-md hover:opacity-90 transition" />
                          <p className="text-[10px] text-muted-foreground mt-0.5">Photo</p>
                        </a>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
              {items.length === 0 && <p className="text-xs text-muted-foreground">No documents required.</p>}
            </div>
          </div>

          {canEdit && (
            <button onClick={() => setShowFeeForm(true)} className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
              <Receipt className="w-3.5 h-3.5" /> Add fee declaration form
            </button>
          )}

          {showRejectForm && (
            <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
              <label className="text-xs font-medium text-red-800">Reason for sending this back (shown to the student)</label>
              <textarea
                className="w-full px-2.5 py-2 border rounded-lg text-xs bg-white"
                rows={2}
                placeholder="e.g. Address looks incomplete, please re-enter your Aadhar number clearly"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowRejectForm(false)} className="px-3 py-1.5 text-xs rounded-lg border bg-white">Cancel</button>
                <button
                  onClick={reject}
                  disabled={rejecting}
                  className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white disabled:opacity-50"
                >
                  {rejecting ? 'Sending back...' : 'Confirm rejection'}
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center gap-2 pt-3 border-t">
            {canEdit ? (
              <button onClick={() => setShowRejectForm((v) => !v)} className="px-3 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                Reject &amp; send back
              </button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Close</button>
              {canEdit && (
                <button
                  onClick={approve}
                  disabled={!allSigned || approving}
                  className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white disabled:opacity-50"
                >
                  {approving ? 'Approving...' : allSigned ? 'Approve & Unlock Dashboard' : 'Waiting on signatures'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showFeeForm && (
        <FeeDeclarationFormModal
          studentId={studentId}
          onClose={() => setShowFeeForm(false)}
          setError={setError}
          onSaved={() => { setShowFeeForm(false); load(); }}
        />
      )}
    </Modal>
  );
}

interface FeeRow { date: string; totalFee: string; feesPaid: string; amountDue: string; }
const EMPTY_FEE_ROW: FeeRow = { date: '', totalFee: '', feesPaid: '', amountDue: '' };

function FeeDeclarationFormModal({ studentId, onClose, setError, onSaved }: {
  studentId: string; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [guardianName, setGuardianName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [rows, setRows] = useState<FeeRow[]>([EMPTY_FEE_ROW]);
  const [saving, setSaving] = useState(false);

  const updateRow = (i: number, field: keyof FeeRow, value: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const submit = async () => {
    const validRows = rows.filter((r) => r.date || r.totalFee || r.feesPaid || r.amountDue);
    if (validRows.length === 0) { setError('Add at least one fee row'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/api/student-onboarding/students/${studentId}/fee-declarations`, {
        guardianName: guardianName || undefined,
        courseName: courseName || undefined,
        dueDate: dueDate || undefined,
        rows: validRows,
      });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to create fee declaration')); } finally { setSaving(false); }
  };

  return (
    <Modal title="Student Declaration Form for Pending Fee Payment" onClose={onClose}>
      <div className="space-y-3 text-left">
        <p className="text-xs text-muted-foreground">
          This is sent to the student to read and sign. Once signed, it counts toward their onboarding approval —
          creating this re-locks the student's dashboard until they sign it and you approve again.
        </p>
        <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Guardian name (S/o or D/o)" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
        <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Course enrolled" value={courseName} onChange={(e) => setCourseName(e.target.value)} />
        <div>
          <label className="text-xs text-muted-foreground">Clear dues on or before</label>
          <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium">Fee schedule</label>
            <button type="button" onClick={() => setRows((rs) => [...rs, EMPTY_FEE_ROW])} className="text-xs text-blue-600 font-medium hover:underline">+ Add row</button>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-4 gap-1.5">
                <input placeholder="Date" value={r.date} onChange={(e) => updateRow(i, 'date', e.target.value)} className="px-2 py-1.5 border rounded-md text-xs" />
                <input placeholder="Total fee" value={r.totalFee} onChange={(e) => updateRow(i, 'totalFee', e.target.value)} className="px-2 py-1.5 border rounded-md text-xs" />
                <input placeholder="Fees paid" value={r.feesPaid} onChange={(e) => updateRow(i, 'feesPaid', e.target.value)} className="px-2 py-1.5 border rounded-md text-xs" />
                <input placeholder="Amount due" value={r.amountDue} onChange={(e) => updateRow(i, 'amountDue', e.target.value)} className="px-2 py-1.5 border rounded-md text-xs" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Send to Student" />
    </Modal>
  );
}

// ── Reports tab ───────────────────────────────────────────────────────────────
function ReportsTab({ setError }: { setError: (s: string) => void }) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [activeTemplateCount, setActiveTemplateCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get('/api/student-onboarding/batches')
      .then((res) => { setBatches(res.data.data.batches); setActiveTemplateCount(res.data.data.activeTemplateCount); })
      .catch((err) => setError(errMsg(err, 'Failed to load batch report')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-4">
      {activeTemplateCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-2">
          No active documents are configured yet — students can complete onboarding without signing anything until you upload one under the Documents tab.
        </div>
      )}
      {batches.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No batches found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map((b) => (
            <button
              key={b.id}
              onClick={() => setOpenBatchId(b.id)}
              className="text-left border rounded-xl p-4 hover:border-blue-400 hover:shadow-sm transition space-y-2"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{b.code}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{b.status}</span>
              </div>
              <p className="text-xs text-muted-foreground">{formatDate(b.startDate)} – {formatDate(b.endDate)}</p>
              <div className="flex items-center gap-1.5 text-sm">
                <Users className="w-3.5 h-3.5 text-muted-foreground" /> {b.totalStudents} student{b.totalStudents === 1 ? '' : 's'}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="text-xs">
                  <p className="text-muted-foreground">Profile done</p>
                  <p className="font-semibold">{b.profileCompleted}/{b.totalStudents}</p>
                </div>
                <div className="text-xs">
                  <p className="text-muted-foreground">Docs signed</p>
                  <p className="font-semibold">{b.documentsCompleted}/{b.totalStudents}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {openBatchId && <BatchDrillDownModal batchId={openBatchId} onClose={() => setOpenBatchId(null)} setError={setError} />}
    </div>
  );
}

function BatchDrillDownModal({ batchId, onClose, setError }: { batchId: string; onClose: () => void; setError: (s: string) => void }) {
  const [batchCode, setBatchCode] = useState('');
  const [students, setStudents] = useState<BatchStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/api/student-onboarding/batches/${batchId}/students`)
      .then((res) => { setBatchCode(res.data.data.batch.code); setStudents(res.data.data.students); })
      .catch((err) => setError(errMsg(err, 'Failed to load batch students')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  return (
    <Modal title={`Batch ${batchCode || ''}`} onClose={onClose} wide>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No students enrolled in this batch yet.</p>
      ) : (
        <div className="space-y-2 text-left">
          {students.map((s) => (
            <div key={s.id} className="border rounded-lg">
              <button
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                className="w-full flex items-center justify-between p-3 text-left"
              >
                <div className="flex items-center gap-3">
                  {s.photo ? (
                    <img src={`${BASE_URL}${s.photo}`} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"><GraduationCap className="w-4 h-4 text-muted-foreground" /></div>
                  )}
                  <div>
                    <p className="font-medium text-sm">{s.firstName} {s.lastName} <span className="text-muted-foreground font-normal">({s.studentCode})</span></p>
                    <p className="text-xs text-muted-foreground">{s.courses.join(', ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <StatusPill ok={!!s.profileCompletedAt} label="Profile" />
                  <StatusPill ok={!!s.documentsCompletedAt} label="Documents" />
                </div>
              </button>

              {expandedId === s.id && (
                <div className="border-t p-3 space-y-3 bg-muted/20 text-sm">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <Field label="Phone" value={s.phone} />
                    <Field label="Email" value={s.email} />
                    <Field label="DOB" value={formatDate(s.dateOfBirth)} />
                    <Field label="Gender" value={s.gender} />
                    <Field label="City" value={s.city} />
                    <Field label="State" value={s.state} />
                    <Field label="Address" value={s.address} />
                    <Field label="Father" value={s.fatherName ? `${s.fatherName} (${s.fatherPhone || '—'})` : null} />
                    <Field label="Mother" value={s.motherName ? `${s.motherName} (${s.motherPhone || '—'})` : null} />
                    <Field label="Emergency contact" value={s.emergencyContactName ? `${s.emergencyContactName} (${s.emergencyContactPhone || '—'})` : null} />
                  </div>

                  {s.education && s.education.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Education</p>
                      {s.education.map((e, i) => (
                        <p key={i} className="text-xs">{e.degree} — {e.institution}{e.year ? `, ${e.year}` : ''}{e.grade ? ` (${e.grade})` : ''}</p>
                      ))}
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Onboarding documents</p>
                    {s.documents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No documents configured.</p>
                    ) : (
                      <div className="space-y-1">
                        {s.documents.map((d) => (
                          <div key={d.templateId} className="flex items-center justify-between text-xs border rounded-lg px-2.5 py-1.5 bg-white">
                            <span className="flex items-center gap-1.5">
                              {d.signed ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                              {d.title}
                            </span>
                            <span className="text-muted-foreground flex items-center gap-2">
                              {d.signed && d.signedAt && <span>{formatDateTime(d.signedAt)}</span>}
                              {d.signed && d.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {d.location}</span>}
                              {d.signed && d.signedPdfUrl && (
                                <a href={`${BASE_URL}${d.signedPdfUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">View</a>
                              )}
                              {!d.signed && <span>Pending</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${ok ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} {label}
    </span>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value || '—'}</p>
    </div>
  );
}
