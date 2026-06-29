import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Loader2, Briefcase, CalendarClock } from 'lucide-react';

interface PlacementResult {
  id: string;
  result: string;
  package?: number;
  drive: { role: string; partner: { name: string } };
}

interface PlacementInterview {
  id: string;
  companyName?: string;
  scheduledAt: string;
  outcome: string;
  notes?: string;
  drive?: { partner: { name: string } };
}

export default function StudentPlacements() {
  const [results, setResults] = useState<PlacementResult[]>([]);
  const [interviews, setInterviews] = useState<PlacementInterview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/student-portal/placements')
      .then((r) => { setResults(r.data.data?.results || []); setInterviews(r.data.data?.interviews || []); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">My Placements</h1>

      <div className="bg-card rounded-xl border p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4"><CalendarClock className="w-4 h-4 text-blue-600" /> Interviews</h2>
        {interviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No interviews scheduled yet.</p>
        ) : (
          <div className="space-y-3">
            {interviews.map((i) => (
              <div key={i.id} className="flex items-center justify-between border rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{i.companyName || i.drive?.partner.name || 'Company'}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(i.scheduledAt)}{i.notes ? ` — ${i.notes}` : ''}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">{i.outcome}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border p-5">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4"><Briefcase className="w-4 h-4 text-blue-600" /> Results</h2>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No placement results yet.</p>
        ) : (
          <div className="space-y-3">
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between border rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{r.drive.partner.name} — {r.drive.role}</p>
                  {r.package && <p className="text-xs text-muted-foreground">Package: ₹{r.package.toLocaleString()}</p>}
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-muted font-medium">{r.result}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
