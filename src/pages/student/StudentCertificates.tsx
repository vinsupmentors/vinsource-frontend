import { useEffect, useState } from 'react';
import api, { BASE_URL } from '@/lib/api';
import { Loader2, Award, Lock, CheckCircle2, Circle, Download } from 'lucide-react';

type CertType = 'COURSE_COMPLETION' | 'INTERNSHIP';

interface CertRequest {
  id: string;
  type: CertType;
  courseName: string | null;
  feeApproved: boolean;
  ldmApproved: boolean;
  downloadable: boolean;
  certificateNo: string | null;
  generatedAt: string | null;
}

const TYPE_LABEL: Record<CertType, string> = { COURSE_COMPLETION: 'Course Completion Certificate', INTERNSHIP: 'Internship Certificate' };

function Checkpoint({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${done ? 'text-emerald-700' : 'text-muted-foreground'}`}>
      {done ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />} {label}
    </span>
  );
}

export default function StudentCertificates() {
  const [rows, setRows] = useState<CertRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/student-portal/certificates').then((r) => setRows(r.data.data || [])).finally(() => setLoading(false));
  }, []);

  async function download(id: string, filename: string) {
    setDownloadingId(id);
    try {
      const token = localStorage.getItem('hrms_token');
      const res = await fetch(`${BASE_URL}/api/student-portal/certificates/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Could not download the certificate right now — please try again in a moment.');
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">My Certificates</h1>

      {rows.length === 0 ? (
        <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground text-sm">
          No certificates yet. Your Course Completion certificate appears here once you're moved into the Placement Pool, and your Internship certificate appears once your portfolio is approved.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((c) => (
            <div key={c.id} className="bg-card rounded-xl border p-5">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${c.downloadable ? 'bg-amber-50' : 'bg-secondary'}`}>
                {c.downloadable ? <Award className="w-5 h-5 text-amber-600" /> : <Lock className="w-5 h-5 text-muted-foreground" />}
              </div>
              <p className="text-sm font-semibold">{TYPE_LABEL[c.type]}</p>
              {c.courseName && <p className="text-xs text-muted-foreground mt-0.5">{c.courseName}</p>}

              {c.downloadable ? (
                <>
                  <p className="text-xs text-muted-foreground mt-2">Certificate No: {c.certificateNo}</p>
                  <button
                    onClick={() => download(c.id, `${TYPE_LABEL[c.type].replace(/\s+/g, '_')}.pdf`)}
                    disabled={downloadingId === c.id}
                    className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-medium bg-primary text-primary-foreground px-3 py-2 rounded-lg disabled:opacity-50"
                  >
                    {downloadingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Download
                  </button>
                </>
              ) : (
                <div className="mt-3 flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground mb-0.5">Locked — awaiting approval</p>
                  <Checkpoint done={c.feeApproved} label="Fee / Admin approval" />
                  <Checkpoint done={c.ldmApproved} label="LDM approval" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
