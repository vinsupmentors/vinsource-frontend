import { useEffect, useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import api, { BASE_URL } from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { formatDate } from '@/lib/utils';
import {
  Lock, X, RefreshCw, Search, ChevronRight, ArrowLeft, Download, Building2,
  BookOpen, Clock, Users, GraduationCap, Trophy, Briefcase, Award, ListChecks,
  CalendarClock, MessageSquare, ExternalLink, Star, User as UserIcon, Filter,
} from 'lucide-react';

// ── My Students ─────────────────────────────────────────────────────────
// A student can be linked to a "Skill Advisor" — the Sales employee who
// enrolled them, set via employee code at intake (Production's Add Student /
// bulk upload, or Placements' Add PT Student). This page gives that advisor
// a self-scoped view of their own students' full academy record (attendance,
// marks, projects, feedback, certificate status, placement); SALES=ADMIN
// (a Sales manager) sees every student that has any advisor assigned, across
// the whole team.
//
// Two ways to look at the roster:
//  - Browse: Batch cards -> Course cards -> (managers only) Morning/Evening
//    cards -> student list. Regular advisors skip the timing level since
//    they typically have far fewer students to page through.
//  - Filter & Report: checkbox multi-select on batch/course plus a free-text
//    search (name / roll number / phone), producing a flat, exportable list.

const fileUrl = (path: string) => (/^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`);
function formatCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

interface EmployeeLite { id: string; firstName: string; lastName: string; employeeCode: string; }

interface EnrollmentLite {
  schedule: {
    id: string; timing?: string | null;
    course: { id: string; name: string };
    batch: { id: string; code: string };
  };
}

interface AdvisedStudentRow {
  id: string; firstName: string; lastName: string; studentCode: string; photo?: string | null;
  track: string; status: string; email?: string | null; phone: string;
  joiningDate: string; movedToPlacementAt?: string | null;
  profileCompletedAt?: string | null; documentsCompletedAt?: string | null; onboardingApprovedAt?: string | null;
  enrollments: EnrollmentLite[];
  portfolio?: { status: string; targetRole?: string | null } | null;
  certificateRequests: { type: string; feeApprovedAt?: string | null; ldmApprovedAt?: string | null; certificateNo?: string | null }[];
  skillAdvisor?: EmployeeLite | null;
}

// A student's onboarding is a fixed 3-step ladder — profile filled in, every
// required document signed, then an admin sign-off unlocks their dashboard.
// Same 3 timestamps the Student Onboarding admin screen uses, just collapsed
// to a single stage label so a Skill Advisor can see it at a glance without
// leaving My Students.
type OnboardingStage = 'profile' | 'documents' | 'approval' | 'done';
interface OnboardingFlags {
  profileCompletedAt?: string | null; documentsCompletedAt?: string | null; onboardingApprovedAt?: string | null;
}
function onboardingStage(s: OnboardingFlags): OnboardingStage {
  if (!s.profileCompletedAt) return 'profile';
  if (!s.documentsCompletedAt) return 'documents';
  if (!s.onboardingApprovedAt) return 'approval';
  return 'done';
}
const ONBOARDING_STAGE_LABEL: Record<OnboardingStage, string> = {
  profile: 'Profile pending', documents: 'Documents pending', approval: 'Awaiting approval', done: 'Onboarded',
};
const ONBOARDING_STAGE_COLOR: Record<OnboardingStage, string> = {
  profile: 'bg-red-100 text-red-700', documents: 'bg-amber-100 text-amber-700',
  approval: 'bg-blue-100 text-blue-700', done: 'bg-green-100 text-green-700',
};
function OnboardingStageBadge({ student }: { student: OnboardingFlags }) {
  const stage = onboardingStage(student);
  return <span className={`text-[11px] font-medium rounded-full px-2 py-1 whitespace-nowrap ${ONBOARDING_STAGE_COLOR[stage]}`}>{ONBOARDING_STAGE_LABEL[stage]}</span>;
}

const STUDENT_STATUS_COLOR: Record<string, string> = {
  ENROLLED: 'bg-blue-100 text-blue-700', ONGOING: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700', IN_PLACEMENT: 'bg-amber-100 text-amber-700',
  PLACED: 'bg-emerald-100 text-emerald-700', DROPPED: 'bg-red-100 text-red-700',
};
const TIMING_LABEL: Record<string, string> = { MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening' };
const PT_KEY = '__PT__';

function studentCourseLine(s: AdvisedStudentRow): string {
  const en = s.enrollments[s.enrollments.length - 1];
  return en ? `${en.schedule.course.name} · ${en.schedule.batch.code}` : (s.track === 'PT' ? 'Placement Training' : '—');
}

function CertStatusBadge({ reqs }: { reqs: AdvisedStudentRow['certificateRequests'] }) {
  if (!reqs.length) return <span className="text-xs text-muted-foreground">—</span>;
  const issued = reqs.filter((r) => r.certificateNo).length;
  const pending = reqs.length - issued;
  return (
    <span className="text-[11px]">
      {issued > 0 && <span className="text-green-700 font-medium">{issued} issued</span>}
      {issued > 0 && pending > 0 && <span className="text-muted-foreground"> · </span>}
      {pending > 0 && <span className="text-amber-600 font-medium">{pending} pending</span>}
    </span>
  );
}

function StudentRosterTable({ students, loading, emptyLabel, showAdvisor, onOpen }: {
  students: AdvisedStudentRow[]; loading: boolean; emptyLabel: string; showAdvisor?: boolean;
  onOpen: (id: string) => void;
}) {
  const colCount = showAdvisor ? 7 : 6;
  return (
    <div className="bg-card border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-3">Student</th>
            <th className="px-3 py-3">Course / Batch</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Onboarding</th>
            <th className="px-3 py-3">Portfolio</th>
            <th className="px-3 py-3">Certificates</th>
            {showAdvisor && <th className="px-3 py-3">Advisor</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {loading ? (
            <tr><td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
          ) : students.length === 0 ? (
            <tr><td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">{emptyLabel}</td></tr>
          ) : students.map((s) => (
            <tr key={s.id} className="hover:bg-muted/30">
              <td className="px-3 py-3 font-medium whitespace-nowrap">
                <button onClick={() => onOpen(s.id)} className="text-blue-600 hover:underline text-left">
                  {s.firstName} {s.lastName}
                </button>
                <div className="text-xs text-muted-foreground font-normal">{s.studentCode} · {s.track}</div>
              </td>
              <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">{studentCourseLine(s)}</td>
              <td className="px-3 py-3 whitespace-nowrap">
                <span className={`text-[11px] font-medium rounded-full px-2 py-1 ${STUDENT_STATUS_COLOR[s.status] || 'bg-gray-100 text-gray-600'}`}>
                  {s.status.replace(/_/g, ' ')}
                </span>
              </td>
              <td className="px-3 py-3 whitespace-nowrap"><OnboardingStageBadge student={s} /></td>
              <td className="px-3 py-3 whitespace-nowrap text-xs">
                {s.portfolio ? (
                  <span className={s.portfolio.status === 'APPROVED' ? 'text-green-700 font-medium' : 'text-muted-foreground'}>
                    {s.portfolio.status}
                  </span>
                ) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-3 whitespace-nowrap"><CertStatusBadge reqs={s.certificateRequests} /></td>
              {showAdvisor && (
                <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                  {s.skillAdvisor ? `${s.skillAdvisor.firstName} ${s.skillAdvisor.lastName}` : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Browse: Batch -> Course -> (Timing, managers only) -> Students ────────
function BrowseSection({ students, loading, isAdmin, onOpenStudent }: {
  students: AdvisedStudentRow[]; loading: boolean; isAdmin: boolean; onOpenStudent: (id: string) => void;
}) {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [timing, setTiming] = useState<string | null>(null);

  const batchCards = useMemo(() => {
    const map = new Map<string, { code: string; count: number }>();
    let ptCount = 0;
    for (const s of students) {
      if (s.enrollments.length === 0) { ptCount++; continue; }
      const seen = new Set<string>();
      for (const en of s.enrollments) {
        const bId = en.schedule.batch.id;
        if (seen.has(bId)) continue;
        seen.add(bId);
        const g = map.get(bId) || { code: en.schedule.batch.code, count: 0 };
        g.count++;
        map.set(bId, g);
      }
    }
    const cards = Array.from(map.entries())
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => a.code.localeCompare(b.code));
    if (ptCount > 0) cards.push({ id: PT_KEY, code: 'Placement Training / Direct', count: ptCount });
    return cards;
  }, [students]);

  const courseCards = useMemo(() => {
    if (!batchId || batchId === PT_KEY) return [];
    const map = new Map<string, { name: string; count: number }>();
    for (const s of students) {
      const seen = new Set<string>();
      for (const en of s.enrollments) {
        if (en.schedule.batch.id !== batchId) continue;
        const cId = en.schedule.course.id;
        if (seen.has(cId)) continue;
        seen.add(cId);
        const g = map.get(cId) || { name: en.schedule.course.name, count: 0 };
        g.count++;
        map.set(cId, g);
      }
    }
    return Array.from(map.entries()).map(([id, g]) => ({ id, ...g })).sort((a, b) => a.name.localeCompare(b.name));
  }, [students, batchId]);

  const timingCards = useMemo(() => {
    if (!isAdmin || !batchId || batchId === PT_KEY || !courseId) return [];
    const map = new Map<string, number>();
    for (const s of students) {
      const seen = new Set<string>();
      for (const en of s.enrollments) {
        if (en.schedule.batch.id !== batchId || en.schedule.course.id !== courseId) continue;
        const t = en.schedule.timing || 'UNSPECIFIED';
        if (seen.has(t)) continue;
        seen.add(t);
        map.set(t, (map.get(t) || 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([t, count]) => ({ timing: t, count })).sort((a, b) => a.timing.localeCompare(b.timing));
  }, [students, batchId, courseId, isAdmin]);

  const drilledStudents = useMemo(() => {
    if (!batchId) return [];
    if (batchId === PT_KEY) return students.filter((s) => s.enrollments.length === 0);
    return students.filter((s) => s.enrollments.some((en) =>
      en.schedule.batch.id === batchId
      && (!courseId || en.schedule.course.id === courseId)
      && (!isAdmin || !timing || (en.schedule.timing || 'UNSPECIFIED') === timing)
    ));
  }, [students, batchId, courseId, timing, isAdmin]);

  const selectedBatchLabel = batchCards.find((b) => b.id === batchId)?.code;
  const selectedCourseLabel = courseCards.find((c) => c.id === courseId)?.name;

  // What level are we showing right now?
  const atStudents = batchId != null && (batchId === PT_KEY || courseId != null && (!isAdmin || timing != null));
  const atTimings = isAdmin && batchId != null && batchId !== PT_KEY && courseId != null && timing == null;
  const atCourses = batchId != null && batchId !== PT_KEY && courseId == null;

  const reset = () => { setBatchId(null); setCourseId(null); setTiming(null); };

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        <button onClick={reset} className={`hover:underline ${!batchId ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
          All Batches
        </button>
        {batchId && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <button onClick={() => { setCourseId(null); setTiming(null); }} className={`hover:underline ${atCourses || (batchId === PT_KEY) ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
              {selectedBatchLabel || 'Batch'}
            </button>
          </>
        )}
        {courseId && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <button onClick={() => setTiming(null)} className={`hover:underline ${atTimings || (!isAdmin) ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
              {selectedCourseLabel || 'Course'}
            </button>
          </>
        )}
        {timing && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold">{TIMING_LABEL[timing] || timing}</span>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
      ) : !batchId ? (
        batchCards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">No students linked to you as Skill Advisor yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {batchCards.map((b) => (
              <button
                key={b.id}
                onClick={() => { setBatchId(b.id); setCourseId(null); setTiming(null); }}
                className="text-left border rounded-xl p-4 hover:border-blue-400 hover:shadow-sm transition-all bg-card"
              >
                <Building2 className="w-5 h-5 text-blue-500 mb-2" />
                <p className="font-semibold text-sm truncate">{b.code}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Users className="w-3 h-3" /> {b.count} student{b.count === 1 ? '' : 's'}</p>
              </button>
            ))}
          </div>
        )
      ) : atCourses ? (
        courseCards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">No courses found in this batch.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {courseCards.map((c) => (
              <button
                key={c.id}
                onClick={() => { setCourseId(c.id); setTiming(null); }}
                className="text-left border rounded-xl p-4 hover:border-indigo-400 hover:shadow-sm transition-all bg-card"
              >
                <BookOpen className="w-5 h-5 text-indigo-500 mb-2" />
                <p className="font-semibold text-sm truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Users className="w-3 h-3" /> {c.count} student{c.count === 1 ? '' : 's'}</p>
              </button>
            ))}
          </div>
        )
      ) : atTimings ? (
        timingCards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">No sub-batches found for this course.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {timingCards.map((t) => (
              <button
                key={t.timing}
                onClick={() => setTiming(t.timing)}
                className="text-left border rounded-xl p-4 hover:border-amber-400 hover:shadow-sm transition-all bg-card"
              >
                <Clock className="w-5 h-5 text-amber-500 mb-2" />
                <p className="font-semibold text-sm truncate">{TIMING_LABEL[t.timing] || t.timing}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Users className="w-3 h-3" /> {t.count} student{t.count === 1 ? '' : 's'}</p>
              </button>
            ))}
          </div>
        )
      ) : atStudents ? (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => (isAdmin && timing ? setTiming(null) : courseId ? setCourseId(null) : setBatchId(null))} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <p className="text-sm text-muted-foreground">{drilledStudents.length} student{drilledStudents.length === 1 ? '' : 's'}</p>
          </div>
          <StudentRosterTable students={drilledStudents} loading={false} emptyLabel="No students here" showAdvisor={isAdmin} onOpen={onOpenStudent} />
        </>
      ) : null}
    </div>
  );
}

