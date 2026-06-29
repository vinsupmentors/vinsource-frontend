import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import {
  Lock, Plus, X, Megaphone, Wallet, TrendingDown, Users, Receipt,
  ClipboardList, CheckCircle2, PieChart, ExternalLink, Target,
  ChevronLeft, ChevronRight, Download, ChevronDown,
} from 'lucide-react';

type CampaignStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
interface EmployeeLite { id: string; firstName: string; lastName: string; }
interface CampaignLite { id: string; name: string; channel?: string | null; status?: CampaignStatus; }
interface Campaign {
  id: string; name: string; channel?: string | null; status: CampaignStatus;
  budget?: number | null; spent?: number | null; startDate?: string | null; endDate?: string | null;
  owner?: EmployeeLite | null; _count?: { leads: number };
  closedAt?: string | null; closureSummary?: string | null;
  closureExpenseSheetUrl?: string | null; closureDashboardUrl?: string | null;
}
interface Recharge {
  id: string; amount: number; rechargedFor?: string | null; billUrl: string; note?: string | null;
  rechargedAt: string; rechargedBy?: EmployeeLite | null; campaign?: CampaignLite;
}
interface DailyReport {
  id: string; date: string; leadsReceived: number; leadsGivenToSales: number; leadsUploadedToCrm: number;
  amountSpent: number; dashboardUrl?: string | null; notes?: string | null; costPerLead: number | null;
  reportedBy?: EmployeeLite | null; campaign?: CampaignLite;
}
interface Stats {
  activeCampaigns: number; closedCampaigns: number; totalBudget: number; totalSpent: number;
  totalLeadsSourced: number; totalRecharged: number; remainingBudget: number; overallCostPerLead: number | null;
  leadsReceived: number; leadsGivenToSales: number; leadsUploadedToCrm: number;
}
interface Totals {
  totalRecharged: number; totalSpent: number; remainingBudget: number;
  totalLeadsReceived: number; totalLeadsUploadedToCrm: number; overallCostPerLead: number | null;
}
interface FullCampaign extends Campaign {
  recharges: Recharge[]; dailyReports: DailyReport[]; totals: Totals;
}

const STATUSES: CampaignStatus[] = ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED'];
const CHANNELS = ['Google Ads', 'Meta Ads (Facebook/Instagram)', 'LinkedIn Ads', 'YouTube Ads', 'Twitter/X Ads', 'WhatsApp', 'SMS', 'Email Marketing', 'SEO/Organic', 'Other'];
const STATUS_COLOR: Record<CampaignStatus, string> = {
  PLANNED: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-gray-100 text-gray-700',
};
const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN') : '—');
const BACKEND_URL = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_URL || 'http://localhost:5000';

/** A campaign counts as "running" on a date if it had started by then and hadn't ended/closed before it. */
function isRunningOn(c: Campaign, day: Date) {
  if (!c.startDate) return false;
  const start = new Date(c.startDate); start.setHours(0, 0, 0, 0);
  if (day < start) return false;
  if (c.status === 'COMPLETED') {
    if (!c.closedAt) return true;
    const closed = new Date(c.closedAt); closed.setHours(0, 0, 0, 0);
    return day <= closed;
  }
  if (c.endDate) {
    const end = new Date(c.endDate); end.setHours(0, 0, 0, 0);
    if (day > end) return false;
  }
  return true;
}

/** Format a Date as YYYY-MM-DD using its LOCAL calendar fields — never use toISOString() for
 *  this, since that converts to UTC first and silently shifts the date by a day in timezones
 *  ahead of UTC (e.g. IST), making calendar cells key to the wrong date. */
