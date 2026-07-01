import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { BASE_URL } from '@/lib/api';
import { useRole } from '@/hooks/useAuth';
import {
  CheckCircle, XCircle, FileText, ArrowLeft,
  Loader2, AlertTriangle, X, User, GraduationCap,
  Briefcase, PhoneCall, Building2, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  joiningDate: string;
  status: string;
  hrRemarks?: string;
  hrFinalRemarks?: string;
  rejectionReason?: string;
  hrApprovedAt?: string;
  hrFinalApprovedAt?: string;
  tempPassword?: string;
  graceDaysLeft?: number;
  gracePeriodExpired?: boolean;
  documentDeadline?: string;
  profileCompletedAt?: string;
  documentsSubmittedAt?: string;
  employee?: {
    status: string;
    employeeCode: string;
    dateOfBirth?: string;
    gender?: string;
    bloodGroup?: string;
    phone?: string;
    department?: { name: string };
    designation?: { name: string };
    address?: { current?: string; city?: string; state?: string };
    bankDetails?: { bankName: string; accountNumber: string; ifscCode: string }[];
    emergencyContacts?: { name: string; relationship: string; phone: string }[];
    education?: { degree: string; institution: string; endYear?: number; grade?: string }[];
    experience?: { company: string; designation: string; startDate: string; endDate?: string }[];
    documents?: { id: string; type: string; name: string; fileUrl?: string; fileKey: string; uploadedAt: string }[];
  };
}

const STATUS_STYLE: Record<string, string> = {
  PENDING:            'bg-yellow-100 text-yellow-700',
  ACCOUNT_CREATED:    'bg-blue-100 text-blue-700',
  PROFILE_COMPLETE:   'bg-purple-100 text-purple-700',
  AWAITING_APPROVAL:  'bg-orange-100 text-orange-700',
  COMPLETED:          'bg-green-100 text-green-700',
  REJECTED:           'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING:            'Pending Approval',
  ACCOUNT_CREATED:    'Account Created',
  PROFILE_COMPLETE:   'Profile Filled',
  AWAITING_APPROVAL:  'Awaiting HR Review',
  COMPLETED:          'Completed',
  REJECTED:           'Rejected',
};

