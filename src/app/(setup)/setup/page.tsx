'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import api from '@/lib/api';
import {
  User, MapPin, PhoneCall, GraduationCap, Briefcase,
  FileUp, CheckCircle, Loader2, Plus, Trash2, Upload, X, AlertTriangle,
  FileSignature, ShieldCheck, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Education {
  degree: string; institution: string; fieldOfStudy: string;
  startYear: string; endYear: string; grade: string;
}
interface Experience {
  company: string; designation: string; startDate: string;
  endDate: string; isCurrent: boolean; description: string;
}
interface DocFile { type: string; label: string; required: boolean; file: File | null; uploaded: boolean; }

const REQUIRED_DOCS: DocFile[] = [
  { type: 'AADHAAR',      label: 'Aadhaar Card',          required: true,  file: null, uploaded: false },
  { type: 'PAN',          label: 'PAN Card',               required: true,  file: null, uploaded: false },
  { type: 'RESUME',       label: 'Resume / CV',            required: true,  file: null, uploaded: false },
  { type: 'MARKSHEET_10', label: '10th Marksheet',         required: true,  file: null, uploaded: false },
  { type: 'MARKSHEET_12', label: '12th Marksheet',         required: true,  file: null, uploaded: false },
  { type: 'DEGREE',       label: 'UG Degree Certificate',  required: true,  file: null, uploaded: false },
  { type: 'OTHER',        label: 'Bank Passbook / Cheque', required: true,  file: null, uploaded: false },
  { type: 'PASSPORT',     label: 'Passport',               required: false, file: null, uploaded: false },
  { type: 'DEGREE_PG',    label: 'PG Degree Certificate',  required: false, file: null, uploaded: false },
];

const STEPS = [
  { id: 1, label: 'Personal Info',   icon: User },
  { id: 2, label: 'Address',         icon: MapPin },
  { id: 3, label: 'Emergency & Bank',icon: PhoneCall },
  { id: 4, label: 'Education',       icon: GraduationCap },
  { id: 5, label: 'Experience',      icon: Briefcase },
  { id: 6, label: 'Documents',       icon: FileUp },
  { id: 7, label: 'Acknowledgements',icon: FileSignature },
  { id: 8, label: 'Review',          icon: CheckCircle },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SetupWizard() {
  const token = useSelector((s: RootState) => s.auth.token);
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<any>(null);

  // Form state per step
  const [personal, setPersonal] = useState({
    firstName: '', lastName: '', middleName: '', dateOfBirth: '',
    gender: '', bloodGroup: '', maritalStatus: '', phone: '', personalEmail: '',
  });
  const [address, setAddress] = useState({
    currentAddress: '', permanentAddress: '', city: '', state: '', country: 'India', pincode: '',
  });
  const [emergency, setEmergency] = useState({
    emergencyName: '', emergencyRelationship: '', emergencyPhone: '', emergencyEmail: '',
  });
  const [bank, setBank] = useState({
    bankName: '', accountNumber: '', ifscCode: '', accountType: 'SAVINGS',
  });
  const [education, setEducation] = useState<Education[]>([
    { degree: '10th', institution: '', fieldOfStudy: 'General', startYear: '', endYear: '', grade: '' },
    { degree: '12th', institution: '', fieldOfStudy: 'General', startYear: '', endYear: '', grade: '' },
    { degree: 'B.E. / B.Tech', institution: '', fieldOfStudy: '', startYear: '', endYear: '', grade: '' },
  ]);
  const [experience, setExperience] = useState<Experience[]>([]);
  const [docs, setDocs] = useState<DocFile[]>(REQUIRED_DOCS.map(d => ({ ...d })));
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [ack, setAck] = useState({
    policyAgreed: false, documentsSigned: false, originalDocsConfirmed: false, signatureName: '',
  });

  // Prefill from onboarding record
  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    api.get('/api/onboarding/my').then(r => {
      const data = r.data.data;
      setOnboardingStatus(data);
      if (!data) { router.push('/dashboard'); return; }
      if (data.status === 'COMPLETED') { router.push('/dashboard'); return; }
      // Pre-fill name from onboarding record
      setPersonal(p => ({
        ...p,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
      }));
      // Mark already-uploaded docs
      if (data.uploadedDocTypes?.length) {
        setDocs(prev => prev.map(d => ({
          ...d,
          uploaded: data.uploadedDocTypes.includes(d.type),
        })));
      }
    }).catch(() => router.push('/dashboard'));
  }, [token]);

  // ─── Navigation ─────────────────────────────────────────────────────────────

  const canProceed = () => {
    if (step === 1) return personal.firstName && personal.lastName && personal.phone && personal.dateOfBirth && personal.gender;
    if (step === 2) return address.currentAddress && address.city && address.state;
    if (step === 3) return emergency.emergencyName && emergency.emergencyPhone && bank.bankName && bank.accountNumber;
    if (step === 4) return education.some(e => e.institution);
    if (step === 6) {
      const required = docs.filter(d => d.required);
      return required.every(d => d.uploaded);
    }
    if (step === 7) {
      return ack.policyAgreed && ack.documentsSigned && ack.originalDocsConfirmed && ack.signatureName.trim().length > 1;
    }
    return true;
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.put('/api/onboarding/my/profile', {
        ...personal, ...address, ...emergency, ...bank,
        education: education.filter(e => e.institution),
        experience: experience.filter(e => e.company),
      });
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to save profile');
      throw e;
    } finally { setSaving(false); }
  };

  const next = async () => {
    if (step === 5) {
      // Save profile at the end of step 5
      try { await saveProfile(); } catch { return; }
    }
    setStep(s => Math.min(s + 1, 8));
    window.scrollTo(0, 0);
  };

  const prev = () => { setStep(s => Math.max(s - 1, 1)); window.scrollTo(0, 0); };

  // ─── Document upload ─────────────────────────────────────────────────────────

  const uploadDoc = async (docType: string, file: File) => {
    setUploadingDoc(docType);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', docType);
      form.append('name', file.name);
      await api.post('/api/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setDocs(prev => prev.map(d => d.type === docType ? { ...d, uploaded: true, file } : d));
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Upload failed');
    } finally { setUploadingDoc(null); }
  };

  const submitForReview = async () => {
    setSaving(true);
    try {
      await api.post('/api/onboarding/my/submit', { ...ack });
      router.push('/dashboard?onboarding=submitted');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Submission failed');
    } finally { setSaving(false); }
  };

  // ─── Step renderers ──────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      case 1: return <StepPersonal personal={personal} setPersonal={setPersonal} />;
      case 2: return <StepAddress address={address} setAddress={setAddress} />;
      case 3: return <StepEmergencyBank emergency={emergency} setEmergency={setEmergency} bank={bank} setBank={setBank} />;
      case 4: return <StepEducation education={education} setEducation={setEducation} />;
      case 5: return <StepExperience experience={experience} setExperience={setExperience} />;
      case 6: return <StepDocuments docs={docs} uploadDoc={uploadDoc} uploadingDoc={uploadingDoc} />;
      case 7: return <StepAcknowledgements ack={ack} setAck={setAck} fullName={`${personal.firstName} ${personal.lastName}`.trim()} />;
      case 8: return <StepReview personal={personal} address={address} emergency={emergency} bank={bank} education={education} experience={experience} docs={docs} ack={ack} onSubmit={submitForReview} saving={saving} />;
    }
  };

  if (onboardingStatus?.status === 'AWAITING_APPROVAL') {
    return <PendingApprovalScreen signatureName={onboardingStatus?.signatureName} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Top bar */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-bold text-sm">Complete Your Profile</p>
          <p className="text-xs text-gray-500">Step {step} of {STEPS.length}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = step > s.id;
              const active = step === s.id;
              return (
                <div key={s.id} className="flex flex-col items-center gap-1 flex-1">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                    done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                  )}>
                    {done ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={cn('text-[10px] text-center leading-tight hidden sm:block',
                    active ? 'text-blue-600 font-semibold' : done ? 'text-green-600' : 'text-gray-400'
                  )}>{s.label}</span>
                  {i < STEPS.length - 1 && (
                    <div className={cn('absolute hidden')} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
            <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }} />
          </div>
        </div>

        {/* Step content */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 mb-6">
          {renderStep()}
        </div>

        {/* Navigation */}
        {step < 8 && (
          <div className="flex gap-3">
            {step > 1 && (
              <button onClick={prev} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                Back
              </button>
            )}
            <button
              onClick={next}
              disabled={!canProceed() || saving}
              className="flex-[2] px-4 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {step === 5 ? 'Save & Continue' : step === 7 ? 'Review & Submit' : 'Continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step Components ──────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500';
const selectCls = inputCls;

function StepPersonal({ personal, setPersonal }: any) {
  const set = (k: string) => (e: any) => setPersonal((p: any) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2"><User className="w-5 h-5 text-blue-600" /> Personal Information</h2>
      <div className="grid grid-cols-2 gap-4">
        <Field label="First Name" required><input className={inputCls} value={personal.firstName} onChange={set('firstName')} /></Field>
        <Field label="Last Name" required><input className={inputCls} value={personal.lastName} onChange={set('lastName')} /></Field>
      </div>
      <Field label="Middle Name"><input className={inputCls} value={personal.middleName} onChange={set('middleName')} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date of Birth" required><input type="date" className={inputCls} value={personal.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
        <Field label="Gender" required>
          <select className={selectCls} value={personal.gender} onChange={set('gender')}>
            <option value="">Select...</option>
            <option>MALE</option><option>FEMALE</option><option>OTHER</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Blood Group">
          <select className={selectCls} value={personal.bloodGroup} onChange={set('bloodGroup')}>
            <option value="">Select...</option>
            {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Marital Status">
          <select className={selectCls} value={personal.maritalStatus} onChange={set('maritalStatus')}>
            <option value="">Select...</option>
            <option>SINGLE</option><option>MARRIED</option><option>DIVORCED</option><option>WIDOWED</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Mobile Number" required><input className={inputCls} value={personal.phone} onChange={set('phone')} placeholder="+91 9XXXXXXXXX" /></Field>
        <Field label="Personal Email"><input type="email" className={inputCls} value={personal.personalEmail} onChange={set('personalEmail')} /></Field>
      </div>
    </div>
  );
}

function StepAddress({ address, setAddress }: any) {
  const set = (k: string) => (e: any) => setAddress((a: any) => ({ ...a, [k]: e.target.value }));
  const copyToPermanent = () => setAddress((a: any) => ({ ...a, permanentAddress: a.currentAddress }));
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2"><MapPin className="w-5 h-5 text-blue-600" /> Address Details</h2>
      <Field label="Current Address" required>
        <textarea className={inputCls} rows={3} value={address.currentAddress} onChange={set('currentAddress')} placeholder="Flat, Building, Street, Area..." />
      </Field>
      <div className="flex items-center gap-2">
        <Field label="Permanent Address">
          <textarea className={inputCls} rows={3} value={address.permanentAddress} onChange={set('permanentAddress')} />
        </Field>
      </div>
      <button type="button" onClick={copyToPermanent} className="text-xs text-blue-600 hover:underline">
        Same as current address
      </button>
      <div className="grid grid-cols-2 gap-4">
        <Field label="City" required><input className={inputCls} value={address.city} onChange={set('city')} /></Field>
        <Field label="State" required><input className={inputCls} value={address.state} onChange={set('state')} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Country"><input className={inputCls} value={address.country} onChange={set('country')} /></Field>
        <Field label="PIN Code"><input className={inputCls} value={address.pincode} onChange={set('pincode')} maxLength={6} /></Field>
      </div>
    </div>
  );
}

function StepEmergencyBank({ emergency, setEmergency, bank, setBank }: any) {
  const setE = (k: string) => (e: any) => setEmergency((p: any) => ({ ...p, [k]: e.target.value }));
  const setB = (k: string) => (e: any) => setBank((p: any) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><PhoneCall className="w-5 h-5 text-blue-600" /> Emergency Contact</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact Name" required><input className={inputCls} value={emergency.emergencyName} onChange={setE('emergencyName')} /></Field>
          <Field label="Relationship" required>
            <select className={selectCls} value={emergency.emergencyRelationship} onChange={setE('emergencyRelationship')}>
              <option value="">Select...</option>
              {['Spouse','Parent','Sibling','Child','Friend','Other'].map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field label="Phone" required><input className={inputCls} value={emergency.emergencyPhone} onChange={setE('emergencyPhone')} /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={emergency.emergencyEmail} onChange={setE('emergencyEmail')} /></Field>
        </div>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h2 className="text-lg font-bold mb-4">Bank Account Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bank Name" required><input className={inputCls} value={bank.bankName} onChange={setB('bankName')} placeholder="State Bank of India" /></Field>
          <Field label="Account Type">
            <select className={selectCls} value={bank.accountType} onChange={setB('accountType')}>
              <option>SAVINGS</option><option>CURRENT</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field label="Account Number" required><input className={inputCls} value={bank.accountNumber} onChange={setB('accountNumber')} /></Field>
          <Field label="IFSC Code" required><input className={inputCls} value={bank.ifscCode} onChange={setB('ifscCode')} placeholder="SBIN0001234" /></Field>
        </div>
      </div>
    </div>
  );
}

function StepEducation({ education, setEducation }: any) {
  const update = (i: number, k: string, v: string) =>
    setEducation((prev: Education[]) => prev.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const add = () => setEducation((p: Education[]) => [...p, { degree: '', institution: '', fieldOfStudy: '', startYear: '', endYear: '', grade: '' }]);
  const remove = (i: number) => setEducation((p: Education[]) => p.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2"><GraduationCap className="w-5 h-5 text-blue-600" /> Educational Qualifications</h2>
      {education.map((edu: Education, i: number) => (
        <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{edu.degree || `Qualification ${i + 1}`}</p>
            {i > 2 && <button onClick={() => remove(i)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Degree / Class">
              <input className={inputCls} value={edu.degree} onChange={e => update(i, 'degree', e.target.value)} placeholder="e.g. B.E., 10th, MBA" />
            </Field>
            <Field label="Field / Stream">
              <input className={inputCls} value={edu.fieldOfStudy} onChange={e => update(i, 'fieldOfStudy', e.target.value)} placeholder="Computer Science, Science..." />
            </Field>
          </div>
          <Field label="Institution / School / College">
            <input className={inputCls} value={edu.institution} onChange={e => update(i, 'institution', e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="From Year"><input className={inputCls} value={edu.startYear} onChange={e => update(i, 'startYear', e.target.value)} placeholder="2018" maxLength={4} /></Field>
            <Field label="To Year"><input className={inputCls} value={edu.endYear} onChange={e => update(i, 'endYear', e.target.value)} placeholder="2022" maxLength={4} /></Field>
            <Field label="% / CGPA"><input className={inputCls} value={edu.grade} onChange={e => update(i, 'grade', e.target.value)} placeholder="8.5 / 85%" /></Field>
          </div>
        </div>
      ))}
      <button onClick={add} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 text-sm hover:bg-blue-50 transition">
        <Plus className="w-4 h-4" /> Add Qualification
      </button>
    </div>
  );
}

function StepExperience({ experience, setExperience }: any) {
  const update = (i: number, k: string, v: any) =>
    setExperience((prev: Experience[]) => prev.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const add = () => setExperience((p: Experience[]) => [...p, { company: '', designation: '', startDate: '', endDate: '', isCurrent: false, description: '' }]);
  const remove = (i: number) => setExperience((p: Experience[]) => p.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2"><Briefcase className="w-5 h-5 text-blue-600" /> Work Experience</h2>
      <p className="text-sm text-gray-500">Skip if you are a fresher</p>
      {experience.map((exp: Experience, i: number) => (
        <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{exp.company || `Experience ${i + 1}`}</p>
            <button onClick={() => remove(i)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company Name"><input className={inputCls} value={exp.company} onChange={e => update(i, 'company', e.target.value)} /></Field>
            <Field label="Designation"><input className={inputCls} value={exp.designation} onChange={e => update(i, 'designation', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><input type="date" className={inputCls} value={exp.startDate} onChange={e => update(i, 'startDate', e.target.value)} /></Field>
            <Field label="To">
              <input type="date" className={inputCls} value={exp.endDate} onChange={e => update(i, 'endDate', e.target.value)} disabled={exp.isCurrent} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={exp.isCurrent} onChange={e => update(i, 'isCurrent', e.target.checked)} className="rounded" />
            Currently working here
          </label>
          <Field label="Description"><textarea className={inputCls} rows={2} value={exp.description} onChange={e => update(i, 'description', e.target.value)} /></Field>
        </div>
      ))}
      <button onClick={add} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 text-sm hover:bg-blue-50 transition">
        <Plus className="w-4 h-4" /> Add Experience
      </button>
    </div>
  );
}

function StepDocuments({ docs, uploadDoc, uploadingDoc }: { docs: DocFile[]; uploadDoc: (type: string, file: File) => Promise<void>; uploadingDoc: string | null }) {
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const requiredDone = docs.filter(d => d.required).every(d => d.uploaded);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2"><FileUp className="w-5 h-5 text-blue-600" /> Document Upload</h2>
      <p className="text-sm text-gray-500">Upload scanned copies or clear photos. Accepted formats: PDF, JPG, PNG (max 10 MB each).</p>
      {!requiredDone && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>All required documents must be uploaded before you can submit. You have 7 days from profile completion.</span>
        </div>
      )}
      <div className="space-y-3">
        {docs.map((doc) => (
          <div key={doc.type} className={cn(
            'flex items-center justify-between p-4 rounded-xl border',
            doc.uploaded ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700'
          )}>
            <div className="flex items-center gap-3">
              {doc.uploaded
                ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                : <Upload className="w-5 h-5 text-gray-400 flex-shrink-0" />
              }
              <div>
                <p className="font-medium text-sm">{doc.label}
                  {doc.required && <span className="text-red-500 ml-1">*</span>}
                  {!doc.required && <span className="text-gray-400 text-xs ml-2">(Optional)</span>}
                </p>
                {doc.uploaded && doc.file && <p className="text-xs text-green-600">{doc.file.name}</p>}
                {doc.uploaded && !doc.file && <p className="text-xs text-green-600">Already uploaded</p>}
              </div>
            </div>
            <div>
              <input
                type="file"
                ref={el => { fileRefs.current[doc.type] = el; }}
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(doc.type, f); }}
              />
              {uploadingDoc === doc.type
                ? <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                : (
                  <button
                    onClick={() => fileRefs.current[doc.type]?.click()}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-lg font-medium transition',
                      doc.uploaded ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700'
                    )}
                  >
                    {doc.uploaded ? 'Re-upload' : 'Upload'}
                  </button>
                )
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepAcknowledgements({ ack, setAck, fullName }: any) {
  const set = (k: string) => (v: any) => setAck((a: any) => ({ ...a, [k]: v }));
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2"><FileSignature className="w-5 h-5 text-blue-600" /> Acknowledgements & E-Signature</h2>
      <p className="text-sm text-gray-500">Please read and confirm each item below. These confirmations are required before HR can review your onboarding.</p>

      <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
        <input type="checkbox" className="mt-1 rounded" checked={ack.policyAgreed} onChange={e => set('policyAgreed')(e.target.checked)} />
        <span className="text-sm">
          <span className="font-medium">I agree to the Company Policy.</span>{' '}
          I have read and accept the company's code of conduct, leave policy, IT/data-security policy, and all other organizational policies applicable to my employment.
        </span>
      </label>

      <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
        <input type="checkbox" className="mt-1 rounded" checked={ack.documentsSigned} onChange={e => set('documentsSigned')(e.target.checked)} />
        <span className="text-sm">
          <span className="font-medium">I have signed the onboarding documents.</span>{' '}
          I confirm that I have reviewed and digitally signed my offer letter, NDA, and other onboarding documents shared with me.
        </span>
      </label>

      <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
        <input type="checkbox" className="mt-1 rounded" checked={ack.originalDocsConfirmed} onChange={e => set('originalDocsConfirmed')(e.target.checked)} />
        <span className="text-sm">
          <span className="font-medium">I will produce/have produced my original documents to HR.</span>{' '}
          I understand that, in addition to the scanned copies uploaded above, I must present my original Aadhaar, PAN, marksheets, and degree certificates to HR for physical verification before my onboarding can be finalized.
        </span>
      </label>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
        <Field label="Type your full name as your e-signature" required>
          <input
            className={inputCls}
            value={ack.signatureName}
            onChange={e => set('signatureName')(e.target.value)}
            placeholder={fullName || 'Full Name'}
          />
        </Field>
        <p className="text-xs text-gray-500 mt-1">By typing your name above, you are electronically signing all onboarding acknowledgements on this page.</p>
      </div>
    </div>
  );
}

function PendingApprovalScreen({ signatureName }: { signatureName?: string }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8 text-center space-y-4">
        <div className="w-14 h-14 mx-auto bg-amber-100 rounded-full flex items-center justify-center">
          <Clock className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="text-lg font-bold">Awaiting HR Approval</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Thanks{signatureName ? `, ${signatureName}` : ''}! Your profile, documents, and onboarding acknowledgements have been submitted.
          HR will verify your original documents and give final approval before your dashboard is unlocked.
        </p>
        <p className="text-xs text-gray-500">You'll receive an email once you're approved. You can close this page and check back later.</p>
      </div>
    </div>
  );
}

function StepReview({ personal, address, emergency, bank, education, experience, docs, ack, onSubmit, saving }: any) {
  const requiredDone = docs.filter((d: DocFile) => d.required).every((d: DocFile) => d.uploaded);
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2"><CheckCircle className="w-5 h-5 text-blue-600" /> Review & Submit</h2>
      <p className="text-sm text-gray-500">Please review your information before submitting to HR.</p>

      {/* Summary cards */}
      <ReviewCard title="Personal Information">
        <p><strong>Name:</strong> {personal.firstName} {personal.middleName} {personal.lastName}</p>
        <p><strong>DOB:</strong> {personal.dateOfBirth} · <strong>Gender:</strong> {personal.gender}</p>
        <p><strong>Phone:</strong> {personal.phone} · <strong>Blood Group:</strong> {personal.bloodGroup || '—'}</p>
      </ReviewCard>

      <ReviewCard title="Address">
        <p><strong>Current:</strong> {address.currentAddress}, {address.city}, {address.state} - {address.pincode}</p>
      </ReviewCard>

      <ReviewCard title="Emergency Contact">
        <p>{emergency.emergencyName} ({emergency.emergencyRelationship}) — {emergency.emergencyPhone}</p>
      </ReviewCard>

      <ReviewCard title="Bank Details">
        <p>{bank.bankName} · {bank.accountType} · A/C: {bank.accountNumber} · IFSC: {bank.ifscCode}</p>
      </ReviewCard>

      <ReviewCard title="Education">
        {education.filter((e: Education) => e.institution).map((e: Education, i: number) => (
          <p key={i}>{e.degree} — {e.institution} ({e.endYear || '—'})</p>
        ))}
      </ReviewCard>

      {experience.length > 0 && (
        <ReviewCard title="Work Experience">
          {experience.filter((e: Experience) => e.company).map((e: Experience, i: number) => (
            <p key={i}>{e.designation} at {e.company}</p>
          ))}
        </ReviewCard>
      )}

      <ReviewCard title="Documents">
        <div className="grid grid-cols-2 gap-1">
          {docs.map((d: DocFile) => (
            <p key={d.type} className={cn('flex items-center gap-1 text-sm', d.uploaded ? 'text-green-600' : d.required ? 'text-red-600' : 'text-gray-400')}>
              {d.uploaded ? '✓' : d.required ? '✗' : '—'} {d.label}
            </p>
          ))}
        </div>
      </ReviewCard>

      <ReviewCard title="Acknowledgements">
        <p className={ack?.policyAgreed ? 'text-green-600' : 'text-red-600'}>{ack?.policyAgreed ? '✓' : '✗'} Company policy agreed</p>
        <p className={ack?.documentsSigned ? 'text-green-600' : 'text-red-600'}>{ack?.documentsSigned ? '✓' : '✗'} Onboarding documents signed</p>
        <p className={ack?.originalDocsConfirmed ? 'text-green-600' : 'text-red-600'}>{ack?.originalDocsConfirmed ? '✓' : '✗'} Original documents confirmation</p>
        <p><strong>E-Signature:</strong> {ack?.signatureName || '—'}</p>
      </ReviewCard>

      {!requiredDone && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          Some required documents are missing. Go back and upload them before submitting.
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!requiredDone || saving}
        className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Submit for HR Review
      </button>
    </div>
  );
}

function ReviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <p className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">{title}</p>
      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-0.5">{children}</div>
    </div>
  );
}
