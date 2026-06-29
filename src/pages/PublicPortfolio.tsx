import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { BASE_URL } from '@/lib/api';
import { Loader2, GraduationCap, Briefcase, Wrench, FolderGit2, ExternalLink } from 'lucide-react';

interface Education { degree: string; institution: string; fieldOfStudy: string; year: string; grade: string }
interface Skill { name: string; level: string }
interface ProjectItem { title: string; description: string; link: string; techStack: string }
interface Experience { company: string; role: string; duration: string; description: string }

interface PublicPortfolio {
  summary: string | null;
  education: Education[] | null;
  skills: Skill[] | null;
  projects: ProjectItem[] | null;
  experience: Experience[] | null;
  student: { firstName: string; lastName: string; studentCode: string; track: string; photo: string | null; email: string | null; phone: string | null };
}

const photoUrl = (path: string) => (/^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`);

/**
 * Public, unauthenticated page — this is what a scanned QR code / shared
 * portfolio link opens. No sidebar, no login required, only ever renders
 * APPROVED portfolios (the backend 404s anything else).
 */
export default function PublicPortfolio() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.get(`/api/public/portfolio/${slug}`)
      .then((r) => setData(r.data.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }
  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <h1 className="text-lg font-semibold">Portfolio not found</h1>
          <p className="text-sm text-muted-foreground mt-1">This link may have expired or the portfolio hasn't been approved yet.</p>
        </div>
      </div>
    );
  }

  const { student } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <header className="flex items-center gap-4">
          {student.photo ? (
            <img src={photoUrl(student.photo)} alt="" className="w-20 h-20 rounded-full object-cover border" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-semibold">
              {student.firstName[0]}{student.lastName[0]}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold">{student.firstName} {student.lastName}</h1>
            <p className="text-sm text-muted-foreground">{student.track} &middot; {student.studentCode}</p>
            {(student.email || student.phone) && (
              <p className="text-xs text-muted-foreground mt-0.5">{[student.email, student.phone].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        </header>

        {data.summary && (
          <section className="bg-white rounded-xl border p-5">
            <p className="text-sm leading-relaxed">{data.summary}</p>
          </section>
        )}

        {!!data.skills?.length && (
          <Section icon={Wrench} title="Skills">
            <div className="flex flex-wrap gap-2">
              {data.skills.map((s, i) => (
                <span key={i} className="text-xs bg-blue-50 text-blue-700 rounded-full px-3 py-1 font-medium">
                  {s.name}{s.level ? ` · ${s.level}` : ''}
                </span>
              ))}
            </div>
          </Section>
        )}

        {!!data.projects?.length && (
          <Section icon={FolderGit2} title="Projects">
            <div className="space-y-3">
              {data.projects.map((p, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{p.title}</h3>
                    {p.link && (
                      <a href={p.link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 flex items-center gap-1">
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground mt-1">{p.description}</p>}
                  {p.techStack && <p className="text-xs text-muted-foreground mt-1">Tech: {p.techStack}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {!!data.experience?.length && (
          <Section icon={Briefcase} title="Experience">
            <div className="space-y-3">
              {data.experience.map((e, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{e.role} {e.company && `· ${e.company}`}</h3>
                    {e.duration && <span className="text-xs text-muted-foreground">{e.duration}</span>}
                  </div>
                  {e.description && <p className="text-sm text-muted-foreground mt-1">{e.description}</p>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {!!data.education?.length && (
          <Section icon={GraduationCap} title="Education">
            <div className="space-y-3">
              {data.education.map((ed, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{ed.degree} {ed.fieldOfStudy && `· ${ed.fieldOfStudy}`}</h3>
                    {ed.year && <span className="text-xs text-muted-foreground">{ed.year}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{ed.institution}{ed.grade && ` · ${ed.grade}`}</p>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Wrench; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border p-5">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Icon className="w-4 h-4 text-blue-600" /> {title}</h2>
      {children}
    </section>
  );
}
