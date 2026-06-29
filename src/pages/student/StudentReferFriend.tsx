import { useEffect, useState, FormEvent } from 'react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { Loader2, Gift, UserPlus } from 'lucide-react';

interface Referral {
  id: string;
  name: string;
  phone: string;
  email?: string;
  courseInterest?: string;
  status: 'NEW' | 'CONTACTED' | 'ENROLLED' | 'NOT_INTERESTED';
  createdAt: string;
}

const statusStyles: Record<Referral['status'], string> = {
  NEW: 'bg-blue-50 text-blue-700',
  CONTACTED: 'bg-amber-50 text-amber-700',
  ENROLLED: 'bg-green-50 text-green-700',
  NOT_INTERESTED: 'bg-muted text-muted-foreground',
};

export default function StudentReferFriend() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [courseInterest, setCourseInterest] = useState('');
  const { toast } = useToast();

  const load = () => api.get('/api/student-portal/referrals').then((r) => setReferrals(r.data.data || []));

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/api/student-portal/referrals', { name, phone, email: email || undefined, courseInterest: courseInterest || undefined });
      setName(''); setPhone(''); setEmail(''); setCourseInterest('');
      await load();
      toast({ title: 'Referral submitted', description: 'Our team will reach out to your friend soon.', variant: 'success' });
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      toast({ title: 'Failed to submit referral', description: e2.response?.data?.message || 'Please try again.', variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Gift className="w-5 h-5 text-blue-600" /> Refer a Friend</h1>
        <p className="text-sm text-muted-foreground mt-1">Know someone who'd benefit from this course? Send us their details and we'll take it from there.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card rounded-xl border p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Friend's name *</label>
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Phone *</label>
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <input type="email" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Course interested in</label>
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={courseInterest} onChange={(e) => setCourseInterest(e.target.value)} placeholder="e.g. MERN Stack" />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          {submitting ? 'Submitting...' : 'Refer friend'}
        </button>
      </form>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 font-medium text-sm">Your referrals</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/20 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Phone</th>
              <th className="text-left px-4 py-2 font-medium">Course interest</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {referrals.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No referrals yet.</td></tr>
            )}
            {referrals.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{r.name}</td>
                <td className="px-4 py-3">{r.phone}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.courseInterest || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyles[r.status]}`}>{r.status.replace('_', ' ')}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
