import { ReleaseFeedbackButton } from '@/components/DemoFeedbackForm';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api, { BASE_URL } from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import ColumnHeader from '@/components/ColumnHeader';
import DateTimeField from '@/components/DateTimeField';
import { OnboardingModal, LeadFeesPanel, CourseFeesModal, type OnboardingInfo } from './SalesOnboarding';
import AdvancedFilter, { type FilterField, type FilterGroup } from '@/components/AdvancedFilter';
import { formatDate, formatDateTime, formatTime } from '@/lib/utils';
import {
  Lock, Plus, X, Phone, Mail, Calendar, Users, TrendingUp, CheckCircle2,
  PhoneCall, Video, MapPin, RefreshCw, AlertTriangle, Settings, Trash2, Activity,
  ChevronLeft, ChevronRight, Upload, Download, Percent,
  Smartphone, PhoneIncoming, Link2, UserPlus, Copy, Ban, Check, History,
  Target as TargetIcon, Trophy, Clock, PlayCircle, Bell, ListChecks, BarChart3, Eye, Inbox, Layers, ShieldCheck, Sun, MessageCircle, Send,
} from 'lucide-react';

const PAGE_SIZES = ['25', '50', '100', '250', '500', 'all'];

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
  createdBy?: { id: string; name: string } | null;
  courseInterest?: string | null;
  status: LeadStatus;
  activityStatus?: ActivityStatus | null;
  stageKey?: string | null;
  statusKey?: string | null;
  scoutKey?: string | null;
  lostReasonKey?: string | null;
  lostReason?: LeadLostReason | null;
  notes?: string | null;
  lastContactAt?: string | null;
  nextFollowUpAt?: string | null;
  dnpCount?: number;
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

// A status is either a built-in value (DNP, FOLLOW_UP…) or a custom key (CUSTOM_xxx) created in Config.
type ActivityStatus = string;
type ActivityType = 'CALL' | 'MEETING';

// ── Config (stages / update statuses / lost reasons / sources / lead scouts) ──
interface CfgItem {
  id: string; kind: string; key: string; label: string; base: string | null; color: string | null;
  system: boolean; active: boolean; sortOrder: number;
  targetStageKey?: string | null; needsFollowUp?: boolean; notesRequired?: boolean;
}
interface CfgData { stages: CfgItem[]; statuses: CfgItem[]; lostReasons: CfgItem[]; sources: CfgItem[]; scouts: CfgItem[]; colors: string[] }
const EMPTY_CFG: CfgData = { stages: [], statuses: [], lostReasons: [], sources: [], scouts: [], colors: [] };
const DEFAULT_STATUSES: { value: string; label: string }[] = [
  { value: 'DNP', label: 'DNP' }, { value: 'FOLLOW_UP', label: 'Follow-up' }, { value: 'DEMO_BOOKED', label: 'Demo booked' },
  { value: 'DEMO_OVER', label: 'Demo over' }, { value: 'NOT_INTERESTED', label: 'Not interested' }, { value: 'DISQUALIFIED', label: 'Disqualified' },
];
// Module-level snapshot so label helpers work everywhere; SalesPage re-renders once it loads.
let CFG: CfgData = EMPTY_CFG;
const cfgStatus = (key?: string | null) => CFG.statuses.find((s) => s.key === key);
const cfgStage = (key?: string | null) => CFG.stages.find((s) => s.key === key);
const ACTIVITY_STATUSES_LIVE = (): { value: string; label: string }[] =>
  CFG.statuses.length ? CFG.statuses.map((s) => ({ value: s.key, label: s.label })) : DEFAULT_STATUSES;
const ACTIVITY_STATUS_LABEL = new Proxy({} as Record<string, string>, {
  get: (_t, k: string) => cfgStatus(k)?.label ?? DEFAULT_STATUSES.find((s) => s.value === k)?.label ?? String(k).replace(/^CUSTOM_/, '').replace(/_/g, ' '),
});
// Statuses that keep the lead open, so a follow-up date AND time must be given.
const needsFollowUp = (key: string): boolean => {
  const c = cfgStatus(key);
  return c ? !!c.needsFollowUp : ['DNP', 'FOLLOW_UP', 'DEMO_BOOKED', 'DEMO_OVER'].includes(key);
};
/** Built-in behaviour a status copies (DEMO_BOOKED, DISQUALIFIED…). */
const statusBase = (key: string): string => cfgStatus(key)?.base ?? key;
/** Stage a status moves the lead into (shown as a preview). */
const statusStageLabel = (key: string): string => {
  const c = cfgStatus(key);
  if (c?.targetStageKey) return cfgStage(c.targetStageKey)?.label ?? c.targetStageKey.replace(/_/g, ' ');
  const m: Record<string, string> = { DNP: 'Contacted', FOLLOW_UP: 'Contacted', DEMO_BOOKED: 'Demo scheduled', DEMO_OVER: 'Demo done', NOT_INTERESTED: 'Lost', DISQUALIFIED: 'Lost' };
  return m[key] ?? '';
};
const statusGoesToLost = (key: string): boolean => {
  const c = cfgStatus(key);
  if (c?.targetStageKey) return (cfgStage(c.targetStageKey)?.base ?? c.targetStageKey) === 'LOST';
  return key === 'NOT_INTERESTED' || key === 'DISQUALIFIED';
};
const statusNeedsLostReason = (key: string): boolean => statusBase(key) === 'DISQUALIFIED';
const notesNeeded = (key: string): boolean => { const c = cfgStatus(key); return c ? c.notesRequired !== false : key !== 'DNP'; };
const scoutLabel = (key?: string | null) => (key ? CFG.scouts.find((s) => s.key === key)?.label ?? key.replace(/^SCOUT_/, '').replace(/_/g, ' ') : '');
const CFG_COLOR: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700', blue: 'bg-blue-100 text-blue-700', green: 'bg-green-100 text-green-700', amber: 'bg-amber-100 text-amber-700',
  orange: 'bg-orange-100 text-orange-700', red: 'bg-red-100 text-red-700', purple: 'bg-purple-100 text-purple-700', pink: 'bg-pink-100 text-pink-700', teal: 'bg-teal-100 text-teal-700',
};

type LeadTab = 'profile' | 'activity' | 'tasks' | 'demo' | 'fees' | 'notes' | 'history';

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
  source?: 'MANUAL' | 'AUTO';
  direction?: 'INBOUND' | 'OUTBOUND' | 'MISSED' | null;
  durationSeconds?: number | null;
}
const callDirLabel = (d?: string | null) => (d === 'INBOUND' ? 'Incoming' : d === 'OUTBOUND' ? 'Outgoing' : d === 'MISSED' ? 'Missed' : 'Call');
const callDurLabel = (s?: number | null) => { if (s == null) return '—'; const m = Math.floor(s / 60), sec = s % 60; return m > 0 ? `${m}m ${sec}s` : `${sec}s`; };

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

// Config-aware helpers (fall back to the built-in lists until /config loads).
/** Active stages (plus the lead's current one even if switched off). */
const stageOptionsLive = (current?: string): { value: string; label: string }[] => {
  if (!CFG.stages.length) return STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }));
  const list = CFG.stages.filter((s) => s.active || s.key === current).map((s) => ({ value: s.key, label: s.label }));
  return list;
};
const stageBase = (key: string): string => cfgStage(key)?.base ?? key;
const stageLabel = (key: string): string => cfgStage(key)?.label ?? key.replace(/^CUSTOM_/, '').replace(/_/g, ' ');
const stageChipClass = (key: string): string => {
  const c = cfgStage(key);
  return (c?.color && CFG_COLOR[c.color]) || STATUS_COLOR[(c?.base ?? key) as LeadStatus] || 'bg-slate-100 text-slate-700';
};
/** Lost reasons the user can pick (active ones). */
const lostReasonsLive = (): { value: string; label: string; base: string }[] =>
  CFG.lostReasons.length ? CFG.lostReasons.filter((r) => r.active).map((r) => ({ value: r.key, label: r.label, base: r.base ?? 'OTHER' })) : LOST_REASONS.map((r) => ({ ...r, base: r.value }));
const lostReasonLabel = (key?: string | null, base?: string | null): string =>
  (key && CFG.lostReasons.find((r) => r.key === key)?.label) || (base && LOST_REASON_LABEL[base as LeadLostReason]) || '';

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

// What each demo outcome does to the lead (mirrors OUTCOME_PLAN on the server).
const OUTCOME_EFFECT: Record<DemoOutcome, { text: string; followUp: boolean }> = {
  INTERESTED: { text: 'Lead stage becomes Demo Over - Positive', followUp: false },
  FIFTY_FIFTY: { text: 'Lead stage becomes Demo Over - Need Follow up + a follow-up task', followUp: true },
  NEED_FOLLOWUP: { text: 'Lead stage becomes Demo Over - Need Follow up + a follow-up task', followUp: true },
  NOT_INTERESTED: { text: 'Lead stage becomes Not Interested', followUp: false },
};
// What the sales team picks after a demo — it is the lead stage.
const DEMO_OUTCOMES: DemoOutcome[] = ['INTERESTED', 'NEED_FOLLOWUP', 'NOT_INTERESTED'];
const DEMO_STAGE_PICK: Record<string, string> = { INTERESTED: 'Demo Over - Positive', NEED_FOLLOWUP: 'Demo Over - Need Follow up', NOT_INTERESTED: 'Not Interested' };
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

