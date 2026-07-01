import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import api from '@/lib/api';
import {
  User, MapPin, PhoneCall, GraduationCap, Briefcase,
  FileUp, CheckCircle, Loader2, Plus, Trash2, Upload, AlertTriangle,
  FileSignature, Clock,
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
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
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

  // Prefill from onboarding record + employee profile; resume from correct step
  useEffect(() => {
    if (!token) { navigate('/login'); return; }

    Promise.all([
      api.get('/api/onboarding/my'),
      api.get('/api/employees/me').catch(() => ({ data: { data: null } })),
    ]).then(([onbRes, empRes]) => {
      const data = onbRes.data.data;
      const emp  = empRes.data.data;

      setOnboardingStatus(data);

      if (!data) { setLoadingStatus(false); return; }
      if (data.status === 'COMPLETED') { navigate('/dashboard'); return; }

      // ── Pre-fill personal ──────────────────────────────────────────────────
      setPersonal(p => ({
        ...p,
        firstName:     emp?.firstName    || data.firstName || '',
        lastName:      emp?.lastName     || data.lastName  || '',
        middleName:    emp?.middleName   || '',
        dateOfBirth:   emp?.dateOfBirth  ? emp.dateOfBirth.substring(0, 10) : '',
        gender:        emp?.gender       || '',
        bloodGroup:    emp?.bloodGroup   || '',
        maritalStatus: emp?.maritalStatus || '',
        phone:         emp?.phone        || data.phone || '',
      }));

      // ── Pre-fill address ───────────────────────────────────────────────────
      if (emp?.address) {
        setAddress({
          currentAddress:   emp.address.current   || '',
          permanentAddress: emp.address.permanent || '',
          city:             emp.address.city       || '',
          state:            emp.address.state      || '',
          country:          emp.address.country    || 'India',
          pincode:          emp.address.pincode    || '',
        });
      }

      // ── Pre-fill emergency contact ─────────────────────────────────────────
      if (emp?.emergencyContacts?.[0]) {
        const ec = emp.emergencyContacts[0];
        setEmergency({
          emergencyName:         ec.name         || '',
          emergencyRelationship: ec.relationship || '',
          emergencyPhone:        ec.phone        || '',
          emergencyEmail:        ec.email        || '',
        });
      }

      // ── Pre-fill bank ──────────────────────────────────────────────────────
      if (emp?.bankDetails?.[0]) {
        const bk = emp.bankDetails[0];
        setBank({
          bankName:      bk.bankName      || '',
          accountNumber: bk.accountNumber || '',
          ifscCode:      bk.ifscCode      || '',
          accountType:   bk.accountType   || 'SAVINGS',
        });
      }

      // ── Pre-fill education ─────────────────────────────────────────────────
      if (emp?.education?.length) {
        setEducation(emp.education.map((e: any) => ({
          degree:       e.degree       || '',
          institution:  e.institution  || '',
          fieldOfStudy: e.fieldOfStudy || '',
          startYear:    e.startYear    ? String(e.startYear) : '',
          endYear:      e.endYear      ? String(e.endYear)   : '',
          grade:        e.grade        || '',
        })));
      }

      // ── Pre-fill experience ────────────────────────────────────────────────
      if (emp?.experience?.length) {
        setExperience(emp.experience.map((e: any) => ({
          company:     e.company     || '',
          designation: e.designation || '',
          startDate:   e.startDate   ? e.startDate.substring(0, 10) : '',
          endDate:     e.endDate     ? e.endDate.substring(0, 10)   : '',
          isCurrent:   e.isCurrent   || false,
          description: e.description || '',
        })));
      }

      // ── Mark already-uploaded docs ─────────────────────────────────────────
      if (data.uploadedDocTypes?.length) {
        setDocs(prev => prev.map(d => ({
          ...d,
          uploaded: data.uploadedDocTypes.includes(d.type),
        })));
      }

      // ── Resume from correct step ───────────────────────────────────────────
      // If profile was previously saved (steps 1-5 complete), jump to documents.
      // If all required docs are uploaded, jump straight to acknowledgements.
      if (data.profileCompletedAt) {
        const requiredTypes = ['AADHAAR', 'PAN', 'RESUME', 'MARKSHEET_10', 'MARKSHEET_12', 'DEGREE', 'OTHER'];
        const allDocsUploaded = requiredTypes.every((t: string) => data.uploadedDocTypes?.includes(t));
        setStep(allDocsUploaded ? 7 : 6);
      }
      // status === 'ACCOUNT_CREATED' with no profileCompletedAt → stay at step 1

    }).catch(() => setLoadingStatus(false)).finally(() => setLoadingStatus(false));
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
      await api.post('/api/documents/upload', form, { headers: { 'Content-Type': undefined } });
      setDocs(prev => prev.map(d => d.type === docType ? { ...d, uploaded: true, file } : d));
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Upload failed');
    } finally { setUploadingDoc(null); }
  };

  const submitForReview = async () => {
    setSaving(true);
    try {
      await api.post('/api/onboarding/my/submit', { ...ack });
      navigate('/dashboard?onboarding=submitted');
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

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
            {STEPS.map((s) => {
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
          <span>All required documents must be uploaded before you can submit.</span>
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

const COMPANY_POLICY_TEXT = `COMPREHENSIVE OFFICE POLICY for All Employees — Vinsup Skill Academy

Introduction
Welcome to Vinsup Skill Academy. Our office policies are designed to promote a respectful, productive, safe and growth-oriented environment. These guidelines ensure that our employees understand their rights, responsibilities, and the company's expectations.

Documentation Process
To ensure compliance with applicable laws and regulations, Vinsup Skill Academy shall maintain the original documents by the company. The employees are advised to provide the below mentioned documents:
• Updated Resume
• ID Proof (Aadhar / Passport / Driver's License)
• PAN Card
• Original copy of Educational Certificates (10th, 12th, Graduation)
• Previous Employment proof (Offer letters, Relieving Letters)
• Passport-size photographs (2 copies)

Anti-Harassment Policy
At Vinsup Skill Academy, we are committed to fostering a safe and respectful work environment free from all forms of harassment, including verbal, physical, and visual misconduct based on race, color, religion, sex, national origin, age, disability, sexual orientation, gender identity, or any other protected characteristic. Harassment, such as derogatory comments, unwanted physical contact, or offensive imagery, will not be tolerated. Employees who experience or witness harassment are encouraged to report incidents promptly to their manager, HR department, or any designated compliance officer. All reports will be handled confidentially and investigated thoroughly, with appropriate corrective actions taken if harassment is substantiated. Retaliation against individuals who report harassment or participate in investigations is strictly prohibited. This policy applies to all employees, contractors, consultants, interns, and any other individuals associated with Vinsup Skill Academy.

Office Etiquette
• Be Punctual: All employees must arrive on time for work and meetings to demonstrate respect for colleagues' time.
• Dress appropriately: Trainers must maintain a professional appearance and adhere to the organization's business formal dress code. Proper grooming and presentable attire are essential to maintain the company's brand image.
• Communicate respectfully: Engage in polite conversations, listen actively, and avoid gossiping about colleagues or supervisors.
• Maintain Cleanliness: Keep your workspace and shared areas tidy, and be mindful of noise levels to avoid disturbing others.
• Use Technology Considerately: Limit personal device usage during work hours and ensure that personal calls or messages do not disrupt the workplace.
• Health and Hygiene: Maintain good personal hygiene and be mindful of scents, especially in shared spaces, to ensure a comfortable environment for all.

Code of Conduct
• Show Respect and Integrity: Treat all individuals with courtesy, value diverse perspectives, and foster an inclusive environment.
• Be Accountable: Take responsibility for your actions, acknowledge mistakes, and work collaboratively towards solutions.
• Maintain Confidentiality: Protect sensitive information and refrain from disclosing it to unauthorized individuals.
• Follow Company Policies: Adhere to all organizational policies and procedures, including those related to safety, ethics, and legal requirements.
• Engage in Professional Development: Participate in learning opportunities to enhance skills and contribute effectively to the organization's goals.

Disciplinary Actions and Termination
• Purpose: Disciplinary actions aim to correct and improve employee performance or behaviour, fostering a positive work environment.
• Progressive Discipline: This approach involves a series of escalating steps to address issues, typically starting with a verbal warning, followed by written warnings, suspension, and, if necessary, termination.
• Immediate Termination: In cases of severe misconduct, such as theft, violence, or harassment, immediate termination may be warranted.

Compliance and Guidelines
• Freelancing or side engagements with external training institutes, coaching centers, or competing platforms are strictly prohibited during the period of association.
• Confidentiality: Trainers are not permitted to disclose their compensation details (salary, perks, commissions, etc.) to students, other trainers, or any external party. Unauthorized sharing of company data will lead to termination and possible legal action.
• Trainers are expected to actively support webinars and online events conducted to contribute to overall business growth, which may include delivering demo sessions, answering queries, and representing the training methodology or outcomes.
• Trainers must comply with the company's code of conduct, training delivery standards, and student engagement guidelines at all times.
• Company-provided devices and CRM systems must be used solely for official purposes. Misuse of company systems or data may result in termination.

Notice and Probation Period
• You will be on a probation period of 3 months from the date of joining. Based on satisfactory performance, you will be confirmed as a permanent employee. After confirmation, the notice period will be 60 days from either side.
• During the probation period, no leaves are entertained other than your weekly-off and company declared holidays.

Termination and Exit Policy
• The company reserves the right to terminate the employee with a 15-day notice or pay in lieu of notice, for reasons including violation of company policies, misconduct or breach of contract, or physical or mental fitness.
• Any behaviour that may affect the company's reputation, training quality, or student satisfaction will be reviewed seriously and may result in corrective action.
• Any unpaid dues or pending expenses will be settled during the full and final settlement.
• On termination or resignation, the employee must return all company assets, settle outstanding dues, and hand over client data and accounts appropriately.`;

function StepAcknowledgements({ ack, setAck, fullName }: any) {
  const set = (k: string) => (v: any) => setAck((a: any) => ({ ...a, [k]: v }));
  const [policyScrolledToEnd, setPolicyScrolledToEnd] = useState(false);
  const onPolicyScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) setPolicyScrolledToEnd(true);
  };
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2"><FileSignature className="w-5 h-5 text-blue-600" /> Acknowledgements & E-Signature</h2>
      <p className="text-sm text-gray-500">Please read and confirm each item below. These confirmations are required before HR can review your onboarding.</p>

      <div>
        <p className="text-sm font-medium mb-2">Company Policy Document — Vinsup Skill Academy</p>
        <div
          onScroll={onPolicyScroll}
          className="h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-xs leading-relaxed whitespace-pre-line bg-gray-50 dark:bg-gray-800"
        >
          {COMPANY_POLICY_TEXT}
        </div>
        {!policyScrolledToEnd && (
          <p className="text-xs text-amber-600 mt-1">Please scroll through the full policy above before agreeing.</p>
        )}
      </div>

      <label className={cn(
        'flex items-start gap-3 p-4 rounded-xl border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800',
        policyScrolledToEnd ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-50 pointer-events-none'
      )}>
        <input
          type="checkbox"
          className="mt-1 rounded"
          checked={ack.policyAgreed}
          disabled={!policyScrolledToEnd}
          onChange={e => set('policyAgreed')(e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-medium">I agree to the Company Policy.</span>{' '}
          I have read and accept Vinsup Skill Academy's Comprehensive Office Policy, including the documentation process, anti-harassment policy, office etiquette, code of conduct, disciplinary actions, compliance guidelines, probation/notice period, and termination & exit policy.
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