export default function OnboardingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useRole();
  const isHR = can('HR');

  const [data, setData] = useState<OnboardingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modal, setModal] = useState<'approve' | 'reject' | 'final-approve' | 'final-reject' | null>(null);
  const [remarks, setRemarks] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'profile' | 'docs'>('overview');

  const fetchData = async () => {
    try {
      const r = await api.get(`/api/onboarding/${id}`);
      setData(r.data.data);
    } catch { navigate('/onboarding'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  const doAction = async () => {
    if (!modal) return;
    setActionLoading(modal);
    try {
      if (modal === 'approve')       await api.put(`/api/onboarding/${id}/approve`, { remarks });
      if (modal === 'reject')        await api.put(`/api/onboarding/${id}/reject`, { reason: remarks });
      if (modal === 'final-approve') await api.put(`/api/onboarding/${id}/final-approve`, { remarks });
      if (modal === 'final-reject')  await api.put(`/api/onboarding/${id}/final-reject`, { reason: remarks });
      setModal(null);
      setRemarks('');
      fetchData();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Action failed');
    } finally { setActionLoading(null); }
  };

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!data) return null;

  const emp = data.employee;
  const isReject = modal === 'reject' || modal === 'final-reject';
  const modalTitle: Record<string, string> = {
    'approve': 'Approve & Create Account',
    'reject': 'Reject Onboarding Request',
    'final-approve': 'Final Approval — Activate Employee',
    'final-reject': 'Send Back for Corrections',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/onboarding" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Onboarding
      </Link>

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
              {data.firstName[0]}{data.lastName[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold">{data.firstName} {data.lastName}</h1>
              <p className="text-muted-foreground text-sm">{data.email} {data.phone && `· ${data.phone}`}</p>
              <p className="text-muted-foreground text-xs">Joining: {new Date(data.joiningDate).toLocaleDateString()}</p>
            </div>
          </div>
          <span className={cn('px-3 py-1 rounded-full text-sm font-medium', STATUS_STYLE[data.status] || 'bg-gray-100')}>
            {STATUS_LABEL[data.status] || data.status}
          </span>
        </div>

        {/* Timeline chips */}
        <div className="mt-4 flex gap-3 flex-wrap text-xs">
          {data.hrApprovedAt && <span className="px-2 py-1 bg-muted rounded-full">Account created: {new Date(data.hrApprovedAt).toLocaleDateString()}</span>}
          {data.profileCompletedAt && <span className="px-2 py-1 bg-muted rounded-full">Profile filled: {new Date(data.profileCompletedAt).toLocaleDateString()}</span>}
          {data.documentDeadline && data.status === 'PROFILE_COMPLETE' && (
            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
              Doc deadline: {new Date(data.documentDeadline).toLocaleDateString()}
            </span>
          )}
          {data.documentsSubmittedAt && <span className="px-2 py-1 bg-muted rounded-full">Docs submitted: {new Date(data.documentsSubmittedAt).toLocaleDateString()}</span>}
          {data.hrFinalApprovedAt && <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full">Final approved: {new Date(data.hrFinalApprovedAt).toLocaleDateString()}</span>}
        </div>

        {data.hrFinalRemarks && (
          <p className="mt-3 text-sm bg-amber-50 text-amber-800 rounded-lg p-3">
            <strong>HR Remarks:</strong> {data.hrFinalRemarks}
          </p>
        )}
        {data.rejectionReason && (
          <p className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span><strong>Rejection:</strong> {data.rejectionReason}</span>
          </p>
        )}

        {/* Temp password */}
        {isHR && data.tempPassword && data.status !== 'COMPLETED' && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
            <p className="font-semibold text-amber-800 mb-1">Temporary Password (share securely)</p>
            <p className="font-mono text-base tracking-wider text-amber-900">{data.tempPassword}</p>
          </div>
        )}
      </div>

      {/* HR Action Buttons */}
      {isHR && (
        <div className="flex gap-3 flex-wrap">
          {data.status === 'PENDING' && (
            <>
              <button onClick={() => { setRemarks(''); setModal('approve'); }} className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition">
                <CheckCircle className="w-4 h-4" /> Approve & Create Account
              </button>
              <button onClick={() => { setRemarks(''); setModal('reject'); }} className="flex items-center gap-2 px-4 py-2.5 bg-red-100 text-red-700 rounded-xl text-sm font-medium hover:bg-red-200 transition">
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </>
          )}
          {(data.status === 'AWAITING_APPROVAL' || data.status === 'PROFILE_COMPLETE') && (
            <>
              <button onClick={() => { setRemarks(''); setModal('final-approve'); }} className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition">
                <CheckCircle className="w-4 h-4" /> Final Approve — Activate
              </button>
              <button onClick={() => { setRemarks(''); setModal('final-reject'); }} className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-200 transition">
                <AlertTriangle className="w-4 h-4" /> Send Back for Corrections
              </button>
            </>
          )}
        </div>
      )}

      {/* Tabs (only show if profile data exists) */}
      {emp && (
        <>
          <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
            {[['overview','Overview'],['profile','Profile & Docs'],['docs','Uploaded Documents']].map(([t, l]) => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition', activeTab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {l}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <InfoCard title="Personal" icon={<User className="w-4 h-4" />}>
                <InfoRow label="DOB" value={emp.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString() : '—'} />
                <InfoRow label="Gender" value={emp.gender || '—'} />
                <InfoRow label="Blood Group" value={emp.bloodGroup || '—'} />
                <InfoRow label="Phone" value={emp.phone || '—'} />
              </InfoCard>
              <InfoCard title="Work" icon={<Building2 className="w-4 h-4" />}>
                <InfoRow label="Code" value={emp.employeeCode} />
                <InfoRow label="Department" value={emp.department?.name || '—'} />
                <InfoRow label="Designation" value={emp.designation?.name || '—'} />
                <InfoRow label="Status" value={emp.status} />
              </InfoCard>
              {emp.address && (
                <InfoCard title="Address" icon={<MapPinIcon />}>
                  <p className="text-sm text-muted-foreground">{emp.address.current}</p>
                  <p className="text-sm text-muted-foreground">{emp.address.city}, {emp.address.state}</p>
                </InfoCard>
              )}
              {emp.emergencyContacts && emp.emergencyContacts[0] && (
                <InfoCard title="Emergency Contact" icon={<PhoneCall className="w-4 h-4" />}>
                  <InfoRow label="Name" value={emp.emergencyContacts[0].name} />
                  <InfoRow label="Relation" value={emp.emergencyContacts[0].relationship} />
                  <InfoRow label="Phone" value={emp.emergencyContacts[0].phone} />
                </InfoCard>
              )}
              {emp.bankDetails && emp.bankDetails[0] && (
                <InfoCard title="Bank Details" icon={<Building2 className="w-4 h-4" />}>
                  <InfoRow label="Bank" value={emp.bankDetails[0].bankName} />
                  <InfoRow label="A/C" value={emp.bankDetails[0].accountNumber} />
                  <InfoRow label="IFSC" value={emp.bankDetails[0].ifscCode} />
                </InfoCard>
              )}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-4">
              {emp.education && emp.education.length > 0 && (
                <InfoCard title="Education" icon={<GraduationCap className="w-4 h-4" />}>
                  {emp.education.map((e, i) => (
                    <div key={i} className="text-sm py-1 border-b border-border last:border-0">
                      <p className="font-medium">{e.degree} — {e.institution}</p>
                      <p className="text-muted-foreground">{e.endYear && `Passed: ${e.endYear}`} {e.grade && `· ${e.grade}`}</p>
                    </div>
                  ))}
                </InfoCard>
              )}
              {emp.experience && emp.experience.length > 0 && (
                <InfoCard title="Work Experience" icon={<Briefcase className="w-4 h-4" />}>
                  {emp.experience.map((e, i) => (
                    <div key={i} className="text-sm py-1 border-b border-border last:border-0">
                      <p className="font-medium">{e.designation} at {e.company}</p>
                      <p className="text-muted-foreground">
                        {new Date(e.startDate).toLocaleDateString()} — {e.endDate ? new Date(e.endDate).toLocaleDateString() : 'Present'}
                      </p>
                    </div>
                  ))}
                </InfoCard>
              )}
            </div>
          )}

          {activeTab === 'docs' && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4" /> Uploaded Documents</h2>
              </div>
              {!emp.documents || emp.documents.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {emp.documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between px-6 py-3">
                      <div>
                        <p className="text-sm font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{doc.type} · {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                      </div>
                      <a href={doc.fileUrl?.startsWith('http') ? doc.fileUrl : `${BASE_URL}${doc.fileUrl || `/uploads/documents/${doc.fileKey.split('/').pop()}`}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-muted rounded-lg hover:bg-accent transition">
                        <Eye className="w-3.5 h-3.5" /> View
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Action Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">{modalTitle[modal]}</h3>
              <button onClick={() => setModal(null)}><X className="w-5 h-5" /></button>
            </div>

            {modal === 'approve' && (
              <p className="text-sm text-muted-foreground mb-4">
                This will create an employee account for <strong>{data.firstName} {data.lastName}</strong> and send login credentials to <strong>{data.email}</strong>.
                The employee will be asked to complete their profile and upload documents.
              </p>
            )}
            {modal === 'final-approve' && (
              <p className="text-sm text-muted-foreground mb-4">
                You have reviewed the profile and all documents. This will activate the employee account.
              </p>
            )}
            {modal === 'final-reject' && (
              <p className="text-sm text-muted-foreground mb-4">
                The employee will be notified to correct their information and re-submit.
              </p>
            )}

            <label className="text-sm font-medium block mb-1">
              {isReject ? 'Reason *' : 'Remarks (optional)'}
            </label>
            <textarea
              value={remarks} onChange={e => setRemarks(e.target.value)}
              rows={3} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background mb-4 resize-none"
              placeholder={isReject ? 'Explain the reason...' : 'Any notes...'}
            />
            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium">Cancel</button>
              <button
                onClick={doAction}
                disabled={!!actionLoading || (isReject && !remarks)}
                className={cn('flex-1 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2',
                  isReject ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                )}
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isReject ? 'Reject' : modal === 'final-approve' ? 'Activate Employee' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MapPinIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>; }
function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="font-semibold text-sm flex items-center gap-2 mb-3">{icon} {title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return <p className="text-sm"><span className="text-muted-foreground">{label}:</span> <span className="font-medium">{value}</span></p>;
}
