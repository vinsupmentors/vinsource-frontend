import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Loader2, Award } from 'lucide-react';

interface Certificate {
  id: string;
  certificateNo: string;
  issuedAt: string;
  course: { name: string };
}

export default function StudentCertificates() {
  const [rows, setRows] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/student-portal/certificates').then((r) => setRows(r.data.data || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">My Certificates</h1>

      {rows.length === 0 ? (
        <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground text-sm">
          No certificates issued yet. They'll appear here once your trainer marks you eligible and the certificate is generated.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((c) => (
            <div key={c.id} className="bg-card rounded-xl border p-5">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
                <Award className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-sm font-semibold">{c.course.name}</p>
              <p className="text-xs text-muted-foreground mt-1">Certificate No: {c.certificateNo}</p>
              <p className="text-xs text-muted-foreground">Issued {formatDate(c.issuedAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
