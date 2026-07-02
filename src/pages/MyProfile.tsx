import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { Loader2, Camera, Mail, Phone, Building2, BadgeCheck, CalendarDays, User, Landmark, ShieldAlert } from 'lucide-react';
import { getInitials } from '@/lib/utils';

interface MyProfileData {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  profilePhoto?: string | null;
  status: string;
  joiningDate: string;
  confirmationDate?: string | null;
  department?: { name: string } | null;
  designation?: { name: string } | null;
  branch?: { name: string } | null;
  manager?: { firstName: string; lastName: string } | null;
  address?: { current?: string | null; city?: string | null; state?: string | null; pincode?: string | null } | null;
  bankDetails?: { bankName: string; accountNumber: string; ifscCode: string }[];
  emergencyContacts?: { name: string; relationship: string; phone?: string | null }[];
  leaveBalances?: { totalDays: number; usedDays: number; leaveType?: { name: string } | null }[];
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  ON_PROBATION: 'bg-amber-100 text-amber-700',
  ON_LEAVE: 'bg-blue-100 text-blue-700',
};

function maskAccount(acc: string) {
  return acc.length > 4 ? '••••' + acc.slice(-4) : acc;
}

export default function MyProfilePage() {
  const [emp, setEmp] = useState<MyProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.get('/api/employees/me')
      .then((r) => setEmp(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      await api.post('/api/employees/me/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      load();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Photo upload failed');
    } finally { setUploading(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!emp) return <div className="text-center py-20 text-muted-foreground">Profile not found</div>;

  const fullName = `${emp.firstName} ${emp.lastName}`;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold flex items-center gap-2"><User className="w-6 h-6" /> My Profile</h1>

      {/* Header card */}
      <div className="bg-card border border-border rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
        <div className="relative group">
          {emp.profilePhoto ? (
            <img src={emp.profilePhoto} alt={fullName} className="w-28 h-28 rounded-full object-cover border-4 border-primary/20" />
          ) : (
            <div className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl font-bold border-4 border-primary/20">
              {getInitials(fullName)}
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Upload photo"
            className="absolute bottom-0 right-0 w-9 h-9 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow hover:opacity-90 transition disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} />
        </div>
        <div className="text-center sm:text-left flex-1">
          <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
            <h2 className="text-xl font-bold">{fullName}</h2>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[emp.status] || 'bg-gray-100 text-gray-600'}`}>
              {emp.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">{emp.designation?.name || '—'} · {emp.department?.name || '—'}</p>
          <p className="text-sm mt-2 flex items-center justify-center sm:justify-start gap-2">
            <BadgeCheck className="w-4 h-4 text-primary" /> <span className="font-mono font-semibold">{emp.employeeCode}</span>
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Contact */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</p>
          <p className="text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> {emp.email}</p>
          <p className="text-sm flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /> {emp.phone || '—'}</p>
          {emp.address && (emp.address.current || emp.address.city) && (
            <p className="text-sm text-muted-foreground">{[emp.address.current, emp.address.city, emp.address.state, emp.address.pincode].filter(Boolean).join(', ')}</p>
          )}
        </div>

        {/* Employment */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employment</p>
          <p className="text-sm flex items-center gap-2"><CalendarDays className="w-4 h-4 text-muted-foreground" /> Joined {new Date(emp.joiningDate).toLocaleDateString()}</p>
          {emp.confirmationDate && (
            <p className="text-sm flex items-center gap-2"><BadgeCheck className="w-4 h-4 text-muted-foreground" /> Confirmed {new Date(emp.confirmationDate).toLocaleDateString()}</p>
          )}
          <p className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /> {emp.branch?.name || '—'}</p>
          <p className="text-sm flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /> Reports to: {emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : '—'}</p>
        </div>

        {/* Leave balances */}
        {Boolean(emp.leaveBalances?.length) && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Leave Balance</p>
            <div className="flex flex-wrap gap-2">
              {emp.leaveBalances!.map((lb, i) => (
                <span key={i} className="px-3 py-1.5 bg-muted rounded-lg text-xs font-medium">
                  {lb.leaveType?.name || 'Leave'}: {Math.max(0, lb.totalDays - lb.usedDays)} / {lb.totalDays}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Bank */}
        {Boolean(emp.bankDetails?.length) && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bank</p>
            {emp.bankDetails!.map((b, i) => (
              <p key={i} className="text-sm flex items-center gap-2">
                <Landmark className="w-4 h-4 text-muted-foreground" /> {b.bankName} · {maskAccount(b.accountNumber)} · {b.ifscCode}
              </p>
            ))}
          </div>
        )}

        {/* Emergency contact */}
        {Boolean(emp.emergencyContacts?.length) && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Emergency Contact</p>
            {emp.emergencyContacts!.map((c, i) => (
              <p key={i} className="text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-muted-foreground" /> {c.name} ({c.relationship}) {c.phone ? `· ${c.phone}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Something incorrect? Contact HR to update your details.
      </p>
    </div>
  );
}
