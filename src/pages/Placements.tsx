import { Fragment, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { BASE_URL } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';

// Files uploaded by the backend (project submissions) come back as relative
// paths like "/uploads/...". A bare <a href> resolves those against the
// frontend's own origin, not the API. Absolute URLs (a pasted link
// submission) are left untouched.
const fileUrl = (path: string) => (/^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`);
import { useModuleAccess } from '@/hooks/useModuleAccess';
import * as XLSX from 'xlsx';
import {
  Lock, Plus, X, Building2, CalendarClock, GraduationCap, TrendingUp, Users,
  CheckCircle2, XCircle, AlertTriangle, MessageSquare, FileUp, ListChecks,
  Briefcase, BarChart2, Search, User, Trophy, Star, Phone, MapPin,
  BookOpen, Award, ChevronDown, ChevronRight, ExternalLink, Percent, IndianRupee, Download,
  Loader2, Rocket, FileText,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from 'recharts';

type DriveStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
type ResultStatus = 'PENDING' | 'SELECTED' | 'REJECTED';
type InterviewOutcome = 'SCHEDULED' | 'SELECTED' | 'REJECTED' | 'NO_SHOW' | 'PENDING';
type SoftskillType = 'SOFTSKILL' | 'APTITUDE' | 'SK_APT';
const SOFTSKILL_TYPE_LABEL: Record<SoftskillType, string> = { SOFTSKILL: 'Softskill', APTITUDE: 'Aptitude', SK_APT: 'Softskill & Aptitude' };
interface ScheduleOption { id: string; code?: string | null; timing: string; batchCode: string; courseName: string; activeStudentCount: number; }

interface Partner { id: string; name: string; industry?: string | null; _count?: { drives: number }; }
interface Drive {
  id: string; role: string; driveDate: string; status: DriveStatus;
  partner: { id: string; name: string; industry?: string | null };
  _count?: { results: number; candidates?: number; interviews?: number };
}
interface PlacementResultRow {
  id: string; studentName: string; result: string; package?: number | null; createdAt: string;
  designation?: string | null; joiningDate?: string | null; offerLetterUrl?: string | null;
  offerStatus?: string;
}
interface Stats { totalPartners: number; upcomingDrives: number; totalPlaced: number; avgPackage: number; }

interface PoolTrainerFeedback {
  id: string; certificateEligible: boolean; performanceRating?: number | null;
  placementReadinessNote?: string | null; jrpToIopRecommended?: boolean | null;
  course: { id: string; name: string };
}
interface PoolStudent {
  id: string; studentCode: string; firstName: string; lastName: string; phone: string;
  track: 'JRP' | 'IOP' | 'PAP' | 'PT'; movedToPlacementAt?: string | null;
  photo?: string | null;
  enrollments: { id: string; schedule: { course: { name: string }; batch: { code: string } } }[];
  trainerFeedbacks?: PoolTrainerFeedback[];
  placementReadiness: { ready: boolean; missing: string[] };
  interviewSummary: { count: number; lastOutcome: string | null };
  isPlaced: boolean;
  placedInfo?: { id: string; package: number | null; designation: string | null; offerStatus: string } | null;
  sla: { daysInPool: number | null; slaAtRisk: boolean };
}

interface Interview {
  id: string; companyName?: string | null; round: number; interviewerName?: string | null;
  scheduledAt: string; outcome: InterviewOutcome; notes?: string | null;
  rating?: number | null; feedback?: string | null; feedbackGivenAt?: string | null;
  drive?: { id: string; partner: { id: string; name: string } } | null;
  feedbackGivenBy?: { id: string; firstName: string; lastName: string } | null;
  student?: { id: string; firstName: string; lastName: string; studentCode: string };
}

interface DriveCandidate {
  id: string; status: 'SHORTLISTED' | 'CONFIRMED' | 'WITHDRAWN' | 'REJECTED'; notes?: string | null;
  student: { id: string; firstName: string; lastName: string; studentCode: string; track: string };
}

interface SoftskillSession {
  id: string; type: SoftskillType; topic: string; startDate: string; endDate?: string | null; notes?: string | null;
  trainer?: { id: string; firstName: string; lastName: string } | null;
  _count?: { attendances: number };
}

interface ReportData {
  month: string;
  totals: {
    totalStudents: number; readyCount: number; notReadyCount: number;
    firstInterviewGivenCount: number; placedCount: number; drivesThisMonth: number;
  };
  drivesThisMonthByStatus: Record<string, number>;
  byBatch: { batchCode: string; total: number; ready: number; notReady: number; placed: number; firstInterviewGiven: number }[];
}

interface AnalyticsData {
  placementRate: number;
  poolCount: number;
  placedCount: number;
  funnel: { shortlisted: number; interviewed: number; selected: number };
  packageDistribution: { min: number; max: number; avg: number; median: number; count: number } | null;
  offerResponseBreakdown: Record<string, number>;
  trend: { month: string; placements: number }[];
}

const STATUSES: DriveStatus[] = ['SCHEDULED', 'COMPLETED', 'CANCELLED'];
const STATUS_COLOR: Record<DriveStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};
const RESULT_STATUSES: ResultStatus[] = ['PENDING', 'SELECTED', 'REJECTED'];
const RESULT_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  SELECTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};
const OFFER_STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-red-100 text-red-700',
};
const OUTCOME_COLOR: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  PENDING: 'bg-amber-100 text-amber-700',
  SELECTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  NO_SHOW: 'bg-gray-200 text-gray-700',
};
const INTERVIEW_OUTCOMES: InterviewOutcome[] = ['SCHEDULED', 'PENDING', 'SELECTED', 'REJECTED', 'NO_SHOW'];
const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const errMsg = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || fallback;
};

export default function PlacementsPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.PLACEMENTS;
  const canEdit = hasModule('PLACEMENTS', 'EDIT');

  type Tab = 'drives' | 'partners' | 'pool' | 'softskill' | 'reports' | 'analytics';
  const isAdmin = hasModule('PLACEMENTS', 'ADMIN');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab>(tabFromUrl || 'drives');
  const setTab = (t: Tab) => { setTabState(t); setSearchParams({ tab: t }, { replace: true }); };
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== tab) setTabState(tabFromUrl);
  }, [tabFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drives, setDrives] = useState<Drive[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddDrive, setShowAddDrive] = useState(false);
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [showBulkPush, setShowBulkPush] = useState(false);
  const [showAddPt, setShowAddPt] = useState(false);
  const [resultsDrive, setResultsDrive] = useState<Drive | null>(null);
  const [saving, setSaving] = useState(false);

  const [pool, setPool] = useState<PoolStudent[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [poolFilter, setPoolFilter] = useState<'all' | 'ready' | 'not_ready' | 'placed' | 'sla_at_risk'>('all');
  const [poolSearch, setPoolSearch] = useState('');
  const [poolCourseId, setPoolCourseId] = useState('');
  const [poolBatchId, setPoolBatchId] = useState('');
  const [filterOptions, setFilterOptions] = useState<{ courses: { id: string; name: string }[]; batches: { id: string; code: string }[]; schedules: ScheduleOption[] }>({ courses: [], batches: [], schedules: [] });
  const [shortlistStudent, setShortlistStudent] = useState<PoolStudent | null>(null);
  const [interviewStudent, setInterviewStudent] = useState<PoolStudent | null>(null);
  const [offerStudent, setOfferStudent] = useState<PoolStudent | null>(null);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [studentInterviews, setStudentInterviews] = useState<Record<string, Interview[]>>({});
  const [profileStudent, setProfileStudent] = useState<PoolStudent | null>(null);

  const [sessions, setSessions] = useState<SoftskillSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [attendanceSession, setAttendanceSession] = useState<SoftskillSession | null>(null);
  const [contentSession, setContentSession] = useState<SoftskillSession | null>(null);

  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [drivesRes, partnersRes, statsRes] = await Promise.all([
        api.get('/api/placements/drives'),
        api.get('/api/placements/partners'),
        api.get('/api/placements/stats'),
      ]);
      setDrives(drivesRes.data.data);
      setPartners(partnersRes.data.data);
      setStats(statsRes.data.data);
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to load placements data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (level) fetchAll(); }, [level, fetchAll]);

  const fetchPool = useCallback(async () => {
    setPoolLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (poolCourseId) params.courseId = poolCourseId;
      if (poolBatchId) params.batchId = poolBatchId;
      const res = await api.get('/api/placements/pool', { params });
      setPool(res.data.data);
      setPoolLoaded(true);
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to load placement pool'));
    } finally {
      setPoolLoading(false);
    }
  }, [poolCourseId, poolBatchId]);

  useEffect(() => { if (tab === 'pool') fetchPool(); }, [tab, poolCourseId, poolBatchId, fetchPool]);

  useEffect(() => {
    if (tab !== 'pool' || filterOptions.courses.length || filterOptions.batches.length) return;
    api.get('/api/placements/filters')
      .then((res) => setFilterOptions(res.data.data))
      .catch(() => { /* non-fatal */ });
  }, [tab, filterOptions]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    setError('');
    try {
      const res = await api.get('/api/placements/reports', { params: { month: reportMonth } });
      setReport(res.data.data);
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to load report'));
    } finally {
      setReportLoading(false);
    }
  }, [reportMonth]);

  useEffect(() => { if (tab === 'reports') fetchReport(); }, [tab, reportMonth, fetchReport]);

  const fetchSessions = useCallback(async () => {
    setError('');
    try {
      const res = await api.get('/api/placements/softskill-sessions');
      setSessions(res.data.data);
      setSessionsLoaded(true);
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to load softskill sessions'));
    }
  }, []);

  useEffect(() => { if (tab === 'softskill' && !sessionsLoaded) fetchSessions(); }, [tab, sessionsLoaded, fetchSessions]);

  const toggleStudentInterviews = async (student: PoolStudent) => {
    if (expandedStudentId === student.id) { setExpandedStudentId(null); return; }
    setExpandedStudentId(student.id);
    if (!studentInterviews[student.id]) {
      try {
        const res = await api.get('/api/placements/interviews', { params: { studentId: student.id } });
        setStudentInterviews((prev) => ({ ...prev, [student.id]: res.data.data }));
      } catch (err: unknown) {
        setError(errMsg(err, 'Failed to load interviews'));
      }
    }
  };

  const refreshStudentInterviews = async (studentId: string) => {
    try {
      const res = await api.get('/api/placements/interviews', { params: { studentId } });
      setStudentInterviews((prev) => ({ ...prev, [studentId]: res.data.data }));
    } catch { /* non-fatal */ }
  };

  const updateDriveStatus = async (id: string, status: DriveStatus) => {
    try {
      await api.put(`/api/placements/drives/${id}`, { status });
      fetchAll();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to update drive status'));
    }
  };

  const respondToOffer = async (resultId: string, offerStatus: 'ACCEPTED' | 'DECLINED') => {
    try {
      await api.put(`/api/placements/results/${resultId}/offer-response`, { offerStatus });
      fetchPool();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to record offer response'));
    }
  };

  if (loaded && !level) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <Lock className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">No access to Placements</p>
          <p className="text-sm text-muted-foreground">Ask someone with Master Control to grant you access to this module.</p>
        </div>
      </div>
    );
  }

  const readyCount = pool.filter((s) => s.placementReadiness?.ready).length;
  const placedCount = pool.filter((s) => s.isPlaced).length;
  const slaAtRiskCount = pool.filter((s) => s.sla?.slaAtRisk).length;
  const filteredPool = pool.filter((s) => {
    if (poolFilter === 'ready') { if (!s.placementReadiness?.ready) return false; }
    else if (poolFilter === 'not_ready') { if (s.placementReadiness?.ready) return false; }
    else if (poolFilter === 'placed') { if (!s.isPlaced) return false; }
    else if (poolFilter === 'sla_at_risk') { if (!s.sla?.slaAtRisk) return false; }
    if (poolSearch) {
      const q = poolSearch.toLowerCase();
      const name = `${s.firstName} ${s.lastName}`.toLowerCase();
      if (!name.includes(q) && !s.studentCode.toLowerCase().includes(q) && !s.phone.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Placements</h1>
          <p className="text-muted-foreground text-sm">Hiring partners, drives, and placement results</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setShowAddPartner(true)} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted">
              <Plus className="w-4 h-4" /> Partner
            </button>
            <button onClick={() => setShowAddDrive(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Drive
            </button>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Hiring Partners" value={stats?.totalPartners ?? 0} />
        <StatCard icon={CalendarClock} label="Upcoming Drives" value={stats?.upcomingDrives ?? 0} />
        <StatCard icon={GraduationCap} label="Total Placed" value={stats?.totalPlaced ?? 0} />
        <StatCard icon={TrendingUp} label="Avg Package" value={fmt(stats?.avgPackage ?? 0)} />
      </div>

      <div className="flex gap-2 border-b overflow-x-auto">
        <button onClick={() => setTab('drives')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === 'drives' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground'}`}>Drives</button>
        <button onClick={() => setTab('partners')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === 'partners' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground'}`}>Partners</button>
        <button onClick={() => setTab('pool')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === 'pool' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground'}`}>Placement Pool{poolLoaded ? ` (${pool.length})` : ''}</button>
        <button onClick={() => setTab('softskill')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === 'softskill' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground'}`}>Softskill &amp; Aptitude</button>
        <button onClick={() => setTab('reports')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === 'reports' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground'}`}>Reports</button>
        {isAdmin && (
          <button onClick={() => setTab('analytics')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === 'analytics' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground'}`}>Analytics</button>
        )}
      </div>

      {tab === 'pool' ? (
        <div className="bg-card border rounded-xl overflow-hidden">
          {/* Header — search + filters */}
          <div className="px-4 py-3 border-b bg-muted/30 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Students pushed in by the Production Manager.
                {poolLoaded && (
                  <span className="font-medium text-foreground">
                    {' '}{readyCount} ready · {placedCount} placed · {pool.length} total
                    {slaAtRiskCount > 0 && <span className="text-red-600"> · {slaAtRiskCount} SLA at risk</span>}
                  </span>
                )}
              </p>
              <div className="flex gap-2 items-center flex-wrap">
                <select value={poolCourseId} onChange={(e) => setPoolCourseId(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5 bg-background">
                  <option value="">All Courses</option>
                  {filterOptions.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={poolBatchId} onChange={(e) => setPoolBatchId(e.target.value)} className="text-xs border rounded-lg px-2 py-1.5 bg-background">
                  <option value="">All Batches</option>
                  {filterOptions.batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
                </select>
                {canEdit && (
                  <button onClick={() => setShowAddPt(true)} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-muted/50 flex items-center gap-1.5 font-medium">
                    <Plus className="w-3.5 h-3.5" /> Add PT Student
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => setShowBulkPush(true)} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-muted/50 flex items-center gap-1.5 font-medium">
                    <FileUp className="w-3.5 h-3.5" /> Bulk Upload
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={poolSearch}
                  onChange={(e) => setPoolSearch(e.target.value)}
                  placeholder="Search name, code, phone…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {/* Filter pills */}
              <div className="flex gap-1">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'ready', label: '✓ Ready' },
                  { key: 'not_ready', label: '⚠ Not Ready' },
                  { key: 'placed', label: '🎓 Placed' },
                  { key: 'sla_at_risk', label: '⏰ SLA Risk' },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setPoolFilter(key)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${poolFilter === key ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Batch / Course</th>
                <th className="px-4 py-3">Readiness</th>
                <th className="px-4 py-3">Interview Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {poolLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : filteredPool.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Users className="w-6 h-6 text-muted-foreground/40" />
                    No students match this filter.
                  </div>
                </td></tr>
              ) : filteredPool.map((s) => (
                <Fragment key={s.id}>
                  <tr className="hover:bg-muted/30">
                    {/* Student */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                          {s.firstName[0]}{s.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium">{s.firstName} {s.lastName}</p>
                          <p className="text-xs text-muted-foreground">{s.studentCode} · {s.phone}</p>
                        </div>
                      </div>
                    </td>

                    {/* Track */}
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{s.track}</span>
                    </td>

                    {/* Batch / Course */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.enrollments.map((en) => (
                        <p key={en.id}>{en.schedule.batch.code} · {en.schedule.course.name}</p>
                      ))}
                      {s.enrollments.length === 0 && '—'}
                    </td>

                    {/* Readiness */}
                    <td className="px-4 py-3">
                      {s.isPlaced ? (
                        <div>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-blue-50 text-blue-700">
                            <GraduationCap className="w-3 h-3" /> Placed
                          </span>
                          {s.placedInfo?.designation && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{s.placedInfo.designation}{s.placedInfo.package ? ` · ₹${s.placedInfo.package.toLocaleString('en-IN')}` : ''}</p>
                          )}
                          {s.placedInfo && (
                            <div className="mt-1">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded w-fit inline-block ${OFFER_STATUS_COLOR[s.placedInfo.offerStatus] || 'bg-gray-100 text-gray-600'}`}>
                                Offer: {s.placedInfo.offerStatus}
                              </span>
                              {canEdit && s.placedInfo.offerStatus === 'PENDING' && (
                                <div className="flex gap-2 mt-1">
                                  <button onClick={() => respondToOffer(s.placedInfo!.id, 'ACCEPTED')} className="text-[11px] text-green-600 hover:underline">Accept</button>
                                  <button onClick={() => respondToOffer(s.placedInfo!.id, 'DECLINED')} className="text-[11px] text-red-600 hover:underline">Decline</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : s.placementReadiness?.ready ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 w-fit bg-green-50 text-green-700">
                          <CheckCircle2 className="w-3 h-3" /> Ready
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 w-fit bg-amber-50 text-amber-700">
                            <AlertTriangle className="w-3 h-3" /> Not Yet Ready
                          </span>
                          {s.placementReadiness?.missing.slice(0, 2).map((m, i) => (
                            <span key={i} className="text-[11px] text-muted-foreground">• {m}</span>
                          ))}
                          {(s.placementReadiness?.missing.length || 0) > 2 && (
                            <span className="text-[11px] text-muted-foreground">+{s.placementReadiness.missing.length - 2} more</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Interview Status — the key new column */}
                    <td className="px-4 py-3">
                      {s.sla?.slaAtRisk && (
                        <span
                          className="block text-[11px] font-medium px-1.5 py-0.5 rounded w-fit mb-1 bg-red-100 text-red-700"
                          title={`${s.sla.daysInPool} days in the pool with fewer than 3 interviews — SLA target is 3 interviews within 90 days`}
                        >
                          ⏰ SLA at risk · {s.sla.daysInPool}d in pool
                        </span>
                      )}
                      {(s.interviewSummary?.count ?? 0) === 0 ? (
                        <span className="text-xs text-muted-foreground/60 italic">No interviews yet</span>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-xs font-medium text-foreground">
                            {s.interviewSummary.count} interview{s.interviewSummary.count !== 1 ? 's' : ''}
                          </span>
                          {s.interviewSummary.lastOutcome && (
                            <span className={`block text-[11px] font-medium px-1.5 py-0.5 rounded w-fit ${OUTCOME_COLOR[s.interviewSummary.lastOutcome] || 'bg-gray-100 text-gray-600'}`}>
                              Last: {s.interviewSummary.lastOutcome}
                            </span>
                          )}
                          <button onClick={() => toggleStudentInterviews(s)} className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5">
                            {expandedStudentId === s.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            {expandedStudentId === s.id ? 'Hide' : 'Show'} history
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <button onClick={() => setProfileStudent(s)} className="text-xs text-indigo-600 hover:underline text-left flex items-center gap-1">
                          <User className="w-3 h-3" /> View Profile
                        </button>
                        {canEdit && (
                          <>
                            <button
                              disabled={!s.placementReadiness?.ready}
                              onClick={() => setShortlistStudent(s)}
                              title={!s.placementReadiness?.ready ? 'Only Ready students can be shortlisted' : ''}
                              className="text-xs text-blue-600 hover:underline disabled:text-muted-foreground/40 disabled:no-underline text-left"
                            >
                              Shortlist for Drive
                            </button>
                            <button onClick={() => setInterviewStudent(s)} className="text-xs text-blue-600 hover:underline text-left">
                              Add Interview
                            </button>
                            <button onClick={() => setOfferStudent(s)} className="text-xs text-green-600 hover:underline text-left">
                              Give Offer
                            </button>
                          </>
                        )}
                        {(s.interviewSummary?.count ?? 0) === 0 && (
                          <button onClick={() => toggleStudentInterviews(s)} className="text-xs text-muted-foreground hover:underline text-left">
                            View Interviews
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedStudentId === s.id && (
                    <tr>
                      <td colSpan={6} className="px-4 py-3 bg-muted/20">
                        <InterviewList interviews={studentInterviews[s.id] || []} canEdit={canEdit} onChanged={() => refreshStudentInterviews(s.id)} setError={setError} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === 'softskill' ? (
        <div className="space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <button onClick={() => setShowAddSession(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                <Plus className="w-4 h-4" /> Session
              </button>
            </div>
          )}
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Topic</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Trainer</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3">Content</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!sessionsLoaded ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : sessions.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No sessions scheduled yet</td></tr>
                ) : sessions.map((sess) => (
                  <tr key={sess.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sess.type === 'SOFTSKILL' ? 'bg-purple-100 text-purple-700' : sess.type === 'APTITUDE' ? 'bg-teal-100 text-teal-700' : 'bg-indigo-100 text-indigo-700'}`}>{SOFTSKILL_TYPE_LABEL[sess.type]}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{sess.topic}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(sess.startDate).toLocaleDateString()}{sess.endDate ? ` – ${new Date(sess.endDate).toLocaleDateString()}` : ''}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{sess.trainer ? `${sess.trainer.firstName} ${sess.trainer.lastName}` : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setAttendanceSession(sess)} className="text-blue-600 hover:underline text-sm font-medium">
                        {sess._count?.attendances ?? 0} student{sess._count?.attendances === 1 ? '' : 's'}{canEdit ? ' · Manage' : ''}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setContentSession(sess)} className="text-blue-600 hover:underline text-sm font-medium">
                        {canEdit ? 'Release' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'reports' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">Placement performance for the selected month.</p>
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5"
            />
          </div>
          {reportLoading || !report ? (
            <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground text-sm">Loading report...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard icon={Users} label="Total Students" value={report.totals.totalStudents} />
                <StatCard icon={CheckCircle2} label="Ready" value={report.totals.readyCount} />
                <StatCard icon={AlertTriangle} label="Not Ready" value={report.totals.notReadyCount} />
                <StatCard icon={MessageSquare} label="1st Interview Given" value={report.totals.firstInterviewGivenCount} />
                <StatCard icon={GraduationCap} label="Placed" value={report.totals.placedCount} />
                <StatCard icon={CalendarClock} label="Drives This Month" value={report.totals.drivesThisMonth} />
              </div>

              {Object.keys(report.drivesThisMonthByStatus).length > 0 && (
                <div className="bg-card border rounded-xl p-4">
                  <p className="text-sm font-medium mb-2">Drives This Month by Status</p>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(report.drivesThisMonthByStatus).map(([status, count]) => (
                      <span key={status} className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLOR[status as DriveStatus] || 'bg-gray-100 text-gray-700'}`}>
                        {status}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-card border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <p className="text-sm font-medium">Batch-wise Breakdown</p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Batch</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Ready</th>
                      <th className="px-4 py-3">Not Ready</th>
                      <th className="px-4 py-3">1st Interview Given</th>
                      <th className="px-4 py-3">Placed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.byBatch.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No data for this month</td></tr>
                    ) : report.byBatch.map((b) => (
                      <tr key={b.batchCode} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{b.batchCode}</td>
                        <td className="px-4 py-3">{b.total}</td>
                        <td className="px-4 py-3 text-green-700">{b.ready}</td>
                        <td className="px-4 py-3 text-amber-700">{b.notReady}</td>
                        <td className="px-4 py-3">{b.firstInterviewGiven}</td>
                        <td className="px-4 py-3 text-blue-700">{b.placed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : tab === 'analytics' && isAdmin ? (
        <PlacementsAnalyticsPanel />
      ) : tab === 'drives' ? (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Results</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : drives.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No drives scheduled</td></tr>
              ) : drives.map((d) => (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{d.partner.name}{d.partner.industry && <p className="text-xs text-muted-foreground">{d.partner.industry}</p>}</td>
                  <td className="px-4 py-3">{d.role}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(d.driveDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setResultsDrive(d)} className="text-blue-600 hover:underline text-sm font-medium">
                      {d._count?.results ?? 0} {canEdit ? '· Manage' : ''}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <select
                        value={d.status}
                        onChange={(ev) => updateDriveStatus(d.id, ev.target.value as DriveStatus)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${STATUS_COLOR[d.status]}`}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLOR[d.status]}`}>{d.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Industry</th><th className="px-4 py-3">Drives</th></tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : partners.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No partners yet</td></tr>
              ) : partners.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.industry || '—'}</td>
                  <td className="px-4 py-3">{p._count?.drives ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddPartner && (
        <AddPartnerModal saving={saving} setSaving={setSaving} onClose={() => setShowAddPartner(false)} onSaved={() => { setShowAddPartner(false); fetchAll(); }} setError={setError} />
      )}
      {showBulkPush && (
        <BulkPushToPoolModal onClose={() => setShowBulkPush(false)} setError={setError} onSaved={() => fetchPool()} />
      )}
      {showAddPt && (
        <AddPtStudentModal onClose={() => setShowAddPt(false)} setError={setError} onSaved={() => fetchPool()} />
      )}
      {showAddDrive && (
        <AddDriveModal partners={partners} saving={saving} setSaving={setSaving} onClose={() => setShowAddDrive(false)} onSaved={() => { setShowAddDrive(false); fetchAll(); }} setError={setError} />
      )}
      {resultsDrive && (
        <DriveResultsModal
          drive={resultsDrive}
          canEdit={canEdit}
          setError={setError}
          onClose={() => setResultsDrive(null)}
          onChanged={fetchAll}
          respondToOffer={respondToOffer}
        />
      )}
      {profileStudent && (
        <PlacementStudentProfileModal student={profileStudent} onClose={() => setProfileStudent(null)} />
      )}
      {shortlistStudent && (
        <ShortlistModal
          student={shortlistStudent}
          drives={drives.filter((d) => d.status === 'SCHEDULED')}
          setError={setError}
          onClose={() => setShortlistStudent(null)}
        />
      )}
      {interviewStudent && (
        <AddInterviewModal
          student={interviewStudent}
          drives={drives}
          setError={setError}
          onClose={() => setInterviewStudent(null)}
          onSaved={() => { refreshStudentInterviews(interviewStudent.id); setExpandedStudentId(interviewStudent.id); }}
        />
      )}
      {offerStudent && (
        <GiveOfferModal
          student={offerStudent}
          setError={setError}
          onClose={() => setOfferStudent(null)}
          onSaved={() => { setOfferStudent(null); fetchPool(); }}
        />
      )}
      {showAddSession && (
        <AddSessionModal saving={saving} setSaving={setSaving} onClose={() => setShowAddSession(false)} onSaved={() => { setShowAddSession(false); fetchSessions(); }} setError={setError} />
      )}
      {attendanceSession && (
        <AttendanceModal
          session={attendanceSession}
          canEdit={canEdit}
          setError={setError}
          onClose={() => setAttendanceSession(null)}
          onChanged={fetchSessions}
        />
      )}
      {contentSession && (
        <PlacementContentModal
          session={contentSession}
          canEdit={canEdit}
          setError={setError}
          onClose={() => setContentSession(null)}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-teal-600" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

const MONTH_OPTIONS = [3, 6, 12, 24];

function PlacementsAnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get('/api/placements/analytics', { params: { months } })
      .then((res) => setData(res.data.data))
      .catch((err: unknown) => setError(errMsg(err, 'Failed to load analytics')))
      .finally(() => setLoading(false));
  }, [months]);

  if (loading || !data) {
    return <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground text-sm">{error || 'Loading analytics...'}</div>;
  }

  const funnelData = [
    { stage: 'Shortlisted', count: data.funnel.shortlisted },
    { stage: 'Interviewed', count: data.funnel.interviewed },
    { stage: 'Selected', count: data.funnel.selected },
  ];
  const FUNNEL_COLORS = ['#3b82f6', '#7c3aed', '#16a34a'];

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">Cross-cohort placement performance — placement rate, funnel, package spread, and trend.</p>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="text-sm border rounded-lg px-3 py-1.5 bg-background">
          {MONTH_OPTIONS.map((m) => <option key={m} value={m}>Last {m} months</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Percent} label="Placement Rate" value={`${data.placementRate}%`} />
        <StatCard icon={Users} label="In Pool (ever)" value={data.poolCount} />
        <StatCard icon={GraduationCap} label="Placed" value={data.placedCount} />
        <StatCard icon={IndianRupee} label="Median Package" value={data.packageDistribution ? `₹${data.packageDistribution.median.toLocaleString('en-IN')}` : '—'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-4">Conversion Funnel</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} width={90} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {funnelData.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground mt-1">Distinct students at each stage — not every shortlisted student gets interviewed, and not every interview results in an offer.</p>
        </div>

        {/* Package distribution */}
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-4">Package Distribution (₹, selected offers)</h2>
          {data.packageDistribution ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Minimum</p>
                <p className="text-lg font-bold">₹{data.packageDistribution.min.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Maximum</p>
                <p className="text-lg font-bold">₹{data.packageDistribution.max.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Average</p>
                <p className="text-lg font-bold">₹{data.packageDistribution.avg.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Median</p>
                <p className="text-lg font-bold">₹{data.packageDistribution.median.toLocaleString('en-IN')}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No offers with a recorded package yet.</p>
          )}

          {Object.keys(data.offerResponseBreakdown).length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2">Offer Responses</p>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(data.offerResponseBreakdown).map(([status, count]) => (
                  <span key={status} className={`text-xs font-medium px-2 py-1 rounded-full ${OFFER_STATUS_COLOR[status] || 'bg-gray-100 text-gray-700'}`}>
                    {status}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trend */}
      <div className="bg-card border rounded-xl p-5">
        <h2 className="font-semibold mb-4">Placements Trend</h2>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data.trend}>
            <defs>
              <linearGradient id="placementTrendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
              formatter={(v: number) => [v, 'Placements']}
            />
            <Area type="monotone" dataKey="placements" stroke="#16a34a" fill="url(#placementTrendGrad)" strokeWidth={2} dot={{ r: 3, fill: '#16a34a' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function InterviewList({ interviews, canEdit, onChanged, setError }: {
  interviews: Interview[]; canEdit: boolean; onChanged: () => void; setError: (s: string) => void;
}) {
  const [feedbackFor, setFeedbackFor] = useState<Interview | null>(null);

  const updateOutcome = async (id: string, outcome: InterviewOutcome) => {
    try {
      await api.put(`/api/placements/interviews/${id}`, { outcome });
      onChanged();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to update interview'));
    }
  };

  if (interviews.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No interviews mapped yet for this student.</p>;
  }

  return (
    <div className="space-y-2">
      {interviews.map((iv) => (
        <div key={iv.id} className="bg-card border rounded-lg p-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium">
              {iv.companyName || iv.drive?.partner.name || 'Interview'} · Round {iv.round}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(iv.scheduledAt)} {iv.interviewerName && `· ${iv.interviewerName}`}
            </p>
            {iv.feedback && (
              <p className="text-xs mt-1 bg-muted/40 rounded px-2 py-1 max-w-md">
                <span className="font-medium">Feedback{iv.rating != null ? ` (${iv.rating}/5)` : ''}:</span> {iv.feedback}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canEdit ? (
              <select value={iv.outcome} onChange={(e) => updateOutcome(iv.id, e.target.value as InterviewOutcome)} className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${OUTCOME_COLOR[iv.outcome]}`}>
                {INTERVIEW_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${OUTCOME_COLOR[iv.outcome]}`}>{iv.outcome}</span>
            )}
            {canEdit && (
              <button onClick={() => setFeedbackFor(iv)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Feedback
              </button>
            )}
          </div>
        </div>
      ))}
      {feedbackFor && (
        <InterviewFeedbackModal interview={feedbackFor} setError={setError} onClose={() => setFeedbackFor(null)} onSaved={() => { setFeedbackFor(null); onChanged(); }} />
      )}
    </div>
  );
}

function InterviewFeedbackModal({ interview, setError, onClose, onSaved }: {
  interview: Interview; setError: (s: string) => void; onClose: () => void; onSaved: () => void;
}) {
  const [rating, setRating] = useState(interview.rating?.toString() || '');
  const [feedback, setFeedback] = useState(interview.feedback || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/placements/interviews/${interview.id}`, { rating: rating || undefined, feedback });
      onSaved();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to save feedback'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Interview Feedback</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Rating (1-5)</label>
            <input type="number" min="1" max="5" step="0.5" className="w-full px-3 py-2 border rounded-lg text-sm" value={rating} onChange={(e) => setRating(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Feedback</label>
            <textarea rows={4} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="How did the student perform?" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Feedback'}</button>
        </div>
      </div>
    </div>
  );
}

function ShortlistModal({ student, drives, setError, onClose }: {
  student: PoolStudent; drives: Drive[]; setError: (s: string) => void; onClose: () => void;
}) {
  const [driveId, setDriveId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!driveId) { setError('Select a drive'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/placements/drive-candidates', { driveId, studentId: student.id, notes });
      setDone(true);
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to shortlist student'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Shortlist for Drive</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground">{student.firstName} {student.lastName} · {student.studentCode}</p>
        {done ? (
          <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-4 h-4" /> Shortlisted successfully.
          </div>
        ) : (
          <div className="space-y-3">
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={driveId} onChange={(e) => setDriveId(e.target.value)}>
              <option value="">Select drive *</option>
              {drives.map((d) => <option key={d.id} value={d.id}>{d.partner.name} · {d.role} ({new Date(d.driveDate).toLocaleDateString()})</option>)}
            </select>
            <textarea rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">{done ? 'Close' : 'Cancel'}</button>
          {!done && <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Shortlist'}</button>}
        </div>
      </div>
    </div>
  );
}

function AddInterviewModal({ student, drives, setError, onClose, onSaved }: {
  student: PoolStudent; drives: Drive[]; setError: (s: string) => void; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ driveId: '', companyName: '', round: '1', interviewerName: '', scheduledAt: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.scheduledAt) { setError('Scheduled date/time is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/placements/interviews', {
        studentId: student.id,
        driveId: form.driveId || undefined,
        companyName: form.companyName || undefined,
        round: form.round,
        interviewerName: form.interviewerName || undefined,
        scheduledAt: form.scheduledAt,
        notes: form.notes || undefined,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to add interview'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Map Interview</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground">{student.firstName} {student.lastName} · {student.studentCode}</p>
        <div className="space-y-3">
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.driveId} onChange={(e) => setForm({ ...form, driveId: e.target.value })}>
            <option value="">Link to a drive (optional)</option>
            {drives.map((d) => <option key={d.id} value={d.id}>{d.partner.name} · {d.role}</option>)}
          </select>
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Company Name (if not linked to a drive)" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <div className="flex gap-2">
            <input type="number" min="1" className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Round" value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} />
            <input className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Interviewer Name" value={form.interviewerName} onChange={(e) => setForm({ ...form, interviewerName: e.target.value })} />
          </div>
          <input type="datetime-local" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          <textarea rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Add Interview'}</button>
        </div>
      </div>
    </div>
  );
}

function AddPartnerModal({ saving, setSaving, onClose, onSaved, setError }: {
  saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({ name: '', industry: '', contactName: '', contactEmail: '', contactPhone: '' });

  const submit = async () => {
    if (!form.name) { setError('Partner name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/placements/partners', form);
      onSaved();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to create partner'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">New Hiring Partner</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Company Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Contact Name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Contact Email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Contact Phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

type BulkPushRow = { studentCode: string; outcome: 'pushed' | 'already_in_pool' | 'skipped' | 'not_found'; studentName?: string; message?: string };
const BULK_PUSH_OUTCOME_LABEL: Record<BulkPushRow['outcome'], string> = {
  pushed: 'Moved to Placement Pool', already_in_pool: 'Already in pool', skipped: 'Skipped', not_found: 'Not found',
};
const BULK_PUSH_OUTCOME_COLOR: Record<BulkPushRow['outcome'], string> = {
  pushed: 'bg-green-50 text-green-700', already_in_pool: 'bg-indigo-50 text-indigo-700',
  skipped: 'bg-amber-50 text-amber-700', not_found: 'bg-red-50 text-red-700',
};

function BulkPushToPoolModal({ onClose, setError, onSaved }: {
  onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [codes, setCodes] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<BulkPushRow[] | null>(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ studentCode: 'VS70739' }, { studentCode: 'VS70770' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'placement_pool_bulk_upload_template.xlsx');
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
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
        const parsed = json
          .map((r) => String(r.studentCode || r.studentcode || r.StudentCode || r['Student Code'] || '').trim())
          .filter(Boolean);
        setCodes(parsed);
      } catch {
        setError('Could not parse the file. Please use the template format.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const submit = async () => {
    if (!codes.length) { setError('Choose a file with a studentCode column first'); return; }
    setUploading(true);
    setError('');
    try {
      const res = await api.post('/api/placements/pool/bulk-push', { studentCodes: codes });
      setResults(res.data.data.results);
      onSaved();
    } catch (err: unknown) {
      setError(errMsg(err, 'Bulk push failed'));
    } finally {
      setUploading(false);
    }
  };

  const pushedCount = results?.filter((r) => r.outcome === 'pushed').length ?? 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Bulk Upload to Placement Pool</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground">
            Upload an Excel/CSV file with a single <code>studentCode</code> column (e.g. <code>VS70739</code>).
            Every matching student's status is moved to <b>In Placement Pool</b> and their placement SLA clock starts
            (preserved if already set) — the same flip Production &rarr; Students and the trainer's per-student review already do.
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
            <p className="text-xs text-muted-foreground">{fileName} — {codes.length} student code{codes.length === 1 ? '' : 's'} found.</p>
          )}
          {results && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{pushedCount} moved to the pool, {results.length - pushedCount} skipped/not found</p>
              <div className="border rounded-lg max-h-56 overflow-y-auto divide-y">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div>
                      <span className="font-mono font-medium">{r.studentCode}</span>
                      {r.studentName && <span className="text-muted-foreground"> — {r.studentName}</span>}
                      {r.message && <p className="text-muted-foreground">{r.message}</p>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${BULK_PUSH_OUTCOME_COLOR[r.outcome]}`}>
                      {BULK_PUSH_OUTCOME_LABEL[r.outcome]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">{results ? 'Close' : 'Cancel'}</button>
          {!results && (
            <button onClick={submit} disabled={uploading || !codes.length} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
              {uploading ? 'Uploading...' : `Push ${codes.length || ''} student${codes.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// PT ("Placement Training") students join directly for placement services —
// no course, no rank card, no trainer projects/tests. They land straight in
// the pool via this modal, then behave like any other pool candidate: same
// welcome email, same track-scoped onboarding document e-sign, same
// portfolio-only readiness gate.
function AddPtStudentModal({ onClose, setError, onSaved }: {
  onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [studentCode, setStudentCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [skillAdvisorCode, setSkillAdvisorCode] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!studentCode.trim() || !firstName.trim() || !email.trim()) {
      setError('Student ID, first name, and email are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/placements/pool/add-pt-student', {
        studentCode: studentCode.trim(), firstName: firstName.trim(), lastName: lastName.trim(),
        email: email.trim(), phone: phone.trim(), skillAdvisorCode: skillAdvisorCode.trim().toUpperCase() || undefined,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to add student'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Add PT Student</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground">
          PT students join directly for placement — no course, no rank card. They're added straight to the
          Placement Pool, get their login emailed immediately, and follow the same onboarding document
          e-sign + portfolio steps as everyone else before they're marked ready.
        </p>
        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Student ID *" value={studentCode} onChange={(e) => setStudentCode(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="First Name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Email *" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
            placeholder="Skill Advisor Employee Code (optional)"
            value={skillAdvisorCode}
            onChange={(e) => setSkillAdvisorCode(e.target.value.toUpperCase())}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Adding...' : 'Add to Pool'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DriveResultsModal({ drive, canEdit, setError, onClose, onChanged, respondToOffer }: {
  drive: Drive; canEdit: boolean; setError: (s: string) => void; onClose: () => void; onChanged: () => void;
  respondToOffer: (resultId: string, offerStatus: 'ACCEPTED' | 'DECLINED') => Promise<void>;
}) {
  const [results, setResults] = useState<PlacementResultRow[]>([]);
  const [candidates, setCandidates] = useState<DriveCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ studentId: '', studentName: '', result: 'PENDING' as ResultStatus, package: '', designation: '', joiningDate: '' });
  const [offerFile, setOfferFile] = useState<File | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resultsRes, candidatesRes] = await Promise.all([
        api.get('/api/placements/results', { params: { driveId: drive.id } }),
        api.get('/api/placements/drive-candidates', { params: { driveId: drive.id } }),
      ]);
      setResults(resultsRes.data.data);
      setCandidates(candidatesRes.data.data);
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to load results'));
    } finally {
      setLoading(false);
    }
  }, [drive.id, setError]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleOfferResponse = async (resultId: string, offerStatus: 'ACCEPTED' | 'DECLINED') => {
    await respondToOffer(resultId, offerStatus);
    fetchData();
  };

  const pickCandidate = (studentId: string) => {
    const c = candidates.find((cand) => cand.student.id === studentId);
    setForm({ ...form, studentId, studentName: c ? `${c.student.firstName} ${c.student.lastName}` : form.studentName });
  };

  const submit = async () => {
    if (!form.studentName) { setError('Student name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('driveId', drive.id);
      if (form.studentId) fd.append('studentId', form.studentId);
      fd.append('studentName', form.studentName);
      fd.append('result', form.result);
      if (form.package) fd.append('package', form.package);
      if (form.designation) fd.append('designation', form.designation);
      if (form.joiningDate) fd.append('joiningDate', form.joiningDate);
      if (offerFile) fd.append('offerLetter', offerFile);

      await api.post('/api/placements/results', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm({ studentId: '', studentName: '', result: 'PENDING', package: '', designation: '', joiningDate: '' });
      setOfferFile(null);
      fetchData();
      onChanged();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to add result'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Drive Results</h2>
            <p className="text-xs text-muted-foreground">{drive.partner.name} · {drive.role}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
          {loading ? (
            <p className="text-sm text-muted-foreground p-3">Loading...</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">No results recorded yet</p>
          ) : results.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <span>{r.studentName}</span>
                {r.designation && <p className="text-xs text-muted-foreground">{r.designation}</p>}
                {r.result === 'SELECTED' && r.offerStatus && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${OFFER_STATUS_COLOR[r.offerStatus] || 'bg-gray-100 text-gray-600'}`}>
                      Offer: {r.offerStatus}
                    </span>
                    {canEdit && r.offerStatus === 'PENDING' && (
                      <>
                        <button onClick={() => handleOfferResponse(r.id, 'ACCEPTED')} className="text-[11px] text-green-600 hover:underline">Accept</button>
                        <button onClick={() => handleOfferResponse(r.id, 'DECLINED')} className="text-[11px] text-red-600 hover:underline">Decline</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {r.package != null && <span className="text-muted-foreground text-xs">{fmt(r.package)}</span>}
                {r.offerLetterUrl && (
                  <a href={r.offerLetterUrl} target="_blank" rel="noreferrer" className="text-blue-600 text-xs hover:underline flex items-center gap-1">
                    <FileUp className="w-3 h-3" /> Offer
                  </a>
                )}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RESULT_COLOR[r.result] || 'bg-gray-100 text-gray-700'}`}>{r.result}</span>
              </div>
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="space-y-3 pt-2 border-t">
            <p className="text-sm font-medium flex items-center gap-2"><ListChecks className="w-4 h-4" /> Add Result</p>
            {candidates.length > 0 && (
              <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.studentId} onChange={(e) => pickCandidate(e.target.value)}>
                <option value="">Pick from shortlist (optional)</option>
                {candidates.map((c) => <option key={c.id} value={c.student.id}>{c.student.firstName} {c.student.lastName} · {c.student.studentCode}</option>)}
              </select>
            )}
            <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Student Name *" value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} />
            <div className="flex gap-2">
              <select className="flex-1 px-3 py-2 border rounded-lg text-sm" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value as ResultStatus })}>
                {RESULT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="number" className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Package (₹)" value={form.package} onChange={(e) => setForm({ ...form, package: e.target.value })} />
            </div>
            {form.result === 'SELECTED' && (
              <div className="space-y-3 bg-green-50/50 border border-green-100 rounded-lg p-3">
                <p className="text-xs font-medium text-green-700">Offer Details</p>
                <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
                <div>
                  <label className="text-xs text-muted-foreground">Offer Letter (PDF/Image/Doc)</label>
                  <input type="file" className="w-full text-sm" onChange={(e) => setOfferFile(e.target.files?.[0] || null)} />
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Add Result'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GiveOfferModal({ student, setError, onClose, onSaved }: {
  student: PoolStudent; setError: (s: string) => void; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ result: 'SELECTED' as ResultStatus, package: '', designation: '', joiningDate: '' });
  const [offerFile, setOfferFile] = useState<File | null>(null);
  const studentName = `${student.firstName} ${student.lastName}`;

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('studentId', student.id);
      fd.append('studentName', studentName);
      fd.append('result', form.result);
      if (form.package) fd.append('package', form.package);
      if (form.designation) fd.append('designation', form.designation);
      if (form.joiningDate) fd.append('joiningDate', form.joiningDate);
      if (offerFile) fd.append('offerLetter', offerFile);

      await api.post('/api/placements/results', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSaved();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to record offer'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Give Offer</h2>
            <p className="text-xs text-muted-foreground">{studentName} · {student.studentCode}</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground">
          Use this for offers placed directly (no formal drive involved). To record results for a campus drive, use that drive&#x2019;s Results panel instead.
        </p>
        <div className="space-y-3">
          <div className="flex gap-2">
            <select className="flex-1 px-3 py-2 border rounded-lg text-sm" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value as ResultStatus })}>
              {RESULT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="number" className="flex-1 px-3 py-2 border rounded-lg text-sm" placeholder="Package (₹)" value={form.package} onChange={(e) => setForm({ ...form, package: e.target.value })} />
          </div>
          {form.result === 'SELECTED' && (
            <div className="space-y-3 bg-green-50/50 border border-green-100 rounded-lg p-3">
              <p className="text-xs font-medium text-green-700">Offer Details</p>
              <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
              <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
              <div>
                <label className="text-xs text-muted-foreground">Offer Letter (PDF/Image/Doc)</label>
                <input type="file" className="w-full text-sm" onChange={(e) => setOfferFile(e.target.files?.[0] || null)} />
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Offer'}</button>
        </div>
      </div>
    </div>
  );
}

function AddDriveModal({ partners, saving, setSaving, onClose, onSaved, setError }: {
  partners: Partner[]; saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({ partnerId: '', role: '', driveDate: '' });

  const submit = async () => {
    if (!form.partnerId || !form.role || !form.driveDate) { setError('Partner, role, and date are required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/placements/drives', form);
      onSaved();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to create drive'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">New Placement Drive</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })}>
            <option value="">Select partner *</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Role *" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.driveDate} onChange={(e) => setForm({ ...form, driveDate: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

function parseStudentCodeFile(file: File, onParsed: (codes: string[]) => void, onError: (msg: string) => void) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = e.target?.result;
      const wb = XLSX.read(data, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
      const parsed = json
        .map((r) => String(r.studentCode || r.studentcode || r.StudentCode || r['Student Code'] || '').trim())
        .filter(Boolean);
      onParsed(parsed);
    } catch {
      onError('Could not parse the file. Please use the template format.');
    }
  };
  reader.readAsBinaryString(file);
}

function downloadStudentCodeTemplate(filename: string) {
  const ws = XLSX.utils.json_to_sheet([{ studentCode: 'VS70739' }, { studentCode: 'VS70770' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, filename);
}

function AddSessionModal({ saving, setSaving, onClose, onSaved, setError }: {
  saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({ type: 'SOFTSKILL' as SoftskillType, topic: '', startDate: '', endDate: '', trainerId: '', notes: '' });
  const [trainers, setTrainers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<{ createdCount: number; notFoundCodes: string[] } | null>(null);

  useEffect(() => {
    // Same convention as Production.tsx's trainer pickers (AssignTrainerModal /
    // ReportFilterBar) — no backend "trainer" concept exists, so we filter the
    // full employee list to the Production department by name substring (the
    // DB has duplicate "Production" department rows) and exclude departed staff.
    api.get('/api/employees', { params: { limit: 500 } })
      .then((res) => setTrainers((res.data.data || []).filter((e: { department?: { name?: string }; status: string }) =>
        e.department?.name?.toLowerCase().includes('production') && e.status !== 'TERMINATED' && e.status !== 'RESIGNED'
      )))
      .catch(() => setTrainers([]));
  }, []);

  const onFile = (file: File) => {
    setFileName(file.name);
    parseStudentCodeFile(file, setCodes, setError);
  };

  const submit = async () => {
    if (!form.topic || !form.startDate) { setError('Topic and start date are required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/placements/softskill-sessions', {
        ...form,
        endDate: form.endDate || undefined,
        trainerId: form.trainerId || undefined,
        studentCodes: codes,
      });
      setResult({ createdCount: res.data.data.rosterCount ?? 0, notFoundCodes: res.data.data.notFoundCodes || [] });
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to create session'));
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
          <h2 className="font-semibold text-lg">Session Created</h2>
          <p className="text-sm">{result.createdCount} student{result.createdCount === 1 ? '' : 's'} added to the roster and emailed.</p>
          {result.notFoundCodes.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm text-amber-700 font-medium">{result.notFoundCodes.length} code{result.notFoundCodes.length === 1 ? '' : 's'} not found:</p>
              <div className="border rounded-lg max-h-32 overflow-y-auto p-2 text-xs font-mono text-muted-foreground">
                {result.notFoundCodes.join(', ')}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={onSaved} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">New Session</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SoftskillType })}>
            <option value="SOFTSKILL">Softskill</option>
            <option value="APTITUDE">Aptitude</option>
            <option value="SK_APT">Softskill &amp; Aptitude</option>
          </select>
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Topic *" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Start date *</label>
              <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">End date (optional)</label>
              <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Trainer</label>
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.trainerId} onChange={(e) => setForm({ ...form, trainerId: e.target.value })}>
              <option value="">No trainer assigned yet</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Add students (optional) — {codes.length} student code{codes.length === 1 ? '' : 's'}</label>
            <div className="flex items-center gap-2 mt-1">
              <button type="button" onClick={() => downloadStudentCodeTemplate('softskill_session_students_template.xlsx')} className="text-xs px-3 py-2 border rounded-lg hover:bg-muted/50 flex items-center gap-1 shrink-0">
                <Download className="w-3 h-3" /> Template
              </button>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                className="w-full text-xs border rounded-lg px-2 py-1.5"
              />
            </div>
            {fileName && <p className="text-xs text-muted-foreground mt-1">{fileName} — {codes.length} code{codes.length === 1 ? '' : 's'} found.</p>}
            <p className="text-[11px] text-muted-foreground mt-1">Upload an Excel/CSV with a <code>studentCode</code> column. You can add more students afterward from the session's Attendance screen. Everyone added gets an email about this session.</p>
          </div>
          <textarea rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

interface PlacementReleaseLite { id: string; status: 'ACTIVE' | 'CLOSED'; deadline?: string | null; }
interface PlacementProjectLite { id: string; title: string; releases: PlacementReleaseLite[]; }
interface PlacementTestLite { id: string; title: string; durationMinutes: number; _count: { questions: number }; releases: PlacementReleaseLite[]; }

function PlacementContentModal({ session, canEdit, setError, onClose }: {
  session: SoftskillSession; canEdit: boolean; setError: (s: string) => void; onClose: () => void;
}) {
  const [projects, setProjects] = useState<PlacementProjectLite[]>([]);
  const [tests, setTests] = useState<PlacementTestLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/api/placements/softskill-sessions/${session.id}/placement-content`)
      .then((r) => { setProjects(r.data.data.projects); setTests(r.data.data.tests); })
      .catch(() => setError('Failed to load placement content'))
      .finally(() => setLoading(false));
  }, [session.id, setError]);

  useEffect(() => { load(); }, [load]);

  const release = async (kind: 'project' | 'test', id: string) => {
    setBusyId(id);
    setError('');
    try {
      const deadline = deadlines[id] ? new Date(deadlines[id]).toISOString() : undefined;
      if (kind === 'project') {
        await api.post(`/api/placements/softskill-sessions/${session.id}/placement-content/release-project`, { projectId: id, deadline });
      } else {
        await api.post(`/api/placements/softskill-sessions/${session.id}/placement-content/activate-test`, { testId: id, deadline });
      }
      load();
    } catch (err) { setError(errMsg(err, 'Could not release')); } finally { setBusyId(null); }
  };

  const closeRelease = async (kind: 'project' | 'test', releaseId: string) => {
    if (!window.confirm('Close this release? Students will no longer be able to access it.')) return;
    setBusyId(releaseId);
    setError('');
    try {
      await api.post(`/api/placements/softskill-sessions/${session.id}/placement-content/close-release`, { kind, releaseId });
      load();
    } catch (err) { setError(errMsg(err, 'Could not close release')); } finally { setBusyId(null); }
  };

  const DeadlineInput = ({ id }: { id: string }) => (
    <input
      type="datetime-local"
      value={deadlines[id] || ''}
      onChange={(e) => setDeadlines((d) => ({ ...d, [id]: e.target.value }))}
      title="Optional deadline"
      className="px-2 py-1.5 rounded-lg border text-xs"
    />
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Placement Content — {session.topic}</h2>
            <p className="text-xs text-muted-foreground">Release Projects and Tests authored in Production to this session's roster.</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><FileText className="w-4 h-4" /> Projects</h3>
              {projects.length === 0 ? (
                <p className="text-xs text-muted-foreground">No placement projects authored yet — add one in Production &rarr; Placement Training.</p>
              ) : (
                projects.map((p) => {
                  const rel = p.releases[0];
                  const active = rel?.status === 'ACTIVE';
                  return (
                    <div key={p.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{p.title}</p>
                      <div className="flex items-center gap-2">
                        {rel ? (
                          <>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>{rel.status}</span>
                            {canEdit && active && (
                              <button onClick={() => closeRelease('project', rel.id)} disabled={busyId === rel.id} className="px-3 py-1.5 rounded-lg border text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">Close</button>
                            )}
                          </>
                        ) : canEdit ? (
                          <>
                            <DeadlineInput id={p.id} />
                            <button onClick={() => release('project', p.id)} disabled={busyId === p.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
                              {busyId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Release
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not released</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><ListChecks className="w-4 h-4" /> Tests</h3>
              {tests.length === 0 ? (
                <p className="text-xs text-muted-foreground">No placement tests authored yet — add one in Production &rarr; Placement Training.</p>
              ) : (
                tests.map((t) => {
                  const rel = t.releases[0];
                  const active = rel?.status === 'ACTIVE';
                  const noQuestions = t._count.questions === 0;
                  return (
                    <div key={t.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.durationMinutes} min · {t._count.questions} question{t._count.questions === 1 ? '' : 's'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {rel ? (
                          <>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>{rel.status}</span>
                            {canEdit && active && (
                              <button onClick={() => closeRelease('test', rel.id)} disabled={busyId === rel.id} className="px-3 py-1.5 rounded-lg border text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">Close</button>
                            )}
                          </>
                        ) : canEdit ? (
                          <>
                            <DeadlineInput id={t.id} />
                            <button
                              onClick={() => release('test', t.id)}
                              disabled={busyId === t.id || noQuestions}
                              title={noQuestions ? 'Add questions to this test in Production first' : undefined}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60"
                            >
                              {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />} Release
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not released</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Submissions and test results are reviewed by the session's assigned trainer from My Training.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function defaultSessionAttendanceDate(session: SoftskillSession): string {
  const toDay = (d: string) => d.slice(0, 10);
  const start = toDay(session.startDate);
  const end = session.endDate ? toDay(session.endDate) : start;
  const today = new Date().toISOString().slice(0, 10);
  if (today < start) return start;
  if (today > end) return end;
  return today;
}

function AttendanceModal({ session, canEdit, setError, onClose, onChanged }: {
  session: SoftskillSession; canEdit: boolean;
  setError: (s: string) => void; onClose: () => void; onChanged: () => void;
}) {
  const [date, setDate] = useState(() => defaultSessionAttendanceDate(session));
  const [roster, setRoster] = useState<{ student: { id: string; firstName: string; lastName: string; studentCode: string }; status: string | null; score: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoadedState] = useState(false);
  const [showAddStudents, setShowAddStudents] = useState(false);

  const load = useCallback(() => {
    setLoadedState(false);
    api.get(`/api/placements/softskill-sessions/${session.id}/attendance`, { params: { date } }).then(({ data }) => {
      const rows = data.data || [];
      setRoster(rows.map((r: { student: { id: string; firstName: string; lastName: string; studentCode: string }; status: string | null; score: number | null }) => ({
        student: r.student, status: r.status, score: r.score?.toString() || '',
      })));
      setLoadedState(true);
    });
  }, [session.id, date]);

  useEffect(() => { load(); }, [load]);

  const setStatus = (sid: string, status: string) => {
    setRoster((rows) => rows.map((r) => (r.student.id === sid ? { ...r, status } : r)));
  };
  const setScore = (sid: string, val: string) => {
    setRoster((rows) => rows.map((r) => (r.student.id === sid ? { ...r, score: val } : r)));
  };

  const submit = async () => {
    const marked = roster.filter((r) => r.status);
    setSaving(true);
    try {
      await api.post(`/api/placements/softskill-sessions/${session.id}/attendance`, {
        date,
        records: marked.map((r) => ({ studentId: r.student.id, status: r.status, score: r.score ? parseFloat(r.score) : null })),
      });
      onChanged();
      onClose();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to save attendance'));
    } finally {
      setSaving(false);
    }
  };

  const dateMin = session.startDate.slice(0, 10);
  const dateMax = (session.endDate || session.startDate).slice(0, 10);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Attendance — {session.topic}</h2>
            <p className="text-xs text-muted-foreground">{roster.length} student{roster.length === 1 ? '' : 's'} in roster</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <input
            type="date"
            value={date}
            min={dateMin}
            max={dateMax}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg border bg-background text-sm"
          />
          {canEdit && (
            <button onClick={() => setShowAddStudents(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add students
            </button>
          )}
        </div>
        {!loaded ? <p className="text-center py-4 text-muted-foreground">Loading…</p> : roster.length === 0 ? (
          <p className="text-center py-4 text-muted-foreground text-sm">No students in this session yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {roster.map((r) => (
              <div key={r.student.id} className="flex items-center gap-3 flex-wrap">
                <span className="text-sm flex-1">
                  {r.student.firstName} {r.student.lastName} <span className="text-xs text-muted-foreground">({r.student.studentCode})</span>
                </span>
                <div className="flex gap-1.5">
                  {(['PRESENT', 'LATE', 'ABSENT'] as const).map((s) => (
                    <button
                      key={s}
                      disabled={!canEdit}
                      onClick={() => setStatus(r.student.id, s)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium border transition disabled:opacity-50 ${
                        r.status === s
                          ? s === 'PRESENT' ? 'bg-green-600 text-white border-green-600' : s === 'LATE' ? 'bg-amber-500 text-white border-amber-500' : 'bg-red-600 text-white border-red-600'
                          : 'bg-background text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {(session.type === 'APTITUDE' || session.type === 'SK_APT') && (
                  <input type="number" disabled={!canEdit} placeholder="Score" className="w-20 px-2 py-1 border rounded text-xs" value={r.score} onChange={(e) => setScore(r.student.id, e.target.value)} />
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="flex justify-end">
            <button onClick={submit} disabled={saving || !loaded} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Attendance'}</button>
          </div>
        )}
      </div>
      {showAddStudents && (
        <AddStudentsToSessionModal
          sessionId={session.id}
          setError={setError}
          onClose={() => setShowAddStudents(false)}
          onSaved={() => { setShowAddStudents(false); load(); onChanged(); }}
        />
      )}
    </div>
  );
}

function AddStudentsToSessionModal({ sessionId, setError, onClose, onSaved }: {
  sessionId: string; setError: (s: string) => void; onClose: () => void; onSaved: () => void;
}) {
  const [codes, setCodes] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ added: number; alreadyIn: number; notFoundCodes: string[] } | null>(null);

  const onFile = (file: File) => {
    setFileName(file.name);
    parseStudentCodeFile(file, setCodes, setError);
  };

  const submit = async () => {
    if (!codes.length) { setError('Choose a file with a studentCode column first'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/api/placements/softskill-sessions/${sessionId}/students`, { studentCodes: codes });
      setResult(res.data.data);
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to add students'));
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
        <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
          <h2 className="font-semibold text-lg">Students Added</h2>
          <p className="text-sm">{result.added} added and emailed{result.alreadyIn ? `, ${result.alreadyIn} already in the session` : ''}.</p>
          {result.notFoundCodes.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm text-amber-700 font-medium">{result.notFoundCodes.length} code{result.notFoundCodes.length === 1 ? '' : 's'} not found:</p>
              <div className="border rounded-lg max-h-32 overflow-y-auto p-2 text-xs font-mono text-muted-foreground">
                {result.notFoundCodes.join(', ')}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={onSaved} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Add Students</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground">Upload an Excel/CSV file with a single <code>studentCode</code> column (e.g. <code>VS70739</code>) — same format as the Placement Pool bulk upload.</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => downloadStudentCodeTemplate('softskill_session_students_template.xlsx')} className="text-xs px-3 py-2 border rounded-lg hover:bg-muted/50 flex items-center gap-1 shrink-0">
            <Download className="w-3 h-3" /> Template
          </button>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            className="w-full text-xs border rounded-lg px-2 py-1.5"
          />
        </div>
        {fileName && <p className="text-xs text-muted-foreground">{fileName} — {codes.length} code{codes.length === 1 ? '' : 's'} found.</p>}
        <p className="text-[11px] text-muted-foreground">Students already in this session are skipped automatically. Newly added students get an email.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving || !codes.length} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Adding...' : `Add ${codes.length || ''} student${codes.length === 1 ? '' : 's'}`}</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Student Profile Modal ───────────────────── */

interface StudentProfileData {
  student: {
    id: string; studentCode: string; firstName: string; lastName: string;
    phone: string; track: string; status: string; photo?: string | null;
    dateOfBirth?: string | null; gender?: string | null;
    address?: string | null; city?: string | null; state?: string | null;
    fatherName?: string | null; movedToPlacementAt?: string | null;
    enrollments: { id: string; schedule: { course: { name: string }; batch: { code: string } } }[];
    portfolio?: { status: string; submittedAt?: string | null } | null;
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
    joiningDate?: string | null; offerLetterUrl?: string | null;
    companyName?: string | null;
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
}

function PlacementStudentProfileModal({ student: poolStudent, onClose }: {
  student: PoolStudent; onClose: () => void;
}) {
  const [data, setData] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileErr, setProfileErr] = useState('');
  const [profileTab, setProfileTab] = useState<'overview' | 'interviews' | 'rank'>('overview');

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/api/placements/students/${poolStudent.id}/profile`);
        setData(r.data.data);
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string } } };
        setProfileErr(err.response?.data?.message || 'Failed to load student profile');
      } finally {
        setLoading(false);
      }
    })();
  }, [poolStudent.id]);

  const StarRow = ({ rating }: { rating?: number | null }) => {
    const r = Math.round(rating || 0);
    return (
      <span className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={`w-3.5 h-3.5 ${i <= r ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`} />
        ))}
        <span className="text-xs text-muted-foreground ml-1">{rating?.toFixed(1) || 'N/A'}</span>
      </span>
    );
  };

  const s = data?.student;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
              {poolStudent.firstName[0]}{poolStudent.lastName[0]}
            </div>
            <div>
              <h2 className="font-semibold text-base">{poolStudent.firstName} {poolStudent.lastName}</h2>
              <p className="text-xs text-muted-foreground">{poolStudent.studentCode} · {poolStudent.track}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex gap-1 px-6 pt-3 border-b">
          {([
            { key: 'overview', label: 'Overview', icon: User },
            { key: 'interviews', label: `Interviews (${data?.interviews.length ?? 0})`, icon: Briefcase },
            { key: 'rank', label: 'Rank Card', icon: Trophy },
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
          ) : profileErr ? (
            <div className="text-red-600 text-sm py-8 text-center">{profileErr}</div>
          ) : !data ? null : profileTab === 'overview' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide">Personal Information</h3>
                <div className="bg-muted/20 rounded-xl p-4 space-y-2">
                  {[
                    { label: 'Full Name', value: `${s?.firstName} ${s?.lastName}` },
                    { label: 'Phone', value: s?.phone },
                    { label: 'Track', value: s?.track },
                    { label: 'Status', value: s?.status },
                    { label: 'Gender', value: s?.gender || '—' },
                    { label: 'Date of Birth', value: s?.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString() : '—' },
                    { label: 'Father Name', value: s?.fatherName || '—' },
                    { label: 'Address', value: [s?.address, s?.city, s?.state].filter(Boolean).join(', ') || '—' },
                    { label: 'Moved to Pool', value: s?.movedToPlacementAt ? new Date(s.movedToPlacementAt).toLocaleDateString() : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-sm gap-2">
                      <span className="text-muted-foreground flex-shrink-0 w-32">{label}</span>
                      <span className="font-medium text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide">Courses Enrolled</h3>
                {s?.enrollments.map((en) => (
                  <div key={en.id} className="bg-muted/20 rounded-xl p-4 flex items-center gap-3">
                    <BookOpen className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{en.schedule.course.name}</p>
                      <p className="text-xs text-muted-foreground">Batch: {en.schedule.batch.code}</p>
                    </div>
                  </div>
                ))}
                <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide mt-4">Portfolio</h3>
                <div className={`rounded-xl p-4 text-sm ${s?.portfolio?.status === 'APPROVED' ? 'bg-green-50 text-green-700' : s?.portfolio?.status === 'SUBMITTED' ? 'bg-blue-50 text-blue-700' : 'bg-muted/20 text-muted-foreground'}`}>
                  {s?.portfolio ? <span className="font-medium">{s.portfolio.status}{s.portfolio.submittedAt ? ` · ${formatDate(s.portfolio.submittedAt)}` : ''}</span> : <span>Not submitted</span>}
                </div>
                {(() => {
                  const allProjects = data.rankCard.flatMap((rc) => rc.projects.map((p) => ({ ...p, courseName: rc.courseName })));
                  return allProjects.length > 0 && (
                    <>
                      <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide mt-4">Projects</h3>
                      {allProjects.map((p) => (
                        <div key={p.id} className="bg-muted/20 rounded-xl p-4 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{p.projectTitle}{p.isCapstone ? ' 🎓' : ''}</p>
                            <p className="text-xs text-muted-foreground">{p.moduleTitle} · {p.courseName}</p>
                            {(p.fileUrl || p.linkUrl) && (
                              <a href={p.fileUrl ? fileUrl(p.fileUrl) : p.linkUrl!} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                                View submission
                              </a>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${p.status === 'REVIEWED' ? 'bg-green-100 text-green-700' : p.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                            {p.graded && <p className="text-xs font-bold mt-1">{p.grade}/{p.maxGrade}</p>}
                          </div>
                        </div>
                      ))}
                    </>
                  );
                })()}
                {s && s.trainerFeedbacks.length > 0 && (
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
                {data.results.length > 0 && (
                  <>
                    <h3 className="font-semibold text-sm uppercase text-muted-foreground tracking-wide mt-4">Placement Results</h3>
                    {data.results.map((r) => (
                      <div key={r.id} className={`rounded-xl p-4 space-y-1 ${r.result === 'SELECTED' ? 'bg-green-50' : 'bg-muted/20'}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{r.drive?.partner.name || r.companyName || 'Direct offer'}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RESULT_COLOR[r.result] || 'bg-gray-100 text-gray-600'}`}>{r.result}</span>
                        </div>
                        {r.designation && <p className="text-xs text-muted-foreground">{r.designation}{r.package ? ` · ${fmt(r.package)} LPA` : ''}</p>}
                        {r.offerLetterUrl && (
                          <a href={r.offerLetterUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View Offer Letter
                          </a>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          ) : profileTab === 'interviews' ? (
            <div className="space-y-3">
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
                      <p className="text-xs text-muted-foreground">{new Date(iv.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${OUTCOME_COLOR[iv.outcome] || 'bg-gray-100 text-gray-700'}`}>{iv.outcome}</span>
                  </div>
                  {iv.rating != null && <StarRow rating={iv.rating} />}
                  {iv.notes && <p className="text-xs text-muted-foreground border-l-2 pl-2">{iv.notes}</p>}
                  {iv.feedback && <p className="text-xs text-muted-foreground border-l-2 border-blue-200 pl-2">Feedback: {iv.feedback}</p>}
                </div>
              ))}
            </div>
          ) : (
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
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{f.moduleTitle}</p>
                            <StarRow rating={f.rating} />
                          </div>
                          {f.comments && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">"{f.comments}"</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
