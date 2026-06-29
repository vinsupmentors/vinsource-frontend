import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useRole } from '@/hooks/useAuth';
import { formatDate } from '@/lib/utils';
import {
  Package, Plus, Loader2, AlertCircle, CheckCircle2,
  Monitor, Smartphone, Keyboard, CornerDownLeft, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

type AssetStatus = 'AVAILABLE' | 'ASSIGNED' | 'UNDER_MAINTENANCE' | 'RETIRED';

interface Asset {
  id: string;
  name: string;
  type: string;
  serialNumber?: string;
  brand?: string;
  model?: string;
  purchaseDate?: string;
  warrantyDate?: string;
  status: AssetStatus;
  notes?: string;
  assignments?: AssetAssignment[];
}

interface AssetAssignment {
  id: string;
  assetId: string;
  employeeId: string;
  assignedAt: string;
  returnedAt?: string;
  condition?: string;
  notes?: string;
  asset?: Asset;
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string };
}

interface Employee { id: string; firstName: string; lastName: string; employeeCode: string; }

const ASSET_TYPES = ['LAPTOP', 'DESKTOP', 'MOBILE', 'SIM', 'KEYBOARD', 'MOUSE', 'HEADSET', 'MONITOR', 'ACCESSORY', 'OTHER'];

const STATUS_COLORS: Record<AssetStatus, string> = {
  AVAILABLE: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  ASSIGNED: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  UNDER_MAINTENANCE: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  RETIRED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const typeIcon = (type: string) => {
  if (['LAPTOP', 'DESKTOP'].includes(type)) return <Monitor className="w-4 h-4" />;
  if (['MOBILE', 'SIM'].includes(type)) return <Smartphone className="w-4 h-4" />;
  return <Keyboard className="w-4 h-4" />;
};

export default function AssetsPage() {
  const { can } = useRole();
  const isHR = can('HR');
  const canManageAssets = can('MANAGER'); // managers can assign/return; HR can also create/edit

  const [myAssets, setMyAssets] = useState<AssetAssignment[]>([]);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState<'my' | 'all'>('my');
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAssign, setShowAssign] = useState<Asset | null>(null);
  const [returnLoading, setReturnLoading] = useState<string | null>(null);

  const [assetForm, setAssetForm] = useState({ name: '', type: 'LAPTOP', serialNumber: '', brand: '', model: '', notes: '' });
  const [assignForm, setAssignForm] = useState({ employeeId: '', condition: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchMy = useCallback(async () => {
    const r = await api.get<{ data: AssetAssignment[] }>('/api/assets/my');
    setMyAssets(r.data.data ?? []);
  }, []);

  const fetchAll = useCallback(async () => {
    const [assetsRes, empsRes] = await Promise.all([
      api.get<{ data: Asset[] }>('/api/assets'),
      api.get<{ data: Employee[] }>('/api/employees?limit=500'),
    ]);
    setAllAssets(assetsRes.data.data ?? []);
    setEmployees((empsRes.data as any).data ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    const fetches = [fetchMy()];
    if (canManageAssets) fetches.push(fetchAll());
    Promise.all(fetches).finally(() => setLoading(false));
  }, [fetchMy, fetchAll, isHR]);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/assets', assetForm);
      await fetchAll();
      setShowAddAsset(false);
      setAssetForm({ name: '', type: 'LAPTOP', serialNumber: '', brand: '', model: '', notes: '' });
      flash('Asset created');
    } catch (e: any) { setError(e.response?.data?.message ?? 'Failed to create'); }
    finally { setSubmitting(false); }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAssign || !assignForm.employeeId) return;
    setSubmitting(true);
    try {
      await api.post(`/api/assets/${showAssign.id}/assign`, assignForm);
      await fetchAll();
      setShowAssign(null);
      setAssignForm({ employeeId: '', condition: '', notes: '' });
      flash('Asset assigned');
    } catch (e: any) { setError(e.response?.data?.message ?? 'Failed to assign'); }
    finally { setSubmitting(false); }
  };

  const handleReturn = async (assignmentId: string) => {
    if (!confirm('Mark this asset as returned?')) return;
    setReturnLoading(assignmentId);
    try {
      await api.post(`/api/assets/assignments/${assignmentId}/return`, {});
      await Promise.all([fetchMy(), canManageAssets ? fetchAll() : Promise.resolve()]);
      flash('Asset returned');
    } catch (e: any) { setError(e.response?.data?.message ?? 'Failed to return'); }
    finally { setReturnLoading(null); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  const inputCls = 'w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30';
  const selectCls = `${inputCls} appearance-none`;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Assets</h1>
          <p className="text-muted-foreground text-sm">Company assets assigned to you</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageAssets && (
            <>
              <div className="flex gap-1">
                <button onClick={() => setTab('my')} className={cn('px-3 py-2 text-sm font-medium rounded-lg', tab === 'my' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>My Assets</button>
                <button onClick={() => setTab('all')} className={cn('px-3 py-2 text-sm font-medium rounded-lg', tab === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>All Assets</button>
              </div>
              {isHR && (
                <button onClick={() => setShowAddAsset(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                  <Plus className="w-4 h-4" /> Add Asset
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-500 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-600 p-3.5 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* My assigned assets */}
      {tab === 'my' && (
        <>
          {myAssets.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No assets currently assigned to you</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myAssets.map(a => (
                <div key={a.id} className="bg-card border rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/30 text-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      {typeIcon(a.asset?.type ?? '')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{a.asset?.name}</p>
                      <p className="text-xs text-muted-foreground">{a.asset?.type}</p>
                    </div>
                  </div>
                  {a.asset?.serialNumber && (
                    <div className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1">SN: {a.asset.serialNumber}</div>
                  )}
                  <div className="text-xs text-muted-foreground">Assigned: {formatDate(a.assignedAt)}</div>
                  {a.condition && <div className="text-xs text-muted-foreground">Condition: {a.condition}</div>}
                  {canManageAssets && (
                    <button
                      onClick={() => handleReturn(a.id)}
                      disabled={returnLoading === a.id}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors"
                    >
                      {returnLoading === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
                      Return
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Manager+: All assets */}
      {tab === 'all' && canManageAssets && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Asset</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Serial No.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Assigned To</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {allAssets.map(a => {
                const currentAssignment = a.assignments?.[0];
                return (
                  <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-950/30 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          {typeIcon(a.type)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{a.name}</p>
                          {a.brand && <p className="text-xs text-muted-foreground">{a.brand} {a.model}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{a.type}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground hidden md:table-cell">{a.serialNumber ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[a.status])}>
                        {a.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {currentAssignment?.employee
                        ? <span>{currentAssignment.employee.firstName} {currentAssignment.employee.lastName}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {a.status === 'AVAILABLE' && (
                          <button
                            onClick={() => setShowAssign(a)}
                            className="text-xs font-medium px-2.5 py-1 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                          >
                            Assign
                          </button>
                        )}
                        {a.status === 'ASSIGNED' && currentAssignment && (
                          <button
                            onClick={() => handleReturn(currentAssignment.id)}
                            disabled={returnLoading === currentAssignment.id}
                            className="text-xs font-medium px-2.5 py-1 bg-muted rounded-lg hover:bg-muted/70 transition-colors"
                          >
                            {returnLoading === currentAssignment.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Return'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {allAssets.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">No assets created yet</div>
          )}
        </div>
      )}

      {/* Add Asset Modal */}
      {showAddAsset && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold">Add New Asset</h2>
              <button onClick={() => setShowAddAsset(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <form onSubmit={handleCreateAsset} className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">Asset Name *</label>
                  <input className={inputCls} value={assetForm.name} onChange={e => setAssetForm(f => ({...f, name: e.target.value}))} placeholder="e.g. MacBook Pro 14" required />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Type *</label>
                  <select className={selectCls} value={assetForm.type} onChange={e => setAssetForm(f => ({...f, type: e.target.value}))}>
                    {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Serial Number</label>
                  <input className={inputCls} value={assetForm.serialNumber} onChange={e => setAssetForm(f => ({...f, serialNumber: e.target.value}))} placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Brand</label>
                  <input className={inputCls} value={assetForm.brand} onChange={e => setAssetForm(f => ({...f, brand: e.target.value}))} placeholder="e.g. Apple" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Model</label>
                  <input className={inputCls} value={assetForm.model} onChange={e => setAssetForm(f => ({...f, model: e.target.value}))} placeholder="e.g. M3 Pro" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">Notes</label>
                  <input className={inputCls} value={assetForm.notes} onChange={e => setAssetForm(f => ({...f, notes: e.target.value}))} placeholder="Optional notes" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddAsset(false)} className="flex-1 py-2.5 text-sm border rounded-xl hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Asset Modal */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold">Assign: {showAssign.name}</h2>
              <button onClick={() => setShowAssign(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <form onSubmit={handleAssign} className="p-6 space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Employee *</label>
                <select className={selectCls} value={assignForm.employeeId} onChange={e => setAssignForm(f => ({...f, employeeId: e.target.value}))} required>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Condition</label>
                <input className={inputCls} value={assignForm.condition} onChange={e => setAssignForm(f => ({...f, condition: e.target.value}))} placeholder="e.g. Good, New" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Notes</label>
                <input className={inputCls} value={assignForm.notes} onChange={e => setAssignForm(f => ({...f, notes: e.target.value}))} placeholder="Optional" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAssign(null)} className="flex-1 py-2.5 text-sm border rounded-xl hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
