import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api, { BASE_URL } from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { formatDate, formatDateTime, formatTime } from '@/lib/utils';
import {
  Lock, Plus, X, Phone, Mail, Calendar, Users, TrendingUp, CheckCircle2,
  PhoneCall, Video, MapPin, RefreshCw, AlertTriangle, Settings, Trash2, Activity,
  ChevronLeft, ChevronRight, Upload, Download, Percent,
  Smartphone, PhoneIncoming, Link2, UserPlus, Copy, Ban, Check, History,
  Target as TargetIcon, Trophy, Clock, PlayCircle, Bell, ListChecks, BarChart3, Eye,
} from 'lucide-react';

const PAGE_SIZE = 100;

// ── Types ────────────────────────────────────────────────────────────────
type LeadStatus = 'NEW' | 'CONTACTED' | 'DEMO_SCHEDULED' | 'DEMO_DONE' | 'NEGOTIATION' | 'ENROLLED' | 'LOST';
type LeadLostReason = 'NOT_INTERESTED' | 'INVALID_NUMBER' | 'UNREACHABLE' | 'DUPLICATE' | 'OTHER';
type DemoMode = 'ONLINE' | 'OFFLINE';
type DemoStatus = 'SCHEDULED' | 'COMPLETED' | 'RESCHEDULED' | 'NO_SHOW' | 'CANCELLED';
type DemoOutcome = 'NOT_INTERESTED' | 'INTERESTED' | 'FIFTY_FIFTY' | 'NEED_FOLLOWUP';

interface EmployeeLite { id: string; firstName: string; lastName: string; employeeCode: string; }

interface DemoLite {
  id: string;
  bookingNumber: string;
  scheduledAt: string;
  mode: DemoMode;
  status: DemoStatus;
  feedback?: string | null;
  conductedBy?: EmployeeLite | null;
  coConductedBy?: EmployeeLite | null;
  createdAt: string;
  rescheduledFromId?: string | null;
  // Captured at booking time
  city?: string | null;
  educationQualification?: string | null;
  collegeName?: string | null;
  passedOutYear?: number | null;
  currentStatus?: string | null;
  courseEnquired?: string | null;
  bookingComments?: string | null;
  // Captured on reschedule / conduct
  rescheduleReason?: string | null;
  proofUrl?: string | null;
  outcome?: DemoOutcome | null;
  // Portal-hosted online room (ONLINE demos)
  roomName?: string | null;
  accessCode?: string | null;
  maxMinutes?: number;
  startedAt?: string | null;
  expiresAt?: string | null;
  closedAt?: string | null;
  reopenRequestedAt?: string | null;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  source?: string | null;
  courseInterest?: string | null;
  status: LeadStatus;
  activityStatus?: ActivityStatus | null;
  lostReason?: LeadLostReason | null;
  notes?: string | null;
  lastContactAt?: string | null;
  nextFollowUpAt?: string | null;
  // Student intake — captured during Log a Call, carried forward onto any
  // demo booked later for this lead.
  city?: string | null;
  educationQualification?: string | null;
  collegeName?: string | null;
  passedOutYear?: number | null;
  currentStatus?: string | null;
  createdAt: string;
  assignedTo?: EmployeeLite | null;
  campaign?: { id: string; name: string } | null;
  demos?: DemoLite[]; // latest one only, from the list endpoint
  _count?: { demos: number; callLogs: number };
}

/** Play button for an auto-captured call recording. The audio is behind a login, so it is fetched
 *  as a blob through the authenticated API client and played from an object URL. */
function RecordingPlayer({ url }: { url?: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  if (!url) return <span className="text-xs text-muted-foreground">—</span>;
  const load = async () => {
    setLoading(true); setErr('');
    try {
      const res = await api.get(url, { responseType: 'blob' });
      setSrc(URL.createObjectURL(res.data));
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } }).response?.status;
      setErr(status === 403 ? 'No access' : 'Not available');
    } finally { setLoading(false); }
  };
  if (src) return <audio controls autoPlay src={src} className="h-8 w-56" />;
  return (
    <button onClick={load} disabled={loading} className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50">
      <PlayCircle className="w-3.5 h-3.5" /> {loading ? 'Loading…' : err || 'Play recording'}
    </button>
  );
}

type ActivityStatus = 'DNP' | 'FOLLOW_UP' | 'DEMO_BOOKED' | 'DEMO_OVER' | 'NOT_INTERESTED' | 'DISQUALIFIED';
type ActivityType = 'CALL' | 'MEETING';
const ACTIVITY_STATUSES: { value: ActivityStatus; label: string }[] = [
  { value: 'DNP', label: 'DNP' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'DEMO_BOOKED', label: 'Demo booked' },
  { value: 'DEMO_OVER', label: 'Demo over' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
  { value: 'DISQUALIFIED', label: 'Disqualified' },
];
const ACTIVITY_STATUS_LABEL = Object.fromEntries(ACTIVITY_STATUSES.map((s) => [s.value, s.label])) as Record<ActivityStatus, string>;
// Statuses that keep the lead open, so a follow-up date AND time must be given.
const NEEDS_FOLLOW_UP: ActivityStatus[] = ['DNP', 'FOLLOW_UP', 'DEMO_BOOKED', 'DEMO_OVER'];
// Stage each status moves the lead into (mirrors the server; shown as a preview).
const STATUS_STAGE: Record<ActivityStatus, LeadStatus> = {
  DNP: 'CONTACTED', FOLLOW_UP: 'CONTACTED', DEMO_BOOKED: 'DEMO_SCHEDULED', DEMO_OVER: 'DEMO_DONE', NOT_INTERESTED: 'LOST', DISQUALIFIED: 'LOST',
};

type LeadTab = 'profile' | 'activity' | 'tasks' | 'demo' | 'notes' | 'history';

interface LeadHistoryRow {
  id: string; type: string; summary: string; createdAt: string; actor?: EmployeeLite | null;
}

interface CallLog {
  id: string;
  recordingUrl?: string | null;
  activityType?: ActivityType | null;
  activityStatus?: ActivityStatus | null;
  notes: string | null;
  nextFollowUpAt?: string | null;
  calledAt: string;
  calledBy?: EmployeeLite | null;
}

interface Pulse {
  callsMadeToday: number;
  leadsCreatedToday: number;
  demosBookedToday: number;
  demosScheduledForToday: number;
  demosConductedToday: number;
  demosRescheduledToday: number;
  demosNoShowToday: number;
  demosPendingToday: number;
  followUpsDueToday: number;
  overdueFollowUps: number;
  enrolledToday: number;
  lostToday: number;
}

interface ReportRecipient { id: string; email: string; name: string | null; }

// Row shape for the BDA's Demo Booked / Demo Rescheduled / Demo Conducted
// tabs — same Demo record as DemoLite, but with the lead summary joined in
// since these tabs aren't scoped to one lead's detail view.
interface DemoRow {
  id: string;
  bookingNumber: string;
  scheduledAt: string;
  mode: DemoMode;
  status: DemoStatus;
  outcome?: DemoOutcome | null;
  rescheduleReason?: string | null;
  lead: { id: string; name: string; phone: string };
}

interface Stats {
  totalLeads: number;
  statusCounts: Record<string, number>;
  upcomingDemos: number;
  enrolledThisMonth: number;
}

interface ListMeta { total: number; page: number; limit: number; totalPages: number; }

// SIM call-tracking — devices registry + the unmatched-call review queue.
interface DeviceRow {
  id: string;
  label?: string | null;
  isActive: boolean;
  lastSeenAt?: string | null;
  createdAt: string;
  employee: EmployeeLite;
}

interface UnmatchedCall {
  id: string;
  recordingUrl?: string | null;
  rawPhoneNumber?: string | null;
  direction?: 'INBOUND' | 'OUTBOUND' | 'MISSED' | null;
  durationSeconds?: number | null;
  calledAt: string;
  calledBy?: EmployeeLite | null;
}

// KPI suite — per-salesperson leaderboard and the monthly goals set for them.
interface TargetGoal { enrollmentGoal: number; revenueGoal: number }

interface LeaderboardRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  callsMade: number;
  leadsCreated: number;
  demosBooked: number;
  demosConducted: number;
  enrolled: number;
  lost: number;
  revenue: number;
  avgFirstContactHours: number | null;
  target: TargetGoal | null;
}

interface TargetRow {
  id: string;
  employeeId: string;
  month: number;
  year: number;
  enrollmentGoal: number;
  revenueGoal: number;
  employee: EmployeeLite;
}

// Global call log — every call (manual or auto-tracked), across all leads.
interface CallLogRow {
  id: string;
  activityType?: ActivityType | null;
  activityStatus?: ActivityStatus | null;
  recordingUrl?: string | null;
  rawPhoneNumber?: string | null;
  direction?: 'INBOUND' | 'OUTBOUND' | 'MISSED' | null;
  durationSeconds?: number | null;
  source: 'MANUAL' | 'AUTO';
  notes?: string | null;
  calledAt: string;
  calledBy?: EmployeeLite | null;
  lead?: { id: string; name: string; phone: string } | null;
}

interface LeadQualityRow {
  campaignId: string;
  campaignName: string;
  channel: string;
  campaignStatus: string;
  leadsReceived: number;
  leadsGivenToSales: number;
  leadsAssigned: number;
  totalLeads: number;
  notInterested: number;
  doesntWork: number;
  totalLost: number;
  enrolled: number;
  qualityPct: number | null;
}

interface LeadQualityOverall {
  leadsReceived: number;
  leadsGivenToSales: number;
  leadsAssigned: number;
  totalLeads: number;
  notInterested: number;
  doesntWork: number;
  totalLost: number;
  enrolled: number;
  qualityPct: number | null;
}

interface LeadQualityData {
  campaigns: LeadQualityRow[];
  overall: LeadQualityOverall;
}

// ── Constants ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<LeadStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  CONTACTED: 'bg-blue-100 text-blue-700',
  DEMO_SCHEDULED: 'bg-amber-100 text-amber-700',
  DEMO_DONE: 'bg-purple-100 text-purple-700',
  NEGOTIATION: 'bg-orange-100 text-orange-700',
  ENROLLED: 'bg-green-100 text-green-700',
  LOST: 'bg-red-100 text-red-700',
};

const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'DEMO_DONE', 'NEGOTIATION', 'ENROLLED', 'LOST'];

const LOST_REASONS: { value: LeadLostReason; label: string }[] = [
  { value: 'NOT_INTERESTED', label: 'Not Interested' },
  { value: 'INVALID_NUMBER', label: 'Invalid Number' },
  { value: 'UNREACHABLE', label: 'Unreachable / No Response' },
  { value: 'DUPLICATE', label: 'Duplicate Lead' },
  { value: 'OTHER', label: 'Other' },
];
const LOST_REASON_LABEL: Record<LeadLostReason, string> = Object.fromEntries(LOST_REASONS.map((r) => [r.value, r.label])) as Record<LeadLostReason, string>;

