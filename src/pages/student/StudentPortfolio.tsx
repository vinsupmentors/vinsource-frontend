import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import api, { BASE_URL } from '@/lib/api';
import { useToast } from '@/components/ui/toaster';
import { Loader2, Plus, Trash2, CheckCircle2, Clock, XCircle, ExternalLink, Star } from 'lucide-react';

interface Education { degree: string; institution: string; fieldOfStudy: string; year: string; grade: string }
// `stars` (1-5) is the current shape. `level` is legacy free-text ("Beginner"/
// "Intermediate"/...) from before the star rating existed — still read for
// students who submitted before this change, converted to stars on load.
interface Skill { name: string; stars?: number; level?: string }
interface ProjectItem { title: string; description: string; link: string; techStack: string }
interface Experience { company: string; role: string; duration: string; description: string }

interface Portfolio {
  id: string;
  summary: string | null;
  targetRole: string | null;
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
const emptySkill = (): Skill => ({ name: '', stars: 3 });
const emptyProject = (): ProjectItem => ({ title: '', description: '', link: '', techStack: '' });
const emptyExperience = (): Experience => ({ company: '', role: '', duration: '', description: '' });

// Legacy free-text level -> star rating, for portfolios submitted before the
// star rating existed.
const LEVEL_TO_STARS: Record<string, number> = {
  beginner: 2, basic: 2, intermediate: 3, advanced: 4, expert: 5, proficient: 4,
};
const normalizeSkill = (s: Skill): Skill =>
  s.stars ? s : { name: s.name, stars: LEVEL_TO_STARS[(s.level || '').toLowerCase()] ?? 3 };

// Aspiring-role options and the skills commonly expected for each, shown as
// quick-add suggestion chips once a role is picked. "Other" has no
// suggestions — the student just adds their own skills manually.
const ROLE_SKILLS: Record<string, string[]> = {
  'Data Analyst': [
    'SQL', 'Excel', 'Python', 'R', 'Power BI', 'Tableau', 'Statistics', 'Data Cleaning',
    'Data Visualization', 'Google Sheets', 'Data Wrangling', 'Pandas', 'NumPy', 'A/B Testing',
    'Business Intelligence', 'Data Modeling', 'ETL', 'Google Analytics', 'Dashboarding', 'Storytelling with Data',
  ],
  'Data Scientist': [
    'Python', 'Machine Learning', 'Deep Learning', 'Pandas', 'NumPy', 'SQL', 'Data Visualization',
    'Statistics', 'Scikit-learn', 'TensorFlow', 'PyTorch', 'Natural Language Processing', 'Feature Engineering',
    'Data Wrangling', 'R', 'Big Data', 'Hadoop', 'Spark', 'Model Deployment', 'A/B Testing',
  ],
  'Frontend Developer': [
    'HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Vue.js', 'Angular', 'Responsive Design',
    'Tailwind CSS', 'Bootstrap', 'Sass', 'Webpack', 'Git', 'REST APIs', 'DOM Manipulation', 'Redux',
    'Figma', 'Cross-Browser Testing', 'Web Accessibility', 'Performance Optimization',
  ],
  'Backend Developer': [
    'Node.js', 'Express.js', 'Python', 'Django', 'Flask', 'Java', 'Spring Boot', 'REST APIs',
    'GraphQL', 'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Authentication & Authorization',
    'Microservices', 'Docker', 'Git', 'API Design', 'System Design',
  ],
  'Full Stack Developer': [
    'HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Express.js', 'MongoDB', 'SQL', 'REST APIs',
    'Git', 'Docker', 'TypeScript', 'Redux', 'Authentication', 'System Design', 'AWS', 'CI/CD',
    'Testing (Jest)', 'Responsive Design', 'GraphQL',
  ],
  'MERN Stack Developer': [
    'MongoDB', 'Express.js', 'React', 'Node.js', 'JavaScript', 'Redux', 'REST APIs', 'JWT Authentication',
    'Mongoose', 'HTML', 'CSS', 'Tailwind CSS', 'Git', 'Postman', 'API Integration', 'Responsive Design',
    'Context API', 'Webpack', 'Deployment (Vercel/Heroku)', 'Debugging',
  ],
  'UI/UX Designer': [
    'Figma', 'Adobe XD', 'Photoshop', 'Illustrator', 'Wireframing', 'Prototyping', 'User Research',
    'Usability Testing', 'Canva', 'Sketch', 'Design Systems', 'Interaction Design', 'Typography',
    'Color Theory', 'Information Architecture', 'Persona Development', 'User Journey Mapping',
    'Responsive Design', 'Accessibility', 'InVision',
  ],
  'Digital Marketer': [
    'SEO', 'Social Media Marketing', 'Google Ads', 'Meta Ads', 'Content Marketing', 'Google Analytics',
    'Email Marketing', 'Copywriting', 'Content Creation', 'Canva', 'SEM', 'Affiliate Marketing',
    'Influencer Marketing', 'Marketing Automation', 'Lead Generation', 'Brand Strategy', 'Keyword Research',
    'WordPress', 'Video Marketing', 'Conversion Rate Optimization',
  ],
  'Cyber Security Analyst': [
    'Network Security', 'Ethical Hacking', 'Penetration Testing', 'Firewalls', 'SIEM', 'Vulnerability Assessment',
    'Cryptography', 'Malware Analysis', 'Incident Response', 'Kali Linux', 'Wireshark', 'Nmap', 'Metasploit',
    'Security Auditing', 'Risk Assessment', 'Identity & Access Management', 'OWASP', 'Cloud Security',
    'Compliance (ISO 27001/GDPR)', 'Threat Intelligence',
  ],
  'SAP Consultant': [
    'SAP ERP', 'SAP FICO', 'SAP MM', 'SAP SD', 'SAP HCM', 'SAP ABAP', 'SAP HANA', 'SAP Basis',
    'SAP PP', 'SAP WM', 'SAP Business Intelligence', 'SAP Fiori', 'SAP Analytics Cloud', 'SAP Configuration',
    'SAP Implementation', 'Business Process Analysis', 'SAP Reporting', 'SAP Integration', 'SAP Testing', 'SAP Support',
  ],
  'Network Engineer': [
    'TCP/IP', 'LAN/WAN', 'Routing & Switching', 'Cisco IOS', 'Network Security', 'Firewalls', 'VPN',
    'DNS', 'DHCP', 'Subnetting', 'Network Troubleshooting', 'CCNA Concepts', 'Wireless Networking',
    'Network Monitoring', 'Load Balancing', 'VLAN', 'Network Protocols', 'Cloud Networking', 'SD-WAN', 'Network Documentation',
  ],
  'Ethical Hacker': [
    'Penetration Testing', 'Kali Linux', 'Metasploit', 'Nmap', 'Wireshark', 'Burp Suite', 'SQL Injection',
    'Cross-Site Scripting (XSS)', 'Vulnerability Assessment', 'Network Security', 'Social Engineering',
    'Cryptography', 'Malware Analysis', 'OWASP Top 10', 'Reconnaissance', 'Exploitation Techniques',
    'Web Application Security', 'Wireless Security', 'Reporting & Documentation', 'Bug Bounty',
  ],
  'Other': [],
};
const ROLES = Object.keys(ROLE_SKILLS);

// Soft skills apply regardless of the role picked, so they're suggested
// unconditionally alongside the role-specific technical ones.
const SOFT_SKILLS: string[] = [
  'Communication', 'Teamwork', 'Time Management', 'Problem Solving', 'Adaptability', 'Leadership',
  'Critical Thinking', 'Creativity', 'Work Ethic', 'Attention to Detail', 'Collaboration', 'Decision Making',
  'Public Speaking', 'Negotiation', 'Stress Management', 'Active Listening', 'Interpersonal Skills',
  'Positive Attitude', 'Conflict Resolution', 'Emotional Intelligence',
];

export default function StudentPortfolio() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [summary, setSummary] = useState('');
  const [targetRole, setTargetRole] = useState('');
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
          setTargetRole(data.targetRole || '');
          setEducation(data.education?.length ? data.education : [emptyEducation()]);
          setSkills(data.skills?.length ? data.skills.map(normalizeSkill) : [emptySkill()]);
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
      const clean = <T extends object>(rows: T[]) =>
        rows.filter((r) => Object.values(r as Record<string, unknown>).some((v) => String(v ?? '').trim() !== ''));
      const res = await api.post('/api/student-portal/portfolio', {
        summary,
        targetRole: targetRole || null,
        education: clean(education),
        // Skills always carry a `stars` number (default 3), so the generic
        // "any field non-empty" filter would keep blank rows — filter on
        // name specifically instead.
        skills: skills.filter((s) => s.name.trim() !== '').map((s) => ({ name: s.name.trim(), stars: s.stars || 3 })),
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

      {/* Aspiring role + skills — the role picked here drives both the public
          page's "Aspiring <role>" badge and the quick-add skill suggestions
          below. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Aspiring Role</h2>
        <select
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
        >
          <option value="">Select a role…</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Skills</h2>
          <button onClick={() => setSkills([...skills, emptySkill()])} className="text-xs text-blue-600 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add skill
          </button>
        </div>

        {targetRole && ROLE_SKILLS[targetRole]?.length > 0 && (
          <SkillSuggestions
            label={`Suggested for ${targetRole} — click to add:`}
            options={ROLE_SKILLS[targetRole]}
            skills={skills}
            setSkills={setSkills}
          />
        )}

        <SkillSuggestions
          label="Soft skills — click to add:"
          options={SOFT_SKILLS}
          skills={skills}
          setSkills={setSkills}
        />

        <div className="space-y-2">
          {skills.map((s, idx) => (
            <div key={idx} className="border rounded-lg p-3 flex items-center gap-3">
              <input
                value={s.name}
                onChange={(e) => {
                  const next = skills.slice();
                  next[idx] = { ...next[idx], name: e.target.value };
                  setSkills(next);
                }}
                placeholder="Skill (e.g. Python)"
                className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
              />
              <StarPicker
                value={s.stars || 3}
                onChange={(stars) => {
                  const next = skills.slice();
                  next[idx] = { ...next[idx], stars };
                  setSkills(next);
                }}
              />
              <button
                onClick={() => setSkills(skills.length > 1 ? skills.filter((_, i) => i !== idx) : [emptySkill()])}
                className="text-muted-foreground hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <RepeatingSection
        title="Projects"
        rows={projects}
        setRows={setProjects}
        makeEmpty={emptyProject}
        fields={[
          { key: 'title', label: 'Title' },
          { key: 'description', label: 'Description', textarea: true },
          { key: 'link', label: 'Link (e.g. https://github.com/you/project)' },
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

function SkillSuggestions({ label, options, skills, setSkills }: {
  label: string; options: string[]; skills: Skill[]; setSkills: (s: Skill[]) => void;
}) {
  const remaining = options.filter((sk) => !skills.some((s) => s.name.toLowerCase() === sk.toLowerCase()));
  if (!remaining.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {remaining.map((sk) => (
          <button
            key={sk}
            onClick={() => {
              const next = skills.filter((s) => s.name.trim() !== '');
              next.push({ name: sk, stars: 3 });
              setSkills(next);
            }}
            className="text-xs px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
          >
            + {sk}
          </button>
        ))}
      </div>
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (stars: number) => void }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star className={`w-4 h-4 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
        </button>
      ))}
    </div>
  );
}

function RepeatingSection<T extends object>({
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
    next[idx] = { ...next[idx], [key]: value } as T;
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
                    value={(row[f.key as keyof T] as string) || ''}
                    onChange={(e) => update(idx, f.key, e.target.value)}
                    placeholder={f.label}
                    rows={2}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm sm:col-span-2"
                  />
                ) : (
                  <input
                    key={String(f.key)}
                    value={(row[f.key as keyof T] as string) || ''}
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
