import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { Lock, Plus, X, Phone, Mail, Calendar, Users, TrendingUp, CheckCircle2 } from 'lucide-react';

type LeadStatus = 'NEW' | 'CONTACTED' | 'DEMO_SCHEDULED' | 'DEMO_DONE' | 'NEGOTIATION' | 'ENROLLED' | 'LOST';

interface EmployeeLite { id: string; firstName: string; lastName: string; employeeCode: string; }

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  source?: string | null;
  courseInterest?: string | null;
  status: LeadStatus;
  notes?: string | null;
  createdAt: string;
  assignedTo?: EmployeeLite | null;
  campaign?: { id: string; name: string } | null;
  _count?: { demos: number };
}

interface Stats {
  totalLeads: number;
  statusCounts: Record<string, number>;
  upcomingDemos: number;
  enrolledThisMonth: number;
}

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

export default function SalesPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.SALES;
  const canEdit = hasModule('SALES', 'EDIT');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [demoLead, setDemoLead] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [leadsRes, statsRes] = await Promise.all([
        api.get('/api/sales/leads', { params }),
        api.get('/api/sales/stats'),
      ]);
      setLeads(leadsRes.data.data);
      setStats(statsRes.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load sales data');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { if (level) fetchAll(); }, [level, fetchAll]);

  useEffect(() => {
    if (!level) return;
    api.get('/api/employees').then((res) => setEmployees(res.data.data)).catch(() => setEmployees([]));
  }, [level]);

  const updateLeadStatus = async (id: string, status: LeadStatus) => {
    try {
      await api.put(`/api/sales/leads/${id}`, { status });
      fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to update lead');
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-muted-foreground text-sm">Leads, demos, and conversion pipeline</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Lead
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {/* Leads table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Course Interest</th>
              <th className="px-4 py-3">Assigned To</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Demos</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No leads found</td></tr>
            ) : leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{lead.name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" /> {lead.phone}
                  </div>
                  {lead.email && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="w-3 h-3" /> {lead.email}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">{lead.courseInterest || '—'}</td>
                <td className="px-4 py-3">
                  {lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : '—'}
                </td>
                <td className="px-4 py-3">
                  {canEdit ? (
                    <select
                      value={lead.status}
                      onChange={(e) => updateLeadStatus(lead.id, e.target.value as LeadStatus)}
                      className={`text-xs font-medium rounded-full px-2 py-1 border-0 ${STATUS_COLOR[lead.status]}`}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs font-medium rounded-full px-2 py-1 ${STATUS_COLOR[lead.status]}`}>
                      {lead.status.replace(/_/g, ' ')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{lead._count?.demos ?? 0}</td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDemoLead(lead)}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      Schedule Demo
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

      {demoLead && (
        <ScheduleDemoModal
          lead={demoLead}
          employees={employees}
          saving={saving}
          setSaving={setSaving}
          onClose={() => setDemoLead(null)}
          onSaved={() => { setDemoLead(null); fetchAll(); }}
          setError={setError}
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

function ScheduleDemoModal({ lead, employees, saving, setSaving, onClose, onSaved, setError }: ModalProps & { lead: Lead }) {
  const [form, setForm] = useState({ scheduledAt: '', conductedById: '' });

  const submit = async () => {
    if (!form.scheduledAt) { setError('Demo date/time is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/sales/demos', {
        leadId: lead.id,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        conductedById: form.conductedById || undefined,
      });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to schedule demo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Schedule Demo — {lead.name}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input type="datetime-local" className="w-full px-3 py-2 border rounded-lg text-sm" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          {employees.length > 0 && (
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.conductedById} onChange={(e) => setForm({ ...form, conductedById: e.target.value })}>
              <option value="">Conducted by...</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
