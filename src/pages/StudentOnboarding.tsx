import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { BASE_URL } from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import {
  UserPlus, FileText, BarChart2, X, Loader2, Upload, CheckCircle2, XCircle,
  Users, GraduationCap, MapPin,
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
  createdAt: string;
  createdBy?: { firstName: string; lastName: string } | null;
  _count: { signatures: number };
}

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
  documents: { templateId: string; title: string; signed: boolean; signedAt: string | null; location: string | null }[];
}

type Tab = 'add' | 'documents' | 'reports';
const VALID_TABS: Tab[] = ['add', 'documents', 'reports'];
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'add', label: 'Add Student', icon: UserPlus },
  { id: 'documents', label: 'Documents', icon: FileText },
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
      {tab === 'reports' && <ReportsTab setError={setError} />}
    </div>
  );
}

// ── Add Student tab ──────────────────────────────────────────────────────────
function AddStudentTab({ canEdit, setError }: { canEdit: boolean; setError: (s: string) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
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
        <AddStudentModal onClose={() => setShowAdd(false)} setError={setError} onSaved={() => setShowAdd(false)} />
      )}
    </div>
  );
}

function AddStudentModal({ onClose, setError, onSaved }: { onClose: () => void; setError: (s: string) => void; onSaved: () => void }) {
  const [studentCode, setStudentCode] = useState('');
  const [email, setEmail] = useState('');
  const [track, setTrack] = useState('JRP');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [subBatchCode, setSubBatchCode] = useState('');
  const [saving, setSaving] = useState(false);

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
      await api.post('/api/production/students', { studentCode, email, track, scheduleId });
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
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !file) { setError('A title and a PDF file are required'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('file', file);
      await api.post('/api/student-onboarding/templates', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to upload document')); } finally { setSaving(false); }
  };

  return (
    <Modal title="Upload Onboarding Document" onClose={onClose}>
      <div className="space-y-3 text-left">
        <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Title (e.g. Enrollment Agreement)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-sm" />
        <p className="text-xs text-muted-foreground">PDF only, up to 20 MB. Every currently enrolling student will be required to read and sign this.</p>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Upload" />
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
