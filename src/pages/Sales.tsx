import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api, { BASE_URL } from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  Lock, Plus, X, Phone, Mail, Calendar, Users, TrendingUp, CheckCircle2,
  PhoneCall, Video, MapPin, RefreshCw, AlertTriangle, Settings, Trash2, Activity,
  ChevronLeft, ChevronRight, Upload, Download, Percent,
  Smartphone, PhoneIncoming, Link2, UserPlus, Copy, Ban, Check, History,
  Target as TargetIcon, Trophy, Clock,
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
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  source?: string | null;
  courseInterest?: string | null;
  status: LeadStatus;
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

interface CallLog {
  id: string;
  notes: string;
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

// ── Main page ────────────────────────────────────────────────────────────
type Tab = 'leads' | 'pulse' | 'leadQuality' | 'demoBooked' | 'demoRescheduled' | 'demoConducted' | 'devices' | 'unmatchedCalls' | 'callLog' | 'leaderboard' | 'targets';
const VALID_TABS: Tab[] = ['leads', 'pulse', 'leadQuality', 'demoBooked', 'demoRescheduled', 'demoConducted', 'devices', 'unmatchedCalls', 'callLog', 'leaderboard', 'targets'];
// Sales Pulse / Lead Quality are aggregate, cross-rep views — admin only.
// BDAs get Demo Booked/Rescheduled/Conducted instead, scoped to their own leads.
// Devices (issuing call-tracking tokens) is admin-only too. Unmatched Calls
// is regular EDIT access, same level as logging a call manually — both admins
// and BDAs can see and work it. Leaderboard/Targets are management-level KPI
// views, same access tier as Pulse/Lead Quality. "My Students" lives on its
// own top-level page (see MyStudents.tsx), not as a Sales tab.
const ADMIN_ONLY_TABS: Tab[] = ['pulse', 'leadQuality', 'devices', 'leaderboard', 'targets'];
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
  const [followUpFilter, setFollowUpFilter] = useState<string>('');
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
  useEffect(() => { setPage(1); }, [search, statusFilter, followUpFilter]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
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
  }, [page, search, statusFilter, followUpFilter]);

  useEffect(() => { if (level && tab === 'leads') fetchAll(); }, [level, tab, fetchAll]);

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
              { id: 'callLog' as Tab, label: 'Call Log', icon: History },
              { id: 'pulse' as Tab, label: 'Sales Pulse', icon: Activity },
              { id: 'leaderboard' as Tab, label: 'Leaderboard', icon: Trophy },
              { id: 'targets' as Tab, label: 'Targets', icon: TargetIcon },
              { id: 'leadQuality' as Tab, label: 'Lead Quality', icon: Percent },
              { id: 'unmatchedCalls' as Tab, label: 'Unmatched Calls', icon: PhoneIncoming },
              { id: 'devices' as Tab, label: 'Devices', icon: Smartphone },
            ]
          : [
              { id: 'leads' as Tab, label: 'Leads', icon: Users },
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
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={followUpFilter} onChange={(e) => setFollowUpFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All reminders</option>
              <option value="today">Due today</option>
              <option value="overdue">Overdue</option>
            </select>
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
                  <th className="px-3 py-3">Assigned</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Demo</th>
                  <th className="px-3 py-3">Reminder</th>
                  <th className="px-3 py-3">Last Contact</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Lead Age</th>
                  <th className="px-3 py-3">Date Of Demo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">No leads found</td></tr>
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
                        {lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt) : '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {lead.lastContactAt ? formatDateTime(lead.lastContactAt) : 'Never'}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(lead.createdAt)}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{leadAgeLabel(lead.createdAt)}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {latestDemo ? formatDate(latestDemo.scheduledAt) : '—'}
                      </td>
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

  const [callNotes, setCallNotes] = useState('');
  const [callFollowUp, setCallFollowUp] = useState('');
  const [callStatus, setCallStatus] = useState<LeadStatus | ''>('');
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

  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [demoScheduledAt, setDemoScheduledAt] = useState('');
  const [demoMode, setDemoMode] = useState<DemoMode>('ONLINE');
  const [savingDemo, setSavingDemo] = useState(false);

  const [actingDemo, setActingDemo] = useState<{ id: string; type: 'complete' | 'reschedule' | 'noshow' | 'cancel' } | null>(null);
  const [actionFeedback, setActionFeedback] = useState('');
  const [actionConductedById, setActionConductedById] = useState('');
  const [actionNewScheduledAt, setActionNewScheduledAt] = useState('');
  const [actionNewMode, setActionNewMode] = useState<DemoMode>('ONLINE');
  const [actionRescheduleReason, setActionRescheduleReason] = useState('');
  // Mark Conducted specifics.
  const [actionOutcome, setActionOutcome] = useState<DemoOutcome | ''>('');
  const [actionCoConductedById, setActionCoConductedById] = useState('');
  const [actionProofFile, setActionProofFile] = useState<File | null>(null);
  const [savingAction, setSavingAction] = useState(false);

  const [reassignSaving, setReassignSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadingHistory(true);
    setLocalError('');
    try {
      const [callsRes, demosRes] = await Promise.all([
        api.get(`/api/sales/leads/${lead.id}/calls`),
        api.get('/api/sales/demos', { params: { leadId: lead.id } }),
      ]);
      setCallLogs(callsRes.data.data);
      setDemos(demosRes.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setLocalError(e.response?.data?.message || 'Failed to load lead history');
    } finally {
      setLoadingHistory(false);
    }
  }, [lead.id]);

  useEffect(() => { load(); }, [load]);

  const submitCall = async () => {
    if (!callNotes.trim()) { setLocalError('Call notes are required'); return; }
    if (callStatus === 'LOST' && !callLostReason) { setLocalError('Pick a reason for marking this lead Lost'); return; }
    setSavingCall(true);
    setLocalError('');
    try {
      await api.post(`/api/sales/leads/${lead.id}/calls`, {
        notes: callNotes.trim(),
        nextFollowUpAt: callFollowUp ? new Date(callFollowUp).toISOString() : undefined,
        status: callStatus || undefined,
        lostReason: callStatus === 'LOST' ? callLostReason : undefined,
        city: callCity.trim(),
        educationQualification: callEducation.trim(),
        collegeName: callCollege.trim(),
        passedOutYear: callPassedOutYear.trim(),
        currentStatus: callCurrentStatus.trim(),
      });
      setCallNotes(''); setCallFollowUp(''); setCallStatus(''); setCallLostReason('');
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setLocalError(e.response?.data?.message || 'Failed to log call');
    } finally {
      setSavingCall(false);
    }
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

  const submitScheduleDemo = async () => {
    if (!demoScheduledAt) { setLocalError('Pick a date/time for the demo'); return; }
    setSavingDemo(true);
    setLocalError('');
    try {
      await api.post('/api/sales/demos', {
        leadId: lead.id,
        scheduledAt: new Date(demoScheduledAt).toISOString(),
        mode: demoMode,
      });
      setDemoScheduledAt(''); setDemoMode('ONLINE');
      setShowScheduleForm(false);
      await load();
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setLocalError(e.response?.data?.message || 'Failed to schedule demo');
    } finally {
      setSavingDemo(false);
    }
  };

  const closeAction = () => {
    setActingDemo(null); setActionFeedback(''); setActionConductedById('');
    setActionNewScheduledAt(''); setActionNewMode('ONLINE'); setActionRescheduleReason('');
    setActionOutcome(''); setActionCoConductedById(''); setActionProofFile(null);
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
        if (actionCoConductedById) fd.append('coConductedById', actionCoConductedById);
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
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
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

        {/* Log a call */}
        {canEdit && (
          <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
            <h3 className="font-semibold text-sm flex items-center gap-2"><PhoneCall className="w-4 h-4" /> Log a Call</h3>
            <textarea
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="What happened on this call?"
              rows={2}
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-muted-foreground flex items-center gap-2">
                Next follow-up:
                <input type="date" className="px-2 py-1 border rounded-lg text-sm" value={callFollowUp} onChange={(e) => setCallFollowUp(e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground flex items-center gap-2">
                Update status:
                <select className="px-2 py-1 border rounded-lg text-sm" value={callStatus} onChange={(e) => setCallStatus(e.target.value as LeadStatus | '')}>
                  <option value="">No change</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              {callStatus === 'LOST' && (
                <select className="px-2 py-1 border rounded-lg text-sm" value={callLostReason} onChange={(e) => setCallLostReason(e.target.value as LeadLostReason)}>
                  <option value="">Reason...</option>
                  {LOST_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              )}
            </div>

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
                {savingCall ? 'Saving...' : 'Log Call'}
              </button>
            </div>
          </div>
        )}

        {/* Call history */}
        <div>
          <h3 className="font-semibold text-sm mb-2">Call History {lead._count?.callLogs ? `(${lead._count.callLogs})` : ''}</h3>
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : callLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calls logged yet.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {callLogs.map((c) => (
                <div key={c.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{c.calledBy ? `${c.calledBy.firstName} ${c.calledBy.lastName}` : 'Unknown'}</span>
                    <span>{formatDateTime(c.calledAt)}</span>
                  </div>
                  <p>{c.notes}</p>
                  {c.nextFollowUpAt && <p className="text-xs text-amber-600 mt-1">Next follow-up: {formatDate(c.nextFollowUpAt)}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Demos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Demos</h3>
            {canEdit && !showScheduleForm && (
              <button onClick={() => setShowScheduleForm(true)} className="text-xs font-medium text-blue-600 hover:underline">+ Schedule Demo</button>
            )}
          </div>

          {showScheduleForm && (
            <div className="border rounded-lg p-3 mb-3 space-y-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground">Demo slot</p>
              <div className="flex flex-wrap items-center gap-2">
                <input type="datetime-local" className="px-2 py-1 border rounded-lg text-sm" value={demoScheduledAt} onChange={(e) => setDemoScheduledAt(e.target.value)} />
                <select className="px-2 py-1 border rounded-lg text-sm" value={demoMode} onChange={(e) => setDemoMode(e.target.value as DemoMode)}>
                  {DEMO_MODES.map((m) => <option key={m} value={m}>{DEMO_MODE_LABEL[m]}</option>)}
                </select>
              </div>

              <p className="text-xs text-muted-foreground italic">Student details are captured in Log a Call above and carry over automatically.</p>

              <div className="flex gap-2">
                <button onClick={submitScheduleDemo} disabled={savingDemo} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white disabled:opacity-50">
                  {savingDemo ? 'Saving...' : 'Schedule'}
                </button>
                <button onClick={() => setShowScheduleForm(false)} className="px-3 py-1.5 text-xs rounded-lg border">Cancel</button>
              </div>
            </div>
          )}

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
                  {d.conductedBy && <p className="text-xs text-muted-foreground">Conducted by {d.conductedBy.firstName} {d.conductedBy.lastName}{d.coConductedBy ? ` · with ${d.coConductedBy.firstName} ${d.coConductedBy.lastName}` : ''}</p>}
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
                            {employees.length > 0 && (
                              <select className="px-2 py-1 border rounded-lg text-xs" value={actionCoConductedById} onChange={(e) => setActionCoConductedById(e.target.value)}>
                                <option value="">Co-conducted by (optional)...</option>
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
        </div>
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
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : calls.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nothing to review — every tracked call matched a lead</td></tr>
            ) : calls.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-3 py-3 font-medium whitespace-nowrap">
                  <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-muted-foreground" /> {c.rawPhoneNumber || 'Unknown'}</div>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{directionLabel(c.direction)}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{durationLabel(c.durationSeconds)}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{c.calledBy ? `${c.calledBy.firstName} ${c.calledBy.lastName}` : '—'}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(c.calledAt)}</td>
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
              <th className="px-3 py-3">Time</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Direction</th>
              <th className="px-3 py-3">Duration</th>
              <th className="px-3 py-3">Lead</th>
              <th className="px-3 py-3">Called By</th>
              <th className="px-3 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No calls found</td></tr>
            ) : logs.map((c) => {
              const number = c.rawPhoneNumber || c.lead?.phone;
              return (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(c.calledAt)}</td>
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
