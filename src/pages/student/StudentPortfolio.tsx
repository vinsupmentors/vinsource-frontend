import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import api, { BASE_URL } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { Loader2, Plus, Trash2, CheckCircle2, Clock, XCircle, ExternalLink } from 'lucide-react';

interface Education { degree: string; institution: string; fieldOfStudy: string; year: string; grade: string }
interface Skill { name: string; level: string }
interface ProjectItem { title: string; description: string; link: string; techStack: string }
interface Experience { company: string; role: string; duration: string; description: string }

interface Portfolio {
  id: string;
  summary: string | null;
  education: Education[] | null;
  skills: Skill[] | null;
  projects: ProjectItem[] | null;
  experience: Experience[] | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  publicSlug: string | null;
  reviewNote: string | null;
  reviewedBy?: { firstName: string; lastName: string } | null;
}

const emptyEducation = (): Education => ({ degree: '', institution: '', fieldOfStudy: '', year: '', grade: '' });
const emptySkill = (): Skill => ({ name: '', level: '' });
const emptyProject = (): ProjectItem => ({ title: '', description: '', link: '', techStack: '' });
const emptyExperience = (): Experience => ({ company: '', role: '', duration: '', description: '' });

export default function StudentPortfolio() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [summary, setSummary] = useState('');
  const [education, setEducation] = useState<Education[]>([emptyEducation()]);
  const [skills, setSkills] = useState<Skill[]>([emptySkill()]);
  const [projects, setProjects] = useState<ProjectItem[]>([emptyProject()]);
  const [experience, setExperience] = useState<Experience[]>([emptyExperience()]);

  const load = () => {
    setLoading(true);
    api.get('/api/student-portal/portfolio')
      .then((r) => {
        const data: Portfolio | null = r.data.data;
        setPortfolio(data);
        if (data) {
          setSummary(data.summary || '');
          setEducation(data.education?.length ? data.education : [emptyEducation()]);
          setSkills(data.skills?.length ? data.skills : [emptySkill()]);
          setProjects(data.projects?.length ? data.projects : [emptyProject()]);
          setExperience(data.experience?.length ? data.experience : [emptyExperience()]);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submit = async () => {
    setSaving(true);
    try {
      const clean = <T extends Record<string, string>>(rows: T[]) =>
        rows.filter((r) => Object.values(r).some((v) => v.trim() !== ''));
      const res = await api.post('/api/student-portal/portfolio', {
        summary,
        education: clean(education),
        skills: clean(skills),
        projects: clean(projects),
        experience: clean(experience),
      });
      setPortfolio(res.data.data);
      toast({ title: 'Submitted', description: 'Thanks for filling in your portfolio. Please wait for the admin to review and approve it.' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to submit portfolio';
      toast({ title: 'Error', description: msg, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const publicUrl = portfolio?.publicSlug ? `${window.location.origin}/portfolio/${portfolio.publicSlug}` : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">My Portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Fill in your education, skills, projects, and experience. Once submitted, the Production Manager will review and approve it before it goes live with a public link and QR code.
        </p>
      </div>

      {portfolio && portfolio.status === 'PENDING' && (
        <div className="flex items-center gap-2 text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2">
          <Clock className="w-4 h-4 shrink-0" />
          Thanks for filling in your portfolio. Waiting for the admin to review and approve it.
        </div>
      )}
      {portfolio && portfolio.status === 'REJECTED' && (
        <div className="text-sm bg-red-50 text-red-800 border border-red-200 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 font-medium"><XCircle className="w-4 h-4 shrink-0" /> Your portfolio was sent back for changes.</div>
          {portfolio.reviewNote && <p className="mt-1 text-red-700">Note: {portfolio.reviewNote}</p>}
        </div>
      )}
      {portfolio && portfolio.status === 'APPROVED' && publicUrl && (
        <div className="bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-lg px-4 py-4 space-y-3">
          <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="w-4 h-4 shrink-0" /> Your portfolio is approved and live.</div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-white p-2 rounded border">
              <QRCodeSVG value={publicUrl} size={120} />
            </div>
            <div className="space-y-1">
              <a href={publicUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-700 underline flex items-center gap-1">
                {publicUrl} <ExternalLink className="w-3 h-3" />
              </a>
              <p className="text-xs text-emerald-700">Scan the QR code or open the link to view your public portfolio page.</p>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Summary</h2>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          placeholder="A short intro / career objective"
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </section>

      <RepeatingSection
        title="Education"
        rows={education}
        setRows={setEducation}
        makeEmpty={emptyEducation}
        fields={[
          { key: 'degree', label: 'Degree' },
          { key: 'institution', label: 'Institution' },
          { key: 'fieldOfStudy', label: 'Field of Study' },
          { key: 'year', label: 'Year' },
          { key: 'grade', label: 'Grade / %' },
        ]}
      />

      <RepeatingSection
        title="Skills"
        rows={skills}
        setRows={setSkills}
        makeEmpty={emptySkill}
        fields={[
          { key: 'name', label: 'Skill' },
          { key: 'level', label: 'Level (e.g. Beginner/Intermediate/Advanced)' },
        ]}
      />

      <RepeatingSection
        title="Projects"
        rows={projects}
        setRows={setProjects}
        makeEmpty={emptyProject}
        fields={[
          { key: 'title', label: 'Title' },
          { key: 'description', label: 'Description', textarea: true },
          { key: 'link', label: 'Link (GitHub/demo URL)' },
          { key: 'techStack', label: 'Tech Stack' },
        ]}
      />

      <RepeatingSection
        title="Experience"
        rows={experience}
        setRows={setExperience}
        makeEmpty={emptyExperience}
        fields={[
          { key: 'company', label: 'Company' },
          { key: 'role', label: 'Role' },
          { key: 'duration', label: 'Duration' },
          { key: 'description', label: 'Description', textarea: true },
        ]}
      />

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={saving}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60"
        >
          {saving ? 'Submitting...' : portfolio ? 'Resubmit for Review' : 'Submit Portfolio'}
        </button>
      </div>
    </div>
  );
}

function RepeatingSection<T extends Record<string, string>>({
  title, rows, setRows, makeEmpty, fields,
}: {
  title: string;
  rows: T[];
  setRows: (rows: T[]) => void;
  makeEmpty: () => T;
  fields: { key: keyof T; label: string; textarea?: boolean }[];
}) {
  const update = (idx: number, key: keyof T, value: string) => {
    const next = rows.slice();
    next[idx] = { ...next[idx], [key]: value };
    setRows(next);
  };
  const remove = (idx: number) => setRows(rows.length > 1 ? rows.filter((_, i) => i !== idx) : [makeEmpty()]);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button onClick={() => setRows([...rows, makeEmpty()])} className="text-xs text-blue-600 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add {title.toLowerCase()}
        </button>
      </div>
      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2 relative">
            <button onClick={() => remove(idx)} className="absolute top-2 right-2 text-muted-foreground hover:text-red-600">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-6">
              {fields.map((f) =>
                f.textarea ? (
                  <textarea
                    key={String(f.key)}
                    value={row[f.key] || ''}
                    onChange={(e) => update(idx, f.key, e.target.value)}
                    placeholder={f.label}
                    rows={2}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm sm:col-span-2"
                  />
                ) : (
                  <input
                    key={String(f.key)}
                    value={row[f.key] || ''}
                    onChange={(e) => update(idx, f.key, e.target.value)}
                    placeholder={f.label}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  />
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
