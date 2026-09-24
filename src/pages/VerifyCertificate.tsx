import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { Loader2, BadgeCheck, XCircle } from 'lucide-react';

// Public, no-login certificate verification page — this is what the QR code
// printed on an issued certificate actually opens (see
// certificateRequests.controller.ts's buildRenderData, which builds the
// verifyUrl this route matches: /verify?cert=<certificateNo>). Mirrors
// PublicPortfolio.tsx's fetch/loading/not-found pattern, hitting the
// equally public GET /api/public/certificate instead.
//
// Query string rather than a :certNo path param because certificate numbers
// contain literal slashes (VSA/ICP/2026/0001) — see the route's own comment
// in public.routes.ts for why that doesn't work cleanly as a path segment.

interface VerifyData {
  type: 'COURSE_COMPLETION' | 'INTERNSHIP';
  certificateNo: string;
  studentName: string;
  studentCode: string;
  course: string | null;
  batch: string | null;
  issueDate: string | null;
}

const TYPE_LABEL: Record<VerifyData['type'], string> = {
  COURSE_COMPLETION: 'Course Completion Certificate',
  INTERNSHIP: 'Internship Completion Certificate',
};

export default function VerifyCertificate() {
  const [searchParams] = useSearchParams();
  const cert = searchParams.get('cert') || '';
  const [data, setData] = useState<VerifyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!cert) { setLoading(false); setNotFound(true); return; }
    api.get('/api/public/certificate', { params: { cert } })
      .then((r) => setData(r.data.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [cert]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-100"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4 bg-slate-100">
        <div className="max-w-sm">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold">Certificate not found</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This certificate number couldn't be verified. Double-check the code, or the certificate may not have been issued through Vinsup Skill Academy's portal.
          </p>
        </div>
      </div>
    );
  }

  const issueDate = data.issueDate
    ? new Date(data.issueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : '—';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-5 text-white flex items-center gap-3">
          <BadgeCheck className="w-8 h-8 shrink-0" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide opacity-90">Verified</p>
            <p className="text-xs opacity-80">Issued by Vinsup Skill Academy</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{TYPE_LABEL[data.type]}</p>
            <h1 className="text-xl font-bold mt-0.5">{data.studentName}</h1>
            <p className="text-sm text-muted-foreground">{data.studentCode}</p>
          </div>
          <div className="border-t pt-4 grid grid-cols-2 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Course</p>
              <p className="font-medium">{data.course || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Batch</p>
              <p className="font-medium">{data.batch || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Issued On</p>
              <p className="font-medium">{issueDate}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Certificate No.</p>
              <p className="font-medium">{data.certificateNo}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
