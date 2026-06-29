import { useState, FormEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { fetchMe } from '@/store/slices/authSlice';
import api, { BASE_URL } from '@/lib/api';
import { GraduationCap, Loader2, ShieldCheck, UserCircle, Plus, Trash2, CheckCircle2, Camera, Info } from 'lucide-react';

const inputCls = 'w-full px-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition';
const inputClsSm = 'w-full px-2 py-1.5 rounded-md border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition';
const btnCls = 'w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2';

interface EducationRow {
  degree: string;
  institution: string;
  fieldOfStudy: string;
  year: string;
  grade: string;
}

export default function CompleteProfile() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.auth.user);

  const passwordDone = !user?.mustChangePassword;
  const [step, setStep] = useState<1 | 2>(passwordDone ? 2 : 1);

  // Step 1 — password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Step 2 — MIS
  const s = user?.student;
  // Production Manager only enters studentCode + email now; name/phone arrive
  // as obvious placeholders ("Pending"/"Update"/"PENDING") that the student
  // corrects here on first login.
  const [firstName, setFirstName] = useState(s?.firstName && s.firstName !== 'Pending' ? s.firstName : '');
  const [lastName, setLastName] = useState(s?.lastName && s.lastName !== 'Update' ? s.lastName : '');
  const [phone, setPhone] = useState(s?.phone && s.phone !== 'PENDING' ? s.phone : '');
  const [dateOfBirth, setDateOfBirth] = useState(s?.dateOfBirth?.slice(0, 10) || '');
  const [gender, setGender] = useState(s?.gender || '');
  const [address, setAddress] = useState(s?.address || '');
  const [city, setCity] = useState(s?.city || '');
  const [state, setState] = useState(s?.state || '');
  const [pincode, setPincode] = useState(s?.pincode || '');
  const [emergencyContactName, setEmergencyContactName] = useState(s?.emergencyContactName || '');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(s?.emergencyContactPhone || '');
  const [education, setEducation] = useState<EducationRow[]>(
    (s?.education as EducationRow[] | undefined)?.length ? (s!.education as EducationRow[]) : [{ degree: '', institution: '', fieldOfStudy: '', year: '', grade: '' }]
  );
  const [aadharNumber, setAadharNumber] = useState(s?.aadharNumber || '');
  const [fatherName, setFatherName] = useState(s?.fatherName || '');
  const [fatherPhone, setFatherPhone] = useState(s?.fatherPhone || '');
  const [motherName, setMotherName] = useState(s?.motherName || '');
  const [motherPhone, setMotherPhone] = useState(s?.motherPhone || '');
  const [misError, setMisError] = useState('');
  const [misLoading, setMisLoading] = useState(false);

  // Profile photo — uploaded immediately on selection (separate endpoint from the JSON MIS save)
  const [photoUrl, setPhotoUrl] = useState(s?.photo || '');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');

  // Aadhar card photo/scan — a separate KYC document from the certificate photo above
  const [aadharPhotoUrl, setAadharPhotoUrl] = useState(s?.aadharPhoto || '');
  const [aadharPhotoUploading, setAadharPhotoUploading] = useState(false);
  const [aadharPhotoError, setAadharPhotoError] = useState('');

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
      setPhotoUrl(res.data.data.photo);
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
      setAadharPhotoUrl(res.data.data.aadharPhoto);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setAadharPhotoError(e2.response?.data?.message || 'Failed to upload Aadhar photo');
    } finally {
      setAadharPhotoUploading(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (newPassword.length < 6) return setPwError('New password must be at least 6 characters');
    if (newPassword !== confirmPassword) return setPwError('Passwords do not match');
    setPwLoading(true);
    try {
      await api.put('/api/auth/change-password', { currentPassword, newPassword });
      await dispatch(fetchMe());
      setStep(2);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setPwError(e2.response?.data?.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const updateEduRow = (i: number, field: keyof EducationRow, value: string) => {
    setEducation((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const handleMisSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMisError('');
    if (!firstName || !lastName || !phone) {
      return setMisError('Please fill in your first name, last name, and phone number');
    }
    if (!address || !city || !emergencyContactName || !emergencyContactPhone) {
      return setMisError('Please fill in address, city, and emergency contact details');
    }
    if (!photoUrl) {
      return setMisError('Please upload your photo — it will be printed on your certificate');
    }
    if (!aadharNumber || !/^\d{12}$/.test(aadharNumber.replace(/\s/g, ''))) {
      return setMisError('Please enter a valid 12-digit Aadhar number');
    }
    if (!aadharPhotoUrl) {
      return setMisError('Please upload a clear photo of your Aadhar card');
    }
    if (!fatherName || !fatherPhone) {
      return setMisError("Please fill in your father's name and contact number");
    }
    setMisLoading(true);
    try {
      await api.put('/api/student-portal/me', {
        firstName, lastName, phone,
        dateOfBirth: dateOfBirth || undefined,
        gender, address, city, state, pincode,
        emergencyContactName, emergencyContactPhone,
        education: education.filter((r) => r.degree || r.institution),
        aadharNumber, fatherName, fatherPhone, motherName, motherPhone,
      });
      await dispatch(fetchMe());
      navigate('/student/dashboard');
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setMisError(e2.response?.data?.message || 'Failed to save profile');
    } finally {
      setMisLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 bg-blue-600 rounded-2xl items-center justify-center shadow-lg mb-3">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold">Welcome to the Student Portal</h1>
          <p className="text-muted-foreground text-sm mt-1">Let's get your account set up — this only takes a minute.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <StepPill active={step === 1} done={passwordDone} icon={ShieldCheck} label="Change password" />
          <div className="w-10 h-px bg-border" />
          <StepPill active={step === 2} done={false} icon={UserCircle} label="Your details" />
        </div>

        <div className="bg-card rounded-2xl shadow-xl border p-6 sm:p-8">
          {step === 1 && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                For security, you must set a new password before continuing. Enter the password you just logged in with (your Student ID) as the current password.
              </p>
              {pwError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600">{pwError}</div>}
              <Field label="Current password (your Student ID)">
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className={inputCls} />
              </Field>
              <Field label="New password">
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className={inputCls} />
              </Field>
              <Field label="Confirm new password">
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className={inputCls} />
              </Field>
              <button type="submit" disabled={pwLoading} className={btnCls}>
                {pwLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Continue
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleMisSubmit} className="space-y-5">
              <p className="text-sm text-muted-foreground">Please complete your student record (MIS) — this is shared with the training and placement team.</p>
              {misError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600">{misError}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="First name">
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={inputCls} />
                </Field>
                <Field label="Last name">
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} required className={inputCls} />
                </Field>
              </div>
              <Field label="Phone">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} required className={inputCls} />
              </Field>

              <div>
                <label className="block text-sm font-medium mb-1.5">Profile photo</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                    {photoUrl ? (
                      <img src={`${BASE_URL}${photoUrl}`} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer hover:bg-muted transition">
                      {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      {photoUploading ? 'Uploading...' : photoUrl ? 'Change photo' : 'Upload photo'}
                      <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handlePhotoChange} />
                    </label>
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      This photo will be used on your certificate — please upload a clear, professional photo (passport-style, plain background).
                    </p>
                    {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Date of birth">
                  <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Gender">
                  <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls}>
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
              </div>

              <Field label="Address">
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} required rows={2} className={inputCls} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="City">
                  <input value={city} onChange={(e) => setCity(e.target.value)} required className={inputCls} />
                </Field>
                <Field label="State">
                  <input value={state} onChange={(e) => setState(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Pincode">
                  <input value={pincode} onChange={(e) => setPincode(e.target.value)} className={inputCls} />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Emergency contact name">
                  <input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} required className={inputCls} />
                </Field>
                <Field label="Emergency contact phone">
                  <input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} required className={inputCls} />
                </Field>
              </div>

              <Field label="Aadhar number">
                <input
                  value={aadharNumber}
                  onChange={(e) => setAadharNumber(e.target.value.replace(/[^\d]/g, '').slice(0, 12))}
                  required
                  inputMode="numeric"
                  placeholder="12-digit Aadhar number"
                  className={inputCls}
                />
              </Field>

              <div>
                <label className="block text-sm font-medium mb-1.5">Aadhar card photo</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                    {aadharPhotoUrl ? (
                      <img src={`${BASE_URL}${aadharPhotoUrl}`} alt="Aadhar card" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer hover:bg-muted transition">
                      {aadharPhotoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                      {aadharPhotoUploading ? 'Uploading...' : aadharPhotoUrl ? 'Change photo' : 'Upload photo'}
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
                <Field label="Father's name">
                  <input value={fatherName} onChange={(e) => setFatherName(e.target.value)} required className={inputCls} />
                </Field>
                <Field label="Father's contact number">
                  <input value={fatherPhone} onChange={(e) => setFatherPhone(e.target.value)} required className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Mother's name">
                  <input value={motherName} onChange={(e) => setMotherName(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Mother's contact number">
                  <input value={motherPhone} onChange={(e) => setMotherPhone(e.target.value)} className={inputCls} />
                </Field>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Education</label>
                  <button
                    type="button"
                    onClick={() => setEducation((rows) => [...rows, { degree: '', institution: '', fieldOfStudy: '', year: '', grade: '' }])}
                    className="text-xs flex items-center gap-1 text-blue-600 font-medium hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add another
                  </button>
                </div>
                <div className="space-y-3">
                  {education.map((row, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end bg-muted/30 rounded-lg p-3">
                      <input placeholder="Degree" value={row.degree} onChange={(e) => updateEduRow(i, 'degree', e.target.value)} className={inputClsSm} />
                      <input placeholder="Institution" value={row.institution} onChange={(e) => updateEduRow(i, 'institution', e.target.value)} className={inputClsSm} />
                      <input placeholder="Field of study" value={row.fieldOfStudy} onChange={(e) => updateEduRow(i, 'fieldOfStudy', e.target.value)} className={inputClsSm} />
                      <input placeholder="Year" value={row.year} onChange={(e) => updateEduRow(i, 'year', e.target.value)} className={inputClsSm} />
                      <div className="flex gap-1">
                        <input placeholder="Grade" value={row.grade} onChange={(e) => updateEduRow(i, 'grade', e.target.value)} className={inputClsSm} />
                        {education.length > 1 && (
                          <button type="button" onClick={() => setEducation((rows) => rows.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-red-600 shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={misLoading} className={btnCls}>
                {misLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Finish setup
              </button>
            </form>
          )}
        </div>
      </div>
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

function StepPill({ active, done, icon: Icon, label }: { active: boolean; done: boolean; icon: typeof ShieldCheck; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${active ? 'bg-blue-600 text-white' : done ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </div>
  );
}
