import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, CalendarDays } from 'lucide-react';

type CampaignStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
interface Campaign {
  id: string; name: string; channel?: string | null; status: CampaignStatus;
  owner?: { firstName: string; lastName: string } | null;
  startDate?: string | null; endDate?: string | null; closedAt?: string | null;
}
interface DailyReport {
  id: string; date: string; leadsReceived: number; leadsUploadedToCrm: number;
  amountSpent: number; costPerLead: number | null; dashboardUrl?: string | null; notes?: string | null;
  reportedBy?: { firstName: string; lastName: string } | null;
  campaign?: { id: string; name: string };
}

const STATUS_COLOR: Record<CampaignStatus, string> = {
  PLANNED: 'bg-blue-100 text-blue-700', ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-amber-100 text-amber-700', COMPLETED: 'bg-gray-100 text-gray-700',
};
const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
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

export default function DigitalMarketingDayPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDay = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    setError('');
    try {
      const [campaignsRes, reportsRes] = await Promise.all([
        api.get('/api/digital-marketing/campaigns'),
        api.get('/api/digital-marketing/daily-reports', { params: { from: date, to: date } }),
      ]);
      setCampaigns(campaignsRes.data.data);
      setReports(reportsRes.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load this day');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchDay(); }, [fetchDay]);

  if (!date) return null;
  // Parse the YYYY-MM-DD route param as a local calendar date directly — passing it straight to
  // `new Date(string)` parses it as UTC midnight, which can render as the previous local day.
  const [dy, dm, dd] = date.split('-').map(Number);
  const day = new Date(dy, (dm || 1) - 1, dd || 1); day.setHours(0, 0, 0, 0);
  const reportByCampaign = new Map(reports.map((r) => [r.campaign?.id, r]));
  // Show a campaign on this day if it was inferred to be running OR if there's an actual record
  // (a daily report, or it was closed) dated this day — so real entries are never hidden just
  // because they fall outside the inferred start/end/closed window.
  const closedToday = (c: Campaign) => {
    if (!c.closedAt) return false;
    const closed = new Date(c.closedAt);
    return closed.getFullYear() === dy && closed.getMonth() === (dm || 1) - 1 && closed.getDate() === (dd || 1);
  };
  const runningCampaigns = campaigns.filter((c) => isRunningOn(c, day) || reportByCampaign.has(c.id) || closedToday(c));

  const shiftDay = (delta: number) => {
    const next = new Date(day);
    next.setDate(next.getDate() + delta);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const d = String(next.getDate()).padStart(2, '0');
    navigate(`/digital-marketing/day/${y}-${m}-${d}`);
  };

  return (
    <div className="space-y-6">
      <Link to="/digital-marketing?tab=reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Daily Reports
      </Link>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-pink-600" />
          <h1 className="text-2xl font-bold">
            {day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => shiftDay(-1)} className="p-2 rounded-lg border hover:bg-muted/50"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => shiftDay(1)} className="p-2 rounded-lg border hover:bg-muted/50"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : runningCampaigns.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground bg-card border rounded-xl">No campaigns were running on this date</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {runningCampaigns.map((c) => {
            const r = reportByCampaign.get(c.id);
            return (
              <div key={c.id} className="bg-card border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <Link to={`/digital-marketing/${c.id}`} className="font-medium text-blue-600 hover:underline">{c.name}</Link>
                  <div className="flex items-center gap-1">
                    {closedToday(c) && <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-200 text-gray-700">Closing Report</span>}
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLOR[c.status]}`}>{c.status}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c.channel || 'No channel set'} · Owner: {c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : '—'}
                </p>
                {r ? (
                  <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
                    <div><p className="text-xs text-muted-foreground">Received</p><p className="font-semibold">{r.leadsReceived}</p></div>
                    <div><p className="text-xs text-muted-foreground">To CRM</p><p className="font-semibold">{r.leadsUploadedToCrm}</p></div>
                    <div><p className="text-xs text-muted-foreground">Spent</p><p className="font-semibold">{fmt(r.amountSpent)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Cost/Lead</p><p className="font-semibold">{r.costPerLead != null ? fmt(Math.round(r.costPerLead)) : '—'}</p></div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Dashboard proof</p>
                      {r.dashboardUrl ? (
                        <a href={`${BACKEND_URL}${r.dashboardUrl}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : <span className="text-red-500 text-sm">Missing</span>}
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-red-500">No report submitted for this date</p>
                    <Link to={`/digital-marketing/${c.id}`} className="text-xs text-blue-600 hover:underline">Enter daily report →</Link>
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
