import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { BASE_URL } from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import * as XLSX from 'xlsx';
import {
  Lock, Plus, X, Users, BookOpen, CalendarRange, ChevronDown, ChevronRight,
  GraduationCap, PlayCircle, CalendarClock, Search, Upload, Pencil, ChevronLeft, Download, Trash2, UserPlus,
  FileText, ClipboardList, ListChecks, Star, Type as TypeIcon, CheckSquare, BarChart3, Mail, NotebookPen,
  BadgeCheck, CheckCircle2, XCircle, QrCode, ExternalLink, Loader2,
} from 'lucide-react';

// Files uploaded by the backend (project submissions, student photos/aadhar) come back as
// relative paths like "/uploads/...". A bare <a href> resolves those against the frontend's
// own origin, not the API, which is why the link re-opens the app instead of the file.
// Absolute URLs (e.g. a pasted link submission) are left untouched.
const fileUrl = (path: string) => (/^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`);

// ── Types (mirrors backend production.controller.ts) ───────────────────────
type EmployeeLite = { id: string; firstName: string; lastName: string; employeeCode?: string; department?: { name: string } | null; status?: string };

type AcademyModule = {
  id: string; courseId: string; order: number; title: string;
  hours?: number | null; dayRange?: string | null; topics?: string | null;
};
type AcademyCourse = {
  id: string; name: string; description?: string | null; totalHours?: number | null;
  isCustom: boolean; isActive: boolean; modules: AcademyModule[]; _count?: { schedules: number };
};

type BatchStatus = 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
type BatchTiming = 'MORNING' | 'AFTERNOON' | 'EVENING';
type DayPattern = 'MON_SAT' | 'SAT_SUN' | 'SUNDAY_ONLY';
type DeliveryMode = 'ONLINE' | 'OFFLINE' | 'HYBRID';

type TrainerAssignment = { id: string; trainerId: string; trainer: EmployeeLite };
type BatchCourseSchedule = {
  id: string; code?: string | null; batchId: string; courseId: string; timing: BatchTiming; dayPattern: DayPattern;
  mode: DeliveryMode; startDate: string; endDate?: string | null; capacity?: number | null;
  course: { id: string; name: string }; trainers: TrainerAssignment[]; _count?: { enrollments: number };
};
type Batch = {
  id: string; code: string; status: BatchStatus; startDate: string; endDate?: string | null;
  createdBy?: EmployeeLite | null; schedules: BatchCourseSchedule[];
};

type StudentTrack = 'JRP' | 'IOP' | 'PAP';
type StudentStatus = 'ENROLLED' | 'ONBOARDED' | 'ACTIVE' | 'INACTIVE' | 'COMPLETED' | 'IN_PLACEMENT' | 'PLACED' | 'BATCH_TRANSFER';
type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'DROPPED';
type StudentBatchEnrollment = {
  id: string; studentId: string; scheduleId: string; status: EnrollmentStatus;
  schedule: { id: string; course: { name: string }; batch: { code: string } };
};
// Internal trainer opinion per course — certificate eligibility, placement
// readiness, JRP→IOP recommendation. Previously visible only in the Trainer
// Portal; now surfaced to the Production Manager.
type TrainerFeedback = {
  id: string; courseId: string;
  performanceRating?: number | null; placementReadinessNote?: string | null;
  jrpToIopRecommended?: boolean | null; certificateEligible: boolean;
  course: { id: string; name: string };
  trainer?: { id: string; firstName: string; lastName: string } | null;
  updatedAt: string;
};
// Student-visible module-wise feedback (already shown on the Rank Card) —
// surfaced here too so the PM doesn't have to drill into the Student Report.
type ModuleFeedbackLite = {
  id: string; moduleId: string; rating?: number | null; comments: string;
  module: { id: string; title: string };
  trainer?: { id: string; firstName: string; lastName: string } | null;
  updatedAt: string;
};
type Student = {
  id: string; studentCode: string; firstName: string; lastName: string; email?: string | null;
  phone: string; track: StudentTrack; status: StudentStatus; movedToPlacementAt?: string | null;
  enrollments: StudentBatchEnrollment[];
  trainerFeedbacks?: TrainerFeedback[];
  moduleFeedbacks?: ModuleFeedbackLite[];
};

type Stats = { ongoingBatches: number; upcomingBatches: number; totalStudents: number; activeStudents: number };

const BATCH_STATUSES: BatchStatus[] = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'];
const BATCH_STATUS_COLOR: Record<BatchStatus, string> = {
  UPCOMING: 'bg-blue-100 text-blue-700', ONGOING: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-gray-100 text-gray-700', CANCELLED: 'bg-red-100 text-red-700',
};
const TIMINGS: BatchTiming[] = ['MORNING', 'AFTERNOON', 'EVENING'];
const DAY_PATTERNS: { value: DayPattern; label: string }[] = [
  { value: 'MON_SAT', label: 'Mon – Sat' }, { value: 'SAT_SUN', label: 'Sat – Sun' }, { value: 'SUNDAY_ONLY', label: 'Sunday only' },
];
const MODES: DeliveryMode[] = ['ONLINE', 'OFFLINE', 'HYBRID'];
const TRACKS: StudentTrack[] = ['JRP', 'IOP', 'PAP'];
const TRACK_LABEL: Record<StudentTrack, string> = {
  JRP: 'JRP — Job Readiness', IOP: 'IOP — Interview Opportunities', PAP: 'PAP — Placement Assurance',
};
const STUDENT_STATUSES: StudentStatus[] = ['ENROLLED', 'ONBOARDED', 'ACTIVE', 'INACTIVE', 'COMPLETED', 'IN_PLACEMENT', 'PLACED', 'BATCH_TRANSFER'];
const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  ENROLLED: 'Enrolled', ONBOARDED: 'Onboarded', ACTIVE: 'Active', INACTIVE: 'Inactive',
  COMPLETED: 'Completed', IN_PLACEMENT: 'In Placement Pool', PLACED: 'Placed', BATCH_TRANSFER: 'Batch Transfer',
};
const STUDENT_STATUS_COLOR: Record<StudentStatus, string> = {
  ENROLLED: 'bg-sky-100 text-sky-700', ONBOARDED: 'bg-blue-100 text-blue-700', ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-amber-100 text-amber-700', IN_PLACEMENT: 'bg-indigo-100 text-indigo-700',
  PLACED: 'bg-purple-100 text-purple-700', BATCH_TRANSFER: 'bg-orange-100 text-orange-700',
};
const ENROLLMENT_STATUSES: EnrollmentStatus[] = ['ACTIVE', 'COMPLETED', 'DROPPED'];

// ── Projects / Feedback Forms / Online Tests (PM authoring) ────────────────
type ModuleLite = { id: string; title: string; order: number; courseId: string };
type Project = {
  id: string; moduleId: string; title: string; description?: string | null; resourceUrl: string; createdAt: string;
  module: ModuleLite;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  _count?: { releases: number };
};
type FeedbackQuestionType = 'RATING' | 'TEXT' | 'MCQ';
const FEEDBACK_TYPES: { value: FeedbackQuestionType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'RATING', label: 'Rating', icon: Star },
  { value: 'TEXT', label: 'Text', icon: TypeIcon },
  { value: 'MCQ', label: 'Multiple Choice', icon: CheckSquare },
];
type FeedbackFormQuestion = {
  id?: string; order: number; type: FeedbackQuestionType; prompt: string; options?: string[] | null; required: boolean;
};
type FeedbackForm = {
  id: string; moduleId: string; title: string; createdAt: string;
  module: ModuleLite; questions: FeedbackFormQuestion[]; _count?: { releases: number };
};
type OnlineTestQuestion = {
  id: string; order: number; prompt: string; options: string[]; correctIndex: number; marks: number;
};
type OnlineTest = {
  id: string; moduleId: string; title: string; durationMinutes: number; createdAt: string;
  module: ModuleLite;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  _count?: { questions: number; releases: number };
  questions?: OnlineTestQuestion[];
};

function flattenModules(courses: AcademyCourse[]): (ModuleLite & { courseName: string })[] {
  return courses.flatMap((c) => c.modules.map((m) => ({ ...m, courseId: c.id, courseName: c.name })));
}

function errMsg(err: unknown, fallback: string) {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || fallback;
}

type Tab = 'courses' | 'batches' | 'students' | 'content' | 'portfolios' | 'reports';
const VALID_TABS: Tab[] = ['courses', 'batches', 'students', 'content', 'portfolios', 'reports'];
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'courses', label: 'Courses', icon: BookOpen },
  { id: 'batches', label: 'Batches & Schedules', icon: CalendarRange },
  { id: 'students', label: 'Students', icon: GraduationCap },
  { id: 'content', label: 'Projects / Feedback / Tests', icon: FileText },
  { id: 'portfolios', label: 'Portfolio Approvals', icon: BadgeCheck },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export default function ProductionPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.PRODUCTION_TRAINING;
  const canEdit = hasModule('PRODUCTION_TRAINING', 'EDIT');

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab>(tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'courses');
  const setTab = (t: Tab) => { setTabState(t); setSearchParams({ tab: t }, { replace: true }); };
  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== tab) setTabState(tabFromUrl);
  }, [tabFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const [stats, setStats] = useState<Stats | null>(null);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [error, setError] = useState('');

  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentsRefreshKey, setStudentsRefreshKey] = useState(0);
  const bumpStudents = () => setStudentsRefreshKey((k) => k + 1);

  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showBulkEnroll, setShowBulkEnroll] = useState(false);

  const fetchStats = useCallback(async () => {
    try { const res = await api.get('/api/production/stats'); setStats(res.data.data); } catch { /* ignore */ }
  }, []);

  const fetchTab = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'courses' || tab === 'content') {
        const res = await api.get('/api/production/courses');
        setCourses(res.data.data);
      } else if (tab === 'batches') {
        const res = await api.get('/api/production/batches');
        setBatches(res.data.data);
      }
      // Students tab fetches its own paginated/filtered data internally.
    } catch (err) {
      setError(errMsg(err, 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { if (level) { fetchTab(); fetchStats(); } }, [level, fetchTab, fetchStats]);
  useEffect(() => {
    if (!level) return;
    api
      .get('/api/employees', { params: { limit: 500 } })
      .then((res) => {
        const all: EmployeeLite[] = res.data.data;
        // Restrict trainer selection to the Production team only. There are
        // duplicate "Production" department rows in the DB, so match by name
        // rather than a single departmentId. Include everyone except
        // resigned/terminated staff — most of the Production team is still
        // ON_PROBATION, not ACTIVE, so don't filter on status.
        const productionOnly = all.filter(
          (e) =>
            e.department?.name?.toLowerCase().includes('production') &&
            e.status !== 'TERMINATED' &&
            e.status !== 'RESIGNED'
        );
        setEmployees(productionOnly);
      })
      .catch(() => setEmployees([]));
  }, [level]);

  if (loaded && !level) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <Lock className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">No access to Production (Training)</p>
          <p className="text-sm text-muted-foreground">Ask someone with Master Control to grant you access to this module.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Production (Training)</h1>
          <p className="text-muted-foreground text-sm">Courses, batches, trainers, and student tracks (JRP / IOP / PAP)</p>
        </div>
        {canEdit && tab !== 'content' && tab !== 'reports' && tab !== 'portfolios' && (
          <button
            onClick={() => (tab === 'courses' ? setShowAddCourse(true) : tab === 'batches' ? setShowAddBatch(true) : setShowAddStudent(true))}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> {tab === 'courses' ? 'New Course' : tab === 'batches' ? 'New Batch' : 'New Student'}
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={PlayCircle} label="Ongoing Batches" value={stats?.ongoingBatches ?? 0} />
        <StatCard icon={CalendarClock} label="Upcoming Batches" value={stats?.upcomingBatches ?? 0} />
        <StatCard icon={Users} label="Total Students" value={stats?.totalStudents ?? 0} />
        <StatCard icon={GraduationCap} label="Active Students" value={stats?.activeStudents ?? 0} />
      </div>

      <div className="flex items-center gap-1 border-b">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : tab === 'courses' ? (
        <CoursesTab courses={courses} canEdit={canEdit} setError={setError} refresh={fetchTab} />
      ) : tab === 'batches' ? (
        <BatchesTab batches={batches} employees={employees} canEdit={canEdit} setError={setError} refresh={() => { fetchTab(); fetchStats(); }} />
      ) : tab === 'content' ? (
        <ContentTab courses={courses} canEdit={canEdit} setError={setError} />
      ) : tab === 'portfolios' ? (
        <PortfoliosTab canEdit={canEdit} setError={setError} />
      ) : tab === 'reports' ? (
        <ReportsTab canEdit={canEdit} setError={setError} />
      ) : (
        <StudentsTab
          canEdit={canEdit}
          setError={setError}
          refresh={() => { bumpStudents(); fetchStats(); }}
          refreshKey={studentsRefreshKey}
          batches={batches.length ? batches : undefined}
          onEnroll={() => setShowEnroll(true)}
          onBulkEnroll={() => setShowBulkEnroll(true)}
        />
      )}

      {showAddCourse && (
        <AddCourseModal onClose={() => setShowAddCourse(false)} setError={setError} onSaved={() => { setShowAddCourse(false); fetchTab(); }} />
      )}
      {showAddBatch && (
        <AddBatchModal onClose={() => setShowAddBatch(false)} setError={setError} onSaved={() => { setShowAddBatch(false); fetchTab(); fetchStats(); }} />
      )}
      {showAddStudent && (
        <AddStudentModal onClose={() => setShowAddStudent(false)} setError={setError} onSaved={() => { setShowAddStudent(false); bumpStudents(); fetchStats(); }} />
      )}
      {showEnroll && (
        <EnrollStudentModal
          onClose={() => setShowEnroll(false)}
          setError={setError}
          onSaved={() => { setShowEnroll(false); bumpStudents(); }}
        />
      )}
      {showBulkEnroll && (
        <BulkEnrollModal
          onClose={() => setShowBulkEnroll(false)}
          setError={setError}
          onSaved={() => { setShowBulkEnroll(false); bumpStudents(); }}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-purple-600" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

// ── COURSES TAB ──────────────────────────────────────────────────────────────
function CoursesTab({ courses, canEdit, setError, refresh }: {
  courses: AcademyCourse[]; canEdit: boolean; setError: (s: string) => void; refresh: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddModule, setShowAddModule] = useState<string | null>(null);
  const [editingModule, setEditingModule] = useState<AcademyModule | null>(null);

  const toggleActive = async (course: AcademyCourse) => {
    try {
      await api.put(`/api/production/courses/${course.id}`, { isActive: !course.isActive });
      refresh();
    } catch (err) { setError(errMsg(err, 'Failed to update course')); }
  };

  return (
    <div className="space-y-3">
      {courses.length === 0 && <div className="text-center text-muted-foreground py-8">No courses yet</div>}
      {courses.map((c) => (
        <div key={c.id} className="bg-card border rounded-xl overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === c.id ? null : c.id)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30"
          >
            <div className="flex items-center gap-3 text-left">
              {expanded === c.id ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
              <div>
                <p className="font-medium flex items-center gap-2">
                  {c.name}
                  {c.isCustom && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Custom</span>}
                  {!c.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Inactive</span>}
                </p>
                {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
              </div>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-4 flex-shrink-0">
              <span>{c.modules.length} module{c.modules.length !== 1 ? 's' : ''}</span>
              {c.totalHours != null && <span>{c.totalHours}h</span>}
              <span>{c._count?.schedules ?? 0} schedule(s)</span>
            </div>
          </button>

          {expanded === c.id && (
            <div className="border-t px-4 py-3 space-y-2 bg-muted/10">
              {canEdit && (
                <div className="flex justify-end gap-2 pb-1">
                  <button onClick={() => toggleActive(c)} className="text-xs px-2 py-1 border rounded-lg hover:bg-muted/50">
                    {c.isActive ? 'Mark Inactive' : 'Mark Active'}
                  </button>
                  <button onClick={() => setShowAddModule(c.id)} className="text-xs px-2 py-1 border rounded-lg hover:bg-muted/50 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Module
                  </button>
                </div>
              )}
              {c.modules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No modules yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-1 pr-2">#</th><th className="py-1 pr-2">Title</th><th className="py-1 pr-2">Hours</th><th className="py-1 pr-2">Days</th>{canEdit && <th className="py-1" />}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {c.modules.map((m) => (
                      <tr key={m.id}>
                        <td className="py-1.5 pr-2">{m.order}</td>
                        <td className="py-1.5 pr-2">{m.title}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{m.hours ?? '—'}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{m.dayRange ?? '—'}</td>
                        {canEdit && (
                          <td className="py-1.5">
                            <button onClick={() => setEditingModule(m)} className="text-xs text-blue-600 hover:underline">Edit</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}

      {showAddModule && (
        <AddModuleModal courseId={showAddModule} nextOrder={(courses.find((c) => c.id === showAddModule)?.modules.length ?? 0) + 1}
          onClose={() => setShowAddModule(null)} setError={setError} onSaved={() => { setShowAddModule(null); refresh(); }} />
      )}
      {editingModule && (
        <EditModuleModal module={editingModule} onClose={() => setEditingModule(null)} setError={setError} onSaved={() => { setEditingModule(null); refresh(); }} />
      )}
    </div>
  );
}

function AddCourseModal({ onClose, setError, onSaved }: { onClose: () => void; setError: (s: string) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', description: '', totalHours: '', isCustom: false });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name) { setError('Course name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/production/courses', { ...form, totalHours: form.totalHours || undefined });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to create course')); } finally { setSaving(false); }
  };

  return (
    <Modal title="New Course" onClose={onClose}>
      <div className="space-y-3">
        <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Course Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Total Hours" value={form.totalHours} onChange={(e) => setForm({ ...form, totalHours: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isCustom} onChange={(e) => setForm({ ...form, isCustom: e.target.checked })} />
          Custom course (modules added later)
        </label>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Create" />
    </Modal>
  );
}

function AddModuleModal({ courseId, nextOrder, onClose, setError, onSaved }: {
  courseId: string; nextOrder: number; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ order: String(nextOrder), title: '', hours: '', dayRange: '', topics: '' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.title) { setError('Module title is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/api/production/courses/${courseId}/modules`, { ...form, hours: form.hours || undefined });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to add module')); } finally { setSaving(false); }
  };

  return (
    <Modal title="Add Module" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input type="number" className="w-24 px-3 py-2 border rounded-lg text-sm" placeholder="Order" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
          <input className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Module Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <input type="number" className="w-1/2 px-3 py-2 border rounded-lg text-sm" placeholder="Hours" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          <input className="w-1/2 px-3 py-2 border rounded-lg text-sm" placeholder="Day Range (e.g. Day 1-3)" value={form.dayRange} onChange={(e) => setForm({ ...form, dayRange: e.target.value })} />
        </div>
        <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Topics covered" rows={2} value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} />
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Add" />
    </Modal>
  );
}

