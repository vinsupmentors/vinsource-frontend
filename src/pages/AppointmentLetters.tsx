import { useEffect, useState, useCallback } from 'react';
import api, { BASE_URL } from '@/lib/api';
import { useRole } from '@/hooks/useAuth';
import {
  FileText, Plus, Send, CheckCircle, XCircle, Download,
  Loader2, ChevronDown, ChevronUp, RefreshCw, Eye, Trash2, Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type LetterStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SENT';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  email: string;
  department?: { name: string };
  designation?: { name: string };
  joiningDate?: string;
}

interface Letter {
  id: string;
  employeeId: string;
  letterDate: string;
  salary: number;
  employmentType: string;
  workLocation: string;
  customClauses?: string;
  status: LetterStatus;
  rejectionNote?: string;
  createdAt: string;
  approvedAt?: string;
  sentAt?: string;
  employee: Employee;
  createdBy: { email: string; employee?: { firstName: string; lastName: string } };
  approvedBy?: { email: string; employee?: { firstName: string; lastName: string } };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtSalary(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

const STATUS_LABELS: Record<LetterStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SENT: 'Sent',
};

const STATUS_COLORS: Record<LetterStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-700',
  SENT: 'bg-green-100 text-green-800',
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LetterStatus }) {
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', STATUS_COLORS[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Create / Edit form ───────────────────────────────────────────────────────

interface FormState {
  employeeId: string;
  letterDate: string;
  salary: string;
  employmentType: string;
  workLocation: string;
  customClauses: string;
}

const EMPTY_FORM: FormState = {
  employeeId: '',
  letterDate: new Date().toISOString().slice(0, 10),
  salary: '',
  employmentType: 'Full Time',
  workLocation: '',
  customClauses: '',
};

function LetterForm({
  initial,
  employees,
  onSave,
  onCancel,
}: {
  initial?: Partial<FormState & { id: string }>;
  employees: Employee[];
  onSave: (data: FormState, id?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId || !form.letterDate || !form.salary || !form.workLocation) {
      setError('Employee, Letter Date, Salary and Work Location are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(form, initial?.id);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const selectedEmp = employees.find((e) => e.id === form.employeeId);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Employee */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
        <select
          value={form.employeeId}
          onChange={set('employeeId')}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={!!initial?.id}
        >
          <option value="">— Select Employee —</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.firstName} {emp.lastName} ({emp.employeeCode}) — {emp.designation?.name || 'No designation'}
            </option>
          ))}
        </select>
        {selectedEmp && (
          <p className="text-xs text-gray-500 mt-1">
            Personal email: {selectedEmp.email || <span className="text-red-500">No email on record</span>}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Letter Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Letter Date *</label>
          <input
            type="date"
            value={form.letterDate}
            onChange={set('letterDate')}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Monthly Salary */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monthly CTC (₹) *</label>
          <input
            type="number"
            value={form.salary}
            onChange={set('salary')}
            min={0}
            placeholder="e.g. 25000"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Work Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Work Location *</label>
          <input
            type="text"
            value={form.workLocation}
            onChange={set('workLocation')}
            placeholder="e.g. Coimbatore"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Employment Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
          <select
            value={form.employmentType}
            onChange={set('employmentType')}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option>Full Time</option>
            <option>Part Time</option>
            <option>Contract</option>
            <option>Internship</option>
          </select>
        </div>
      </div>

      {/* Custom Clauses */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes (optional)</label>
        <textarea
          value={form.customClauses}
          onChange={set('customClauses')}
          rows={3}
          placeholder="Any additional terms or notes to append to the letter..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {initial?.id ? 'Update Letter' : 'Create Draft'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Detail / Approval panel ──────────────────────────────────────────────────

function LetterDetail({
  letter,
  canApprove,
  onAction,
  onClose,
}: {
  letter: Letter;
  canApprove: boolean;
  onAction: (action: 'submit' | 'approve' | 'reject' | 'delete', letterId: string, extra?: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const [rejectionNote, setRejectionNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: 'submit' | 'approve' | 'reject' | 'delete') {
    setBusy(action);
    try {
      await onAction(action, letter.id, action === 'reject' ? { rejectionNote } : undefined);
    } finally {
      setBusy(null);
      if (action === 'reject') setShowReject(false);
    }
  }

  const token = localStorage.getItem('hrms_token');
  const pdfUrl = `${BASE_URL}/api/appointment-letters/${letter.id}/pdf`;

  function downloadPdf() {
    fetch(pdfUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Appointment_Letter_${letter.employee.firstName}_${letter.employee.lastName}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  const emp = letter.employee;
  const empName = `${emp.firstName} ${emp.lastName}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 text-lg">{empName}</h3>
          <p className="text-sm text-gray-500">{emp.designation?.name} — {emp.department?.name}</p>
        </div>
        <StatusBadge status={letter.status} />
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-gray-50 rounded-lg p-4">
        <div><span className="text-gray-500">Employee ID</span><p className="font-medium">{emp.employeeCode}</p></div>
        <div><span className="text-gray-500">Date of Joining</span><p className="font-medium">{fmtDate(emp.joiningDate)}</p></div>
        <div><span className="text-gray-500">Letter Date</span><p className="font-medium">{fmtDate(letter.letterDate)}</p></div>
        <div><span className="text-gray-500">Employment Type</span><p className="font-medium">{letter.employmentType}</p></div>
        <div><span className="text-gray-500">Work Location</span><p className="font-medium">{letter.workLocation}</p></div>
        <div><span className="text-gray-500">Monthly CTC</span><p className="font-medium">{fmtSalary(letter.salary)}</p></div>
        <div><span className="text-gray-500">Personal Email</span><p className="font-medium">{emp.email || '—'}</p></div>
        <div><span className="text-gray-500">Created By</span>
          <p className="font-medium">
            {letter.createdBy.employee ? `${letter.createdBy.employee.firstName} ${letter.createdBy.employee.lastName}` : letter.createdBy.email}
          </p>
        </div>
        {letter.approvedBy && (
          <div>
            <span className="text-gray-500">{letter.status === 'REJECTED' ? 'Rejected By' : 'Approved By'}</span>
            <p className="font-medium">
              {letter.approvedBy.employee ? `${letter.approvedBy.employee.firstName} ${letter.approvedBy.employee.lastName}` : letter.approvedBy.email}
            </p>
          </div>
        )}
        {letter.approvedAt && (
          <div><span className="text-gray-500">{letter.status === 'REJECTED' ? 'Rejected At' : 'Approved At'}</span><p className="font-medium">{fmtDate(letter.approvedAt)}</p></div>
        )}
        {letter.sentAt && (
          <div><span className="text-gray-500">Emailed At</span><p className="font-medium">{fmtDate(letter.sentAt)}</p></div>
        )}
      </div>

      {/* Rejection note */}
      {letter.rejectionNote && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          <p className="font-semibold text-red-700 mb-1">Rejection Note</p>
          <p className="text-red-600">{letter.rejectionNote}</p>
        </div>
      )}

      {/* Custom clauses */}
      {letter.customClauses && (
        <div className="text-sm">
          <p className="font-medium text-gray-700 mb-1">Additional Notes</p>
          <p className="text-gray-600 bg-gray-50 rounded p-3">{letter.customClauses}</p>
        </div>
      )}

      {/* Reject form */}
      {showReject && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-red-800">Reason for rejection</p>
          <textarea
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
            rows={3}
            placeholder="Briefly explain what needs to be corrected..."
            className="w-full border border-red-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => act('reject')}
              disabled={busy === 'reject'}
              className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {busy === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              Confirm Rejection
            </button>
            <button onClick={() => setShowReject(false)} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {/* Download PDF — always available */}
        <button
          onClick={downloadPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          <Download className="h-4 w-4" /> Download PDF
        </button>

        {/* Submit for approval — only for DRAFT/REJECTED */}
        {(letter.status === 'DRAFT' || letter.status === 'REJECTED') && (
          <button
            onClick={() => act('submit')}
            disabled={busy === 'submit'}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit for Approval
          </button>
        )}

        {/* Approve — only for approvers, only for PENDING */}
        {canApprove && letter.status === 'PENDING_APPROVAL' && (
          <>
            <button
              onClick={() => act('approve')}
              disabled={!!busy}
              className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Approve &amp; Send
            </button>
            {!showReject && (
              <button
                onClick={() => setShowReject(true)}
                className="flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-100"
              >
                <XCircle className="h-4 w-4" /> Reject
              </button>
            )}
          </>
        )}

        {/* Delete DRAFT */}
        {letter.status === 'DRAFT' && (
          <button
            onClick={() => act('delete')}
            disabled={busy === 'delete'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
          >
            {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete Draft
          </button>
        )}

        <button onClick={onClose} className="ml-auto px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AppointmentLettersPage() {
  const { isHR, isAdmin, isSuperAdmin } = useRole();
  const canApprove = isAdmin || isSuperAdmin;

  const [letters, setLetters] = useState<Letter[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLetter, setEditingLetter] = useState<Letter | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [filterStatus, setFilterStatus] = useState<LetterStatus | 'ALL'>('ALL');

  // Status counts for summary pills
  const counts = letters.reduce(
    (acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; },
    {} as Partial<Record<LetterStatus, number>>,
  );

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const fetchLetters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/appointment-letters');
      setLetters(res.data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await api.get('/api/employees?limit=500');
      setEmployees(res.data.data || res.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchLetters();
    if (isHR || isSuperAdmin) fetchEmployees();
  }, [fetchLetters, fetchEmployees, isHR, isSuperAdmin]);

  async function handleSave(form: FormState, id?: string) {
    if (id) {
      await api.put(`/api/appointment-letters/${id}`, form);
      showToast('Letter updated.');
    } else {
      await api.post('/api/appointment-letters', form);
      showToast('Draft created successfully.');
    }
    setShowForm(false);
    setEditingLetter(null);
    fetchLetters();
  }

  async function handleAction(
    action: 'submit' | 'approve' | 'reject' | 'delete',
    letterId: string,
    extra?: Record<string, string>,
  ) {
    switch (action) {
      case 'submit':
        await api.post(`/api/appointment-letters/${letterId}/submit`);
        showToast('Submitted for approval. Pooranam has been notified.');
        break;
      case 'approve':
        await api.post(`/api/appointment-letters/${letterId}/approve`);
        showToast('Letter approved and emailed to the employee!');
        break;
      case 'reject':
        await api.post(`/api/appointment-letters/${letterId}/reject`, extra);
        showToast('Letter rejected. HR has been notified.', 'error');
        break;
      case 'delete':
        await api.delete(`/api/appointment-letters/${letterId}`);
        showToast('Draft deleted.');
        setSelectedLetter(null);
        break;
    }
    await fetchLetters();
    // Refresh selected letter if still open
    if (action !== 'delete' && selectedLetter?.id === letterId) {
      const res = await api.get(`/api/appointment-letters/${letterId}`);
      setSelectedLetter(res.data.data);
    }
  }

  function openEdit(letter: Letter) {
    setEditingLetter(letter);
    setShowForm(true);
    setSelectedLetter(null);
  }

  const filtered = filterStatus === 'ALL' ? letters : letters.filter((l) => l.status === filterStatus);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium max-w-sm',
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600',
        )}>
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <FileText className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Appointment Letters</h1>
            <p className="text-sm text-gray-500">Create, approve and send appointment letters to employees</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLetters} className="p-2 rounded-md hover:bg-gray-100" title="Refresh">
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </button>
          {(isHR || isSuperAdmin) && !showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingLetter(null); }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> New Letter
            </button>
          )}
        </div>
      </div>

      {/* Summary pills */}
      {!loading && letters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT'] as const).map((s) => {
            const cnt = s === 'ALL' ? letters.length : (counts[s] || 0);
            if (s !== 'ALL' && cnt === 0) return null;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                  filterStatus === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400',
                )}
              >
                {s === 'ALL' ? `All (${cnt})` : `${STATUS_LABELS[s]} (${cnt})`}
              </button>
            );
          })}
        </div>
      )}

      {/* Create/Edit form panel */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            {editingLetter ? 'Edit Appointment Letter' : 'New Appointment Letter'}
          </h2>
          <LetterForm
            initial={
              editingLetter
                ? {
                    id: editingLetter.id,
                    employeeId: editingLetter.employeeId,
                    letterDate: editingLetter.letterDate.slice(0, 10),
                    salary: String(editingLetter.salary),
                    employmentType: editingLetter.employmentType,
                    workLocation: editingLetter.workLocation,
                    customClauses: editingLetter.customClauses || '',
                  }
                : undefined
            }
            employees={employees}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingLetter(null); }}
          />
        </div>
      )}

      {/* Detail panel */}
      {selectedLetter && !showForm && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <LetterDetail
            letter={selectedLetter}
            canApprove={canApprove}
            onAction={handleAction}
            onClose={() => setSelectedLetter(null)}
          />
        </div>
      )}

      {/* Letters list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No letters found</p>
          {(isHR || isSuperAdmin) && (
            <p className="text-sm mt-1">Click "New Letter" to create one.</p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-semibold text-gray-600">Employee</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Department</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Letter Date</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Monthly CTC</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((letter) => {
                const isSelected = selectedLetter?.id === letter.id;
                return (
                  <tr
                    key={letter.id}
                    className={cn('hover:bg-blue-50/30 transition-colors', isSelected && 'bg-blue-50')}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {letter.employee.firstName} {letter.employee.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{letter.employee.employeeCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{letter.employee.department?.name || '—'}</p>
                      <p className="text-xs text-gray-400">{letter.employee.designation?.name || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtDate(letter.letterDate)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{fmtSalary(letter.salary)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={letter.status} />
                      {letter.status === 'REJECTED' && letter.rejectionNote && (
                        <p className="text-xs text-red-500 mt-0.5 max-w-[140px] truncate" title={letter.rejectionNote}>
                          {letter.rejectionNote}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {/* View / expand */}
                        <button
                          onClick={() => setSelectedLetter(isSelected ? null : letter)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          title={isSelected ? 'Collapse' : 'View details'}
                        >
                          {isSelected ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        {/* Edit — only DRAFT or REJECTED */}
                        {(letter.status === 'DRAFT' || letter.status === 'REJECTED') && (
                          <button
                            onClick={() => openEdit(letter)}
                            className="p-1.5 rounded hover:bg-gray-100 text-blue-500"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}

                        {/* Quick submit — only DRAFT */}
                        {letter.status === 'DRAFT' && (
                          <button
                            onClick={() => handleAction('submit', letter.id)}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                            title="Submit for approval"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        )}

                        {/* Quick approve — only for approvers, only PENDING */}
                        {canApprove && letter.status === 'PENDING_APPROVAL' && (
                          <button
                            onClick={() => { setSelectedLetter(letter); }}
                            className="p-1.5 rounded hover:bg-green-50 text-green-600"
                            title="Open to approve/reject"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