// ── Advanced filter field lists (must match the server whitelists in salesFilterFields.ts) ──
const empOptions = (emps: EmployeeLite[]) => emps.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }));
const stageOptions = STATUSES_FOR_FILTER();
function STATUSES_FOR_FILTER() { return ['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'DEMO_DONE', 'NEGOTIATION', 'ENROLLED', 'LOST'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })); }
const activityOptions = DEFAULT_STATUSES.map((s) => ({ value: s.value, label: s.label }));

const leadFilterFields = (emps: EmployeeLite[]): FilterField[] => [
  { key: 'name', label: 'Name', type: 'text' }, { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'email', label: 'Email', type: 'text', nullable: true }, { key: 'source', label: 'Source', type: 'text', nullable: true },
  { key: 'courseInterest', label: 'Course', type: 'text', nullable: true }, { key: 'city', label: 'City', type: 'text', nullable: true },
  { key: 'educationQualification', label: 'Qualification', type: 'text', nullable: true }, { key: 'collegeName', label: 'College', type: 'text', nullable: true },
  { key: 'currentStatus', label: 'Current status (job/study)', type: 'text', nullable: true },
  { key: 'passedOutYear', label: 'Passed out year', type: 'number', nullable: true },
  { key: 'status', label: 'Lead stage', type: 'select', options: stageOptions },
  { key: 'activityStatus', label: 'Status', type: 'select', options: activityOptions, nullable: true },
  { key: 'assignedToId', label: 'Assigned to', type: 'select', options: empOptions(emps), nullable: true },
  { key: 'scoutKey', label: 'Lead Scout', type: 'select', options: CFG.scouts.map((s) => ({ value: s.key, label: s.label })), nullable: true },
  { key: 'createdAt', label: 'Created', type: 'date' }, { key: 'lastContactAt', label: 'Last contact', type: 'date', nullable: true },
  { key: 'nextFollowUpAt', label: 'Follow-up', type: 'date', nullable: true },
  { key: 'demoMode', label: 'Demo mode', type: 'select', options: [{ value: 'ONLINE', label: 'Online' }, { value: 'OFFLINE', label: 'Offline' }] },
  { key: 'demoStatus', label: 'Demo status', type: 'select', options: ['SCHEDULED', 'COMPLETED', 'RESCHEDULED', 'NO_SHOW', 'CANCELLED'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
  { key: 'demoDate', label: 'Demo date', type: 'date' },
];
const callFilterFields = (emps: EmployeeLite[]): FilterField[] => [
  { key: 'calledAt', label: 'Date', type: 'date' },
  { key: 'activityType', label: 'Activity', type: 'select', nullable: true, options: [{ value: 'CALL', label: 'Call' }, { value: 'MEETING', label: 'Meeting' }] },
  { key: 'activityStatus', label: 'Status', type: 'select', nullable: true, options: activityOptions },
  { key: 'direction', label: 'Direction', type: 'select', nullable: true, options: [{ value: 'INBOUND', label: 'Inbound' }, { value: 'OUTBOUND', label: 'Outbound' }, { value: 'MISSED', label: 'Missed' }] },
  { key: 'source', label: 'Logged how', type: 'select', options: [{ value: 'MANUAL', label: 'Manual' }, { value: 'AUTO', label: 'Auto (SIM)' }] },
  { key: 'durationSeconds', label: 'Duration (seconds)', type: 'number', nullable: true },
  { key: 'calledById', label: 'Called by', type: 'select', nullable: true, options: empOptions(emps) },
  { key: 'rawPhoneNumber', label: 'Phone number', type: 'text', nullable: true },
  { key: 'leadName', label: 'Lead name', type: 'text' }, { key: 'notes', label: 'Notes', type: 'text', nullable: true },
];
const feedFilterFields = (emps: EmployeeLite[]): FilterField[] => [
  { key: 'createdAt', label: 'When', type: 'date' },
  { key: 'type', label: 'Type', type: 'select', options: ['ACTIVITY', 'STATUS', 'STAGE', 'ASSIGNED', 'FOLLOW_UP', 'EDIT', 'CREATED', 'DELETED', 'DEMO', 'TASK', 'NOTE', 'MESSAGE'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
  { key: 'actorId', label: 'Done by', type: 'select', nullable: true, options: empOptions(emps) },
  { key: 'leadName', label: 'Lead name', type: 'text' }, { key: 'leadPhone', label: 'Lead phone', type: 'text' },
  { key: 'summary', label: 'What changed', type: 'text' },
];

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
type Tab = 'collections' | 'dashboard' | 'leads' | 'reminders' | 'tasks' | 'summaries' | 'activityMonitor' | 'pulse' | 'leadQuality' | 'liveDemos' | 'demoBooked' | 'demoRescheduled' | 'demoConducted' | 'devices' | 'unmatchedCalls' | 'callLog' | 'leaderboard' | 'targets' | 'myBase' | 'batches' | 'leadControl' | 'today' | 'callAnalytics' | 'config' | 'transcripts' | 'teams';
const VALID_TABS: Tab[] = ['collections', 'dashboard', 'transcripts', 'config', 'leads', 'reminders', 'tasks', 'summaries', 'activityMonitor', 'pulse', 'leadQuality', 'liveDemos', 'demoBooked', 'demoRescheduled', 'demoConducted', 'devices', 'unmatchedCalls', 'callLog', 'leaderboard', 'targets', 'myBase', 'batches', 'leadControl', 'today', 'callAnalytics', 'teams'];
// Sales Pulse / Lead Quality are aggregate, cross-rep views — admin only.
// BDAs get Demo Booked/Rescheduled/Conducted instead, scoped to their own leads.
// Devices (issuing call-tracking tokens) is admin-only too. Unmatched Calls
// is regular EDIT access, same level as logging a call manually — both admins
// and BDAs can see and work it. Leaderboard/Targets are management-level KPI
// views, same access tier as Pulse/Lead Quality. "My Students" lives on its
// own top-level page (see MyStudents.tsx), not as a Sales tab.
const ADMIN_ONLY_TABS: Tab[] = ['config', 'myBase', 'batches', 'leadControl', 'summaries', 'activityMonitor', 'pulse', 'leadQuality', 'liveDemos', 'devices', 'leaderboard', 'targets', 'teams'];
const BDA_ONLY_TABS: Tab[] = ['demoBooked', 'demoRescheduled', 'demoConducted'];
const EDIT_REQUIRED_TABS: Tab[] = ['unmatchedCalls'];

export default function SalesPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.SALES;
  const canEdit = hasModule('SALES', 'EDIT');
  const isAdmin = hasModule('SALES', 'ADMIN');

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [showCourseFees, setShowCourseFees] = useState(false);
  const [tab, setTabState] = useState<Tab>(tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'dashboard');
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
  const [advFilter, setAdvFilter] = useState<FilterGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  // Bulk hand-out from the Leads tab (Sales Admin): tick leads (or "first N" of the list) → give them to one person.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [firstN, setFirstN] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [hideHistory, setHideHistory] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  // Populated when the detail modal is opened from somewhere other than the
  // Leads tab (e.g. a Demo Booked row), where we don't already have the full
  // lead object in memory — falls back to `leads.find(...)` first, which stays
  // live-refreshed off fetchAll for the Leads tab's own click-through.
  const [fetchedDetailLead, setFetchedDetailLead] = useState<Lead | null>(null);
  const [lostReasonLead, setLostReasonLead] = useState<Lead | null>(null);
  const [lostStage, setLostStage] = useState('LOST');
  const [saving, setSaving] = useState(false);

  // Any filter change resets to page 1 — otherwise you can land on a page
  // number that no longer exists once the result set shrinks.
  useEffect(() => { setPage(1); }, [search, statusFilter, activityFilter, followUpFilter, assignedFilter, sourceFilter, createdFrom, createdTo, followFrom, followTo, advFilter]);
  useEffect(() => { api.get('/api/sales/sources').then((r) => setSourceOptions(r.data.data)).catch(() => setSourceOptions([])); }, []);
  // Config lists (stages, statuses, lost reasons, sources, scouts) — kept in a module snapshot so every sub-component can read labels.
  const [cfg, setCfgState] = useState<CfgData>(CFG);
  const [scoutFilter, setScoutFilter] = useState('');
  const [tlFilter, setTlFilter] = useState('');
  const [teamMap, setTeamMap] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState<string>(() => { try { const v = localStorage.getItem('sales.pageSize'); return v && PAGE_SIZES.includes(v) ? v : '50'; } catch { return '50'; } });
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [nameLike, setNameLike] = useState('');
  const [phoneLike, setPhoneLike] = useState('');
  const [emailLike, setEmailLike] = useState('');
  const onSort = (key: string, dir: 'asc' | 'desc' | '') => { if (!dir) { setSortBy(''); return; } setSortBy(key); setSortDir(dir); };
  const changePageSize = (v: string) => { setPageSize(v); setPage(1); try { localStorage.setItem('sales.pageSize', v); } catch { /* ignore */ } };
  useEffect(() => { setPage(1); }, [nameLike, phoneLike, emailLike, sortBy, sortDir]);
  const loadConfig = useCallback(async () => {
    try {
      const r = await api.get('/api/sales/config');
      CFG = r.data.data as CfgData;
      setCfgState(CFG);
    } catch { /* keep built-in defaults */ }
  }, []);
  useEffect(() => { if (level) loadConfig(); }, [level, loadConfig]);
  useEffect(() => { setPage(1); }, [scoutFilter, tlFilter]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: String(page), limit: pageSize };
      if (sortBy) { params.sortBy = sortBy; params.sortDir = sortDir; }
      if (nameLike) params.nameLike = nameLike; if (phoneLike) params.phoneLike = phoneLike; if (emailLike) params.emailLike = emailLike;
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (activityFilter) params.activityStatus = activityFilter;
      if (assignedFilter) params.assignedToId = assignedFilter;
      if (sourceFilter) params.source = sourceFilter;
      if (scoutFilter) params.scoutKey = scoutFilter;
      if (tlFilter) {
        // Team Lead filter = the TL plus everyone mapped to them (Sales → Teams); combined with "Assigned to" it narrows further.
        const tls = tlFilter.split(',');
        let ids = Object.keys(teamMap).filter((e) => tls.includes(teamMap[e])).concat(tls);
        if (assignedFilter) { const a = assignedFilter.split(','); ids = ids.filter((i) => a.includes(i)); }
        params.assignedToId = ids.length ? Array.from(new Set(ids)).join(',') : '__none__';
      }
      if (createdFrom) params.createdFrom = createdFrom;
      if (createdTo) params.createdTo = createdTo;
      if (followFrom) params.followUpFrom = followFrom;
      if (followTo) params.followUpTo = followTo;
      if (followUpFilter) params.followUp = followUpFilter;
      if (advFilter) params.filter = JSON.stringify(advFilter);
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
  }, [page, search, statusFilter, activityFilter, followUpFilter, assignedFilter, sourceFilter, scoutFilter, tlFilter, teamMap, createdFrom, createdTo, followFrom, followTo, advFilter, pageSize, sortBy, sortDir, nameLike, phoneLike, emailLike]);

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
    if (level === 'ADMIN') api.get('/api/sales/team-map').then((r) => setTeamMap(Object.fromEntries((r.data.data as { employeeId: string; tlId: string }[]).map((m) => [m.employeeId, m.tlId])))).catch(() => setTeamMap({}));
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

  // A lead opened from "Open in new tab" / a shared link: /sales?tab=leads&lead=<id>
  const leadFromUrl = useRef(searchParams.get('lead'));
  useEffect(() => {
    if (leadFromUrl.current && level) { const id = leadFromUrl.current; leadFromUrl.current = null; openLeadDetail(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

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

  const updateLeadStatus = async (id: string, status: string, lostReason?: string) => {
    try {
      const isBuiltIn = (STATUSES as string[]).includes(status);
      await api.put(`/api/sales/leads/${id}`, isBuiltIn ? { status, lostReason } : { stageKey: status, lostReason });
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to update lead');
    }
  };

  // Marking a lead LOST requires picking a reason first — every other status
  // change applies immediately.
  const onStatusChange = (lead: Lead, status: string) => {
    if (stageBase(status) === 'LOST' && !['CUSTOM_NOT_INTERESTED', 'CUSTOM_UNRESPONSIVE'].includes(status)) { setLostStage(status); setLostReasonLead(lead); return; }
    updateLeadStatus(lead.id, status);
  };

  const bulkAssign = async () => {
    if (!picked.size) return setError('Tick the leads to assign first');
    if (!bulkTo) return setError('Choose who to assign them to');
    const who = employees.find((e) => e.id === bulkTo);
    if (!window.confirm(`Assign ${picked.size} lead${picked.size === 1 ? '' : 's'} to ${who ? `${who.firstName} ${who.lastName}` : 'this person'}?${hideHistory ? '\nPast history will be hidden from them.' : ''}`)) return;
    setBulkBusy(true); setError(''); setBulkMsg('');
    try {
      const ids = Array.from(picked);
      // Sent in chunks so a big selection never hits a request-size limit.
      let done = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const r = await api.post('/api/sales/mybase/assign', { employeeIds: [bulkTo], leadIds: ids.slice(i, i + 500), showHistory: !hideHistory });
        done += r.data.data.assigned;
      }
      setBulkMsg(`Assigned ${done} lead${done === 1 ? '' : 's'}${who ? ` to ${who.firstName} ${who.lastName}` : ''}.${done < ids.length ? ` ${ids.length - done} were skipped (enrolled leads can't be moved).` : ''}`);
      setPicked(new Set()); setBulkTo('');
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Assignment failed');
    } finally { setBulkBusy(false); }
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
    <div className="space-y-6 min-w-0 max-w-full">
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

      <div className="flex flex-wrap items-center gap-x-1 border-b max-w-full">
        {(isAdmin
          ? [
              { id: 'dashboard' as Tab, label: 'Dashboard', icon: BarChart3 },
              { id: 'today' as Tab, label: 'Today', icon: Sun },
              { id: 'leads' as Tab, label: 'Leads', icon: Users },
              { id: 'reminders' as Tab, label: 'My Reminders', icon: Bell },
              { id: 'collections' as Tab, label: 'Collections', icon: Percent },
              { id: 'tasks' as Tab, label: 'Manage Tasks', icon: ListChecks },
              { id: 'myBase' as Tab, label: 'My Base', icon: Inbox },
              { id: 'batches' as Tab, label: 'Batches', icon: Layers },
              { id: 'leadControl' as Tab, label: 'Lead Tools', icon: ShieldCheck },
              { id: 'config' as Tab, label: 'Config', icon: Settings },
              { id: 'callLog' as Tab, label: 'Call Log', icon: History },
              { id: 'callAnalytics' as Tab, label: 'Call Analytics', icon: BarChart3 },
              { id: 'transcripts' as Tab, label: 'Transcripts', icon: MessageCircle },
              { id: 'summaries' as Tab, label: 'Summaries', icon: BarChart3 },
              { id: 'activityMonitor' as Tab, label: 'Activity Monitor', icon: Eye },
              { id: 'pulse' as Tab, label: 'Sales Pulse', icon: Activity },
              { id: 'leaderboard' as Tab, label: 'Leaderboard', icon: Trophy },
              { id: 'targets' as Tab, label: 'Targets', icon: TargetIcon },
              { id: 'teams' as Tab, label: 'Teams', icon: Users },
              { id: 'leadQuality' as Tab, label: 'Lead Quality', icon: Percent },
              { id: 'liveDemos' as Tab, label: 'Live Demos', icon: Video },
              { id: 'unmatchedCalls' as Tab, label: 'Unmatched Calls', icon: PhoneIncoming },
              { id: 'devices' as Tab, label: 'Devices', icon: Smartphone },
            ]
          : [
              { id: 'dashboard' as Tab, label: 'Dashboard', icon: BarChart3 },
              { id: 'today' as Tab, label: 'Today', icon: Sun },
              { id: 'leads' as Tab, label: 'Leads', icon: Users },
              { id: 'reminders' as Tab, label: 'My Reminders', icon: Bell },
              { id: 'collections' as Tab, label: 'Collections', icon: Percent },
              { id: 'tasks' as Tab, label: 'My Tasks', icon: ListChecks },
              { id: 'callLog' as Tab, label: 'Call Log', icon: History },
              { id: 'callAnalytics' as Tab, label: 'My Call Stats', icon: BarChart3 },
              { id: 'transcripts' as Tab, label: 'Transcripts', icon: MessageCircle },
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
              className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
        {isAdmin && <button onClick={() => setShowCourseFees(true)} className="ml-auto whitespace-nowrap px-3 py-1.5 mb-1 text-xs font-medium border rounded-lg hover:bg-muted/50">Course fees</button>}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {showCourseFees && <CourseFeesModal base="/api/sales" onClose={() => setShowCourseFees(false)} />}

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
              options={stageOptionsLive().map((s) => ({ value: s.value, label: s.label }))} />
            <MultiSelect label="Status" value={activityFilter} onChange={setActivityFilter}
              options={[...ACTIVITY_STATUSES_LIVE(), { value: 'NONE', label: 'No status yet' }]} />
            {isAdmin && (
              <MultiSelect label="Assigned to" value={assignedFilter} onChange={setAssignedFilter}
                options={[{ value: 'NONE', label: 'Unassigned' }, ...employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))]} />
            )}
            {isAdmin && Object.keys(teamMap).length > 0 && (
              <MultiSelect label="Team Lead" value={tlFilter} onChange={setTlFilter}
                options={Array.from(new Set(Object.values(teamMap))).map((id) => { const e = employees.find((x) => x.id === id); return { value: id, label: e ? `${e.firstName} ${e.lastName}` : id }; })} />
            )}
            <MultiSelect label="Source" value={sourceFilter} onChange={setSourceFilter}
              options={[...Array.from(new Set([...cfg.sources.map((s) => s.label), ...sourceOptions])).map((s) => ({ value: s, label: s })), { value: 'Unknown', label: 'Unknown' }]} />
            <select value={followUpFilter} onChange={(e) => setFollowUpFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All reminders</option>
              <option value="today">Due today</option>
              <option value="overdue">Overdue</option>
              <option value="none">No reminder</option>
            </select>
            <label className="text-xs text-muted-foreground flex items-center gap-1">Created
              <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" />
              –<input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" />
            </label>
            <label className="text-xs text-muted-foreground flex items-center gap-1">Follow-up
              <input type="date" value={followFrom} onChange={(e) => setFollowFrom(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" />
              –<input type="date" value={followTo} onChange={(e) => setFollowTo(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" />
            </label>
            <AdvancedFilter scope="leads" fields={leadFilterFields(employees)} value={advFilter} onChange={setAdvFilter} />
            {(statusFilter || activityFilter || assignedFilter || tlFilter || sourceFilter || scoutFilter || createdFrom || createdTo || followFrom || followTo || followUpFilter || nameLike || phoneLike || emailLike || sortBy) && (
              <button onClick={() => { setStatusFilter(''); setActivityFilter(''); setAssignedFilter(''); setSourceFilter(''); setScoutFilter(''); setCreatedFrom(''); setCreatedTo(''); setFollowFrom(''); setFollowTo(''); setFollowUpFilter(''); setNameLike(''); setPhoneLike(''); setEmailLike(''); setSortBy(''); }} className="text-xs text-blue-600 hover:underline">Clear all filters & sort</button>
            )}
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-3 bg-card border rounded-xl px-3 py-2 text-sm">
              <span className="font-medium">Assign leads</span>
              <label className="flex items-center gap-1.5 text-muted-foreground">Select first
                <input type="number" min={1} value={firstN} onChange={(e) => setFirstN(e.target.value)} className="w-20 px-2 py-1 border rounded-lg text-foreground bg-background" placeholder="200" />
                <button onClick={() => { const n = Number(firstN); if (n > 0) setPicked(new Set(leads.slice(0, n).map((l) => l.id))); }} className="px-2 py-1 border rounded-lg text-foreground hover:bg-muted/50">Select</button>
                <span className="text-xs">of the list below (set "Show" to All or 500 to reach more)</span>
              </label>
              {picked.size > 0 && (
                <>
                  <span className="font-semibold text-blue-700">{picked.size} selected</span>
                  <select value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} className="px-2 py-1.5 border rounded-lg bg-background">
                    <option value="">Assign to…</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={hideHistory} onChange={(e) => setHideHistory(e.target.checked)} /> hide past history from them</label>
                  <button onClick={bulkAssign} disabled={bulkBusy} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-50">{bulkBusy ? 'Assigning…' : 'Assign'}</button>
                  <button onClick={() => setPicked(new Set())} className="text-xs text-muted-foreground hover:underline">Clear</button>
                </>
              )}
            </div>
          )}
          {bulkMsg && <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-2">{bulkMsg}</div>}

          {/* Leads table */}
          <div className="bg-card border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {isAdmin && (
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox" title="Select all on this page" checked={leads.length > 0 && leads.every((l) => picked.has(l.id))}
                        onChange={(e) => setPicked((p) => { const n = new Set(p); leads.forEach((l) => (e.target.checked ? n.add(l.id) : n.delete(l.id))); return n; })} />
                    </th>
                  )}
                  <th className="px-3 py-3">#</th>
                  <ColumnHeader label="Name" sortKey="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} text={nameLike} onText={setNameLike} />
                  <ColumnHeader label="Phone" sortKey="phone" sortBy={sortBy} sortDir={sortDir} onSort={onSort} text={phoneLike} onText={setPhoneLike} />
                  <ColumnHeader label="Status" options={[...ACTIVITY_STATUSES_LIVE(), { value: 'NONE', label: 'No status yet' }]} value={activityFilter} onChange={setActivityFilter} />
                  <ColumnHeader label="Lead Stage" sortKey="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} options={stageOptionsLive().map((o) => ({ value: o.value, label: o.label }))} value={statusFilter} onChange={setStatusFilter} />
                  <ColumnHeader label="Assigned" sortKey="assignedTo" sortBy={sortBy} sortDir={sortDir} onSort={onSort}
                    {...(isAdmin ? { options: [{ value: 'NONE', label: 'Unassigned' }, ...employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))], value: assignedFilter, onChange: setAssignedFilter } : {})} />
                  <ColumnHeader label="Source" sortKey="source" sortBy={sortBy} sortDir={sortDir} onSort={onSort}
                    options={[...Array.from(new Set([...cfg.sources.map((x) => x.label), ...sourceOptions])).map((x) => ({ value: x, label: x })), { value: 'Unknown', label: 'Unknown' }]} value={sourceFilter} onChange={setSourceFilter} />
                  <ColumnHeader label="Reminder" sortKey="nextFollowUpAt" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <ColumnHeader label="Last Contact" sortKey="lastContactAt" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <ColumnHeader label="Created" sortKey="createdAt" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  {isAdmin && <th className="px-3 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">No leads found</td></tr>
                ) : leads.map((lead, i) => {
                  const latestDemo = lead.demos?.[0];
                  return (
                    <tr key={lead.id} className="hover:bg-muted/30">
                      {isAdmin && <td className="px-3 py-3"><input type="checkbox" checked={picked.has(lead.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(lead.id)) n.delete(lead.id); else n.add(lead.id); return n; })} /></td>}
                      <td className="px-3 py-3 text-muted-foreground">{(page - 1) * (pageSize === 'all' ? 0 : Number(pageSize)) + i + 1}</td>
                      <td className="px-3 py-3 font-medium whitespace-nowrap">
                        <a href={`/sales?tab=leads&lead=${lead.id}`} title={lead.name}
                          onClick={(e) => { if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); openLeadDetail(lead.id); } }}
                          className="text-blue-600 hover:underline text-left block max-w-[170px] truncate">
                          {lead.name}
                        </a>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-[15px] font-medium text-foreground"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {lead.phone}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {lead.activityStatus
                          ? <span className="inline-flex items-center gap-1.5"><span className="text-xs font-medium rounded-full px-2 py-1 bg-slate-100 text-slate-700">{ACTIVITY_STATUS_LABEL[lead.statusKey || lead.activityStatus]}</span>{(lead.dnpCount ?? 0) > 0 && lead.activityStatus === 'DNP' && <span title={`Did not pick ${lead.dnpCount} time(s) in a row — 5 makes the lead Unresponsive`} className={`text-[11px] font-semibold rounded-full px-1.5 py-0.5 ${(lead.dnpCount ?? 0) >= 4 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>DNP ×{lead.dnpCount}</span>}</span>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        {canEdit ? (
                          <select
                            value={lead.stageKey || lead.status}
                            onChange={(e) => onStatusChange(lead, e.target.value)}
                            className={`text-xs font-medium rounded-full px-2 py-1 border-0 ${stageChipClass(lead.stageKey || lead.status)}`}
                          >
                            {stageOptionsLive(lead.stageKey || lead.status).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        ) : (
                          <span className={`text-xs font-medium rounded-full px-2 py-1 ${stageChipClass(lead.stageKey || lead.status)}`}>{stageLabel(lead.stageKey || lead.status)}</span>
                        )}
                        {lead.status === 'LOST' && (lead.lostReasonKey || lead.lostReason) && (
                          <p className="text-[10px] text-muted-foreground mt-1">{lostReasonLabel(lead.lostReasonKey, lead.lostReason)}</p>
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
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                        {lead.source || '—'}
                      </td>
                      <td className={`px-3 py-3 text-xs whitespace-nowrap ${reminderColor(lead.nextFollowUpAt)}`}>
                        {lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : (lead.status === 'LOST' || lead.status === 'ENROLLED' ? '—' : <span className="text-red-500">No reminder</span>)}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {lead.lastContactAt ? formatDateTime(lead.lastContactAt) : 'Never'}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(lead.createdAt)}</td>
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
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>{meta.total} lead{meta.total === 1 ? '' : 's'}{pageSize !== 'all' && meta.totalPages > 1 ? ` · page ${meta.page} of ${meta.totalPages}` : ''}</span>
                <label className="flex items-center gap-1.5">Show
                  <select value={pageSize} onChange={(e) => changePageSize(e.target.value)} className="border rounded-lg px-2 py-1 text-sm text-foreground bg-background">
                    {PAGE_SIZES.map((v) => <option key={v} value={v}>{v === 'all' ? 'All' : v}</option>)}
                  </select>
                  per page
                </label>
              </div>
              {pageSize !== 'all' && meta.totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(p - 1, 1))} className="flex items-center gap-1 px-2 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-muted/50">
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <button disabled={page >= meta.totalPages} onClick={() => setPage((p) => Math.min(p + 1, meta.totalPages))} className="flex items-center gap-1 px-2 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-muted/50">
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'pulse' && isAdmin && <SalesPulsePanel canEdit={canEdit} />}

      {tab === 'leadQuality' && isAdmin && <LeadQualityPanel />}

      {tab === 'liveDemos' && isAdmin && <LiveDemosPanel />}

      {tab === 'reminders' && <TaskBoard isAdmin={isAdmin} canEdit={canEdit} employees={employees} onOpenLead={openLeadDetail} manage={false} />}

      {tab === 'tasks' && <TaskBoard isAdmin={isAdmin} canEdit={canEdit} employees={employees} onOpenLead={openLeadDetail} manage />}

      {tab === 'collections' && <CollectionsPanel isAdmin={isAdmin} employees={employees} onOpenLead={openLeadDetail} />}

      {tab === 'dashboard' && <DashboardPanel isAdmin={isAdmin} employees={employees} go={setTab} />}

      {tab === 'today' && <TodayPanel isAdmin={isAdmin} employees={employees} onOpenLead={openLeadDetail} />}
      {tab === 'callAnalytics' && <CallAnalyticsPanel isAdmin={isAdmin} employees={employees} />}
      {tab === 'batches' && isAdmin && <BatchesPanel />}
      {tab === 'leadControl' && isAdmin && <LeadControlPanel onOpenLead={openLeadDetail} />}
      {tab === 'transcripts' && <TranscriptsPanel onOpenLead={openLeadDetail} />}
      {tab === 'config' && isAdmin && <ConfigPanel cfg={cfg} reload={loadConfig} />}
      {tab === 'myBase' && isAdmin && <MyBasePanel employees={employees} onOpenLead={openLeadDetail} />}
      {tab === 'summaries' && isAdmin && <SummariesPanel employees={employees} />}

      {tab === 'activityMonitor' && isAdmin && <ActivityMonitorPanel employees={employees} onOpenLead={openLeadDetail} />}

      {tab === 'leaderboard' && isAdmin && <LeaderboardPanel />}

      {tab === 'targets' && isAdmin && <TargetsPanel employees={employees} />}
      {tab === 'teams' && isAdmin && <TeamsPanel employees={employees} />}

      {tab === 'demoBooked' && !isAdmin && <DemoListPanel status="SCHEDULED" emptyLabel="No demos booked" onOpenLead={openLeadDetail} />}

      {tab === 'demoRescheduled' && !isAdmin && <DemoListPanel status="RESCHEDULED" emptyLabel="No demos rescheduled" onOpenLead={openLeadDetail} />}

      {tab === 'demoConducted' && !isAdmin && <DemoListPanel status="COMPLETED" emptyLabel="No demos conducted yet" onOpenLead={openLeadDetail} />}

      {tab === 'callLog' && <CallLogPanel onOpenLead={openLeadDetail} employees={employees} />}

      {tab === 'devices' && isAdmin && <DevicesPanel employees={employees} />}

      {tab === 'unmatchedCalls' && canEdit && <UnmatchedCallsPanel setGlobalError={setError} />}

      {showAdd && (
        <AddLeadModal
          isAdmin={isAdmin}
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
          isAdmin={isAdmin}
          employees={employees}
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
            await updateLeadStatus(lostReasonLead.id, lostStage, reason);
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
          isAdmin={isAdmin}
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

function AddLeadModal({ employees, saving, setSaving, onClose, onSaved, setError, isAdmin }: ModalProps & { isAdmin: boolean }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', source: '', scoutKey: '', courseInterest: '', city: '', assignedToId: '', notes: '',
  });
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [localError, setLocalError] = useState('');
  const activeSources = CFG.sources.filter((s) => s.active);
  const activeScouts = CFG.scouts.filter((s) => s.active);
  useEffect(() => { api.get('/api/sales/courses').then((r) => setCourses(r.data.data)).catch(() => setCourses([])); }, []);

  const digits = form.phone.replace(/\D/g, '');
  const phoneBad = form.phone.length > 0 && (digits.length < 10 || digits.length > 13);
  const emailBad = form.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const set = (k: keyof typeof form, v: string) => { setForm({ ...form, [k]: v }); setLocalError(''); };

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim()) { setLocalError('Name and phone are required'); return; }
    if (phoneBad) { setLocalError('Enter a valid phone number (10–13 digits)'); return; }
    if (emailBad) { setLocalError('Enter a valid email address'); return; }
    setSaving(true);
    setError('');
    setLocalError('');
    try {
      await api.post('/api/sales/leads', {
        ...form,
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined,
        city: form.city.trim() || undefined,
        assignedToId: form.assignedToId || undefined,
        scoutKey: isAdmin ? (form.scoutKey || undefined) : undefined,
      });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setLocalError(e.response?.data?.message || 'Failed to create lead');
    } finally {
      setSaving(false);
    }
  };

  const inp = 'w-full px-3 py-2 border rounded-lg text-sm';
  const lab = 'text-xs font-medium text-muted-foreground space-y-1 block';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-lg">New lead</h2>
            <p className="text-xs text-muted-foreground">Phone numbers are checked for duplicates automatically.</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        {localError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{localError}</div>}

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={lab}>Name *<input className={inp} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></label>
            <label className={lab}>Phone *<input className={`${inp} ${phoneBad ? 'border-red-400' : ''}`} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" /></label>
            <label className={lab}>Email<input className={`${inp} ${emailBad ? 'border-red-400' : ''}`} value={form.email} onChange={(e) => set('email', e.target.value)} /></label>
            <label className={lab}>City<input className={inp} value={form.city} onChange={(e) => set('city', e.target.value)} /></label>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interest & origin</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={lab}>Course interest
              <select className={inp} value={form.courseInterest} onChange={(e) => set('courseInterest', e.target.value)}>
                <option value="">— Select —</option>
                {courses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </label>
            <label className={lab}>Source
              {activeSources.length ? (
                <select className={inp} value={form.source} onChange={(e) => set('source', e.target.value)}>
                  <option value="">— Select —</option>
                  {activeSources.map((s) => <option key={s.key} value={s.label}>{s.label}</option>)}
                </select>
              ) : <input className={inp} placeholder="e.g. Instagram, Referral" value={form.source} onChange={(e) => set('source', e.target.value)} />}
            </label>
            {isAdmin && (
              <label className={lab}>Lead scout
                <select className={inp} value={form.scoutKey} onChange={(e) => set('scoutKey', e.target.value)}>
                  <option value="">{activeScouts.length ? '— None —' : 'No scouts yet — add them in Config'}</option>
                  {activeScouts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            )}
            <label className={lab}>Assign to
              <select className={inp} value={form.assignedToId} onChange={(e) => set('assignedToId', e.target.value)}>
                <option value="">{isAdmin ? 'My Base (unassigned)' : 'Me'}</option>
                {isAdmin && employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
            </label>
          </div>
        </section>

        <label className={lab}>Notes<textarea className={inp} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></label>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Create lead'}
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

function BulkUploadLeadsModal({ onClose, setError, onSaved, isAdmin, employees }: {
  onClose: () => void; setError: (s: string) => void; onSaved: () => void; isAdmin: boolean; employees: EmployeeLite[];
}) {
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BulkResult[] | null>(null); // dry-run result
  const [results, setResults] = useState<BulkResult[] | null>(null); // real import result
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [defaults, setDefaults] = useState({ source: '', courseInterest: '', assignedToId: '', batchLabel: '', scoutKey: '' });
  const activeSources = CFG.sources.filter((s) => s.active);
  const activeScouts = CFG.scouts.filter((s) => s.active);
  useEffect(() => { api.get('/api/sales/courses').then((r) => setCourses(r.data.data)).catch(() => setCourses([])); }, []);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { name: 'John Doe', phone: '9876543210', email: 'john@example.com', leadStage: 'Followup', leadScout: '', source: 'Instagram', courseInterest: 'Data Analytics', assignedToCode: '', campaign: '', notes: '' },
      { name: 'Jane S', phone: '9876543211', email: '', leadStage: '', leadScout: '', source: 'Referral', courseInterest: 'MERN Stack', assignedToCode: '', campaign: '', notes: '' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    // Sheet 2: the exact values accepted in the Lead Stage / Lead Scout / Source / Assigned columns.
    const stages = CFG.stages.filter((x) => x.active).map((x) => x.label);
    const scouts = CFG.scouts.filter((x) => x.active).map((x) => x.label);
    const sources = CFG.sources.filter((x) => x.active).map((x) => x.label);
    const people = employees.map((e) => `${e.firstName} ${e.lastName}`.trim());
    const n = Math.max(stages.length, scouts.length, sources.length, people.length);
    const rows = Array.from({ length: n }, (_, i) => ({ 'Lead Stage': stages[i] || '', 'Lead Scout': scouts[i] || '', Source: sources[i] || '', 'Assigned (employee name)': people[i] || '' }));
    const ws2 = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Lead Stage': '', 'Lead Scout': '', Source: '', 'Assigned (employee name)': '' }]);
    ws2['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Lists');
    XLSX.writeFile(wb, 'lead_bulk_upload_template.xlsx');
  };

  const onFile = (file: File) => {
    setFileName(file.name); setResults(null); setPreview(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        setRows(XLSX.utils.sheet_to_json<BulkRow>(wb.Sheets[wb.SheetNames[0]], { defval: '' }));
      } catch { setError('Could not parse the file. Please use the template format.'); }
    };
    reader.readAsBinaryString(file);
  };

  const payload = (validateOnly: boolean) => ({
    leads: rows,
    validateOnly,
    defaults: {
      source: defaults.source || undefined, courseInterest: defaults.courseInterest || undefined,
      assignedToId: defaults.assignedToId || undefined, batchLabel: defaults.batchLabel.trim() || undefined,
      scoutKey: isAdmin ? (defaults.scoutKey || undefined) : undefined,
    },
  });

  const run = async (validateOnly: boolean) => {
    if (!rows.length) { setError('Choose a file with lead rows first'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post('/api/sales/leads/bulk', payload(validateOnly));
      if (validateOnly) setPreview(res.data.data.results);
      else { setResults(res.data.data.results); onSaved(); }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || (validateOnly ? 'Check failed' : 'Bulk upload failed'));
    } finally { setBusy(false); }
  };

  const shown = results ?? preview;
  const okCount = shown?.filter((r) => r.status === 'created').length ?? 0;
  const badCount = shown ? shown.length - okCount : 0;
  const inp = 'w-full px-2 py-1.5 border rounded-lg text-sm bg-white';
  const lab = 'text-[11px] font-medium text-muted-foreground space-y-1 block';
  const step = results ? 3 : preview ? 2 : 1;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-lg">Bulk upload leads</h2>
            <div className="flex gap-3 mt-1 text-xs">
              {['1 · File & defaults', '2 · Check', '3 · Imported'].map((t, i) => (
                <span key={t} className={step === i + 1 ? 'font-semibold text-blue-700' : 'text-muted-foreground'}>{t}</span>
              ))}
            </div>
          </div>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {!results && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} className="flex-1 min-w-[200px] text-sm border rounded-lg px-3 py-2" />
                <button onClick={downloadTemplate} className="text-xs px-3 py-2 border rounded-lg hover:bg-muted/50 flex items-center gap-1"><Download className="w-3 h-3" /> Template</button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Columns: <code>name, phone, email, leadStage (blank = New Lead), leadScout, source, courseInterest, assignedToCode, campaign, notes</code>. Old-CRM exports (Name, Phone, Status, Assigned, Source, Created, Reminder…) also work as-is.
                Anything you set below fills only the rows that leave that column empty. Phones that already exist are skipped, so re-uploading is safe.
              </p>
              {fileName && <p className="text-xs text-muted-foreground">{fileName} — {rows.length} row{rows.length === 1 ? '' : 's'} read.</p>}

              <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
                <p className="text-xs font-semibold">Defaults for this file</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className={lab}>Source
                    <select className={inp} value={defaults.source} onChange={(e) => { setDefaults({ ...defaults, source: e.target.value }); setPreview(null); }}>
                      <option value="">— From file —</option>
                      {activeSources.map((s) => <option key={s.key} value={s.label}>{s.label}</option>)}
                    </select>
                  </label>
                  <label className={lab}>Course interest
                    <select className={inp} value={defaults.courseInterest} onChange={(e) => { setDefaults({ ...defaults, courseInterest: e.target.value }); setPreview(null); }}>
                      <option value="">— From file —</option>
                      {courses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className={lab}>{isAdmin ? 'Assign all to' : 'Assigned to'}
                    <select className={inp} value={defaults.assignedToId} disabled={!isAdmin} onChange={(e) => { setDefaults({ ...defaults, assignedToId: e.target.value }); setPreview(null); }}>
                      <option value="">{isAdmin ? 'My Base / as in file' : 'Me'}</option>
                      {isAdmin && employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                    </select>
                  </label>
                  <label className={lab}>Batch label (to track this upload)
                    <input className={inp} placeholder="e.g. Instagram Oct-26" value={defaults.batchLabel} onChange={(e) => { setDefaults({ ...defaults, batchLabel: e.target.value }); setPreview(null); }} />
                  </label>
                  {isAdmin && (
                    <label className={lab}>Lead scout
                      <select className={inp} value={defaults.scoutKey} onChange={(e) => { setDefaults({ ...defaults, scoutKey: e.target.value }); setPreview(null); }}>
                        <option value="">{activeScouts.length ? '— None —' : 'No scouts yet — add them in Config'}</option>
                        {activeScouts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </div>

              {rows.length > 0 && !shown && (
                <div className="border rounded-lg max-h-40 overflow-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/40 text-left sticky top-0"><tr>{['Name', 'Phone', 'Source', 'Assigned'].map((h) => <th key={h} className="px-2 py-1">{h}</th>)}</tr></thead>
                    <tbody className="divide-y">
                      {rows.slice(0, 8).map((r, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 whitespace-nowrap">{bulkField(r, 'name') || '—'}</td>
                          <td className="px-2 py-1">{bulkField(r, 'phone', 'phonenumber', 'mobile') || <span className="text-red-500">missing</span>}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{bulkField(r, 'source') || '—'}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{bulkField(r, 'assigned', 'assignedto', 'assignedtocode') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 8 && <p className="text-[10px] text-muted-foreground px-2 py-1">…and {rows.length - 8} more</p>}
                </div>
              )}
            </>
          )}

          {shown && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {results ? (
                  <><span className="text-green-600">{okCount} imported</span>{badCount > 0 && <span className="text-red-600"> · {badCount} skipped</span>}</>
                ) : (
                  <><span className="text-green-600">{okCount} will be imported</span>{badCount > 0 && <span className="text-red-600"> · {badCount} will be skipped</span>} <span className="text-xs text-muted-foreground font-normal">(nothing saved yet)</span></>
                )}
              </p>
              {badCount > 0 && (
                <div className="border rounded-lg max-h-48 overflow-auto divide-y">
                  {shown.filter((r) => r.status === 'error').map((r) => (
                    <div key={r.row} className="px-2 py-1.5 text-xs"><span className="font-medium">Row {r.row}:</span> {r.message}</div>
                  ))}
                </div>
              )}
              {shown.some((r) => r.status === 'created' && r.message) && (
                <div>
                  <p className="text-xs text-amber-700 font-medium mb-1">Notes:</p>
                  <div className="border rounded-lg max-h-32 overflow-auto divide-y">
                    {shown.filter((r) => r.status === 'created' && r.message).map((r) => (
                      <div key={r.row} className="px-2 py-1.5 text-xs text-amber-700"><span className="font-medium">Row {r.row}:</span> {r.message}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">{results ? 'Close' : 'Cancel'}</button>
          {!results && !preview && (
            <button onClick={() => run(true)} disabled={busy || !rows.length} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{busy ? 'Checking…' : 'Check file'}</button>
          )}
          {!results && preview && (
            <>
              <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm rounded-lg border">Back</button>
              <button onClick={() => run(false)} disabled={busy || okCount === 0} className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white disabled:opacity-50">{busy ? 'Importing…' : `Import ${okCount} lead${okCount === 1 ? '' : 's'}`}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LostReasonModal({ lead, saving, setSaving, onClose, onConfirm }: {
  lead: Lead; saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

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
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Select a reason...</option>
          {lostReasonsLive().map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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
function LeadDetailModal({ lead, employees, canEdit, isAdmin, onClose, onChanged, setGlobalError }: {
  lead: Lead; employees: EmployeeLite[]; canEdit: boolean; isAdmin: boolean; onClose: () => void; onChanged: () => void; setGlobalError: (s: string) => void;
}) {
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [demos, setDemos] = useState<DemoLite[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [localError, setLocalError] = useState('');

  const [leadTab, setLeadTab] = useState<LeadTab>('activity');
  const [onboarding, setOnboarding] = useState<OnboardingInfo | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const loadOnboarding = useCallback(() => {
    api.get(`/api/sales/leads/${lead.id}/onboarding`).then((r) => setOnboarding(r.data.data || null)).catch(() => setOnboarding(null));
  }, [lead.id]);
  useEffect(() => { loadOnboarding(); }, [loadOnboarding]);
  const [history, setHistory] = useState<LeadHistoryRow[]>([]);
  const [leadNotes, setLeadNotes] = useState<{ id: string; body: string; createdAt: string; author?: EmployeeLite | null }[]>([]);
  const [leadTasks, setLeadTasks] = useState<TaskRow[]>([]);
  const [noteText, setNoteText] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profile, setProfile] = useState({
    name: lead.name, phone: lead.phone, email: lead.email || '', source: lead.source || '', scoutKey: lead.scoutKey || '', courseInterest: lead.courseInterest || '',
    city: lead.city || '', educationQualification: lead.educationQualification || '', collegeName: lead.collegeName || '',
    passedOutYear: lead.passedOutYear ? String(lead.passedOutYear) : '', currentStatus: lead.currentStatus || '',
  });
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [callNotes, setCallNotes] = useState('');
  const [callFollowUp, setCallFollowUp] = useState(''); // datetime-local value (date AND time)
  const [callActivityType, setCallActivityType] = useState<ActivityType>('CALL');
  const [callActivityStatus, setCallActivityStatus] = useState<ActivityStatus | ''>('');
  const [callStage, setCallStage] = useState(''); // optional manual stage override
  const [callCourse, setCallCourse] = useState(lead.courseInterest || '');
  const [callLostReason, setCallLostReason] = useState('');
  // Which tracked call this update is about ('__auto__' = not chosen yet → newest recent call, if any).
  const [callPick, setCallPick] = useState('__auto__');
  const [savingCall, setSavingCall] = useState(false);
  const [msgChannel, setMsgChannel] = useState<'WHATSAPP' | 'EMAIL' | null>(null);

  // Demo booking happens inside Log Activity (status = Demo booked).
  const [demoMode, setDemoMode] = useState<DemoMode>('ONLINE');
  const [demoConductedBy, setDemoConductedBy] = useState(lead.assignedTo?.id || '');
  const [demoEmail, setDemoEmail] = useState(lead.email || '');

  const [actingDemo, setActingDemo] = useState<{ id: string; type: 'complete' | 'reschedule' | 'noshow' | 'cancel' | 'outcome' } | null>(null);
  const [actionFeedback, setActionFeedback] = useState('');
  const [actionConductedById, setActionConductedById] = useState('');
  const [actionNewScheduledAt, setActionNewScheduledAt] = useState('');
  const [actionNewMode, setActionNewMode] = useState<DemoMode>('ONLINE');
  const [actionRescheduleReason, setActionRescheduleReason] = useState('');
  // Mark Conducted specifics.
  const [actionOutcome, setActionOutcome] = useState<DemoOutcome | ''>('');
  const [actionFollowUp, setActionFollowUp] = useState('');
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

  // Real calls from the call log that have no update attached yet (last 3 days), newest first.
  const linkableCalls = useMemo(() => callLogs
    .filter((c) => c.source === 'AUTO' && !c.activityStatus && c.direction !== 'MISSED' && Date.now() - new Date(c.calledAt).getTime() < 3 * 86400000)
    .sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime()), [callLogs]);
  const effectiveCallPick = callPick === '__auto__'
    ? (linkableCalls[0] && Date.now() - new Date(linkableCalls[0].calledAt).getTime() < 24 * 3600000 ? linkableCalls[0].id : '')
    : callPick;
  const pickedCall = linkableCalls.find((c) => c.id === effectiveCallPick) || null;

  // Calls/meetings + every status/stage change (and status-only updates), newest first.
  const timeline = useMemo(() => {
    const items: { key: string; at: number; call?: CallLog; h?: LeadHistoryRow }[] = [];
    callLogs.forEach((c) => items.push({ key: `c-${c.id}`, at: new Date(c.calledAt).getTime(), call: c }));
    history.filter((h) => h.type === 'STATUS' || h.type === 'STAGE' || (h.type === 'ACTIVITY' && h.summary.startsWith('Status updated (no call)')))
      .forEach((h) => items.push({ key: `h-${h.id}`, at: new Date(h.createdAt).getTime(), h }));
    return items.sort((a, b) => b.at - a.at);
  }, [callLogs, history]);

  const submitCall = async () => {
    if (!callActivityStatus) { setLocalError('Choose the Update Status first'); return; }
    // DNP (did not pick) needs no notes; every other status does.
    if (notesNeeded(callActivityStatus) && !callNotes.trim()) { setLocalError('Notes are required for this status'); return; }
    if (needsFollowUp(callActivityStatus) && !callFollowUp) { setLocalError('Pick the follow-up date and time'); return; }
    if (statusBase(callActivityStatus) === 'DEMO_BOOKED' && !callCourse.trim()) { setLocalError('Select the course for the demo'); return; }
    if (statusBase(callActivityStatus) === 'DEMO_BOOKED' && demoMode === 'ONLINE' && !/^\S+@\S+\.\S+$/.test(demoEmail.trim())) { setLocalError('Enter the student\'s email — the online demo link is sent there'); return; }
    setSavingCall(true);
    setLocalError('');
    try {
      // Demo booked: the date & time chosen above is the demo slot — book it first so a
      // failure (e.g. bad email) doesn't leave an activity logged without its demo.
      if (statusBase(callActivityStatus) === 'DEMO_BOOKED') {
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
        nextFollowUpAt: needsFollowUp(callActivityStatus) ? new Date(callFollowUp).toISOString() : undefined,
        status: callStage || undefined,
        courseInterest: callCourse.trim() || undefined,
        lostReason: statusNeedsLostReason(callActivityStatus) ? (callLostReason || undefined) : undefined,
        callLogId: callActivityType === 'CALL' ? (effectiveCallPick || undefined) : undefined,
      });
      setCallPick('__auto__');
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
      const { scoutKey: _scout, ...profileRest } = profile; // Lead Scout is admin-only
      await api.put(`/api/sales/leads/${lead.id}`, { ...profileRest, ...(isAdmin ? { scoutKey: _scout } : {}), name: profile.name.trim(), phone: profile.phone.trim() });
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

  const [stageSaving, setStageSaving] = useState(false);
  const changeStage = async (key: string) => {
    setStageSaving(true);
    try { await api.put(`/api/sales/leads/${lead.id}`, (STATUSES as string[]).includes(key) ? { status: key } : { stageKey: key }); onChanged(); }
    catch (err: unknown) { setGlobalError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to change stage'); }
    finally { setStageSaving(false); }
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
    setActionOutcome(''); setActionProofFile(null); setActionFollowUp('');
  };

  const submitAction = async () => {
    if (!actingDemo) return;
    const existingDemo = demos.find((d) => d.id === actingDemo.id);
    if ((actingDemo.type === 'outcome' || actingDemo.type === 'complete') && actionOutcome && actionOutcome !== 'NOT_INTERESTED' && !actionFollowUp) {
      setLocalError('Pick the next follow-up date and time'); return;
    }
    if (actingDemo.type === 'outcome') {
      if (!actionOutcome) { setLocalError('Pick the lead stage'); return; }
    }
    if (actingDemo.type === 'complete') {
      if (!actionOutcome) { setLocalError('Pick an outcome before marking this demo Conducted'); return; }
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
        if (actionFollowUp) fd.append('followUpAt', new Date(actionFollowUp).toISOString());
        if (actionConductedById) fd.append('conductedById', actionConductedById);
        if (actionProofFile) fd.append('proof', actionProofFile);
        await api.put(`/api/sales/demos/${actingDemo.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else if (actingDemo.type === 'outcome') {
        await api.put(`/api/sales/demos/${actingDemo.id}`, { outcome: actionOutcome, followUpAt: actionFollowUp ? new Date(actionFollowUp).toISOString() : undefined, feedback: actionFeedback || undefined });
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

  const demoActions = (d: DemoLite) => (
    <div className="space-y-1">
      {canEdit && d.status === 'COMPLETED' && !d.outcome && actingDemo?.id !== d.id && (
        <button onClick={() => setActingDemo({ id: d.id, type: 'outcome' })} className="text-xs font-medium text-green-600 hover:underline">Add outcome</button>
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
                <DateTimeField value={actionNewScheduledAt} onChange={setActionNewScheduledAt} min={new Date()} placeholder="New date & time" />
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
          ) : actingDemo.type === 'complete' || actingDemo.type === 'outcome' ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <select className="px-2 py-1 border rounded-lg text-xs" value={actionOutcome} onChange={(e) => setActionOutcome(e.target.value as DemoOutcome)}>
                  <option value="">Update lead stage *</option>
                  {DEMO_OUTCOMES.map((o) => <option key={o} value={o}>{DEMO_STAGE_PICK[o]}</option>)}
                </select>
                {employees.length > 0 && (
                  <select className="px-2 py-1 border rounded-lg text-xs" value={actionConductedById} onChange={(e) => setActionConductedById(e.target.value)}>
                    <option value="">Conducted by...</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                  </select>
                )}
              </div>
              {actionOutcome && (
                <div className="text-xs rounded-lg bg-blue-50 text-blue-800 px-2 py-1.5">
                  {OUTCOME_EFFECT[actionOutcome].text}.
                  {actionOutcome !== 'NOT_INTERESTED' && (
                    <span className="ml-2 inline-flex items-center gap-1 text-foreground">Next follow-up *
                      <DateTimeField value={actionFollowUp} onChange={setActionFollowUp} min={new Date()} placeholder="Pick date & time" />
                    </span>
                  )}
                </div>
              )}
              {actingDemo.type === 'complete' && !(d.mode === 'ONLINE' && d.roomName && d.startedAt) && (
                <label className="text-xs text-muted-foreground flex items-center gap-2">
                  Proof of demo (optional){d.proofUrl ? ' — already attached, pick a file to replace it' : ''}:
                  <input type="file" accept="image/*" className="text-xs" onChange={(e) => setActionProofFile(e.target.files?.[0] || null)} />
                </label>
              )}
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
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-7 space-y-6 text-base [&_.text-xs]:!text-[14px] [&_.text-sm]:!text-[16px] [&_.text-\[11px\]]:!text-[13px] [&_.text-\[10px\]]:!text-[12px]">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-xl truncate">{lead.name}</h2>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${stageChipClass(lead.stageKey || lead.status)}`}>{stageLabel(lead.stageKey || lead.status)}</span>
                {lead.status === 'LOST' && lead.lostReason && <span className="text-xs text-muted-foreground">({LOST_REASON_LABEL[lead.lostReason]})</span>}
                {(lead.dnpCount ?? 0) > 0 && lead.status !== 'LOST' && <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${(lead.dnpCount ?? 0) >= 4 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>DNP ×{lead.dnpCount} · {5 - (lead.dnpCount ?? 0)} more → Unresponsive</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {lead.phone}</span>
                {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {lead.email}</span>}
                {lead.source && <span>Source: {lead.source}</span>}
                {lead.createdBy && <span>Created by: {lead.createdBy.name}</span>}
                {lead.courseInterest && <span>Course: {lead.courseInterest}</span>}
                <span>Age: {leadAgeLabel(lead.createdAt)}</span>
                {!isAdmin && lead.assignedTo && <span>Owner: {lead.assignedTo.firstName} {lead.assignedTo.lastName}</span>}
              </div>
            </div>
            <div className="flex items-start gap-3 shrink-0">
              {onboarding ? (
                <button onClick={() => setLeadTab('fees')} className="px-3 py-1.5 text-sm rounded-lg bg-green-100 text-green-700 font-medium">Onboarded ✓</button>
              ) : canEdit && lead.status !== 'LOST' ? (
                <button onClick={() => setShowOnboard(true)} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">Onboarding</button>
              ) : null}
              <button onClick={onClose}><X className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a href={`tel:${lead.phone.replace(/\s+/g, '')}`} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-muted/50"><Phone className="w-3.5 h-3.5" /> Call</a>
            {canEdit && <button onClick={() => setMsgChannel('WHATSAPP')} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-green-700 border-green-300 hover:bg-green-50"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</button>}
            {canEdit && <button onClick={() => setMsgChannel('EMAIL')} disabled={!lead.email} title={lead.email ? '' : 'No email on this lead'} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-muted/50 disabled:opacity-40"><Mail className="w-3.5 h-3.5" /> Email</button>}
            {isAdmin && (
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">Owner
                <select value={lead.assignedTo?.id || ''} disabled={reassignSaving} onChange={(e) => reassign(e.target.value)} className="text-sm px-2 py-1 border rounded-lg text-foreground">
                  <option value="">Unassigned (My Base)</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
        {msgChannel && (
          <SendMessageModal
            lead={lead} channel={msgChannel} onClose={() => setMsgChannel(null)}
            onSent={async () => { try { const h = await api.get(`/api/sales/leads/${lead.id}/history`); setHistory(h.data.data); } catch { /* history refreshes on next open */ } }}
          />
        )}


        {localError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{localError}</div>}

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 border-b -mt-2">
          {([
            ['profile', 'Profile'], ['activity', 'Activity'], ['tasks', 'Tasks / Reminders'],
            ['demo', `Meeting / Demo${demos.length ? ` (${demos.length})` : ''}`], ['notes', 'Notes'], ['history', 'History'],
            ...(onboarding ? [['fees', 'Fees']] : []),
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
                  {isAdmin && <label className="text-xs text-muted-foreground space-y-1 block">
                    Lead Scout
                    <select className="w-full px-3 py-2 border rounded-lg text-sm text-foreground" value={profile.scoutKey} onChange={(e) => setProfile({ ...profile, scoutKey: e.target.value })}>
                      <option value="">— None —</option>
                      {CFG.scouts.filter((s) => s.active || s.key === profile.scoutKey).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </label>}
                </div>
                <div className="flex justify-end">
                  <button onClick={saveProfile} disabled={savingProfile} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{savingProfile ? 'Saving...' : 'Save changes'}</button>
                </div>
              </>
            )}
            {!canEdit && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(profile).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k === 'scoutKey' ? 'Lead Scout' : k}</dt><dd>{(k === 'scoutKey' ? scoutLabel(v) : v) || '—'}</dd></div>)}
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
                  <DateTimeField value={taskDue} onChange={setTaskDue} placeholder="Due date & time" />
                  <button onClick={addLeadTask} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Add task</button>
                </div>
              </div>
            )}
            {leadTasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks on this lead.</p> : (
              <div className="space-y-4">
                {([
                  ['Overdue', 'text-red-600', leadTasks.filter((t) => t.status === 'OPEN' && t.dueAt && new Date(t.dueAt).getTime() < Date.now())],
                  ['Pending', 'text-foreground', leadTasks.filter((t) => t.status === 'OPEN' && !(t.dueAt && new Date(t.dueAt).getTime() < Date.now()))],
                  ['Completed', 'text-green-700', leadTasks.filter((t) => t.status === 'DONE' || t.status === 'CANCELLED')],
                ] as [string, string, typeof leadTasks][]).map(([label, cls, list]) => (
                  <div key={label} className="space-y-1.5">
                    <h4 className={`text-sm font-semibold ${cls}`}>{label} ({list.length})</h4>
                    {list.length === 0 ? <p className="text-xs text-muted-foreground">Nothing here</p> : (
              <div className="border rounded-xl divide-y">
                {list.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{t.title}</span>
                      <p className="text-xs text-muted-foreground">{t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : ''}{t.dueAt ? ` · due ${formatDateTime(t.dueAt)}` : ''}</p>
                    </div>
                    {t.status === 'DONE' && <span className="text-xs font-medium text-green-700 bg-green-50 rounded-full px-2.5 py-1 whitespace-nowrap">✓ Completed{t.completedAt ? ` · ${formatDateTime(t.completedAt)}` : ''}</span>}
                    {t.status === 'CANCELLED' && <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">Cancelled</span>}
                    {canEdit && t.status === 'OPEN' && <button onClick={() => finishLeadTask(t.id)} className="text-xs font-medium text-green-600 hover:underline">Done</button>}
                  </div>
                ))}
              </div>
                    )}
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

        {/* Log activity */}
        {leadTab === 'activity' && canEdit && (
          <div className="border rounded-xl p-4 space-y-4 bg-muted/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-sm flex items-center gap-2"><PhoneCall className="w-4 h-4" /> Log activity</h3>
              <div className="inline-flex rounded-lg border bg-white overflow-hidden text-xs">
                {([['CALL', 'Call update'], ['MEETING', 'Meeting / visit']] as [ActivityType, string][]).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setCallActivityType(v)} className={`px-3 py-1.5 ${callActivityType === v ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>{l}</button>
                ))}
              </div>
            </div>

            {/* Step 1: status */}
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_STATUSES_LIVE().map((s) => (
                <button key={s.value} type="button" onClick={() => { setCallActivityStatus(s.value as ActivityStatus); setCallStage(''); }}
                  className={`px-3 py-1.5 rounded-full text-xs border ${callActivityStatus === s.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-muted'}`}>{s.label}</button>
              ))}
            </div>

            {callActivityStatus && (
              <div className="space-y-3">
                {/* Which call is this about? Duration + recording always come from the call log. */}
                {callActivityType === 'CALL' && linkableCalls.length > 0 && (
                  <div className="rounded-lg border bg-white p-3 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Which call is this about?</label>
                    <select className="w-full px-2 py-1.5 border rounded-lg text-sm" value={effectiveCallPick} onChange={(e) => setCallPick(e.target.value)}>
                      {linkableCalls.map((c) => (
                        <option key={c.id} value={c.id}>{formatDateTime(c.calledAt)} · {callDirLabel(c.direction)} · {callDurLabel(c.durationSeconds)}{c.recordingUrl ? ' · recorded' : ''}</option>
                      ))}
                      <option value="">No call — only updating the status</option>
                    </select>
                    {pickedCall ? (
                      <p className="text-xs text-green-700">You spoke for <b>{callDurLabel(pickedCall.durationSeconds)}</b> — taken from the call log, nothing to type.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No call selected: the lead and its history update, but nothing is added to the Call Log.</p>
                    )}
                  </div>
                )}

                {statusBase(callActivityStatus) === 'DNP' && (
                  <p className={`text-xs rounded-lg px-3 py-2 ${(lead.dnpCount ?? 0) >= 3 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                    This will be DNP <b>{(lead.dnpCount ?? 0) + 1}</b> of 5 in a row{(lead.dnpCount ?? 0) + 1 >= 5 ? ' — the lead will be marked Unresponsive.' : '. At 5 the lead becomes Unresponsive automatically.'}
                  </p>
                )}

                {needsFollowUp(callActivityStatus) && (
                  <label className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                    {statusBase(callActivityStatus) === 'DEMO_BOOKED' ? 'Demo date & time *' : 'Follow-up date & time *'}
                    <DateTimeField value={callFollowUp} onChange={setCallFollowUp} min={new Date()} placeholder="Pick date & time" />
                    {statusBase(callActivityStatus) !== 'DEMO_BOOKED' && <span className="text-[11px]">Becomes a task in My Reminders.</span>}
                  </label>
                )}

                {statusBase(callActivityStatus) === 'DEMO_BOOKED' && (
                  <div className="border rounded-lg p-3 space-y-2 bg-white">
                    <p className="text-xs font-medium text-muted-foreground">Demo details</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select className="px-2 py-1.5 border rounded-lg text-sm sm:col-span-2" value={callCourse} onChange={(e) => setCallCourse(e.target.value)}>
                        <option value="">Course for the demo *</option>
                        {callCourse && !courses.some((c) => c.name === callCourse) && <option value={callCourse}>{callCourse}</option>}
                        {courses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                      <select className="px-2 py-1.5 border rounded-lg text-sm" value={demoMode} onChange={(e) => setDemoMode(e.target.value as DemoMode)}>
                        {DEMO_MODES.map((m) => <option key={m} value={m}>{DEMO_MODE_LABEL[m]} demo</option>)}
                      </select>
                      <select className="px-2 py-1.5 border rounded-lg text-sm" value={demoConductedBy} onChange={(e) => setDemoConductedBy(e.target.value)}>
                        <option value="">Conducted by…</option>
                        {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                      </select>
                      {demoMode === 'ONLINE' && (
                        <input type="email" className="px-2 py-1.5 border rounded-lg text-sm sm:col-span-2" placeholder="Student email * (the online demo link is sent here)" value={demoEmail} onChange={(e) => setDemoEmail(e.target.value)} />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {demoMode === 'ONLINE' ? 'Online demos run inside the portal for up to 2 hours; Sales Admin is emailed and can watch live. ' : ''}
                      The student and you both get a reminder 10 minutes before. {!lead.city && !lead.collegeName && <>Student details live in the <button type="button" onClick={() => setLeadTab('profile')} className="text-blue-600 underline">Profile</button> tab.</>}
                    </p>
                  </div>
                )}

                {statusNeedsLostReason(callActivityStatus) && (
                  <select className="px-2 py-1.5 border rounded-lg text-sm bg-white" value={callLostReason} onChange={(e) => setCallLostReason(e.target.value)}>
                    <option value="">Reason (optional)…</option>
                    {lostReasonsLive().filter((r) => r.base !== 'NOT_INTERESTED').map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                )}

                {notesNeeded(callActivityStatus) ? (
                  <textarea className="w-full px-3 py-2 border rounded-lg text-sm bg-white" rows={2} value={callNotes} onChange={(e) => setCallNotes(e.target.value)}
                    placeholder={callActivityType === 'MEETING' ? 'What was discussed in the meeting? *' : 'What was discussed? *'} />
                ) : (
                  <p className="text-xs text-muted-foreground italic">No notes needed for this status.</p>
                )}

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">Update lead stage
                    <select className="px-2 py-2 border rounded-lg text-sm bg-white text-foreground min-w-[190px]" value={callStage} onChange={(e) => setCallStage(e.target.value)} disabled={statusGoesToLost(callActivityStatus)}>
                      <option value="">Auto → {statusStageLabel(callActivityStatus)}</option>
                      {!statusGoesToLost(callActivityStatus) && stageOptionsLive().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <button onClick={submitCall} disabled={savingCall} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
                    {savingCall ? 'Saving…' : 'Save update'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Demos waiting for the sales team to complete them */}
        {leadTab === 'activity' && canEdit && demos.filter((d) => d.status === 'SCHEDULED' || (d.status === 'COMPLETED' && !d.outcome)).map((d) => (
          <div key={d.id} className="border border-amber-300 bg-amber-50/60 rounded-xl p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Video className="w-4 h-4" /> {d.status === 'SCHEDULED' ? 'Demo to complete' : 'Demo outcome pending'}</h3>
              <span className="text-xs text-muted-foreground">{formatDateTime(d.scheduledAt)} · {DEMO_MODE_LABEL[d.mode]}</span>
            </div>
            {demoActions(d)}
          </div>
        ))}

        {/* Activity history: calls/meetings plus every status / stage change, each with who made it */}
        {leadTab === 'activity' && <div>
          <h3 className="font-semibold text-sm mb-2">Activity History {timeline.length ? `(${timeline.length})` : ''}</h3>
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity logged yet.</p>
          ) : (
            <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
              {timeline.map((it) => it.call ? (() => { const c = it.call; return (
                <div key={it.key} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      <b className="text-foreground">{c.calledBy ? `${c.calledBy.firstName} ${c.calledBy.lastName}` : 'Unknown'}</b>
                      {' · '}{c.activityType === 'MEETING' ? 'Meeting' : 'Call'}
                      {c.durationSeconds != null && c.source === 'AUTO' && <span> · {callDurLabel(c.durationSeconds)}</span>}
                      {c.activityStatus && <span className="ml-1 font-medium text-foreground">· {ACTIVITY_STATUS_LABEL[c.activityStatus]}</span>}
                    </span>
                    <span>{formatDateTime(c.calledAt)}</span>
                  </div>
                  {c.notes ? <p>{c.notes}</p> : <p className="text-xs text-muted-foreground italic">No notes</p>}
                  {c.recordingUrl && <div className="mt-2 flex flex-wrap items-center gap-4"><RecordingPlayer url={c.recordingUrl} /><TranscriptButton type="CALL" id={c.id} /></div>}
                  {c.nextFollowUpAt && <p className="text-xs text-amber-600 mt-1">Next follow-up: {formatDateTime(c.nextFollowUpAt)}</p>}
                </div>
              ); })() : (
                <div key={it.key} className="border border-dashed rounded-lg px-3 py-2 text-sm bg-muted/20">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span><b className="text-foreground">{it.h!.actor ? `${it.h!.actor.firstName} ${it.h!.actor.lastName}` : 'System'}</b> · {it.h!.type === 'STAGE' ? 'Stage change' : it.h!.type === 'STATUS' ? 'Status change' : 'Status update (no call)'}</span>
                    <span>{formatDateTime(it.h!.createdAt)}</span>
                  </div>
                  <p className="mt-0.5">{it.h!.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>}

        {leadTab === 'fees' && onboarding && <LeadFeesPanel leadId={lead.id} onboarding={onboarding} canEdit={canEdit} isAdmin={isAdmin} onChanged={() => { onChanged(); loadOnboarding(); }} />}
        {showOnboard && <OnboardingModal leadId={lead.id} leadName={lead.name} defaultCourse={lead.courseInterest} onClose={() => setShowOnboard(false)} onDone={() => { setShowOnboard(false); loadOnboarding(); setLeadTab('fees'); onChanged(); }} />}

        {/* Full lead history — from creation, never edited */}
        {leadTab === 'history' && <div>
          <h3 className="font-semibold text-sm mb-2">Lead History</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <ol className="relative border-l pl-4 space-y-3 max-h-[28rem] overflow-y-auto pr-1">
              {history.map((h) => (
                <li key={h.id} className="text-xs">
                  <span className="absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <p className="text-foreground">{h.summary}</p>
                  <p className="text-muted-foreground">by <b className="text-foreground">{h.actor ? `${h.actor.firstName} ${h.actor.lastName}` : 'System (automatic)'}</b> · {formatDateTime(h.createdAt)}</p>
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
                  {(d.status === 'SCHEDULED' || d.status === 'COMPLETED') && <ReleaseFeedbackButton demoId={d.id} />}
                  {d.mode === 'ONLINE' && d.roomName && d.status === 'SCHEDULED' && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {d.closedAt ? (
                        <>
                          <span className="text-red-600 font-medium">Room closed (2 hours over)</span>
                          {d.reopenRequestedAt
                            ? <span className="text-amber-600">Reopen request waiting for Sales Admin</span>
                            : <a href={`/sales-demo/${d.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">Request reopen</a>}
                        </>
                      ) : (
                        <a href={`/sales-demo/${d.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 text-white font-medium">
                          <Video className="w-3 h-3" /> {d.startedAt ? 'Rejoin demo room' : 'Start demo room'}
                        </a>
                      )}
                      {d.accessCode && <DemoShare code={d.accessCode} leadName={lead.name} phone={lead.phone} when={d.scheduledAt} course={d.courseEnquired || ''} />}
                    </div>
                  )}
                  {d.mode === 'ONLINE' && d.roomName && d.startedAt && <div><TranscriptButton type="DEMO" id={d.id} label="Demo transcript" /></div>}
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

                </div>
              );})}
            </div>
          )}
        </div>}
      </div>
    </div>
  );
}

// ── Tasks & reminders: Overdue / Pending / Completed. Salespeople see their own; Sales Admin can switch to anyone or the whole team. ──
type DatePreset = 'any' | 'today' | 'week' | 'month' | 'custom';
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function presetDates(p: DatePreset): { from: string; to: string } {
  const now = new Date();
  if (p === 'today') return { from: ymd(now), to: ymd(now) };
  if (p === 'week') { const s = new Date(now); s.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const e = new Date(s); e.setDate(s.getDate() + 6); return { from: ymd(s), to: ymd(e) }; }
  if (p === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  return { from: '', to: '' };
}
function TaskBoard({ isAdmin, canEdit, employees, onOpenLead, manage }: { isAdmin: boolean; canEdit: boolean; employees: EmployeeLite[]; onOpenLead: (id: string) => void; manage: boolean }) {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [who, setWho] = useState<string>(isAdmin && manage ? '' : 'ME'); // '' = whole team, 'ME' = me, else an employee id
  const [preset, setPreset] = useState<DatePreset>('any');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [showDone, setShowDone] = useState(true);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);
  const range = preset === 'custom' ? { from: cFrom, to: cTo } : presetDates(preset);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = { limit: '300' };
      if (isAdmin && who) params.assignedToId = who;
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      setRows((await api.get('/api/sales/tasks', { params })).data.data);
    } catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load tasks'); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, who, range.from, range.to]);
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

  const now = Date.now();
  const at = (t: TaskRow) => (t.dueAt ? new Date(t.dueAt).getTime() : Infinity);
  const overdue = rows.filter((t) => t.status === 'OPEN' && t.dueAt && at(t) < now).sort((a, b) => at(a) - at(b));
  const pending = rows.filter((t) => t.status === 'OPEN' && !(t.dueAt && at(t) < now)).sort((a, b) => at(a) - at(b));
  const completed = rows.filter((t) => t.status === 'DONE').sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  const showOwner = isAdmin && who !== 'ME';

  const row = (t: TaskRow, tone: 'overdue' | 'pending' | 'done') => (
    <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        {t.kind && t.kind !== 'MANUAL' && <span className={`mr-2 text-[10px] font-semibold rounded-full px-2 py-0.5 ${t.kind === 'DEMO' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{t.kind === 'DEMO' ? 'Demo' : 'Follow-up'}</span>}
        <span className="font-medium">{t.title}</span>
        {t.lead && <button onClick={() => onOpenLead(t.lead!.id)} className="text-xs text-blue-600 hover:underline ml-2">{t.lead.name}</button>}
        {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
        <p className="text-xs text-muted-foreground">
          {showOwner && t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : ''}
          {showOwner && t.assignedTo && t.createdBy ? ' · ' : ''}
          {t.createdBy && (!t.assignedTo || t.createdBy.id !== t.assignedTo.id) ? `from ${t.createdBy.firstName} ${t.createdBy.lastName}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3 whitespace-nowrap">
        {tone === 'done'
          ? <span className="text-xs font-medium text-green-700 bg-green-50 rounded-full px-2.5 py-1">✓ {t.completedAt ? formatDateTime(t.completedAt) : 'Completed'}</span>
          : t.dueAt && <span className={`text-xs ${tone === 'overdue' ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{formatDateTime(t.dueAt)}</span>}
        {canEdit && tone !== 'done' && (<>
          <button onClick={() => setStatus(t.id, 'DONE')} className="text-xs font-medium text-green-600 hover:underline">Done</button>
          <button onClick={() => setStatus(t.id, 'CANCELLED')} className="text-xs text-muted-foreground hover:underline">Cancel</button>
        </>)}
        {canEdit && tone === 'done' && <button onClick={() => setStatus(t.id, 'OPEN')} className="text-xs text-blue-600 hover:underline">Reopen</button>}
      </div>
    </div>
  );
  const section = (label: string, cls: string, list: TaskRow[], tone: 'overdue' | 'pending' | 'done', collapsible = false) => (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-semibold ${cls}`}>{label} ({list.length})</h3>
        {collapsible && <button onClick={() => setShowDone((v) => !v)} className="text-xs text-muted-foreground hover:underline">{showDone ? 'Hide' : 'Show'}</button>}
      </div>
      {(!collapsible || showDone) && (
        <div className="bg-card border rounded-xl divide-y">
          {list.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">{loading ? 'Loading…' : 'Nothing here'}</p> : list.map((t) => row(t, tone))}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {manage && canEdit && (
        <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
          <h3 className="font-semibold text-sm">{isAdmin ? 'Create / assign a task' : 'Add a task for yourself'}</h3>
          <div className="flex flex-wrap gap-2">
            <input className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[220px]" placeholder="Task title *" value={title} onChange={(e) => setTitle(e.target.value)} />
            <DateTimeField value={due} onChange={setDue} placeholder="Due date & time" />
            {isAdmin && (
              <select className="px-2 py-2 border rounded-lg text-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Assign to me</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
            )}
            <button onClick={add} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Add task'}</button>
          </div>
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Details (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && (
          <select value={who} onChange={(e) => setWho(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-background">
            <option value="ME">My own</option>
            <option value="">Whole sales team</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </select>
        )}
        <div className="inline-flex rounded-lg border bg-white overflow-hidden text-xs">
          {([['any', 'Any date'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['custom', 'Custom']] as [DatePreset, string][]).map(([v, l]) => (
            <button key={v} onClick={() => setPreset(v)} className={`px-3 py-2 ${preset === v ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>{l}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" /> –
            <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" />
          </span>
        )}
        <button onClick={load} disabled={loading} className="ml-auto flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-muted/50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Overdue and Pending are filtered by due date; Completed by the day it was finished{preset === 'any' ? ' (last 14 days)' : ''}. Follow-ups and booked demos appear here automatically.</p>

      {section('Overdue', 'text-red-600', overdue, 'overdue')}
      {section('Pending', 'text-foreground', pending, 'pending')}
      {section('Completed', 'text-green-700', completed, 'done', true)}
    </div>
  );
}

// ── My Reminders: follow-ups due + open tasks, grouped by urgency ────────────
interface TaskRow {
  id: string; title: string; description?: string | null; dueAt?: string | null; status: 'OPEN' | 'DONE' | 'CANCELLED';
  completedAt?: string | null; bucket?: string; kind?: 'MANUAL' | 'FOLLOW_UP' | 'DEMO'; demoId?: string | null;
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


// ── Manage Tasks: create tasks (Sales Admin can assign to anyone) ───────────

// ── My Base (Sales Admin): pool of unassigned leads — bulk hand-out and pull-back ──
interface BaseSummary {
  pool: number; sources: { source: string; count: number }[]; batches: { label: string; count: number; lastAssignedAt: string | null }[];
  aging: { label: string; count: number; min: number; max: number | null }[];
  alerts: { staleDays: number; stale: number; neverTouched: number; overdueLeads: number; untouchedWithPeople: number };
  people: { employeeId: string; name: string; open: number; overdue: number; untouched: number }[];
  scouts: { scoutKey: string | null; count: number }[]; cities: { city: string; count: number }[]; courses: { course: string; count: number }[];
}
interface BaseView { id: string; name: string; tree: Record<string, string>; mine?: boolean; shared?: boolean }
type PoolRow = Lead & { city?: string | null; lastContactAt?: string | null; _count?: { callLogs: number } };
function MyBasePanel({ employees, onOpenLead }: { employees: EmployeeLite[]; onOpenLead: (id: string) => void }) {
  const monthLabel = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [summary, setSummary] = useState<BaseSummary | null>(null);
  const [scout, setScout] = useState('');
  const [course, setCourse] = useState('');
  const [city, setCity] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [untouched, setUntouched] = useState('');
  const [sort, setSort] = useState<'oldest' | 'newest'>('oldest');
  const [views, setViews] = useState<BaseView[]>([]);
  const [viewName, setViewName] = useState('');
  const [showPeople, setShowPeople] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState(`${monthLabel} batch`);
  const [showHistory, setShowHistory] = useState(false);
  const [pullFrom, setPullFrom] = useState('');
  const [pullStage, setPullStage] = useState('');
  const [pullStatus, setPullStatus] = useState('');
  const [pullCount, setPullCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const errOf = (err: unknown, fb: string) => (err as { response?: { data?: { message?: string } } }).response?.data?.message || fb;

  const criteria = useCallback(() => ({
    search: search || undefined, source: source ? source.split(',') : undefined, createdFrom: from || undefined, createdTo: to || undefined,
    scoutKey: scout ? scout.split(',') : undefined, course: course ? course.split(',') : undefined, city: city ? city.split(',') : undefined,
    minAgeDays: minAge !== '' ? Number(minAge) : undefined, maxAgeDays: maxAge !== '' ? Number(maxAge) : undefined, untouchedDays: untouched ? Number(untouched) : undefined,
  }), [search, source, from, to, scout, course, city, minAge, maxAge, untouched]);

  const filterState = { search, source, from, to, scout, course, city, minAge, maxAge, untouched, sort };
  const anyFilter = !!(search || source || from || to || scout || course || city || minAge || maxAge || untouched);
  const clearFilters = () => { setSearch(''); setSource(''); setFrom(''); setTo(''); setScout(''); setCourse(''); setCity(''); setMinAge(''); setMaxAge(''); setUntouched(''); };
  const applyView = (t: Record<string, string>) => {
    setSearch(t.search || ''); setSource(t.source || ''); setFrom(t.from || ''); setTo(t.to || ''); setScout(t.scout || ''); setCourse(t.course || '');
    setCity(t.city || ''); setMinAge(t.minAge || ''); setMaxAge(t.maxAge || ''); setUntouched(t.untouched || ''); setSort((t.sort as 'oldest' | 'newest') || 'oldest');
  };
  const loadViews = useCallback(() => { api.get('/api/saved-filters', { params: { scope: 'mybase' } }).then((r) => setViews(r.data.data)).catch(() => setViews([])); }, []);
  useEffect(() => { loadViews(); }, [loadViews]);
  const saveView = async () => {
    if (!viewName.trim()) return;
    const tree: Record<string, string> = {};
    Object.entries(filterState).forEach(([k, v]) => { if (v) tree[k] = String(v); });
    try { await api.post('/api/saved-filters', { scope: 'mybase', name: viewName.trim(), tree }); setViewName(''); loadViews(); }
    catch (err) { setError(errOf(err, 'Could not save the view')); }
  };
  const delView = async (id: string) => { await api.delete(`/api/saved-filters/${id}`).catch(() => {}); loadViews(); };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = { page: String(page), limit: '50', sort };
      if (search) params.search = search; if (source) params.source = source; if (from) params.createdFrom = from; if (to) params.createdTo = to;
      if (scout) params.scoutKey = scout; if (course) params.course = course; if (city) params.city = city;
      if (minAge !== '') params.minAgeDays = minAge; if (maxAge !== '') params.maxAgeDays = maxAge; if (untouched) params.untouchedDays = untouched;
      const [l, s] = await Promise.all([api.get('/api/sales/mybase/pool', { params }), api.get('/api/sales/mybase/summary')]);
      setRows(l.data.data); setMeta(l.data.meta); setSummary(s.data.data);
    } catch (err) { setError(errOf(err, 'Failed to load My Base')); }
    finally { setLoading(false); }
  }, [page, search, source, from, to, scout, course, city, minAge, maxAge, untouched, sort]);
  useEffect(() => { setPage(1); setPicked(new Set()); setAllMatching(false); }, [search, source, from, to, scout, course, city, minAge, maxAge, untouched, sort]);
  useEffect(() => { load(); }, [load]);

  const pageAllPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const togglePage = () => setPicked((p) => { const n = new Set(p); if (pageAllPicked) rows.forEach((r) => n.delete(r.id)); else rows.forEach((r) => n.add(r.id)); return n; });
  const toggleOne = (id: string) => { setAllMatching(false); setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const selectedCount = allMatching ? (meta?.total ?? 0) : picked.size;
  const toggleTarget = (id: string) => setTargets((t) => { const n = new Set(t); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const assign = async () => {
    setError(''); setNotice('');
    if (!selectedCount) { setError('Select leads first'); return; }
    if (!targets.size) { setError('Choose at least one salesperson'); return; }
    if (!window.confirm(`Assign ${selectedCount} lead${selectedCount === 1 ? '' : 's'} to ${targets.size} salesperson${targets.size === 1 ? '' : 's'}${targets.size > 1 ? ' (split evenly)' : ''}?\nPast history will be ${showHistory ? 'SHOWN' : 'HIDDEN'} to the new owner${targets.size > 1 ? 's' : ''}.`)) return;
    setBusy(true);
    try {
      const body = { employeeIds: Array.from(targets), showHistory, batchLabel: batch, ...(allMatching ? { criteria: criteria() } : { leadIds: Array.from(picked) }) };
      const r = await api.post('/api/sales/mybase/assign', body);
      const d = r.data.data as { assigned: number; perPerson: { name: string; count: number }[] };
      setNotice(`Assigned ${d.assigned} leads: ${d.perPerson.map((x) => `${x.name} ${x.count}`).join(', ')}`);
      setPicked(new Set()); setAllMatching(false);
      await load();
    } catch (err) { setError(errOf(err, 'Assignment failed')); }
    finally { setBusy(false); }
  };

  const pullCriteria = useCallback(() => ({ fromEmployeeId: pullFrom, status: pullStage ? pullStage.split(',') : undefined, activityStatus: pullStatus ? pullStatus.split(',') : undefined }), [pullFrom, pullStage, pullStatus]);
  useEffect(() => {
    setPullCount(null);
    if (!pullFrom) return;
    api.post('/api/sales/mybase/count', { criteria: pullCriteria() }).then((r) => setPullCount(r.data.data.count)).catch(() => setPullCount(null));
  }, [pullFrom, pullCriteria]);
  const pull = async () => {
    setError(''); setNotice('');
    if (!pullFrom || !pullCount) return;
    const who = employees.find((e) => e.id === pullFrom);
    if (!window.confirm(`Pull ${pullCount} lead${pullCount === 1 ? '' : 's'} back from ${who ? `${who.firstName} ${who.lastName}` : 'this person'} into My Base?`)) return;
    setBusy(true);
    try {
      const r = await api.post('/api/sales/mybase/pull', { criteria: pullCriteria() });
      setNotice(`Pulled ${r.data.data.pulled} leads back into My Base`);
      setPullFrom('');
      await load();
    } catch (err) { setError(errOf(err, 'Pull back failed')); }
    finally { setBusy(false); }
  };

  const inp = 'border rounded-lg px-3 py-2 text-sm bg-background';
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Inbox} label="In My Base" value={summary?.pool ?? '—'} />
        {(summary?.sources || []).slice(0, 3).map((s) => <StatCard key={s.source} icon={Users} label={s.source} value={s.count} />)}
      </div>

      {summary && (summary.alerts.stale > 0 || summary.alerts.neverTouched > 0 || summary.alerts.overdueLeads > 0 || summary.alerts.untouchedWithPeople > 0) && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {summary.alerts.stale > 0 && <button onClick={() => { clearFilters(); setMinAge(String(summary.alerts.staleDays)); }} className="text-left text-sm rounded-lg border border-amber-300 bg-amber-50 px-3 py-2"><b>{summary.alerts.stale}</b> lead{summary.alerts.stale === 1 ? '' : 's'} sitting in My Base for {summary.alerts.staleDays}+ days <span className="text-xs text-amber-700 block">Click to review</span></button>}
          {summary.alerts.neverTouched > 0 && <div className="text-sm rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><b>{summary.alerts.neverTouched}</b> in My Base never contacted</div>}
          {summary.alerts.overdueLeads > 0 && <button onClick={() => setShowPeople(true)} className="text-left text-sm rounded-lg border border-red-300 bg-red-50 px-3 py-2"><b>{summary.alerts.overdueLeads}</b> overdue follow-ups with the team <span className="text-xs text-red-700 block">See who</span></button>}
          {summary.alerts.untouchedWithPeople > 0 && <button onClick={() => setShowPeople(true)} className="text-left text-sm rounded-lg border border-orange-300 bg-orange-50 px-3 py-2"><b>{summary.alerts.untouchedWithPeople}</b> assigned leads untouched {summary.alerts.staleDays}+ days <span className="text-xs text-orange-700 block">See who</span></button>}
        </div>
      )}

      {summary && summary.aging.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Lead age:</span>
          {summary.aging.map((b) => {
            const active = minAge === String(b.min) && maxAge === (b.max == null ? '' : String(b.max));
            return (
              <button key={b.label} onClick={() => { if (active) { setMinAge(''); setMaxAge(''); } else { setMinAge(String(b.min)); setMaxAge(b.max == null ? '' : String(b.max)); } }}
                className={`text-xs rounded-full border px-3 py-1 ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-muted'}`}>{b.label} · <b>{b.count}</b></button>
            );
          })}
        </div>
      )}

      {summary && summary.people.length > 0 && (
        <section className="border rounded-xl bg-card">
          <button onClick={() => setShowPeople((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold">
            <span>Team load — who can take more?</span><span className="text-xs text-muted-foreground font-normal">{showPeople ? 'Hide' : 'Show'}</span>
          </button>
          {showPeople && (
            <table className="w-full text-sm border-t">
              <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40"><tr><th className="px-4 py-2">Salesperson</th><th className="px-4 py-2">Open leads</th><th className="px-4 py-2">Overdue follow-ups</th><th className="px-4 py-2">Untouched {summary.alerts.staleDays}d+</th><th className="px-4 py-2"></th></tr></thead>
              <tbody className="divide-y">
                {summary.people.map((pp) => (
                  <tr key={pp.employeeId}>
                    <td className="px-4 py-2">{pp.name}</td><td className="px-4 py-2">{pp.open}</td>
                    <td className={`px-4 py-2 ${pp.overdue ? 'text-red-600 font-medium' : ''}`}>{pp.overdue}</td>
                    <td className={`px-4 py-2 ${pp.untouched ? 'text-orange-600 font-medium' : ''}`}>{pp.untouched}</td>
                    <td className="px-4 py-2 text-right"><button onClick={() => toggleTarget(pp.employeeId)} className={`text-xs rounded-full border px-3 py-1 ${targets.has(pp.employeeId) ? 'bg-blue-50 border-blue-400 text-blue-700' : 'hover:bg-muted'}`}>{targets.has(pp.employeeId) ? 'Selected to assign' : 'Select'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {notice && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{notice}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="font-semibold text-sm">Assign selected leads <span className="text-muted-foreground font-normal">· {selectedCount} selected</span></h3>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Give to (tick several to split evenly)</p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {employees.map((e) => (
                <label key={e.id} className={`flex items-center gap-1.5 text-sm border rounded-full px-3 py-1 cursor-pointer ${targets.has(e.id) ? 'border-blue-400 bg-blue-50 text-blue-700' : ''}`}>
                  <input type="checkbox" checked={targets.has(e.id)} onChange={() => toggleTarget(e.id)} /> {e.firstName} {e.lastName}
                </label>
              ))}
            </div>
          </div>
          <label className="text-xs text-muted-foreground block">Batch name
            <input value={batch} onChange={(e) => setBatch(e.target.value)} className={`${inp} block w-full mt-1`} placeholder="e.g. October batch" />
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} className="mt-1" />
            <span><b>Show history to the new owner</b><br /><span className="text-xs text-muted-foreground">Unticked: they start fresh and only see what happens from now. Nothing is deleted — you always see everything.</span></span>
          </label>
          <button onClick={assign} disabled={busy || !selectedCount || !targets.size} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {busy ? 'Working…' : `Assign ${selectedCount || ''} lead${selectedCount === 1 ? '' : 's'}`}
          </button>
        </section>

        <section className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="font-semibold text-sm">Pull back into My Base</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">From salesperson
              <select value={pullFrom} onChange={(e) => setPullFrom(e.target.value)} className={`${inp} block mt-1`}>
                <option value="">Choose…</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
              </select>
            </label>
            <MultiSelect label="Lead stage" options={stageOptions.filter((o) => o.value !== 'ENROLLED')} value={pullStage} onChange={setPullStage} />
            <MultiSelect label="Status" options={[...activityOptions, { value: 'NONE', label: 'No status yet' }]} value={pullStatus} onChange={setPullStatus} />
          </div>
          <p className="text-xs text-muted-foreground">Enrolled leads are never pulled. {pullFrom ? (pullCount === null ? 'Counting…' : `${pullCount} lead${pullCount === 1 ? '' : 's'} match.`) : 'Pick a salesperson to see how many match.'}</p>
          <button onClick={pull} disabled={busy || !pullFrom || !pullCount} className="px-4 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium disabled:opacity-50">
            Pull {pullCount || ''} back to My Base
          </button>
          {summary && summary.batches.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">Recent hand-out batches</p>
              <div className="flex flex-wrap gap-2">{summary.batches.slice(0, 6).map((b) => <span key={b.label} className="text-xs bg-slate-100 rounded-full px-3 py-1">{b.label}: <b>{b.count}</b></span>)}</div>
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, email…" className={`${inp} w-64`} />
        <MultiSelect label="Source" options={(summary?.sources || []).map((s) => ({ value: s.source, label: `${s.source} (${s.count})` }))} value={source} onChange={setSource} />
        {(summary?.scouts?.length ?? 0) > 0 && <MultiSelect label="Lead scout" options={summary!.scouts.map((x) => ({ value: x.scoutKey || '', label: `${x.scoutKey ? scoutLabel(x.scoutKey) : 'No scout'} (${x.count})` })).filter((o) => o.value)} value={scout} onChange={setScout} />}
        {(summary?.courses?.length ?? 0) > 0 && <MultiSelect label="Course" options={summary!.courses.map((x) => ({ value: x.course, label: `${x.course} (${x.count})` }))} value={course} onChange={setCourse} />}
        {(summary?.cities?.length ?? 0) > 0 && <MultiSelect label="City" options={summary!.cities.map((x) => ({ value: x.city, label: `${x.city} (${x.count})` }))} value={city} onChange={setCity} />}
        <label className="text-xs text-muted-foreground flex items-center gap-1">Created <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} /> – <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} /></label>
        <label className="text-xs text-muted-foreground flex items-center gap-1">Not contacted for
          <select value={untouched} onChange={(e) => setUntouched(e.target.value)} className={inp}><option value="">Any</option><option value="3">3+ days</option><option value="7">7+ days</option><option value="14">14+ days</option></select>
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'oldest' | 'newest')} className={inp}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select>
        {anyFilter && <button onClick={clearFilters} className="text-xs text-red-600 hover:underline">Clear filters</button>}
      </div>

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Saved views:</span>
        {views.length === 0 && <span className="text-xs text-muted-foreground italic">none yet</span>}
        {views.map((v) => (
          <span key={v.id} className="inline-flex items-center rounded-full border bg-white text-xs">
            <button onClick={() => applyView(v.tree)} className="pl-3 pr-2 py-1 hover:text-blue-700">{v.name}{v.shared ? ' · shared' : ''}</button>
            <button onClick={() => delView(v.id)} className="pr-2 py-1 text-muted-foreground hover:text-red-600" title="Delete view"><X className="w-3 h-3" /></button>
          </span>
        ))}
        {anyFilter && (
          <span className="inline-flex items-center gap-1">
            <input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Name this view" className="border rounded-lg px-2 py-1 text-xs w-36" />
            <button onClick={saveView} disabled={!viewName.trim()} className="text-xs rounded-lg border px-2 py-1 disabled:opacity-40">Save</button>
          </span>
        )}
      </div>

      {picked.size > 0 && meta && meta.total > rows.length && !allMatching && pageAllPicked && (
        <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          {picked.size} on this page selected. <button onClick={() => setAllMatching(true)} className="text-blue-700 font-medium underline">Select all {meta.total} leads matching this filter</button>
        </div>
      )}
      {allMatching && <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">All {meta?.total} leads matching this filter are selected. <button onClick={() => { setAllMatching(false); setPicked(new Set()); }} className="text-blue-700 font-medium underline">Clear</button></div>}

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3 w-8"><input type="checkbox" checked={pageAllPicked || allMatching} onChange={togglePage} /></th>
              <th className="px-3 py-3">Name</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Scout</th><th className="px-3 py-3">Course</th><th className="px-3 py-3">City</th><th className="px-3 py-3">Age</th><th className="px-3 py-3">Last contact</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-2"><input type="checkbox" checked={allMatching || picked.has(r.id)} onChange={() => toggleOne(r.id)} /></td>
                <td className="px-3 py-2"><button onClick={() => onOpenLead(r.id)} className="text-blue-600 hover:underline font-medium">{r.name}</button></td>
                <td className="px-3 py-2 text-xs">{r.phone}</td><td className="px-3 py-2 text-xs">{r.source || '—'}</td>
                <td className="px-3 py-2 text-xs">{r.scoutKey ? scoutLabel(r.scoutKey) : '—'}</td><td className="px-3 py-2 text-xs">{r.courseInterest || '—'}</td><td className="px-3 py-2 text-xs">{r.city || '—'}</td>
                {(() => { const d = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 86400000); return <td className={`px-3 py-2 text-xs ${d >= (summary?.alerts.staleDays ?? 7) ? 'text-amber-700 font-medium' : 'text-muted-foreground'}`} title={formatDate(r.createdAt)}>{d}d</td>; })()}
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.lastContactAt ? formatDate(r.lastContactAt) : 'Never'}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">{anyFilter ? 'No leads match these filters' : 'My Base is empty'}</td></tr>}
          </tbody>
        </table>
      </div>
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{meta.total} leads · page {meta.page} of {meta.totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((x) => x - 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Previous</button>
            <button disabled={page >= meta.totalPages} onClick={() => setPage((x) => x + 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Batches (Sales Admin): how every hand-out batch is performing ──
interface BatchStat { total: number; contacted: number; neverContacted: number; calls: number; demos: number; enrolled: number; lost: number; notInterested: number; open: number; overdue: number }
interface BatchRow { label: string; assignedFrom: string | null; assignedTo: string | null; totals: BatchStat; people: (BatchStat & { name: string })[] }
function BatchesPanel() {
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/api/sales/mybase/batches').then((r) => { setRows(r.data.data); if (r.data.data[0]) setOpen(r.data.data[0].label); })
      .catch((err: unknown) => setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load batches'))
      .finally(() => setLoading(false));
  }, []);
  const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 1000) / 10}%` : '0%');
  const exportXlsx = () => {
    const out: Record<string, unknown>[] = [];
    for (const b of rows) for (const p of b.people) out.push({ Batch: b.label, Salesperson: p.name, Leads: p.total, Contacted: p.contacted, 'Never contacted': p.neverContacted, Calls: p.calls, 'Reached demo': p.demos, Enrolled: p.enrolled, 'Conversion %': p.total ? Math.round((p.enrolled / p.total) * 1000) / 10 : 0, 'Not interested': p.notInterested, 'Lost / disqualified': p.lost, 'Still open': p.open, 'Overdue follow-ups': p.overdue });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), 'Batches'); XLSX.writeFile(wb, 'batch_tracking.xlsx');
  };
  const th = 'px-3 py-2';
  const cells = (s: BatchStat) => (<>
    <td className="px-3 py-2 font-semibold">{s.total}</td><td className="px-3 py-2 text-xs">{s.contacted} <span className="text-muted-foreground">({pct(s.contacted, s.total)})</span></td>
    <td className={`px-3 py-2 text-xs ${s.neverContacted ? 'text-amber-700 font-semibold' : ''}`}>{s.neverContacted}</td><td className="px-3 py-2 text-xs">{s.calls}</td>
    <td className="px-3 py-2 text-xs">{s.demos}</td><td className="px-3 py-2 text-xs text-green-700">{s.enrolled} <span className="text-muted-foreground">({pct(s.enrolled, s.total)})</span></td>
    <td className="px-3 py-2 text-xs">{s.notInterested}</td><td className="px-3 py-2 text-xs text-red-600">{s.lost}</td><td className="px-3 py-2 text-xs">{s.open}</td>
    <td className={`px-3 py-2 text-xs ${s.overdue ? 'text-red-600 font-semibold' : ''}`}>{s.overdue}</td>
  </>);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">How each hand-out batch is doing, overall and per salesperson. A lead pulled back into My Base leaves its batch.</p>
        <button onClick={exportXlsx} disabled={!rows.length} className="text-xs border rounded-lg px-3 py-2 text-blue-600 disabled:text-muted-foreground">Download Excel</button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground border rounded-xl p-8 text-center">No batches yet. Assign leads from My Base and they will appear here.</p>}
      {rows.map((b) => (
        <section key={b.label} className="border rounded-xl bg-card overflow-hidden">
          <button onClick={() => setOpen(open === b.label ? null : b.label)} className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/30">
            <div>
              <p className="font-semibold text-sm">{b.label}</p>
              <p className="text-xs text-muted-foreground">{b.assignedFrom ? `Assigned ${formatDate(b.assignedFrom)}${b.assignedTo && formatDate(b.assignedTo) !== formatDate(b.assignedFrom) ? ` – ${formatDate(b.assignedTo)}` : ''}` : ''} · {b.people.length} salesperson{b.people.length === 1 ? '' : 's'}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="bg-slate-100 rounded-full px-3 py-1">{b.totals.total} leads</span>
              <span className="bg-blue-50 text-blue-700 rounded-full px-3 py-1">{pct(b.totals.contacted, b.totals.total)} contacted</span>
              <span className="bg-green-50 text-green-700 rounded-full px-3 py-1">{b.totals.enrolled} enrolled ({pct(b.totals.enrolled, b.totals.total)})</span>
              {b.totals.neverContacted > 0 && <span className="bg-amber-50 text-amber-700 rounded-full px-3 py-1">{b.totals.neverContacted} untouched</span>}
            </div>
          </button>
          {open === b.label && (
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className={th}>Salesperson</th><th className={th}>Leads</th><th className={th}>Contacted</th><th className={th}>Never contacted</th><th className={th}>Calls</th><th className={th}>Reached demo</th><th className={th}>Enrolled</th><th className={th}>Not interested</th><th className={th}>Lost</th><th className={th}>Open</th><th className={th}>Overdue</th></tr>
                </thead>
                <tbody className="divide-y">
                  {b.people.map((p) => <tr key={p.name} className="hover:bg-muted/30"><td className="px-3 py-2 font-medium whitespace-nowrap">{p.name}</td>{cells(p)}</tr>)}
                  <tr className="bg-muted/40 font-semibold"><td className="px-3 py-2">Total</td>{cells(b.totals)}</tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

// ── Send a WhatsApp message / email to a lead from a template ──
interface MsgTemplate { id: string; name: string; channel: 'WHATSAPP' | 'EMAIL'; category: string | null; subject: string | null; body: string; active: boolean }
function SendMessageModal({ lead, channel, onClose, onSent }: { lead: Lead; channel: 'WHATSAPP' | 'EMAIL'; onClose: () => void; onSent: () => void }) {
  const [templates, setTemplates] = useState<MsgTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errOf = (err: unknown, fb: string) => (err as { response?: { data?: { message?: string } } }).response?.data?.message || fb;
  useEffect(() => { api.get('/api/sales/message-templates', { params: { channel } }).then((r) => setTemplates(r.data.data)).catch((e) => setError(errOf(e, 'Could not load templates'))); }, [channel]);
  const pick = async (id: string) => {
    setTemplateId(id); setError('');
    if (!id) { setSubject(''); setBody(''); return; }
    try {
      const r = await api.get(`/api/sales/leads/${lead.id}/message-preview`, { params: { templateId: id } });
      setSubject(r.data.data.subject || ''); setBody(r.data.data.body); setWaPhone(r.data.data.waPhone);
    } catch (e) { setError(errOf(e, 'Could not prepare the message')); }
  };
  const send = async () => {
    setError('');
    if (!body.trim()) { setError('Write or pick a message first'); return; }
    const name = templates.find((t) => t.id === templateId)?.name;
    const key = lead.phone.replace(/\D/g, '').slice(-10);
    if (channel === 'WHATSAPP') window.open(`https://wa.me/91${waPhone || key}?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
    setBusy(true);
    try { await api.post(`/api/sales/leads/${lead.id}/message`, { channel, body, subject, templateName: name }); onSent(); onClose(); }
    catch (e) { setError(errOf(e, 'Could not record the message')); }
    finally { setBusy(false); }
  };
  const inp = 'border rounded-lg px-3 py-2 text-sm bg-background w-full';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'} — {lead.name}</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <label className="text-xs text-muted-foreground block">Template
          <select value={templateId} onChange={(e) => pick(e.target.value)} className={`${inp} mt-1`}>
            <option value="">Write my own…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.category ? `${t.category} · ` : ''}{t.name}</option>)}
          </select>
        </label>
        {channel === 'EMAIL' && <label className="text-xs text-muted-foreground block">Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} className={`${inp} mt-1`} /></label>}
        <label className="text-xs text-muted-foreground block">Message (you can edit before sending)
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={`${inp} mt-1`} />
        </label>
        <p className="text-xs text-muted-foreground">{channel === 'WHATSAPP' ? `Opens WhatsApp for ${lead.phone} with this text ready to send. ` : `Sent from the portal to ${lead.email}, with you in copy. `}It is recorded in the lead's history.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={send} disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> {channel === 'WHATSAPP' ? 'Open WhatsApp' : 'Send email'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Today view: what to do next, in priority order ──
interface TodayItem { key: string; lead: { id: string; name: string; phone: string; status: string; activityStatus: string | null; lastContactAt: string | null; courseInterest: string | null } | null; taskId: string | null; title: string | null; reasons: { type: string; label: string; at: string | null }[]; score: number }
const REASON_STYLE: Record<string, string> = {
  DEMO: 'bg-purple-100 text-purple-700', DEMO_PENDING: 'bg-purple-100 text-purple-700', OVERDUE: 'bg-red-100 text-red-700',
  FOLLOW_UP: 'bg-amber-100 text-amber-700', TASK: 'bg-slate-100 text-slate-700', NEW: 'bg-blue-100 text-blue-700',
};
function TodayPanel({ isAdmin, employees, onOpenLead }: { isAdmin: boolean; employees: EmployeeLite[]; onOpenLead: (id: string) => void }) {
  const [emp, setEmp] = useState('');
  const [data, setData] = useState<{ summary: { overdue: number; dueToday: number; demosToday: number; demosPending: number; tasks: number; untouched: number; total: number }; items: TodayItem[] } | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const r = await api.get('/api/sales/today', { params: emp ? { employeeId: emp } : {} }); setData(r.data.data); }
    catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load Today'); }
    finally { setLoading(false); }
  }, [emp]);
  useEffect(() => { load(); }, [load]);
  const s = data?.summary;
  const chips: { key: string; label: string; n: number }[] = s ? [
    { key: 'DEMO', label: 'Demos today', n: s.demosToday }, { key: 'DEMO_PENDING', label: 'Demo outcome pending', n: s.demosPending },
    { key: 'OVERDUE', label: 'Overdue follow-ups', n: s.overdue }, { key: 'FOLLOW_UP', label: 'Follow-ups today', n: s.dueToday },
    { key: 'TASK', label: 'Tasks due', n: s.tasks }, { key: 'NEW', label: 'New, not contacted', n: s.untouched },
  ] : [];
  const items = (data?.items || []).filter((i) => !filter || i.reasons.some((r) => r.type === filter));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Your day in priority order — start at the top.</p>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <select value={emp} onChange={(e) => setEmp(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm bg-background">
              <option value="">My day</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          )}
          <button onClick={load} className="text-xs border rounded-lg px-3 py-2 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
        </div>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter('')} className={`text-xs rounded-full px-3 py-1.5 border ${!filter ? 'bg-blue-600 text-white border-blue-600' : ''}`}>All {s?.total ?? ''}</button>
        {chips.map((c) => <button key={c.key} onClick={() => setFilter(filter === c.key ? '' : c.key)} className={`text-xs rounded-full px-3 py-1.5 border ${filter === c.key ? 'bg-blue-600 text-white border-blue-600' : ''}`}>{c.label}: <b>{c.n}</b></button>)}
      </div>
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && items.length === 0 && <p className="text-sm text-muted-foreground border rounded-xl p-10 text-center">Nothing pending right now. 🎉</p>}
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={it.key} className="border rounded-xl bg-card p-3 flex flex-wrap items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-slate-100 text-xs font-semibold flex items-center justify-center">{i + 1}</span>
            <div className="min-w-[180px] flex-1">
              {it.lead ? <button onClick={() => onOpenLead(it.lead!.id)} className="text-blue-600 hover:underline font-medium text-sm">{it.lead.name}</button> : <span className="font-medium text-sm">{it.title}</span>}
              {it.lead && <div className="text-xs text-muted-foreground">{it.lead.phone}{it.lead.courseInterest ? ` · ${it.lead.courseInterest}` : ''} · {it.lead.status.replace(/_/g, ' ')}{it.lead.activityStatus ? ` · ${it.lead.activityStatus.replace(/_/g, ' ')}` : ''}</div>}
              <div className="flex flex-wrap gap-1.5 mt-1.5">{it.reasons.map((r, k) => <span key={k} className={`text-[11px] rounded-full px-2 py-0.5 ${REASON_STYLE[r.type] || 'bg-slate-100'}`}>{r.label}</span>)}</div>
            </div>
            {it.lead && (
              <div className="flex gap-2">
                <a href={`tel:${it.lead.phone.replace(/\s+/g, '')}`} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs hover:bg-muted/50"><Phone className="w-3 h-3" /> Call</a>
                <a href={`https://wa.me/91${it.lead.phone.replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs text-green-700 border-green-300 hover:bg-green-50"><MessageCircle className="w-3 h-3" /> WhatsApp</a>
                <button onClick={() => onOpenLead(it.lead!.id)} className="px-3 py-1.5 border rounded-lg text-xs hover:bg-muted/50">Log activity</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Call analytics ──
interface CallAnalytics {
  totals: { calls: number; connected: number; notConnected: number; connectRate: number; talkSeconds: number; avgTalkSeconds: number; callsPerDay: number; missed: number; inbound: number; outbound: number };
  perPerson: { employeeId: string; name: string; calls: number; connected: number; connectRate: number; talkSeconds: number; avgTalkSeconds: number; missed: number; activeDays: number; callsPerDay: number; dnp: number; tl: string; firstCall: string; lastCall: string; avgCallSeconds: number; outcomes: Record<string, number>; byDay: { date: string; calls: number; connected: number; talk: number }[] }[];
  perTl: { name: string; members: number; calls: number; connected: number; connectRate: number; talkSeconds: number; outcomes: Record<string, number> }[];
  days: { date: string; calls: number; connected: number; talkSeconds: number }[];
  hours: { hour: number; calls: number; connected: number; connectRate: number }[];
  weekdays: { dow: number; calls: number; connected: number; connectRate: number }[];
}
const fmtDur = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`; };
const hourText = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
function CallAnalyticsPanel({ isAdmin, employees }: { isAdmin: boolean; employees: EmployeeLite[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [emp, setEmp] = useState('');
  const [data, setData] = useState<CallAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    setLoading(true); setError('');
    api.get('/api/sales/call-analytics', { params: { from, to, ...(emp ? { employeeId: emp } : {}) } })
      .then((r) => setData(r.data.data))
      .catch((err: unknown) => setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load call analytics'))
      .finally(() => setLoading(false));
  }, [from, to, emp]);
  const [exporting, setExporting] = useState(false);
  const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  const exportDetail = async () => {
    setExporting(true);
    try {
      const r = await api.get('/api/sales/call-details', { params: { from, to, ...(emp ? { employeeId: emp } : {}) } });
      const rows = (r.data.data as Record<string, string | number>[]).map((x) => ({ Date: x.date, Time: x.time, Salesperson: x.salesperson, Lead: x.lead, Phone: x.phone, Direction: x.direction, Source: x.source, Connected: x.connected, 'Duration (sec)': x.durationSeconds, Status: x.status, Notes: x.notes }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Calls');
      if (data) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.perPerson.map((p) => ({ Salesperson: p.name, 'Team lead': p.tl, Calls: p.calls, Connected: p.connected, DNP: p.dnp, 'Connect %': p.connectRate, 'Talk time (sec)': p.talkSeconds, 'Avg talk (sec)': p.avgTalkSeconds, 'First call': clock(p.firstCall), 'Last call': clock(p.lastCall), 'Active days': p.activeDays, 'Calls/day': p.callsPerDay }))), 'Per person');
        const per: Record<string, string | number>[] = [];
        data.perPerson.forEach((p) => p.byDay.forEach((d) => per.push({ Salesperson: p.name, Date: d.date, Calls: d.calls, Connected: d.connected, 'Talk time (sec)': d.talk })));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(per), 'Per day');
      }
      XLSX.writeFile(wb, `call-report-${from}-to-${to}.xlsx`);
    } catch (e) { setError((e as { response?: { data?: { message?: string } } }).response?.data?.message || 'Export failed'); }
    finally { setExporting(false); }
  };
  const outcomeKeys = Array.from(new Set((data?.perPerson || []).flatMap((p) => Object.keys(p.outcomes)))).sort();
  const outLabel = (k: string) => k.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  const t = data?.totals;
  const maxDay = Math.max(1, ...(data?.days || []).map((d) => d.calls));
  const hours = data?.hours || [];
  const best = [...hours].filter((h) => h.calls >= 5).sort((a, b) => b.connectRate - a.connectRate || b.calls - a.calls).slice(0, 3).map((h) => h.hour);
  const dowName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const inp = 'border rounded-lg px-2 py-1.5 text-sm bg-background';
  const th = 'px-3 py-3';
  const card = (label: string, value: string | number, sub?: string) => (
    <div className="border rounded-xl p-3 bg-card"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p>{sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}</div>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inp} block mt-1`} /></label>
        <label className="text-xs text-muted-foreground">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inp} block mt-1`} /></label>
        {isAdmin && (
          <label className="text-xs text-muted-foreground">Salesperson
            <select value={emp} onChange={(e) => setEmp(e.target.value)} className={`${inp} block mt-1`}><option value="">Everyone</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select>
          </label>
        )}
        <button onClick={exportDetail} disabled={exporting} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">{exporting ? 'Preparing...' : 'Export to Excel'}</button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {t && data && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {card('Calls', t.calls, `${t.callsPerDay} per day`)}
          {card('Connected', t.connected, `${t.connectRate}% connect rate`)}
          {card('Not connected', t.notConnected, `${t.missed} missed`)}
          {card('Talk time', fmtDur(t.talkSeconds), 'auto-tracked calls')}
          {card('Avg talk time', fmtDur(t.avgTalkSeconds), 'per connected call')}
          {card('Outbound / inbound', `${t.outbound} / ${t.inbound}`)}
        </div>
        <p className="text-xs text-muted-foreground -mt-2">Connected = tracked calls with talk time (not missed), and manually logged calls not marked DNP.</p>

        <section className="border rounded-xl p-4 bg-card space-y-2">
          <h3 className="font-semibold text-sm">Calls per day</h3>
          <div className="flex items-end gap-[3px] h-32 overflow-x-auto">
            {data.days.map((d) => (
              <div key={d.date} className="flex flex-col justify-end items-center min-w-[10px] flex-1 h-full group relative" title={`${d.date}: ${d.calls} calls, ${d.connected} connected, ${fmtDur(d.talkSeconds)} talk`}>
                <div className="w-full bg-blue-200 rounded-t relative" style={{ height: `${(d.calls / maxDay) * 100}%`, minHeight: d.calls ? 2 : 0 }}>
                  <div className="absolute bottom-0 w-full bg-blue-600 rounded-t" style={{ height: d.calls ? `${(d.connected / d.calls) * 100}%` : 0 }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Light bar = all calls, dark = connected. Hover a bar for details.</p>
        </section>

        <section className="border rounded-xl p-4 bg-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">Best time to reach leads</h3>
            {best.length > 0 && <p className="text-xs text-green-700">Highest connect rates: {best.map((h) => `${hourText(h)}–${hourText((h + 1) % 24)}`).join(', ')}</p>}
          </div>
          <div className="grid grid-cols-12 md:grid-cols-24 gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
            {hours.map((h) => (
              <div key={h.hour} className="text-center" title={`${hourText(h.hour)}: ${h.calls} calls, ${h.connectRate}% connected`}>
                <div className="h-14 rounded flex items-end bg-slate-100 overflow-hidden"><div className={`w-full ${best.includes(h.hour) ? 'bg-green-500' : 'bg-blue-400'}`} style={{ height: `${h.calls ? Math.max(8, h.connectRate) : 0}%` }} /></div>
                <p className="text-[10px] text-muted-foreground mt-1">{hourText(h.hour)}</p>
                <p className="text-[10px]">{h.calls ? `${Math.round(h.connectRate)}%` : ''}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {data.weekdays.map((w) => <span key={w.dow} className="bg-slate-100 rounded-full px-3 py-1">{dowName[w.dow]}: <b>{w.calls ? `${Math.round(w.connectRate)}%` : '—'}</b> <span className="text-muted-foreground">({w.calls})</span></span>)}
          </div>
          <p className="text-[11px] text-muted-foreground">Bars show the connect rate for each hour of the day (IST). Hours with fewer than 5 calls are not ranked.</p>
        </section>

        {isAdmin && (<>
          <section className="space-y-2">
            <h3 className="font-semibold text-sm">By salesperson</h3>
            <div className="bg-card border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className={th}>Salesperson</th><th className={th}>Team lead</th><th className={th}>Calls</th><th className={th}>Connected</th><th className={th}>DNP</th><th className={th}>Connect rate</th><th className={th}>Talk time</th><th className={th}>Avg talk</th><th className={th}>First call</th><th className={th}>Last call</th><th className={th}>Active days</th><th className={th}>Calls / day</th></tr></thead>
                <tbody className="divide-y">
                  {data.perPerson.map((p) => (
                    <tr key={p.employeeId} className="hover:bg-muted/30"><td className="px-3 py-2 font-medium whitespace-nowrap">{p.name}</td><td className="px-3 py-2 text-xs whitespace-nowrap">{p.tl || '—'}</td><td className="px-3 py-2 font-semibold">{p.calls}</td><td className="px-3 py-2 text-xs">{p.connected}</td><td className="px-3 py-2 text-xs">{p.dnp}</td>
                      <td className={`px-3 py-2 text-xs font-semibold ${p.connectRate >= 50 ? 'text-green-700' : p.connectRate < 30 ? 'text-red-600' : ''}`}>{p.connectRate}%</td>
                      <td className="px-3 py-2 text-xs">{fmtDur(p.talkSeconds)}</td><td className="px-3 py-2 text-xs">{fmtDur(p.avgTalkSeconds)}</td><td className="px-3 py-2 text-xs">{clock(p.firstCall)}</td><td className="px-3 py-2 text-xs">{clock(p.lastCall)}</td><td className="px-3 py-2 text-xs">{p.activeDays}</td><td className="px-3 py-2 text-xs">{p.callsPerDay}</td></tr>
                  ))}
                  {data.perPerson.length === 0 && <tr><td colSpan={12} className="px-4 py-6 text-center text-muted-foreground">No calls in this range</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">First / last call show the earliest and latest call time in the range (IST).</p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-sm">Outcome by status</h3>
            <div className="bg-card border rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className={th}>Team / person</th>{outcomeKeys.map((k) => <th key={k} className={th}>{outLabel(k)}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {data.perTl.map((tl) => (
                    <tr key={`tl-${tl.name}`} className="bg-blue-50/60 font-semibold"><td className="px-3 py-2 whitespace-nowrap">{tl.name} <span className="text-xs font-normal text-muted-foreground">team · {tl.calls} calls</span></td>{outcomeKeys.map((k) => <td key={k} className="px-3 py-2 text-xs">{tl.outcomes[k] || 0}</td>)}</tr>
                  ))}
                  {data.perPerson.map((p) => (
                    <tr key={p.employeeId} className="hover:bg-muted/30"><td className="px-3 py-2 whitespace-nowrap pl-6">{p.name}</td>{outcomeKeys.map((k) => <td key={k} className="px-3 py-2 text-xs">{p.outcomes[k] || 0}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-sm">Daily calls by person</h3>
            <div className="bg-card border rounded-xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left uppercase text-muted-foreground"><tr><th className={th}>Salesperson</th>{data.days.slice(-14).map((d) => <th key={d.date} className="px-2 py-3">{d.date.slice(5)}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {data.perPerson.map((p) => {
                    const m = new Map(p.byDay.map((d) => [d.date, d]));
                    return <tr key={p.employeeId}><td className="px-3 py-2 font-medium whitespace-nowrap">{p.name}</td>{data.days.slice(-14).map((d) => { const x = m.get(d.date); return <td key={d.date} className="px-2 py-2" title={x ? `${x.connected} connected, ${fmtDur(x.talk)} talk` : ''}>{x ? x.calls : <span className="text-muted-foreground">·</span>}</td>; })}</tr>;
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">Last 14 days of the range. The Excel export has every day.</p>
          </section>
        </>)}
      </>)}
    </div>
  );
}

// ── Message templates (Sales Admin) ──
function TemplatesView() {
  const [rows, setRows] = useState<MsgTemplate[]>([]);
  const [form, setForm] = useState<Partial<MsgTemplate> | null>(null);
  const [error, setError] = useState('');
  const errOf = (err: unknown, fb: string) => (err as { response?: { data?: { message?: string } } }).response?.data?.message || fb;
  const load = useCallback(async () => { try { const r = await api.get('/api/sales/message-templates', { params: { all: 1 } }); setRows(r.data.data); } catch (e) { setError(errOf(e, 'Failed to load templates')); } }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form) return; setError('');
    try { if (form.id) await api.put(`/api/sales/message-templates/${form.id}`, form); else await api.post('/api/sales/message-templates', form); setForm(null); await load(); }
    catch (e) { setError(errOf(e, 'Could not save')); }
  };
  const del = async (t: MsgTemplate) => { if (!window.confirm(`Delete "${t.name}"?`)) return; try { await api.delete(`/api/sales/message-templates/${t.id}`); await load(); } catch (e) { setError(errOf(e, 'Failed')); } };
  const inp = 'border rounded-lg px-3 py-2 text-sm bg-background w-full';
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">Salespeople pick these from the lead screen (WhatsApp / Email buttons) and can edit the text before sending. Placeholders: <code className="text-xs">{'{{name}} {{firstName}} {{course}} {{phone}} {{city}} {{salesperson}} {{demoDate}} {{demoTime}} {{demoMode}}'}</code></p>
        <button onClick={() => setForm({ channel: 'WHATSAPP', name: '', body: '', active: true })} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium whitespace-nowrap">+ New template</button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {form && (
        <section className="border rounded-xl p-4 bg-card space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <label className="text-xs text-muted-foreground">Name<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inp} mt-1`} /></label>
            <label className="text-xs text-muted-foreground">Channel
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as 'WHATSAPP' | 'EMAIL' })} className={`${inp} mt-1`}><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option></select>
            </label>
            <label className="text-xs text-muted-foreground">Category (Demo, Fees, Brochure…)<input value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`${inp} mt-1`} /></label>
          </div>
          {form.channel === 'EMAIL' && <label className="text-xs text-muted-foreground block">Subject<input value={form.subject || ''} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={`${inp} mt-1`} /></label>}
          <label className="text-xs text-muted-foreground block">Message<textarea rows={7} value={form.body || ''} onChange={(e) => setForm({ ...form, body: e.target.value })} className={`${inp} mt-1`} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Available to salespeople</label>
          <div className="flex gap-2"><button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Save template</button><button onClick={() => setForm(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button></div>
        </section>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        {rows.map((t) => (
          <section key={t.id} className={`border rounded-xl p-4 bg-card space-y-2 ${t.active ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-semibold text-sm">{t.name}</p><p className="text-xs text-muted-foreground">{t.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}{t.category ? ` · ${t.category}` : ''}{t.active ? '' : ' · off'}</p></div>
              <div className="flex gap-2 text-xs"><button onClick={() => setForm(t)} className="px-3 py-1 border rounded-lg">Edit</button><button onClick={() => del(t)} className="px-3 py-1 border rounded-lg text-red-600">Delete</button></div>
            </div>
            {t.subject && <p className="text-xs"><b>Subject:</b> {t.subject}</p>}
            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-5">{t.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

// ── Target vs achievement alerts (Sales Admin) ──
interface TargetCfg { id: string; active: boolean; checkDays: string; behindPercent: number; notifyOwner: boolean; notifyAdmins: boolean; adminEmails: string | null; sendHour: number; lastSentOn: string | null }
interface TargetStatusRow { employeeId: string; name: string; enrollGoal: number; enrolled: number; enrollExpected: number; revenueGoal: number; revenue: number; revenueExpected: number; behindEnroll: boolean; behindRevenue: boolean }
function TargetAlertsView() {
  const [cfg, setCfg] = useState<TargetCfg | null>(null);
  const [status, setStatus] = useState<{ day: number; daysInMonth: number; monthLabel: string; rows: TargetStatusRow[] } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const errOf = (err: unknown, fb: string) => (err as { response?: { data?: { message?: string } } }).response?.data?.message || fb;
  const load = useCallback(async () => { try { const r = await api.get('/api/sales/target-alerts'); setCfg(r.data.data.config); setStatus(r.data.data.status); } catch (e) { setError(errOf(e, 'Failed to load')); } }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => { if (!cfg) return; setError(''); setNotice(''); try { await api.put('/api/sales/target-alerts', cfg); setNotice('Saved'); await load(); } catch (e) { setError(errOf(e, 'Could not save')); } };
  const sendNow = async () => { if (!window.confirm('Email everyone who is currently behind pace?')) return; setError(''); setNotice(''); try { const r = await api.post('/api/sales/target-alerts/send-now'); setNotice(`${r.data.data.behind} behind pace · ${r.data.data.emails} email${r.data.data.emails === 1 ? '' : 's'} sent`); } catch (e) { setError(errOf(e, 'Send failed')); } };
  const inp = 'border rounded-lg px-3 py-2 text-sm bg-background w-full';
  if (!cfg) return <p className="text-sm text-muted-foreground">Loading...{error}</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">On the chosen days of the month, anyone below the set percentage of their pro-rata target (goal × days elapsed ÷ days in month) gets an email and notification, and admins get one summary. Targets are set on the Targets tab.</p>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {notice && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{notice}</div>}
      <section className="border rounded-xl p-4 bg-card space-y-3">
        <div className="grid md:grid-cols-4 gap-3">
          <label className="text-xs text-muted-foreground">Check on days of month<input value={cfg.checkDays} onChange={(e) => setCfg({ ...cfg, checkDays: e.target.value })} className={`${inp} mt-1`} placeholder="10,15,20,25" /></label>
          <label className="text-xs text-muted-foreground">Alert when below (% of pace)<input type="number" min={1} max={100} value={cfg.behindPercent} onChange={(e) => setCfg({ ...cfg, behindPercent: Number(e.target.value) })} className={`${inp} mt-1`} /></label>
          <label className="text-xs text-muted-foreground">Send at
            <select value={cfg.sendHour} onChange={(e) => setCfg({ ...cfg, sendHour: Number(e.target.value) })} className={`${inp} mt-1`}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
          </label>
          <label className="text-xs text-muted-foreground">Admin emails (blank = report recipients)<input value={cfg.adminEmails || ''} onChange={(e) => setCfg({ ...cfg, adminEmails: e.target.value })} className={`${inp} mt-1`} /></label>
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.active} onChange={(e) => setCfg({ ...cfg, active: e.target.checked })} /> Alerts on</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.notifyOwner} onChange={(e) => setCfg({ ...cfg, notifyOwner: e.target.checked })} /> Email + notify the salesperson</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.notifyAdmins} onChange={(e) => setCfg({ ...cfg, notifyAdmins: e.target.checked })} /> Email admins</label>
        </div>
        <div className="flex gap-2"><button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Save</button><button onClick={sendNow} className="px-4 py-2 border rounded-lg text-sm">Send now</button></div>
      </section>
      {status && (
        <section className="space-y-2">
          <h3 className="font-semibold text-sm">{status.monthLabel} — day {status.day} of {status.daysInMonth}</h3>
          <div className="bg-card border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-3">Salesperson</th><th className="px-3 py-3">Enrolments</th><th className="px-3 py-3">Expected by now</th><th className="px-3 py-3">Revenue</th><th className="px-3 py-3">Expected by now</th><th className="px-3 py-3">Status</th></tr></thead>
              <tbody className="divide-y">
                {status.rows.map((r) => {
                  const behind = r.behindEnroll || r.behindRevenue;
                  return (
                    <tr key={r.employeeId}><td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-xs">{r.enrollGoal ? `${r.enrolled} / ${r.enrollGoal}` : '—'}</td><td className="px-3 py-2 text-xs text-muted-foreground">{r.enrollGoal ? r.enrollExpected.toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.revenueGoal ? `₹${Math.round(r.revenue).toLocaleString('en-IN')} / ₹${Math.round(r.revenueGoal).toLocaleString('en-IN')}` : '—'}</td><td className="px-3 py-2 text-xs text-muted-foreground">{r.revenueGoal ? `₹${Math.round(r.revenueExpected).toLocaleString('en-IN')}` : '—'}</td>
                      <td className="px-3 py-2"><span className={`text-xs rounded-full px-2 py-0.5 ${behind ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{behind ? 'Behind' : 'On track'}</span></td></tr>
                  );
                })}
                {status.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No targets set for this month</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Duplicates & email alert rules (Sales Admin) ──
function LeadControlPanel({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const [view, setView] = useState<'templates' | 'alerts' | 'targets' | 'duplicates'>('templates');
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['templates', 'Message templates'], ['alerts', 'Lead alert rules'], ['targets', 'Target alerts'], ['duplicates', 'Duplicate leads']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} className={`px-4 py-1.5 rounded-full text-sm border ${view === k ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-muted/50'}`}>{label}</button>
        ))}
      </div>
      {view === 'templates' ? <TemplatesView /> : view === 'alerts' ? <AlertRulesView /> : view === 'targets' ? <TargetAlertsView /> : <DuplicatesView onOpenLead={onOpenLead} />}
    </div>
  );
}

interface DupLead { id: string; name: string; phone: string; email: string | null; source: string | null; status: string; activityStatus: string | null; createdAt: string; owner: string; _count: { callLogs: number; demos: number; leadNotes: number; tasks: number; collections: number; students: number } }
function DuplicatesView({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const [groups, setGroups] = useState<{ phoneKey: string; leads: DupLead[] }[]>([]);
  const [total, setTotal] = useState(0);
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const errOf = (err: unknown, fb: string) => (err as { response?: { data?: { message?: string } } }).response?.data?.message || fb;
  const weight = (l: DupLead) => (l.status === 'ENROLLED' ? 1000 : 0) + l._count.callLogs + l._count.demos * 3 + l._count.leadNotes + l._count.collections * 50 + l._count.students * 50;
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get('/api/sales/duplicates');
      const g = r.data.data.groups as { phoneKey: string; leads: DupLead[] }[];
      setGroups(g); setTotal(r.data.data.totalGroups);
      setKeep(Object.fromEntries(g.map((x) => [x.phoneKey, [...x.leads].sort((a, b) => weight(b) - weight(a))[0].id])));
    } catch (err) { setError(errOf(err, 'Failed to load duplicates')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const merge = async (g: { phoneKey: string; leads: DupLead[] }) => {
    const keepId = keep[g.phoneKey]; const others = g.leads.filter((l) => l.id !== keepId);
    if (!window.confirm(`Merge ${others.length} duplicate${others.length === 1 ? '' : 's'} into "${g.leads.find((l) => l.id === keepId)?.name}"?\nAll calls, demos, notes, tasks and payments move to the kept lead.`)) return;
    setBusy(g.phoneKey); setError(''); setNotice('');
    try { await api.post('/api/sales/duplicates/merge', { keepId, mergeIds: others.map((l) => l.id) }); setNotice('Merged'); await load(); }
    catch (err) { setError(errOf(err, 'Merge failed')); } finally { setBusy(''); }
  };
  const dismiss = async (g: { phoneKey: string }) => {
    setBusy(g.phoneKey); setError('');
    try { await api.post('/api/sales/duplicates/dismiss', { phoneKey: g.phoneKey }); await load(); }
    catch (err) { setError(errOf(err, 'Failed')); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">New leads with a phone number that already exists are blocked automatically (+91, spaces and a leading 0 are ignored). These are older duplicates already in the system — {total} group{total === 1 ? '' : 's'}.</p>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {notice && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{notice}</div>}
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && groups.length === 0 && <p className="text-sm text-muted-foreground border rounded-xl p-8 text-center">No duplicate phone numbers found.</p>}
      {groups.map((g) => (
        <section key={g.phoneKey} className="border rounded-xl bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-muted/40">
            <p className="text-sm font-semibold">{g.phoneKey} <span className="text-muted-foreground font-normal">· {g.leads.length} leads</span></p>
            <div className="flex gap-2">
              <button disabled={busy === g.phoneKey} onClick={() => merge(g)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">Merge into selected</button>
              <button disabled={busy === g.phoneKey} onClick={() => dismiss(g)} className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-50">Not duplicates</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {g.leads.map((l) => (
                <tr key={l.id} className={keep[g.phoneKey] === l.id ? 'bg-blue-50/50' : ''}>
                  <td className="px-3 py-2 w-24"><label className="flex items-center gap-1 text-xs"><input type="radio" name={`keep-${g.phoneKey}`} checked={keep[g.phoneKey] === l.id} onChange={() => setKeep((k) => ({ ...k, [g.phoneKey]: l.id }))} /> Keep</label></td>
                  <td className="px-3 py-2"><button onClick={() => onOpenLead(l.id)} className="text-blue-600 hover:underline font-medium">{l.name}</button><div className="text-xs text-muted-foreground">{l.phone}{l.email ? ` · ${l.email}` : ''}</div></td>
                  <td className="px-3 py-2 text-xs">{l.owner}</td>
                  <td className="px-3 py-2 text-xs">{l.status.replace(/_/g, ' ')}{l.activityStatus ? ` · ${l.activityStatus.replace(/_/g, ' ')}` : ''}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l._count.callLogs} calls · {l._count.demos} demos · {l._count.leadNotes} notes</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

interface AlertRule { id: string; name: string; type: string; days: number; activityStatus: string | null; includeMyBase: boolean; notifyOwner: boolean; notifyAdmins: boolean; adminEmails: string | null; sendHour: number; active: boolean; lastSentOn: string | null; lastSentCount: number | null; description: string }
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
function AlertRulesView() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [types, setTypes] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Partial<AlertRule> | null>(null);
  const [preview, setPreview] = useState<{ id: string; total: number; perOwner: { name: string; count: number }[] } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const errOf = (err: unknown, fb: string) => (err as { response?: { data?: { message?: string } } }).response?.data?.message || fb;
  const load = useCallback(async () => {
    try { const r = await api.get('/api/sales/alert-rules'); setRules(r.data.data.rules); setTypes(r.data.data.types); }
    catch (err) { setError(errOf(err, 'Failed to load rules')); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form) return; setError(''); setBusy('save');
    try { if (form.id) await api.put(`/api/sales/alert-rules/${form.id}`, form); else await api.post('/api/sales/alert-rules', form); setForm(null); await load(); }
    catch (err) { setError(errOf(err, 'Could not save rule')); } finally { setBusy(''); }
  };
  const toggle = async (r: AlertRule) => { try { await api.put(`/api/sales/alert-rules/${r.id}`, { ...r, active: !r.active }); await load(); } catch (err) { setError(errOf(err, 'Failed')); } };
  const del = async (r: AlertRule) => { if (!window.confirm(`Delete rule "${r.name}"?`)) return; try { await api.delete(`/api/sales/alert-rules/${r.id}`); await load(); } catch (err) { setError(errOf(err, 'Failed')); } };
  const doPreview = async (r: AlertRule) => { setBusy(r.id); setError(''); try { const x = await api.get(`/api/sales/alert-rules/${r.id}/preview`); setPreview({ id: r.id, ...x.data.data }); } catch (err) { setError(errOf(err, 'Preview failed')); } finally { setBusy(''); } };
  const sendNow = async (r: AlertRule) => {
    if (!window.confirm(`Send "${r.name}" emails right now?`)) return; setBusy(r.id); setError(''); setNotice('');
    try { const x = await api.post(`/api/sales/alert-rules/${r.id}/send-now`); setNotice(`${x.data.data.matched} leads matched · ${x.data.data.emails} email${x.data.data.emails === 1 ? '' : 's'} sent`); }
    catch (err) { setError(errOf(err, 'Send failed')); } finally { setBusy(''); }
  };
  const inp = 'border rounded-lg px-3 py-2 text-sm bg-background w-full';
  const blank: Partial<AlertRule> = { name: '', type: 'NO_ACTIVITY', days: 14, includeMyBase: true, notifyOwner: true, notifyAdmins: true, sendHour: 9, active: true, adminEmails: '' };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Each rule emails a daily digest at its send time: every owner gets their own leads, admins get one combined list. Leads in My Base are included when ticked. Enrolled, lost, not-interested and disqualified leads are never listed.</p>
        <button onClick={() => setForm(blank)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium whitespace-nowrap">+ New rule</button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {notice && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{notice}</div>}

      {form && (
        <section className="border rounded-xl p-4 bg-card space-y-3">
          <h3 className="font-semibold text-sm">{form.id ? 'Edit rule' : 'New rule'}</h3>
          <div className="grid md:grid-cols-3 gap-3">
            <label className="text-xs text-muted-foreground">Name<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inp} mt-1`} /></label>
            <label className="text-xs text-muted-foreground">When
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={`${inp} mt-1`}>{Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="text-xs text-muted-foreground">Days (N)<input type="number" min={1} max={365} value={form.days ?? 14} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} className={`${inp} mt-1`} /></label>
            {form.type === 'STATUS_STALE' && (
              <label className="text-xs text-muted-foreground">Status watched
                <select value={form.activityStatus || ''} onChange={(e) => setForm({ ...form, activityStatus: e.target.value })} className={`${inp} mt-1`}><option value="">Choose…</option>{activityOptions.filter((o) => ['DNP', 'FOLLOW_UP', 'DEMO_BOOKED', 'DEMO_OVER'].includes(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              </label>
            )}
            <label className="text-xs text-muted-foreground">Send daily at
              <select value={form.sendHour ?? 9} onChange={(e) => setForm({ ...form, sendHour: Number(e.target.value) })} className={`${inp} mt-1`}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
            </label>
            <label className="text-xs text-muted-foreground md:col-span-2">Admin emails (comma separated — blank uses the Sales report recipients)
              <input value={form.adminEmails || ''} onChange={(e) => setForm({ ...form, adminEmails: e.target.value })} className={`${inp} mt-1`} placeholder="admin@company.com, head@company.com" />
            </label>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.includeMyBase !== false} onChange={(e) => setForm({ ...form, includeMyBase: e.target.checked })} /> Include leads in My Base</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.notifyOwner !== false} onChange={(e) => setForm({ ...form, notifyOwner: e.target.checked })} /> Email each owner</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.notifyAdmins !== false} onChange={(e) => setForm({ ...form, notifyAdmins: e.target.checked })} /> Email admins</label>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy === 'save'} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">Save rule</button>
            <button onClick={() => setForm(null)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          </div>
        </section>
      )}

      <div className="space-y-3">
        {rules.map((r) => (
          <section key={r.id} className={`border rounded-xl p-4 bg-card ${r.active ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">{r.name}</p>
                <p className="text-xs text-muted-foreground">Leads with {r.description}{r.includeMyBase ? ' · includes My Base' : ''}</p>
                <p className="text-xs text-muted-foreground mt-1">Daily {hourLabel(r.sendHour)} → {[r.notifyOwner && 'each owner', r.notifyAdmins && 'admins'].filter(Boolean).join(' + ') || 'nobody'}{r.lastSentOn ? ` · last run ${r.lastSentOn} (${r.lastSentCount ?? 0} leads)` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button onClick={() => toggle(r)} className={`px-3 py-1.5 rounded-lg border ${r.active ? 'text-green-700 border-green-300' : ''}`}>{r.active ? 'On' : 'Off'}</button>
                <button onClick={() => doPreview(r)} disabled={busy === r.id} className="px-3 py-1.5 border rounded-lg">Preview</button>
                <button onClick={() => sendNow(r)} disabled={busy === r.id} className="px-3 py-1.5 border rounded-lg">Send now</button>
                <button onClick={() => setForm(r)} className="px-3 py-1.5 border rounded-lg">Edit</button>
                <button onClick={() => del(r)} className="px-3 py-1.5 border rounded-lg text-red-600">Delete</button>
              </div>
            </div>
            {preview?.id === r.id && (
              <div className="mt-3 pt-3 border-t text-sm">
                <p><b>{preview.total}</b> lead{preview.total === 1 ? '' : 's'} match right now.</p>
                <div className="flex flex-wrap gap-2 mt-2">{preview.perOwner.map((o) => <span key={o.name} className="text-xs bg-slate-100 rounded-full px-3 py-1">{o.name}: <b>{o.count}</b></span>)}</div>
              </div>
            )}
          </section>
        ))}
        {rules.length === 0 && <p className="text-sm text-muted-foreground border rounded-xl p-8 text-center">No rules yet.</p>}
      </div>
    </div>
  );
}

// ── Summaries (Sales Admin): lead assignment, lead stage, source ─────────────
const REPORT_DIMS: { value: string; label: string }[] = [
  { value: 'source', label: 'Data source' }, { value: 'assignedTo', label: 'Lead assigned to' }, { value: 'stage', label: 'Lead stage' },
  { value: 'scout', label: 'Lead Scout' }, { value: 'updateStatus', label: 'Update status' }, { value: 'course', label: 'Course' }, { value: 'city', label: 'City' },
  { value: 'college', label: 'College' }, { value: 'qualification', label: 'Qualification' },
  { value: 'createdMonth', label: 'Created month' }, { value: 'createdDay', label: 'Created date' },
  { value: 'createdBy', label: 'Lead created by' }, { value: 'leadAge', label: 'Lead age' }, { value: 'activityCount', label: 'Activity count' },
  { value: 'lastContact', label: 'Last contact' }, { value: 'followUp', label: 'Follow-up due' },
];
const REPORT_MEASURES: { value: string; label: string }[] = [
  { value: 'leads', label: 'Leads' }, { value: 'activities', label: 'Activities (calls + meetings)' }, { value: 'calls', label: 'Calls' },
  { value: 'meetings', label: 'Meetings' }, { value: 'demos', label: 'Demos booked' }, { value: 'demosDone', label: 'Demos completed' }, { value: 'openTasks', label: 'Open tasks' },
];
interface MetricRow { label: string; total: number; open: number; demoBooked: number; demoOver: number; enrolled: number; lost: number; overdue: number; conversion: number; calls: number; meetings: number; activities: number; avgActivities: number; demos: number; demosDone: number; openTasks: number; noActivity: number; avgAgeDays: number }
interface PivotRow { label: string; cells: Record<string, number>; total: number }
type ReportData = { mode: 'metrics'; total: number; rows: MetricRow[] } | { mode: 'pivot'; measure?: string; total: number; cols: string[]; rows: PivotRow[] };

/** Sales report builder: group leads by any field (and optionally split by a second), filter, export. */
function SalesReportBuilder({ employees }: { employees: EmployeeLite[] }) {
  const [rowsDim, setRowsDim] = useState('source');
  const [colsDim, setColsDim] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [emp, setEmp] = useState('');
  const [measure, setMeasure] = useState('leads');
  const [adv, setAdv] = useState<FilterGroup | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = { rows: rowsDim };
      if (colsDim) { params.cols = colsDim; params.measure = measure; } if (from) params.from = from; if (to) params.to = to; if (emp) params.assignedToId = emp;
      if (adv) params.filter = JSON.stringify(adv);
      const r = await api.get('/api/sales/insights/report', { params });
      setData(r.data.data);
    } catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to build report'); }
    finally { setLoading(false); }
  }, [rowsDim, colsDim, measure, from, to, emp, adv]);
  useEffect(() => { run(); }, [run]);

  const rowLabel = REPORT_DIMS.find((d) => d.value === rowsDim)?.label || 'Group';
  const exportXlsx = () => {
    if (!data) return;
    let out: Record<string, unknown>[];
    if (data.mode === 'metrics') {
      out = data.rows.map((r) => ({ [rowLabel]: r.label, Leads: r.total, Open: r.open, 'Demo booked (status)': r.demoBooked, 'Demo over (status)': r.demoOver, Enrolled: r.enrolled, Lost: r.lost, 'Conversion %': r.conversion, 'Overdue follow-ups': r.overdue, Calls: r.calls, Meetings: r.meetings, 'Avg activities / lead': r.avgActivities, 'Never contacted': r.noActivity, 'Demos booked': r.demos, 'Demos completed': r.demosDone, 'Open tasks': r.openTasks, 'Avg lead age (days)': r.avgAgeDays }));
    } else {
      out = data.rows.map((r) => ({ [rowLabel]: r.label, ...Object.fromEntries(data.cols.map((c) => [c, r.cells[c] || 0])), Total: r.total }));
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), 'Sales report');
    XLSX.writeFile(wb, `sales_report_${rowsDim}${colsDim ? `_by_${colsDim}` : ''}.xlsx`);
  };
  const sel = 'border rounded-lg px-2 py-1.5 text-sm bg-background';
  const th = 'px-3 py-3';
  return (
    <section className="space-y-3 border rounded-xl p-4 bg-card">
      <div className="flex flex-wrap items-end gap-3">
        <h3 className="font-semibold text-sm w-full flex flex-wrap items-center gap-2">Sales report
          <span className="text-xs font-normal text-muted-foreground">Quick views:</span>
          <button onClick={() => { setRowsDim('scout'); setColsDim(''); setAdv(null); }} className="text-xs border rounded-full px-2.5 py-1 text-blue-600 hover:bg-blue-50">Lead Scout scorecard</button>
          <button onClick={() => { setRowsDim('scout'); setColsDim('source'); setMeasure('leads'); setAdv(null); }} className="text-xs border rounded-full px-2.5 py-1 text-blue-600 hover:bg-blue-50">Scout × Source</button>
          <button onClick={() => { setRowsDim('source'); setColsDim(''); setAdv(null); }} className="text-xs border rounded-full px-2.5 py-1 text-blue-600 hover:bg-blue-50">Source performance</button>
        </h3>
        <label className="text-xs text-muted-foreground">Group by
          <select value={rowsDim} onChange={(e) => setRowsDim(e.target.value)} className={`${sel} block mt-1`}>{REPORT_DIMS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        </label>
        <label className="text-xs text-muted-foreground">Split by
          <select value={colsDim} onChange={(e) => setColsDim(e.target.value)} className={`${sel} block mt-1`}>
            <option value="">None (show metrics)</option>
            {REPORT_DIMS.filter((d) => d.value !== rowsDim).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        {colsDim && (
          <label className="text-xs text-muted-foreground">Count
            <select value={measure} onChange={(e) => setMeasure(e.target.value)} className={`${sel} block mt-1`}>{REPORT_MEASURES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
          </label>
        )}
        <label className="text-xs text-muted-foreground">Salesperson
          <select value={emp} onChange={(e) => setEmp(e.target.value)} className={`${sel} block mt-1`}><option value="">All</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select>
        </label>
        <label className="text-xs text-muted-foreground">Created from<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${sel} block mt-1`} /></label>
        <label className="text-xs text-muted-foreground">to<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${sel} block mt-1`} /></label>
        <button onClick={exportXlsx} disabled={!data || data.rows.length === 0} className="text-xs border rounded-lg px-3 py-2 text-blue-600 disabled:text-muted-foreground">Download Excel</button>
      </div>
      <AdvancedFilter scope="leads" fields={leadFilterFields(employees)} value={adv} onChange={setAdv} />
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {loading && <p className="text-sm text-muted-foreground">Building report...</p>}
      {data && (
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              {data.mode === 'metrics' ? (
                <tr><th className={th}>{rowLabel}</th><th className={th}>Leads</th><th className={th}>Share</th><th className={th}>Open</th><th className={th}>Demo booked</th><th className={th}>Demo over</th><th className={th}>Enrolled</th><th className={th}>Lost</th><th className={th}>Conversion</th><th className={th}>Overdue follow-ups</th><th className={th}>Calls</th><th className={th}>Meetings</th><th className={th}>Avg act./lead</th><th className={th}>Never contacted</th><th className={th}>Demos booked</th><th className={th}>Demos done</th><th className={th}>Open tasks</th><th className={th}>Avg age (d)</th></tr>
              ) : (
                <tr><th className={th}>{rowLabel}</th>{data.cols.map((c) => <th key={c} className={th}>{c}</th>)}<th className={th}>Total</th></tr>
              )}
            </thead>
            <tbody className="divide-y">
              {data.mode === 'metrics' ? data.rows.map((r) => (
                <tr key={r.label} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{r.label}</td><td className="px-3 py-2 font-semibold">{r.total}</td>
                  <td className="px-3 py-2 text-xs">{data.total ? Math.round((r.total / data.total) * 1000) / 10 : 0}%</td>
                  <td className="px-3 py-2 text-xs">{r.open}</td><td className="px-3 py-2 text-xs">{r.demoBooked}</td><td className="px-3 py-2 text-xs">{r.demoOver}</td>
                  <td className="px-3 py-2 text-xs text-green-700">{r.enrolled}</td><td className="px-3 py-2 text-xs text-red-600">{r.lost}</td>
                  <td className="px-3 py-2 text-xs font-semibold">{r.conversion}%</td>
                  <td className={`px-3 py-2 text-xs ${r.overdue ? 'text-red-600 font-semibold' : ''}`}>{r.overdue}</td>
                  <td className="px-3 py-2 text-xs">{r.calls}</td><td className="px-3 py-2 text-xs">{r.meetings}</td><td className="px-3 py-2 text-xs">{r.avgActivities}</td>
                  <td className={`px-3 py-2 text-xs ${r.noActivity ? 'text-amber-700 font-semibold' : ''}`}>{r.noActivity}</td>
                  <td className="px-3 py-2 text-xs">{r.demos}</td><td className="px-3 py-2 text-xs">{r.demosDone}</td><td className="px-3 py-2 text-xs">{r.openTasks}</td><td className="px-3 py-2 text-xs">{r.avgAgeDays}</td>
                </tr>
              )) : data.rows.map((r) => (
                <tr key={r.label} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  {data.cols.map((c) => <td key={c} className="px-3 py-2 text-xs">{r.cells[c] || ''}</td>)}
                  <td className="px-3 py-2 font-semibold">{r.total}</td>
                </tr>
              ))}
              {data.rows.length === 0 && !loading && <tr><td colSpan={18} className="px-4 py-6 text-center text-muted-foreground">No leads match</td></tr>}
              {data.rows.length > 0 && (
                <tr className="bg-muted/40 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  {data.mode === 'metrics' ? (<>
                    <td className="px-3 py-2">{data.total}</td><td className="px-3 py-2 text-xs">100%</td>
                    <td className="px-3 py-2 text-xs">{data.rows.reduce((s, r) => s + r.open, 0)}</td>
                    <td className="px-3 py-2 text-xs">{data.rows.reduce((s, r) => s + r.demoBooked, 0)}</td>
                    <td className="px-3 py-2 text-xs">{data.rows.reduce((s, r) => s + r.demoOver, 0)}</td>
                    <td className="px-3 py-2 text-xs">{data.rows.reduce((s, r) => s + r.enrolled, 0)}</td>
                    <td className="px-3 py-2 text-xs">{data.rows.reduce((s, r) => s + r.lost, 0)}</td>
                    <td className="px-3 py-2 text-xs">{data.total ? Math.round((data.rows.reduce((s, r) => s + r.enrolled, 0) / data.total) * 1000) / 10 : 0}%</td>
                    <td className="px-3 py-2 text-xs">{data.rows.reduce((s, r) => s + r.overdue, 0)}</td>
                    {(['calls', 'meetings'] as const).map((k) => <td key={k} className="px-3 py-2 text-xs">{data.rows.reduce((s, r) => s + r[k], 0)}</td>)}
                    <td className="px-3 py-2 text-xs">{data.total ? Math.round(((data.rows.reduce((s, r) => s + r.calls + r.meetings, 0)) / data.total) * 10) / 10 : 0}</td>
                    {(['noActivity', 'demos', 'demosDone', 'openTasks'] as const).map((k) => <td key={k} className="px-3 py-2 text-xs">{data.rows.reduce((s, r) => s + r[k], 0)}</td>)}
                    <td className="px-3 py-2 text-xs">{data.total ? Math.round(data.rows.reduce((s, r) => s + r.avgAgeDays * r.total, 0) / data.total) : 0}</td>
                  </>) : (<>
                    {data.cols.map((c) => <td key={c} className="px-3 py-2 text-xs">{data.rows.reduce((s, r) => s + (r.cells[c] || 0), 0)}</td>)}
                    <td className="px-3 py-2">{data.total}</td>
                  </>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SummariesPanel({ employees }: { employees: EmployeeLite[] }) {
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
      <SalesReportBuilder employees={employees} />
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
          {[...DEFAULT_STATUSES.map((s) => ({ key: s.value, label: s.label })),{ key: 'NONE', label: 'No status yet' }].map((s) => (
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
              {assignment.length === 0 && !loading && <tr><td colSpan={12} className="px-4 py-6 text-center text-muted-foreground">No leads</td></tr>}
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
  const [advFilter, setAdvFilter] = useState<FilterGroup | null>(null);
  useEffect(() => { setPage(1); }, [types, emp, from, to, advFilter]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (types) params.type = types; if (emp) params.employeeId = emp; if (from) params.from = from; if (to) params.to = to;
      if (advFilter) params.filter = JSON.stringify(advFilter);
      const r = await api.get('/api/sales/activity-feed', { params });
      setRows(r.data.data); setMeta(r.data.meta); setPerPerson(r.data.perPerson || []);
    } catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load activity'); }
    finally { setLoading(false); }
  }, [page, types, emp, from, to, advFilter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelect label="Activity type" value={types} onChange={setTypes} options={FEED_TYPES} />
        <AdvancedFilter scope="activity" fields={feedFilterFields(employees)} value={advFilter} onChange={setAdvFilter} />
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
        <p className="text-xs text-muted-foreground">Online demos hosted in the portal. Watch any running demo silently, and approve reopen requests once the 2 hours are over.</p>
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
/** Copy / WhatsApp-share the student's Demo Session link (works even when the student has no email). */
function DemoShare({ code, leadName, phone, when, course }: { code: string; leadName: string; phone: string; when: string; course: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/demo-join?code=${code}`;
  const text = `Hi ${leadName}, your Demo Session${course ? ` for ${course}` : ''} at Vinsup Skill Academy is on ${formatDateTime(when)}.\n\nJoin link: ${link}\nAccess code: ${code}\n\nOpen the link at the scheduled time and enter your email address and the code. Please keep your camera and microphone ready.`;
  const digits = phone.replace(/\D/g, '');
  const wa = `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}?text=${encodeURIComponent(text)}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-muted-foreground">
      <span>Code: <span className="font-mono">{code}</span></span>
      <button onClick={() => { navigator.clipboard?.writeText(`${link}\nAccess code: ${code}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-foreground hover:bg-muted/50">
        <Copy className="w-3 h-3" /> {copied ? 'Copied' : 'Copy link'}
      </button>
      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50">
        <MessageCircle className="w-3 h-3" /> Share on WhatsApp
      </a>
    </span>
  );
}

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
  const colCount = (extraCol ? 6 : 5) + (status === 'COMPLETED' ? 1 : 0);

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
              {status === 'COMPLETED' && <th className="px-3 py-3">Student review</th>}
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
                {status === 'COMPLETED' && <td className="px-3 py-3"><ReleaseFeedbackButton demoId={d.id} /></td>}
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
function CallLogPanel({ onOpenLead, employees }: { onOpenLead: (id: string) => void; employees: EmployeeLite[] }) {
  const [advFilter, setAdvFilter] = useState<FilterGroup | null>(null);
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
      if (advFilter) params.filter = JSON.stringify(advFilter);
      const res = await api.get('/api/sales/call-log', { params });
      setLogs(res.data.data);
      setMeta(res.data.meta);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load call log');
    } finally {
      setLoading(false);
    }
  }, [page, date, appliedPhone, advFilter]);
  useEffect(() => { setPage(1); }, [advFilter]);

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
            disabled={!!appliedPhone || !!advFilter}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <AdvancedFilter scope="callLog" fields={callFilterFields(employees)} value={advFilter} onChange={setAdvFilter} />
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
        {advFilter ? 'Filtered call log (all dates unless the filter limits them)' : appliedPhone ? `Full call history for ${appliedPhone}` : `Calls on ${formatDate(date)}`} — {meta?.total ?? 0} call{meta?.total === 1 ? '' : 's'}
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
              <tr><td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">No calls found</td></tr>
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
                      : <div className="flex items-center gap-3"><RecordingPlayer url={c.recordingUrl} />{c.recordingUrl && <TranscriptButton type="CALL" id={c.id} />}</div>}
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
function TeamsPanel({ employees }: { employees: EmployeeLite[] }) {
  const [map, setMap] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const load = useCallback(() => { api.get('/api/sales/team-map').then((r) => setMap(Object.fromEntries((r.data.data as { employeeId: string; tlId: string }[]).map((m) => [m.employeeId, m.tlId])))).catch(() => setError('Could not load the team mapping')); }, []);
  useEffect(() => { load(); }, [load]);
  const name = (id: string) => { const e = employees.find((x) => x.id === id); return e ? `${e.firstName} ${e.lastName}` : '—'; };
  const set = async (employeeId: string, tlId: string) => {
    setSaving(employeeId); setError('');
    try { await api.put('/api/sales/team-map', { employeeId, tlId }); load(); }
    catch (err) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Could not save'); }
    finally { setSaving(''); }
  };
  const tlIds = new Set(Object.values(map));
  const teams = [...tlIds].map((id) => ({ id, members: Object.keys(map).filter((k) => map[k] === id) }));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Pick the Team Lead for each sales person. The TL columns in Report Sheets (BRD Tracker, Revenue Consideration) follow this mapping.</p>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Sales person</th><th className="px-3 py-2">Team Lead</th></tr></thead>
            <tbody className="divide-y">
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2">{e.firstName} {e.lastName}{tlIds.has(e.id) && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">TL</span>}</td>
                  <td className="px-3 py-2">
                    <select disabled={saving === e.id} value={map[e.id] || ''} onChange={(ev) => set(e.id, ev.target.value)} className="px-2 py-1.5 border rounded-lg text-sm bg-background">
                      <option value="">{tlIds.has(e.id) ? '— (is a Team Lead)' : 'No team (Direct Reporting)'}</option>
                      {employees.filter((t) => t.id !== e.id && !map[t.id]).map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3">
          {teams.length === 0 ? <p className="text-sm text-muted-foreground">No teams yet — choose a Team Lead against a sales person.</p> : teams.map((t) => (
            <div key={t.id} className="bg-card border rounded-xl p-3">
              <p className="font-semibold text-sm">{name(t.id)}'s team <span className="text-xs font-normal text-muted-foreground">({t.members.length})</span></p>
              <p className="text-xs text-muted-foreground mt-1">{t.members.map(name).join(', ')}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

// ── Config: lead scouts, sources, stages, update statuses, lost reasons ───────
type CfgKindUrl = 'scout' | 'source' | 'stage' | 'status' | 'lost-reason';
const CFG_SECTIONS: { id: CfgKindUrl; kind: 'SCOUT' | 'SOURCE' | 'STAGE' | 'STATUS' | 'LOST_REASON'; label: string; hint: string; listKey: keyof CfgData }[] = [
  { id: 'scout', kind: 'SCOUT', label: 'Lead Scouts', hint: 'The people who bring in leads (e.g. the four members working Meta leads). Pick one on each lead to see how many of their leads enrol.', listKey: 'scouts' },
  { id: 'source', kind: 'SOURCE', label: 'Lead sources', hint: 'Where a lead came from (Meta, Instagram, Referral…). Renaming a source also renames it on existing leads.', listKey: 'sources' },
  { id: 'stage', kind: 'STAGE', label: 'Lead stages', hint: 'Pipeline stages. A custom stage must count as one of the built-in stages so reports and targets keep working.', listKey: 'stages' },
  { id: 'status', kind: 'STATUS', label: 'Update statuses', hint: 'The status chosen when logging a call or meeting. Choose which stage it moves the lead to and what it behaves like.', listKey: 'statuses' },
  { id: 'lost-reason', kind: 'LOST_REASON', label: 'Lost / not-interested reasons', hint: 'Reasons offered when a lead is marked lost.', listKey: 'lostReasons' },
];
const BASE_STAGE_OPTS = ['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'DEMO_DONE', 'NEGOTIATION', 'ENROLLED', 'LOST'];
const BASE_STATUS_OPTS = [{ v: 'DNP', l: 'DNP (did not pick)' }, { v: 'FOLLOW_UP', l: 'Follow-up' }, { v: 'DEMO_BOOKED', l: 'Demo booked (books a demo)' }, { v: 'DEMO_OVER', l: 'Demo over' }, { v: 'NOT_INTERESTED', l: 'Not interested (closes lead)' }, { v: 'DISQUALIFIED', l: 'Disqualified (asks a reason)' }];
const BASE_REASON_OPTS = [{ v: 'NOT_INTERESTED', l: 'Not interested' }, { v: 'INVALID_NUMBER', l: 'Invalid number' }, { v: 'UNREACHABLE', l: 'Unreachable' }, { v: 'DUPLICATE', l: 'Duplicate' }, { v: 'OTHER', l: 'Other' }];

function ConfigPanel({ cfg, reload }: { cfg: CfgData; reload: () => Promise<void> }) {
  const [section, setSection] = useState<CfgKindUrl>('scout');
  const [all, setAll] = useState<CfgData>(EMPTY_CFG);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CfgItem | 'new' | null>(null);
  const [form, setForm] = useState({ label: '', base: '', color: '', targetStageKey: '', needsFollowUp: true, notesRequired: true });
  const sec = CFG_SECTIONS.find((s) => s.id === section)!;
  const items: CfgItem[] = (all[sec.listKey] as CfgItem[]) || [];
  const hasColor = section === 'stage' || section === 'status' || section === 'scout';
  const msg = (err: unknown, fallback: string) => (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

  const loadAll = useCallback(async () => {
    try { const r = await api.get('/api/sales/config', { params: { all: '1' } }); setAll(r.data.data); }
    catch (err) { setError(msg(err, 'Failed to load config')); }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll, cfg]);

  const afterChange = async () => { await loadAll(); await reload(); };
  const startNew = () => {
    setError('');
    setForm({ label: '', base: section === 'stage' ? 'CONTACTED' : section === 'status' ? 'FOLLOW_UP' : section === 'lost-reason' ? 'OTHER' : '', color: '', targetStageKey: 'CONTACTED', needsFollowUp: true, notesRequired: true });
    setEditing('new');
  };
  const startEdit = (it: CfgItem) => {
    setError('');
    setForm({ label: it.label, base: it.base || '', color: it.color || '', targetStageKey: it.targetStageKey || '', needsFollowUp: !!it.needsFollowUp, notesRequired: it.notesRequired !== false });
    setEditing(it);
  };
  const save = async () => {
    if (!form.label.trim()) { setError('Give it a name'); return; }
    setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = { label: form.label.trim(), color: form.color || undefined };
      if (editing && editing !== 'new') body.active = editing.active;
      if (section === 'stage' || section === 'lost-reason') body.base = form.base;
      if (section === 'status') Object.assign(body, { base: form.base, targetStageKey: form.targetStageKey, needsFollowUp: form.needsFollowUp, notesRequired: form.notesRequired });
      if (editing === 'new') await api.post(`/api/sales/config/${section}`, body);
      else if (editing) await api.put(`/api/sales/config/${section}/${editing.id}`, body);
      setEditing(null);
      await afterChange();
    } catch (err) { setError(msg(err, 'Failed to save')); }
    finally { setBusy(false); }
  };
  const toggle = async (it: CfgItem) => {
    setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = { label: it.label, active: !it.active, color: it.color || undefined };
      if (section === 'stage' || section === 'lost-reason') body.base = it.base;
      if (section === 'status') Object.assign(body, { base: it.base, targetStageKey: it.targetStageKey, needsFollowUp: it.needsFollowUp, notesRequired: it.notesRequired });
      await api.put(`/api/sales/config/${section}/${it.id}`, body);
      await afterChange();
    } catch (err) { setError(msg(err, 'Failed to update')); }
    finally { setBusy(false); }
  };
  const move = async (idx: number, dir: -1 | 1) => {
    const a = items[idx]; const b = items[idx + dir];
    if (!a || !b) return;
    setBusy(true); setError('');
    const full = (it: CfgItem, sortOrder: number) => ({ label: it.label, active: it.active, color: it.color || undefined, sortOrder, base: it.base || undefined, targetStageKey: it.targetStageKey || undefined, needsFollowUp: it.needsFollowUp, notesRequired: it.notesRequired });
    try {
      await api.put(`/api/sales/config/${section}/${a.id}`, full(a, b.sortOrder === a.sortOrder ? b.sortOrder + dir : b.sortOrder));
      await api.put(`/api/sales/config/${section}/${b.id}`, full(b, a.sortOrder));
      await afterChange();
    } catch (err) { setError(msg(err, 'Failed to reorder')); }
    finally { setBusy(false); }
  };
  const remove = async (it: CfgItem) => {
    if (!window.confirm(`Delete "${it.label}"?`)) return;
    setBusy(true); setError('');
    try { await api.delete(`/api/sales/config/${section}/${it.id}`); await afterChange(); }
    catch (err) { setError(msg(err, 'Failed to delete')); }
    finally { setBusy(false); }
  };

  const inp = 'px-3 py-2 border rounded-lg text-sm bg-background';
  const baseLabel = (it: CfgItem) => {
    if (!it.base) return '';
    if (section === 'status') return BASE_STATUS_OPTS.find((o) => o.v === it.base)?.l.split(' (')[0] ?? it.base;
    if (section === 'lost-reason') return BASE_REASON_OPTS.find((o) => o.v === it.base)?.l ?? it.base;
    return it.base.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CFG_SECTIONS.map((s) => (
          <button key={s.id} onClick={() => { setSection(s.id); setEditing(null); setError(''); }}
            className={`px-3 py-1.5 rounded-full text-sm border ${section === s.id ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-muted/50'}`}>{s.label}</button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{sec.hint}</p>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="flex justify-end">
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"><Plus className="w-4 h-4" /> Add {sec.label.replace(/s$/, '').toLowerCase()}</button>
      </div>

      {editing && (
        <div className="border rounded-xl p-4 bg-muted/20 space-y-3">
          <h3 className="font-semibold text-sm">{editing === 'new' ? 'Add new' : `Edit "${editing.label}"`}</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">Name *
              <input className={`${inp} block mt-1 w-56`} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} autoFocus />
            </label>
            {section === 'stage' && (
              <label className="text-xs text-muted-foreground">Counts as (for reports)
                <select disabled={editing !== 'new' && editing.system} className={`${inp} block mt-1`} value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })}>
                  {BASE_STAGE_OPTS.map((b) => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
            )}
            {section === 'status' && (
              <>
                <label className="text-xs text-muted-foreground">Behaves like
                  <select disabled={editing !== 'new' && editing.system} className={`${inp} block mt-1`} value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })}>
                    {BASE_STATUS_OPTS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">Moves lead to stage
                  <select className={`${inp} block mt-1`} value={form.targetStageKey} onChange={(e) => setForm({ ...form, targetStageKey: e.target.value })}>
                    {(all.stages.filter((s) => s.active)).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground flex items-center gap-2 pb-2"><input type="checkbox" checked={form.needsFollowUp} onChange={(e) => setForm({ ...form, needsFollowUp: e.target.checked })} /> Ask for follow-up date</label>
                <label className="text-xs text-muted-foreground flex items-center gap-2 pb-2"><input type="checkbox" checked={form.notesRequired} onChange={(e) => setForm({ ...form, notesRequired: e.target.checked })} /> Notes required</label>
              </>
            )}
            {section === 'lost-reason' && (
              <label className="text-xs text-muted-foreground">Counts as (for reports)
                <select disabled={editing !== 'new' && editing.system} className={`${inp} block mt-1`} value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })}>
                  {BASE_REASON_OPTS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
                </select>
              </label>
            )}
            {hasColor && (
              <label className="text-xs text-muted-foreground">Colour
                <select className={`${inp} block mt-1`} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
                  <option value="">Default</option>
                  {(all.colors.length ? all.colors : Object.keys(CFG_COLOR)).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
            <button onClick={save} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3 w-20">Order</th><th className="px-3 py-3">Name</th>
              {(section === 'stage' || section === 'status' || section === 'lost-reason') && <th className="px-3 py-3">Counts as</th>}
              {section === 'status' && <th className="px-3 py-3">Moves to stage</th>}
              <th className="px-3 py-3">Type</th><th className="px-3 py-3">Active</th><th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nothing here yet — add the first one.</td></tr>
            ) : items.map((it, i) => (
              <tr key={it.id} className={it.active ? '' : 'opacity-60'}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button disabled={busy || i === 0} onClick={() => move(i, -1)} className="px-1 text-muted-foreground disabled:opacity-30">▲</button>
                  <button disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} className="px-1 text-muted-foreground disabled:opacity-30">▼</button>
                </td>
                <td className="px-3 py-2 font-medium">
                  <span className={`text-xs rounded-full px-2 py-1 ${(it.color && CFG_COLOR[it.color]) || 'bg-slate-100 text-slate-700'}`}>{it.label}</span>
                </td>
                {(section === 'stage' || section === 'status' || section === 'lost-reason') && <td className="px-3 py-2 text-xs text-muted-foreground">{baseLabel(it)}</td>}
                {section === 'status' && <td className="px-3 py-2 text-xs text-muted-foreground">{it.targetStageKey ? (all.stages.find((s) => s.key === it.targetStageKey)?.label ?? it.targetStageKey) : '—'}</td>}
                <td className="px-3 py-2 text-xs text-muted-foreground">{it.system ? 'Built-in' : 'Custom'}</td>
                <td className="px-3 py-2">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={it.active} disabled={busy || (section === 'stage' && ['NEW', 'ENROLLED', 'LOST'].includes(it.key))} onChange={() => toggle(it)} />
                    {it.active ? 'On' : 'Off'}
                  </label>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  <button onClick={() => startEdit(it)} className="text-xs text-blue-600 hover:underline mr-3">Edit</button>
                  {!it.system && <button onClick={() => remove(it)} className="text-xs text-red-600 hover:underline">Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Items already used on leads can't be deleted — switch them off to hide them from dropdowns while keeping history and reports intact.</p>
    </div>
  );
}

// ── Transcripts (free Whisper: calls + online demos, Tamil / English) ─────────
interface TranscriptData {
  id: string; status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'; text: string | null; language: string | null; durationSec: number | null;
  segments: { start: number; end: number; text: string }[] | null; summary: string | null; actionItems: string[] | null; topics: string[] | null; error: string | null;
}
const LANG_NAME: Record<string, string> = { ta: 'Tamil', en: 'English', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada' };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function TranscriptButton({ type, id, label = 'Transcript' }: { type: 'CALL' | 'DEMO'; id: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-purple-600 hover:underline inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {label}</button>
      {open && <TranscriptModal type={type} id={id} onClose={() => setOpen(false)} />}
    </>
  );
}

function TranscriptModal({ type, id, onClose }: { type: 'CALL' | 'DEMO'; id: string; onClose: () => void }) {
  const [t, setT] = useState<TranscriptData | null>(null);
  const [meta, setMeta] = useState<{ enabled: boolean; hasAudio: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSegs, setShowSegs] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api.get(`/api/sales/transcripts/${type}/${id}`);
      setT(r.data.data); setMeta(r.data.meta);
    } catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load transcript'); }
  }, [type, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!t || (t.status !== 'PENDING' && t.status !== 'PROCESSING')) return;
    const h = setInterval(load, 8000);
    return () => clearInterval(h);
  }, [t, load]);
  const run = async () => {
    setBusy(true); setError('');
    try { await api.post(`/api/sales/transcripts/${type}/${id}/run`); await load(); }
    catch (err: unknown) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Could not start transcription'); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{type === 'DEMO' ? 'Demo' : 'Call'} transcript</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
        {!t && meta && (
          <div className="space-y-3 text-sm">
            {!meta.enabled ? <p className="text-muted-foreground">Transcription isn't switched on yet. An admin needs to start the Whisper service and set <code>WHISPER_URL</code> on the server.</p>
              : !meta.hasAudio ? <p className="text-muted-foreground">There is no recording for this {type === 'DEMO' ? 'demo' : 'call'} yet, so there is nothing to transcribe.</p>
              : <><p className="text-muted-foreground">Not transcribed yet.</p><button onClick={run} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white disabled:opacity-50">{busy ? 'Queuing…' : 'Transcribe now'}</button></>}
          </div>
        )}
        {t && (t.status === 'PENDING' || t.status === 'PROCESSING') && (
          <p className="text-sm text-muted-foreground">{t.status === 'PENDING' ? 'Waiting in the queue…' : 'Transcribing…'} This page refreshes by itself; long recordings take a few minutes.</p>
        )}
        {t?.status === 'FAILED' && (
          <div className="space-y-2 text-sm">
            <p className="text-red-600">Transcription failed{t.error ? `: ${t.error}` : '.'}</p>
            <button onClick={run} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white disabled:opacity-50">Try again</button>
          </div>
        )}
        {t?.status === 'DONE' && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {t.language ? `${LANG_NAME[t.language] || t.language} · ` : ''}{t.durationSec ? `${clock(t.durationSec)} min` : ''}
            </p>
            {t.summary && (
              <div className="rounded-lg border bg-purple-50/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-purple-700">AI summary</p>
                <p className="text-sm">{t.summary}</p>
                {t.actionItems && t.actionItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-purple-700 mt-2">Action items</p>
                    <ul className="list-disc pl-5 text-sm space-y-0.5">{t.actionItems.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  </div>
                )}
                {t.topics && t.topics.length > 0 && <div className="flex flex-wrap gap-1 pt-1">{t.topics.map((x, i) => <span key={i} className="text-[11px] bg-white border rounded-full px-2 py-0.5">{x}</span>)}</div>}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-muted-foreground">Transcript</p>
                <div className="flex gap-3 text-xs">
                  {t.segments && t.segments.length > 0 && <button onClick={() => setShowSegs(!showSegs)} className="text-blue-600 hover:underline">{showSegs ? 'Plain text' : 'With timestamps'}</button>}
                  <button onClick={() => navigator.clipboard?.writeText(t.text || '')} className="text-blue-600 hover:underline">Copy</button>
                  <button onClick={run} disabled={busy} className="text-muted-foreground hover:underline">Re-run</button>
                </div>
              </div>
              {showSegs && t.segments ? (
                <div className="space-y-1 text-sm">{t.segments.map((s, i) => <p key={i}><span className="text-xs text-muted-foreground font-mono mr-2">{clock(s.start)}</span>{s.text}</p>)}</div>
              ) : <p className="text-sm whitespace-pre-wrap">{t.text}</p>}
            </div>
            {!t.summary && <p className="text-xs text-muted-foreground">Summaries and action items appear here once a free Gemini API key is added on the server.</p>}
          </div>
        )}
        {!t && !meta && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      </div>
    </div>
  );
}

interface TranscriptRow {
  id: string; sourceType: 'CALL' | 'DEMO'; sourceId: string; createdAt: string; durationSec: number | null; language: string | null; summary: string | null;
  topics: string[] | null; snippet: string; lead: { id: string; name: string; phone: string } | null; owner: string | null;
}
/** Search everything that was said on calls and demos. */
function TranscriptsPanel({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TranscriptRow[]>([]);
  const [meta, setMeta] = useState<{ total: number; pages: number } | null>(null);
  const [status, setStatus] = useState<{ enabled: boolean; summaries: boolean; pending: number; processing: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<TranscriptRow | null>(null);
  const run = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page) };
      if (q.trim()) params.q = q.trim(); if (type) params.type = type; if (from) params.from = from; if (to) params.to = to;
      const [r, s] = await Promise.all([api.get('/api/sales/transcripts', { params }), api.get('/api/sales/transcripts/status')]);
      setRows(r.data.data); setMeta(r.data.meta); setStatus(s.data.data);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [q, type, from, to, page]);
  useEffect(() => { const h = setTimeout(run, 300); return () => clearTimeout(h); }, [run]);
  useEffect(() => { setPage(1); }, [q, type, from, to]);
  const hi = (text: string) => {
    const k = q.trim(); if (!k) return text;
    const i = text.toLowerCase().indexOf(k.toLowerCase()); if (i < 0) return text;
    return <>{text.slice(0, i)}<mark className="bg-yellow-200">{text.slice(i, i + k.length)}</mark>{text.slice(i + k.length)}</>;
  };
  return (
    <div className="space-y-4">
      {status && !status.enabled && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">Transcription is not switched on yet — an admin must start the Whisper service and set WHISPER_URL on the server (see whisper-service/README.md).</div>
      )}
      {status?.enabled && (status.pending + status.processing > 0 || status.failed > 0) && (
        <p className="text-xs text-muted-foreground">{status.pending + status.processing} in queue{status.failed ? ` · ${status.failed} failed` : ''}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search what was said (fees, placement, வேலை…)" className="px-3 py-2 border rounded-lg text-sm w-80" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="">Calls + demos</option><option value="CALL">Calls</option><option value="DEMO">Demos</option></select>
        <label className="text-xs text-muted-foreground flex items-center gap-1">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" /></label>
        <label className="text-xs text-muted-foreground flex items-center gap-1">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1.5 border rounded-lg text-sm" /></label>
      </div>
      <div className="space-y-2">
        {loading && rows.length === 0 ? <p className="text-sm text-muted-foreground">Loading…</p>
          : rows.length === 0 ? <p className="text-sm text-muted-foreground">No transcripts found.</p>
          : rows.map((r) => (
            <div key={r.id} className="border rounded-xl p-3 bg-card space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{r.sourceType === 'DEMO' ? 'Demo' : 'Call'}</span>
                  {r.lead && <> · <button onClick={() => onOpenLead(r.lead!.id)} className="text-blue-600 hover:underline">{r.lead.name}</button></>}
                  {r.owner && <> · {r.owner}</>}{r.language ? ` · ${LANG_NAME[r.language] || r.language}` : ''}{r.durationSec ? ` · ${clock(r.durationSec)}` : ''}
                </span>
                <span>{formatDateTime(r.createdAt)}</span>
              </div>
              {r.summary && <p className="text-sm">{r.summary}</p>}
              <p className="text-xs text-muted-foreground">{hi(r.snippet)}</p>
              <div className="flex items-center gap-3 pt-1">
                {r.topics && r.topics.length > 0 && <div className="flex flex-wrap gap-1">{r.topics.map((x, i) => <span key={i} className="text-[11px] bg-muted/50 rounded-full px-2 py-0.5">{x}</span>)}</div>}
                <button onClick={() => setOpen(r)} className="ml-auto text-xs font-medium text-purple-600 hover:underline">Open transcript</button>
              </div>
            </div>
          ))}
      </div>
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40">Prev</button>
          <span className="text-xs text-muted-foreground">Page {page} of {meta.pages} · {meta.total} results</span>
          <button disabled={page >= meta.pages} onClick={() => setPage(page + 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40">Next</button>
        </div>
      )}
      {open && <TranscriptModal type={open.sourceType} id={open.sourceId} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ── Dashboard: one-screen snapshot for a salesperson (own numbers) or Sales Admin (team, or one person) ──
interface DashData {
  admin: boolean; scope: 'me' | 'team' | 'person';
  today: { calls: number; talkMinutes: number; demos: number; followUps: number; overdue: number; tasks: number; pendingOutcome: number; untouchedNew: number };
  month: { newLeads: number; enrolled: number; demosDone: number; goal: number; revenueGoal: number; dayOfMonth: number; daysInMonth: number };
  funnel: Record<string, number>; openTotal: number;
  money?: { collectedMonth: number; awaitingAmount: number; awaitingCount: number; overdueAmount: number; overdueCount: number; onboardedMonth?: number; onboardedFullyPaid?: number };
  callsTrend: { date: string; count: number }[];
  sources: { source: string; leads: number; enrolled: number; rate: number }[];
  pool: number;
  team: { employeeId: string; name: string; open: number; overdue: number; callsToday: number; onboarded?: number; enrolled: number; goal: number }[];
}
function DashboardPanel({ isAdmin, employees, go }: { isAdmin: boolean; employees: EmployeeLite[]; go: (t: Tab) => void }) {
  const [data, setData] = useState<DashData | null>(null);
  const [emp, setEmp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true); setError('');
    api.get('/api/sales/dashboard', { params: emp ? { employeeId: emp } : {} })
      .then((r) => setData(r.data.data))
      .catch((err: unknown) => setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load the dashboard'))
      .finally(() => setLoading(false));
  }, [emp]);

  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>;
  if (!data) return <p className="text-sm text-muted-foreground py-8 text-center">{loading ? 'Loading dashboard…' : ''}</p>;

  const t = data.today, m = data.month;
  const expected = m.goal ? Math.round((m.goal * m.dayOfMonth) / m.daysInMonth) : 0;
  const pct = m.goal ? Math.min(100, Math.round((m.enrolled / m.goal) * 100)) : 0;
  const pace = m.goal ? (m.enrolled >= expected ? 'On track' : `${expected - m.enrolled} behind pace`) : '';
  const maxCalls = Math.max(1, ...data.callsTrend.map((c) => c.count));
  const funnelOrder = CFG.stages.length ? CFG.stages.filter((x) => x.active && x.base !== 'LOST').map((x) => x.key) : ['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'DEMO_DONE', 'NEGOTIATION', 'ENROLLED'];
  const funnelMax = Math.max(1, ...funnelOrder.map((k) => data.funnel[k] || 0));
  const tile = (label: string, value: number | string, sub: string, tone: string, onClick?: () => void) => (
    <button onClick={onClick} disabled={!onClick} className={`text-left rounded-xl border p-4 bg-card ${onClick ? 'hover:shadow-sm' : 'cursor-default'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${tone}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-lg">{data.scope === 'team' ? 'Team dashboard' : data.scope === 'person' ? 'Salesperson view' : 'My dashboard'}</h2>
          <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        {isAdmin && (
          <select value={emp} onChange={(e) => setEmp(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
            <option value="">Whole team</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </select>
        )}
      </div>

      {(t.overdue > 0 || t.pendingOutcome > 0) && (
        <div className="flex flex-wrap gap-2">
          {t.overdue > 0 && <button onClick={() => go('today')} className="text-sm rounded-lg border border-red-300 bg-red-50 text-red-800 px-3 py-2"><b>{t.overdue}</b> overdue follow-up{t.overdue === 1 ? '' : 's'} — act on them first</button>}
          {t.pendingOutcome > 0 && <button onClick={() => go(isAdmin ? 'leads' : 'demoBooked')} className="text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2"><b>{t.pendingOutcome}</b> demo{t.pendingOutcome === 1 ? '' : 's'} waiting for an outcome</button>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tile('Calls today', t.calls, `${t.talkMinutes} min talk time`, 'text-blue-600', () => go('callLog'))}
        {tile('Follow-ups due today', t.followUps, t.overdue ? `+ ${t.overdue} overdue` : 'nothing overdue', t.overdue ? 'text-red-600' : 'text-foreground', () => go('today'))}
        {tile('Demos today', t.demos, 'scheduled for today', 'text-purple-600', () => go(isAdmin ? 'liveDemos' : 'demoBooked'))}
        {tile('Open tasks due', t.tasks, 'incl. follow-ups & demos', 'text-foreground', () => go(isAdmin ? 'tasks' : 'reminders'))}
      </div>

      {data.money && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tile('Collected this month', formatCurrency(data.money.collectedMonth), 'verified by Finance', 'text-green-700', () => go('collections'))}
          {tile('Waiting for Finance', formatCurrency(data.money.awaitingAmount), `${data.money.awaitingCount} payment${data.money.awaitingCount === 1 ? '' : 's'} to verify`, 'text-amber-700', () => go('collections'))}
          {tile('Overdue fees', formatCurrency(data.money.overdueAmount), `${data.money.overdueCount} instalment${data.money.overdueCount === 1 ? '' : 's'} to chase`, data.money.overdueCount ? 'text-red-600' : 'text-foreground', () => go('collections'))}
          {tile('Onboarded this month', String(data.money.onboardedMonth ?? 0), `${data.money.onboardedFullyPaid ?? 0} fully paid (${data.money.onboardedMonth ? Math.round(((data.money.onboardedFullyPaid ?? 0) / data.money.onboardedMonth) * 100) : 0}%)`, 'text-blue-700', () => go('collections'))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="border rounded-xl bg-card p-4 space-y-3 lg:col-span-1">
          <h3 className="font-semibold text-sm">This month</h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-2xl font-bold">{m.newLeads}</p><p className="text-[11px] text-muted-foreground">New leads</p></div>
            <div><p className="text-2xl font-bold">{m.demosDone}</p><p className="text-[11px] text-muted-foreground">Demos done</p></div>
            <div><p className="text-2xl font-bold text-green-600">{m.enrolled}</p><p className="text-[11px] text-muted-foreground">Enrolled</p></div>
          </div>
          {m.goal > 0 ? (
            <div className="space-y-1">
              <div className="flex justify-between text-xs"><span>Target {m.enrolled}/{m.goal}</span><span className={m.enrolled >= expected ? 'text-green-700' : 'text-amber-700'}>{pace}</span></div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden relative">
                <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                <div className="absolute top-0 bottom-0 w-0.5 bg-slate-500" style={{ left: `${Math.min(100, Math.round((expected / m.goal) * 100))}%` }} title="Where you should be today" />
              </div>
              <p className="text-[11px] text-muted-foreground">The dark tick is where you should be by today.</p>
            </div>
          ) : <p className="text-xs text-muted-foreground">No enrolment target set for this month.</p>}
        </section>

        <section className="border rounded-xl bg-card p-4 space-y-2 lg:col-span-1">
          <h3 className="font-semibold text-sm">Pipeline <span className="text-muted-foreground font-normal">· {data.openTotal} open</span></h3>
          {funnelOrder.map((k) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-28 text-muted-foreground truncate">{stageLabel(k)}</span>
              <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-blue-500/80" style={{ width: `${((data.funnel[k] || 0) / funnelMax) * 100}%` }} /></div>
              <span className="w-8 text-right font-medium">{data.funnel[k] || 0}</span>
            </div>
          ))}
        </section>

        <section className="border rounded-xl bg-card p-4 space-y-2 lg:col-span-1">
          <h3 className="font-semibold text-sm">Calls — last 7 days</h3>
          <div className="flex items-end gap-2 h-28">
            {data.callsTrend.map((c) => (
              <div key={c.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[10px] text-muted-foreground">{c.count || ''}</span>
                <div className="w-full rounded-t bg-blue-500/80" style={{ height: `${Math.max(3, (c.count / maxCalls) * 100)}%` }} />
                <span className="text-[10px] text-muted-foreground">{new Date(`${c.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="border rounded-xl bg-card p-4 space-y-2">
          <h3 className="font-semibold text-sm">Best sources <span className="text-muted-foreground font-normal">· last 30 days</span></h3>
          {data.sources.length === 0 ? <p className="text-xs text-muted-foreground">No leads in the last 30 days.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Source</th><th>Leads</th><th>Enrolled</th><th>Conversion</th></tr></thead>
              <tbody className="divide-y">
                {data.sources.map((s) => <tr key={s.source}><td className="py-1.5">{s.source}</td><td>{s.leads}</td><td>{s.enrolled}</td><td className={s.rate >= 10 ? 'text-green-700 font-medium' : ''}>{s.rate}%</td></tr>)}
              </tbody>
            </table>
          )}
        </section>

        {data.scope === 'team' ? (
          <section className="border rounded-xl bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Team</h3>
              {data.pool > 0 && <button onClick={() => go('myBase')} className="text-xs text-blue-600 hover:underline">{data.pool} unassigned in My Base →</button>}
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Name</th><th>Open</th><th>Overdue</th><th>Calls today</th><th>Onboarded</th><th>Enrolled</th></tr></thead>
              <tbody className="divide-y">
                {data.team.map((p) => (
                  <tr key={p.employeeId} className="cursor-pointer hover:bg-muted/30" onClick={() => setEmp(p.employeeId)}>
                    <td className="py-1.5">{p.name}</td><td>{p.open}</td>
                    <td className={p.overdue ? 'text-red-600 font-medium' : ''}>{p.overdue}</td>
                    <td className={p.callsToday === 0 ? 'text-amber-700' : ''}>{p.callsToday}</td>
                    <td>{p.onboarded ?? 0}</td>
                    <td>{p.enrolled}{p.goal ? <span className="text-muted-foreground">/{p.goal}</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted-foreground">Click a name to see their dashboard.</p>
          </section>
        ) : (
          <section className="border rounded-xl bg-card p-4 space-y-2">
            <h3 className="font-semibold text-sm">Needs attention</h3>
            <ul className="text-sm space-y-1.5">
              <li className="flex justify-between"><span>New leads never contacted</span><b>{t.untouchedNew}</b></li>
              <li className="flex justify-between"><span>Overdue follow-ups</span><b className={t.overdue ? 'text-red-600' : ''}>{t.overdue}</b></li>
              <li className="flex justify-between"><span>Demos awaiting outcome</span><b>{t.pendingOutcome}</b></li>
            </ul>
            <button onClick={() => go('today')} className="mt-1 text-xs text-blue-600 hover:underline">Open my Today list →</button>
          </section>
        )}
      </div>
    </div>
  );
}

// ── Collections board: what Finance is checking, what is overdue, what falls due soon ──
interface CollRow { id: string; amount: number; dueDate: string; status: string; paidAt?: string | null; mode?: string | null; reference?: string | null; collectedBy?: EmployeeLite | null; course: string; lead: { id: string; name: string; phone: string; assignedTo?: EmployeeLite | null } }
function CollectionsPanel({ isAdmin, employees, onOpenLead }: { isAdmin: boolean; employees: EmployeeLite[]; onOpenLead: (id: string) => void }) {
  const [data, setData] = useState<{ awaiting: CollRow[]; overdue: CollRow[]; upcoming: CollRow[] } | null>(null);
  const [emp, setEmp] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/api/sales/collections', { params: emp ? { employeeId: emp } : {} }).then((r) => setData(r.data.data))
      .catch((err: unknown) => setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load collections'));
  }, [emp]);
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>;
  if (!data) return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  const sum = (l: CollRow[]) => l.reduce((n, x) => n + x.amount, 0);
  const days = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  const block = (title: string, cls: string, list: CollRow[], kind: 'awaiting' | 'overdue' | 'upcoming') => (
    <section className="space-y-2">
      <h3 className={`text-sm font-semibold ${cls}`}>{title} ({list.length}) · {formatCurrency(sum(list))}</h3>
      <div className="bg-card border rounded-xl divide-y">
        {list.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">Nothing here</p> : list.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <button onClick={() => onOpenLead(r.lead.id)} className="text-blue-600 hover:underline font-medium">{r.lead.name}</button>
              <span className="text-xs text-muted-foreground ml-2">{r.lead.phone} · {r.course}</span>
              <p className="text-xs text-muted-foreground">
                {kind === 'awaiting' ? `Collected${r.collectedBy ? ` by ${r.collectedBy.firstName} ${r.collectedBy.lastName}` : ''}${r.paidAt ? ` on ${formatDate(r.paidAt)}` : ''}${r.mode ? ` · ${r.mode.replace('_', ' ')}` : ''}${r.reference ? ` · ref ${r.reference}` : ''}`
                  : `Owner: ${r.lead.assignedTo ? `${r.lead.assignedTo.firstName} ${r.lead.assignedTo.lastName}` : '—'}`}
              </p>
            </div>
            <div className="flex items-center gap-4 whitespace-nowrap">
              <span className="font-semibold">{formatCurrency(r.amount)}</span>
              {kind === 'overdue' && <span className="text-xs text-red-600 font-medium">{days(r.dueDate)}d overdue</span>}
              {kind === 'upcoming' && <span className="text-xs text-muted-foreground">due {formatDate(r.dueDate)}</span>}
              {kind === 'awaiting' && <span className="text-xs text-amber-700">with Finance</span>}
              {kind !== 'awaiting' && <a href={`tel:${r.lead.phone.replace(/\s+/g, '')}`} className="text-xs border rounded-lg px-2 py-1 hover:bg-muted/50">Call</a>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Payments are verified in Finance. Overdue and upcoming instalments are the ones to chase.</p>
        {isAdmin && (
          <select value={emp} onChange={(e) => setEmp(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
            <option value="">Whole team</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </select>
        )}
      </div>
      {block('Overdue', 'text-red-600', data.overdue, 'overdue')}
      {block('Awaiting Finance verification', 'text-amber-700', data.awaiting, 'awaiting')}
      {block('Due in the next 14 days', 'text-foreground', data.upcoming, 'upcoming')}
    </div>
  );
}
