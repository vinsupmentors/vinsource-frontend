import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { Lock, Plus, X, Wallet, TrendingUp, Receipt } from 'lucide-react';

type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING' | 'CHEQUE' | 'OTHER';

interface EmployeeLite { id: string; firstName: string; lastName: string; }

interface Collection {
  id: string;
  studentName: string;
  amount: number;
  mode: PaymentMode;
  receiptNo?: string | null;
  remarks?: string | null;
  collectedAt: string;
  lead?: { id: string; name: string; courseInterest?: string | null } | null;
  receivedBy?: EmployeeLite | null;
}

interface Stats {
  totalCollected: number;
  collectedThisMonth: number;
  modeTotals: Record<string, number>;
  totalTransactions: number;
}

const MODES: PaymentMode[] = ['CASH', 'UPI', 'CARD', 'NET_BANKING', 'CHEQUE', 'OTHER'];

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function FinanceSalesPage() {
  const { modules, loaded, hasModule } = useModuleAccess();
  const level = modules.FINANCE_SALES;
  const canEdit = hasModule('FINANCE_SALES', 'EDIT');

  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const [listRes, statsRes] = await Promise.all([
        api.get('/api/finance-sales', { params }),
        api.get('/api/finance-sales/stats'),
      ]);
      setCollections(listRes.data.data);
      setStats(statsRes.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { if (level) fetchAll(); }, [level, fetchAll]);

  useEffect(() => {
    if (!level) return;
    api.get('/api/employees').then((res) => setEmployees(res.data.data)).catch(() => setEmployees([]));
  }, [level]);

  if (loaded && !level) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <Lock className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">No access to Finance (Sales)</p>
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
          <h1 className="text-2xl font-bold">Finance (Sales)</h1>
          <p className="text-muted-foreground text-sm">Student fee collections and sales-side revenue</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Record Collection
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Wallet} label="Total Collected" value={fmt(stats?.totalCollected ?? 0)} />
        <StatCard icon={TrendingUp} label="This Month" value={fmt(stats?.collectedThisMonth ?? 0)} />
        <StatCard icon={Receipt} label="Transactions" value={stats?.totalTransactions ?? 0} />
        <StatCard icon={Wallet} label="Via UPI" value={fmt(stats?.modeTotals?.UPI ?? 0)} />
      </div>

      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student name or receipt no..."
          className="px-3 py-2 border rounded-lg text-sm w-72"
        />
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Receipt No.</th>
              <th className="px-4 py-3">Received By</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : collections.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No collections recorded</td></tr>
            ) : collections.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  {c.studentName}
                  {c.lead?.courseInterest && <p className="text-xs text-muted-foreground">{c.lead.courseInterest}</p>}
                </td>
                <td className="px-4 py-3 font-semibold">{fmt(c.amount)}</td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">{c.mode.replace('_', ' ')}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.receiptNo || '—'}</td>
                <td className="px-4 py-3">{c.receivedBy ? `${c.receivedBy.firstName} ${c.receivedBy.lastName}` : '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(c.collectedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddCollectionModal
          employees={employees}
          saving={saving}
          setSaving={setSaving}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchAll(); }}
          setError={setError}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-green-600" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

function AddCollectionModal({ employees, saving, setSaving, onClose, onSaved, setError }: {
  employees: EmployeeLite[]; saving: boolean; setSaving: (v: boolean) => void;
  onClose: () => void; onSaved: () => void; setError: (s: string) => void;
}) {
  const [form, setForm] = useState({
    studentName: '', amount: '', mode: 'UPI' as PaymentMode, receivedById: '', receiptNo: '', remarks: '',
  });

  const submit = async () => {
    if (!form.studentName || !form.amount) { setError('Student name and amount are required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post('/api/finance-sales', { ...form, receivedById: form.receivedById || undefined, receiptNo: form.receiptNo || undefined });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to record collection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Record Fee Collection</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Student Name *" value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} />
          <input type="number" className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Amount *" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as PaymentMode })}>
            {MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
          <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Receipt No." value={form.receiptNo} onChange={(e) => setForm({ ...form, receiptNo: e.target.value })} />
          {employees.length > 0 && (
            <select className="w-full px-3 py-2 border rounded-lg text-sm" value={form.receivedById} onChange={(e) => setForm({ ...form, receivedById: e.target.value })}>
              <option value="">Received by...</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </select>
          )}
          <textarea className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Remarks" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Record'}
          </button>
        </div>
      </div>
    </div>
  );
}
