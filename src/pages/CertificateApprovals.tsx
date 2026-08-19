import { useEffect, useState } from 'react';
import api, { BASE_URL } from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useCertificateCapture, CertRenderData } from '@/hooks/useCertificateCapture';
import {
  Award, Loader2, X, CheckCircle2, Circle, Download, User, GraduationCap,
  Wallet, BarChart3, ClipboardList,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type CertType = 'COURSE_COMPLETION' | 'INTERNSHIP';

interface CertRow {
  id: string;
  studentId: string;
  type: CertType;
  certificateNo: string | null;
  generatedAt: string | null;
  feeApprovedAt: string | null;
  ldmApprovedAt: string | null;
  student: { id: string; firstName: string; lastName: string; studentCode: string; photo: string | null; track: string; status: string };
  course: { id: string; name: string } | null;
  feeApprovedBy: { firstName: string; lastName: string } | null;
  ldmApprovedBy: { firstName: string; lastName: string } | null;
}

interface RankCardEntry {
  scheduleId: string;
  courseName: string;
  batchCode: string;
  rank: number | null;
  totalStudents: number;
  percentage: number;
  classAverage: number;
  attendance: { present: number; absent: number; late: number; total: number };
}

interface DetailData extends CertRow {
  student: CertRow['student'] & {
    email: string | null; phone: string | null; joiningDate: string; movedToPlacementAt: string | null;
    totalProgramFee: number | null; amountPaid: number | null; balanceAmount: number | null; paymentMode: string | null;
    portfolio: { targetRole: string | null; summary: string | null; status: string; publicSlug: string | null } | null;
  };
  rankCard: RankCardEntry[];
}

const resolveUrl = (p?: string | null) => {
  if (!p) return '';
  if (/^https?:\/\//i.test(p) || p.startsWith('data:')) return p;
  return `${BASE_URL}${p}`;
};

const TYPE_LABEL: Record<CertType, string> = { COURSE_COMPLETION: 'Course Completion', INTERNSHIP: 'Internship' };
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');
const inr = (n: number | null) => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`);

function ApprovalPill({ approved, name }: { approved: boolean; name?: string }) {
  return approved ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" /> {name || 'Approved'}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
      <Circle className="w-3 h-3" /> Pending
    </span>
  );
}

// ─── Review modal ─────────────────────────────────────────────────────────────

function ReviewModal({ id, canEdit, onClose, onChanged }: { id: string; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'fee' | 'ldm' | 'download' | null>(null);
  const { capture, CaptureNode } = useCertificateCapture();

  const load = () => {
    setLoading(true);
    api.get(`/api/certificate-requests/${id}`).then((r) => setData(r.data.data)).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  async function approve(kind: 'fee' | 'ldm') {
    setBusy(kind);
    try {
      await api.post(`/api/certificate-requests/${id}/approve-${kind}`);
      load();
      onChanged();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Approval failed');
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy('download');
    try {
      const { data: rd } = await api.get(`/api/certificate-requests/${id}/render-data`);
      const renderData = rd.data as CertRenderData;
      const blob = await capture(renderData);
      if (!blob) throw new Error('capture failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(renderData.certificateNo || `Certificate_${data?.student.studentCode || id}`).replace(/[^a-z0-9]+/gi, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Could not download the certificate');
    } finally {
      setBusy(null);
    }
  }

  const downloadable = !!(data?.feeApprovedAt && data?.ldmApprovedAt && data?.certificateNo);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b px-5 py-3 flex items-center justify-between z-10">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-600" />
            {data ? TYPE_LABEL[data.type] : 'Certificate'} Review
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {loading || !data ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Student profile */}
            <div className="flex items-start gap-4">
              {data.student.photo ? (
                <img src={resolveUrl(data.student.photo)} className="w-16 h-16 rounded-lg object-cover border" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center"><User className="w-6 h-6 text-muted-foreground" /></div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{data.student.firstName} {data.student.lastName}</p>
                <p className="text-xs text-muted-foreground">{data.student.studentCode} · {data.student.track} · {data.student.status}</p>
                {data.course && <p className="text-xs text-muted-foreground mt-0.5">Course: {data.course.name}</p>}
                {data.student.portfolio?.targetRole && <p className="text-xs text-muted-foreground">Aspiring: {data.student.portfolio.targetRole}</p>}
              </div>
            </div>

            {/* Fee summary — what the Fee/Admin approval is checking */}
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Fee Status</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><p className="text-muted-foreground">Total Fee</p><p className="font-semibold">{inr(data.student.totalProgramFee)}</p></div>
                <div><p className="text-muted-foreground">Paid</p><p className="font-semibold text-emerald-700">{inr(data.student.amountPaid)}</p></div>
                <div><p className="text-muted-foreground">Balance</p><p className={`font-semibold ${(data.student.balanceAmount || 0) > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{inr(data.student.balanceAmount)}</p></div>
              </div>
            </div>

            {/* Rank card */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Rank Card</p>
              {data.rankCard.length === 0 ? (
                <p className="text-xs text-muted-foreground">No enrollment / marks data.</p>
              ) : (
                <div className="space-y-2">
                  {data.rankCard.map((rc) => (
                    <div key={rc.scheduleId} className="border rounded-lg p-2.5 text-xs">
                      <p className="font-semibold">{rc.courseName} <span className="text-muted-foreground font-normal">· {rc.batchCode}</span></p>
                      <div className="grid grid-cols-4 gap-2 mt-1.5 text-muted-foreground">
                        <div>Rank: <span className="font-semibold text-foreground">{rc.rank ?? '—'}/{rc.totalStudents}</span></div>
                        <div>Score: <span className="font-semibold text-foreground">{rc.percentage}%</span></div>
                        <div>Avg: <span className="font-semibold text-foreground">{rc.classAverage}%</span></div>
                        <div>Attendance: <span className="font-semibold text-foreground">{rc.attendance.total ? Math.round((rc.attendance.present / rc.attendance.total) * 100) : 0}%</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Approvals */}
            <div className="border-t pt-4 space-y-2.5">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Approvals</p>
              <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-medium">Fee / Admin Approval</p>
                  <p className="text-[11px] text-muted-foreground">Confirms fees are fully cleared</p>
                </div>
                {data.feeApprovedAt ? (
                  <ApprovalPill approved name={`${data.feeApprovedBy?.firstName} ${data.feeApprovedBy?.lastName} · ${fmt(data.feeApprovedAt)}`} />
                ) : canEdit ? (
                  <button
                    onClick={() => approve('fee')}
                    disabled={busy !== null}
                    className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {busy === 'fee' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Approve'}
                  </button>
                ) : (
                  <ApprovalPill approved={false} />
                )}
              </div>

              <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
                <div>
                  <p className="text-xs font-medium">LDM Approval</p>
                  <p className="text-[11px] text-muted-foreground">Second, independent sign-off</p>
                </div>
                {data.ldmApprovedAt ? (
                  <ApprovalPill approved name={`${data.ldmApprovedBy?.firstName} ${data.ldmApprovedBy?.lastName} · ${fmt(data.ldmApprovedAt)}`} />
                ) : canEdit ? (
                  <button
                    onClick={() => approve('ldm')}
                    disabled={busy !== null}
                    className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {busy === 'ldm' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Approve'}
                  </button>
                ) : (
                  <ApprovalPill approved={false} />
                )}
              </div>

              {downloadable && (
                <button
                  onClick={download}
                  disabled={busy !== null}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-emerald-600 text-white px-3 py-2 rounded-lg disabled:opacity-50 mt-2"
                >
                  {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download Certificate {data.certificateNo ? `(${data.certificateNo})` : ''}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {CaptureNode}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CertificateApprovals() {
  const { hasModule } = useModuleAccess();
  const canEdit = hasModule('CERTIFICATES', 'EDIT');
  const [rows, setRows] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | CertType>('ALL');
  const [reviewId, setReviewId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get('/api/certificate-requests').then((r) => setRows(r.data.data || [])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = filter === 'ALL' ? rows : rows.filter((r) => r.type === filter);
  const pendingCount = rows.filter((r) => !r.feeApprovedAt || !r.ldmApprovedAt).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Award className="w-5 h-5 text-amber-600" /> Certificate Approvals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{pendingCount} awaiting approval · {rows.length} total</p>
        </div>
        <div className="flex gap-1.5 bg-secondary rounded-lg p-1">
          {(['ALL', 'COURSE_COMPLETION', 'INTERNSHIP'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${filter === t ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}
            >
              {t === 'ALL' ? 'All' : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground text-sm">No certificate requests yet.</div>
      ) : (
        <div className="bg-card rounded-xl border divide-y">
          {filtered.map((r) => {
            const downloadable = !!(r.feeApprovedAt && r.ldmApprovedAt && r.certificateNo);
            return (
              <div key={r.id} className="flex items-center gap-4 px-4 py-3">
                {r.student.photo ? (
                  <img src={resolveUrl(r.student.photo)} className="w-10 h-10 rounded-lg object-cover border shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0"><GraduationCap className="w-5 h-5 text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.student.firstName} {r.student.lastName} <span className="text-xs text-muted-foreground font-normal">· {r.student.studentCode}</span></p>
                  <p className="text-xs text-muted-foreground">{TYPE_LABEL[r.type]}{r.course ? ` · ${r.course.name}` : ''}</p>
                </div>
                <ApprovalPill approved={!!r.feeApprovedAt} name="Fee ✓" />
                <ApprovalPill approved={!!r.ldmApprovedAt} name="LDM ✓" />
                {downloadable && <span className="text-xs font-medium text-emerald-700">Downloadable</span>}
                <button
                  onClick={() => setReviewId(r.id)}
                  className="text-xs font-medium border rounded-lg px-3 py-1.5 hover:bg-secondary shrink-0"
                >
                  Review
                </button>
              </div>
            );
          })}
        </div>
      )}

      {reviewId && (
        <ReviewModal id={reviewId} canEdit={canEdit} onClose={() => setReviewId(null)} onChanged={load} />
      )}
    </div>
  );
}