function EditModuleModal({ module, onClose, setError, onSaved }: { module: AcademyModule; onClose: () => void; setError: (s: string) => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    order: String(module.order), title: module.title, hours: module.hours != null ? String(module.hours) : '',
    dayRange: module.dayRange ?? '', topics: module.topics ?? '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.title) { setError('Module title is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/production/modules/${module.id}`, { ...form, hours: form.hours || undefined });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to update module')); } finally { setSaving(false); }
  };

  return (
    <Modal title="Edit Module" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input type="number" className="w-24 px-3 py-2 border rounded-lg text-sm" placeholder="Order" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
          <input className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Module Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <input type="number" className="w-1/2 px-3 py-2 border rounded-lg text-sm" placeholder="Hours" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          <input className="w-1/2 px-3 py-2 border rounded-lg text-sm" placeholder="Day Range" value={form.dayRange} onChange={(e) => setForm({ ...form, dayRange: e.target.value })} />
        </div>
        <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Topics covered" rows={2} value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} />
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Save" />
    </Modal>
  );
}

// ── BATCHES TAB ──────────────────────────────────────────────────────────────
function BatchesTab({ batches, employees, canEdit, setError, refresh }: {
  batches: Batch[]; employees: EmployeeLite[]; canEdit: boolean; setError: (s: string) => void; refresh: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddSchedule, setShowAddSchedule] = useState<string | null>(null);
  const [assigningSchedule, setAssigningSchedule] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<BatchCourseSchedule | null>(null);
  const [addingStudentsTo, setAddingStudentsTo] = useState<{ id: string; courseName: string } | null>(null);

  const updateStatus = async (id: string, status: BatchStatus) => {
    try { await api.put(`/api/production/batches/${id}`, { status }); refresh(); }
    catch (err) { setError(errMsg(err, 'Failed to update batch')); }
  };

  const removeTrainer = async (scheduleId: string, trainerId: string) => {
    try { await api.delete(`/api/production/schedules/${scheduleId}/trainers/${trainerId}`); refresh(); }
    catch (err) { setError(errMsg(err, 'Failed to remove trainer')); }
  };

  const deleteSchedule = async (scheduleId: string, courseName: string) => {
    if (!window.confirm(`Delete sub-batch "${courseName}"? This cannot be undone.`)) return;
    try { await api.delete(`/api/production/schedules/${scheduleId}`); refresh(); }
    catch (err) { setError(errMsg(err, 'Failed to delete sub-batch')); }
  };

  return (
    <div className="space-y-3">
      {batches.length === 0 && <div className="text-center text-muted-foreground py-8">No batches yet</div>}
      {batches.map((b) => (
        <div key={b.id} className="bg-card border rounded-xl overflow-hidden">
          <button onClick={() => setExpanded(expanded === b.id ? null : b.id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30">
            <div className="flex items-center gap-3 text-left">
              {expanded === b.id ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
              <div>
                <p className="font-medium">{b.code}</p>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(b.startDate).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs text-muted-foreground">{b.schedules.length} course(s)</span>
              {canEdit ? (
                <select
                  value={b.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateStatus(b.id, e.target.value as BatchStatus)}
                  className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${BATCH_STATUS_COLOR[b.status]}`}
                >
                  {BATCH_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${BATCH_STATUS_COLOR[b.status]}`}>{b.status}</span>
              )}
            </div>
          </button>

          {expanded === b.id && (
            <div className="border-t px-4 py-3 space-y-3 bg-muted/10">
              {canEdit && (
                <div className="flex justify-end">
                  <button onClick={() => setShowAddSchedule(b.id)} className="text-xs px-2 py-1 border rounded-lg hover:bg-muted/50 flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Sub-Batch
                  </button>
                </div>
              )}
              {b.schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No course schedules yet.</p>
              ) : (
                b.schedules.map((s) => (
                  <div key={s.id} className="border rounded-lg p-3 bg-white space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="font-medium text-sm flex items-center gap-2">
                        {s.course.name}
                        {s.code && (
                          <span
                            title="Sub-batch code — use this when adding students"
                            className="font-mono text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 cursor-copy"
                            onClick={() => navigator.clipboard?.writeText(s.code!)}
                          >
                            {s.code}
                          </span>
                        )}
                      </p>
                      <div className="text-xs text-muted-foreground flex items-center gap-3">
                        <span>{s.timing}</span>
                        <span>{DAY_PATTERNS.find((d) => d.value === s.dayPattern)?.label}</span>
                        <span>{s.mode}</span>
                        <span>{s._count?.enrollments ?? 0}{s.capacity ? ` / ${s.capacity}` : ''} students</span>
                        {canEdit && (
                          <button
                            onClick={() => setEditingSchedule(s)}
                            title="Edit sub-batch"
                            className="text-muted-foreground hover:text-blue-600"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => deleteSchedule(s.id, s.course.name)}
                            title="Delete sub-batch"
                            className="text-muted-foreground hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {s.trainers.map((t) => (
                        <span key={t.id} className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 flex items-center gap-1">
                          {t.trainer.firstName} {t.trainer.lastName}
                          {canEdit && <button onClick={() => removeTrainer(s.id, t.trainerId)}><X className="w-3 h-3" /></button>}
                        </span>
                      ))}
                      {canEdit && (
                        <button onClick={() => setAssigningSchedule(s.id)} className="text-xs px-2 py-1 border rounded-full hover:bg-muted/50 flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Assign Trainer
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => setAddingStudentsTo({ id: s.id, courseName: s.course.name })} className="text-xs px-2 py-1 border rounded-full hover:bg-muted/50 flex items-center gap-1">
                          <UserPlus className="w-3 h-3" /> Add Students
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}

      {showAddSchedule && (
        <AddScheduleModal batchId={showAddSchedule} employees={employees} onClose={() => setShowAddSchedule(null)} setError={setError} onSaved={() => { setShowAddSchedule(null); refresh(); }} />
      )}
      {assigningSchedule && (
        <AssignTrainerModal scheduleId={assigningSchedule} employees={employees} onClose={() => setAssigningSchedule(null)} setError={setError} onSaved={() => { setAssigningSchedule(null); refresh(); }} />
      )}
      {editingSchedule && (
        <EditScheduleModal schedule={editingSchedule} onClose={() => setEditingSchedule(null)} setError={setError} onSaved={() => { setEditingSchedule(null); refresh(); }} />
      )}
      {addingStudentsTo && (
        <AddStudentsToScheduleModal
          scheduleId={addingStudentsTo.id}
          courseName={addingStudentsTo.courseName}
          onClose={() => setAddingStudentsTo(null)}
          setError={setError}
          onSaved={() => { setAddingStudentsTo(null); refresh(); }}
        />
      )}
    </div>
  );
}

function AddBatchModal({ onClose, setError, onSaved }: { onClose: () => void; setError: (s: string) => void; onSaved: () => void }) {
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!code.trim()) { setError('Batch name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/production/batches', { code: code.trim() });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to create batch')); } finally { setSaving(false); }
  };

  return (
    <Modal title="New Batch" onClose={onClose}>
      <div className="space-y-3">
        <input
          className="w-full px-3 py-2 border rounded-lg text-sm"
          placeholder="Batch name (e.g. Batch 14) *"
          value={code}
          autoFocus
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <p className="text-xs text-muted-foreground">
          That's it — add courses, timing, trainers, and students inside the batch once it's created.
        </p>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Create" />
    </Modal>
  );
}

function AddScheduleModal({ batchId, employees, onClose, setError, onSaved }: {
  batchId: string; employees: EmployeeLite[]; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [courses, setCourses] = useState<AcademyCourse[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState({
    courseId: '', timing: 'MORNING' as BatchTiming, dayPattern: 'MON_SAT' as DayPattern, mode: 'OFFLINE' as DeliveryMode,
    startDate: '', endDate: '', capacity: '',
  });
  const [trainerIds, setTrainerIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/production/courses').then((res) => setCourses(res.data.data)).catch(() => setCourses([]));
    api.get('/api/production/students').then((res) => setStudents(res.data.data)).catch(() => setStudents([]));
  }, []);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const submit = async () => {
    if (!form.courseId) { setError('Select a course'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/api/production/batches/${batchId}/schedules`, {
        ...form,
        endDate: form.endDate || undefined,
        capacity: form.capacity || undefined,
        trainerIds,
        studentIds,
      });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to add sub-batch')); } finally { setSaving(false); }
  };

  return (
    <Modal title="Add Sub-Batch" onClose={onClose}>
      <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
        <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
          <option value="">Select Course *</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-2">
          <select className="w-1/2 px-3 py-2 border rounded-lg text-sm" value={form.timing} onChange={(e) => setForm({ ...form, timing: e.target.value as BatchTiming })}>
            {TIMINGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="w-1/2 px-3 py-2 border rounded-lg text-sm" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as DeliveryMode })}>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <details className="border rounded-lg px-3 py-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">More options (days, dates, capacity)</summary>
          <div className="space-y-2 mt-2">
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.dayPattern} onChange={(e) => setForm({ ...form, dayPattern: e.target.value as DayPattern })}>
              {DAY_PATTERNS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} placeholder="Start date" />
              <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} placeholder="End date" />
            </div>
            <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </div>
        </details>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Trainer(s)</p>
          <div className="border rounded-lg max-h-32 overflow-y-auto divide-y">
            {employees.map((e) => (
              <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/30 cursor-pointer">
                <input type="checkbox" checked={trainerIds.includes(e.id)} onChange={() => toggle(trainerIds, setTrainerIds, e.id)} />
                {e.firstName} {e.lastName}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Students</p>
          <div className="border rounded-lg max-h-32 overflow-y-auto divide-y">
            {students.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">No students yet</p>}
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/30 cursor-pointer">
                <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => toggle(studentIds, setStudentIds, s.id)} />
                {s.firstName} {s.lastName} <span className="text-xs text-muted-foreground">({s.track})</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Add" />
    </Modal>
  );
}

function AssignTrainerModal({ scheduleId, employees, onClose, setError, onSaved }: {
  scheduleId: string; employees: EmployeeLite[]; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [trainerId, setTrainerId] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!trainerId) { setError('Select a trainer'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/api/production/schedules/${scheduleId}/trainers`, { trainerId });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to assign trainer')); } finally { setSaving(false); }
  };

  return (
    <Modal title="Assign Trainer" onClose={onClose}>
      <select className="w-full px-3 py-2 border rounded-lg text-sm" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
        <option value="">Select Employee *</option>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
      </select>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Assign" />
    </Modal>
  );
}

function AddStudentsToScheduleModal({ scheduleId, courseName, onClose, setError, onSaved }: {
  scheduleId: string; courseName: string; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ enrolled: number; alreadyEnrolled: number; total: number } | null>(null);

  useEffect(() => {
    api.get('/api/production/students', { params: { pageSize: 500 } }).then((res) => {
      const list: Student[] = res.data.data;
      setStudents(list);
      setEnrolledIds(new Set(list.filter((s) => s.enrollments.some((en) => en.scheduleId === scheduleId)).map((s) => s.id)));
    }).catch(() => setStudents([]));
  }, [scheduleId]);

  const q = studentSearch.trim().toLowerCase();
  const filteredStudents = (q
    ? students.filter((s) => `${s.firstName} ${s.lastName} ${s.studentCode} ${s.phone}`.toLowerCase().includes(q))
    : students
  ).filter((s) => !enrolledIds.has(s.id));

  const toggle = (id: string) => {
    setStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllFiltered = () => {
    const ids = filteredStudents.map((s) => s.id);
    setStudentIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelection = () => setStudentIds([]);

  const submit = async () => {
    if (!studentIds.length) { setError('Select at least one student'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/production/enrollments/bulk', { studentIds, scheduleId });
      setResult(res.data.data);
    } catch (err) { setError(errMsg(err, 'Failed to add students')); } finally { setSaving(false); }
  };

  if (result) {
    return (
      <Modal title="Students Added" onClose={() => onSaved()}>
        <div className="space-y-2 text-sm">
          <p>{result.enrolled} student(s) added to {courseName}.</p>
          {result.alreadyEnrolled > 0 && <p className="text-muted-foreground">{result.alreadyEnrolled} were already enrolled and were skipped.</p>}
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={() => onSaved()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Add Students — ${courseName}`} onClose={onClose}>
      <div className="space-y-3">
        <input
          className="w-full px-3 py-2 border rounded-lg text-sm"
          placeholder="Search students by name or phone..."
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{studentIds.length} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={selectAllFiltered} className="underline">Select all shown</button>
            <button type="button" onClick={clearSelection} className="underline">Clear</button>
          </div>
        </div>

        <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
          {filteredStudents.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">No students found (already-enrolled students are hidden)</p>}
          {filteredStudents.map((s) => (
            <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/30 cursor-pointer">
              <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => toggle(s.id)} />
              {s.firstName} {s.lastName} ({s.studentCode}) · {s.phone}
            </label>
          ))}
        </div>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label={`Add ${studentIds.length || ''}`.trim()} />
    </Modal>
  );
}

function EditScheduleModal({ schedule, onClose, setError, onSaved }: {
  schedule: BatchCourseSchedule; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    timing: schedule.timing, dayPattern: schedule.dayPattern, mode: schedule.mode,
    startDate: schedule.startDate ? schedule.startDate.slice(0, 10) : '',
    endDate: schedule.endDate ? schedule.endDate.slice(0, 10) : '',
    capacity: schedule.capacity != null ? String(schedule.capacity) : '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/production/schedules/${schedule.id}`, form);
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to update sub-batch')); } finally { setSaving(false); }
  };

  return (
    <Modal title={`Edit Sub-Batch — ${schedule.course.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <select className="w-1/2 px-3 py-2 border rounded-lg text-sm" value={form.timing} onChange={(e) => setForm({ ...form, timing: e.target.value as BatchTiming })}>
            {TIMINGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="w-1/2 px-3 py-2 border rounded-lg text-sm" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as DeliveryMode })}>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.dayPattern} onChange={(e) => setForm({ ...form, dayPattern: e.target.value as DayPattern })}>
          {DAY_PATTERNS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} placeholder="Start date" />
          <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} placeholder="End date" />
        </div>
        <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Save" />
    </Modal>
  );
}

// ── STUDENTS TAB ─────────────────────────────────────────────────────────────
const PAGE_SIZE = 100;

function StudentsTab({ canEdit, setError, refresh, refreshKey, batches, onEnroll, onBulkEnroll }: {
  canEdit: boolean; setError: (s: string) => void; refresh: () => void; refreshKey: number;
  batches?: Batch[]; onEnroll: () => void; onBulkEnroll: () => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [trackFilter, setTrackFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');

  const [courseOptions, setCourseOptions] = useState<{ id: string; name: string }[]>([]);
  const [batchOptions, setBatchOptions] = useState<Batch[]>(batches || []);

  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);

  // Debounce phone search input.
  useEffect(() => {
    const t = setTimeout(() => setPhoneSearch(phoneInput.trim()), 350);
    return () => clearTimeout(t);
  }, [phoneInput]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => { setPage(1); }, [trackFilter, batchFilter, courseFilter, phoneSearch]);

  useEffect(() => {
    if (batches && batches.length) { setBatchOptions(batches); return; }
    api.get('/api/production/batches').then((res) => setBatchOptions(res.data.data)).catch(() => setBatchOptions([]));
  }, [batches]);

  useEffect(() => {
    api.get('/api/production/courses').then((res) => setCourseOptions(res.data.data.map((c: AcademyCourse) => ({ id: c.id, name: c.name })))).catch(() => setCourseOptions([]));
  }, []);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/production/students', {
        params: {
          page, pageSize: PAGE_SIZE,
          track: trackFilter || undefined,
          batchId: batchFilter || undefined,
          courseId: courseFilter || undefined,
          phone: phoneSearch || undefined,
        },
      });
      setStudents(res.data.data);
      setTotal(res.data.pagination?.total ?? res.data.data.length);
    } catch (err) {
      setError(errMsg(err, 'Failed to load students'));
    } finally {
      setLoading(false);
    }
  }, [page, trackFilter, batchFilter, courseFilter, phoneSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchStudents(); }, [fetchStudents, refreshKey]);

  const updateField = async (id: string, data: Record<string, string>) => {
    try { await api.put(`/api/production/students/${id}`, data); fetchStudents(); refresh(); }
    catch (err) { setError(errMsg(err, 'Failed to update student')); }
  };

  const updateEnrollment = async (id: string, status: EnrollmentStatus) => {
    try { await api.put(`/api/production/enrollments/${id}`, { status }); fetchStudents(); }
    catch (err) { setError(errMsg(err, 'Failed to update enrollment')); }
  };

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  // A "sub-batch" is a specific BatchCourseSchedule — only resolvable once
  // both a batch and a course are selected in the filter bar (matching the
  // same granularity KRAEntry uses for sub-batch). Track filter is optional
  // and, if set, narrows the push to just that track within the sub-batch.
  const selectedBatchObj = batchOptions.find((b) => b.id === batchFilter);
  const selectedSchedule = selectedBatchObj?.schedules.find((sc) => sc.courseId === courseFilter);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allVisibleSelected = students.length > 0 && students.every((s) => selectedIds.has(s.id));
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        students.forEach((s) => next.delete(s.id));
        return next;
      }
      const next = new Set(prev);
      students.forEach((s) => next.add(s.id));
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="Search by phone..."
              className="pl-8 pr-3 py-2 border rounded-lg text-sm w-48"
            />
          </div>
          <select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">All tracks</option>
            {TRACKS.map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}
          </select>
          <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">All batches</option>
            {batchOptions.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
          </select>
          <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">All courses</option>
            {courseOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBulkUpload(true)} className="text-xs px-3 py-2 border rounded-lg hover:bg-muted/50 flex items-center gap-1">
              <Upload className="w-3 h-3" /> Bulk Upload
            </button>
            <button onClick={onEnroll} className="text-xs px-3 py-2 border rounded-lg hover:bg-muted/50 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Enroll Student
            </button>
            <button onClick={onBulkEnroll} className="text-xs px-3 py-2 border rounded-lg hover:bg-muted/50 flex items-center gap-1">
              <UserPlus className="w-3 h-3" /> Bulk Enroll
            </button>
            {selectedSchedule && (
              <button
                onClick={() => setShowPush(true)}
                className="text-xs px-3 py-2 border rounded-lg hover:bg-indigo-50 border-indigo-300 text-indigo-700 flex items-center gap-1"
                title="Push this sub-batch into the Placements pool"
              >
                <ExternalLink className="w-3 h-3" /> Push Sub-batch to Placements
              </button>
            )}
            {selectedIds.size > 0 && (
              <button
                onClick={() => setShowBulkStatus(true)}
                className="text-xs px-3 py-2 border rounded-lg hover:bg-blue-50 border-blue-300 text-blue-700 flex items-center gap-1"
                title="Change status for all checked students"
              >
                <CheckCircle2 className="w-3 h-3" /> Change Status ({selectedIds.size})
              </button>
            )}
          </div>
        )}
      </div>

      {canEdit && students.length > 0 && !loading && (
        <div className="flex items-center gap-2 px-1">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} className="rounded" />
            Select all on this page
          </label>
          {selectedIds.size > 0 && (
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground underline">
              Clear selection ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : students.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No students found</div>
      ) : (
        students.map((s) => (
          <div key={s.id} className="bg-card border rounded-xl overflow-hidden">
            <div className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30">
              <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                {canEdit && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelected(s.id)}
                    className="rounded flex-shrink-0"
                  />
                )}
                {expanded === s.id ? <ChevronDown className="w-4 h-4 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                <div>
                  <p className="font-medium">{s.firstName} {s.lastName} <span className="text-xs text-muted-foreground">({s.studentCode})</span></p>
                  <p className="text-xs text-muted-foreground">{s.phone}{s.email ? ` · ${s.email}` : ''}</p>
                </div>
              </button>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{s.track}</span>
                {canEdit ? (
                  <select
                    value={s.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateField(s.id, { status: e.target.value })}
                    className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${STUDENT_STATUS_COLOR[s.status]}`}
                  >
                    {STUDENT_STATUSES.map((st) => <option key={st} value={st}>{STUDENT_STATUS_LABEL[st]}</option>)}
                  </select>
                ) : (
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${STUDENT_STATUS_COLOR[s.status]}`}>{STUDENT_STATUS_LABEL[s.status]}</span>
                )}
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditStudent(s); }}
                    className="p-1.5 rounded-lg hover:bg-muted"
                    title="Edit student"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {expanded === s.id && (
              <div className="border-t px-4 py-3 space-y-2 bg-muted/10">
                {canEdit && (
                  <div className="flex items-center gap-2 pb-1">
                    <label className="text-xs text-muted-foreground">Track:</label>
                    <select value={s.track} onChange={(e) => updateField(s.id, { track: e.target.value })} className="text-xs px-2 py-1 border rounded-lg">
                      {TRACKS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {s.movedToPlacementAt && (
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                        Moved to placement {new Date(s.movedToPlacementAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}
                {((s.trainerFeedbacks && s.trainerFeedbacks.length > 0) || (s.moduleFeedbacks && s.moduleFeedbacks.length > 0)) && (
                  <div className="space-y-2 pb-2">
                    {s.trainerFeedbacks && s.trainerFeedbacks.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Trainer Feedback &amp; Eligibility</p>
                        <div className="space-y-1.5">
                          {s.trainerFeedbacks.map((tf) => (
                            <div key={tf.id} className="text-sm bg-white border rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-medium">{tf.course.name}</span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {tf.performanceRating != null && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">Rating: {tf.performanceRating}/5</span>
                                  )}
                                  {tf.jrpToIopRecommended != null && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                      JRP→IOP: {tf.jrpToIopRecommended ? 'Recommended' : 'Not recommended'}
                                    </span>
                                  )}
                                  <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${tf.certificateEligible ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                    {tf.certificateEligible ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                    {tf.certificateEligible ? 'Certificate eligible' : 'Not certificate eligible'}
                                  </span>
                                </div>
                              </div>
                              {tf.placementReadinessNote && (
                                <p className="text-xs text-muted-foreground mt-1">{tf.placementReadinessNote}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {s.moduleFeedbacks && s.moduleFeedbacks.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Module Feedback</p>
                        <div className="space-y-1.5">
                          {s.moduleFeedbacks.map((mf) => (
                            <div key={mf.id} className="text-sm bg-white border rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{mf.module.title}</span>
                                {mf.rating != null && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{mf.rating}/5</span>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{mf.comments}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {s.enrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Not enrolled in any course schedule yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="py-1 pr-2">Batch</th><th className="py-1 pr-2">Course</th><th className="py-1 pr-2">Status</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {s.enrollments.map((en) => (
                        <tr key={en.id}>
                          <td className="py-1.5 pr-2">{en.schedule.batch.code}</td>
                          <td className="py-1.5 pr-2">{en.schedule.course.name}</td>
                          <td className="py-1.5 pr-2">
                            {canEdit ? (
                              <select value={en.status} onChange={(e) => updateEnrollment(en.id, e.target.value as EnrollmentStatus)} className="text-xs px-2 py-1 border rounded-lg">
                                {ENROLLMENT_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                              </select>
                            ) : en.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))
      )}

      {!loading && total > 0 && (
        <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
          <span>{total} student{total === 1 ? '' : 's'} · page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="flex items-center gap-1 px-2 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-muted/50"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="flex items-center gap-1 px-2 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-muted/50"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {editStudent && (
        <EditStudentModal
          student={editStudent}
          onClose={() => setEditStudent(null)}
          setError={setError}
          onSaved={() => { setEditStudent(null); fetchStudents(); refresh(); }}
        />
      )}
      {showBulkUpload && (
        <BulkUploadStudentsModal
          batches={batchOptions}
          courses={courseOptions}
          onClose={() => setShowBulkUpload(false)}
          setError={setError}
          onSaved={() => { fetchStudents(); refresh(); }}
        />
      )}
      {showPush && selectedSchedule && selectedBatchObj && (
        <PushToPlacementsModal
          scheduleId={selectedSchedule.id}
          batchCode={selectedBatchObj.code}
          courseName={selectedSchedule.course.name}
          track={trackFilter as StudentTrack | ''}
          estimatedCount={total}
          onClose={() => setShowPush(false)}
          setError={setError}
          onPushed={() => { setShowPush(false); fetchStudents(); refresh(); }}
        />
      )}
      {showBulkStatus && (
        <BulkStatusModal
          studentIds={Array.from(selectedIds)}
          onClose={() => setShowBulkStatus(false)}
          setError={setError}
          onApplied={() => { setShowBulkStatus(false); setSelectedIds(new Set()); fetchStudents(); refresh(); }}
        />
      )}
    </div>
  );
}

// General-purpose bulk status change for an explicit, checkbox-picked list of
// students (gathered while filtered to a sub-batch in the parent). Lets the
// PM update an entire batch (e.g. 70 students) in one action instead of
// editing each student's status individually.
function BulkStatusModal({ studentIds, onClose, setError, onApplied }: {
  studentIds: string[]; onClose: () => void; setError: (s: string) => void; onApplied: () => void;
}) {
  const [status, setStatus] = useState<StudentStatus>('ACTIVE');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ updated: number } | null>(null);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.put('/api/production/students/bulk-status', { studentIds, status });
      setResult({ updated: res.data.data.updated });
    } catch (err) {
      setError(errMsg(err, 'Failed to update student status'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Change Status — Bulk" onClose={onClose}>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{result.updated} student{result.updated === 1 ? '' : 's'} updated to {STUDENT_STATUS_LABEL[status]}.</p>
          </div>
          <div className="flex justify-end">
            <button onClick={onApplied} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Done</button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3 text-sm">
            <p>
              Set status to:
            </p>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StudentStatus)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              {STUDENT_STATUSES.map((st) => <option key={st} value={st}>{STUDENT_STATUS_LABEL[st]}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">
              This will apply to all {studentIds.length} checked student{studentIds.length === 1 ? '' : 's'}.
              {status === 'IN_PLACEMENT' && ' Their placement-clock start date will be recorded (preserved if already set), same as Push Sub-batch to Placements.'}
            </p>
          </div>
          <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label={`Apply to ${studentIds.length}`} />
        </>
      )}
    </Modal>
  );
}

// Sub-batch push confirmation — flag-only, no eligibility gate (PM's judgment
// call), no auto-created PlacementResult. Mirrors the write-once
// movedToPlacementAt pattern already used by updateStudent.
function PushToPlacementsModal({ scheduleId, batchCode, courseName, track, estimatedCount, onClose, setError, onPushed }: {
  scheduleId: string; batchCode: string; courseName: string; track: StudentTrack | '';
  estimatedCount: number; onClose: () => void; setError: (s: string) => void; onPushed: () => void;
}) {
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ pushed: number } | null>(null);

  const submit = async () => {
    setPushing(true);
    setError('');
    try {
      const res = await api.post('/api/production/students/push-to-placements', {
        scheduleId, track: track || undefined,
      });
      setResult({ pushed: res.data.data.pushed });
    } catch (err) {
      setError(errMsg(err, 'Failed to push sub-batch to Placements'));
    } finally {
      setPushing(false);
    }
  };

  return (
    <Modal title="Push Sub-batch to Placements" onClose={onClose}>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{result.pushed} student{result.pushed === 1 ? '' : 's'} pushed into the Placements pool.</p>
          </div>
          <div className="flex justify-end">
            <button onClick={onPushed} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Done</button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3 text-sm">
            <p>
              This pushes <span className="font-medium">{batchCode} · {courseName}</span>
              {track ? <> (<span className="font-medium">{track}</span> track only)</> : ' (all tracks)'} into the Placements pool.
            </p>
            <p className="text-muted-foreground">
              Students get flagged — status set to <span className="font-medium">In Placement Pool</span> and their placement-clock
              start date recorded (preserved if already set). No eligibility check is applied; this is your judgment call based on the
              trainer feedback shown above. No placement result is created automatically.
            </p>
            <p className="text-xs text-muted-foreground">~{estimatedCount} student{estimatedCount === 1 ? '' : 's'} currently match this filter (already-placed/transferred students are skipped automatically).</p>
          </div>
          <ModalFooter onClose={onClose} onSubmit={submit} saving={pushing} label="Push to Placements" />
        </>
      )}
    </Modal>
  );
}

function EditStudentModal({ student, onClose, setError, onSaved }: {
  student: Student; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    firstName: student.firstName, lastName: student.lastName, phone: student.phone,
    email: student.email || '', track: student.track, status: student.status,
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.firstName.trim() || !form.phone.trim()) { setError('First name and phone are required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/production/students/${student.id}`, { ...form, email: form.email || undefined });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to update student')); } finally { setSaving(false); }
  };

  return (
    <Modal title={`Edit ${student.firstName} ${student.lastName}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Student Code: <span className="font-medium text-foreground">{student.studentCode}</span> (not editable)</p>
        <div className="flex gap-2">
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="First Name *" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Last Name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Phone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <div className="flex gap-2">
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value as StudentTrack })}>
            {TRACKS.map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}
          </select>
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}>
            {STUDENT_STATUSES.map((st) => <option key={st} value={st}>{STUDENT_STATUS_LABEL[st]}</option>)}
          </select>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Save" />
    </Modal>
  );
}

type BulkRow = Record<string, string>;
type BulkResult = { row: number; status: 'created' | 'error'; message?: string; studentId?: string };

function BulkUploadStudentsModal({ batches, courses, onClose, setError, onSaved }: {
  batches: Batch[]; courses: { id: string; name: string }[];
  onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  const downloadTemplate = () => {
    const exampleCode = batches.flatMap((b) => b.schedules).find((s) => s.code)?.code || 'B15-UUGD-MOR';
    const ws = XLSX.utils.json_to_sheet([
      { studentCode: '', firstName: 'John', lastName: 'Doe', phone: '9876543210', email: 'john@example.com', track: 'JRP', subBatchCode: exampleCode, batch: '', course: '' },
      { studentCode: '', firstName: 'Jane', lastName: 'S', phone: '9876543211', email: 'jane@example.com', track: 'PAP', subBatchCode: '', batch: batches[0]?.code || 'Batch 1', course: courses[0]?.name || '' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'student_bulk_upload_template.xlsx');
  };

  const onFile = (file: File) => {
    setFileName(file.name);
    setResults(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<BulkRow>(sheet, { defval: '' });
        setRows(json);
      } catch {
        setError('Could not parse the file. Please use the template format.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const submit = async () => {
    if (!rows.length) { setError('Choose a file with student rows first'); return; }
    setUploading(true);
    setError('');
    try {
      const res = await api.post('/api/production/students/bulk', { students: rows });
      setResults(res.data.data.results);
      onSaved();
    } catch (err) { setError(errMsg(err, 'Bulk upload failed')); } finally { setUploading(false); }
  };

  const createdCount = results?.filter((r) => r.status === 'created').length ?? 0;
  const errorCount = results ? results.length - createdCount : 0;

  return (
    <Modal title="Bulk Upload Students" onClose={onClose}>
      <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
        <p className="text-xs text-muted-foreground">
          Upload an Excel/CSV file with columns: <code>studentCode, firstName, lastName, phone, email, track, subBatchCode, batch, course</code>.
          <b>Easiest mapping:</b> fill <code>subBatchCode</code> with the sub-batch's code (the purple chip on Batches &amp; Schedules,
          e.g. <code>B15-UUGD-MOR</code>) — then <code>batch</code>/<code>course</code> can stay empty. Leave <code>studentCode</code> blank
          to auto-generate. <code>track</code> is JRP, IOP, or PAP. Students with a real <code>email</code> receive their login credentials automatically.
        </p>
        <button onClick={downloadTemplate} className="text-xs px-3 py-2 border rounded-lg hover:bg-muted/50 flex items-center gap-1">
          <Download className="w-3 h-3" /> Download template
        </button>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          className="w-full text-sm border rounded-lg px-3 py-2"
        />
        {fileName && !results && (
          <p className="text-xs text-muted-foreground">{fileName} — {rows.length} row{rows.length === 1 ? '' : 's'} parsed.</p>
        )}
        {rows.length > 0 && !results && (
          <div className="border rounded-lg max-h-44 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 text-left sticky top-0">
                <tr>
                  {['Name', 'Phone', 'Email', 'Track', 'Sub-Batch / Batch'].map((h) => <th key={h} className="px-2 py-1 whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.slice(0, 10).map((r: any, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 whitespace-nowrap">{String(r.firstName || '')} {String(r.lastName || '')}</td>
                    <td className="px-2 py-1">{String(r.phone || '') || <span className="text-red-500">missing</span>}</td>
                    <td className="px-2 py-1">{String(r.email || '') || '—'}</td>
                    <td className="px-2 py-1">{String(r.track || 'JRP')}</td>
                    <td className="px-2 py-1 font-mono">{String(r.subBatchCode || r.subBatch || '') || [String(r.batch || r.batchCode || ''), String(r.course || '')].filter(Boolean).join(' / ') || '—'}</td>
                  </tr>
                ))}
                {rows.length > 10 && (
                  <tr><td colSpan={5} className="px-2 py-1 text-muted-foreground">…and {rows.length - 10} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {courses.length > 0 && (
          <p className="text-xs text-muted-foreground">Known courses: {courses.map((c) => c.name).join(', ')}</p>
        )}

        {results && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{createdCount} created, {errorCount} failed</p>
            <div className="border rounded-lg max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left">
                  <tr><th className="px-2 py-1">Row</th><th className="px-2 py-1">Status</th><th className="px-2 py-1">Message</th></tr>
                </thead>
                <tbody className="divide-y">
                  {results.map((r) => (
                    <tr key={r.row}>
                      <td className="px-2 py-1">{r.row}</td>
                      <td className={`px-2 py-1 ${r.status === 'created' ? 'text-green-700' : 'text-red-700'}`}>{r.status}</td>
                      <td className="px-2 py-1">{r.message || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={uploading} label={results ? 'Upload another' : 'Upload'} />
    </Modal>
  );
}

function AddStudentModal({ onClose, setError, onSaved }: { onClose: () => void; setError: (s: string) => void; onSaved: () => void }) {
  // Minimal intake: Production Manager only supplies studentCode, email, and the
  // batch/course schedule to enroll into right away. Everything else (name, phone,
  // address, photo, Aadhar, parents, etc.) is filled in by the student themselves
  // on first login via the complete-profile wizard.
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

  // Typing a sub-batch code auto-selects the matching batch + course
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
      <div className="space-y-3">
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
          The student will fill in their own name, phone, photo, and other details when they log in for the first time.
        </p>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Create" />
    </Modal>
  );
}

function EnrollStudentModal({ onClose, setError, onSaved }: {
  onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/api/production/batches').then((res) => setBatches(res.data.data)).catch(() => setBatches([])); }, []);
  useEffect(() => {
    api.get('/api/production/students', { params: { pageSize: 500 } }).then((res) => setStudents(res.data.data)).catch(() => setStudents([]));
  }, []);

  const schedules = batches.flatMap((b) => b.schedules.map((s) => ({ ...s, batchCode: b.code })));
  const q = studentSearch.trim().toLowerCase();
  const filteredStudents = q
    ? students.filter((s) => `${s.firstName} ${s.lastName} ${s.studentCode} ${s.phone}`.toLowerCase().includes(q))
    : students;

  const submit = async () => {
    if (!studentId || !scheduleId) { setError('Select a student and a schedule'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/production/enrollments', { studentId, scheduleId });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to enroll student')); } finally { setSaving(false); }
  };

  return (
    <Modal title="Enroll Student in Schedule" onClose={onClose}>
      <div className="space-y-3">
        <input
          className="w-full px-3 py-2 border rounded-lg text-sm"
          placeholder="Search student by name or phone..."
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
        />
        <select className="w-full px-3 py-2 border rounded-lg text-sm" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Select Student *</option>
          {filteredStudents.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.studentCode}) · {s.phone}</option>)}
        </select>
        <select className="w-full px-3 py-2 border rounded-lg text-sm" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
          <option value="">Select Batch / Course Schedule *</option>
          {schedules.map((s) => <option key={s.id} value={s.id}>{s.batchCode} — {s.course.name} ({s.timing})</option>)}
        </select>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Enroll" />
    </Modal>
  );
}

function BulkEnrollModal({ onClose, setError, onSaved }: {
  onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ enrolled: number; alreadyEnrolled: number; total: number } | null>(null);

  useEffect(() => { api.get('/api/production/batches').then((res) => setBatches(res.data.data)).catch(() => setBatches([])); }, []);
  useEffect(() => {
    api.get('/api/production/students', { params: { pageSize: 500 } }).then((res) => setStudents(res.data.data)).catch(() => setStudents([]));
  }, []);

  const schedules = batches.flatMap((b) => b.schedules.map((s) => ({ ...s, batchCode: b.code })));
  const q = studentSearch.trim().toLowerCase();
  const filteredStudents = q
    ? students.filter((s) => `${s.firstName} ${s.lastName} ${s.studentCode} ${s.phone}`.toLowerCase().includes(q))
    : students;

  const toggle = (id: string) => {
    setStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllFiltered = () => {
    const ids = filteredStudents.map((s) => s.id);
    setStudentIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelection = () => setStudentIds([]);

  const submit = async () => {
    if (!scheduleId) { setError('Select a batch / course schedule'); return; }
    if (!studentIds.length) { setError('Select at least one student'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/production/enrollments/bulk', { studentIds, scheduleId });
      setResult(res.data.data);
    } catch (err) { setError(errMsg(err, 'Failed to bulk enroll students')); } finally { setSaving(false); }
  };

  if (result) {
    return (
      <Modal title="Bulk Enroll Complete" onClose={() => { onSaved(); }}>
        <div className="space-y-2 text-sm">
          <p>{result.enrolled} student(s) enrolled.</p>
          {result.alreadyEnrolled > 0 && <p className="text-muted-foreground">{result.alreadyEnrolled} were already enrolled in this schedule and were skipped.</p>}
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={() => onSaved()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Bulk Enroll Students" onClose={onClose}>
      <div className="space-y-3">
        <select className="w-full px-3 py-2 border rounded-lg text-sm" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
          <option value="">Select Batch / Course Schedule *</option>
          {schedules.map((s) => <option key={s.id} value={s.id}>{s.batchCode} — {s.course.name} ({s.timing})</option>)}
        </select>

        <input
          className="w-full px-3 py-2 border rounded-lg text-sm"
          placeholder="Search students by name or phone..."
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{studentIds.length} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={selectAllFiltered} className="underline">Select all shown</button>
            <button type="button" onClick={clearSelection} className="underline">Clear</button>
          </div>
        </div>

        <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
          {filteredStudents.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">No students found</p>}
          {filteredStudents.map((s) => (
            <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/30 cursor-pointer">
              <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => toggle(s.id)} />
              {s.firstName} {s.lastName} ({s.studentCode}) · {s.phone}
            </label>
          ))}
        </div>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label={`Enroll ${studentIds.length || ''}`.trim()} />
    </Modal>
  );
}

// ── PORTFOLIO APPROVALS TAB ───────────────────────────────────────────────────
interface PortfolioRow {
  id: string;
  summary: string | null;
  education: { degree: string; institution: string; fieldOfStudy: string; year: string; grade: string }[] | null;
  skills: { name: string; level: string }[] | null;
  projects: { title: string; description: string; link: string; techStack: string }[] | null;
  experience: { company: string; role: string; duration: string; description: string }[] | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  publicSlug: string | null;
  reviewNote: string | null;
  submittedAt?: string;
  student: { id: string; firstName: string; lastName: string; studentCode: string; track: StudentTrack };
}

function PortfoliosTab({ canEdit, setError }: { canEdit: boolean; setError: (s: string) => void }) {
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PortfolioRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/production/portfolios/pending')
      .then((r) => setRows(r.data.data || []))
      .catch((err) => setError(errMsg(err, 'Failed to load portfolio approvals')))
      .finally(() => setLoading(false));
  }, [setError]);

  useEffect(load, [load]);

  const approve = async (row: PortfolioRow) => {
    setBusyId(row.id);
    try {
      await api.post(`/api/production/portfolios/${row.id}/approve`);
      load();
    } catch (err) {
      setError(errMsg(err, 'Failed to approve portfolio'));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (note: string) => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await api.post(`/api/production/portfolios/${rejecting.id}/reject`, { note });
      setRejecting(null);
      load();
    } catch (err) {
      setError(errMsg(err, 'Failed to reject portfolio'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Pending Portfolio Approvals</h2>
        <p className="text-sm text-muted-foreground">Students who have submitted their portfolio and are waiting for review. Approving generates a public link and QR code for the student.</p>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-xl p-6 text-center">No pending portfolio submissions.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const isExpanded = expanded === row.id;
            const isBusy = busyId === row.id;
            return (
              <div key={row.id} className="border rounded-xl bg-white">
                <div className="flex items-center justify-between px-4 py-3">
                  <button onClick={() => setExpanded(isExpanded ? null : row.id)} className="flex items-center gap-2 text-left">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <div>
                      <div className="text-sm font-medium">{row.student.firstName} {row.student.lastName} <span className="text-xs text-muted-foreground">({row.student.studentCode})</span></div>
                      <div className="text-xs text-muted-foreground">{TRACK_LABEL[row.student.track]}</div>
                    </div>
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRejecting(row)}
                        disabled={isBusy}
                        className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                      <button
                        onClick={() => approve(row)}
                        disabled={isBusy}
                        className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> {isBusy ? 'Working...' : 'Approve'}
                      </button>
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
                    {row.summary && <p className="text-sm">{row.summary}</p>}
                    {!!row.skills?.length && (
                      <PortfolioPreviewSection title="Skills">
                        <div className="flex flex-wrap gap-2">
                          {row.skills.map((s, i) => (
                            <span key={i} className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-1">{s.name}{s.level ? ` · ${s.level}` : ''}</span>
                          ))}
                        </div>
                      </PortfolioPreviewSection>
                    )}
                    {!!row.projects?.length && (
                      <PortfolioPreviewSection title="Projects">
                        <ul className="text-sm space-y-1 list-disc pl-4">
                          {row.projects.map((p, i) => <li key={i}>{p.title}{p.techStack ? ` — ${p.techStack}` : ''}</li>)}
                        </ul>
                      </PortfolioPreviewSection>
                    )}
                    {!!row.experience?.length && (
                      <PortfolioPreviewSection title="Experience">
                        <ul className="text-sm space-y-1 list-disc pl-4">
                          {row.experience.map((e, i) => <li key={i}>{e.role} {e.company && `· ${e.company}`}</li>)}
                        </ul>
                      </PortfolioPreviewSection>
                    )}
                    {!!row.education?.length && (
                      <PortfolioPreviewSection title="Education">
                        <ul className="text-sm space-y-1 list-disc pl-4">
                          {row.education.map((ed, i) => <li key={i}>{ed.degree} — {ed.institution}</li>)}
                        </ul>
                      </PortfolioPreviewSection>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rejecting && (
        <RejectPortfolioModal
          studentName={`${rejecting.student.firstName} ${rejecting.student.lastName}`}
          saving={busyId === rejecting.id}
          onClose={() => setRejecting(null)}
          onSubmit={reject}
        />
      )}
    </div>
  );
}

function PortfolioPreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{title}</div>
      {children}
    </div>
  );
}

function RejectPortfolioModal({ studentName, saving, onClose, onSubmit }: {
  studentName: string; saving: boolean; onClose: () => void; onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Modal title={`Reject ${studentName}'s Portfolio`} onClose={onClose}>
      <div className="space-y-2">
        <label className="text-sm font-medium">Note for the student (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Let them know what to fix before resubmitting"
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <ModalFooter onClose={onClose} onSubmit={() => onSubmit(note)} saving={saving} label="Reject" />
    </Modal>
  );
}

// ── SHARED MODAL CHROME ──────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 space-y-4 max-h-[90vh] overflow-y-auto`}>
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

// ── CONTENT TAB (Projects / Feedback Forms / Online Tests) ──────────────────
type ContentSubTab = 'projects' | 'feedback' | 'tests';

function ContentTab({ courses, canEdit, setError }: {
  courses: AcademyCourse[]; canEdit: boolean; setError: (s: string) => void;
}) {
  const [subTab, setSubTab] = useState<ContentSubTab>('projects');
  const modules = flattenModules(courses);

  const SUB_TABS: { id: ContentSubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'projects', label: 'Projects', icon: FileText },
    { id: 'feedback', label: 'Feedback Forms', icon: ClipboardList },
    { id: 'tests', label: 'Online Tests', icon: ListChecks },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                subTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {modules.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Add a course with modules first.</p>
      ) : subTab === 'projects' ? (
        <ProjectsPanel modules={modules} canEdit={canEdit} setError={setError} />
      ) : subTab === 'feedback' ? (
        <FeedbackFormsPanel modules={modules} canEdit={canEdit} setError={setError} />
      ) : (
        <OnlineTestsPanel modules={modules} canEdit={canEdit} setError={setError} />
      )}
    </div>
  );
}

