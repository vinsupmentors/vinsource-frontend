import { useEffect, useState, FormEvent, ChangeEvent } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store';
import { fetchMe } from '@/store/slices/authSlice';
import api, { BASE_URL } from '@/lib/api';
import { Loader2, Save, CheckCircle2, Camera, Info } from 'lucide-react';

interface StudentMe {
  studentCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  track: string;
  status: string;
  photo?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  aadharNumber?: string;
  aadharPhoto?: string;
  fatherName?: string;
  fatherPhone?: string;
  motherName?: string;
  motherPhone?: string;
  user?: { email: string };
}

const inputCls = 'w-full px-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition';

export default function StudentProfile() {
  const dispatch = useDispatch<AppDispatch>();
  const [data, setData] = useState<StudentMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [aadharPhotoUploading, setAadharPhotoUploading] = useState(false);
  const [aadharPhotoError, setAadharPhotoError] = useState('');

  useEffect(() => {
    api.get('/api/student-portal/me').then((r) => setData(r.data.data)).finally(() => setLoading(false));
  }, []);

  const update = (field: keyof StudentMe, value: string) => setData((d) => (d ? { ...d, [field]: value } : d));

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError('');
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await api.post('/api/student-portal/photo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setData((d) => (d ? { ...d, photo: res.data.data.photo } : d));
      await dispatch(fetchMe());
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setPhotoError(e2.response?.data?.message || 'Failed to upload photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleAadharPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAadharPhotoError('');
    setAadharPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append('aadharPhoto', file);
      const res = await api.post('/api/student-portal/aadhar-photo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setData((d) => (d ? { ...d, aadharPhoto: res.data.data.aadharPhoto } : d));
      await dispatch(fetchMe());
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setAadharPhotoError(e2.response?.data?.message || 'Failed to upload Aadhar photo');
    } finally {
      setAadharPhotoUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/api/student-portal/me', {
        firstName: data.firstName, lastName: data.lastName, phone: data.phone,
        dateOfBirth: data.dateOfBirth, gender: data.gender, address: data.address,
        city: data.city, state: data.state, pincode: data.pincode,
        emergencyContactName: data.emergencyContactName, emergencyContactPhone: data.emergencyContactPhone,
        aadharNumber: data.aadharNumber, fatherName: data.fatherName, fatherPhone: data.fatherPhone,
        motherName: data.motherName, motherPhone: data.motherPhone,
      });
      await dispatch(fetchMe());
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{data.studentCode} &middot; {data.track} track &middot; {data.status}</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card rounded-xl border p-6 space-y-5">
        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Profile updated successfully.
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">Profile photo</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
              {data.photo ? (
                <img src={`${BASE_URL}${data.photo}`} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer hover:bg-muted transition">
                {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {photoUploading ? 'Uploading...' : data.photo ? 'Change photo' : 'Upload photo'}
                <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handlePhotoChange} />
              </label>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                This photo will be used on your certificate — please keep it a clear, professional photo.
              </p>
              {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="First name"><input className={inputCls} value={data.firstName} onChange={(e) => update('firstName', e.target.value)} required /></Field>
          <Field label="Last name"><input className={inputCls} value={data.lastName} onChange={(e) => update('lastName', e.target.value)} required /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Login email"><input className={inputCls} value={data.user?.email || data.email || ''} disabled /></Field>
          <Field label="Phone"><input className={inputCls} value={data.phone} onChange={(e) => update('phone', e.target.value)} required /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date of birth"><input type="date" className={inputCls} value={data.dateOfBirth?.slice(0, 10) || ''} onChange={(e) => update('dateOfBirth', e.target.value)} /></Field>
          <Field label="Gender">
            <select className={inputCls} value={data.gender || ''} onChange={(e) => update('gender', e.target.value)}>
              <option value="">Select…</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Address"><textarea className={inputCls} rows={2} value={data.address || ''} onChange={(e) => update('address', e.target.value)} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="City"><input className={inputCls} value={data.city || ''} onChange={(e) => update('city', e.target.value)} /></Field>
          <Field label="State"><input className={inputCls} value={data.state || ''} onChange={(e) => update('state', e.target.value)} /></Field>
          <Field label="Pincode"><input className={inputCls} value={data.pincode || ''} onChange={(e) => update('pincode', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Emergency contact name"><input className={inputCls} value={data.emergencyContactName || ''} onChange={(e) => update('emergencyContactName', e.target.value)} /></Field>
          <Field label="Emergency contact phone"><input className={inputCls} value={data.emergencyContactPhone || ''} onChange={(e) => update('emergencyContactPhone', e.target.value)} /></Field>
        </div>

        <Field label="Aadhar number">
          <input
            className={inputCls}
            value={data.aadharNumber || ''}
            onChange={(e) => update('aadharNumber', e.target.value.replace(/[^\d]/g, '').slice(0, 12))}
            inputMode="numeric"
            placeholder="12-digit Aadhar number"
          />
        </Field>

        <div>
          <label className="block text-sm font-medium mb-1.5">Aadhar card photo</label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
              {data.aadharPhoto ? (
                <img src={`${BASE_URL}${data.aadharPhoto}`} alt="Aadhar card" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer hover:bg-muted transition">
                {aadharPhotoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {aadharPhotoUploading ? 'Uploading...' : data.aadharPhoto ? 'Change photo' : 'Upload photo'}
                <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleAadharPhotoChange} />
              </label>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Upload a clear photo or scan of your Aadhar card (front side) for KYC verification.
              </p>
              {aadharPhotoError && <p className="text-xs text-red-600 mt-1">{aadharPhotoError}</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Father's name"><input className={inputCls} value={data.fatherName || ''} onChange={(e) => update('fatherName', e.target.value)} /></Field>
          <Field label="Father's contact number"><input className={inputCls} value={data.fatherPhone || ''} onChange={(e) => update('fatherPhone', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Mother's name"><input className={inputCls} value={data.motherName || ''} onChange={(e) => update('motherName', e.target.value)} /></Field>
          <Field label="Mother's contact number"><input className={inputCls} value={data.motherPhone || ''} onChange={(e) => update('motherPhone', e.target.value)} /></Field>
        </div>

        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save changes
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
