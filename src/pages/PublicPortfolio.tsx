import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { BASE_URL } from '@/lib/api';
import {
  Loader2, GraduationCap, Briefcase, FolderGit2, ExternalLink,
  Mail, Phone, BadgeCheck, Sparkles, Code2,
} from 'lucide-react';

interface Education { degree: string; institution: string; fieldOfStudy: string; year: string; grade: string }
interface Skill { name: string; level: string }
interface ProjectItem { title: string; description: string; link: string; techStack: string }
interface Experience { company: string; role: string; duration: string; description: string }

export interface PublicPortfolioData {
  summary: string | null;
  education: Education[] | null;
  skills: Skill[] | null;
  projects: ProjectItem[] | null;
  experience: Experience[] | null;
  student: { firstName: string; lastName: string; studentCode: string; track: string; photo: string | null; email: string | null; phone: string | null };
}

const photoUrl = (path: string) => (/^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`);

const LEVEL_PCT: Record<string, number> = {
  beginner: 35, basic: 35, intermediate: 60, advanced: 85, expert: 100, proficient: 85,
};

const TRACK_LABEL: Record<string, string> = {
  JRP: 'Job Ready Program', IOP: 'Industry Oriented Program', PAP: 'Placement Assurance Program',
};

/** The polished portfolio rendering — used by the public QR/link page. */
export function PortfolioView({ data }: { data: PublicPortfolioData }) {
  const { student } = data;
  const fullName = `${student.firstName} ${student.lastName}`;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 text-white">
        {/* decorative glow */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-6 pt-14 pb-24 text-center">
          {student.photo ? (
            <img
              src={photoUrl(student.photo)}
              alt={fullName}
              className="w-32 h-32 rounded-full object-cover mx-auto ring-4 ring-white/20 shadow-2xl"
            />
          ) : (
            <div className="w-32 h-32 rounded-full mx-auto ring-4 ring-white/20 shadow-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-4xl font-bold">
              {student.firstName[0]}{student.lastName[0]}
            </div>
          )}

          <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight">{fullName}</h1>

          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/10 border border-white/20 rounded-full px-3.5 py-1.5 backdrop-blur">
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" /> {TRACK_LABEL[student.track] || student.track}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/10 border border-white/20 rounded-full px-3.5 py-1.5 backdrop-blur">
              <BadgeCheck className="w-3.5 h-3.5 text-emerald-300" /> Vinsup Skill Academy · {student.studentCode}
            </span>
          </div>

          {(student.email || student.phone) && (
            <div className="mt-5 flex items-center justify-center gap-5 flex-wrap text-sm text-blue-100/90">
              {student.email && (
                <a href={`mailto:${student.email}`} className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                  <Mail className="w-4 h-4" /> {student.email}
                </a>
              )}
              {student.phone && (
                <a href={`tel:${student.phone}`} className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
                  <Phone className="w-4 h-4" /> {student.phone}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Body (overlapping the hero) ── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-12 pb-16 space-y-6">
        {/* About */}
        {data.summary && (
          <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/60 border border-slate-100 p-6 sm:p-8">
            <p className="text-[15px] leading-7 text-slate-700 text-center italic">"{data.summary}"</p>
          </div>
        )}

        <div className="grid md:grid-cols-[280px_1fr] gap-6 items-start">
          {/* ── Left rail: skills + education ── */}
          <div className="space-y-6">
            {!!data.skills?.length && (
              <Card title="Skills" icon={Code2}>
                <div className="space-y-3.5">
                  {data.skills.map((s, i) => {
                    const pct = LEVEL_PCT[(s.level || '').toLowerCase()] ?? 70;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[13px] font-medium text-slate-700">{s.name}</span>
                          {s.level && <span className="text-[11px] text-slate-400 capitalize">{s.level}</span>}
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {!!data.education?.length && (
              <Card title="Education" icon={GraduationCap}>
                <div className="space-y-4">
                  {data.education.map((ed, i) => (
                    <div key={i} className="relative pl-4 border-l-2 border-blue-100">
                      <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-blue-500" />
                      <p className="text-[13px] font-semibold text-slate-800">{ed.degree}{ed.fieldOfStudy ? ` · ${ed.fieldOfStudy}` : ''}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{ed.institution}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{[ed.year, ed.grade].filter(Boolean).join(' · ')}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* ── Main column: projects + experience ── */}
          <div className="space-y-6">
            {!!data.projects?.length && (
              <Card title="Projects" icon={FolderGit2}>
                <div className="space-y-4">
                  {data.projects.map((p, i) => (
                    <div key={i} className="group rounded-xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-[15px] font-semibold text-slate-800">{p.title}</h3>
                        {p.link && (
                          <a
                            href={p.link} target="_blank" rel="noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full px-3 py-1 transition-colors"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {p.description && <p className="text-[13px] leading-6 text-slate-600 mt-1.5">{p.description}</p>}
                      {p.techStack && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {p.techStack.split(/[,|]/).map((t, j) => t.trim() && (
                            <span key={j} className="text-[11px] font-medium bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">{t.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {!!data.experience?.length && (
              <Card title="Experience" icon={Briefcase}>
                <div className="space-y-5">
                  {data.experience.map((e, i) => (
                    <div key={i} className="relative pl-5 border-l-2 border-blue-100">
                      <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-white border-2 border-blue-500" />
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <h3 className="text-[15px] font-semibold text-slate-800">{e.role}</h3>
                        {e.duration && <span className="text-[11px] font-medium text-slate-400 bg-slate-50 rounded px-2 py-0.5">{e.duration}</span>}
                      </div>
                      {e.company && <p className="text-[13px] text-blue-600 font-medium mt-0.5">{e.company}</p>}
                      {e.description && <p className="text-[13px] leading-6 text-slate-600 mt-1.5">{e.description}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="text-center pt-6">
          <p className="inline-flex items-center gap-2 text-xs text-slate-400">
            <BadgeCheck className="w-4 h-4 text-emerald-500" />
            Verified portfolio · Built &amp; hosted by <span className="font-semibold text-slate-500">Vinsup Skill Academy</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Briefcase; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-lg shadow-slate-200/60 border border-slate-100 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 mb-4">
        <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><Icon className="w-4 h-4 text-blue-600" /></span>
        <span className="text-sm font-bold tracking-wide text-slate-800 uppercase">{title}</span>
      </h2>
      {children}
    </section>
  );
}

/**
 * Public, unauthenticated page — this is what a scanned QR code / shared
 * portfolio link opens. No sidebar, no login required, only ever renders
 * APPROVED portfolios (the backend 404s anything else).
 */
export default function PublicPortfolio() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicPortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.get(`/api/public/portfolio/${slug}`)
      .then((r) => setData(r.data.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-100"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
  }
  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4 bg-slate-100">
        <div>
          <h1 className="text-lg font-semibold">Portfolio not found</h1>
          <p className="text-sm text-muted-foreground mt-1">This link may have expired or the portfolio hasn't been approved yet.</p>
        </div>
      </div>
    );
  }

  return <PortfolioView data={data} />;
}