// ── PROJECTS ─────────────────────────────────────────────────────────────────
function ProjectsPanel({ modules, canEdit, setError }: {
  modules: (ModuleLite & { courseName: string })[]; canEdit: boolean; setError: (s: string) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    api.get('/api/production/projects').then((res) => setProjects(res.data.data)).catch(() => setProjects([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Project
          </button>
        )}
      </div>
      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No projects yet.</div>
      ) : (
        <div className="border rounded-lg divide-y">
          {projects.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-sm">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {p.module.title} · {p._count?.releases ?? 0} release{(p._count?.releases ?? 0) === 1 ? '' : 's'}
                </p>
              </div>
              <a href={p.resourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" /> Resource
              </a>
            </div>
          ))}
        </div>
      )}
      {showAdd && (
        <AddProjectModal modules={modules} onClose={() => setShowAdd(false)} setError={setError} onSaved={() => { setShowAdd(false); refresh(); }} />
      )}
    </div>
  );
}

function AddProjectModal({ modules, onClose, setError, onSaved }: {
  modules: (ModuleLite & { courseName: string })[]; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [moduleId, setModuleId] = useState(modules[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!moduleId || !title.trim() || !file) { setError('Module, title, and PDF resource are required'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('moduleId', moduleId);
      fd.append('title', title.trim());
      if (description.trim()) fd.append('description', description.trim());
      fd.append('resource', file);
      await api.post('/api/production/projects', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Could not create project')); } finally { setSaving(false); }
  };

  return (
    <Modal title="New Project" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Module</label>
          <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
            {modules.map((m) => <option key={m.id} value={m.id}>{m.courseName} — {m.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Resource PDF</label>
          <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full mt-1 text-sm border rounded-lg px-3 py-2" />
        </div>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Create" />
    </Modal>
  );
}

// ── FEEDBACK FORMS ───────────────────────────────────────────────────────────
function FeedbackFormsPanel({ modules, canEdit, setError }: {
  modules: (ModuleLite & { courseName: string })[]; canEdit: boolean; setError: (s: string) => void;
}) {
  const [innerTab, setInnerTab] = useState<'templates' | 'responses'>('templates');
  const [forms, setForms] = useState<FeedbackForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FeedbackForm | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    api.get('/api/production/feedback-forms').then((res) => setForms(res.data.data)).catch(() => setForms([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1 w-fit">
          <button
            onClick={() => setInnerTab('templates')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${innerTab === 'templates' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Templates
          </button>
          <button
            onClick={() => setInnerTab('responses')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${innerTab === 'responses' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Lock className="w-3 h-3" /> Responses
          </button>
        </div>
        {innerTab === 'templates' && canEdit && (
          <button onClick={() => { setEditing(null); setShowBuilder(true); }} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Feedback Form
          </button>
        )}
      </div>

      {innerTab === 'responses' ? (
        <FeedbackResponsesPanel />
      ) : loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : forms.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No feedback forms yet.</div>
      ) : (
        <div className="border rounded-lg divide-y">
          {forms.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-sm">{f.title}</p>
                <p className="text-xs text-muted-foreground">
                  {f.module.title} · {f.questions.length} question{f.questions.length === 1 ? '' : 's'} · {f._count?.releases ?? 0} release{(f._count?.releases ?? 0) === 1 ? '' : 's'}
                </p>
              </div>
              {canEdit && (
                <button onClick={() => { setEditing(f); setShowBuilder(true); }} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {showBuilder && (
        <FeedbackFormBuilderModal
          modules={modules}
          existing={editing}
          onClose={() => setShowBuilder(false)}
          setError={setError}
          onSaved={() => { setShowBuilder(false); refresh(); }}
        />
      )}
    </div>
  );
}

// ── FEEDBACK RESPONSES (Production-Manager-only read surface) ───────────────
type FeedbackReleaseSummary = {
  id: string; status: 'ACTIVE' | 'CLOSED'; releasedAt: string;
  form: { id: string; title: string; module: { id: string; title: string } };
  schedule: { id: string; batch: { id: string; code: string }; course: { id: string; name: string } };
  releasedBy: { firstName: string; lastName: string };
  _count: { responses: number };
};
type FeedbackAnswerRow = { questionId: string; ratingValue?: number | null; textValue?: string | null; optionValue?: string | null };
type FeedbackResponseRow = { id: string; student: { id: string; studentCode: string; firstName: string; lastName: string }; submittedAt: string; answers: FeedbackAnswerRow[] };
type FeedbackQuestionLite = { id: string; order: number; type: 'RATING' | 'TEXT' | 'MCQ'; prompt: string };

function FeedbackResponsesPanel() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [releases, setReleases] = useState<FeedbackReleaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchId, setBatchId] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'CLOSED'>('');
  const [drill, setDrill] = useState<{ releaseId: string; title: string } | null>(null);

  useEffect(() => { api.get('/api/production/batches').then((res) => setBatches(res.data.data)).catch(() => setBatches([])); }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (batchId) params.batchId = batchId;
    if (status) params.status = status;
    api.get('/api/production/feedback-releases', { params }).then((res) => setReleases(res.data.data)).catch(() => setReleases([])).finally(() => setLoading(false));
  }, [batchId, status]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2 flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 flex-shrink-0" /> Only the Production Manager can read feedback responses — Trainers cannot view what students submit.
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All sub-batches</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>
      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : releases.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No feedback forms have been released yet.</div>
      ) : (
        <div className="border rounded-lg divide-y">
          {releases.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-sm">{r.form.title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.schedule.batch.code} · {r.schedule.course.name} · {r.form.module.title} · {r._count.responses} response{r._count.responses === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>{r.status}</span>
                <button onClick={() => setDrill({ releaseId: r.id, title: r.form.title })} className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted">View responses</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {drill && (
        <FeedbackResponsesModal releaseId={drill.releaseId} title={drill.title} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}

function FeedbackResponsesModal({ releaseId, title, onClose }: { releaseId: string; title: string; onClose: () => void }) {
  const [questions, setQuestions] = useState<FeedbackQuestionLite[]>([]);
  const [responses, setResponses] = useState<FeedbackResponseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/production/feedback-releases/${releaseId}/responses`)
      .then((res) => {
        setQuestions(res.data.data?.release?.form?.questions || []);
        setResponses(res.data.data?.responses || []);
      })
      .finally(() => setLoading(false));
  }, [releaseId]);

  const answerFor = (resp: FeedbackResponseRow, qid: string) => resp.answers.find((a) => a.questionId === qid);

  return (
    <Modal title={`Responses — ${title}`} onClose={onClose}>
      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : responses.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No responses submitted yet.</p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {responses.map((r) => (
            <div key={r.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{r.student.firstName} {r.student.lastName} <span className="text-xs text-muted-foreground font-normal">({r.student.studentCode})</span></p>
                <span className="text-xs text-muted-foreground">{new Date(r.submittedAt).toLocaleString()}</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {questions.map((q) => {
                  const a = answerFor(r, q.id);
                  return (
                    <div key={q.id} className="text-xs">
                      <span className="text-muted-foreground">{q.prompt}: </span>
                      <span className="font-medium">{a?.ratingValue ?? a?.optionValue ?? a?.textValue ?? '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function FeedbackFormBuilderModal({ modules, existing, onClose, setError, onSaved }: {
  modules: (ModuleLite & { courseName: string })[]; existing: FeedbackForm | null;
  onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [moduleId, setModuleId] = useState(existing?.moduleId || modules[0]?.id || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [questions, setQuestions] = useState<FeedbackFormQuestion[]>(
    existing && existing.questions.length
      ? existing.questions.map((q) => ({ ...q }))
      : [{ order: 1, type: 'RATING', prompt: '', required: true }]
  );
  const [saving, setSaving] = useState(false);

  const addQuestion = () => setQuestions((qs) => [...qs, { order: qs.length + 1, type: 'RATING', prompt: '', required: true }]);
  const removeQuestion = (idx: number) => setQuestions((qs) => qs.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order: i + 1 })));
  const updateQuestion = (idx: number, patch: Partial<FeedbackFormQuestion>) =>
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  const moveQuestion = (idx: number, dir: -1 | 1) => {
    setQuestions((qs) => {
      const target = idx + dir;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((q, i) => ({ ...q, order: i + 1 }));
    });
  };
  const updateOption = (qIdx: number, oIdx: number, value: string) =>
    setQuestions((qs) => qs.map((q, i) => {
      if (i !== qIdx) return q;
      const options = [...(q.options || [])];
      options[oIdx] = value;
      return { ...q, options };
    }));
  const addOption = (qIdx: number) =>
    setQuestions((qs) => qs.map((q, i) => (i === qIdx ? { ...q, options: [...(q.options || []), ''] } : q)));
  const removeOption = (qIdx: number, oIdx: number) =>
    setQuestions((qs) => qs.map((q, i) => (i === qIdx ? { ...q, options: (q.options || []).filter((_, j) => j !== oIdx) } : q)));

  const submit = async () => {
    if (!moduleId || !title.trim()) { setError('Module and title are required'); return; }
    if (!questions.length || questions.some((q) => !q.prompt.trim())) { setError('Every question needs a prompt'); return; }
    for (const q of questions) {
      if (q.type === 'MCQ' && (!q.options || q.options.filter((o) => o.trim()).length < 2)) {
        setError('Multiple choice questions need at least 2 options');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/production/feedback-forms', {
        moduleId, title: title.trim(),
        questions: questions.map((q, i) => ({
          order: i + 1, type: q.type, prompt: q.prompt.trim(),
          options: q.type === 'MCQ' ? (q.options || []).filter((o) => o.trim()) : undefined,
          required: q.required,
        })),
      });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Could not save feedback form')); } finally { setSaving(false); }
  };

  return (
    <Modal title={existing ? 'Edit Feedback Form' : 'New Feedback Form'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Module</label>
            <select
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              disabled={!!existing}
              className="w-full mt-1 border rounded-lg px-3 py-2 text-sm disabled:bg-muted/40"
            >
              {modules.map((m) => <option key={m.id} value={m.id}>{m.courseName} — {m.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
          {questions.map((q, idx) => {
            const TypeIconComp = FEEDBACK_TYPES.find((t) => t.value === q.type)?.icon || Star;
            return (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <TypeIconComp className="w-3 h-3" /> Question {idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0} className="px-1.5 py-0.5 text-xs disabled:opacity-30">↑</button>
                    <button onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1} className="px-1.5 py-0.5 text-xs disabled:opacity-30">↓</button>
                    <button onClick={() => removeQuestion(idx)} disabled={questions.length === 1} className="p-1 text-red-600 disabled:opacity-30"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={q.type}
                    onChange={(e) => updateQuestion(idx, { type: e.target.value as FeedbackQuestionType, options: e.target.value === 'MCQ' ? ['', ''] : undefined })}
                    className="border rounded-lg px-2 py-1.5 text-xs"
                  >
                    {FEEDBACK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input
                    value={q.prompt}
                    onChange={(e) => updateQuestion(idx, { prompt: e.target.value })}
                    placeholder="Question prompt"
                    className="col-span-2 border rounded-lg px-2 py-1.5 text-xs"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(idx, { required: e.target.checked })} /> Required
                </label>
                {q.type === 'MCQ' && (
                  <div className="space-y-1.5 pl-1">
                    {(q.options || []).map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-1.5">
                        <input
                          value={opt}
                          onChange={(e) => updateOption(idx, oIdx, e.target.value)}
                          placeholder={`Option ${oIdx + 1}`}
                          className="flex-1 border rounded-lg px-2 py-1 text-xs"
                        />
                        <button onClick={() => removeOption(idx, oIdx)} disabled={(q.options || []).length <= 2} className="p-1 text-red-600 disabled:opacity-30">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => addOption(idx)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add option
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={addQuestion} className="w-full text-sm px-3 py-2 border rounded-lg hover:bg-muted/50 flex items-center justify-center gap-1">
          <Plus className="w-4 h-4" /> Add question
        </button>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label={existing ? 'Save' : 'Create'} />
    </Modal>
  );
}

// ── ONLINE TESTS ─────────────────────────────────────────────────────────────
function OnlineTestsPanel({ modules, canEdit, setError }: {
  modules: (ModuleLite & { courseName: string })[]; canEdit: boolean; setError: (s: string) => void;
}) {
  const [tests, setTests] = useState<OnlineTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    api.get('/api/production/online-tests').then((res) => setTests(res.data.data)).catch(() => setTests([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Online Test
          </button>
        )}
      </div>
      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : tests.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No online tests yet.</div>
      ) : (
        <div className="border rounded-lg divide-y">
          {tests.map((t) => (
            <button key={t.id} onClick={() => setDetailId(t.id)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30">
              <div>
                <p className="font-medium text-sm">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t.module.title} · {t.durationMinutes} min · {t._count?.questions ?? 0} question{(t._count?.questions ?? 0) === 1 ? '' : 's'} · {t._count?.releases ?? 0} release{(t._count?.releases ?? 0) === 1 ? '' : 's'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
      {showAdd && (
        <AddOnlineTestModal
          modules={modules}
          onClose={() => setShowAdd(false)}
          setError={setError}
          onSaved={(id) => { setShowAdd(false); refresh(); setDetailId(id); }}
        />
      )}
      {detailId && (
        <OnlineTestDetailModal testId={detailId} canEdit={canEdit} onClose={() => { setDetailId(null); refresh(); }} setError={setError} />
      )}
    </div>
  );
}

function AddOnlineTestModal({ modules, onClose, setError, onSaved }: {
  modules: (ModuleLite & { courseName: string })[]; onClose: () => void; setError: (s: string) => void; onSaved: (id: string) => void;
}) {
  const [moduleId, setModuleId] = useState(modules[0]?.id || '');
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!moduleId || !title.trim()) { setError('Module and title are required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/production/online-tests', { moduleId, title: title.trim(), durationMinutes });
      onSaved(res.data.data.id);
    } catch (err) { setError(errMsg(err, 'Could not create test')); } finally { setSaving(false); }
  };

  return (
    <Modal title="New Online Test" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Module</label>
          <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
            {modules.map((m) => <option key={m.id} value={m.id}>{m.courseName} — {m.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Duration (minutes)</label>
          <input
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value) || 45)}
            className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Create" />
    </Modal>
  );
}

function OnlineTestDetailModal({ testId, canEdit, onClose, setError }: {
  testId: string; canEdit: boolean; onClose: () => void; setError: (s: string) => void;
}) {
  const [test, setTest] = useState<OnlineTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddQ, setShowAddQ] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    api.get(`/api/production/online-tests/${testId}`).then((res) => setTest(res.data.data)).catch(() => setTest(null)).finally(() => setLoading(false));
  }, [testId]);

  useEffect(() => { refresh(); }, [refresh]);

  const deleteQuestion = async (qId: string) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await api.delete(`/api/production/online-tests/${testId}/questions/${qId}`);
      refresh();
    } catch (err) { setError(errMsg(err, 'Could not delete question')); }
  };

  return (
    <>
      <Modal title={test ? test.title : 'Online Test'} onClose={onClose} wide>
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : !test ? (
          <p className="text-sm text-muted-foreground">Could not load test.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {test.module.title} · {test.durationMinutes} min duration · {test.questions?.length ?? 0} question{(test.questions?.length ?? 0) === 1 ? '' : 's'}
            </p>

            {canEdit && (
              <div className="flex gap-2">
                <button onClick={() => setShowAddQ(true)} className="flex items-center gap-1.5 text-xs px-3 py-2 border rounded-lg hover:bg-muted/50">
                  <Plus className="w-3 h-3" /> Add question
                </button>
                <button onClick={() => setShowBulk(true)} className="flex items-center gap-1.5 text-xs px-3 py-2 border rounded-lg hover:bg-muted/50">
                  <Upload className="w-3 h-3" /> Bulk upload
                </button>
              </div>
            )}

            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {(test.questions || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No questions yet.</p>
              ) : (
                (test.questions || []).map((q, i) => (
                  <div key={q.id} className="border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">
                        {i + 1}. {q.prompt} <span className="text-xs text-muted-foreground">({q.marks} mark{q.marks === 1 ? '' : 's'})</span>
                      </p>
                      {canEdit && (
                        <button onClick={() => deleteQuestion(q.id)} className="text-red-600 p-1"><Trash2 className="w-3 h-3" /></button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {q.options.map((opt, oIdx) => (
                        <span key={oIdx} className={`px-2 py-1 rounded ${oIdx === q.correctIndex ? 'bg-green-100 text-green-700' : 'bg-muted/40'}`}>{opt}</span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>
      {showAddQ && (
        <AddQuestionModal testId={testId} onClose={() => setShowAddQ(false)} setError={setError} onSaved={() => { setShowAddQ(false); refresh(); }} />
      )}
      {showBulk && (
        <BulkUploadQuestionsModal testId={testId} onClose={() => setShowBulk(false)} setError={setError} onSaved={() => { setShowBulk(false); refresh(); }} />
      )}
    </>
  );
}

function AddQuestionModal({ testId, onClose, setError, onSaved }: {
  testId: string; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [marks, setMarks] = useState(1);
  const [saving, setSaving] = useState(false);

  const updateOption = (idx: number, value: string) => setOptions((opts) => opts.map((o, i) => (i === idx ? value : o)));

  const submit = async () => {
    const filled = options.filter((o) => o.trim());
    if (!prompt.trim() || filled.length < 2) { setError('Prompt and at least 2 options are required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/api/production/online-tests/${testId}/questions`, {
        prompt: prompt.trim(), options: options.map((o) => o.trim()).filter(Boolean), correctIndex, marks,
      });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Could not add question')); } finally { setSaving(false); }
  };

  return (
    <Modal title="Add Question" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Question prompt</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="space-y-2">
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={correctIndex === idx} onChange={() => setCorrectIndex(idx)} />
              <input
                value={opt}
                onChange={(e) => updateOption(idx, e.target.value)}
                placeholder={`Option ${idx + 1}`}
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Select the radio button next to the correct option.</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Marks</label>
          <input type="number" min={1} value={marks} onChange={(e) => setMarks(Number(e.target.value) || 1)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Add" />
    </Modal>
  );
}

type QuestionBulkRow = {
  prompt?: string; question?: string;
  option1?: string; option2?: string; option3?: string; option4?: string;
  optionA?: string; optionB?: string; optionC?: string; optionD?: string;
  correctOption?: string | number; correctAnswer?: string | number; correct?: string | number;
  marks?: string | number;
};
type QuestionBulkResult = { row: number; status: 'created' | 'failed'; message?: string };

function BulkUploadQuestionsModal({ testId, onClose, setError, onSaved }: {
  testId: string; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<QuestionBulkRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<QuestionBulkResult[] | null>(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { prompt: 'What is 2 + 2?', option1: '3', option2: '4', option3: '5', option4: '6', correctOption: 2, marks: 1 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    XLSX.writeFile(wb, 'online_test_questions_template.xlsx');
  };

  const onFile = (file: File) => {
    setFileName(file.name);
    setResults(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<QuestionBulkRow>(sheet, { defval: '' });
        setRows(json);
      } catch {
        setError('Could not parse the file. Please use the template format.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const submit = async () => {
    if (!rows.length) { setError('Choose a file with question rows first'); return; }
    setUploading(true);
    setError('');
    try {
      const res = await api.post(`/api/production/online-tests/${testId}/questions/bulk`, { questions: rows });
      setResults(res.data.data.results);
      onSaved();
    } catch (err) { setError(errMsg(err, 'Bulk upload failed')); } finally { setUploading(false); }
  };

  const createdCount = results?.filter((r) => r.status === 'created').length ?? 0;
  const errorCount = results ? results.length - createdCount : 0;

  return (
    <Modal title="Bulk Upload Questions" onClose={onClose}>
      <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
        <p className="text-xs text-muted-foreground">
          Upload an Excel/CSV file with columns: <code>prompt, option1, option2, option3, option4, correctOption, marks</code>.
          <code>correctOption</code> is 1-indexed (1 = option1). <code>marks</code> defaults to 1 if left blank.
        </p>
        <button onClick={downloadTemplate} className="text-xs px-3 py-2 border rounded-lg hover:bg-muted/50 flex items-center gap-1">
          <Download className="w-3 h-3" /> Download template
        </button>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          className="w-full text-sm border rounded-lg px-3 py-2"
        />
        {fileName && !results && (
          <p className="text-xs text-muted-foreground">{fileName} — {rows.length} row{rows.length === 1 ? '' : 's'} parsed.</p>
        )}
        {results && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{createdCount} created, {errorCount} failed</p>
            <div className="border rounded-lg max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left">
                  <tr><th className="px-2 py-1">Row</th><th className="px-2 py-1">Status</th><th className="px-2 py-1">Message</th></tr>
                </thead>
                <tbody className="divide-y">
                  {results.map((r) => (
                    <tr key={r.row}>
                      <td className="px-2 py-1">{r.row}</td>
                      <td className={`px-2 py-1 ${r.status === 'created' ? 'text-green-700' : 'text-red-700'}`}>{r.status}</td>
                      <td className="px-2 py-1">{r.message || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={uploading} label={results ? 'Upload another' : 'Upload'} />
    </Modal>
  );
}

// ── REPORTS ────────────────────────────────────────────────────────────────

type ReportsSubTab = 'trainer' | 'batches' | 'attendance' | 'students' | 'kra' | 'recipients';

function ReportsTab({ canEdit, setError }: { canEdit: boolean; setError: (s: string) => void }) {
  const [subTab, setSubTab] = useState<ReportsSubTab>('trainer');

  const SUB_TABS: { id: ReportsSubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'trainer', label: 'Trainer Report', icon: BarChart3 },
    { id: 'batches', label: 'Batch / Sub-batch', icon: CalendarRange },
    { id: 'attendance', label: 'Attendance', icon: ClipboardList },
    { id: 'students', label: 'Student (A–Z)', icon: GraduationCap },
    { id: 'kra', label: 'Daily KRA', icon: NotebookPen },
    { id: 'recipients', label: 'Email Recipients', icon: Mail },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b overflow-x-auto">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                subTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {subTab === 'trainer' ? (
        <TrainerReportPanel setError={setError} />
      ) : subTab === 'batches' ? (
        <BatchReportPanel setError={setError} />
      ) : subTab === 'attendance' ? (
        <AttendanceReportPanel setError={setError} />
      ) : subTab === 'students' ? (
        <StudentReportPanel setError={setError} />
      ) : subTab === 'kra' ? (
        <KraReportPanel setError={setError} />
      ) : (
        <RecipientsPanel canEdit={canEdit} setError={setError} />
      )}
    </div>
  );
}

function DateRangeBar({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-muted-foreground">From</label>
      <input type="date" value={from} onChange={(e) => onChange(e.target.value, to)} className="border rounded-lg px-2 py-1" />
      <label className="text-muted-foreground">To</label>
      <input type="date" value={to} onChange={(e) => onChange(from, e.target.value)} className="border rounded-lg px-2 py-1" />
    </div>
  );
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

/** Date range picker with a "Single date" toggle — wraps DateRangeBar so reports that want to
 *  filter by exactly one day don't force the user to set From/To to the same value manually. */
function DateFilterBar({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [single, setSingle] = useState(from === to);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
        <input
          type="checkbox"
          checked={single}
          onChange={(e) => { setSingle(e.target.checked); if (e.target.checked) onChange(from, from); }}
        />
        Single date
      </label>
      {single ? (
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground">Date</label>
          <input type="date" value={from} onChange={(e) => onChange(e.target.value, e.target.value)} className="border rounded-lg px-2 py-1" />
        </div>
      ) : (
        <DateRangeBar from={from} to={to} onChange={onChange} />
      )}
    </div>
  );
}

/** Generic "export current rows to an .xlsx file" helper, reusing the same `xlsx` package
 *  already used elsewhere in this page for bulk-upload templates. */
function exportRowsToExcel(filename: string, rows: Record<string, unknown>[], sheetName = 'Report') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

interface ReportFilters { batchId: string; courseId: string; track: string; trainerId: string; }
const EMPTY_REPORT_FILTERS: ReportFilters = { batchId: '', courseId: '', track: '', trainerId: '' };

/** Shared Batch / Course / Track (/ Trainer) filter row reused across report panels. Options are
 *  loaded once from the same list endpoints the Batches & Courses tabs use. The trainer dropdown
 *  is opt-in via `showTrainer` since not every report needs it. */
function ReportFilterBar({ filters, onChange, showTrainer }: { filters: ReportFilters; onChange: (f: ReportFilters) => void; showTrainer?: boolean }) {
  const [batchOptions, setBatchOptions] = useState<{ id: string; code: string }[]>([]);
  const [courseOptions, setCourseOptions] = useState<{ id: string; name: string }[]>([]);
  const [trainerOptions, setTrainerOptions] = useState<{ id: string; firstName: string; lastName: string; employeeCode: string }[]>([]);

  useEffect(() => {
    api.get('/api/production/batches').then((res) => setBatchOptions(res.data.data.map((b: { id: string; code: string }) => ({ id: b.id, code: b.code })))).catch(() => setBatchOptions([]));
    api.get('/api/production/courses').then((res) => setCourseOptions(res.data.data.map((c: AcademyCourse) => ({ id: c.id, name: c.name })))).catch(() => setCourseOptions([]));
  }, []);

  useEffect(() => {
    if (!showTrainer) return;
    api.get('/api/employees', { params: { limit: 500 } })
      .then((res) => {
        const all: EmployeeLite[] = res.data.data;
        const productionOnly = all.filter(
          (e) => e.department?.name?.toLowerCase().includes('production') && e.status !== 'TERMINATED' && e.status !== 'RESIGNED'
        );
        setTrainerOptions(productionOnly.map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName, employeeCode: e.employeeCode || '' })));
      })
      .catch(() => setTrainerOptions([]));
  }, [showTrainer]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        value={filters.batchId}
        onChange={(e) => onChange({ ...filters, batchId: e.target.value })}
        className="border rounded-lg px-2 py-1"
      >
        <option value="">All batches</option>
        {batchOptions.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
      </select>
      <select
        value={filters.courseId}
        onChange={(e) => onChange({ ...filters, courseId: e.target.value })}
        className="border rounded-lg px-2 py-1"
      >
        <option value="">All courses</option>
        {courseOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select
        value={filters.track}
        onChange={(e) => onChange({ ...filters, track: e.target.value })}
        className="border rounded-lg px-2 py-1"
      >
        <option value="">All tracks</option>
        {TRACKS.map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}
      </select>
      {showTrainer && (
        <select
          value={filters.trainerId}
          onChange={(e) => onChange({ ...filters, trainerId: e.target.value })}
          className="border rounded-lg px-2 py-1"
        >
          <option value="">All trainers</option>
          {trainerOptions.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName} ({t.employeeCode})</option>)}
        </select>
      )}
      {(filters.batchId || filters.courseId || filters.track || filters.trainerId) && (
        <button onClick={() => onChange(EMPTY_REPORT_FILTERS)} className="text-xs text-blue-600">Clear filters</button>
      )}
    </div>
  );
}

interface TrainerReportRow {
  trainerId: string; trainerName: string; employeeCode: string;
  scheduleCount: number; totalStudents: number; kraEntriesLogged: number; testsSet: number; feedbackGiven: number;
  schedules: { scheduleId: string; courseName: string; batchCode: string; studentCount: number }[];
}

function TrainerReportPanel({ setError }: { setError: (s: string) => void }) {
  const [rows, setRows] = useState<TrainerReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(defaultRange());
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get('/api/production/reports/trainer', { params: { from: range.from, to: range.to } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(errMsg(err, 'Failed to load trainer report')))
      .finally(() => setLoading(false));
  }, [range, setError]);

  return (
    <div className="space-y-3">
      <DateRangeBar from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No trainer assignments found.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Trainer</th>
                <th className="px-3 py-2">Sub-batches</th>
                <th className="px-3 py-2">Students</th>
                <th className="px-3 py-2">KRA logs</th>
                <th className="px-3 py-2">Tests set</th>
                <th className="px-3 py-2">Feedback given</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <React.Fragment key={r.trainerId}>
                  <tr>
                    <td className="px-3 py-2 font-medium">{r.trainerName} <span className="text-xs text-muted-foreground">({r.employeeCode})</span></td>
                    <td className="px-3 py-2">{r.scheduleCount}</td>
                    <td className="px-3 py-2">{r.totalStudents}</td>
                    <td className="px-3 py-2">{r.kraEntriesLogged}</td>
                    <td className="px-3 py-2">{r.testsSet}</td>
                    <td className="px-3 py-2">{r.feedbackGiven}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setExpanded(expanded === r.trainerId ? null : r.trainerId)} className="text-blue-600 text-xs flex items-center gap-1">
                        {expanded === r.trainerId ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Schedules
                      </button>
                    </td>
                  </tr>
                  {expanded === r.trainerId && (
                    <tr>
                      <td colSpan={7} className="px-3 py-2 bg-muted/20">
                        <div className="flex flex-wrap gap-2">
                          {r.schedules.map((s) => (
                            <span key={s.scheduleId} className="text-xs border rounded-lg px-2 py-1 bg-white">
                              {s.batchCode} · {s.courseName} · {s.studentCount} students
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface BatchReportRow {
  batchId: string; batchCode: string; status: string; subBatchCount: number; totalStudents: number;
  subBatches: {
    scheduleId: string; courseName: string; timing: string; dayPattern: string; mode: string;
    trainers: string[]; studentCount: number; trackBreakdown: Record<string, number>;
  }[];
}

function BatchReportPanel({ setError }: { setError: (s: string) => void }) {
  const [rows, setRows] = useState<BatchReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);

  useEffect(() => {
    setLoading(true);
    api.get('/api/production/reports/batches', {
      params: { batchId: filters.batchId || undefined, courseId: filters.courseId || undefined },
    })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(errMsg(err, 'Failed to load batch report')))
      .finally(() => setLoading(false));
  }, [filters, setError]);

  return (
    <div className="space-y-3">
      <ReportFilterBar filters={filters} onChange={setFilters} />
      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No batches found.</p>
      ) : (
        rows.map((b) => (
          <div key={b.batchId} className="border rounded-lg">
            <button
              onClick={() => setExpanded(expanded === b.batchId ? null : b.batchId)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                {expanded === b.batchId ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="font-medium">{b.batchCode}</span>
                <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">{b.status}</span>
              </div>
              <span className="text-sm text-muted-foreground">{b.subBatchCount} sub-batch{b.subBatchCount === 1 ? '' : 'es'} · {b.totalStudents} students</span>
            </button>
            {expanded === b.batchId && (
              <div className="border-t divide-y">
                {b.subBatches
                  .filter((s) => !filters.track || (s.trackBreakdown[filters.track] || 0) > 0)
                  .map((s) => (
                    <SubBatchDrilldown key={s.scheduleId} subBatch={s} track={filters.track} setError={setError} />
                  ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/** One sub-batch row inside the Batch / Sub-batch report, with two on-demand drill-downs:
 *  "Day-wise KRA" (what was taught, date by date — from the same KRAEntry data as the
 *  standalone Daily KRA tab, scoped to this sub-batch via scheduleId) and "Students" (roster
 *  with project submission status, reusing the student-list + per-student report endpoints). */
function SubBatchDrilldown({ subBatch: s, track, setError }: {
  subBatch: BatchReportRow['subBatches'][number]; track: string; setError: (s: string) => void;
}) {
  const [open, setOpen] = useState<'kra' | 'students' | null>(null);
  const [kra, setKra] = useState<KraRow[] | null>(null);
  const [loadingKra, setLoadingKra] = useState(false);
  const [students, setStudents] = useState<SubBatchStudentRow[] | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);

  function toggleKra() {
    if (open === 'kra') { setOpen(null); return; }
    setOpen('kra');
    if (kra) return;
    setLoadingKra(true);
    api.get('/api/production/reports/kra', { params: { scheduleId: s.scheduleId, track: track || undefined } })
      .then((res) => setKra(res.data.data))
      .catch((err) => setError(errMsg(err, 'Failed to load day-wise KRA')))
      .finally(() => setLoadingKra(false));
  }

  function toggleStudents() {
    if (open === 'students') { setOpen(null); return; }
    setOpen('students');
    if (students) return;
    setLoadingStudents(true);
    api.get('/api/production/reports/students', { params: { scheduleId: s.scheduleId, track: track || undefined } })
      .then(async (res) => {
        const list: StudentListRow[] = res.data.data;
        const details = await Promise.all(list.map((st) =>
          api.get(`/api/production/reports/students/${st.id}`).then((r) => r.data.data as StudentReportData).catch(() => null)
        ));
        setStudents(list.map((st, i) => {
          const sched = details[i]?.schedules.find((sc) => sc.scheduleId === s.scheduleId);
          return { student: st, projects: sched?.projects || [] };
        }));
      })
      .catch((err) => setError(errMsg(err, 'Failed to load student roster')))
      .finally(() => setLoadingStudents(false));
  }

  return (
    <div className="px-4 py-3 text-sm space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <p className="font-medium">{s.courseName}</p>
          <p className="text-xs text-muted-foreground">{s.timing} · {s.dayPattern} · {s.mode}</p>
          <p className="text-xs text-muted-foreground">Trainers: {s.trainers.length ? s.trainers.join(', ') : '—'}</p>
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          {TRACKS.map((t) => (
            <span key={t} className="text-xs border rounded-lg px-2 py-1">{TRACK_LABEL[t]}: {s.trackBreakdown[t] || 0}</span>
          ))}
          <span className="text-xs font-medium border rounded-lg px-2 py-1 bg-muted/40">Total: {s.studentCount}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={toggleKra} className="text-blue-600 text-xs flex items-center gap-1">
          {open === 'kra' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Day-wise KRA (what happened in class)
        </button>
        <button onClick={toggleStudents} className="text-blue-600 text-xs flex items-center gap-1">
          {open === 'students' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Students &amp; projects
        </button>
      </div>
      {open === 'kra' && (
        <div className="bg-muted/20 rounded-lg p-3 space-y-2">
          {loadingKra ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : !kra || kra.length === 0 ? (
            <p className="text-xs text-muted-foreground">No KRA entries logged for this sub-batch yet.</p>
          ) : (
            kra.map((r) => (
              <div key={r.id} className="border rounded-lg p-2 bg-white">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-xs font-medium">{new Date(r.date).toLocaleDateString()}{r.track ? ` · ${TRACK_LABEL[r.track]}` : ''}</p>
                  <p className="text-xs text-muted-foreground">{r.trainer.firstName} {r.trainer.lastName}{r.module ? ` · ${r.module.title}` : ''}</p>
                </div>
                <p className="text-xs mt-1">{r.topicsCovered}</p>
                {r.notes && <p className="text-xs text-muted-foreground mt-0.5">Notes: {r.notes}</p>}
              </div>
            ))
          )}
        </div>
      )}
      {open === 'students' && (
        <div className="bg-muted/20 rounded-lg p-3 space-y-2">
          {loadingStudents ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : !students || students.length === 0 ? (
            <p className="text-xs text-muted-foreground">No students enrolled in this sub-batch.</p>
          ) : (
            students.map(({ student: st, projects }) => (
              <div key={st.id} className="border rounded-lg p-2 bg-white text-xs">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="font-medium">{st.firstName} {st.lastName} <span className="text-muted-foreground">({st.studentCode} · {TRACK_LABEL[st.track]})</span></span>
                  <span className="text-muted-foreground">{projects.length} project{projects.length === 1 ? '' : 's'}</span>
                </div>
                {projects.length === 0 ? (
                  <p className="text-muted-foreground mt-1">No submissions.</p>
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {projects.map((p) => (
                      <div key={p.id} className="flex items-center justify-between">
                        <span>{p.projectTitle} <span className="text-muted-foreground">({p.moduleTitle})</span></span>
                        <span className="text-muted-foreground">{p.status}{p.graded ? ` · ${p.grade}/${p.maxGrade}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface SubBatchStudentRow { student: StudentListRow; projects: StudentReportData['schedules'][number]['projects']; }

interface AttendanceReportRow {
  enrollmentId: string;
  studentId: string; studentName: string; studentCode: string; track: StudentTrack;
  batchCode: string; courseName: string; totalDays: number; present: number; absent: number;
  attendancePct: number | null; absentDates: string[];
}

function AttendanceReportPanel({ setError }: { setError: (s: string) => void }) {
  const [rows, setRows] = useState<AttendanceReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(defaultRange());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);

  useEffect(() => {
    setLoading(true);
    api.get('/api/production/reports/attendance', {
      params: {
        from: range.from, to: range.to,
        batchId: filters.batchId || undefined, courseId: filters.courseId || undefined, track: filters.track || undefined,
        trainerId: filters.trainerId || undefined,
      },
    })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(errMsg(err, 'Failed to load attendance report')))
      .finally(() => setLoading(false));
  }, [range, filters, setError]);

  const downloadExcel = () => {
    exportRowsToExcel(`attendance_${range.from}_to_${range.to}.xlsx`, rows.map((r) => ({
      'Student Name': r.studentName,
      'Student Code': r.studentCode,
      Track: TRACK_LABEL[r.track],
      Batch: r.batchCode,
      Course: r.courseName,
      'Total Days': r.totalDays,
      Present: r.present,
      Absent: r.absent,
      'Attendance %': r.attendancePct ?? '',
      'Absent Dates': r.absentDates.map((d) => new Date(d).toLocaleDateString()).join(', '),
    })), 'Attendance');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateFilterBar from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <div className="flex flex-wrap items-center gap-2">
          <ReportFilterBar filters={filters} onChange={setFilters} showTrainer />
          <button
            onClick={downloadExcel}
            disabled={rows.length === 0}
            className="flex items-center gap-1 text-xs border rounded-lg px-2 py-1.5 text-blue-600 disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            <Download className="w-3 h-3" /> Download Excel
          </button>
        </div>
      </div>
      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No active enrollments found.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Batch / Course</th>
                <th className="px-3 py-2">Track</th>
                <th className="px-3 py-2">Present</th>
                <th className="px-3 py-2">Absent</th>
                <th className="px-3 py-2">Attendance %</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <React.Fragment key={r.enrollmentId}>
                  <tr>
                    <td className="px-3 py-2 font-medium">{r.studentName} <span className="text-xs text-muted-foreground">({r.studentCode})</span></td>
                    <td className="px-3 py-2">{r.batchCode} · {r.courseName}</td>
                    <td className="px-3 py-2">{TRACK_LABEL[r.track]}</td>
                    <td className="px-3 py-2">{r.present}</td>
                    <td className="px-3 py-2">{r.absent}</td>
                    <td className="px-3 py-2">
                      <span className={`font-medium ${r.attendancePct !== null && r.attendancePct < 75 ? 'text-red-600' : ''}`}>
                        {r.attendancePct !== null ? `${r.attendancePct}%` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.absentDates.length > 0 && (
                        <button onClick={() => setExpanded(expanded === r.enrollmentId ? null : r.enrollmentId)} className="text-blue-600 text-xs flex items-center gap-1">
                          {expanded === r.enrollmentId ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Absences
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === r.enrollmentId && (
                    <tr>
                      <td colSpan={7} className="px-3 py-2 bg-muted/20">
                        <div className="flex flex-wrap gap-2">
                          {r.absentDates.map((d) => (
                            <span key={d} className="text-xs border rounded-lg px-2 py-1 bg-white">{new Date(d).toLocaleDateString()}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface StudentListRow {
  id: string; firstName: string; lastName: string; studentCode: string; track: StudentTrack; status: string;
}

interface StudentReportData {
  student: StudentListRow & {
    phone: string; email: string;
    dateOfBirth: string | null; gender: string | null;
    address: string | null; city: string | null; state: string | null; pincode: string | null;
    joiningDate: string | null;
    fatherName: string | null; fatherPhone: string | null; motherName: string | null; motherPhone: string | null;
    photo: string | null; aadharNumber: string | null; aadharPhoto: string | null;
    emergencyContactName: string | null; emergencyContactPhone: string | null;
  };
  certificates: { id: string; certificateNo: string; courseName: string; issuedAt: string }[];
  schedules: {
    scheduleId: string; batchCode: string; courseId: string; courseName: string;
    enrollmentStatus: string; enrolledAt: string;
    rank: number | null; totalStudents: number; marksObtained: number; marksMax: number;
    percentage: number; classAverage: number; attendancePct: number | null;
    attendanceLog: { date: string; status: string }[];
    onlineTests: { id: string; testTitle: string; moduleTitle: string; status: string; score: number | null; totalMarks: number | null; submittedAt: string | null }[];
    projects: { id: string; projectTitle: string; moduleTitle: string; status: string; submittedAt: string | null; graded: boolean; grade: number | null; maxGrade: number | null; reviewNote: string | null; fileUrl: string | null; linkUrl: string | null }[];
    moduleFeedback: { id: string; moduleTitle: string; rating: number | null; comments: string | null; trainerName: string | null; updatedAt: string }[];
  }[];
  placement: {
    movedToPlacementAt: string | null;
    readiness: { ready: boolean; missing: string[] };
    portfolio: { status: string; publicSlug: string | null } | null;
    softskillAttendance: { id: string; type: 'SOFTSKILL' | 'APTITUDE'; topic: string; sessionDate: string; present: boolean; score: number | null }[];
    driveCandidacies: { id: string; status: string; partnerName: string; role: string; driveDate: string }[];
    interviews: { id: string; companyName: string | null; round: number; scheduledAt: string; outcome: string; rating: number | null; feedback: string | null; feedbackGivenBy: string | null }[];
    results: { id: string; partnerName: string; result: string; package: number | null; designation: string | null; joiningDate: string | null; offerLetterUrl: string | null }[];
  } | null;
}

function StudentReportPanel({ setError }: { setError: (s: string) => void }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const [list, setList] = useState<StudentListRow[]>([]);
  const [selected, setSelected] = useState<StudentListRow | null>(null);
  const [detail, setDetail] = useState<StudentReportData | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedAttendance, setExpandedAttendance] = useState<string | null>(null);
  const [showFullProfile, setShowFullProfile] = useState(false);

  useEffect(() => {
    setLoadingList(true);
    const t = setTimeout(() => {
      api.get('/api/production/reports/students', {
        params: {
          search: search || undefined,
          batchId: filters.batchId || undefined, courseId: filters.courseId || undefined, track: filters.track || undefined,
        },
      })
        .then((res) => setList(res.data.data))
        .catch((err) => setError(errMsg(err, 'Failed to load students')))
        .finally(() => setLoadingList(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, filters, setError]);

  useEffect(() => {
    setShowFullProfile(false);
    if (!selected) { setDetail(null); return; }
    setLoadingDetail(true);
    api.get(`/api/production/reports/students/${selected.id}`)
      .then((res) => setDetail(res.data.data))
      .catch((err) => setError(errMsg(err, 'Failed to load student report')))
      .finally(() => setLoadingDetail(false));
  }, [selected, setError]);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="border rounded-lg">
        <div className="p-2 border-b space-y-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or code..."
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <ReportFilterBar filters={filters} onChange={setFilters} />
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y">
          {loadingList ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Loading...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No students found.</p>
          ) : (
            list.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/40 ${selected?.id === s.id ? 'bg-blue-50' : ''}`}
              >
                <p className="font-medium">{s.firstName} {s.lastName}</p>
                <p className="text-xs text-muted-foreground">{s.studentCode} · {TRACK_LABEL[s.track]}</p>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="md:col-span-2 border rounded-lg p-4">
        {!selected ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Select a student to view their A–Z report.</p>
        ) : loadingDetail || !detail ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold text-lg">{detail.student.firstName} {detail.student.lastName}</h3>
              <p className="text-xs text-muted-foreground">{detail.student.studentCode} · {TRACK_LABEL[detail.student.track]} · {detail.student.phone} · {detail.student.email}</p>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs border rounded-lg p-2 bg-muted/20">
                <div><span className="text-muted-foreground">DOB:</span> {detail.student.dateOfBirth ? new Date(detail.student.dateOfBirth).toLocaleDateString() : '—'}</div>
                <div><span className="text-muted-foreground">Gender:</span> {detail.student.gender || '—'}</div>
                <div><span className="text-muted-foreground">Joined:</span> {detail.student.joiningDate ? new Date(detail.student.joiningDate).toLocaleDateString() : '—'}</div>
                <div className="col-span-2 sm:col-span-3"><span className="text-muted-foreground">Address:</span> {[detail.student.address, detail.student.city, detail.student.state, detail.student.pincode].filter(Boolean).join(', ') || '—'}</div>
                <div><span className="text-muted-foreground">Father:</span> {detail.student.fatherName || '—'}{detail.student.fatherPhone ? ` (${detail.student.fatherPhone})` : ''}</div>
                <div><span className="text-muted-foreground">Mother:</span> {detail.student.motherName || '—'}{detail.student.motherPhone ? ` (${detail.student.motherPhone})` : ''}</div>
              </div>
              {detail.certificates.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Certificates</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.certificates.map((c) => (
                      <span key={c.id} className="text-xs border rounded-lg px-2 py-1">{c.courseName} · {c.certificateNo} · {new Date(c.issuedAt).toLocaleDateString()}</span>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowFullProfile((v) => !v)}
                className="text-blue-600 text-xs flex items-center gap-1 mt-2"
              >
                {showFullProfile ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} View Profile
              </button>
              {showFullProfile && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs border rounded-lg p-2 bg-muted/20">
                  {detail.student.photo && (
                    <div className="col-span-2 sm:col-span-3">
                      <p className="text-muted-foreground mb-1">Photo</p>
                      <img src={fileUrl(detail.student.photo)} alt="Student" className="w-20 h-20 object-cover rounded-lg border" />
                    </div>
                  )}
                  <div><span className="text-muted-foreground">Aadhar number:</span> {detail.student.aadharNumber || '—'}</div>
                  <div>
                    <span className="text-muted-foreground">Aadhar photo:</span>{' '}
                    {detail.student.aadharPhoto ? (
                      <a href={fileUrl(detail.student.aadharPhoto)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View</a>
                    ) : '—'}
                  </div>
                  <div><span className="text-muted-foreground">Emergency contact:</span> {detail.student.emergencyContactName || '—'}{detail.student.emergencyContactPhone ? ` (${detail.student.emergencyContactPhone})` : ''}</div>
                </div>
              )}
            </div>
            {detail.schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No enrollments found for this student.</p>
            ) : (
              detail.schedules.map((sc) => (
                <div key={sc.scheduleId} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <p className="font-medium">{sc.batchCode} · {sc.courseName}</p>
                    <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">{sc.enrollmentStatus} · enrolled {new Date(sc.enrolledAt).toLocaleDateString()}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <div className="border rounded-lg p-2"><p className="text-xs text-muted-foreground">Rank</p><p className="font-semibold">{sc.rank ? `#${sc.rank} / ${sc.totalStudents}` : '—'}</p></div>
                    <div className="border rounded-lg p-2"><p className="text-xs text-muted-foreground">Marks</p><p className="font-semibold">{sc.marksObtained}/{sc.marksMax} ({sc.percentage}%)</p></div>
                    <div className="border rounded-lg p-2"><p className="text-xs text-muted-foreground">Class avg</p><p className="font-semibold">{sc.classAverage}%</p></div>
                    <div className="border rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Attendance</p>
                      <p className="font-semibold">{sc.attendancePct !== null ? `${sc.attendancePct}%` : '—'}</p>
                      {sc.attendanceLog.length > 0 && (
                        <button
                          onClick={() => setExpandedAttendance(expandedAttendance === sc.scheduleId ? null : sc.scheduleId)}
                          className="text-blue-600 text-xs flex items-center gap-1 mt-0.5"
                        >
                          {expandedAttendance === sc.scheduleId ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Day-wise
                        </button>
                      )}
                    </div>
                  </div>
                  {expandedAttendance === sc.scheduleId && (
                    <div className="flex flex-wrap gap-1.5">
                      {sc.attendanceLog.map((a) => (
                        <span
                          key={a.date}
                          className={`text-xs rounded-lg px-2 py-1 ${
                            a.status === 'PRESENT' ? 'bg-green-50 text-green-700' : a.status === 'LATE' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {new Date(a.date).toLocaleDateString()} · {a.status}
                        </span>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Online tests</p>
                    {sc.onlineTests.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No test attempts.</p>
                    ) : (
                      <div className="space-y-1">
                        {sc.onlineTests.map((t) => (
                          <div key={t.id} className="text-xs flex items-center justify-between border rounded-lg px-2 py-1">
                            <span>{t.testTitle} <span className="text-muted-foreground">({t.moduleTitle})</span></span>
                            <span className="text-muted-foreground">{t.status}{t.score !== null ? ` · ${t.score}/${t.totalMarks}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Projects</p>
                    {sc.projects.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No submissions.</p>
                    ) : (
                      <div className="space-y-1">
                        {sc.projects.map((p) => (
                          <div key={p.id} className="text-xs border rounded-lg px-2 py-1">
                            <div className="flex items-center justify-between gap-2">
                              <span>{p.projectTitle} <span className="text-muted-foreground">({p.moduleTitle})</span></span>
                              <span className="text-muted-foreground whitespace-nowrap">{p.status}{p.graded ? ` · ${p.grade}/${p.maxGrade}` : ''}</span>
                            </div>
                            {(p.fileUrl || p.linkUrl) && (
                              <div className="mt-0.5">
                                {p.fileUrl && <a href={fileUrl(p.fileUrl)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">View submitted file</a>}
                                {p.linkUrl && <a href={p.linkUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline block">{p.linkUrl}</a>}
                              </div>
                            )}
                            {p.reviewNote && <p className="text-muted-foreground mt-0.5">Note: {p.reviewNote}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Trainer feedback</p>
                    {sc.moduleFeedback.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No feedback given yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {sc.moduleFeedback.map((f) => (
                          <div key={f.id} className="text-xs border rounded-lg px-2 py-1">
                            <p><span className="font-medium">{f.moduleTitle}</span> {f.rating !== null ? `· ${f.rating}/5` : ''} {f.trainerName ? `· ${f.trainerName}` : ''}</p>
                            {f.comments && <p className="text-muted-foreground mt-0.5">{f.comments}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {detail.placement && (
              <div className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="font-medium">Placement</p>
                  {detail.placement.movedToPlacementAt && (
                    <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">
                      Pushed to placement {new Date(detail.placement.movedToPlacementAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div>
                  {detail.placement.readiness.ready ? (
                    <span className="text-xs font-medium px-2 py-1 rounded-full inline-flex items-center gap-1 bg-green-50 text-green-700">Ready for Placement</span>
                  ) : (
                    <div className="space-y-1">
                      <span className="text-xs font-medium px-2 py-1 rounded-full inline-flex items-center gap-1 bg-amber-50 text-amber-700">Not Yet Ready</span>
                      {detail.placement.readiness.missing.map((m, i) => (
                        <p key={i} className="text-xs text-muted-foreground">• {m}</p>
                      ))}
                    </div>
                  )}
                  {detail.placement.portfolio && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Portfolio: {detail.placement.portfolio.status}
                      {detail.placement.portfolio.publicSlug && (
                        <a href={`/portfolio/${detail.placement.portfolio.publicSlug}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline ml-1">View</a>
                      )}
                    </p>
                  )}
                </div>

                {detail.placement.softskillAttendance.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Softskill / Aptitude attendance</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.placement.softskillAttendance.map((a) => (
                        <span key={a.id} className={`text-xs rounded-lg px-2 py-1 ${a.present ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {a.topic} ({a.type}) · {new Date(a.sessionDate).toLocaleDateString()} · {a.present ? 'Present' : 'Absent'}{a.score !== null ? ` · ${a.score}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {detail.placement.driveCandidacies.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Drive shortlists</p>
                    <div className="space-y-1">
                      {detail.placement.driveCandidacies.map((c) => (
                        <div key={c.id} className="text-xs border rounded-lg px-2 py-1 flex items-center justify-between">
                          <span>{c.partnerName} · {c.role} ({new Date(c.driveDate).toLocaleDateString()})</span>
                          <span className="text-muted-foreground">{c.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Interviews</p>
                  {detail.placement.interviews.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No interviews mapped yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {detail.placement.interviews.map((iv) => (
                        <div key={iv.id} className="text-xs border rounded-lg px-2 py-1">
                          <div className="flex items-center justify-between gap-2">
                            <span>{iv.companyName || 'Interview'} · Round {iv.round} · {new Date(iv.scheduledAt).toLocaleString()}</span>
                            <span className="text-muted-foreground whitespace-nowrap">{iv.outcome}</span>
                          </div>
                          {iv.feedback && (
                            <p className="text-muted-foreground mt-0.5">
                              Feedback{iv.rating !== null ? ` (${iv.rating}/5)` : ''}: {iv.feedback}{iv.feedbackGivenBy ? ` — ${iv.feedbackGivenBy}` : ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Offers / Results</p>
                  {detail.placement.results.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No results recorded yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {detail.placement.results.map((r) => (
                        <div key={r.id} className="text-xs border rounded-lg px-2 py-1">
                          <div className="flex items-center justify-between gap-2">
                            <span>{r.partnerName}{r.designation ? ` · ${r.designation}` : ''}</span>
                            <span className={`whitespace-nowrap font-medium ${r.result === 'SELECTED' ? 'text-green-700' : r.result === 'REJECTED' ? 'text-red-700' : 'text-amber-700'}`}>{r.result}</span>
                          </div>
                          <p className="text-muted-foreground mt-0.5">
                            {r.package != null && <>₹{r.package.toLocaleString('en-IN')} · </>}
                            {r.joiningDate && <>Joining {new Date(r.joiningDate).toLocaleDateString()} · </>}
                            {r.offerLetterUrl && <a href={fileUrl(r.offerLetterUrl)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Offer Letter</a>}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface KraRow {
  id: string; date: string; track: StudentTrack | null; topicsCovered: string; notes: string | null;
  schedule: { id: string; batch: { code: string }; course: { name: string } };
  module: { id: string; title: string } | null;
  trainer: { id: string; firstName: string; lastName: string; employeeCode: string };
}

function KraReportPanel({ setError }: { setError: (s: string) => void }) {
  const [rows, setRows] = useState<KraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(defaultRange());
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);

  useEffect(() => {
    setLoading(true);
    api.get('/api/production/reports/kra', {
      params: {
        from: range.from, to: range.to,
        batchId: filters.batchId || undefined, courseId: filters.courseId || undefined, track: filters.track || undefined,
        trainerId: filters.trainerId || undefined,
      },
    })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(errMsg(err, 'Failed to load KRA log')))
      .finally(() => setLoading(false));
  }, [range, filters, setError]);

  const downloadExcel = () => {
    exportRowsToExcel(`daily_kra_${range.from}_to_${range.to}.xlsx`, rows.map((r) => ({
      Date: new Date(r.date).toLocaleDateString(),
      Batch: r.schedule.batch.code,
      Course: r.schedule.course.name,
      Track: r.track ? TRACK_LABEL[r.track] : 'Whole schedule',
      Trainer: `${r.trainer.firstName} ${r.trainer.lastName} (${r.trainer.employeeCode})`,
      Module: r.module?.title || '',
      'Topics Covered': r.topicsCovered,
      Notes: r.notes || '',
    })), 'Daily KRA');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateFilterBar from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <div className="flex flex-wrap items-center gap-2">
          <ReportFilterBar filters={filters} onChange={setFilters} showTrainer />
          <button
            onClick={downloadExcel}
            disabled={rows.length === 0}
            className="flex items-center gap-1 text-xs border rounded-lg px-2 py-1.5 text-blue-600 disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            <Download className="w-3 h-3" /> Download Excel
          </button>
        </div>
      </div>
      {loading ? (
        <div className="text-center text-muted-foreground py-8">Loading...</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No KRA entries logged in this range.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="border rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <p className="font-medium">{r.schedule.batch.code} · {r.schedule.course.name}{r.track ? ` · ${TRACK_LABEL[r.track]}` : ''}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.date).toLocaleDateString()}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {r.trainer.firstName} {r.trainer.lastName} ({r.trainer.employeeCode}){r.module ? ` · Module: ${r.module.title}` : ''}
              </p>
              <p className="mt-2">{r.topicsCovered}</p>
              {r.notes && <p className="text-xs text-muted-foreground mt-1">Notes: {r.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface RecipientRow { id: string; type: 'DAILY_ATTENDANCE' | 'ESCALATION'; email: string; name: string | null; }

function RecipientsPanel({ canEdit, setError }: { canEdit: boolean; setError: (s: string) => void }) {
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState<'DAILY_ATTENDANCE' | 'ESCALATION' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/production/report-recipients')
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(errMsg(err, 'Failed to load recipients')))
      .finally(() => setLoading(false));
  }, [setError]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    try { await api.delete(`/api/production/report-recipients/${id}`); load(); }
    catch (err) { setError(errMsg(err, 'Failed to remove recipient')); }
  };

  const groups: { type: 'DAILY_ATTENDANCE' | 'ESCALATION'; title: string; desc: string }[] = [
    { type: 'DAILY_ATTENDANCE', title: 'Daily Attendance Report', desc: "Receives yesterday's attendance summary every day." },
    { type: 'ESCALATION', title: 'Leave Escalation', desc: 'Receives the escalation email when a student has been absent 3+ consecutive days (in addition to management).' },
  ];

  if (loading) return <div className="text-center text-muted-foreground py-8">Loading...</div>;

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.type} className="border rounded-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <p className="font-medium text-sm">{g.title}</p>
              <p className="text-xs text-muted-foreground">{g.desc}</p>
            </div>
            {canEdit && (
              <button onClick={() => setShowAdd(g.type)} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-muted/50 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            )}
          </div>
          <div className="divide-y">
            {rows.filter((r) => r.type === g.type).length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-3">No recipients configured yet.</p>
            ) : (
              rows.filter((r) => r.type === g.type).map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{r.name ? `${r.name} — ` : ''}{r.email}</span>
                  {canEdit && (
                    <button onClick={() => remove(r.id)} className="text-muted-foreground hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ))}
      {showAdd && (
        <AddRecipientModal type={showAdd} onClose={() => setShowAdd(null)} setError={setError} onSaved={() => { setShowAdd(null); load(); }} />
      )}
    </div>
  );
}

function AddRecipientModal({ type, onClose, setError, onSaved }: {
  type: 'DAILY_ATTENDANCE' | 'ESCALATION'; onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    setSaving(true);
    try {
      await api.post('/api/production/report-recipients', { type, email: email.trim(), name: name.trim() || undefined });
      onSaved();
    } catch (err) { setError(errMsg(err, 'Failed to add recipient')); } finally { setSaving(false); }
  };

  return (
    <Modal title="Add Recipient" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="name@company.com" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Name (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
      </div>
      <ModalFooter onClose={onClose} onSubmit={submit} saving={saving} label="Add" />
    </Modal>
  );
}