const DEMO_MODES: DemoMode[] = ['ONLINE', 'OFFLINE'];
const DEMO_MODE_LABEL: Record<DemoMode, string> = { ONLINE: 'Online', OFFLINE: 'Offline' };
const DEMO_STATUS_LABEL: Record<DemoStatus, string> = {
  SCHEDULED: 'Scheduled', COMPLETED: 'Conducted', RESCHEDULED: 'Rescheduled', NO_SHOW: 'No Show', CANCELLED: 'Cancelled',
};
const DEMO_STATUS_COLOR: Record<DemoStatus, string> = {
  SCHEDULED: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  RESCHEDULED: 'bg-slate-100 text-slate-600',
  NO_SHOW: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const DEMO_OUTCOMES: DemoOutcome[] = ['NOT_INTERESTED', 'INTERESTED', 'FIFTY_FIFTY', 'NEED_FOLLOWUP'];
const DEMO_OUTCOME_LABEL: Record<DemoOutcome, string> = {
  NOT_INTERESTED: 'Not Interested', INTERESTED: 'Interested', FIFTY_FIFTY: '50-50', NEED_FOLLOWUP: 'Need Follow-up',
};
const DEMO_OUTCOME_COLOR: Record<DemoOutcome, string> = {
  NOT_INTERESTED: 'bg-red-100 text-red-700',
  INTERESTED: 'bg-green-100 text-green-700',
  FIFTY_FIFTY: 'bg-amber-100 text-amber-700',
  NEED_FOLLOWUP: 'bg-blue-100 text-blue-700',
};

function leadAgeLabel(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function reminderColor(nextFollowUpAt?: string | null): string {
  if (!nextFollowUpAt) return 'text-muted-foreground';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(nextFollowUpAt); due.setHours(0, 0, 0, 0);
  if (due < today) return 'text-red-600 font-semibold';
  if (due.getTime() === today.getTime()) return 'text-amber-600 font-semibold';
  return 'text-foreground';
}

function qualityColor(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 70) return 'text-green-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function pctLabel(pct: number | null): string {
  return pct === null ? '—' : `${pct.toFixed(1)}%`;
}

// Shared date-range presets for Sales Pulse / Leaderboard — both let a
// manager flip between "today", "this week", "this month", or an explicit
// custom range without re-deriving the same date math twice.
type RangePreset = 'today' | 'week' | 'month' | 'custom';
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function presetRange(preset: RangePreset): { start: string; end: string } {
  const today = new Date();
  const end = isoDate(today);
  if (preset === 'week') {
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
    return { start: isoDate(weekAgo), end };
  }
  if (preset === 'month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: isoDate(monthStart), end };
  }
  return { start: end, end };
}
function formatHours(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}
function formatCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** Dropdown with tick-boxes so several values can be selected at once. `value` is a comma-joined string (what the API takes). */
function MultiSelect({ label, options, value, onChange }: {
  label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? value.split(',') : [];
  const toggle = (v: string) => onChange((selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]).join(','));
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`px-3 py-2 border rounded-lg text-sm flex items-center gap-2 ${selected.length ? 'border-blue-400 bg-blue-50 text-blue-700' : ''}`}>
        {label}{selected.length > 0 && <span className="text-xs font-semibold">({selected.length})</span>}
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-56 max-h-72 overflow-y-auto bg-white border rounded-lg shadow-lg p-1">
            {options.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">No options</p>}
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/50 rounded cursor-pointer">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} /> {o.label}
              </label>
            ))}
            {selected.length > 0 && <button onClick={() => onChange('')} className="w-full text-left text-xs text-blue-600 px-2 py-1.5 hover:underline">Clear</button>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────
type Tab = 'leads' | 'reminders' | 'tasks' | 'summaries' | 'activityMonitor' | 'pulse' | 'leadQuality' | 'liveDemos' | 'demoBooked' | 'demoRescheduled' | 'demoConducted' | 'devices' | 'unmatchedCalls' | 'callLog' | 'leaderboard' | 'targets';
const VALID_TABS: Tab[] = ['leads', 'reminders', 'tasks', 'summaries', 'activityMonitor', 'pulse', 'leadQuality', 'liveDemos', 'demoBooked', 'demoRescheduled', 'demoConducted', 'devices', 'unmatchedCalls', 'callLog', 'leaderboard', 'targets'];
// Sales Pulse / Lead Quality are aggregate, cross-rep views — admin only.
// BDAs get Demo Booked/Rescheduled/Conducted instead, scoped to their own leads.
// Devices (issuing call-tracking tokens) is admin-only too. Unmatched Calls
// is regular EDIT access, same level as logging a call manually — both admins
// and BDAs can see and work it. Leaderboard/Targets are management-level KPI
// views, same access tier as Pulse/Lead Quality. "My Students" lives on its
// own top-level page (see MyStudents.tsx), not as a Sales tab.
const ADMIN_ONLY_TABS: Tab[] = ['summaries', 'activityMonitor', 'pulse', 'leadQuality', 'liveDemos', 'devices', 'leaderboard', 'targets'];
const BDA_ONLY_TABS: Tab[] = ['demoBooked', 'demoRescheduled', 'demoConducted'];
const EDIT_REQUIRED_TABS: Tab[] = ['unmatchedCalls'];

export default function SalesPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.SALES;
  const canEdit = hasModule('SALES', 'EDIT');
  const isAdmin = hasModule('SALES', 'ADMIN');

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab>(tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'leads');
  const setTab = (t: Tab) => { setTabState(t); setSearchParams({ tab: t }, { replace: true }); };
  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== tab) setTabState(tabFromUrl);
  }, [tabFromUrl]);

  // Once access has loaded, bounce off any tab this role isn't allowed to
  // see (e.g. a BDA following an old ?tab=pulse link, or vice versa).
  useEffect(() => {
    if (!loaded) return;
    if (!isAdmin && ADMIN_ONLY_TABS.includes(tab)) setTab('leads');
    if (isAdmin && BDA_ONLY_TABS.includes(tab)) setTab('leads');
    if (!canEdit && EDIT_REQUIRED_TABS.includes(tab)) setTab('leads');
  }, [loaded, isAdmin, canEdit, tab]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [activityFilter, setActivityFilter] = useState<string>('');
  const [followUpFilter, setFollowUpFilter] = useState<string>('');
  const [assignedFilter, setAssignedFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [followFrom, setFollowFrom] = useState('');
  const [followTo, setFollowTo] = useState('');
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  // Populated when the detail modal is opened from somewhere other than the
  // Leads tab (e.g. a Demo Booked row), where we don't already have the full
  // lead object in memory — falls back to `leads.find(...)` first, which stays
  // live-refreshed off fetchAll for the Leads tab's own click-through.
  const [fetchedDetailLead, setFetchedDetailLead] = useState<Lead | null>(null);
  const [lostReasonLead, setLostReasonLead] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);

  // Any filter change resets to page 1 — otherwise you can land on a page
  // number that no longer exists once the result set shrinks.
  useEffect(() => { setPage(1); }, [search, statusFilter, activityFilter, followUpFilter, assignedFilter, sourceFilter, createdFrom, createdTo, followFrom, followTo]);
  useEffect(() => { api.get('/api/sales/sources').then((r) => setSourceOptions(r.data.data)).catch(() => setSourceOptions([])); }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (activityFilter) params.activityStatus = activityFilter;
      if (assignedFilter) params.assignedToId = assignedFilter;
      if (sourceFilter) params.source = sourceFilter;
      if (createdFrom) params.createdFrom = createdFrom;
      if (createdTo) params.createdTo = createdTo;
      if (followFrom) params.followUpFrom = followFrom;
      if (followTo) params.followUpTo = followTo;
      if (followUpFilter) params.followUp = followUpFilter;
      const [leadsRes, statsRes] = await Promise.all([
        api.get('/api/sales/leads', { params }),
        api.get('/api/sales/stats'),
      ]);
      setLeads(leadsRes.data.data);
      setMeta(leadsRes.data.meta);
      setStats(statsRes.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load sales data');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, activityFilter, followUpFilter, assignedFilter, sourceFilter, createdFrom, createdTo, followFrom, followTo]);

  useEffect(() => { if (level && tab === 'leads') fetchAll(); }, [level, tab, fetchAll]);

  // Soft delete: the lead leaves every screen but stays in the database with its history.
  const deleteLead = async (lead: Lead) => {
    if (!window.confirm(`Remove "${lead.name}" from the screen? The lead and its history stay in the database.`)) return;
    try {
      await api.delete(`/api/sales/leads/${lead.id}`);
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to remove lead');
    }
  };

  useEffect(() => {
    if (!level) return;
    api.get('/api/sales/team').then((res) => setEmployees(res.data.data)).catch(() => setEmployees([]));
  }, [level]);

  const openLeadDetail = async (id: string) => {
    setDetailLeadId(id);
    if (leads.some((l) => l.id === id)) { setFetchedDetailLead(null); return; }
    try {
      const res = await api.get(`/api/sales/leads/${id}`);
      setFetchedDetailLead(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load lead');
      setDetailLeadId(null);
    }
  };

  const closeLeadDetail = () => { setDetailLeadId(null); setFetchedDetailLead(null); };

  const refreshDetailLead = async () => {
    if (tab === 'leads') fetchAll();
    if (!detailLeadId) return;
    try {
      const res = await api.get(`/api/sales/leads/${detailLeadId}`);
      setFetchedDetailLead(res.data.data);
    } catch {
      // Detail modal keeps showing its last-known state; not worth surfacing an error for a background refresh.
    }
  };

  const updateLeadStatus = async (id: string, status: LeadStatus, lostReason?: LeadLostReason) => {
    try {
      await api.put(`/api/sales/leads/${id}`, { status, lostReason });
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to update lead');
    }
  };

  // Marking a lead LOST requires picking a reason first — every other status
  // change applies immediately.
  const onStatusChange = (lead: Lead, status: LeadStatus) => {
    if (status === 'LOST') { setLostReasonLead(lead); return; }
    updateLeadStatus(lead.id, status);
  };

  const reassignLead = async (id: string, assignedToId: string) => {
    try {
      await api.put(`/api/sales/leads/${id}`, { assignedToId: assignedToId || null });
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to reassign lead');
    }
  };

  if (loaded && !level) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <Lock className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">No access to Sales</p>
          <p className="text-sm text-muted-foreground">
            Ask someone with Master Control to grant you access to this module.
          </p>
        </div>
      </div>
    );
  }

  const detailLead = (detailLeadId && leads.find((l) => l.id === detailLeadId)) || fetchedDetailLead;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-muted-foreground text-sm">Leads, calls, demos, and conversion pipeline</p>
        </div>
        {canEdit && tab === 'leads' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <Upload className="w-4 h-4" /> Bulk Upload
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Lead
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-b">
        {(isAdmin
          ? [
              { id: 'leads' as Tab, label: 'Leads', icon: Users },
              { id: 'reminders' as Tab, label: 'My Reminders', icon: Bell },
              { id: 'tasks' as Tab, label: 'Manage Tasks', icon: ListChecks },
              { id: 'callLog' as Tab, label: 'Call Log', icon: History },
              { id: 'summaries' as Tab, label: 'Summaries', icon: BarChart3 },
              { id: 'activityMonitor' as Tab, label: 'Activity Monitor', icon: Eye },
              { id: 'pulse' as Tab, label: 'Sales Pulse', icon: Activity },
              { id: 'leaderboard' as Tab, label: 'Leaderboard', icon: Trophy },
              { id: 'targets' as Tab, label: 'Targets', icon: TargetIcon },
              { id: 'leadQuality' as Tab, label: 'Lead Quality', icon: Percent },
              { id: 'liveDemos' as Tab, label: 'Live Demos', icon: Video },
              { id: 'unmatchedCalls' as Tab, label: 'Unmatched Calls', icon: PhoneIncoming },
              { id: 'devices' as Tab, label: 'Devices', icon: Smartphone },
            ]
          : [
              { id: 'leads' as Tab, label: 'Leads', icon: Users },
              { id: 'reminders' as Tab, label: 'My Reminders', icon: Bell },
              { id: 'tasks' as Tab, label: 'My Tasks', icon: ListChecks },
              { id: 'callLog' as Tab, label: 'Call Log', icon: History },
              { id: 'demoBooked' as Tab, label: 'Demo Booked', icon: Calendar },
              { id: 'demoRescheduled' as Tab, label: 'Demo Rescheduled', icon: RefreshCw },
              { id: 'demoConducted' as Tab, label: 'Demo Conducted', icon: CheckCircle2 },
              ...(canEdit ? [{ id: 'unmatchedCalls' as Tab, label: 'Unmatched Calls', icon: PhoneIncoming }] : []),
            ]
        ).map((t) => {
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {tab === 'leads' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Total Leads" value={stats?.totalLeads ?? '—'} />
            <StatCard icon={Calendar} label="Upcoming Demos" value={stats?.upcomingDemos ?? '—'} />
            <StatCard icon={CheckCircle2} label="Enrolled this month" value={stats?.enrolledThisMonth ?? '—'} />
            <StatCard icon={TrendingUp} label="In Negotiation" value={stats?.statusCounts?.NEGOTIATION ?? 0} />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email..."
              className="px-3 py-2 border rounded-lg text-sm w-64"
            />
            <MultiSelect label="Lead stage" value={statusFilter} onChange={setStatusFilter}
              options={STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))} />
            <MultiSelect label="Status" value={activityFilter} onChange={setActivityFilter}
              options={[...ACTIVITY_STATUSES.map((s) => ({ value: s.value, label: s.label })), { value: 'NONE', label: 'No status yet' }]} />
            {isAdmin && (
              <MultiSelect label="Assigned to" value={assignedFilter} onChange={setAssignedFilter}
                options={[{ value: 'NONE', label: 'Unassigned' }, ...employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))]} />
            )}
            <MultiSelect label="Source" value={sourceFilter} onChange={setSourceFilter}
              options={[...sourceOptions.map((s) => ({ value: s, label: s })), { value: 'Unknown', label: 'Unknown' }]} />
            <select value={followUpFilter} onChange={(e) => setFollowUpFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All reminders</option>
              <option value="today">Due today</option>
              <option value="overdue">Overdue</option>
            </select>
            <label className="text-xs text-muted-foreground flex items-center gap-1">Created
              <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" />
              –<input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" />
            </label>
            <label className="text-xs text-muted-foreground flex items-center gap-1">Follow-up
              <input type="date" value={followFrom} onChange={(e) => setFollowFrom(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" />
              –<input type="date" value={followTo} onChange={(e) => setFollowTo(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" />
            </label>
            {(statusFilter || activityFilter || assignedFilter || sourceFilter || createdFrom || createdTo || followFrom || followTo || followUpFilter) && (
              <button onClick={() => { setStatusFilter(''); setActivityFilter(''); setAssignedFilter(''); setSourceFilter(''); setCreatedFrom(''); setCreatedTo(''); setFollowFrom(''); setFollowTo(''); setFollowUpFilter(''); }} className="text-xs text-blue-600 hover:underline">Clear all filters</button>
            )}
          </div>

          {/* Leads table */}
          <div className="bg-card border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Lead Stage</th>
                  <th className="px-3 py-3">Assigned</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Demo</th>
                  <th className="px-3 py-3">Reminder</th>
                  <th className="px-3 py-3">Last Contact</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Lead Age</th>
                  <th className="px-3 py-3">Date Of Demo</th>
                  {isAdmin && <th className="px-3 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={15} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={15} className="px-4 py-8 text-center text-muted-foreground">No leads found</td></tr>
                ) : leads.map((lead, i) => {
                  const latestDemo = lead.demos?.[0];
                  return (
                    <tr key={lead.id} className="hover:bg-muted/30">
                      <td className="px-3 py-3 text-muted-foreground">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-3 font-medium whitespace-nowrap">
                        <button onClick={() => openLeadDetail(lead.id)} className="text-blue-600 hover:underline text-left">
                          {lead.name}
                        </button>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="w-3 h-3" /> {lead.phone}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {lead.email ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="w-3 h-3" /> {lead.email}</div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {lead.activityStatus
                          ? <span className="text-xs font-medium rounded-full px-2 py-1 bg-slate-100 text-slate-700">{ACTIVITY_STATUS_LABEL[lead.activityStatus]}</span>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        {canEdit ? (
                          <select
                            value={lead.status}
                            onChange={(e) => onStatusChange(lead, e.target.value as LeadStatus)}
                            className={`text-xs font-medium rounded-full px-2 py-1 border-0 ${STATUS_COLOR[lead.status]}`}
                          >
                            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                          </select>
                        ) : (
                          <span className={`text-xs font-medium rounded-full px-2 py-1 ${STATUS_COLOR[lead.status]}`}>{lead.status.replace(/_/g, ' ')}</span>
                        )}
                        {lead.status === 'LOST' && lead.lostReason && (
                          <p className="text-[10px] text-muted-foreground mt-1">{LOST_REASON_LABEL[lead.lostReason]}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {canEdit ? (
                          <select
                            value={lead.assignedTo?.id || ''}
                            onChange={(e) => reassignLead(lead.id, e.target.value)}
                            className="text-xs px-2 py-1 border rounded-lg bg-white"
                          >
                            <option value="">Unassigned</option>
                            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                          </select>
                        ) : (
                          lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : '—'
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{lead.source || '—'}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {latestDemo ? (
                          <span
                            className={`text-xs font-medium rounded-full px-2 py-1 ${DEMO_STATUS_COLOR[latestDemo.status]}`}
                            title={latestDemo.bookingNumber}
                          >
                            {DEMO_MODE_LABEL[latestDemo.mode]} · {DEMO_STATUS_LABEL[latestDemo.status]}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">Not booked</span>}
                      </td>
                      <td className={`px-3 py-3 text-xs whitespace-nowrap ${reminderColor(lead.nextFollowUpAt)}`}>
                        {lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {lead.lastContactAt ? formatDateTime(lead.lastContactAt) : 'Never'}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(lead.createdAt)}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{leadAgeLabel(lead.createdAt)}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {latestDemo ? formatDate(latestDemo.scheduledAt) : '—'}
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-3">
                          <button onClick={() => deleteLead(lead)} title="Remove from screen (kept in database)" className="text-xs text-red-600 hover:underline">Remove</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && meta && meta.total > 0 && (
            <div className="flex items-center justify-between pt-1 text-sm text-muted-foreground">
              <span>{meta.total} lead{meta.total === 1 ? '' : 's'} · page {meta.page} of {meta.totalPages}</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="flex items-center gap-1 px-2 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-muted/50"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => Math.min(p + 1, meta.totalPages))}
                  className="flex items-center gap-1 px-2 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-muted/50"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'pulse' && isAdmin && <SalesPulsePanel canEdit={canEdit} />}

      {tab === 'leadQuality' && isAdmin && <LeadQualityPanel />}

      {tab === 'liveDemos' && isAdmin && <LiveDemosPanel />}

      {tab === 'reminders' && <RemindersPanel onOpenLead={openLeadDetail} />}

      {tab === 'tasks' && <TasksPanel isAdmin={isAdmin} canEdit={canEdit} employees={employees} onOpenLead={openLeadDetail} />}

      {tab === 'summaries' && isAdmin && <SummariesPanel />}

      {tab === 'activityMonitor' && isAdmin && <ActivityMonitorPanel employees={employees} onOpenLead={openLeadDetail} />}

      {tab === 'leaderboard' && isAdmin && <LeaderboardPanel />}

      {tab === 'targets' && isAdmin && <TargetsPanel employees={employees} />}

      {tab === 'demoBooked' && !isAdmin && <DemoListPanel status="SCHEDULED" emptyLabel="No demos booked" onOpenLead={openLeadDetail} />}

      {tab === 'demoRescheduled' && !isAdmin && <DemoListPanel status="RESCHEDULED" emptyLabel="No demos rescheduled" onOpenLead={openLeadDetail} />}

      {tab === 'demoConducted' && !isAdmin && <DemoListPanel status="COMPLETED" emptyLabel="No demos conducted yet" onOpenLead={openLeadDetail} />}

      {tab === 'callLog' && <CallLogPanel onOpenLead={openLeadDetail} />}

      {tab === 'devices' && isAdmin && <DevicesPanel employees={employees} />}

      {tab === 'unmatchedCalls' && canEdit && <UnmatchedCallsPanel setGlobalError={setError} />}

      {showAdd && (
        <AddLeadModal
          employees={employees}
          saving={saving}
          setSaving={setSaving}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchAll(); }}
          setError={setError}
        />
      )}

      {showBulkUpload && (
        <BulkUploadLeadsModal
          onClose={() => setShowBulkUpload(false)}
          setError={setError}
          onSaved={() => { fetchAll(); }}
        />
      )}

      {lostReasonLead && (
        <LostReasonModal
          lead={lostReasonLead}
          saving={saving}
          setSaving={setSaving}
          onClose={() => setLostReasonLead(null)}
          onConfirm={async (reason) => {
            setSaving(true);
            await updateLeadStatus(lostReasonLead.id, 'LOST', reason);
            setSaving(false);
            setLostReasonLead(null);
          }}
        />
      )}

      {detailLead && (
        <LeadDetailModal
          lead={detailLead}
          employees={employees}
          canEdit={canEdit}
          onClose={closeLeadDetail}
          onChanged={refreshDetailLead}
          setGlobalError={setError}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-blue-600" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

interface ModalProps {
  employees: EmployeeLite[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
  setError: (s: string) => void;
}

function AddLeadModal({ employees, saving, setSaving, onClose, onSaved, setError }: ModalProps) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', source: '', courseInterest: '', assignedToId: '', notes: '',
  });

  const submit = async () => {
    if (!form.name || !form.phone) { setError('Name and phone are required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/sales/leads', { ...form, assignedToId: form.assignedToId || undefined });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to create lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">New Lead</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Phone *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Source (e.g. Instagram, Referral)" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Course Interest" value={form.courseInterest} onChange={(e) => setForm({ ...form, courseInterest: e.target.value })} />
          {employees.length > 0 && (
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
              <option value="">Assign to...</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          )}
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Create Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

type BulkRow = Record<string, string>;
type BulkResult = { row: number; status: 'created' | 'error'; message?: string; leadId?: string };

// Case/space-insensitive column lookup, mirroring the backend's `field()` —
// lets the preview table read both the simple manual-entry template (name,
// phone, ...) and a direct export from a legacy CRM (Name, Phone, Assigned,
// Status, ...) without the user having to rename any columns.
function bulkField(row: BulkRow, ...aliases: string[]): string {
  const normalized: Record<string, string> = {};
  for (const key of Object.keys(row)) {
    normalized[key.trim().toLowerCase().replace(/\s+/g, '')] = String(row[key] ?? '');
  }
  for (const alias of aliases) {
    const v = normalized[alias];
    if (v && v.trim()) return v.trim();
  }
  return '';
}

function BulkUploadLeadsModal({ onClose, setError, onSaved }: {
  onClose: () => void; setError: (s: string) => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { name: 'John Doe', phone: '9876543210', email: 'john@example.com', source: 'Instagram', courseInterest: 'Data Analytics', assignedToCode: '', campaign: '', notes: '' },
      { name: 'Jane S', phone: '9876543211', email: '', source: 'Referral', courseInterest: 'MERN Stack', assignedToCode: '', campaign: '', notes: '' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, 'lead_bulk_upload_template.xlsx');
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
    if (!rows.length) { setError('Choose a file with lead rows first'); return; }
    setUploading(true);
    setError('');
    try {
      const res = await api.post('/api/sales/leads/bulk', { leads: rows });
      setResults(res.data.data.results);
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Bulk upload failed');
    } finally {
      setUploading(false);
    }
  };

  const createdCount = results?.filter((r) => r.status === 'created').length ?? 0;
  const errorCount = results ? results.length - createdCount : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Bulk Upload Leads</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground">
            Two formats work here. Either the simple template below (<code>name, phone, email, source, courseInterest,
            assignedToCode, campaign, notes</code>), or a direct export from your old CRM with columns like
            <code> Name, Phone, Status, Assigned, Source, Demo, Reminder, Last Contact, Created, Date Of Demo</code> —
            upload that file exactly as exported, no renaming needed. For the CRM export, old status text (e.g. "Followup",
            "Not Interested", "Demo conducted - Positive") is automatically mapped into the pipeline, <code>Assigned</code> is
            matched by rep name, and <code>Created</code>/<code>Reminder</code>/<code>Last Contact</code> are preserved so Lead
            Age stays accurate. Leads with a phone number that already exists are skipped and reported as errors, so it's safe
            to re-upload the same file.
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
                  <tr>{['Name', 'Phone', 'Status', 'Assigned'].map((h) => <th key={h} className="px-2 py-1 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {rows.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 whitespace-nowrap">{bulkField(r, 'name') || '—'}</td>
                      <td className="px-2 py-1">{bulkField(r, 'phone', 'phonenumber', 'mobile') || <span className="text-red-500">missing</span>}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{bulkField(r, 'status') || '—'}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{bulkField(r, 'assigned', 'assignedto') || bulkField(r, 'assignedtocode') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && <p className="text-[10px] text-muted-foreground px-2 py-1">...and {rows.length - 10} more row(s)</p>}
            </div>
          )}

          {results && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                <span className="text-green-600">{createdCount} created</span>
                {errorCount > 0 && <span className="text-red-600"> · {errorCount} skipped</span>}
              </p>
              {errorCount > 0 && (
                <div className="border rounded-lg max-h-40 overflow-auto divide-y">
                  {results.filter((r) => r.status === 'error').map((r) => (
                    <div key={r.row} className="px-2 py-1.5 text-xs">
                      <span className="font-medium">Row {r.row}:</span> {r.message}
                    </div>
                  ))}
                </div>
              )}
              {results.some((r) => r.status === 'created' && r.message) && (
                <div>
                  <p className="text-xs text-amber-700 font-medium mb-1">Created with notes:</p>
                  <div className="border rounded-lg max-h-40 overflow-auto divide-y">
                    {results.filter((r) => r.status === 'created' && r.message).map((r) => (
                      <div key={r.row} className="px-2 py-1.5 text-xs text-amber-700">
                        <span className="font-medium">Row {r.row}:</span> {r.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">{results ? 'Close' : 'Cancel'}</button>
          {!results && (
            <button onClick={submit} disabled={uploading || !rows.length} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
              {uploading ? 'Uploading...' : `Upload ${rows.length || ''} Lead${rows.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LostReasonModal({ lead, saving, setSaving, onClose, onConfirm }: {
  lead: Lead; saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onConfirm: (reason: LeadLostReason) => void;
}) {
  const [reason, setReason] = useState<LeadLostReason | ''>('');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Mark Lost — {lead.name}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground">Why is this lead being marked Lost? This feeds the Lead Quality report.</p>
        <select
          autoFocus
          className="w-full px-3 py-2 border rounded-lg text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value as LeadLostReason)}
        >
          <option value="">Select a reason...</option>
          {LOST_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button
            onClick={() => reason && onConfirm(reason)}
            disabled={!reason || saving}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Mark Lost'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lead detail modal: call log timeline + demo actions + reassignment ────
function LeadDetailModal({ lead, employees, canEdit, onClose, onChanged, setGlobalError }: {
  lead: Lead; employees: EmployeeLite[]; canEdit: boolean; onClose: () => void; onChanged: () => void; setGlobalError: (s: string) => void;
}) {
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [demos, setDemos] = useState<DemoLite[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [localError, setLocalError] = useState('');

  const [leadTab, setLeadTab] = useState<LeadTab>('activity');
  const [history, setHistory] = useState<LeadHistoryRow[]>([]);
  const [leadNotes, setLeadNotes] = useState<{ id: string; body: string; createdAt: string; author?: EmployeeLite | null }[]>([]);
  const [leadTasks, setLeadTasks] = useState<TaskRow[]>([]);
  const [noteText, setNoteText] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profile, setProfile] = useState({
    name: lead.name, phone: lead.phone, email: lead.email || '', source: lead.source || '', courseInterest: lead.courseInterest || '',
    city: lead.city || '', educationQualification: lead.educationQualification || '', collegeName: lead.collegeName || '',
    passedOutYear: lead.passedOutYear ? String(lead.passedOutYear) : '', currentStatus: lead.currentStatus || '',
  });
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [callNotes, setCallNotes] = useState('');
  const [callFollowUp, setCallFollowUp] = useState(''); // datetime-local value (date AND time)
  const [callActivityType, setCallActivityType] = useState<ActivityType>('CALL');
  const [callActivityStatus, setCallActivityStatus] = useState<ActivityStatus | ''>('');
  const [callStage, setCallStage] = useState<LeadStatus | ''>(''); // optional manual stage override
  const [callCourse, setCallCourse] = useState(lead.courseInterest || '');
  const [callLostReason, setCallLostReason] = useState<LeadLostReason | ''>('');
  // Student intake — collected during the call itself, pre-filled with
  // whatever's already on file for this lead so a BDA only has to fill in
  // what's missing/changed rather than retype everything each call.
  const [callCity, setCallCity] = useState(lead.city || '');
  const [callEducation, setCallEducation] = useState(lead.educationQualification || '');
  const [callCollege, setCallCollege] = useState(lead.collegeName || '');
  const [callPassedOutYear, setCallPassedOutYear] = useState(lead.passedOutYear ? String(lead.passedOutYear) : '');
  const [callCurrentStatus, setCallCurrentStatus] = useState(lead.currentStatus || '');
  const [savingCall, setSavingCall] = useState(false);

  // Demo booking happens inside Log Activity (status = Demo booked).
  const [demoMode, setDemoMode] = useState<DemoMode>('ONLINE');
  const [demoConductedBy, setDemoConductedBy] = useState(lead.assignedTo?.id || '');
  const [demoEmail, setDemoEmail] = useState(lead.email || '');

  const [actingDemo, setActingDemo] = useState<{ id: string; type: 'complete' | 'reschedule' | 'noshow' | 'cancel' } | null>(null);
  const [actionFeedback, setActionFeedback] = useState('');
  const [actionConductedById, setActionConductedById] = useState('');
  const [actionNewScheduledAt, setActionNewScheduledAt] = useState('');
  const [actionNewMode, setActionNewMode] = useState<DemoMode>('ONLINE');
  const [actionRescheduleReason, setActionRescheduleReason] = useState('');
  // Mark Conducted specifics.
  const [actionOutcome, setActionOutcome] = useState<DemoOutcome | ''>('');
  const [actionProofFile, setActionProofFile] = useState<File | null>(null);
  const [savingAction, setSavingAction] = useState(false);

  const [reassignSaving, setReassignSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadingHistory(true);
    setLocalError('');
    try {
      const [callsRes, demosRes, histRes, notesRes, tasksRes] = await Promise.all([
        api.get(`/api/sales/leads/${lead.id}/calls`),
        api.get('/api/sales/demos', { params: { leadId: lead.id } }),
        api.get(`/api/sales/leads/${lead.id}/history`),
        api.get(`/api/sales/leads/${lead.id}/notes`),
        api.get('/api/sales/tasks', { params: { leadId: lead.id, limit: '100' } }),
      ]);
      setCallLogs(callsRes.data.data);
      setDemos(demosRes.data.data);
      setHistory(histRes.data.data);
      setLeadNotes(notesRes.data.data);
      setLeadTasks(tasksRes.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setLocalError(e.response?.data?.message || 'Failed to load lead history');
    } finally {
      setLoadingHistory(false);
    }
  }, [lead.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/api/sales/courses').then((r) => setCourses(r.data.data)).catch(() => setCourses([])); }, []);

  const submitCall = async () => {
    if (!callActivityStatus) { setLocalError('Choose the Update Status first'); return; }
    // DNP (did not pick) needs no notes; every other status does.
    if (callActivityStatus !== 'DNP' && !callNotes.trim()) { setLocalError('Notes are required for this status'); return; }
    if (NEEDS_FOLLOW_UP.includes(callActivityStatus) && !callFollowUp) { setLocalError('Pick the follow-up date and time'); return; }
    if (callActivityStatus === 'DEMO_BOOKED' && !callCourse.trim()) { setLocalError('Select the course for the demo'); return; }
    if (callActivityStatus === 'DEMO_BOOKED' && demoMode === 'ONLINE' && !/^\S+@\S+\.\S+$/.test(demoEmail.trim())) { setLocalError('Enter the student\'s email — the online demo link is sent there'); return; }
    setSavingCall(true);
    setLocalError('');
    try {
      // Demo booked: the date & time chosen above is the demo slot — book it first so a
      // failure (e.g. bad email) doesn't leave an activity logged without its demo.
      if (callActivityStatus === 'DEMO_BOOKED') {
        await api.post('/api/sales/demos', {
          leadId: lead.id,
          scheduledAt: new Date(callFollowUp).toISOString(),
          mode: demoMode,
          courseEnquired: callCourse.trim(),
          conductedById: demoConductedBy || undefined,
          attendeeEmail: demoMode === 'ONLINE' ? demoEmail.trim() : undefined,
        });
      }
      await api.post(`/api/sales/leads/${lead.id}/calls`, {
        activityType: callActivityType,
        activityStatus: callActivityStatus,
        notes: callNotes.trim() || undefined,
        nextFollowUpAt: NEEDS_FOLLOW_UP.includes(callActivityStatus) ? new Date(callFollowUp).toISOString() : undefined,
        status: callStage || undefined,
        courseInterest: callCourse.trim() || undefined,
        lostReason: callActivityStatus === 'DISQUALIFIED' ? (callLostReason || undefined) : undefined,
        city: callCity.trim(),
        educationQualification: callEducation.trim(),
        collegeName: callCollege.trim(),
        passedOutYear: callPassedOutYear.trim(),
        currentStatus: callCurrentStatus.trim(),
      });
      setCallNotes(''); setCallFollowUp(''); setCallActivityStatus(''); setCallStage(''); setCallLostReason('');
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setLocalError(e.response?.data?.message || 'Failed to log call');
    } finally {
      setSavingCall(false);
    }
  };

  const fail = (err: unknown, fallback: string) => {
    setLocalError((err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback);
  };
  const saveProfile = async () => {
    if (!profile.name.trim() || !profile.phone.trim()) { setLocalError('Name and phone are required'); return; }
    setSavingProfile(true); setLocalError('');
    try {
      await api.put(`/api/sales/leads/${lead.id}`, { ...profile, name: profile.name.trim(), phone: profile.phone.trim() });
      await load(); onChanged();
    } catch (err) { fail(err, 'Failed to save'); } finally { setSavingProfile(false); }
  };
  const addLeadNote = async () => {
    if (!noteText.trim()) return;
    try { await api.post(`/api/sales/leads/${lead.id}/notes`, { body: noteText.trim() }); setNoteText(''); await load(); }
    catch (err) { fail(err, 'Failed to add note'); }
  };
  const addLeadTask = async () => {
    if (!taskTitle.trim()) { setLocalError('Enter a task title'); return; }
    try {
      await api.post('/api/sales/tasks', { title: taskTitle.trim(), leadId: lead.id, dueAt: taskDue ? new Date(taskDue).toISOString() : undefined });
      setTaskTitle(''); setTaskDue(''); await load();
    } catch (err) { fail(err, 'Failed to add task'); }
  };
  const finishLeadTask = async (id: string) => {
    try { await api.put(`/api/sales/tasks/${id}`, { status: 'DONE' }); await load(); }
    catch (err) { fail(err, 'Failed'); }
  };

  const reassign = async (assignedToId: string) => {
    setReassignSaving(true);
    try {
      await api.put(`/api/sales/leads/${lead.id}`, { assignedToId: assignedToId || null });
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setGlobalError(e.response?.data?.message || 'Failed to reassign lead');
    } finally {
      setReassignSaving(false);
    }
  };

  const closeAction = () => {
    setActingDemo(null); setActionFeedback(''); setActionConductedById('');
    setActionNewScheduledAt(''); setActionNewMode('ONLINE'); setActionRescheduleReason('');
    setActionOutcome(''); setActionProofFile(null);
  };

  const submitAction = async () => {
    if (!actingDemo) return;
    const existingDemo = demos.find((d) => d.id === actingDemo.id);
    if (actingDemo.type === 'complete') {
      if (!actionOutcome) { setLocalError('Pick an outcome before marking this demo Conducted'); return; }
      if (!actionProofFile && !existingDemo?.proofUrl) { setLocalError('Attach a photo/screenshot as proof the demo was conducted'); return; }
    }
    if (actingDemo.type === 'reschedule' && !actionRescheduleReason.trim()) {
      setLocalError('A reason for rescheduling is required'); return;
    }
    setSavingAction(true);
    setLocalError('');
    try {
      if (actingDemo.type === 'complete') {
        const fd = new FormData();
        fd.append('status', 'COMPLETED');
        fd.append('outcome', actionOutcome);
        if (actionFeedback) fd.append('feedback', actionFeedback);
        if (actionConductedById) fd.append('conductedById', actionConductedById);
        if (actionProofFile) fd.append('proof', actionProofFile);
        await api.put(`/api/sales/demos/${actingDemo.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else if (actingDemo.type === 'noshow') {
        await api.put(`/api/sales/demos/${actingDemo.id}`, { status: 'NO_SHOW', feedback: actionFeedback || undefined });
      } else if (actingDemo.type === 'cancel') {
        await api.put(`/api/sales/demos/${actingDemo.id}`, { status: 'CANCELLED', feedback: actionFeedback || undefined });
      } else if (actingDemo.type === 'reschedule') {
        if (!actionNewScheduledAt) { setLocalError('Pick the new date/time'); setSavingAction(false); return; }
        await api.post(`/api/sales/demos/${actingDemo.id}/reschedule`, {
          scheduledAt: new Date(actionNewScheduledAt).toISOString(),
          mode: actionNewMode,
          reason: actionRescheduleReason.trim(),
        });
      }
      closeAction();
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setLocalError(e.response?.data?.message || 'Failed to update demo');
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-lg">{lead.name}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {lead.phone}</span>
              {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {lead.email}</span>}
              {lead.source && <span>Source: {lead.source}</span>}
              {lead.courseInterest && <span>Interested: {lead.courseInterest}</span>}
              <span>Lead Age: {leadAgeLabel(lead.createdAt)}</span>
            </div>
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span className={`text-xs font-medium rounded-full px-2 py-1 ${STATUS_COLOR[lead.status]}`}>{lead.status.replace(/_/g, ' ')}</span>
          {lead.status === 'LOST' && lead.lostReason && (
            <span className="text-xs text-muted-foreground">({LOST_REASON_LABEL[lead.lostReason]})</span>
          )}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Assigned to:</span>
            {canEdit ? (
              <select
                value={lead.assignedTo?.id || ''}
                disabled={reassignSaving}
                onChange={(e) => reassign(e.target.value)}
                className="text-xs px-2 py-1 border rounded-lg"
              >
                <option value="">Unassigned</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
            ) : (
              <span>{lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : '—'}</span>
            )}
          </div>
        </div>

        {localError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{localError}</div>}

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 border-b -mt-2">
          {([
            ['profile', 'Profile'], ['activity', 'Activity'], ['tasks', 'Tasks / Reminders'],
            ['demo', `Meeting / Demo${demos.length ? ` (${demos.length})` : ''}`], ['notes', 'Notes'], ['history', 'History'],
          ] as [LeadTab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setLeadTab(id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${leadTab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Profile ── */}
        {leadTab === 'profile' && (
          <div className="space-y-4">
            {lead.nextFollowUpAt && (
              <div className={`text-sm rounded-lg border px-3 py-2 ${reminderColor(lead.nextFollowUpAt)}`}>Next follow-up: <b>{formatDateTime(lead.nextFollowUpAt)}</b></div>
            )}
            {canEdit && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    ['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['source', 'Source'],
                    ['courseInterest', 'Course enquired'], ['city', 'City'], ['educationQualification', 'Education qualification'],
                    ['collegeName', 'College name'], ['passedOutYear', 'Passed out year'], ['currentStatus', 'Current status'],
                  ] as [keyof typeof profile, string][]).map(([k, label]) => (
                    <label key={k} className="text-xs text-muted-foreground space-y-1 block">
                      {label}
                      <input className="w-full px-3 py-2 border rounded-lg text-sm text-foreground" value={profile[k]} onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} />
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button onClick={saveProfile} disabled={savingProfile} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{savingProfile ? 'Saving...' : 'Save changes'}</button>
                </div>
              </>
            )}
            {!canEdit && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(profile).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v || '—'}</dd></div>)}
              </dl>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><p className="text-muted-foreground">Created</p><p>{formatDateTime(lead.createdAt)}</p></div>
              <div><p className="text-muted-foreground">Last contact</p><p>{lead.lastContactAt ? formatDateTime(lead.lastContactAt) : 'Never'}</p></div>
              <div><p className="text-muted-foreground">Lead age</p><p>{leadAgeLabel(lead.createdAt)}</p></div>
              <div><p className="text-muted-foreground">Activities</p><p>{lead._count?.callLogs ?? 0}</p></div>
            </div>
          </div>
        )}

        {/* ── Tasks / Reminders ── */}
        {leadTab === 'tasks' && (
          <div className="space-y-4">
            {lead.nextFollowUpAt && <div className={`text-sm rounded-lg border px-3 py-2 ${reminderColor(lead.nextFollowUpAt)}`}>Follow-up reminder: <b>{formatDateTime(lead.nextFollowUpAt)}</b> <span className="text-xs text-muted-foreground">(set by Log Activity)</span></div>}
            {canEdit && (
              <div className="border rounded-xl p-3 space-y-2 bg-muted/20">
                <div className="flex flex-wrap gap-2">
                  <input className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[200px]" placeholder="New task for this lead *" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                  <input type="datetime-local" className="px-2 py-2 border rounded-lg text-sm" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                  <button onClick={addLeadTask} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Add task</button>
                </div>
              </div>
            )}
            {leadTasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks on this lead.</p> : (
              <div className="border rounded-xl divide-y">
                {leadTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div>
                      <span className={t.status !== 'OPEN' ? 'line-through text-muted-foreground' : 'font-medium'}>{t.title}</span>
                      <p className="text-xs text-muted-foreground">{t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : ''}{t.dueAt ? ` · due ${formatDateTime(t.dueAt)}` : ''}</p>
                    </div>
                    {canEdit && t.status === 'OPEN' && <button onClick={() => finishLeadTask(t.id)} className="text-xs font-medium text-green-600 hover:underline">Done</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Notes ── */}
        {leadTab === 'notes' && (
          <div className="space-y-3">
            {canEdit && (
              <div className="space-y-2">
                <textarea className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} placeholder="Write a note (doesn't change status or follow-up)…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <div className="flex justify-end"><button onClick={addLeadNote} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Add note</button></div>
              </div>
            )}
            {leadNotes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : (
              <div className="space-y-2">
                {leadNotes.map((n) => (
                  <div key={n.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{n.author ? `${n.author.firstName} ${n.author.lastName}` : 'Unknown'}</span><span>{formatDateTime(n.createdAt)}</span></div>
                    <p className="whitespace-pre-wrap">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Log a call */}
        {leadTab === 'activity' && canEdit && (
          <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
            <h3 className="font-semibold text-sm flex items-center gap-2"><PhoneCall className="w-4 h-4" /> Log Activity</h3>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-muted-foreground flex items-center gap-2">
                Activity:
                <select className="px-2 py-1 border rounded-lg text-sm" value={callActivityType} onChange={(e) => setCallActivityType(e.target.value as ActivityType)}>
                  <option value="CALL">Call</option>
                  <option value="MEETING">Meeting / Visit</option>
                </select>
              </label>
              {/* Step 1: update status */}
              <label className="text-xs text-muted-foreground flex items-center gap-2">
                1. Update status *
                <select className="px-2 py-1 border rounded-lg text-sm" value={callActivityStatus} onChange={(e) => { setCallActivityStatus(e.target.value as ActivityStatus | ''); setCallStage(''); }}>
                  <option value="">Select...</option>
                  {ACTIVITY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {callActivityStatus && (
              <div className="space-y-3">
                {/* Step 2: follow-up date AND time */}
                {NEEDS_FOLLOW_UP.includes(callActivityStatus) && (
                  <label className="text-xs text-muted-foreground flex items-center gap-2">
                    {callActivityStatus === 'DEMO_BOOKED' ? '2. Demo date & time *' : '2. Follow-up date & time *'}
                    <input type="datetime-local" className="px-2 py-1 border rounded-lg text-sm" value={callFollowUp} onChange={(e) => setCallFollowUp(e.target.value)} />
                  </label>
                )}

                {/* Demo booked needs the course */}
                {callActivityStatus === 'DEMO_BOOKED' && (
                  <label className="text-xs text-muted-foreground flex items-center gap-2">
                    Course for the demo *
                    <select className="px-2 py-1 border rounded-lg text-sm" value={callCourse} onChange={(e) => setCallCourse(e.target.value)}>
                      <option value="">Select course...</option>
                      {callCourse && !courses.some((c) => c.name === callCourse) && <option value={callCourse}>{callCourse}</option>}
                      {courses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </label>
                )}

                {callActivityStatus === 'DEMO_BOOKED' && (
                  <div className="border rounded-lg p-3 space-y-2 bg-white">
                    <p className="text-xs font-medium text-muted-foreground">Demo details</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select className="px-2 py-1.5 border rounded-lg text-sm" value={demoMode} onChange={(e) => setDemoMode(e.target.value as DemoMode)}>
                        {DEMO_MODES.map((m) => <option key={m} value={m}>{DEMO_MODE_LABEL[m]} demo</option>)}
                      </select>
                      <select className="px-2 py-1.5 border rounded-lg text-sm" value={demoConductedBy} onChange={(e) => setDemoConductedBy(e.target.value)}>
                        <option value="">Conducted by...</option>
                        {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                      </select>
                      {demoMode === 'ONLINE' && (
                        <input type="email" className="px-2 py-1.5 border rounded-lg text-sm sm:col-span-2" placeholder="Student email * (online demo link is sent here)" value={demoEmail} onChange={(e) => setDemoEmail(e.target.value)} />
                      )}
                    </div>
                    {demoMode === 'ONLINE' && <p className="text-xs text-muted-foreground">Online demos run inside the portal for 60 minutes. Sales Admin is emailed and can watch it live.</p>}
                  </div>
                )}

                {callActivityStatus === 'DISQUALIFIED' && (
                  <select className="px-2 py-1 border rounded-lg text-sm" value={callLostReason} onChange={(e) => setCallLostReason(e.target.value as LeadLostReason | '')}>
                    <option value="">Reason (optional)...</option>
                    {LOST_REASONS.filter((r) => r.value !== 'NOT_INTERESTED').map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                )}

                {/* Step 3: lead stage — follows the status automatically */}
                <label className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                  3. Lead stage
                  <select
                    className="px-2 py-1 border rounded-lg text-sm"
                    value={callStage}
                    onChange={(e) => setCallStage(e.target.value as LeadStatus | '')}
                    disabled={STATUS_STAGE[callActivityStatus] === 'LOST'}
                  >
                    <option value="">Auto → {STATUS_STAGE[callActivityStatus].replace(/_/g, ' ')}</option>
                    {STATUS_STAGE[callActivityStatus] !== 'LOST' && STATUSES.filter((s) => s !== 'LOST' && s !== 'NEW').map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                  <span className="text-[11px]">Set automatically from the status; change only if needed.</span>
                </label>

                {/* DNP = did not pick, so no notes to write */}
                {callActivityStatus !== 'DNP' ? (
                  <textarea
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder={callActivityType === 'MEETING' ? 'What was discussed in the meeting? *' : 'What happened on this call? *'}
                    rows={2}
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground italic">DNP — no notes needed.</p>
                )}
              </div>
            )}

            <p className="text-xs font-medium text-muted-foreground pt-1">Student details</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="px-2 py-1.5 border rounded-lg text-xs" placeholder="City" value={callCity} onChange={(e) => setCallCity(e.target.value)} />
              <input className="px-2 py-1.5 border rounded-lg text-xs" placeholder="Education qualification" value={callEducation} onChange={(e) => setCallEducation(e.target.value)} />
              <input className="px-2 py-1.5 border rounded-lg text-xs" placeholder="College name" value={callCollege} onChange={(e) => setCallCollege(e.target.value)} />
              <input type="number" className="px-2 py-1.5 border rounded-lg text-xs" placeholder="Passed out year" value={callPassedOutYear} onChange={(e) => setCallPassedOutYear(e.target.value)} />
              <input className="px-2 py-1.5 border rounded-lg text-xs" placeholder="Current status (e.g. Working, Job Seeking)" value={callCurrentStatus} onChange={(e) => setCallCurrentStatus(e.target.value)} />
            </div>

            <div className="flex justify-end">
              <button onClick={submitCall} disabled={savingCall} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
                {savingCall ? 'Saving...' : 'Log Activity'}
              </button>
            </div>
          </div>
        )}

        {/* Call history */}
        {leadTab === 'activity' && <div>
          <h3 className="font-semibold text-sm mb-2">Activity History {lead._count?.callLogs ? `(${lead._count.callLogs})` : ''}</h3>
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : callLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity logged yet.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {callLogs.map((c) => (
                <div key={c.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      {c.calledBy ? `${c.calledBy.firstName} ${c.calledBy.lastName}` : 'Unknown'}
                      {' · '}{c.activityType === 'MEETING' ? 'Meeting' : 'Call'}
                      {c.activityStatus && <span className="ml-1 font-medium text-foreground">· {ACTIVITY_STATUS_LABEL[c.activityStatus]}</span>}
                    </span>
                    <span>{formatDateTime(c.calledAt)}</span>
                  </div>
                  {c.notes ? <p>{c.notes}</p> : <p className="text-xs text-muted-foreground italic">No notes</p>}
                  {c.recordingUrl && <div className="mt-2"><RecordingPlayer url={c.recordingUrl} /></div>}
                  {c.nextFollowUpAt && <p className="text-xs text-amber-600 mt-1">Next follow-up: {formatDateTime(c.nextFollowUpAt)}</p>}
                </div>
              ))}
            </div>
          )}
        </div>}

        {/* Full lead history — from creation, never edited */}
        {leadTab === 'history' && <div>
          <h3 className="font-semibold text-sm mb-2">Lead History</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <ol className="relative border-l pl-4 space-y-2 max-h-60 overflow-y-auto pr-1">
              {history.map((h) => (
                <li key={h.id} className="text-xs">
                  <span className="absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <p className="text-foreground">{h.summary}</p>
                  <p className="text-muted-foreground">{h.actor ? `${h.actor.firstName} ${h.actor.lastName}` : 'System'} · {formatDateTime(h.createdAt)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>}

        {/* Demos */}
        {leadTab === 'demo' && <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Demos</h3>
            <span className="text-xs text-muted-foreground">Book a demo by choosing "Demo booked" in Log Activity</span>
          </div>

          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : demos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No demos booked yet.</p>
          ) : (
            <div className="space-y-2">
              {demos.map((d) => {
                const intakeParts = [
                  d.city,
                  d.educationQualification,
                  d.collegeName,
                  d.passedOutYear ? `Passed out ${d.passedOutYear}` : null,
                  d.currentStatus,
                  d.courseEnquired ? `Interested: ${d.courseEnquired}` : null,
                ].filter(Boolean);
                return (
                <div key={d.id} className="border rounded-lg p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {d.mode === 'ONLINE' ? <Video className="w-3.5 h-3.5 text-muted-foreground" /> : <MapPin className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span className="font-medium">{formatDateTime(d.scheduledAt)}</span>
                      <span className="text-xs text-muted-foreground">{DEMO_MODE_LABEL[d.mode]}</span>
                    </div>
                    <span className={`text-xs font-medium rounded-full px-2 py-1 ${DEMO_STATUS_COLOR[d.status]}`}>{DEMO_STATUS_LABEL[d.status]}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">{d.bookingNumber}</p>
                  {intakeParts.length > 0 && (
                    <p className="text-xs text-muted-foreground">{intakeParts.join(' · ')}</p>
                  )}
                  {d.bookingComments && <p className="text-xs text-muted-foreground italic">"{d.bookingComments}"</p>}
                  {d.conductedBy && <p className="text-xs text-muted-foreground">Conducted by {d.conductedBy.firstName} {d.conductedBy.lastName}</p>}
                  {d.mode === 'ONLINE' && d.roomName && d.status === 'SCHEDULED' && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {d.closedAt ? (
                        <>
                          <span className="text-red-600 font-medium">Room closed (60 min over)</span>
                          {d.reopenRequestedAt
                            ? <span className="text-amber-600">Reopen request waiting for Sales Admin</span>
                            : <a href={`/sales-demo/${d.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">Request reopen</a>}
                        </>
                      ) : (
                        <a href={`/sales-demo/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 text-white font-medium">
                          <Video className="w-3 h-3" /> {d.startedAt ? 'Rejoin demo room' : 'Start demo room'}
                        </a>
                      )}
                      {d.accessCode && <span className="text-muted-foreground">Code: <span className="font-mono">{d.accessCode}</span> · link emailed to student</span>}
                    </div>
                  )}
                  {d.outcome && (
                    <span className={`inline-block text-xs font-medium rounded-full px-2 py-1 ${DEMO_OUTCOME_COLOR[d.outcome]}`}>{DEMO_OUTCOME_LABEL[d.outcome]}</span>
                  )}
                  {d.feedback && <p className="text-xs text-muted-foreground">{d.feedback}</p>}
                  {d.proofUrl && (
                    <a href={`${BASE_URL}${d.proofUrl}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                      <Upload className="w-3 h-3" /> View proof
                    </a>
                  )}
                  {d.status === 'RESCHEDULED' && d.rescheduleReason && (
                    <p className="text-xs text-amber-700">Rescheduled — {d.rescheduleReason}</p>
                  )}

                  {canEdit && d.status === 'SCHEDULED' && actingDemo?.id !== d.id && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button onClick={() => setActingDemo({ id: d.id, type: 'complete' })} className="text-xs font-medium text-green-600 hover:underline">Mark Conducted</button>
                      <button onClick={() => setActingDemo({ id: d.id, type: 'reschedule' })} className="text-xs font-medium text-amber-600 hover:underline">Reschedule</button>
                      <button onClick={() => setActingDemo({ id: d.id, type: 'noshow' })} className="text-xs font-medium text-red-600 hover:underline">No Show</button>
                      <button onClick={() => setActingDemo({ id: d.id, type: 'cancel' })} className="text-xs font-medium text-muted-foreground hover:underline">Cancel</button>
                    </div>
                  )}

                  {actingDemo?.id === d.id && (
                    <div className="border-t pt-2 mt-1 space-y-2">
                      {actingDemo.type === 'reschedule' ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <input type="datetime-local" className="px-2 py-1 border rounded-lg text-xs" value={actionNewScheduledAt} onChange={(e) => setActionNewScheduledAt(e.target.value)} />
                            <select className="px-2 py-1 border rounded-lg text-xs" value={actionNewMode} onChange={(e) => setActionNewMode(e.target.value as DemoMode)}>
                              {DEMO_MODES.map((m) => <option key={m} value={m}>{DEMO_MODE_LABEL[m]}</option>)}
                            </select>
                          </div>
                          <input
                            className="w-full px-2 py-1 border rounded-lg text-xs"
                            placeholder="Reason for rescheduling *"
                            value={actionRescheduleReason}
                            onChange={(e) => setActionRescheduleReason(e.target.value)}
                          />
                        </div>
                      ) : actingDemo.type === 'complete' ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <select className="px-2 py-1 border rounded-lg text-xs" value={actionOutcome} onChange={(e) => setActionOutcome(e.target.value as DemoOutcome)}>
                              <option value="">Outcome *</option>
                              {DEMO_OUTCOMES.map((o) => <option key={o} value={o}>{DEMO_OUTCOME_LABEL[o]}</option>)}
                            </select>
                            {employees.length > 0 && (
                              <select className="px-2 py-1 border rounded-lg text-xs" value={actionConductedById} onChange={(e) => setActionConductedById(e.target.value)}>
                                <option value="">Conducted by...</option>
                                {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                              </select>
                            )}
                          </div>
                          <label className="text-xs text-muted-foreground flex items-center gap-2">
                            Proof of demo {d.proofUrl ? '(already attached — pick a file to replace it)' : '*'}:
                            <input
                              type="file"
                              accept="image/*"
                              className="text-xs"
                              onChange={(e) => setActionProofFile(e.target.files?.[0] || null)}
                            />
                          </label>
                          <input
                            className="w-full px-2 py-1 border rounded-lg text-xs"
                            placeholder="Comments (optional)"
                            value={actionFeedback}
                            onChange={(e) => setActionFeedback(e.target.value)}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="px-2 py-1 border rounded-lg text-xs flex-1 min-w-[160px]"
                            placeholder="Notes (optional)"
                            value={actionFeedback}
                            onChange={(e) => setActionFeedback(e.target.value)}
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={submitAction} disabled={savingAction} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white disabled:opacity-50">
                          {savingAction ? 'Saving...' : 'Confirm'}
                        </button>
                        <button onClick={closeAction} className="px-3 py-1.5 text-xs rounded-lg border">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );})}
            </div>
          )}
        </div>}
      </div>
    </div>
  );
}

// ── My Reminders: follow-ups due + open tasks, grouped by urgency ────────────
interface TaskRow {
  id: string; title: string; description?: string | null; dueAt?: string | null; status: 'OPEN' | 'DONE' | 'CANCELLED';
  completedAt?: string | null; bucket?: string;
  lead?: { id: string; name: string; phone?: string } | null;
  assignedTo?: EmployeeLite; createdBy?: EmployeeLite | null;
}
interface FollowUpRow {
  id: string; name: string; phone: string; status: LeadStatus; activityStatus?: ActivityStatus | null;
  courseInterest?: string | null; nextFollowUpAt: string; bucket: string;
}
const BUCKETS: { id: string; label: string; cls: string }[] = [
  { id: 'overdue', label: 'Overdue', cls: 'text-red-600' },
  { id: 'today', label: 'Today', cls: 'text-amber-600' },
  { id: 'upcoming', label: 'Upcoming', cls: 'text-foreground' },
];

function RemindersPanel({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = (await api.get('/api/sales/reminders')).data.data;
      setFollowUps(r.followUps); setTasks(r.tasks);
    } catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load reminders'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const done = async (id: string) => {
    try { await api.put(`/api/sales/tasks/${id}`, { status: 'DONE' }); load(); }
    catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed'); }
  };

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Your lead follow-ups and open tasks. Log an activity on a lead to set or clear its follow-up.</p>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {BUCKETS.map((b) => {
        const f = followUps.filter((x) => x.bucket === b.id);
        const t = tasks.filter((x) => x.bucket === b.id);
        if (!f.length && !t.length) return null;
        return (
          <div key={b.id} className="space-y-2">
            <h3 className={`text-sm font-semibold ${b.cls}`}>{b.label} ({f.length + t.length})</h3>
            <div className="bg-card border rounded-xl divide-y">
              {f.map((l) => (
                <div key={`f-${l.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <button onClick={() => onOpenLead(l.id)} className="text-blue-600 hover:underline font-medium">{l.name}</button>
                    <span className="text-xs text-muted-foreground ml-2">{l.phone}{l.courseInterest ? ` · ${l.courseInterest}` : ''}</span>
                    <p className="text-xs text-muted-foreground">Follow-up · {l.activityStatus ? ACTIVITY_STATUS_LABEL[l.activityStatus] : l.status.replace(/_/g, ' ')}</p>
                  </div>
                  <span className={`text-xs whitespace-nowrap ${b.cls}`}>{formatDateTime(l.nextFollowUpAt)}</span>
                </div>
              ))}
              {t.map((x) => (
                <div key={`t-${x.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{x.title}</span>
                    {x.lead && <button onClick={() => onOpenLead(x.lead!.id)} className="text-xs text-blue-600 hover:underline ml-2">{x.lead.name}</button>}
                    <p className="text-xs text-muted-foreground">Task{x.createdBy ? ` · from ${x.createdBy.firstName} ${x.createdBy.lastName}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {x.dueAt && <span className={`text-xs whitespace-nowrap ${b.cls}`}>{formatDateTime(x.dueAt)}</span>}
                    <button onClick={() => done(x.id)} className="text-xs font-medium text-green-600 hover:underline">Done</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {tasks.filter((x) => x.bucket === 'later').length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">No due date</h3>
          <div className="bg-card border rounded-xl divide-y">
            {tasks.filter((x) => x.bucket === 'later').map((x) => (
              <div key={x.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-medium">{x.title}</span>
                <button onClick={() => done(x.id)} className="text-xs font-medium text-green-600 hover:underline">Done</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!loading && followUps.length === 0 && tasks.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Nothing pending — you're all caught up.</p>}
    </div>
  );
}

// ── Manage Tasks: create tasks (Sales Admin can assign to anyone) ───────────
function TasksPanel({ isAdmin, canEdit, employees, onOpenLead }: { isAdmin: boolean; canEdit: boolean; employees: EmployeeLite[]; onOpenLead: (id: string) => void }) {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusF, setStatusF] = useState('OPEN');
  const [assigneeF, setAssigneeF] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = {};
      if (statusF) params.status = statusF;
      if (isAdmin && assigneeF) params.assignedToId = assigneeF;
      setRows((await api.get('/api/sales/tasks', { params })).data.data);
    } catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load tasks'); }
    finally { setLoading(false); }
  }, [statusF, assigneeF, isAdmin]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!title.trim()) { setError('Enter a task title'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/sales/tasks', { title: title.trim(), description: desc.trim() || undefined, dueAt: due ? new Date(due).toISOString() : undefined, assignedToId: isAdmin && assignee ? assignee : undefined });
      setTitle(''); setDesc(''); setDue(''); setAssignee('');
      load();
    } catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to add task'); }
    finally { setSaving(false); }
  };
  const setStatus = async (id: string, status: string) => {
    try { await api.put(`/api/sales/tasks/${id}`, { status }); load(); }
    catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed'); }
  };

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {canEdit && (
        <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
          <h3 className="font-semibold text-sm">{isAdmin ? 'Create / assign a task' : 'Add a task for yourself'}</h3>
          <div className="flex flex-wrap gap-2">
            <input className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[220px]" placeholder="Task title *" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input type="datetime-local" className="px-2 py-2 border rounded-lg text-sm" value={due} onChange={(e) => setDue(e.target.value)} />
            {isAdmin && (
              <select className="px-2 py-2 border rounded-lg text-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Assign to me</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
            )}
            <button onClick={add} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Add task'}</button>
          </div>
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Details (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
          <option value="OPEN">Open</option><option value="DONE">Done</option><option value="CANCELLED">Cancelled</option><option value="">All</option>
        </select>
        {isAdmin && (
          <select value={assigneeF} onChange={(e) => setAssigneeF(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">Everyone</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </select>
        )}
      </div>
      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-3">Task</th><th className="px-3 py-3">Lead</th>{isAdmin && <th className="px-3 py-3">Assigned to</th>}<th className="px-3 py-3">Due</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{loading ? 'Loading...' : 'No tasks'}</td></tr>
            ) : rows.map((t) => (
              <tr key={t.id} className="hover:bg-muted/30">
                <td className="px-3 py-3"><span className="font-medium">{t.title}</span>{t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}</td>
                <td className="px-3 py-3 text-xs">{t.lead ? <button onClick={() => onOpenLead(t.lead!.id)} className="text-blue-600 hover:underline">{t.lead.name}</button> : '—'}</td>
                {isAdmin && <td className="px-3 py-3 text-xs">{t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '—'}</td>}
                <td className="px-3 py-3 text-xs whitespace-nowrap">{t.dueAt ? formatDateTime(t.dueAt) : '—'}</td>
                <td className="px-3 py-3 text-xs">{t.status === 'DONE' ? <span className="text-green-600">Done</span> : t.status === 'CANCELLED' ? <span className="text-muted-foreground">Cancelled</span> : <span className="text-amber-600">Open</span>}</td>
                <td className="px-3 py-3 whitespace-nowrap space-x-3">
                  {t.status === 'OPEN' && canEdit && (<>
                    <button onClick={() => setStatus(t.id, 'DONE')} className="text-xs font-medium text-green-600 hover:underline">Done</button>
                    <button onClick={() => setStatus(t.id, 'CANCELLED')} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                  </>)}
                  {t.status !== 'OPEN' && canEdit && <button onClick={() => setStatus(t.id, 'OPEN')} className="text-xs text-blue-600 hover:underline">Reopen</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Summaries (Sales Admin): lead assignment, lead stage, source ─────────────
function SummariesPanel() {
  const [assignment, setAssignment] = useState<{ employeeId: string | null; name: string; total: number; stages: Record<string, number>; overdue: number; newToday: number }[]>([]);
  const [stages, setStages] = useState<{ total: number; stages: { stage: LeadStatus; count: number }[]; statuses: { status: string; count: number }[] } | null>(null);
  const [sources, setSources] = useState<{ source: string; total: number; demo: number; enrolled: number; lost: number; open: number; conversion: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    setLoading(true);
    Promise.all([api.get('/api/sales/insights/assignment'), api.get('/api/sales/insights/stages'), api.get('/api/sales/insights/sources')])
      .then(([a, s, so]) => { setAssignment(a.data.data); setStages(s.data.data); setSources(so.data.data); })
      .catch((err: unknown) => setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load summaries'))
      .finally(() => setLoading(false));
  }, []);
  const th = 'px-3 py-3';
  return (
    <div className="space-y-8">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Lead stage summary {stages ? `· ${stages.total} leads` : ''}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {STATUSES.map((s) => (
            <div key={s} className="border rounded-xl p-3 bg-card">
              <p className="text-xs text-muted-foreground">{s.replace(/_/g, ' ')}</p>
              <p className="text-xl font-semibold">{stages?.stages.find((x) => x.stage === s)?.count ?? 0}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {[...ACTIVITY_STATUSES.map((s) => ({ key: s.value as string, label: s.label })), { key: 'NONE', label: 'No status yet' }].map((s) => (
            <span key={s.key} className="text-xs bg-slate-100 text-slate-700 rounded-full px-3 py-1">{s.label}: <b>{stages?.statuses.find((x) => x.status === s.key)?.count ?? 0}</b></span>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Lead assignment summary</h3>
        <div className="bg-card border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className={th}>Salesperson</th><th className={th}>Total</th>{STATUSES.map((s) => <th key={s} className={th}>{s.replace(/_/g, ' ')}</th>)}<th className={th}>Overdue follow-ups</th><th className={th}>New today</th></tr>
            </thead>
            <tbody className="divide-y">
              {assignment.map((r) => (
                <tr key={r.employeeId || 'none'} className="hover:bg-muted/30">
                  <td className="px-3 py-3 font-medium whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-3 font-semibold">{r.total}</td>
                  {STATUSES.map((s) => <td key={s} className="px-3 py-3 text-xs">{r.stages[s] || 0}</td>)}
                  <td className={`px-3 py-3 text-xs ${r.overdue ? 'text-red-600 font-semibold' : ''}`}>{r.overdue}</td>
                  <td className="px-3 py-3 text-xs">{r.newToday}</td>
                </tr>
              ))}
              {assignment.length === 0 && !loading && <tr><td colSpan={11} className="px-4 py-6 text-center text-muted-foreground">No leads</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Source summary</h3>
        <div className="bg-card border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className={th}>Source</th><th className={th}>Leads</th><th className={th}>Open</th><th className={th}>Reached demo</th><th className={th}>Enrolled</th><th className={th}>Lost</th><th className={th}>Conversion</th></tr>
            </thead>
            <tbody className="divide-y">
              {sources.map((r) => (
                <tr key={r.source} className="hover:bg-muted/30">
                  <td className="px-3 py-3 font-medium">{r.source}</td><td className="px-3 py-3">{r.total}</td><td className="px-3 py-3 text-xs">{r.open}</td>
                  <td className="px-3 py-3 text-xs">{r.demo}</td><td className="px-3 py-3 text-xs text-green-700">{r.enrolled}</td><td className="px-3 py-3 text-xs text-red-600">{r.lost}</td>
                  <td className="px-3 py-3 text-xs font-semibold">{r.conversion}%</td>
                </tr>
              ))}
              {sources.length === 0 && !loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No leads</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Activity Monitor (Sales Admin): every change on every lead, with who did it ──
interface FeedRow { id: string; type: string; summary: string; createdAt: string; actor?: EmployeeLite | null; lead?: { id: string; name: string; phone: string } | null }
const FEED_TYPES: { value: string; label: string }[] = [
  { value: 'ACTIVITY', label: 'Activities logged' }, { value: 'STATUS', label: 'Status changes' }, { value: 'STAGE', label: 'Stage changes' },
  { value: 'ASSIGNED', label: 'Assignments' }, { value: 'FOLLOW_UP', label: 'Follow-ups' }, { value: 'EDIT', label: 'Edits' },
  { value: 'CREATED', label: 'Lead created' }, { value: 'DELETED', label: 'Removed' }, { value: 'DEMO', label: 'Demos' }, { value: 'TASK', label: 'Tasks' },
];

function ActivityMonitorPanel({ employees, onOpenLead }: { employees: EmployeeLite[]; onOpenLead: (id: string) => void }) {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [perPerson, setPerPerson] = useState<{ employeeId: string | null; name: string; count: number }[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [types, setTypes] = useState('');
  const [emp, setEmp] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { setPage(1); }, [types, emp, from, to]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (types) params.type = types; if (emp) params.employeeId = emp; if (from) params.from = from; if (to) params.to = to;
      const r = await api.get('/api/sales/activity-feed', { params });
      setRows(r.data.data); setMeta(r.data.meta); setPerPerson(r.data.perPerson || []);
    } catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load activity'); }
    finally { setLoading(false); }
  }, [page, types, emp, from, to]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelect label="Activity type" value={types} onChange={setTypes} options={FEED_TYPES} />
        <select value={emp} onChange={(e) => setEmp(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Everyone</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
        </select>
        <label className="text-xs text-muted-foreground flex items-center gap-1">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" /></label>
        <label className="text-xs text-muted-foreground flex items-center gap-1">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" /></label>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50 ml-auto">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      {perPerson.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {perPerson.map((p) => <span key={p.employeeId || 'sys'} className="text-xs bg-slate-100 text-slate-700 rounded-full px-3 py-1">{p.name}: <b>{p.count}</b></span>)}
        </div>
      )}
      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-3">When</th><th className="px-3 py-3">Who</th><th className="px-3 py-3">Lead</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">What changed</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{loading ? 'Loading...' : 'No activity found'}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-3 text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : 'System'}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{r.lead ? <button onClick={() => onOpenLead(r.lead!.id)} className="text-blue-600 hover:underline">{r.lead.name}</button> : '—'}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{FEED_TYPES.find((t) => t.value === r.type)?.label || r.type}</td>
                <td className="px-3 py-3 text-xs">{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && meta && meta.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{meta.total} entries · page {meta.page} of {meta.totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(p - 1, 1))} className="px-2 py-1.5 border rounded-lg disabled:opacity-40">Prev</button>
            <button disabled={page >= meta.totalPages} onClick={() => setPage((p) => Math.min(p + 1, meta.totalPages))} className="px-2 py-1.5 border rounded-lg disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Live Demos (Sales Admin): watch online demos, approve reopen requests ───
interface DemoRoomRow {
  id: string; bookingNumber: string; scheduledAt: string; course?: string | null;
  state: 'NOT_STARTED' | 'LIVE' | 'CLOSED' | 'REOPEN_REQUESTED';
  expiresAt?: string | null; closedAt?: string | null; reopenNote?: string | null; reopenCount: number;
  lead: { id: string; name: string; phone: string }; host?: string | null; participants: number;
}
const ROOM_STATE_LABEL: Record<DemoRoomRow['state'], { label: string; cls: string }> = {
  NOT_STARTED: { label: 'Not started', cls: 'bg-gray-100 text-gray-700' },
  LIVE: { label: 'Live now', cls: 'bg-green-100 text-green-700' },
  CLOSED: { label: 'Closed', cls: 'bg-red-100 text-red-700' },
  REOPEN_REQUESTED: { label: 'Reopen requested', cls: 'bg-amber-100 text-amber-700' },
};

function LiveDemosPanel() {
  const [rows, setRows] = useState<DemoRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows((await api.get('/api/sales/demo-rooms')).data.data); }
    catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load demos'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const decide = async (id: string, approve: boolean) => {
    try { await api.post(`/api/sales/demos/${id}/room/reopen`, { approve }); load(); }
    catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed'); }
  };

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Online demos hosted in the portal. Watch any running demo silently, and approve reopen requests once the 60 minutes are over.</p>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Booking #</th><th className="px-3 py-3">Lead</th><th className="px-3 py-3">Course</th>
              <th className="px-3 py-3">Scheduled</th><th className="px-3 py-3">Host</th><th className="px-3 py-3">State</th><th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{loading ? 'Loading...' : 'No online demos yet'}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-3 font-mono text-xs">{r.bookingNumber}</td>
                <td className="px-3 py-3">{r.lead.name}<div className="text-xs text-muted-foreground">{r.lead.phone}</div></td>
                <td className="px-3 py-3 text-xs">{r.course || '—'}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{formatDateTime(r.scheduledAt)}</td>
                <td className="px-3 py-3 text-xs">{r.host || '—'}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className={`text-xs font-medium rounded-full px-2 py-1 ${ROOM_STATE_LABEL[r.state].cls}`}>{ROOM_STATE_LABEL[r.state].label}</span>
                  {r.state === 'LIVE' && <span className="ml-2 text-xs text-muted-foreground">{r.participants} in room</span>}
                  {r.reopenCount > 0 && <span className="ml-2 text-[10px] text-muted-foreground">reopened {r.reopenCount}×</span>}
                  {r.state === 'REOPEN_REQUESTED' && r.reopenNote && <p className="text-[11px] text-muted-foreground mt-1">"{r.reopenNote}"</p>}
                </td>
                <td className="px-3 py-3 whitespace-nowrap space-x-3">
                  {r.state === 'LIVE' && <a href={`/sales-demo/${r.id}?observe=1`} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">Watch live</a>}
                  {r.state === 'REOPEN_REQUESTED' && (
                    <>
                      <button onClick={() => decide(r.id, true)} className="text-xs font-medium text-green-600 hover:underline">Approve</button>
                      <button onClick={() => decide(r.id, false)} className="text-xs font-medium text-red-600 hover:underline">Reject</button>
                    </>
                  )}
                  {r.state === 'CLOSED' && <button onClick={() => decide(r.id, true)} className="text-xs font-medium text-green-600 hover:underline">Reopen</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sales Pulse tab: live snapshot + recipient settings ────────────────────
function SalesPulsePanel({ canEdit }: { canEdit: boolean }) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recipients, setRecipients] = useState<ReportRecipient[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [preset, setPreset] = useState<RangePreset>('today');
  const [customStart, setCustomStart] = useState(isoDate(new Date()));
  const [customEnd, setCustomEnd] = useState(isoDate(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // "today" omits start/end entirely so this stays byte-for-byte the same
      // live query the hourly/EOD cron emails use — any other preset asks the
      // same endpoint for a historical range instead.
      const params = preset === 'today' ? {} : preset === 'custom' ? { start: customStart, end: customEnd } : presetRange(preset);
      const [pulseRes, recipRes] = await Promise.all([
        api.get('/api/sales/pulse', { params }),
        api.get('/api/sales/report-recipients'),
      ]);
      setPulse(pulseRes.data.data);
      setRecipients(recipRes.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load sales pulse');
    } finally {
      setLoading(false);
    }
  }, [preset, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  const addRecipient = async () => {
    if (!newEmail.trim()) return;
    setSavingRecipient(true);
    try {
      await api.post('/api/sales/report-recipients', { email: newEmail.trim(), name: newName.trim() || undefined });
      setNewEmail(''); setNewName('');
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to add recipient');
    } finally {
      setSavingRecipient(false);
    }
  };

  const removeRecipient = async (id: string) => {
    try {
      await api.delete(`/api/sales/report-recipients/${id}`);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to remove recipient');
    }
  };

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {preset === 'today'
            ? "Live as of right now — the same numbers go out by email at 11, 12, 1, 2, 4, 5 and 6 (6 PM is the day's End of Day report)."
            : 'Historical totals for the selected range.'}
        </p>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['today', 'week', 'month', 'custom'] as RangePreset[]).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${preset === p ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-muted/50'}`}
          >
            {p === 'today' ? 'Today' : p === 'week' ? 'Last 7 Days' : p === 'month' ? 'This Month' : 'Custom'}
          </button>
        ))}
        {preset === 'custom' && (
          <>
            <input type="date" className="px-2 py-1.5 border rounded-lg text-xs" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" className="px-2 py-1.5 border rounded-lg text-xs" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={PhoneCall} label={preset === 'today' ? 'Calls Made Today' : 'Calls Made'} value={pulse?.callsMadeToday ?? 0} />
        <StatCard icon={Users} label="New Leads Today" value={pulse?.leadsCreatedToday ?? 0} />
        <StatCard icon={Calendar} label="Demos Booked Today" value={pulse?.demosBookedToday ?? 0} />
        <StatCard icon={Calendar} label="Demos Scheduled Today" value={pulse?.demosScheduledForToday ?? 0} />
        <StatCard icon={CheckCircle2} label="Conducted" value={pulse?.demosConductedToday ?? 0} />
        <StatCard icon={RefreshCw} label="Rescheduled" value={pulse?.demosRescheduledToday ?? 0} />
        <StatCard icon={AlertTriangle} label="No-Show" value={pulse?.demosNoShowToday ?? 0} />
        <StatCard icon={AlertTriangle} label="Still Pending Today" value={pulse?.demosPendingToday ?? 0} />
        <StatCard icon={Calendar} label="Follow-ups Due Today" value={pulse?.followUpsDueToday ?? 0} />
        <StatCard icon={AlertTriangle} label="Overdue Follow-ups" value={pulse?.overdueFollowUps ?? 0} />
        <StatCard icon={CheckCircle2} label="Enrolled Today" value={pulse?.enrolledToday ?? 0} />
        <StatCard icon={TrendingUp} label="Lost Today" value={pulse?.lostToday ?? 0} />
      </div>

      {canEdit && (
        <div className="bg-card border rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Settings className="w-4 h-4" /> Email Recipients</h3>
          <p className="text-xs text-muted-foreground">Who gets the Sales Pulse / EOD emails at 11, 12, 1, 2, 4, 5 and 6.</p>
          <div className="flex flex-wrap gap-2">
            <input className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[180px]" placeholder="Email *" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <input className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[140px]" placeholder="Name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button onClick={addRecipient} disabled={savingRecipient || !newEmail.trim()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
              {savingRecipient ? 'Adding...' : 'Add'}
            </button>
          </div>
          {recipients.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-2">No recipients configured yet.</p>
          ) : (
            <div className="divide-y border rounded-lg">
              {recipients.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{r.name ? `${r.name} — ${r.email}` : r.email}</span>
                  <button onClick={() => removeRecipient(r.id)} className="text-muted-foreground hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Lead Quality tab: campaign funnel (Received → Given to Sales → Assigned)
// against outcomes (Not Interested / Doesn't Work / Enrolled), with a % score.
function LeadQualityPanel() {
  const [data, setData] = useState<LeadQualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/sales/lead-quality');
      setData(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load lead quality report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const overall = data?.overall;

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          How many leads from each campaign actually convert vs. get marked Not Interested or Doesn't Work.
        </p>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Leads Received" value={overall?.leadsReceived ?? '—'} />
        <StatCard icon={Users} label="Given to Sales" value={overall?.leadsGivenToSales ?? '—'} />
        <StatCard icon={Users} label="Assigned to Rep" value={overall?.leadsAssigned ?? '—'} />
        <StatCard icon={CheckCircle2} label="Enrolled" value={overall?.enrolled ?? '—'} />
        <StatCard icon={AlertTriangle} label="Not Interested" value={overall?.notInterested ?? '—'} />
        <StatCard icon={AlertTriangle} label="Doesn't Work" value={overall?.doesntWork ?? '—'} />
        <StatCard icon={Percent} label="Overall Lead Quality" value={pctLabel(overall?.qualityPct ?? null)} />
      </div>

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Campaign</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Received</th>
              <th className="px-3 py-3">Given to Sales</th>
              <th className="px-3 py-3">Assigned</th>
              <th className="px-3 py-3">Not Interested</th>
              <th className="px-3 py-3">Doesn't Work</th>
              <th className="px-3 py-3">Enrolled</th>
              <th className="px-3 py-3">Quality %</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : !data || data.campaigns.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No campaign data yet</td></tr>
            ) : data.campaigns.map((c) => (
              <tr key={c.campaignId} className="hover:bg-muted/30">
                <td className="px-3 py-3 font-medium whitespace-nowrap">{c.campaignName}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{c.campaignStatus}</td>
                <td className="px-3 py-3">{c.leadsReceived}</td>
                <td className="px-3 py-3">{c.leadsGivenToSales}</td>
                <td className="px-3 py-3">{c.leadsAssigned}</td>
                <td className="px-3 py-3">{c.notInterested}</td>
                <td className="px-3 py-3">{c.doesntWork}</td>
                <td className="px-3 py-3">{c.enrolled}</td>
                <td className={`px-3 py-3 font-semibold ${qualityColor(c.qualityPct)}`}>{pctLabel(c.qualityPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── BDA self-view: Demo Booked / Demo Rescheduled / Demo Conducted ─────────
// Same underlying /api/sales/demos endpoint for all three, just a different
// ?status= — the backend already scopes results to the caller's own assigned
// leads for anyone below SALES=ADMIN, so this component doesn't need to know
// whose leads it's showing.
function DemoListPanel({ status, emptyLabel, onOpenLead }: {
  status: DemoStatus; emptyLabel: string; onOpenLead: (id: string) => void;
}) {
  const [demos, setDemos] = useState<DemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/sales/demos', { params: { status } });
      setDemos(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load demos');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const extraCol = status === 'COMPLETED' ? 'Outcome' : status === 'RESCHEDULED' ? 'Reason' : null;
  const colCount = extraCol ? 6 : 5;

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{demos.length} demo{demos.length === 1 ? '' : 's'}</p>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Booking #</th>
              <th className="px-3 py-3">Lead</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Scheduled</th>
              <th className="px-3 py-3">Mode</th>
              {extraCol && <th className="px-3 py-3">{extraCol}</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : demos.length === 0 ? (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-muted-foreground">{emptyLabel}</td></tr>
            ) : demos.map((d) => (
              <tr key={d.id} className="hover:bg-muted/30">
                <td className="px-3 py-3 text-[11px] font-mono text-muted-foreground whitespace-nowrap">{d.bookingNumber}</td>
                <td className="px-3 py-3 font-medium whitespace-nowrap">
                  <button onClick={() => onOpenLead(d.lead.id)} className="text-blue-600 hover:underline text-left">
                    {d.lead.name}
                  </button>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {d.lead.phone}</div>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(d.scheduledAt)}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">{DEMO_MODE_LABEL[d.mode]}</td>
                {extraCol === 'Outcome' && (
                  <td className="px-3 py-3 whitespace-nowrap">
                    {d.outcome ? (
                      <span className={`text-xs font-medium rounded-full px-2 py-1 ${DEMO_OUTCOME_COLOR[d.outcome]}`}>{DEMO_OUTCOME_LABEL[d.outcome]}</span>
                    ) : '—'}
                  </td>
                )}
                {extraCol === 'Reason' && (
                  <td className="px-3 py-3 text-xs text-muted-foreground max-w-[220px] truncate" title={d.rescheduleReason || ''}>
                    {d.rescheduleReason || '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Devices tab: register/manage phones running the SIM call-tracker app ──
interface MissingRecordingsData {
  days: number; totalAnsweredCalls: number; missingCount: number;
  byEmployee: { name: string; missing: number }[];
  calls: { id: string; rawPhoneNumber?: string | null; durationSeconds?: number | null; calledAt: string; calledBy?: EmployeeLite | null; lead?: { id: string; name: string } | null }[];
}

/** Answered tracked calls with no recording attached — flags phones where auto-record is off or uploads fail. */
function MissingRecordingsCard() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<MissingRecordingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLoading(true); setError('');
    api.get('/api/sales/missing-recordings', { params: { days } })
      .then((r) => setData(r.data.data))
      .catch((e: { response?: { data?: { message?: string } } }) => setError(e.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [days]);

  const pct = data && data.totalAnsweredCalls ? Math.round(((data.totalAnsweredCalls - data.missingCount) / data.totalAnsweredCalls) * 100) : null;
  const dur = (s?: number | null) => (s == null ? '—' : `${Math.floor(s / 60)}m ${s % 60}s`);

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-sm">Call recording coverage</h3>
          <p className="text-xs text-muted-foreground">Answered calls captured by the app that have no recording yet (calls from the last 15 minutes are skipped).</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="border rounded-lg px-2 py-1 text-sm">
          {[1, 7, 14, 30].map((d) => <option key={d} value={d}>Last {d} day{d === 1 ? '' : 's'}</option>)}
        </select>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : loading || !data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-muted/40">Answered calls: <b>{data.totalAnsweredCalls}</b></span>
            <span className="px-3 py-1.5 rounded-lg bg-muted/40">With recording: <b>{pct == null ? '—' : `${pct}%`}</b></span>
            <span className={`px-3 py-1.5 rounded-lg ${data.missingCount ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>Missing: <b>{data.missingCount}</b></span>
          </div>
          {data.byEmployee.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {data.byEmployee.map((e) => <span key={e.name} className="px-2 py-1 rounded-full border">{e.name}: {e.missing} missing</span>)}
            </div>
          )}
          {data.calls.length > 0 && (
            <>
              <button onClick={() => setOpen((v) => !v)} className="text-xs text-blue-600 hover:underline">{open ? 'Hide' : 'Show'} the {data.calls.length} calls</button>
              {open && (
                <div className="max-h-64 overflow-y-auto border rounded-lg divide-y text-xs">
                  {data.calls.map((c) => (
                    <div key={c.id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <span>{c.rawPhoneNumber || 'Unknown'}{c.lead ? ` · ${c.lead.name}` : ''}</span>
                      <span className="text-muted-foreground">{c.calledBy ? `${c.calledBy.firstName} ${c.calledBy.lastName}` : '—'} · {dur(c.durationSeconds)} · {formatDateTime(c.calledAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function DevicesPanel({ employees }: { employees: EmployeeLite[] }) {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving, setSaving] = useState(false);
  // Shown once, right after registration — the token itself is never
  // returned by the list endpoint, so this is the only chance to copy it.
  const [issuedToken, setIssuedToken] = useState<{ token: string; employee: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/sales/devices');
      setDevices(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!newEmployeeId) { setError('Pick which salesperson this phone belongs to'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/sales/devices', { employeeId: newEmployeeId, label: newLabel.trim() || undefined });
      const emp = employees.find((e) => e.id === newEmployeeId);
      setIssuedToken({ token: res.data.data.deviceToken, employee: emp ? `${emp.firstName} ${emp.lastName}` : 'this device' });
      setShowAdd(false);
      setNewEmployeeId(''); setNewLabel('');
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to register device');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this device? The phone will stop being able to report calls until re-registered.')) return;
    try {
      await api.put(`/api/sales/devices/${id}/deactivate`);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to deactivate device');
    }
  };

  const copyToken = () => {
    if (!issuedToken) return;
    navigator.clipboard.writeText(issuedToken.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Phones running the Vin-Source Call Tracker app — each one auto-logs calls made on the business SIM.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Register Device
          </button>
        </div>
      </div>

      {issuedToken && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-amber-900">
            Device registered for {issuedToken.employee}. Copy this token now — it won't be shown again. Paste it into the call-tracker app's "Device token" field on that phone.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border rounded-lg px-3 py-2 text-xs font-mono break-all">{issuedToken.token}</code>
            <button onClick={copyToken} className="flex items-center gap-1 px-3 py-2 border rounded-lg text-xs font-medium bg-white hover:bg-muted/50 flex-shrink-0">
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setIssuedToken(null)} className="text-xs text-amber-700 hover:underline">Done</button>
        </div>
      )}

      {showAdd && (
        <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
          <h3 className="font-semibold text-sm">Register a new device</h3>
          <div className="flex flex-wrap gap-2">
            <select className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[180px]" value={newEmployeeId} onChange={(e) => setNewEmployeeId(e.target.value)}>
              <option value="">Belongs to...</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
            <input className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[140px]" placeholder="Label (e.g. Arun's phone)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
            <button onClick={register} disabled={saving || !newEmployeeId} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
              {saving ? 'Registering...' : 'Register & Get Token'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Salesperson</th>
              <th className="px-3 py-3">Label</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Last Seen</th>
              <th className="px-3 py-3">Registered</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : devices.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No devices registered yet</td></tr>
            ) : devices.map((d) => (
              <tr key={d.id} className="hover:bg-muted/30">
                <td className="px-3 py-3 font-medium whitespace-nowrap">{d.employee.firstName} {d.employee.lastName}</td>
                <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{d.label || '—'}</td>
                <td className="px-3 py-3">
                  <span className={`text-xs font-medium rounded-full px-2 py-1 ${d.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {d.isActive ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{d.lastSeenAt ? formatDateTime(d.lastSeenAt) : 'Never'}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(d.createdAt)}</td>
                <td className="px-3 py-3 text-right">
                  {d.isActive && (
                    <button onClick={() => deactivate(d.id)} className="text-xs font-medium text-red-600 hover:underline flex items-center gap-1 ml-auto">
                      <Ban className="w-3 h-3" /> Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MissingRecordingsCard />
    </div>
  );
}

// ── Unmatched Calls tab: review queue for tracked calls that didn't match
// any existing lead — link to an existing lead, or spin up a new one.
function UnmatchedCallsPanel({ setGlobalError }: { setGlobalError: (s: string) => void }) {
  const [calls, setCalls] = useState<UnmatchedCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkingCall, setLinkingCall] = useState<UnmatchedCall | null>(null);
  const [creatingCall, setCreatingCall] = useState<UnmatchedCall | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/sales/unmatched-calls');
      setCalls(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load unmatched calls');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const directionLabel = (d?: UnmatchedCall['direction']) =>
    d === 'INBOUND' ? 'Inbound' : d === 'OUTBOUND' ? 'Outbound' : d === 'MISSED' ? 'Missed' : '—';
  const durationLabel = (s?: number | null) => {
    if (s == null) return '—';
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Calls auto-logged from a tracked phone that didn't match any existing lead — link them to a lead or create a new one.
        </p>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Direction</th>
              <th className="px-3 py-3">Duration</th>
              <th className="px-3 py-3">Called By</th>
              <th className="px-3 py-3">When</th>
              <th className="px-3 py-3">Recording</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : calls.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nothing to review — every tracked call matched a lead</td></tr>
            ) : calls.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-3 py-3 font-medium whitespace-nowrap">
                  <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-muted-foreground" /> {c.rawPhoneNumber || 'Unknown'}</div>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{directionLabel(c.direction)}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{durationLabel(c.durationSeconds)}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{c.calledBy ? `${c.calledBy.firstName} ${c.calledBy.lastName}` : '—'}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(c.calledAt)}</td>
                <td className="px-3 py-3 whitespace-nowrap"><RecordingPlayer url={c.recordingUrl} /></td>
                <td className="px-3 py-3 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => setLinkingCall(c)} className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
                      <Link2 className="w-3 h-3" /> Link
                    </button>
                    <button onClick={() => setCreatingCall(c)} className="text-xs font-medium text-green-600 hover:underline flex items-center gap-1">
                      <UserPlus className="w-3 h-3" /> New Lead
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {linkingCall && (
        <LinkCallModal
          call={linkingCall}
          onClose={() => setLinkingCall(null)}
          onLinked={() => { setLinkingCall(null); load(); }}
          setError={setGlobalError}
        />
      )}

      {creatingCall && (
        <CreateLeadFromCallModal
          call={creatingCall}
          onClose={() => setCreatingCall(null)}
          onCreated={() => { setCreatingCall(null); load(); }}
          setError={setGlobalError}
        />
      )}
    </div>
  );
}

function LinkCallModal({ call, onClose, onLinked, setError }: {
  call: UnmatchedCall; onClose: () => void; onLinked: () => void; setError: (s: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  // Debounced live search — same /api/sales/leads endpoint the Leads tab
  // uses, just capped to a handful of results for a picker instead of a page.
  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get('/api/sales/leads', { params: { search: search.trim(), limit: '10' } });
        setResults(res.data.data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const link = async (leadId: string) => {
    setLinking(true);
    setError('');
    try {
      await api.post(`/api/sales/unmatched-calls/${call.id}/link`, { leadId });
      onLinked();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to link call');
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Link call to a lead</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground">
          Call from {call.rawPhoneNumber || 'unknown number'} — search by name or phone to find the right lead.
        </p>
        <input
          autoFocus
          className="w-full px-3 py-2 border rounded-lg text-sm"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-56 overflow-y-auto divide-y border rounded-lg">
          {searching ? (
            <p className="text-sm text-muted-foreground px-3 py-3">Searching...</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-3">{search.trim() ? 'No matching leads' : 'Start typing to search'}</p>
          ) : results.map((l) => (
            <button
              key={l.id}
              disabled={linking}
              onClick={() => link(l.id)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 disabled:opacity-50 flex items-center justify-between"
            >
              <span>{l.name}</span>
              <span className="text-xs text-muted-foreground">{l.phone}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Call Log tab: every call across all leads, browsable by day or by
// number — like a phone's own call log. Non-admins only ever see their own
// calls (server-scoped), same as the rest of this page.
function CallLogPanel({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayISO());
  const [phoneSearch, setPhoneSearch] = useState('');
  const [appliedPhone, setAppliedPhone] = useState('');
  const [logs, setLogs] = useState<CallLogRow[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Debounced — typing a number shouldn't fire a request per keystroke, and
  // once applied it takes over from the date filter entirely (full history
  // for that number, not just one day).
  useEffect(() => {
    const t = setTimeout(() => { setAppliedPhone(phoneSearch.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [phoneSearch]);

  useEffect(() => { setPage(1); }, [date]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (appliedPhone) params.phone = appliedPhone;
      else params.date = date;
      const res = await api.get('/api/sales/call-log', { params });
      setLogs(res.data.data);
      setMeta(res.data.meta);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load call log');
    } finally {
      setLoading(false);
    }
  }, [page, date, appliedPhone]);

  useEffect(() => { load(); }, [load]);

  const directionLabel = (d?: CallLogRow['direction']) =>
    d === 'INBOUND' ? 'Inbound' : d === 'OUTBOUND' ? 'Outbound' : d === 'MISSED' ? 'Missed' : '—';
  const durationLabel = (s?: number | null) => {
    if (s == null) return '—';
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted-foreground flex items-center gap-2">
          Date:
          <input
            type="date"
            className="px-2 py-1.5 border rounded-lg text-sm"
            value={date}
            disabled={!!appliedPhone}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <input
          className="px-3 py-2 border rounded-lg text-sm w-64"
          placeholder="Search a phone number for its full history..."
          value={phoneSearch}
          onChange={(e) => setPhoneSearch(e.target.value)}
        />
        {appliedPhone && (
          <button onClick={() => setPhoneSearch('')} className="text-xs text-blue-600 hover:underline">
            Clear — back to daily log
          </button>
        )}
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50 ml-auto">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        {appliedPhone ? `Full call history for ${appliedPhone}` : `Calls on ${formatDate(date)}`} — {meta?.total ?? 0} call{meta?.total === 1 ? '' : 's'}
      </p>

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Time</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Activity</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Direction</th>
              <th className="px-3 py-3">Duration</th>
              <th className="px-3 py-3">Lead</th>
              <th className="px-3 py-3">Called By</th>
              <th className="px-3 py-3">Recording</th>
              <th className="px-3 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">No calls found</td></tr>
            ) : logs.map((c) => {
              const number = c.rawPhoneNumber || c.lead?.phone;
              return (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(c.calledAt)}</td>
                  <td className="px-3 py-3 text-xs font-medium whitespace-nowrap">{formatTime(c.calledAt)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {number ? (
                      <button
                        onClick={() => setPhoneSearch(number)}
                        title="View full history for this number"
                        className="flex items-center gap-1 text-blue-600 hover:underline text-xs"
                      >
                        <Phone className="w-3 h-3" /> {number}
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {c.activityType === 'MEETING' ? 'Meeting' : 'Call'}
                  </td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap">
                    {c.activityStatus ? ACTIVITY_STATUS_LABEL[c.activityStatus] : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {c.source === 'AUTO' ? directionLabel(c.direction) : 'Manual'}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {c.source === 'AUTO' ? durationLabel(c.durationSeconds) : '—'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {c.lead ? (
                      <button onClick={() => onOpenLead(c.lead!.id)} className="text-blue-600 hover:underline text-xs">{c.lead.name}</button>
                    ) : <span className="text-xs text-muted-foreground">Unmatched</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {c.calledBy ? `${c.calledBy.firstName} ${c.calledBy.lastName}` : '—'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {c.source === 'AUTO' && (c.durationSeconds ?? 0) > 0 && !c.recordingUrl
                      ? <span className="text-[11px] text-amber-700">Not recorded</span>
                      : <RecordingPlayer url={c.recordingUrl} />}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground max-w-[240px] truncate" title={c.notes || ''}>
                    {c.notes || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && meta && meta.total > 0 && (
        <div className="flex items-center justify-between pt-1 text-sm text-muted-foreground">
          <span>{meta.total} call{meta.total === 1 ? '' : 's'} · page {meta.page} of {meta.totalPages}</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(p - 1, 1))} className="flex items-center gap-1 px-2 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-muted/50">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button disabled={page >= meta.totalPages} onClick={() => setPage((p) => Math.min(p + 1, meta.totalPages))} className="flex items-center gap-1 px-2 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-muted/50">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateLeadFromCallModal({ call, onClose, onCreated, setError }: {
  call: UnmatchedCall; onClose: () => void; onCreated: () => void; setError: (s: string) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post(`/api/sales/unmatched-calls/${call.id}/create-lead`, { name: name.trim() || undefined });
      onCreated();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to create lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">New lead from this call</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground">
          Phone {call.rawPhoneNumber || 'unknown'} will be used as the lead's number, assigned to whoever's phone took the call.
        </p>
        <input
          autoFocus
          className="w-full px-3 py-2 border rounded-lg text-sm"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Leaderboard tab: per-salesperson KPI breakdown for a date range,
// with target-vs-actual once a target's been set for that rep this month.
function LeaderboardPanel() {
  const [preset, setPreset] = useState<RangePreset>('month');
  const [customStart, setCustomStart] = useState(isoDate(new Date()));
  const [customEnd, setCustomEnd] = useState(isoDate(new Date()));
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = preset === 'custom' ? { start: customStart, end: customEnd } : presetRange(preset);
  const now = new Date();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Targets are monthly, so only meaningful to show when the selected
      // range sits within a single calendar month (the common case: today,
      // this week, or this month) — a custom multi-month range just won't
      // carry target columns, since "goal" wouldn't mean anything summed.
      const params: Record<string, string> = { start: range.start, end: range.end };
      if (preset !== 'custom' || range.start.slice(0, 7) === range.end.slice(0, 7)) {
        params.month = String(now.getMonth() + 1);
        params.year = String(now.getFullYear());
      }
      const res = await api.get('/api/sales/leaderboard', { params });
      setRows(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end, preset]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Every salesperson's activity and results, side by side, for the selected range.</p>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['today', 'week', 'month', 'custom'] as RangePreset[]).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${preset === p ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-muted/50'}`}
          >
            {p === 'today' ? 'Today' : p === 'week' ? 'Last 7 Days' : p === 'month' ? 'This Month' : 'Custom'}
          </button>
        ))}
        {preset === 'custom' && (
          <>
            <input type="date" className="px-2 py-1.5 border rounded-lg text-xs" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" className="px-2 py-1.5 border rounded-lg text-xs" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </>
        )}
      </div>

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Salesperson</th>
              <th className="px-3 py-3">Calls</th>
              <th className="px-3 py-3">Leads</th>
              <th className="px-3 py-3">Demos Booked</th>
              <th className="px-3 py-3">Demos Done</th>
              <th className="px-3 py-3">Enrolled</th>
              <th className="px-3 py-3">Lost</th>
              <th className="px-3 py-3">Revenue</th>
              <th className="px-3 py-3">Avg First Contact</th>
              <th className="px-3 py-3">Target (Enroll / Revenue)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No activity in this range</td></tr>
            ) : rows.map((r) => (
              <tr key={r.employeeId} className="hover:bg-muted/30">
                <td className="px-3 py-3 font-medium whitespace-nowrap">{r.firstName} {r.lastName}</td>
                <td className="px-3 py-3">{r.callsMade}</td>
                <td className="px-3 py-3">{r.leadsCreated}</td>
                <td className="px-3 py-3">{r.demosBooked}</td>
                <td className="px-3 py-3">{r.demosConducted}</td>
                <td className="px-3 py-3 font-semibold text-green-600">{r.enrolled}</td>
                <td className="px-3 py-3 text-red-600">{r.lost}</td>
                <td className="px-3 py-3 font-semibold whitespace-nowrap">{formatCurrency(r.revenue)}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatHours(r.avgFirstContactHours)}</div>
                </td>
                <td className="px-3 py-3 text-xs whitespace-nowrap">
                  {r.target ? (
                    <span className={r.enrolled >= r.target.enrollmentGoal ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                      {r.enrolled}/{r.target.enrollmentGoal} · {formatCurrency(r.revenue)}/{formatCurrency(r.target.revenueGoal)}
                    </span>
                  ) : <span className="text-muted-foreground">No target set</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Targets tab: monthly enrollment + revenue goals per salesperson.
function TargetsPanel({ employees }: { employees: EmployeeLite[] }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null); // employeeId being edited
  const [enrollmentGoal, setEnrollmentGoal] = useState('');
  const [revenueGoal, setRevenueGoal] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/sales/targets', { params: { month: String(month), year: String(year) } });
      setTargets(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load targets');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const targetByEmployee = new Map(targets.map((t) => [t.employeeId, t]));

  const startEdit = (employeeId: string) => {
    const existing = targetByEmployee.get(employeeId);
    setEditingId(employeeId);
    setEnrollmentGoal(existing ? String(existing.enrollmentGoal) : '');
    setRevenueGoal(existing ? String(existing.revenueGoal) : '');
  };

  const save = async (employeeId: string) => {
    setSaving(true);
    setError('');
    try {
      await api.post('/api/sales/targets', {
        employeeId, month, year,
        enrollmentGoal: Number(enrollmentGoal) || 0,
        revenueGoal: Number(revenueGoal) || 0,
      });
      setEditingId(null);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to save target');
    } finally {
      setSaving(false);
    }
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <select className="px-3 py-2 border rounded-lg text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className="px-3 py-2 border rounded-lg text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50 ml-auto">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Salesperson</th>
              <th className="px-3 py-3">Enrollment Goal</th>
              <th className="px-3 py-3">Revenue Goal</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No salespeople found</td></tr>
            ) : employees.map((emp) => {
              const existing = targetByEmployee.get(emp.id);
              const isEditing = editingId === emp.id;
              return (
                <tr key={emp.id} className="hover:bg-muted/30">
                  <td className="px-3 py-3 font-medium whitespace-nowrap">{emp.firstName} {emp.lastName}</td>
                  {isEditing ? (
                    <>
                      <td className="px-3 py-3">
                        <input type="number" className="w-24 px-2 py-1 border rounded-lg text-xs" value={enrollmentGoal} onChange={(e) => setEnrollmentGoal(e.target.value)} />
                      </td>
                      <td className="px-3 py-3">
                        <input type="number" className="w-28 px-2 py-1 border rounded-lg text-xs" value={revenueGoal} onChange={(e) => setRevenueGoal(e.target.value)} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button onClick={() => save(emp.id)} disabled={saving} className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50">
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-3">{existing?.enrollmentGoal ?? '—'}</td>
                      <td className="px-3 py-3">{existing ? formatCurrency(existing.revenueGoal) : '—'}</td>
                      <td className="px-3 py-3">
                        <button onClick={() => startEdit(emp.id)} className="text-xs font-medium text-blue-600 hover:underline">
                          {existing ? 'Edit' : 'Set Target'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
