import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '@/lib/api';
import { useRole } from '@/hooks/useAuth';
import {
  CheckCircle, XCircle, Clock, Package, ArrowLeft, Loader2, X, AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExitDoc {
  id: string;
  name: string;
  description?: string;
  isReceived: boolean;
  receivedAt?: string;
  receivedBy?: string;
}

interface ExitClearanceDetail {
  id: string;
  status: string;
  managerStatus: string;
  hrStatus: string;
  managerRemarks?: string;
  hrRemarks?: string;
  managerNewLastDate?: string;
  hrNewLastDate?: string;
  finalLastDate?: string;
  documents: ExitDoc[];
  resignation: {
    id: string;
    reason: string;
    finalLastDate?: string;
    requestedLastDate: string;
    status: string;
    employee: {
      id: string;
      firstName: string;
      lastName: string;
      employeeCode?: string;
      department?: { name: string };
      designation?: { name: string };
      manager?: { firstName: string; lastName: string; id: string };
      user?: { email: string };
    };
  };
}

const CLEARANCE_STATUS: Record<string, string> = {
  PENDING:          'bg-yellow-100 text-yellow-700',
  MANAGER_CLEARED:  'bg-blue-100 text-blue-700',
  HR_CLEARED:       'bg-indigo-100 text-indigo-700',
  COMPLETED:        'bg-green-100 text-green-700',
  REJECTED:         'bg-red-100 text-red-700',
};

export default function ExitClearancePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can, role } = useRole();
  const isHR = can('HR');
  const isManagerOrAbove = can('MANAGER');

  const [data, setData] = useState<ExitClearanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [showModal, setShowModal] = useState<'manager-clear' | 'manager-reject' | 'hr-clear' | 'hr-reject' | null>(null);
  const [actionForm, setActionForm] = useState({ remarks: '', newLastDate: '' });

  const fetch = async () => {
    try {
      const r = await api.get(`/api/resignation/${id}`);
      const resignation = r.data.data;
      if (!resignation.exitClearance) { navigate('/resignation'); return; }
      setData({ ...resignation.exitClearance, resignation });
    } catch { navigate('/resignation'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [id]);

  const markReceived = async (docId: string) => {
    setActionLoading(docId);
    try {
      await api.put(`/api/resignation/${id}/exit-clearance/doc/${docId}`, {
        receivedBy: 'HR/Admin',
      });
      fetch();
    } catch (e: any) { alert(e?.response?.data?.message || 'Failed'); }
    finally { setActionLoading(null); }
  };

  const submitAction = async () => {
    if (!showModal) return;
    setActionLoading('action');
    try {
      const endpoint = `/api/resignation/${id}/exit-clearance/${showModal}`;
      await api.put(endpoint, actionForm);
      setShowModal(null);
      fetch();
    } catch (e: any) { alert(e?.response?.data?.message || 'Action failed'); }
    finally { setActionLoading(null); }
  };

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!data) return null;

  const emp = data.resignation.employee;
  const isReject = showModal === 'manager-reject' || showModal === 'hr-reject';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to="/resignation" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Resignations
      </Link>

      {/* Employee Card */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-xl">
              {emp.firstName[0]}{emp.lastName[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold">{emp.firstName} {emp.lastName}</h1>
              <p className="text-muted-foreground text-sm">{emp.designation?.name} · {emp.department?.name}</p>
              <p className="text-muted-foreground text-sm">{emp.user?.email}</p>
            </div>
          </div>
          <span className={cn('px-3 py-1 rounded-full text-sm font-medium', CLEARANCE_STATUS[data.status] || 'bg-gray-100 text-gray-600')}>
            {data.status.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-border text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Requested Last Date</p>
            <p className="font-medium">{new Date(data.resignation.requestedLastDate).toLocaleDateString()}</p>
          </div>
          {data.resignation.finalLastDate && (
            <div>
              <p className="text-muted-foreground text-xs">Agreed Last Date</p>
              <p className="font-medium text-green-600">{new Date(data.resignation.finalLastDate).toLocaleDateString()}</p>
            </div>
          )}
          {data.finalLastDate && (
            <div>
              <p className="text-muted-foreground text-xs">Final Exit Date</p>
              <p className="font-medium text-green-700 font-semibold">{new Date(data.finalLastDate).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Clearance Status */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="font-semibold mb-4">Clearance Approval Status</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Manager */}
          <div className={cn('rounded-xl p-4 border', data.managerStatus === 'APPROVED' ? 'border-green-200 bg-green-50' : data.managerStatus === 'REJECTED' ? 'border-red-200 bg-red-50' : 'border-border bg-muted/30')}>
            <div className="flex items-center gap-2 mb-2">
              {data.managerStatus === 'APPROVED' ? <CheckCircle className="w-5 h-5 text-green-500" /> : data.managerStatus === 'REJECTED' ? <XCircle className="w-5 h-5 text-red-500" /> : <Clock className="w-5 h-5 text-amber-500" />}
              <span className="font-medium text-sm">Manager Clearance</span>
            </div>
            <p className="text-xs text-muted-foreground">Status: <strong>{data.managerStatus}</strong></p>
            {data.managerRemarks && <p className="text-xs mt-1 italic">"{data.managerRemarks}"</p>}
            {data.managerNewLastDate && <p className="text-xs mt-1">Proposed last date: <strong>{new Date(data.managerNewLastDate).toLocaleDateString()}</strong></p>}
          </div>

          {/* HR */}
          <div className={cn('rounded-xl p-4 border', data.hrStatus === 'APPROVED' ? 'border-green-200 bg-green-50' : data.hrStatus === 'REJECTED' ? 'border-red-200 bg-red-50' : 'border-border bg-muted/30')}>
            <div className="flex items-center gap-2 mb-2">
              {data.hrStatus === 'APPROVED' ? <CheckCircle className="w-5 h-5 text-green-500" /> : data.hrStatus === 'REJECTED' ? <XCircle className="w-5 h-5 text-red-500" /> : <Clock className="w-5 h-5 text-amber-500" />}
              <span className="font-medium text-sm">HR Clearance</span>
            </div>
            <p className="text-xs text-muted-foreground">Status: <strong>{data.hrStatus}</strong></p>
            {data.hrRemarks && <p className="text-xs mt-1 italic">"{data.hrRemarks}"</p>}
            {data.hrNewLastDate && <p className="text-xs mt-1">Proposed last date: <strong>{new Date(data.hrNewLastDate).toLocaleDateString()}</strong></p>}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-4 flex-wrap">
          {isManagerOrAbove && !isHR && data.managerStatus === 'PENDING' && (
            <>
              <button onClick={() => { setActionForm({ remarks: '', newLastDate: '' }); setShowModal('manager-clear'); }} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
                <CheckCircle className="w-4 h-4" /> Clear & Approve
              </button>
              <button onClick={() => { setActionForm({ remarks: '', newLastDate: '' }); setShowModal('manager-reject'); }} className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition">
                <XCircle className="w-4 h-4" /> Reject Exit
              </button>
            </>
          )}
          {isHR && data.hrStatus === 'PENDING' && (
            <>
              <button onClick={() => { setActionForm({ remarks: '', newLastDate: '' }); setShowModal('hr-clear'); }} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
                <CheckCircle className="w-4 h-4" /> HR Clear & Approve
              </button>
              <button onClick={() => { setActionForm({ remarks: '', newLastDate: '' }); setShowModal('hr-reject'); }} className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition">
                <XCircle className="w-4 h-4" /> Reject Exit
              </button>
            </>
          )}
        </div>
      </div>

      {/* Documents / Assets Checklist */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2"><Package className="w-4 h-4" /> Exit Documents & Asset Return</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.documents.filter(d => d.isReceived).length} of {data.documents.length} items received
          </p>
        </div>
        <div className="divide-y divide-border">
          {data.documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                {doc.isReceived
                  ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  : <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
                }
                <div>
                  <p className="font-medium text-sm">{doc.name}</p>
                  {doc.description && <p className="text-xs text-muted-foreground">{doc.description}</p>}
                  {doc.isReceived && doc.receivedAt && (
                    <p className="text-xs text-green-600">Received on {new Date(doc.receivedAt).toLocaleDateString()}{doc.receivedBy ? ` by ${doc.receivedBy}` : ''}</p>
                  )}
                </div>
              </div>
              {!doc.isReceived && (isHR || isManagerOrAbove) && data.status !== 'COMPLETED' && (
                <button
                  onClick={() => markReceived(doc.id)}
                  disabled={actionLoading === doc.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
                >
                  {actionLoading === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Mark Received
                </button>
              )}
              {doc.isReceived && <span className="text-xs text-green-600 font-medium">Received</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Action Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">
                {showModal === 'manager-clear' && 'Manager: Approve Exit Clearance'}
                {showModal === 'manager-reject' && 'Manager: Reject Exit Clearance'}
                {showModal === 'hr-clear' && 'HR: Approve Exit Clearance'}
                {showModal === 'hr-reject' && 'HR: Reject Exit Clearance'}
              </h3>
              <button onClick={() => setShowModal(null)}><X className="w-5 h-5" /></button>
            </div>

            {isReject && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 flex items-start gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                If you reject, the employee's exit will not be processed. You must provide a new proposed last working date.
              </div>
            )}

            {(showModal === 'manager-reject' || showModal === 'hr-reject') && (
              <div className="mb-4">
                <label className="text-sm font-medium block mb-1">New Proposed Last Working Date</label>
                <input
                  type="date" value={actionForm.newLastDate} onChange={e => setActionForm(f => ({ ...f, newLastDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                />
              </div>
            )}

            {(showModal === 'manager-clear' || showModal === 'hr-clear') && (
              <div className="mb-4">
                <label className="text-sm font-medium block mb-1">Override Last Working Date (optional)</label>
                <input
                  type="date" value={actionForm.newLastDate} onChange={e => setActionForm(f => ({ ...f, newLastDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  placeholder="Leave empty to use agreed date"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="text-sm font-medium block mb-1">Remarks {isReject ? '*' : '(optional)'}</label>
              <textarea
                value={actionForm.remarks} onChange={e => setActionForm(f => ({ ...f, remarks: e.target.value }))}
                rows={3} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background resize-none"
                placeholder={isReject ? 'Reason for rejection...' : 'Any final remarks...'}
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowModal(null)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium">Cancel</button>
              <button
                onClick={submitAction}
                disabled={actionLoading === 'action' || (isReject && !actionForm.remarks)}
                className={cn(
                  'flex-1 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2',
                  isReject ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                )}
              >
                {actionLoading === 'action' && <Loader2 className="w-4 h-4 animate-spin" />}
                {isReject ? 'Reject' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