// ── Filter & Report: checkbox batch/course filters + search, flat + export ─
function FilterReportSection({ students, isAdmin, onOpenStudent }: {
  students: AdvisedStudentRow[]; isAdmin: boolean; onOpenStudent: (id: string) => void;
}) {
  const [batchFilter, setBatchFilter] = useState<Set<string>>(new Set());
  const [courseFilter, setCourseFilter] = useState<Set<string>>(new Set());
  const [stageFilter, setStageFilter] = useState<Set<OnboardingStage>>(new Set());
  const [search, setSearch] = useState('');

  const batchOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) for (const en of s.enrollments) map.set(en.schedule.batch.id, en.schedule.batch.code);
    return Array.from(map.entries()).map(([id, code]) => ({ id, code })).sort((a, b) => a.code.localeCompare(b.code));
  }, [students]);

  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) for (const en of s.enrollments) map.set(en.schedule.course.id, en.schedule.course.name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const toggle = <T,>(set: Set<T>, setSet: (s: Set<T>) => void, id: T) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSet(next);
  };

  const results = useMemo(() => {
    let list = students;
    if (batchFilter.size > 0) list = list.filter((s) => s.enrollments.some((en) => batchFilter.has(en.schedule.batch.id)));
    if (courseFilter.size > 0) list = list.filter((s) => s.enrollments.some((en) => courseFilter.has(en.schedule.course.id)));
    if (stageFilter.size > 0) list = list.filter((s) => stageFilter.has(onboardingStage(s)));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => `${s.firstName} ${s.lastName} ${s.studentCode} ${s.phone}`.toLowerCase().includes(q));
    return list;
  }, [students, batchFilter, courseFilter, stageFilter, search]);

  const exportExcel = () => {
    const rows = results.map((s) => ({
      'Student Name': `${s.firstName} ${s.lastName}`,
      'Roll Number': s.studentCode,
      Track: s.track,
      Status: s.status,
      Onboarding: ONBOARDING_STAGE_LABEL[onboardingStage(s)],
      'Course / Batch': studentCourseLine(s),
      Phone: s.phone,
      Email: s.email || '',
      Portfolio: s.portfolio?.status || '',
      Certificates: s.certificateRequests.map((c) => `${c.type}${c.certificateNo ? ` (${c.certificateNo})` : ' (pending)'}`).join('; '),
      ...(isAdmin ? { 'Skill Advisor': s.skillAdvisor ? `${s.skillAdvisor.firstName} ${s.skillAdvisor.lastName}` : '' } : {}),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'My Students');
    XLSX.writeFile(wb, `my-students-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div className="lg:col-span-1 space-y-4">
        <div className="border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Batch
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {batchOptions.length === 0 && <p className="text-xs text-muted-foreground">No batches</p>}
            {batchOptions.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={batchFilter.has(b.id)} onChange={() => toggle(batchFilter, setBatchFilter, b.id)} className="rounded" />
                {b.code}
              </label>
            ))}
          </div>
        </div>
        <div className="border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Course
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {courseOptions.length === 0 && <p className="text-xs text-muted-foreground">No courses</p>}
            {courseOptions.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={courseFilter.has(c.id)} onChange={() => toggle(courseFilter, setCourseFilter, c.id)} className="rounded" />
                {c.name}
              </label>
            ))}
          </div>
        </div>
        <div className="border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Onboarding Stage
          </p>
          <div className="space-y-1.5">
            {(['profile', 'documents', 'approval', 'done'] as OnboardingStage[]).map((stage) => (
              <label key={stage} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={stageFilter.has(stage)} onChange={() => toggle(stageFilter, setStageFilter, stage)} className="rounded" />
                {ONBOARDING_STAGE_LABEL[stage]}
              </label>
            ))}
          </div>
        </div>
        {(batchFilter.size > 0 || courseFilter.size > 0 || stageFilter.size > 0) && (
          <button onClick={() => { setBatchFilter(new Set()); setCourseFilter(new Set()); setStageFilter(new Set()); }} className="text-xs text-blue-600 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <div className="lg:col-span-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, roll number, phone..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <p className="text-sm text-muted-foreground">{results.length} student{results.length === 1 ? '' : 's'}</p>
          <button onClick={exportExcel} disabled={results.length === 0} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
            <Download className="w-4 h-4" /> Export to Excel
          </button>
        </div>
        <StudentRosterTable students={results} loading={false} emptyLabel="No students match these filters" showAdvisor={isAdmin} onOpen={onOpenStudent} />
      </div>
    </div>
  );
}

// ── Full A-to-Z student dossier ─────────────────────────────────────────
interface DossierData {
  student: {
    id: string; firstName: string; lastName: string; studentCode: string; phone: string;
    track: string; status: string; photo?: string | null; email?: string | null;
    joiningDate: string; movedToPlacementAt?: string | null;
    profileCompletedAt?: string | null; documentsCompletedAt?: string | null; onboardingApprovedAt?: string | null;
    totalProgramFee?: number | null; amountPaid?: number | null; balanceAmount?: number | null; paymentMode?: string | null;
    user?: { email: string; lastLoginAt?: string | null } | null;
    portfolio?: { status: string; targetRole?: string | null; summary?: string | null; publicSlug?: string | null } | null;
    skillAdvisor?: EmployeeLite | null;
    enrollments: { id: string; schedule: { course: { name: string }; batch: { code: string } } }[];
    trainerFeedbacks: {
      id: string; certificateEligible: boolean; performanceRating?: number | null;
      placementReadinessNote?: string | null; course: { id: string; name: string };
    }[];
  };
  interviews: {
    id: string; companyName?: string | null; round: number; scheduledAt: string;
    outcome: string; notes?: string | null; rating?: number | null; feedback?: string | null;
    drive?: { id: string; partner: { id: string; name: string } } | null;
  }[];
  results: {
    id: string; result: string; package?: number | null; designation?: string | null;
    joiningDate?: string | null; offerLetterUrl?: string | null; companyName?: string | null;
    drive?: { id: string; partner: { name: string } } | null;
  }[];
  rankCard: {
    scheduleId: string; courseName: string; batchCode: string;
    rank: number | null; totalStudents: number;
    marksObtained: number; marksMax: number; percentage: number; classAverage: number;
    attendance: { present: number; absent: number; late: number; total: number };
    tests: { id: string; title: string; type: 'Offline' | 'Online'; marksObtained: number; maxMarks: number; date: string }[];
    projects: {
      id: string; projectTitle: string; moduleTitle: string; isCapstone: boolean;
      status: string; submittedAt: string; fileUrl?: string | null; linkUrl?: string | null; graded: boolean;
      grade?: number | null; maxGrade?: number | null; reviewNote?: string | null;
    }[];
    moduleFeedback: {
      id: string; moduleTitle: string; rating?: number | null;
      comments?: string | null; trainerName?: string | null; updatedAt: string;
    }[];
  }[];
  softskillFeedback: {
    id: string; performanceRating?: number | null; note?: string | null; createdAt: string;
    session: { topic: string; type: string; startDate: string };
    trainer?: EmployeeLite | null;
  }[];
  certificateRequests: {
    id: string; type: string; feeApprovedAt?: string | null; ldmApprovedAt?: string | null;
    certificateNo?: string | null; generatedAt?: string | null; course?: { name: string } | null;
  }[];
  onboarding: {
    allSigned: boolean;
    items: { id: string; title: string; signed: boolean; signedAt?: string | null }[];
  };
}

function StarRow({ rating }: { rating?: number | null }) {
  const r = Math.round(rating || 0);
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= r ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`} />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating?.toFixed(1) || 'N/A'}</span>
    </span>
  );
}

