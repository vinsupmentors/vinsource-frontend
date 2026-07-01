import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { useRole } from '@/hooks/useAuth';
import { UserPlus, ChevronRight, Plus, X, Loader2, Users, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import BulkOnboarding from '@/components/BulkOnboarding';

interface OnboardingRequest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  joiningDate: string;
  status: string;
  documents: { id: string; status: string }[];
  createdAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING:        'bg-yellow-100 text-yellow-700',
  HR_APPROVED:    'bg-blue-100 text-blue-700',
  DOCUMENTS_SENT: 'bg-purple-100 text-purple-700',
  COMPLETED:      'bg-green-100 text-green-700',
  REJECTED:       'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING:        'Pending',
  HR_APPROVED:    'Approved',
  DOCUMENTS_SENT: 'Awaiting Signature',
  COMPLETED:      'Completed',
  REJECTED:       'Rejected',
};

export default function OnboardingPage() {
  const { can } = useRole();
  const isHR = can('HR');

  const [requests, setRequests] = useState<OnboardingRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reinitiating, setReinitiating] = useState<string | null>(null);
  const PAGE_SIZE = 20;
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    joiningDate: '', departmentId: '', designationId: '', managerId: '',
  });
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [designations, setDesignations] = useState<{ id: string; name: string }[]>([]);

  const fetchRequests = async (pageNum = 1, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('page', String(pageNum));
      params.append('limit', String(PAGE_SIZE));
      const { data } = await api.get(`/api/onboarding?${params}`);
      setRequests(prev => append ? [...prev, ...data.data] : data.data);
      setTotal(data.meta?.total || 0);
      setPage(pageNum);
    } catch (e) { console.error(e); }
    finally { append ? setLoadingMore(false) : setLoading(false); }
  };

  useEffect(() => { fetchRequests(1); }, [statusFilter]);

  useEffect(() => {
    api.get('/api/departments').then(r => setDepartments(r.data.data || [])).catch(() => {});
    api.get('/api/designations').then(r => setDesignations(r.data.data || [])).catch(() => {});
  }, []);

  const handleReinitiate = async (id: string, name: string) => {
    if (!confirm(`Re-initiate onboarding for ${name}?\n\nThis will:\n• Reset their progress to the start\n• Clear partial profile data\n• Send fresh login credentials to their email`)) return;
    setReinitiating(id);
    try {
      await api.put(`/api/onboarding/${id}/reinitiate`);
      fetchRequests(1);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to re-initiate onboarding');
    } finally { setReinitiating(null); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/onboarding', form);
      setShowForm(false);
      setForm({ firstName: '', lastName: '', email: '', phone: '', joiningDate: '', departmentId: '', designationId: '', managerId: '' });
      fetchRequests(1);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to create onboarding request');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="w-6 h-6" /> Employee Onboarding
          </h1>
          <p className="text-muted-foreground text-sm">{total} total requests</p>
        </div>
        {isHR && (
          <div className="flex gap-2">
            <button
              onClick={() => { setShowBulk(true); setShowForm(false); }}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg font-medium hover:bg-accent transition text-sm"
            >
              <Users className="w-4 h-4" /> Bulk Onboarding
            </button>
            <button
              onClick={() => { setShowForm(true); setShowBulk(false); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition text-sm"
            >
              <Plus className="w-4 h-4" /> New Onboarding
            </button>
          </div>
        )}
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {['', 'PENDING', 'DOCUMENTS_SENT', 'COMPLETED', 'REJECTED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium border transition',
              statusFilter === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary'
            )}
          >
            {s === '' ? 'All' : STATUS_LABEL[s] || s}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No onboarding requests found</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {requests.map((r) => {
            const signed = r.documents.filter(d => d.status === 'SIGNED').length;
            const total = r.documents.length;
            const canReinitiate = isHR && r.status !== 'COMPLETED';
            return (
              <div key={r.id} className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary/50 transition group">
                <Link to={`/onboarding/${r.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                    {r.firstName[0]}{r.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">{r.firstName} {r.lastName}</p>
                    <p className="text-sm text-muted-foreground">{r.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Joining: {new Date(r.joiningDate).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {total > 0 && (
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">Documents</p>
                      <p className="text-sm font-medium">{signed}/{total} signed</p>
                    </div>
                  )}
                  <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-700')}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                  {canReinitiate && (
                    <button
                      onClick={() => handleReinitiate(r.id, `${r.firstName} ${r.lastName}`)}
                      disabled={reinitiating === r.id}
                      title="Re-initiate onboarding"
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition disabled:opacity-50"
                    >
                      {reinitiating === r.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                      Re-initiate
                    </button>
                  )}
                  <Link to={`/onboarding/${r.id}`}>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {requests.length < total && !loading && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => fetchRequests(page + 1, true)}
            disabled={loadingMore}
            className="flex items-center gap-2 px-6 py-2.5 border rounded-xl text-sm font-medium hover:bg-accent transition disabled:opacity-50"
          >
            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Load More ({requests.length} of {total})
          </button>
        </div>
      )}

      {/* Bulk Onboarding Panel */}
      {showBulk && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold flex items-center gap-2"><Users className="w-5 h-5" /> Bulk Onboarding</h2>
            <button onClick={() => setShowBulk(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>
          <BulkOnboarding onDone={() => { setShowBulk(false); fetchRequests(1); }} />
        </div>
      )}

      {/* New Onboarding Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-bold">New Onboarding Request</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">First Name *</label>
                  <input
                    value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    required className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Last Name *</label>
                  <input
                    value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    required className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Email *</label>
                <input
                  type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Phone</label>
                  <input
                    value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Joining Date *</label>
                  <input
                    type="date" value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))}
                    required className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Department</label>
                  <select
                    value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  >
                    <option value="">Select...</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Designation</label>
                  <select
                    value={form.designationId} onChange={e => setForm(f => ({ ...f, designationId: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  >
                    <option value="">Select...</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
