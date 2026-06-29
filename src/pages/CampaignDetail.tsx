import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import {
  ArrowLeft, Lock, Plus, X, Wallet, TrendingDown, PiggyBank, Users,
  Database, Target, FileText, CheckCircle2, Paperclip,
} from 'lucide-react';

const BACKEND_URL = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_URL || 'http://localhost:5000';

type CampaignStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
interface EmployeeLite { id: string; firstName: string; lastName: string; employeeCode?: string }

interface Recharge {
  id: string; amount: number; rechargedFor?: string | null; billUrl: string; note?: string | null;
  rechargedAt: string; rechargedBy?: EmployeeLite | null;
}
interface DailyReport {
  id: string; date: string; leadsReceived: number; leadsGivenToSales: number; leadsUploadedToCrm: number;
  amountSpent: number; costPerLead: number | null; dashboardUrl?: string | null; notes?: string | null;
  reportedBy?: EmployeeLite | null;
}
interface Totals {
  totalRecharged: number; totalSpent: number; remainingBudget: number;
  totalLeadsReceived: number; totalLeadsGivenToSales: number; totalLeadsUploadedToCrm: number;
  overallCostPerLead: number | null;
}
interface Campaign {
  id: string; name: string; channel?: string | null; status: CampaignStatus;
  budget?: number | null; spent?: number | null; startDate?: string | null; endDate?: string | null;
  owner?: EmployeeLite | null; closedBy?: EmployeeLite | null; closedAt?: string | null;
  closureSummary?: string | null; closureExpenseSheetUrl?: string | null; closureDashboardUrl?: string | null;
  recharges: Recharge[]; dailyReports: DailyReport[]; totals: Totals;
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const STATUS_COLOR: Record<CampaignStatus, string> = {
  PLANNED: 'bg-blue-100 text-blue-700', ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-amber-100 text-amber-700', COMPLETED: 'bg-gray-100 text-gray-700',
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.DIGITAL_MARKETING;
  const canEdit = hasModule('DIGITAL_MARKETING', 'EDIT');

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRecharge, setShowRecharge] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showClose, setShowClose] = useState(false);

  const fetchCampaign = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/digital-marketing/campaigns/${id}`);
      setCampaign(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (level) fetchCampaign(); }, [level, fetchCampaign]);

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

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;
  if (!campaign) return <div className="py-12 text-center text-muted-foreground">{error || 'Campaign not found'}</div>;

  const isClosed = campaign.status === 'COMPLETED';
  const t = campaign.totals;

  return (
    <div className="space-y-6">
      <Link to="/digital-marketing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to campaigns
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLOR[campaign.status]}`}>{campaign.status}</span>
          </div>
          <p className="text-muted-foreground text-sm">
            {campaign.channel || 'No channel set'} · Owner: {campaign.owner ? `${campaign.owner.firstName} ${campaign.owner.lastName}` : '—'}
            {campaign.startDate && ` · Started ${new Date(campaign.startDate).toLocaleDateString()}`}
            {campaign.endDate && ` · Expected end ${new Date(campaign.endDate).toLocaleDateString()}`}
          </p>
        </div>
        {canEdit && !isClosed && (
          <div className="flex gap-2">
            <button onClick={() => setShowRecharge(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Add Funds
            </button>
            <button onClick={() => setShowReport(true)} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> Daily Report
            </button>
            <button onClick={() => setShowClose(true)} className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
              <CheckCircle2 className="w-4 h-4" /> Close Campaign
            </button>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {/* Summary checkpoints — "nook and corner" totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Wallet} label="Total Recharged" value={fmt(t.totalRecharged)} />
        <StatCard icon={TrendingDown} label="Total Spent" value={fmt(t.totalSpent)} />
        <StatCard icon={PiggyBank} label="Remaining Budget" value={fmt(t.remainingBudget)} />
        <StatCard icon={Target} label="Overall Cost / Lead" value={t.overallCostPerLead != null ? fmt(Math.round(t.overallCostPerLead)) : '—'} />
        <StatCard icon={Users} label="Leads Received" value={t.totalLeadsReceived} />
        <StatCard icon={Database} label="Uploaded to CRM" value={t.totalLeadsUploadedToCrm} />
      </div>

      {/* Closure checkpoint */}
      {isClosed && (
        <div className="bg-card border rounded-xl p-5 space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Campaign Closed</h2>
          <p className="text-sm text-muted-foreground">
            Closed {campaign.closedAt && new Date(campaign.closedAt).toLocaleString()}
            {campaign.closedBy && ` by ${campaign.closedBy.firstName} ${campaign.closedBy.lastName}`}
          </p>
          {campaign.closureSummary && <p className="text-sm">{campaign.closureSummary}</p>}
          <div className="flex gap-4 pt-1">
            {campaign.closureExpenseSheetUrl && (
              <a href={`${BACKEND_URL}${campaign.closureExpenseSheetUrl}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Overall expense sheet
              </a>
            )}
            {campaign.closureDashboardUrl && (
              <a href={`${BACKEND_URL}${campaign.closureDashboardUrl}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5" /> Ad platform dashboard
              </a>
            )}
          </div>
        </div>
      )}

      {/* Recharge history — every funding event has its own bill copy */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm">Recharge History</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">For</th>
              <th className="px-4 py-3">Bill</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {campaign.recharges.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No recharges recorded yet</td></tr>
            ) : campaign.recharges.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{new Date(r.rechargedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-medium">{fmt(r.amount)}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.rechargedFor || '—'}</td>
                <td className="px-4 py-3"><a href={`${BACKEND_URL}${r.billUrl}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View bill</a></td>
                <td className="px-4 py-3 text-muted-foreground">{r.rechargedBy ? `${r.rechargedBy.firstName} ${r.rechargedBy.lastName}` : '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Daily reports — leads funnel + spend, the day-to-day checkpoint */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm">Daily Reports</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">In CRM</th>
              <th className="px-4 py-3">Spent</th>
              <th className="px-4 py-3">Cost/Lead</th>
              <th className="px-4 py-3">Dashboard</th>
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {campaign.dailyReports.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No daily reports yet</td></tr>
            ) : campaign.dailyReports.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{new Date(r.date).toLocaleDateString()}</td>
                <td className="px-4 py-3">{r.leadsReceived}</td>
                <td className="px-4 py-3">{r.leadsUploadedToCrm}</td>
                <td className="px-4 py-3">{fmt(r.amountSpent)}</td>
                <td className="px-4 py-3">{r.costPerLead != null ? fmt(Math.round(r.costPerLead)) : '—'}</td>
                <td className="px-4 py-3">
                  {r.dashboardUrl ? <a href={`${BACKEND_URL}${r.dashboardUrl}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a> : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.reportedBy ? `${r.reportedBy.firstName} ${r.reportedBy.lastName}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showRecharge && (
        <RechargeModal campaignId={campaign.id} onClose={() => setShowRecharge(false)} onSaved={() => { setShowRecharge(false); fetchCampaign(); }} setError={setError} />
      )}
      {showReport && (
        <DailyReportModal campaignId={campaign.id} onClose={() => setShowReport(false)} onSaved={() => { setShowReport(false); fetchCampaign(); }} setError={setError} />
      )}
      {showClose && (
        <CloseCampaignModal campaignId={campaign.id} onClose={() => setShowClose(false)} onSaved={() => { setShowClose(false); fetchCampaign(); }} setError={setError} />
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

function RechargeModal({ campaignId, onClose, onSaved, setError }: {
  campaignId: string; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [rechargedFor, setRechargedFor] = useState('');
  const [note, setNote] = useState('');
  const [billCopy, setBillCopy] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!amount || Number(amount) <= 0) { setError('A positive amount is required'); return; }
    if (!billCopy) { setError('A bill copy is required for every recharge'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('amount', amount);
      fd.append('rechargedFor', rechargedFor);
      fd.append('note', note);
      fd.append('billCopy', billCopy);
      await api.post(`/api/digital-marketing/campaigns/${campaignId}/recharges`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to add funds');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Add Funds</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Amount *" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Recharged for (e.g. Meta Ads)" value={rechargedFor} onChange={(e) => setRechargedFor(e.target.value)} />
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div>
            <label className="text-xs text-muted-foreground">Bill copy *</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv" className="w-full text-sm" onChange={(e) => setBillCopy(e.target.files?.[0] || null)} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Add Funds'}</button>
        </div>
      </div>
    </div>
  );
}

function DailyReportModal({ campaignId, onClose, onSaved, setError }: {
  campaignId: string; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState(() => {
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    return { date: today, leadsReceived: '', leadsUploadedToCrm: '', amountSpent: '', notes: '' };
  });
  const [dashboardScreenshot, setDashboardScreenshot] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.date) { setError('Date is required'); return; }
    if (!dashboardScreenshot) { setError('A dashboard screenshot is required as proof for every daily report'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('dashboardScreenshot', dashboardScreenshot);
      await api.post(`/api/digital-marketing/campaigns/${campaignId}/daily-reports`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to save daily report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Daily Report</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" className="px-3 py-2 border rounded-lg text-sm" placeholder="Leads received" value={form.leadsReceived} onChange={(e) => setForm({ ...form, leadsReceived: e.target.value })} />
            <input type="number" className="px-3 py-2 border rounded-lg text-sm" placeholder="Uploaded to CRM" value={form.leadsUploadedToCrm} onChange={(e) => setForm({ ...form, leadsUploadedToCrm: e.target.value })} />
            <input type="number" className="px-3 py-2 border rounded-lg text-sm" placeholder="Amount spent" value={form.amountSpent} onChange={(e) => setForm({ ...form, amountSpent: e.target.value })} />
          </div>
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div>
            <label className="text-xs text-muted-foreground">Dashboard screenshot * (proof — e.g. Meta Ads Manager for the day)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv" className="w-full text-sm" onChange={(e) => setDashboardScreenshot(e.target.files?.[0] || null)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Saving again for the same date updates that day's report — re-upload the day's dashboard proof each time.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Report'}</button>
        </div>
      </div>
    </div>
  );
}

function CloseCampaignModal({ campaignId, onClose, onSaved, setError }: {
  campaignId: string; onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [closureSummary, setClosureSummary] = useState('');
  const [expenseSheet, setExpenseSheet] = useState<File | null>(null);
  const [dashboardScreenshot, setDashboardScreenshot] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!expenseSheet) { setError('The overall expense sheet is required to close the campaign'); return; }
    if (!dashboardScreenshot) { setError('The ad platform dashboard export is required to close the campaign'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('closureSummary', closureSummary);
      fd.append('expenseSheet', expenseSheet);
      fd.append('dashboardScreenshot', dashboardScreenshot);
      await api.post(`/api/digital-marketing/campaigns/${campaignId}/close`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to close campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Close Campaign</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" rows={4} placeholder="Overall closure summary (results, learnings, etc.)" value={closureSummary} onChange={(e) => setClosureSummary(e.target.value)} />
          <div>
            <label className="text-xs text-muted-foreground">Overall expense sheet *</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv" className="w-full text-sm" onChange={(e) => setExpenseSheet(e.target.files?.[0] || null)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ad platform dashboard export *</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv" className="w-full text-sm" onChange={(e) => setDashboardScreenshot(e.target.files?.[0] || null)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Once closed, the campaign locks against further recharges and daily reports.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white disabled:opacity-50">{saving ? 'Closing...' : 'Close Campaign'}</button>
        </div>
      </div>
    </div>
  );
}
