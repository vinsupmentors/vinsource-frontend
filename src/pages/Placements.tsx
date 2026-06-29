import { Fragment, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import {
  Lock, Plus, X, Building2, CalendarClock, GraduationCap, TrendingUp, Users,
  CheckCircle2, XCircle, AlertTriangle, MessageSquare, FileUp, ListChecks,
  Briefcase, BarChart2, Search, User, Trophy, Star, Phone, MapPin,
  BookOpen, Award, ChevronDown, ChevronRight, ExternalLink,
} from 'lucide-react';

type DriveStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
type ResultStatus = 'PENDING' | 'SELECTED' | 'REJECTED';
type InterviewOutcome = 'SCHEDULED' | 'SELECTED' | 'REJECTED' | 'NO_SHOW' | 'PENDING';
type SoftskillType = 'SOFTSKILL' | 'APTITUDE';

interface Partner { id: string; name: string; industry?: string | null; _count?: { drives: number }; }
interface Drive {
  id: string; role: string; driveDate: string; status: DriveStatus;
  partner: { id: string; name: string; industry?: string | null };
  _count?: { results: number; candidates?: number; interviews?: number };
}
interface PlacementResultRow {
  id: string; studentName: string; result: string; package?: number | null; createdAt: string;
  designation?: string | null; joiningDate?: string | null; offerLetterUrl?: string | null;
}
interface Stats { totalPartners: number; upcomingDrives: number; totalPlaced: number; avgPackage: number; }

interface PoolTrainerFeedback {
  id: string; certificateEligible: boolean; performanceRating?: number | null;
  placementReadinessNote?: string | null; jrpToIopRecommended?: boolean | null;
  course: { id: string; name: string };
}
interface PoolStudent {
  id: string; studentCode: string; firstName: string; lastName: string; phone: string;
  track: 'JRP' | 'IOP' | 'PAP'; movedToPlacementAt?: string | null;
  photo?: string | null;
  enrollments: { id: string; schedule: { course: { name: string }; batch: { code: string } } }[];
  trainerFeedbacks?: PoolTrainerFeedback[];
  placementReadiness: { ready: boolean; missing: string[] };
  interviewSummary: { count: number; lastOutcome: string | null };
  isPlaced: boolean;
  placedInfo?: { package: number | null; designation: string | null } | null;
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
  id: string; type: SoftskillType; topic: string; sessionDate: string; notes?: string | null;
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

  type Tab = 'drives' | 'partners' | 'pool' | 'softskill' | 'reports';
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
  const [resultsDrive, setResultsDrive] = useState<Drive | null>(null);
  const [saving, setSaving] = useState(false);

  const [pool, setPool] = useState<PoolStudent[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [poolFilter, setPoolFilter] = useState<'all' | 'ready' | 'not_ready' | 'placed'>('all');
  const [poolSearch, setPoolSearch] = useState('');
  const [poolCourseId, setPoolCourseId] = useState('');
  const [poolBatchId, setPoolBatchId] = useState('');
  const [filterOptions, setFilterOptions] = useState<{ courses: { id: string; name: string }[]; batches: { id: string; code: string }[] }>({ courses: [], batches: [] });
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
  const filteredPool = pool.filter((s) => {
    if (poolFilter === 'ready') { if (!s.placementReadiness?.ready) return false; }
    else if (poolFilter === 'not_ready') { if (s.placementReadiness?.ready) return false; }
    else if (poolFilter === 'placed') { if (!s.isPlaced) return false; }
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
                </tr>
              </thead>
              <tbody className="divide-y">
                {!sessionsLoaded ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : sessions.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No sessions scheduled yet</td></tr>
                ) : sessions.map((sess) => (
                  <tr key={sess.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sess.type === 'SOFTSKILL' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'}`}>{sess.type}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{sess.topic}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(sess.sessionDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{sess.trainer ? `${sess.trainer.firstName} ${sess.trainer.lastName}` : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setAttendanceSession(sess)} className="text-blue-600 hover:underline text-sm font-medium">
                        {sess._count?.attendances ?? 0} marked{canEdit ? ' · Manage' : ''}
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
          pool={pool}
          poolLoaded={poolLoaded}
          fetchPool={fetchPool}
          canEdit={canEdit}
          setError={setError}
          onClose={() => setAttendanceSession(null)}
          onChanged={fetchSessions}
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
              {new Date(iv.scheduledAt).toLocaleString()} {iv.interviewerName && `· ${iv.interviewerName}`}
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

function DriveResultsModal({ drive, canEdit, setError, onClose, onChanged }: {
  drive: Drive; canEdit: boolean; setError: (s: string) => void; onClose: () => void; onChanged: () => void;
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

function AddSessionModal({ saving, setSaving, onClose, onSaved, setError }: {
  saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({ type: 'SOFTSKILL' as SoftskillType, topic: '', sessionDate: '', notes: '' });

  const submit = async () => {
    if (!form.topic || !form.sessionDate) { setError('Topic and date are required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/placements/softskill-sessions', form);
      onSaved();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to create session'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">New Session</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SoftskillType })}>
            <option value="SOFTSKILL">Softskill</option>
            <option value="APTITUDE">Aptitude</option>
          </select>
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Topic *" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.sessionDate} onChange={(e) => setForm({ ...form, sessionDate: e.target.value })} />
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

function AttendanceModal({ session, pool, poolLoaded, fetchPool, canEdit, setError, onClose, onChanged }: {
  session: SoftskillSession; pool: PoolStudent[]; poolLoaded: boolean; fetchPool: () => void; canEdit: boolean;
  setError: (s: string) => void; onClose: () => void; onChanged: () => void;
}) {
  const [marks, setMarks] = useState<Record<string, { present: boolean; score: string }>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoadedState] = useState(false);

  useEffect(() => {
    if (!poolLoaded) { fetchPool(); return; }
    (async () => {
      const { data } = await api.get(`/api/placements/softskill-sessions/${session.id}/attendance`);
      const init: Record<string, { present: boolean; score: string }> = {};
      for (const s of pool) init[s.id] = { present: false, score: '' };
      for (const a of data.data || []) init[a.studentId] = { present: a.present, score: a.score?.toString() || '' };
      setMarks(init);
      setLoadedState(true);
    })();
  }, [poolLoaded, session.id, pool, fetchPool]);

  const toggle = (sid: string) => setMarks((m) => ({ ...m, [sid]: { ...m[sid], present: !m[sid]?.present } }));
  const setScore = (sid: string, val: string) => setMarks((m) => ({ ...m, [sid]: { ...m[sid], score: val } }));

  const submit = async () => {
    setSaving(true);
    try {
      const attendances = pool.map((s) => ({ studentId: s.id, present: marks[s.id]?.present || false, score: marks[s.id]?.score ? parseFloat(marks[s.id].score) : null }));
      await api.post(`/api/placements/softskill-sessions/${session.id}/attendance`, { attendances });
      onChanged();
      onClose();
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to save attendance'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Attendance — {session.topic}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        {!loaded ? <p className="text-center py-4 text-muted-foreground">Loading…</p> : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {pool.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <input type="checkbox" checked={!!marks[s.id]?.present} onChange={() => toggle(s.id)} id={`att-${s.id}`} disabled={!canEdit} />
                <label htmlFor={`att-${s.id}`} className="text-sm flex-1">
                  {s.firstName} {s.lastName}
                </label>
                {session.type === 'APTITUDE' && (
                  <input type="number" disabled={!canEdit} placeholder="Score" className="w-20 px-2 py-1 border rounded text-xs" value={marks[s.id]?.score || ''} onChange={(e) => setScore(s.id, e.target.value)} />
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
    drive: { id: string; partner: { name: string } };
  }[];
  rankCard: {
    scheduleId: string; courseName: string; batchCode: string;
    rank: number | null; totalStudents: number;
    marksObtained: number; marksMax: number; percentage: number; classAverage: number;
    projects: {
      id: string; projectTitle: string; moduleTitle: string; isCapstone: boolean;
      status: string; submittedAt: string; graded: boolean;
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
                  {s?.portfolio ? <span className="font-medium">{s.portfolio.status}{s.portfolio.submittedAt ? ` · ${new Date(s.portfolio.submittedAt).toLocaleDateString()}` : ''}</span> : <span>Not submitted</span>}
                </div>
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
                          <span className="font-medium text-sm">{r.drive.partner.name}</span>
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
