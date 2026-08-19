import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { BASE_URL } from '@/lib/api';
import {
  Loader2, GraduationCap, Briefcase, FolderGit2, ExternalLink,
  Mail, Phone, Sparkles, Code2, Star, ChevronDown, Quote, User,
} from 'lucide-react';

interface Education { degree: string; institution: string; fieldOfStudy: string; year: string; grade: string }
// `stars` (1-5) is the current shape; `level` is legacy free-text from before
// the star rating existed — still rendered (converted to a star count) for
// portfolios that were approved before this change.
interface Skill { name: string; stars?: number; level?: string }
interface ProjectItem { title: string; description: string; link: string; techStack: string }
interface Experience { company: string; role: string; duration: string; description: string }

export interface PublicPortfolioData {
  summary: string | null;
  targetRole: string | null;
  education: Education[] | null;
  skills: Skill[] | null;
  projects: ProjectItem[] | null;
  experience: Experience[] | null;
  badges?: { id: string; emoji: string; label: string; desc: string }[];
  student: { firstName: string; lastName: string; studentCode: string; track: string; photo: string | null; email: string | null; phone: string | null };
}

type IconType = typeof Briefcase;
type SectionId = 'about' | 'projects' | 'skills' | 'experience' | 'education' | 'contact';

const photoUrl = (path: string) => (/^https?:\/\//i.test(path) ? path : `${BASE_URL}${path}`);

// A student typing "github.com/me" (no scheme) into the Link field would
// otherwise resolve as a path relative to the portfolio page itself — send
// the browser to vinsource.../portfolio/github.com/me instead of the actual
// site. Force a scheme so external links always go where they're meant to.
const externalUrl = (raw: string) => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

const LEVEL_TO_STARS: Record<string, number> = {
  beginner: 2, basic: 2, intermediate: 3, advanced: 4, expert: 5, proficient: 4,
};
const skillStars = (s: Skill) => s.stars || LEVEL_TO_STARS[(s.level || '').toLowerCase()] || 3;

/** The polished portfolio rendering — used by the public QR/link page. */
export function PortfolioView({ data }: { data: PublicPortfolioData }) {
  const { student } = data;
  const fullName = `${student.firstName} ${student.lastName}`;

  const sections = useMemo(() => {
    const list: { id: SectionId; label: string }[] = [];
    if (data.summary) list.push({ id: 'about', label: 'About' });
    if (data.projects?.length) list.push({ id: 'projects', label: 'Projects' });
    if (data.skills?.length) list.push({ id: 'skills', label: 'Skills' });
    if (data.experience?.length) list.push({ id: 'experience', label: 'Experience' });
    if (data.education?.length) list.push({ id: 'education', label: 'Education' });
    if (student.email || student.phone) list.push({ id: 'contact', label: 'Contact' });
    return list;
  }, [data, student]);

  const [activeSection, setActiveSection] = useState<SectionId | null>(null);

  // Scroll-spy: highlights whichever section's heading is currently nearest
  // the top of the viewport (just below the sticky nav) as the active tab.
  useEffect(() => {
    if (sections.length < 2) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id as SectionId);
      },
      { rootMargin: '-112px 0px -55% 0px', threshold: 0.01 }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 text-white">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-cyan-400/10 blur-3xl" />
        {/* subtle dot texture for depth */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />

        <div className="relative max-w-3xl mx-auto px-6 pt-16 pb-24 text-center">
          <div className="relative inline-block">
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 opacity-70 blur-sm" />
            {student.photo ? (
              <img
                src={photoUrl(student.photo)}
                alt={fullName}
                className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full object-cover ring-4 ring-slate-900 shadow-2xl"
              />
            ) : (
              <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full ring-4 ring-slate-900 shadow-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-4xl font-bold">
                {student.firstName[0]}{student.lastName[0]}
              </div>
            )}
          </div>

          <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight">{fullName}</h1>

          {data.targetRole && (
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/10 border border-white/20 rounded-full px-3.5 py-1.5 backdrop-blur">
                <Sparkles className="w-3.5 h-3.5 text-cyan-300" /> Aspiring {data.targetRole}
              </span>
            </div>
          )}

          {!!data.badges?.length && (
            <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
              {data.badges.map((b) => (
                <span key={b.id} title={b.desc}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-400/15 border border-amber-300/30 text-amber-100 rounded-full px-3 py-1.5 backdrop-blur">
                  <span className="text-sm">{b.emoji}</span> {b.label}
                </span>
              ))}
            </div>
          )}

          {sections.length > 0 && (
            <button
              onClick={() => scrollToSection(sections[0].id)}
              className="mt-10 inline-flex items-center justify-center w-9 h-9 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors animate-bounce"
              aria-label="Scroll down"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Sticky section nav ── */}
      {sections.length > 1 && (
        <div className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1 py-2 w-max sm:w-full">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors ${
                    activeSection === s.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* About */}
        {data.summary && (
          <section id="about" className="scroll-mt-16 py-12">
            <SectionHeading eyebrow="Get to know me" title="About" icon={User} />
            <div className="relative bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-9">
              <Quote className="w-9 h-9 text-blue-50 absolute top-5 left-5" />
              <p className="relative text-[15px] leading-7 text-slate-700 text-center italic">{data.summary}</p>
            </div>
          </section>
        )}

        {/* Projects */}
        {!!data.projects?.length && (
          <section id="projects" className={`scroll-mt-16 py-12 ${data.summary ? 'border-t border-slate-200' : ''}`}>
            <SectionHeading eyebrow="What I've built" title="Projects" icon={FolderGit2} />
            <div className="space-y-3">
              {data.projects.map((p, i) => (
                <AccordionCard
                  key={i}
                  defaultOpen={i === 0}
                  title={p.title}
                  meta={p.techStack && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{p.techStack}</p>}
                >
                  <div className="space-y-3">
                    {p.description && <p className="text-[13px] leading-6 text-slate-600">{p.description}</p>}
                    {p.techStack && (
                      <div className="flex flex-wrap gap-1.5">
                        {p.techStack.split(/[,|]/).map((t, j) => t.trim() && (
                          <span key={j} className="text-[11px] font-medium bg-slate-100 text-slate-600 rounded-md px-2 py-0.5">{t.trim()}</span>
                        ))}
                      </div>
                    )}
                    {p.link && (
                      <a
                        href={externalUrl(p.link)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full px-3.5 py-1.5 transition-colors"
                      >
                        View Project <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </AccordionCard>
              ))}
            </div>
          </section>
        )}

        {/* Skills */}
        {!!data.skills?.length && (
          <section id="skills" className="scroll-mt-16 py-12 border-t border-slate-200">
            <SectionHeading eyebrow="What I bring" title="Skills" icon={Code2} />
            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-5">
              {data.skills.map((s, i) => {
                const stars = skillStars(s);
                const pct = (stars / 5) * 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-medium text-slate-700">{s.name}</span>
                      <span className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={`w-3 h-3 ${n <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                        ))}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Experience */}
        {!!data.experience?.length && (
          <section id="experience" className="scroll-mt-16 py-12 border-t border-slate-200">
            <SectionHeading eyebrow="Where I've worked" title="Experience" icon={Briefcase} />
            <div className="space-y-3">
              {data.experience.map((e, i) => (
                <AccordionCard
                  key={i}
                  defaultOpen={i === 0}
                  title={<>{e.role}{e.company && <span className="text-slate-400 font-normal"> · {e.company}</span>}</>}
                  meta={e.duration && <p className="text-xs text-slate-400 mt-0.5">{e.duration}</p>}
                >
                  {e.description && <p className="text-[13px] leading-6 text-slate-600">{e.description}</p>}
                </AccordionCard>
              ))}
            </div>
          </section>
        )}

        {/* Education */}
        {!!data.education?.length && (
          <section id="education" className="scroll-mt-16 py-12 border-t border-slate-200">
            <SectionHeading eyebrow="Academic background" title="Education" icon={GraduationCap} />
            <div className="space-y-5">
              {data.education.map((ed, i) => (
                <div key={i} className="relative pl-5 border-l-2 border-blue-100">
                  <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-white border-2 border-blue-500" />
                  <p className="text-[15px] font-semibold text-slate-800">{ed.degree}{ed.fieldOfStudy ? ` · ${ed.fieldOfStudy}` : ''}</p>
                  <p className="text-[13px] text-blue-600 font-medium mt-0.5">{ed.institution}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{[ed.year, ed.grade].filter(Boolean).join(' · ')}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Contact ── */}
      {(student.email || student.phone) && (
        <section id="contact" className="scroll-mt-16 relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 text-white mt-4">
          <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="relative max-w-2xl mx-auto px-6 py-16 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Get in touch</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold mt-2">Let's build something great</h2>
            <p className="text-sm text-blue-100/80 mt-2">Open to opportunities — reach out any time.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {student.email && (
                <a
                  href={`mailto:${student.email}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold bg-white text-blue-900 rounded-full px-5 py-2.5 hover:bg-blue-50 transition-colors shadow-lg shadow-black/10"
                >
                  <Mail className="w-4 h-4" /> {student.email}
                </a>
              )}
              {student.phone && (
                <a
                  href={`tel:${student.phone}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold bg-white/10 border border-white/20 rounded-full px-5 py-2.5 hover:bg-white/20 transition-colors backdrop-blur"
                >
                  <Phone className="w-4 h-4" /> {student.phone}
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <div className="text-center py-6">
        <p className="text-xs text-slate-400">Portfolio by <span className="font-semibold text-slate-500">Vinsup Skill Academy</span></p>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, icon: Icon }: { eyebrow: string; title: string; icon: IconType }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-blue-600 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> {eyebrow}
        </p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">{title}</h2>
        <span className="block w-10 h-1 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 mt-3" />
      </div>
      <Icon className="w-7 h-7 text-blue-100 hidden sm:block shrink-0" />
    </div>
  );
}

/** Collapsible entry used for Projects and Experience — keeps a page with
 * many entries scannable instead of a wall of always-expanded text. */
function AccordionCard({ title, meta, children, defaultOpen }: {
  title: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`rounded-xl border bg-white transition-colors ${open ? 'border-blue-200 shadow-sm' : 'border-slate-100 hover:border-blue-200'}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-800">{title}</h3>
          {meta}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 -mt-1 animate-in fade-in slide-in-from-top-1 duration-200">{children}</div>}
    </div>
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
