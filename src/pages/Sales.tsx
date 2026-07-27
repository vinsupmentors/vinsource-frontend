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

// ── Main page ────────────────────────────────────────────────────────────
type Tab = 'leads' | 'pulse' | 'leadQuality' | 'demoBooked' | 'demoRescheduled' | 'demoConducted';
const VALID_TABS: Tab[] = ['leads', 'pulse', 'leadQuality', 'demoBooked', 'demoRescheduled', 'demoConducted'];
// Sales Pulse / Lead Quality are aggregate, cross-rep views — admin only.
// BDAs get Demo Booked/Rescheduled/Conducted instead, scoped to their own leads.
const ADMIN_ONLY_TABS: Tab[] = ['pulse', 'leadQuality'];
const BDA_ONLY_TABS: Tab[] = ['demoBooked', 'demoRescheduled', 'demoConducted'];

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
  }, [loaded, isAdmin, tab]);

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
    api.get('/api/employees').then((res) => setEmployees(res.data.data)).catch(() => setEmployees([]));
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
              { id: 'pulse' as Tab, label: 'Sales Pulse', icon: Activity },
              { id: 'leadQuality' as Tab, label: 'Lead Quality', icon: Percent },
            ]
          : [
              { id: 'leads' as Tab, label: 'Leads', icon: Users },
              { id: 'demoBooked' as Tab, label: 'Demo Booked', icon: Calendar },
              { id: 'demoRescheduled' as Tab, label: 'Demo Rescheduled', icon: RefreshCw },
              { id: 'demoConducted' as Tab, label: 'Demo Conducted', icon: CheckCircle2 },
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

      {tab === 'demoBooked' && !isAdmin && <DemoListPanel status="SCHEDULED" emptyLabel="No demos booked" onOpenLead={openLeadDetail} />}

      {tab === 'demoRescheduled' && !isAdmin && <DemoListPanel status="RESCHEDULED" emptyLabel="No demos rescheduled" onOpenLead={openLeadDetail} />}

      {tab === 'demoConducted' && !isAdmin && <DemoListPanel status="COMPLETED" emptyLabel="No demos conducted yet" onOpenLead={openLeadDetail} />}

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
  const [savingCall, setSavingCall] = useState(false);

  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [demoScheduledAt, setDemoScheduledAt] = useState('');
  const [demoMode, setDemoMode] = useState<DemoMode>('ONLINE');
  // Student intake, captured once at booking time.
  const [demoCity, setDemoCity] = useState('');
  const [demoEducation, setDemoEducation] = useState('');
  const [demoCollege, setDemoCollege] = useState('');
  const [demoPassedOutYear, setDemoPassedOutYear] = useState('');
  const [demoCurrentStatus, setDemoCurrentStatus] = useState('');
  const [demoCourseEnquired, setDemoCourseEnquired] = useState(lead.courseInterest || '');
  const [demoBookingComments, setDemoBookingComments] = useState('');
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
        city: demoCity || undefined,
        educationQualification: demoEducation || undefined,
        collegeName: demoCollege || undefined,
        passedOutYear: demoPassedOutYear || undefined,
        currentStatus: demoCurrentStatus || undefined,
        courseEnquired: demoCourseEnquired || undefined,
        bookingComments: demoBookingComments || undefined,
      });
      setDemoScheduledAt(''); setDemoMode('ONLINE');
      setDemoCity(''); setDemoEducation(''); setDemoCollege(''); setDemoPassedOutYear('');
      setDemoCurrentStatus(''); setDemoCourseEnquired(lead.courseInterest || ''); setDemoBookingComments('');
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

              <p className="text-xs font-medium text-muted-foreground pt-1">Student details</p>
              <div className="grid grid-cols-2 gap-2">
                <input className="px-2 py-1.5 border rounded-lg text-xs" placeholder="City" value={demoCity} onChange={(e) => setDemoCity(e.target.value)} />
                <input className="px-2 py-1.5 border rounded-lg text-xs" placeholder="Education qualification" value={demoEducation} onChange={(e) => setDemoEducation(e.target.value)} />
                <input className="px-2 py-1.5 border rounded-lg text-xs" placeholder="College name" value={demoCollege} onChange={(e) => setDemoCollege(e.target.value)} />
                <input type="number" className="px-2 py-1.5 border rounded-lg text-xs" placeholder="Passed out year" value={demoPassedOutYear} onChange={(e) => setDemoPassedOutYear(e.target.value)} />
                <input className="px-2 py-1.5 border rounded-lg text-xs" placeholder="Current status (e.g. Working, Job Seeking)" value={demoCurrentStatus} onChange={(e) => setDemoCurrentStatus(e.target.value)} />
                <input className="px-2 py-1.5 border rounded-lg text-xs" placeholder="Course enquired" value={demoCourseEnquired} onChange={(e) => setDemoCourseEnquired(e.target.value)} />
              </div>
              <textarea
                className="w-full px-2 py-1.5 border rounded-lg text-xs"
                placeholder="Comments (optional)"
                rows={2}
                value={demoBookingComments}
                onChange={(e) => setDemoBookingComments(e.target.value)}
              />

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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pulseRes, recipRes] = await Promise.all([
        api.get('/api/sales/pulse'),
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
  }, []);

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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Live as of right now — the same numbers go out by email at 11, 12, 1, 2, 4, 5 and 6 (6 PM is the day's End of Day report).
        </p>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={PhoneCall} label="Calls Made Today" value={pulse?.callsMadeToday ?? 0} />
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
