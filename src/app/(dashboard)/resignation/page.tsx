'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useRole } from '@/hooks/useAuth';
import {
  LogOut, Plus, X, Loader2, ChevronRight, CheckCircle, XCircle,
  Clock, AlertTriangle, Calendar
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Resignation {
  id: string;
  reason: string;
  requestedLastDate: string;
  finalLastDate?: string;
  status: string;
  managerStatus: string;
  hrStatus: string;
  managerLastDate?: string;
  hrLastDate?: string;
  managerRemarks?: string;
  hrRemarks?: string;
  createdAt: string;
  employee: {
    firstName: string;
    lastName: string;
    employeeCode?: string;
    department?: { name: string };
    designation?: { name: string };
    manager?: { firstName: string; lastName: string };
    user?: { email: string };
  };
  exitClearance?: { id: string; status: string };
}

const STATUS_STYLE: Record<string, string> = {
  PENDING:          'bg-yellow-100 text-yellow-700',
  MANAGER_APPROVED: 'bg-blue-100 text-blue-700',
  HR_APPROVED:      'bg-indigo-100 text-indigo-700',
  BOTH_APPROVED:    'bg-green-100 text-green-700',
  REJECTED:         'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING:          'Pending',
  MANAGER_APPROVED: 'Manager Approved',
  HR_APPROVED:      'HR Approved',
  BOTH_APPROVED:    'Fully Approved',
  REJECTED:         'Rejected',
};

export default function ResignationPage() {
  const { can, role } = useRole();
  const isManagerOrAbove = can('MANAGER');
  const isHR = can('HR');
  const isEmployee = role === 'EMPLOYEE';

  const [resignations, setResignations] = useState<Resignation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  // New resignation form
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ reason: '', requestedLastDate: '' });

  // Action modals
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedResignation, setSelectedResignation] = useState<Resignation | null>(null);
  const [showActionModal, setShowActionModal] = useState<'manager-approve' | 'manager-reject' | 'hr-approve' | 'hr-reject' | null>(null);
  const [actionForm, setActionForm] = useState({ remarks: '', lastDate: '' });
  const [actionLoading, setActionLoading] = useState(false);

  // Exit clearance modal
  const [showExitClearance, setShowExitClearance] = useState(false);

  const fetchResignations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      const { data } = await api.get(`/api/resignation?${params}`);
      setResignations(data.data);
      setTotal(data.meta?.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchResignations(); }, [statusFilter]);

  const submitResignation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/resignation', form);
      setShowForm(false);
      setForm({ reason: '', requestedLastDate: '' });
      fetchResignations();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to submit resignation');
    } finally { setSubmitting(false); }
  };

  const openActionModal = (r: Resignation, type: typeof showActionModal) => {
    setSelectedResignation(r);
    setSelectedId(r.id);
    setActionForm({ remarks: '', lastDate: '' });
    setShowActionModal(type);
  };

  const submitAction = async () => {
    if (!selectedId || !showActionModal) return;
    setActionLoading(true);
    try {
      const endpoint = `/api/resignation/${selectedId}/${showActionModal}`;
      const payload: Record<string, string> = { remarks: actionForm.remarks };
      if (actionForm.lastDate) payload.lastDate = actionForm.lastDate;
      await api.put(endpoint, payload);
      setShowActionModal(null);
      fetchResignations();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Action failed');
    } finally { setActionLoading(false); }
  };

  const initiateExitClearance = async (resignationId: string) => {
    try {
      await api.post(`/api/resignation/${resignationId}/exit-clearance`, {});
      fetchResignations();
      alert('Exit clearance initiated successfully');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed');
    }
  };

  const needsLastDate = showActionModal === 'manager-approve' || showActionModal === 'hr-approve';
  const isReject = showActionModal === 'manager-reject' || showActionModal === 'hr-reject';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LogOut className="w-6 h-6" /> Resignation Management
          </h1>
          <p className="text-muted-foreground text-sm">{total} total requests</p>
        </div>
        {isEmployee && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition text-sm"
          >
            <Plus className="w-4 h-4" /> Submit Resignation
          </button>
        )}
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {['', 'PENDING', 'MANAGER_APPROVED', 'HR_APPROVED', 'BOTH_APPROVED', 'REJECTED'].map((s) => (
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
      ) : resignations.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <LogOut className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No resignation requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {resignations.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-5">
              {/* Top row */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="font-semibold">{r.employee.firstName} {r.employee.lastName}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.employee.designation?.name}{r.employee.department ? ` · ${r.employee.department.name}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.employee.user?.email}</p>
                </div>
                <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap', STATUS_STYLE[r.status])}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              </div>

              {/* Dates row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                <div>
                  <p className="text-muted-foreground text-xs">Submitted</p>
                  <p className="font-medium">{new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Requested Last Date</p>
                  <p className="font-medium">{new Date(r.requestedLastDate).toLocaleDateString()}</p>
                </div>
                {r.managerLastDate && (
                  <div>
                    <p className="text-muted-foreground text-xs">Manager's Date</p>
                    <p className="font-medium">{new Date(r.managerLastDate).toLocaleDateString()}</p>
                  </div>
                )}
                {r.finalLastDate && (
                  <div>
                    <p className="text-muted-foreground text-xs">Final Last Date</p>
                    <p className="font-medium text-green-600">{new Date(r.finalLastDate).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              {/* Reason */}
              <p className="text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2 mb-4 line-clamp-2">
                {r.reason}
              </p>

              {/* Approval status chips */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <span className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium',
                  r.managerStatus === 'APPROVED' ? 'bg-green-100 text-green-700' :
                  r.managerStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                )}>
                  {r.managerStatus === 'APPROVED' ? <CheckCircle className="w-3 h-3" /> : r.managerStatus === 'REJECTED' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  Manager: {r.managerStatus}
                </span>
                <span className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium',
                  r.hrStatus === 'APPROVED' ? 'bg-green-100 text-green-700' :
                  r.hrStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                )}>
                  {r.hrStatus === 'APPROVED' ? <CheckCircle className="w-3 h-3" /> : r.hrStatus === 'REJECTED' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  HR: {r.hrStatus}
                </span>
              </div>

              {/* Remarks */}
              {r.managerRemarks && (
                <p className="text-xs text-muted-foreground mb-1"><strong>Manager remarks:</strong> {r.managerRemarks}</p>
              )}
              {r.hrRemarks && (
                <p className="text-xs text-muted-foreground mb-3"><strong>HR remarks:</strong> {r.hrRemarks}</p>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                {/* Manager can approve/reject if pending */}
                {isManagerOrAbove && !isHR && r.managerStatus === 'PENDING' && r.status !== 'REJECTED' && (
                  <>
                    <button onClick={() => openActionModal(r, 'manager-approve')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => openActionModal(r, 'manager-reject')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </>
                )}

                {/* HR can approve/reject if pending */}
                {isHR && r.hrStatus === 'PENDING' && r.status !== 'REJECTED' && (
                  <>
                    <button onClick={() => openActionModal(r, 'hr-approve')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => openActionModal(r, 'hr-reject')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition">
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </>
                )}

                {/* Initiate exit clearance */}
                {isManagerOrAbove && ['BOTH_APPROVED', 'MANAGER_APPROVED', 'HR_APPROVED'].includes(r.status) && !r.exitClearance && (
                  <button onClick={() => initiateExitClearance(r.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition">
                    <LogOut className="w-3.5 h-3.5" /> Initiate Exit Clearance
                  </button>
                )}

                {/* View exit clearance */}
                {r.exitClearance && (
                  <Link href={`/exit-clearance/${r.id}`} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition">
                    <ChevronRight className="w-3.5 h-3.5" /> View Exit Clearance
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submit Resignation Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-bold text-red-600">Submit Resignation</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitResignation} className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                Your resignation will be sent to your manager and HR for approval.
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Reason for Resignation *</label>
                <textarea
                  value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  required rows={4} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background resize-none"
                  placeholder="Please provide your reason for resignation..."
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Requested Last Working Date *</label>
                <input
                  type="date" value={form.requestedLastDate} onChange={e => setForm(f => ({ ...f, requestedLastDate: e.target.value }))}
                  required min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Resignation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && selectedResignation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">
                {showActionModal === 'manager-approve' && 'Approve Resignation (Manager)'}
                {showActionModal === 'manager-reject' && 'Reject Resignation (Manager)'}
                {showActionModal === 'hr-approve' && 'Approve Resignation (HR)'}
                {showActionModal === 'hr-reject' && 'Reject Resignation (HR)'}
              </h3>
              <button onClick={() => setShowActionModal(null)}><X className="w-5 h-5" /></button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Employee: <strong>{selectedResignation.employee.firstName} {selectedResignation.employee.lastName}</strong>
              <br />Requested last date: <strong>{new Date(selectedResignation.requestedLastDate).toLocaleDateString()}</strong>
            </p>

            {needsLastDate && (
              <div className="mb-4">
                <label className="text-sm font-medium block mb-1">Last Working Date *</label>
                <input
                  type="date" value={actionForm.lastDate} onChange={e => setActionForm(f => ({ ...f, lastDate: e.target.value }))}
                  required className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="text-sm font-medium block mb-1">Remarks {isReject ? '*' : '(optional)'}</label>
              <textarea
                value={actionForm.remarks} onChange={e => setActionForm(f => ({ ...f, remarks: e.target.value }))}
                rows={3} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background resize-none"
                placeholder={isReject ? 'Explain the rejection reason...' : 'Add any remarks...'}
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowActionModal(null)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium">Cancel</button>
              <button
                onClick={submitAction}
                disabled={
                  actionLoading ||
                  (needsLastDate && !actionForm.lastDate) ||
                  (isReject && !actionForm.remarks)
                }
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2',
                  isReject ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                )}
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isReject ? 'Reject' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