function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function exportXLSX(sheets: { name: string; rows: Record<string, unknown>[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}]);
    const cols = Object.keys(s.rows[0] || {});
    ws['!cols'] = cols.map((k) => ({ wch: Math.max(k.length, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

type Tab = 'campaigns' | 'recharges' | 'reports' | 'closed' | 'summary';
const VALID_TABS: Tab[] = ['campaigns', 'recharges', 'reports', 'closed', 'summary'];
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'recharges', label: 'Recharges', icon: Receipt },
  { id: 'reports', label: 'Daily Reports', icon: ClipboardList },
  { id: 'closed', label: 'Closed Campaigns', icon: CheckCircle2 },
  { id: 'summary', label: 'Spend Summary', icon: PieChart },
];

export default function DigitalMarketingPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.DIGITAL_MARKETING;
  const canEdit = hasModule('DIGITAL_MARKETING', 'EDIT');

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as Tab | null;
  const [tab, setTabState] = useState<Tab>(tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'campaigns');
  const setTab = (t: Tab) => { setTabState(t); setSearchParams({ tab: t }, { replace: true }); };
  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== tab) setTabState(tabFromUrl);
  }, [tabFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [closedCampaigns, setClosedCampaigns] = useState<Campaign[]>([]);
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [activeReportCampaigns, setActiveReportCampaigns] = useState<Campaign[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [closedMonth, setClosedMonth] = useState('');
  const [expandedClosed, setExpandedClosed] = useState<string | null>(null);
  const [closedDetail, setClosedDetail] = useState<Record<string, FullCampaign>>({});
  const [showExportReports, setShowExportReports] = useState(false);
  const [showExportClosed, setShowExportClosed] = useState(false);
  const navigate = useNavigate();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'campaigns') {
        const params: Record<string, string> = {};
        if (statusFilter) params.status = statusFilter;
        const res = await api.get('/api/digital-marketing/campaigns', { params });
        setCampaigns(res.data.data);
      } else if (tab === 'closed') {
        const res = await api.get('/api/digital-marketing/campaigns', { params: { status: 'COMPLETED' } });
        setClosedCampaigns(res.data.data);
      } else if (tab === 'recharges') {
        const res = await api.get('/api/digital-marketing/recharges');
        setRecharges(res.data.data);
      } else if (tab === 'reports') {
        const [reportsRes, activeRes, allRes] = await Promise.all([
          api.get('/api/digital-marketing/daily-reports'),
          api.get('/api/digital-marketing/campaigns', { params: { status: 'ACTIVE' } }),
          api.get('/api/digital-marketing/campaigns'),
        ]);
        setReports(reportsRes.data.data);
        setActiveReportCampaigns(activeRes.data.data);
        setAllCampaigns(allRes.data.data);
      }
      const statsRes = await api.get('/api/digital-marketing/stats');
      setStats(statsRes.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [tab, statusFilter]);

  useEffect(() => { if (level) fetchAll(); }, [level, fetchAll]);

  useEffect(() => {
    if (!level) return;
    api.get('/api/employees').then((res) => setEmployees(res.data.data)).catch(() => setEmployees([]));
  }, [level]);

  const updateStatus = async (id: string, status: CampaignStatus) => {
    try {
      await api.put(`/api/digital-marketing/campaigns/${id}`, { status });
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to update campaign');
    }
  };

  if (loaded && !level) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <Lock className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">No access to Digital Marketing</p>
          <p className="text-sm text-muted-foreground">Ask someone with Master Control to grant you access to this module.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Digital Marketing</h1>
          <p className="text-muted-foreground text-sm">Campaigns, recharges, daily reports, and spend</p>
        </div>
        {canEdit && tab === 'campaigns' && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        )}
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

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Megaphone} label="Active Campaigns" value={stats?.activeCampaigns ?? 0} />
        <StatCard icon={Wallet} label="Total Recharged" value={fmt(stats?.totalRecharged ?? 0)} />
        <StatCard icon={TrendingDown} label="Total Spent" value={fmt(stats?.totalSpent ?? 0)} />
        <StatCard icon={Users} label="Leads Sourced" value={stats?.totalLeadsSourced ?? 0} />
      </div>

      {tab === 'campaigns' && (
        <>
          <div className="flex items-center gap-3">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Budget / Spent</th>
                  <th className="px-4 py-3">Leads</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : campaigns.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No campaigns yet</td></tr>
                ) : campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/digital-marketing/${c.id}`} className="text-blue-600 hover:underline">{c.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.channel || '—'}</td>
                    <td className="px-4 py-3">{fmt(c.budget ?? 0)} / {fmt(c.spent ?? 0)}</td>
                    <td className="px-4 py-3">{c._count?.leads ?? 0}</td>
                    <td className="px-4 py-3">{c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : '—'}</td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <select value={c.status} onChange={(ev) => updateStatus(c.id, ev.target.value as CampaignStatus)} className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${STATUS_COLOR[c.status]}`}>
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLOR[c.status]}`}>{c.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'recharges' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">For</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : recharges.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No recharges yet</td></tr>
              ) : recharges.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">{fmtDate(r.rechargedAt)}</td>
                  <td className="px-4 py-3 font-medium">
                    {r.campaign ? <Link to={`/digital-marketing/${r.campaign.id}`} className="text-blue-600 hover:underline">{r.campaign.name}</Link> : '—'}
                  </td>
                  <td className="px-4 py-3">{fmt(r.amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.rechargedFor || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.rechargedBy ? `${r.rechargedBy.firstName} ${r.rechargedBy.lastName}` : '—'}</td>
                  <td className="px-4 py-3">
                    <a href={`${BACKEND_URL}${r.billUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-6">
          <div className="flex items-center justify-end">
            <button onClick={() => setShowExportReports(true)} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-3">Active Campaigns — click to enter today's tracking</h3>
            {loading ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">Loading...</div>
            ) : activeReportCampaigns.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm bg-card border rounded-xl">No active campaigns right now</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeReportCampaigns.map((c) => {
                  const lastReport = reports.find((r) => r.campaign?.id === c.id);
                  return (
                    <Link
                      key={c.id}
                      to={`/digital-marketing/${c.id}`}
                      className="bg-card border rounded-xl p-4 space-y-2 hover:border-blue-400 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <p className="font-medium">{c.name}</p>
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">{c.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{c.channel || 'No channel set'}</p>
                      <p className="text-xs text-muted-foreground">Started {fmtDate(c.startDate)}</p>
                      <p className="text-xs text-muted-foreground">
                        Last report: {lastReport ? fmtDate(lastReport.date) : 'None yet'}
                      </p>
                      <p className="text-xs text-blue-600 font-medium pt-1">Enter daily report →</p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <ReportsCalendar
            month={calendarMonth}
            setMonth={setCalendarMonth}
            campaigns={allCampaigns}
            reports={reports}
            onSelectDay={(d) => navigate(`/digital-marketing/day/${toDateStr(d)}`)}
          />

          <div>
            <h3 className="font-semibold text-sm mb-3">All Daily Reports</h3>
            <div className="bg-card border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Received</th>
                    <th className="px-4 py-3">To Sales</th>
                    <th className="px-4 py-3">To CRM</th>
                    <th className="px-4 py-3">Spent</th>
                    <th className="px-4 py-3">Cost/Lead</th>
                    <th className="px-4 py-3">Dashboard Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : reports.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No daily reports yet</td></tr>
                  ) : reports.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">{fmtDate(r.date)}</td>
                      <td className="px-4 py-3 font-medium">
                        {r.campaign ? <Link to={`/digital-marketing/${r.campaign.id}`} className="text-blue-600 hover:underline">{r.campaign.name}</Link> : '—'}
                      </td>
                      <td className="px-4 py-3">{r.leadsReceived}</td>
                      <td className="px-4 py-3">{r.leadsGivenToSales}</td>
                      <td className="px-4 py-3">{r.leadsUploadedToCrm}</td>
                      <td className="px-4 py-3">{fmt(r.amountSpent)}</td>
                      <td className="px-4 py-3">{r.costPerLead != null ? fmt(Math.round(r.costPerLead)) : '—'}</td>
                      <td className="px-4 py-3">
                        {r.dashboardUrl ? (
                          <a href={`${BACKEND_URL}${r.dashboardUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : <span className="text-red-500">Missing</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'closed' && (
        <ClosedCampaignsPanel
          loading={loading}
          closedCampaigns={closedCampaigns}
          closedMonth={closedMonth}
          setClosedMonth={setClosedMonth}
          expandedClosed={expandedClosed}
          setExpandedClosed={setExpandedClosed}
          closedDetail={closedDetail}
          setClosedDetail={setClosedDetail}
          onExport={() => setShowExportClosed(true)}
        />
      )}

      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Wallet} label="Remaining Budget" value={fmt(stats?.remainingBudget ?? 0)} />
            <StatCard icon={Target} label="Overall Cost/Lead" value={stats?.overallCostPerLead != null ? fmt(Math.round(stats.overallCostPerLead)) : '—'} />
            <StatCard icon={CheckCircle2} label="Closed Campaigns" value={stats?.closedCampaigns ?? 0} />
            <StatCard icon={PieChart} label="Total Budget" value={fmt(stats?.totalBudget ?? 0)} />
          </div>
          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold mb-4">Leads Funnel (all campaigns)</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{stats?.leadsReceived ?? 0}</p>
                <p className="text-xs text-muted-foreground">Received</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.leadsGivenToSales ?? 0}</p>
                <p className="text-xs text-muted-foreground">Given to Sales</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.leadsUploadedToCrm ?? 0}</p>
                <p className="text-xs text-muted-foreground">Uploaded to CRM</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <AddCampaignModal employees={employees} saving={saving} setSaving={setSaving} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchAll(); }} setError={setError} />
      )}

      {showExportReports && (
        <ExportReportsModal
          reports={reports}
          campaigns={allCampaigns}
          onClose={() => setShowExportReports(false)}
        />
      )}

      {showExportClosed && (
        <ExportClosedModal
          campaigns={closedCampaigns}
          onClose={() => setShowExportClosed(false)}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-pink-600" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

function AddCampaignModal({ employees, saving, setSaving, onClose, onSaved, setError }: {
  employees: EmployeeLite[]; saving: boolean; setSaving: (v: boolean) => void; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({ name: '', channel: '', channelOther: '', budget: '', startDate: '', endDate: '', ownerId: '', initialAmount: '', note: '' });
  const [billCopy, setBillCopy] = useState<File | null>(null);

  const submit = async () => {
    if (!form.name) { setError('Campaign name is required'); return; }
    if (form.initialAmount && Number(form.initialAmount) > 0 && !billCopy) {
      setError('A bill copy is required to recharge the campaign at start');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('channel', form.channel === 'Other' ? form.channelOther : form.channel);
      if (form.budget) fd.append('budget', form.budget);
      if (form.startDate) fd.append('startDate', form.startDate);
      if (form.endDate) fd.append('endDate', form.endDate);
      if (form.ownerId) fd.append('ownerId', form.ownerId);
      if (form.initialAmount) fd.append('initialAmount', form.initialAmount);
      if (form.note) fd.append('note', form.note);
      if (billCopy) fd.append('billCopy', billCopy);
      await api.post('/api/digital-marketing/campaigns', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to create campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">New Campaign</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Campaign Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <div>
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="">Channel...</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {form.channel === 'Other' && (
              <input className="w-full mt-2 px-3 py-2 border rounded-lg text-sm" placeholder="Specify channel" value={form.channelOther} onChange={(e) => setForm({ ...form, channelOther: e.target.value })} />
            )}
          </div>

          <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Budget" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />

          <div className="flex gap-2">
            <div className="w-full">
              <label className="text-xs text-muted-foreground">Start Date</label>
              <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="w-full">
              <label className="text-xs text-muted-foreground">Expected End Date</label>
              <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          {employees.length > 0 && (
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
              <option value="">Owner...</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          )}

          <div className="pt-2 border-t space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Initial recharge (optional — required if funding now)</p>
            <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Amount recharged" value={form.initialAmount} onChange={(e) => setForm({ ...form, initialAmount: e.target.value })} />
            <div>
              <label className="text-xs text-muted-foreground">Bill copy {form.initialAmount && Number(form.initialAmount) > 0 ? '*' : ''}</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv" className="w-full text-sm" onChange={(e) => setBillCopy(e.target.files?.[0] || null)} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Daily Reports: month calendar of running/closed campaigns ─────────────

function ReportsCalendar({ month, setMonth, campaigns, reports, onSelectDay }: {
  month: Date; setMonth: (d: Date) => void; campaigns: Campaign[]; reports: DailyReport[]; onSelectDay: (d: Date) => void;
}) {
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const firstOfMonth = new Date(year, monthIdx, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Group actual records by the calendar day they belong to, so the calendar always reflects
  // real Daily Report / Closing Report entries — not just an inferred "campaign was active" window.
  const reportsByDay = new Map<string, DailyReport[]>();
  reports.forEach((r) => {
    const key = r.date.slice(0, 10); // date-only string from a plain date input — safe to slice directly
    const arr = reportsByDay.get(key) || [];
    arr.push(r);
    reportsByDay.set(key, arr);
  });

  const closuresByDay = new Map<string, Campaign[]>();
  campaigns.forEach((c) => {
    if (c.status === 'COMPLETED' && c.closedAt) {
      const key = toDateStr(new Date(c.closedAt)); // real timestamp — use local calendar day
      const arr = closuresByDay.get(key) || [];
      arr.push(c);
      closuresByDay.set(key, arr);
    }
  });

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, monthIdx, d));

  const shiftMonth = (delta: number) => {
    const next = new Date(year, monthIdx + delta, 1);
    setMonth(next);
  };

  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Campaign Calendar</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg border hover:bg-muted/50"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-medium w-32 text-center">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
          <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg border hover:bg-muted/50"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />;
          const dayKey = toDateStr(day);
          const dayReports = reportsByDay.get(dayKey) || [];
          const dayClosures = closuresByDay.get(dayKey) || [];
          const reportedIds = new Set(dayReports.map((r) => r.campaign?.id));
          const runningActive = campaigns.filter((c) => c.status !== 'COMPLETED' && isRunningOn(c, day));
          const missingList = runningActive.filter((c) => !reportedIds.has(c.id));
          const isToday = day.getTime() === today.getTime();
          const isFuture = day.getTime() > today.getTime();
          const missingReports = !isFuture && missingList.length > 0;

          type Entry = { name: string; channel?: string | null; label: string; cls: string };
          const entries: Entry[] = [
            ...dayReports.map((r): Entry => ({
              name: r.campaign?.name ?? 'Campaign', channel: r.campaign?.channel, label: 'Daily', cls: 'bg-green-50 text-green-700 border-green-200',
            })),
            ...dayClosures.map((c): Entry => ({
              name: c.name, channel: c.channel, label: 'Closed', cls: 'bg-gray-100 text-gray-700 border-gray-300',
            })),
            ...(missingReports ? missingList.map((c): Entry => ({
              name: c.name, channel: c.channel, label: 'Missing', cls: 'bg-red-50 text-red-700 border-red-200',
            })) : []),
          ];
          const MAX_VISIBLE = 3;
          const visible = entries.slice(0, MAX_VISIBLE);
          const overflow = entries.length - visible.length;

          return (
            <button
              key={dayKey}
              onClick={() => onSelectDay(day)}
              className={`min-h-[92px] rounded-lg border p-1.5 flex flex-col items-stretch gap-0.5 text-left hover:border-blue-400 hover:bg-blue-50/50 transition-colors ${
                isToday ? 'border-blue-500 ring-1 ring-blue-200' : 'border-border'
              }`}
            >
              <span className={`text-xs self-center ${isToday ? 'font-bold text-blue-600' : ''}`}>{day.getDate()}</span>
              <div className="flex flex-col gap-0.5 mt-0.5">
                {visible.map((e, idx) => (
                  <span
                    key={idx}
                    title={`${e.name}${e.channel ? ` · ${e.channel}` : ''} · ${e.label}`}
                    className={`text-[9px] leading-tight px-1 py-0.5 rounded border truncate ${e.cls}`}
                  >
                    {e.name}{e.channel ? ` · ${e.channel}` : ''} · {e.label}
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="text-[9px] leading-tight text-muted-foreground px-1">+{overflow} more</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Active</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" /> Closed</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /> Missing report</span>
      </div>
    </div>
  );
}

// ── Closed Campaigns: month-filterable cards with inline expand ───────────

function ClosedCampaignsPanel({
  loading, closedCampaigns, closedMonth, setClosedMonth, expandedClosed, setExpandedClosed, closedDetail, setClosedDetail, onExport,
}: {
  loading: boolean; closedCampaigns: Campaign[]; closedMonth: string; setClosedMonth: (s: string) => void;
  expandedClosed: string | null; setExpandedClosed: (s: string | null) => void;
  closedDetail: Record<string, FullCampaign>; setClosedDetail: (fn: (prev: Record<string, FullCampaign>) => Record<string, FullCampaign>) => void;
  onExport: () => void;
}) {
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const filtered = closedMonth
    ? closedCampaigns.filter((c) => c.closedAt && c.closedAt.slice(0, 7) === closedMonth)
    : closedCampaigns;

  const toggle = async (c: Campaign) => {
    if (expandedClosed === c.id) { setExpandedClosed(null); return; }
    setExpandedClosed(c.id);
    if (!closedDetail[c.id]) {
      setDetailLoading(c.id);
      try {
        const res = await api.get(`/api/digital-marketing/campaigns/${c.id}`);
        setClosedDetail((prev) => ({ ...prev, [c.id]: res.data.data }));
      } catch {
        // leave detail empty; card will show a fallback message
      } finally {
        setDetailLoading(null);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={closedMonth}
            onChange={(e) => setClosedMonth(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          {closedMonth && (
            <button onClick={() => setClosedMonth('')} className="text-xs text-blue-600 hover:underline">Show all months</button>
          )}
        </div>
        <button onClick={onExport} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted/50">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground bg-card border rounded-xl">
          {closedMonth ? 'No campaigns closed in this month' : 'No closed campaigns yet'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const isOpen = expandedClosed === c.id;
            const detail = closedDetail[c.id];
            return (
              <div key={c.id} className={`bg-card border rounded-xl overflow-hidden ${isOpen ? 'md:col-span-2' : ''}`}>
                <button onClick={() => toggle(c)} className="w-full text-left p-4 space-y-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <p className="font-medium">{c.name}</p>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">{c.channel || 'No channel set'} · Closed {fmtDate(c.closedAt)}</p>
                  <p className="text-sm font-semibold">{fmt(c.spent ?? 0)} <span className="text-xs font-normal text-muted-foreground">final spend</span></p>
                </button>

                {isOpen && (
                  <div className="border-t p-4 space-y-4 bg-muted/20">
                    {detailLoading === c.id ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">Loading details...</div>
                    ) : !detail ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">Could not load details</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div><p className="text-xs text-muted-foreground">Budget</p><p className="font-semibold">{fmt(detail.budget ?? 0)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Recharged</p><p className="font-semibold">{fmt(detail.totals.totalRecharged)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Spent</p><p className="font-semibold">{fmt(detail.totals.totalSpent)}</p></div>
                          <div><p className="text-xs text-muted-foreground">Cost/Lead</p><p className="font-semibold">{detail.totals.overallCostPerLead != null ? fmt(Math.round(detail.totals.overallCostPerLead)) : '—'}</p></div>
                          <div><p className="text-xs text-muted-foreground">Leads Received</p><p className="font-semibold">{detail.totals.totalLeadsReceived}</p></div>
                          <div><p className="text-xs text-muted-foreground">Uploaded to CRM</p><p className="font-semibold">{detail.totals.totalLeadsUploadedToCrm}</p></div>
                          <div><p className="text-xs text-muted-foreground">Owner</p><p className="font-semibold">{detail.owner ? `${detail.owner.firstName} ${detail.owner.lastName}` : '—'}</p></div>
                          <div><p className="text-xs text-muted-foreground">Daily Reports Filed</p><p className="font-semibold">{detail.dailyReports.length}</p></div>
                        </div>

                        {detail.closureSummary && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Closure summary</p>
                            <p className="text-sm">{detail.closureSummary}</p>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Expense sheet</p>
                            {detail.closureExpenseSheetUrl ? (
                              <a href={`${BACKEND_URL}${detail.closureExpenseSheetUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                                View <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : <span className="text-sm text-muted-foreground">—</span>}
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Ad platform dashboard export</p>
                            {detail.closureDashboardUrl ? (
                              <a href={`${BACKEND_URL}${detail.closureDashboardUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                                View <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : <span className="text-sm text-muted-foreground">—</span>}
                          </div>
                        </div>

                        <div className="pt-2 border-t">
                          <Link to={`/digital-marketing/${c.id}`} className="text-sm text-blue-600 hover:underline">Open full campaign page →</Link>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Export modals: Excel export with date range and/or multi-campaign filter ──

function ExportReportsModal({ reports, campaigns, onClose }: {
  reports: DailyReport[]; campaigns: Campaign[]; onClose: () => void;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleCampaign = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doExport = () => {
    const rows = reports
      .filter((r) => {
        const d = r.date.slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        if (selected.size > 0 && (!r.campaign || !selected.has(r.campaign.id))) return false;
        return true;
      })
      .map((r) => ({
        Date: fmtDate(r.date),
        Campaign: r.campaign?.name || '—',
        'Leads Received': r.leadsReceived,
        'Leads to CRM': r.leadsUploadedToCrm,
        'Amount Spent': r.amountSpent,
        'Cost/Lead': r.costPerLead != null ? Math.round(r.costPerLead) : '',
        'Dashboard Proof': r.dashboardUrl ? `${BACKEND_URL}${r.dashboardUrl}` : '',
      }));
    exportXLSX([{ name: 'Daily Reports', rows }], `daily-reports-${toDateStr(new Date())}.xlsx`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Export Daily Reports</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex gap-2">
          <div className="w-full">
            <label className="text-xs text-muted-foreground">From</label>
            <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="w-full">
            <label className="text-xs text-muted-foreground">To</label>
            <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Campaigns (leave unchecked for all)</p>
          <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
            {campaigns.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No campaigns</p>
            ) : campaigns.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleCampaign(c.id)} />
                {c.name}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={doExport} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Export .xlsx</button>
        </div>
      </div>
    </div>
  );
}

function ExportClosedModal({ campaigns, onClose }: { campaigns: Campaign[]; onClose: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleCampaign = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doExport = () => {
    const rows = campaigns
      .filter((c) => {
        const d = c.closedAt ? c.closedAt.slice(0, 10) : '';
        if (from && (!d || d < from)) return false;
        if (to && (!d || d > to)) return false;
        if (selected.size > 0 && !selected.has(c.id)) return false;
        return true;
      })
      .map((c) => ({
        Campaign: c.name,
        Channel: c.channel || '—',
        'Closed On': fmtDate(c.closedAt),
        'Final Spend': c.spent ?? 0,
        'Closure Summary': c.closureSummary || '',
        'Expense Sheet': c.closureExpenseSheetUrl ? `${BACKEND_URL}${c.closureExpenseSheetUrl}` : '',
        'Dashboard Export': c.closureDashboardUrl ? `${BACKEND_URL}${c.closureDashboardUrl}` : '',
      }));
    exportXLSX([{ name: 'Closed Campaigns', rows }], `closed-campaigns-${toDateStr(new Date())}.xlsx`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Export Closed Campaigns</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex gap-2">
          <div className="w-full">
            <label className="text-xs text-muted-foreground">Closed from</label>
            <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="w-full">
            <label className="text-xs text-muted-foreground">Closed to</label>
            <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Campaigns (leave unchecked for all)</p>
          <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
            {campaigns.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No closed campaigns</p>
            ) : campaigns.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleCampaign(c.id)} />
                {c.name}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={doExport} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">Export .xlsx</button>
        </div>
      </div>
    </div>
  );
}