const DOSSIER_RESULT_COLOR: Record<string, string> = {
  SELECTED: 'bg-green-100 text-green-700', PENDING: 'bg-amber-100 text-amber-700', REJECTED: 'bg-red-100 text-red-700',
};
const DOSSIER_OUTCOME_COLOR: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700', SELECTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700', ON_HOLD: 'bg-amber-100 text-amber-700', NO_SHOW: 'bg-gray-100 text-gray-600',
};

function StudentDossierModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [profileTab, setProfileTab] = useState<'overview' | 'rank' | 'placement' | 'certificates'>('overview');

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/api/sales/my-students/${studentId}`);
        setData(r.data.data);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        setLoadErr(err.response?.data?.message || 'Failed to load student profile');
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId]);

  const s = data?.student;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
              {s ? `${s.firstName[0]}${s.lastName[0]}` : '·'}
            </div>
            <div>
              <h2 className="font-semibold text-base">{s ? `${s.firstName} ${s.lastName}` : 'Loading…'}</h2>
              <p className="text-xs text-muted-foreground">{s ? `${s.studentCode} · ${s.track}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex gap-1 px-6 pt-3 border-b">
          {([
            { key: 'overview', label: 'Overview', icon: UserIcon },
            { key: 'rank', label: 'Rank Card', icon: Trophy },
            { key: 'placement', label: `Placement (${data?.interviews.length ?? 0})`, icon: Briefcase },
            { key: 'certificates', label: 'Certificates & Feedback', icon: GraduationCap },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setProfileTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors mb-[-1px] ${profileTab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">Loading profile…</div>
          ) : loadErr ? (
            <div className="text-red-600 text-sm py-8 text-center">{loadErr}</div>
          ) : !data || !s ? null : profileTab === 'overview' ? (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide mb-2">Onboarding</h3>
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1"><span className={s.profileCompletedAt ? 'text-green-600' : 'text-muted-foreground'}>●</span> Profile {s.profileCompletedAt ? `done ${formatDate(s.profileCompletedAt)}` : 'pending'}</span>
                      <span className="flex items-center gap-1"><span className={s.documentsCompletedAt ? 'text-green-600' : 'text-muted-foreground'}>●</span> Documents {s.documentsCompletedAt ? `signed ${formatDate(s.documentsCompletedAt)}` : 'pending'}</span>
                      <span className="flex items-center gap-1"><span className={s.onboardingApprovedAt ? 'text-green-600' : 'text-muted-foreground'}>●</span> {s.onboardingApprovedAt ? `Approved ${formatDate(s.onboardingApprovedAt)}` : 'Awaiting approval'}</span>
                    </div>
                    <OnboardingStageBadge student={s} />
                  </div>
                  {data.onboarding.items.length > 0 && (
                    <div className="space-y-1 pt-1 border-t">
                      {data.onboarding.items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between text-xs py-1">
                          <span>{it.title}</span>
                          {it.signed ? (
                            <span className="text-green-700 font-medium">Signed{it.signedAt ? ` · ${formatDate(it.signedAt)}` : ''}</span>
                          ) : (
                            <span className="text-amber-600 font-medium">Pending</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide">Student Information</h3>
                <div className="bg-muted/20 rounded-xl p-4 space-y-2">
                  {[
                    { label: 'Phone', value: s.phone },
                    { label: 'Email', value: s.email || s.user?.email || '—' },
                    { label: 'Track', value: s.track },
                    { label: 'Status', value: s.status.replace(/_/g, ' ') },
                    { label: 'Joined', value: formatDate(s.joiningDate) },
                    { label: 'Moved to Pool', value: s.movedToPlacementAt ? formatDate(s.movedToPlacementAt) : '—' },
                    { label: 'Skill Advisor', value: s.skillAdvisor ? `${s.skillAdvisor.firstName} ${s.skillAdvisor.lastName}` : '—' },
                    { label: 'Total Fee', value: s.totalProgramFee != null ? formatCurrency(s.totalProgramFee) : '—' },
                    { label: 'Paid', value: s.amountPaid != null ? formatCurrency(s.amountPaid) : '—' },
                    { label: 'Balance', value: s.balanceAmount != null ? formatCurrency(s.balanceAmount) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-sm gap-2">
                      <span className="text-muted-foreground flex-shrink-0 w-28">{label}</span>
                      <span className="font-medium text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide">Courses Enrolled</h3>
                {s.enrollments.length === 0 && <p className="text-sm text-muted-foreground">Not enrolled in a course (Placement Training).</p>}
                {s.enrollments.map((en) => (
                  <div key={en.id} className="bg-muted/20 rounded-xl p-4 flex items-center gap-3">
                    <BookOpen className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{en.schedule.course.name}</p>
                      <p className="text-xs text-muted-foreground">Batch: {en.schedule.batch.code}</p>
                    </div>
                  </div>
                ))}
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide mt-4">Portfolio</h3>
                <div className={`rounded-xl p-4 text-sm ${s.portfolio?.status === 'APPROVED' ? 'bg-green-50 text-green-700' : s.portfolio?.status === 'SUBMITTED' ? 'bg-blue-50 text-blue-700' : 'bg-muted/20 text-muted-foreground'}`}>
                  {s.portfolio ? (
                    <>
                      <span className="font-medium">{s.portfolio.status}</span>
                      {s.portfolio.targetRole && <span> · {s.portfolio.targetRole}</span>}
                      {s.portfolio.publicSlug && (
                        <a href={`/portfolio/${s.portfolio.publicSlug}`} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 hover:underline mt-1">
                          View public portfolio
                        </a>
                      )}
                    </>
                  ) : <span>Not submitted</span>}
                </div>
                {s.trainerFeedbacks.length > 0 && (
                  <>
                    <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide mt-4">Trainer Feedback</h3>
                    {s.trainerFeedbacks.map((tf) => (
                      <div key={tf.id} className="bg-muted/20 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{tf.course.name}</span>
                          <StarRow rating={tf.performanceRating} />
                        </div>
                        {tf.placementReadinessNote && <p className="text-xs text-muted-foreground">"{tf.placementReadinessNote}"</p>}
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tf.certificateEligible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {tf.certificateEligible ? '✓ Certificate Eligible' : '✗ Not Eligible'}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
            </div>
          ) : profileTab === 'rank' ? (
            <div className="space-y-6">
              {data.rankCard.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No marks data available.
                </div>
              ) : data.rankCard.map((rc) => (
                <div key={rc.scheduleId} className="border rounded-xl overflow-hidden">
                  <div className="bg-indigo-50 px-5 py-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-indigo-900">{rc.courseName}</h4>
                      <p className="text-xs text-indigo-600">Batch {rc.batchCode}</p>
                    </div>
                    {rc.rank !== null && (
                      <div className="text-center bg-white rounded-xl px-4 py-2 shadow-sm border">
                        <p className="text-2xl font-bold text-indigo-700">#{rc.rank}</p>
                        <p className="text-xs text-muted-foreground">of {rc.totalStudents}</p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 divide-x border-b">
                    {[
                      { label: 'Marks', value: `${rc.marksObtained} / ${rc.marksMax}` },
                      { label: 'Percentage', value: `${rc.percentage}%` },
                      { label: 'Class Avg', value: `${rc.classAverage}%` },
                    ].map(({ label, value }) => (
                      <div key={label} className="px-4 py-3 text-center">
                        <p className="text-lg font-bold">{value}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                  {rc.attendance.total > 0 && (
                    <div className="p-4 border-b space-y-2">
                      <h5 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5" /> Attendance
                      </h5>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-semibold text-green-700">{rc.attendance.present} present</span>
                        {rc.attendance.late > 0 && <span className="font-semibold text-amber-600">{rc.attendance.late} late</span>}
                        {rc.attendance.absent > 0 && <span className="font-semibold text-red-600">{rc.attendance.absent} absent</span>}
                        <span className="text-muted-foreground">of {rc.attendance.total} classes</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {Math.round(((rc.attendance.present + rc.attendance.late) / rc.attendance.total) * 100)}%
                        </span>
                      </div>
                    </div>
                  )}
                  {rc.tests.length > 0 && (
                    <div className="p-4 border-b space-y-2">
                      <h5 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1">
                        <ListChecks className="w-3.5 h-3.5" /> Test Marks
                      </h5>
                      {rc.tests.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${t.type === 'Online' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{t.type}</span>
                            <p className="text-sm font-medium">{t.title}</p>
                          </div>
                          <p className="text-sm font-bold flex-shrink-0">{t.marksObtained}/{t.maxMarks}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {rc.projects.length > 0 && (
                    <div className="p-4 space-y-2">
                      <h5 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1">
                        <Award className="w-3.5 h-3.5" /> Projects
                      </h5>
                      {rc.projects.map((p) => (
                        <div key={p.id} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0">
                          <div>
                            <p className="text-sm font-medium">{p.projectTitle}{p.isCapstone ? ' 🎓' : ''}</p>
                            <p className="text-xs text-muted-foreground">{p.moduleTitle}</p>
                            {(p.fileUrl || p.linkUrl) && (
                              <a href={p.fileUrl ? fileUrl(p.fileUrl) : p.linkUrl!} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                                View submission
                              </a>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${p.status === 'REVIEWED' ? 'bg-green-100 text-green-700' : p.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                            {p.graded && <p className="text-xs font-bold mt-0.5">{p.grade}/{p.maxGrade}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {rc.moduleFeedback.length > 0 && (
                    <div className="p-4 border-t space-y-2">
                      <h5 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" /> Module Feedback
                      </h5>
                      {rc.moduleFeedback.map((f) => (
                        <div key={f.id} className="py-1.5 border-b last:border-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{f.moduleTitle}</span>
                            {f.rating != null && <StarRow rating={f.rating} />}
                          </div>
                          {f.comments && <p className="text-xs text-muted-foreground mt-0.5">"{f.comments}"</p>}
                          <p className="text-[11px] text-muted-foreground mt-0.5">{f.trainerName || 'Trainer'} · {formatDate(f.updatedAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : profileTab === 'placement' ? (
            <div className="space-y-6">
              {data.results.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide">Placement Results</h3>
                  {data.results.map((r) => (
                    <div key={r.id} className={`rounded-xl p-4 space-y-1 ${r.result === 'SELECTED' ? 'bg-green-50' : 'bg-muted/20'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.drive?.partner.name || r.companyName || 'Direct offer'}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DOSSIER_RESULT_COLOR[r.result] || 'bg-gray-100 text-gray-600'}`}>{r.result}</span>
                      </div>
                      {r.designation && <p className="text-xs text-muted-foreground">{r.designation}{r.package ? ` · ${r.package} LPA` : ''}</p>}
                      {r.offerLetterUrl && (
                        <a href={fileUrl(r.offerLetterUrl)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> View Offer Letter
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide">Interviews</h3>
                {data.interviews.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No interviews recorded yet.
                  </div>
                ) : data.interviews.map((iv) => (
                  <div key={iv.id} className="border rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{iv.drive?.partner.name || iv.companyName || 'Unknown Company'} — Round {iv.round}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(iv.scheduledAt)}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${DOSSIER_OUTCOME_COLOR[iv.outcome] || 'bg-gray-100 text-gray-700'}`}>{iv.outcome}</span>
                    </div>
                    {iv.rating != null && <StarRow rating={iv.rating} />}
                    {iv.notes && <p className="text-xs text-muted-foreground border-l-2 pl-2">{iv.notes}</p>}
                    {iv.feedback && <p className="text-xs text-muted-foreground border-l-2 border-blue-200 pl-2">Feedback: {iv.feedback}</p>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide">Certificate Status</h3>
                {data.certificateRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No certificate requests yet.</p>
                ) : data.certificateRequests.map((c) => (
                  <div key={c.id} className="bg-muted/20 rounded-xl p-4 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{c.type === 'COURSE_COMPLETION' ? 'Course Completion' : 'Internship'}{c.course?.name ? ` — ${c.course.name}` : ''}</p>
                      <p className="text-xs text-muted-foreground">
                        Fee: {c.feeApprovedAt ? '✓ approved' : 'pending'} · LDM: {c.ldmApprovedAt ? '✓ approved' : 'pending'}
                      </p>
                    </div>
                    {c.certificateNo ? (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">{c.certificateNo}</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">Not issued</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide">Internal Feedback (Softskill / Aptitude)</h3>
                <p className="text-[11px] text-muted-foreground -mt-1">Internal trainer notes — never shown to the student.</p>
                {data.softskillFeedback.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No internal feedback recorded yet.</p>
                ) : data.softskillFeedback.map((f) => (
                  <div key={f.id} className="bg-muted/20 rounded-xl p-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{f.session.topic}</span>
                      {f.performanceRating != null && <StarRow rating={f.performanceRating} />}
                    </div>
                    {f.note && <p className="text-xs text-muted-foreground">"{f.note}"</p>}
                    <p className="text-[11px] text-muted-foreground">
                      {f.trainer ? `${f.trainer.firstName} ${f.trainer.lastName}` : 'Trainer'} · {formatDate(f.session.startDate)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function MyStudentsPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.SALES;
  const isAdmin = hasModule('SALES', 'ADMIN');

  const [students, setStudents] = useState<AdvisedStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<'browse' | 'report'>('browse');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(isAdmin ? '/api/sales/advised-students' : '/api/sales/my-students');
      setStudents(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { if (level) load(); }, [level, load]);

  if (loaded && !level) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <Lock className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">No access to My Students</p>
          <p className="text-sm text-muted-foreground">
            Ask someone with Master Control to grant you Sales module access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Students</h1>
          <p className="text-muted-foreground text-sm">
            {isAdmin ? 'Every student with a Skill Advisor assigned, across the team' : 'Students linked to you as Skill Advisor'}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex items-center gap-1 border-b">
        {([
          { id: 'browse' as const, label: 'Browse', icon: Building2 },
          { id: 'report' as const, label: 'Filter & Report', icon: Filter },
        ]).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {view === 'browse' ? (
        <BrowseSection students={students} loading={loading} isAdmin={isAdmin} onOpenStudent={setOpenId} />
      ) : (
        <FilterReportSection students={students} isAdmin={isAdmin} onOpenStudent={setOpenId} />
      )}

      {openId && <StudentDossierModal studentId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
