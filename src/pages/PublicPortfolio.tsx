import { useEffect, useMemo, useRef, useState } from 'react';
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

// Blue stays the brand anchor (header, hero, nav, contact CTA), but each
// content section gets its own accent so the page doesn't read as one flat
// wall of blue — a small, tasteful rotation rather than a rainbow.
type Accent = 'blue' | 'violet' | 'emerald' | 'amber' | 'rose';
// NOTE: every value here must be a full, static Tailwind class string (never
// built with a template literal at the call site) — Tailwind's JIT scanner
// only picks up classes it can find written out literally in the source.
const ACCENT: Record<Accent, { badgeBg: string; badgeText: string; bar: string; dot: string; text: string; border: string }> = {
  blue: { badgeBg: 'bg-blue-50', badgeText: 'text-blue-600', bar: 'from-blue-600 to-cyan-400', dot: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200' },
  violet: { badgeBg: 'bg-violet-50', badgeText: 'text-violet-600', bar: 'from-violet-600 to-fuchsia-400', dot: 'bg-violet-500', text: 'text-violet-600', border: 'border-violet-200' },
  emerald: { badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-600', bar: 'from-emerald-600 to-teal-400', dot: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200' },
  amber: { badgeBg: 'bg-amber-50', badgeText: 'text-amber-600', bar: 'from-amber-500 to-orange-400', dot: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200' },
  rose: { badgeBg: 'bg-rose-50', badgeText: 'text-rose-600', bar: 'from-rose-500 to-pink-400', dot: 'bg-rose-500', text: 'text-rose-600', border: 'border-rose-200' },
};

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
      {/* ── Header nav — pinned to the very top of the page, not just once
          you've scrolled past the hero ── */}
      {sections.length > 1 && (
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center gap-3">
            <span className="shrink-0 font-bold text-slate-800 text-sm py-2.5">{student.firstName}</span>
            <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
              <div className="flex items-center justify-end gap-1 py-2 w-max ml-auto">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => scrollToSection(s.id)}
                    className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                      activeSection === s.id ? 'bg-blue-600 text-white shadow-sm scale-105' : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 text-white">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl animate-pulse [animation-duration:7s]" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-cyan-400/10 blur-3xl animate-pulse [animation-duration:9s]" />
        <div className="absolute top-1/3 left-1/4 w-64 h-64 rounded-full bg-violet-500/10 blur-3xl animate-pulse [animation-duration:8s]" />
        {/* subtle dot texture for depth */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />

        <div className="relative max-w-3xl mx-auto px-6 pt-16 pb-24 text-center">
          <div className="relative inline-block animate-fade-in [animation-duration:0.7s]">
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 opacity-70 blur-sm animate-pulse [animation-duration:4s]" />
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

          <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold tracking-tight animate-fade-in [animation-duration:0.7s] [animation-delay:120ms] [animation-fill-mode:both]">
            {fullName}
          </h1>

          {data.targetRole && (
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap animate-fade-in [animation-duration:0.7s] [animation-delay:220ms] [animation-fill-mode:both]">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/10 border border-white/20 rounded-full px-3.5 py-1.5 backdrop-blur">
                <Sparkles className="w-3.5 h-3.5 text-cyan-300" /> Aspiring {data.targetRole}
              </span>
            </div>
          )}

          {!!data.badges?.length && (
            <div className="mt-5 flex items-center justify-center gap-2 flex-wrap animate-fade-in [animation-duration:0.7s] [animation-delay:320ms] [animation-fill-mode:both]">
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

      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* About */}
        {data.summary && (
          <section id="about" className="scroll-mt-16 py-12">
            <Reveal>
              <SectionHeading eyebrow="Get to know me" title="About" icon={User} accent="violet" />
              <div className="relative bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-9 hover:shadow-md transition-shadow duration-300">
                <Quote className="w-9 h-9 text-violet-50 absolute top-5 left-5" />
                <p className="relative text-[15px] leading-7 text-slate-700 text-center italic">{data.summary}</p>
              </div>
            </Reveal>
          </section>
        )}

        {/* Projects */}
        {!!data.projects?.length && (
          <section id="projects" className={`scroll-mt-16 py-12 ${data.summary ? 'border-t border-slate-200' : ''}`}>
            <Reveal>
              <SectionHeading eyebrow="What I've built" title="Projects" icon={FolderGit2} accent="blue" />
            </Reveal>
            <div className="space-y-3">
              {data.projects.map((p, i) => (
                <Reveal key={i} delay={i * 70}>
                  <AccordionCard
                    defaultOpen={i === 0}
                    accent="blue"
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
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {/* Skills */}
        {!!data.skills?.length && (
          <section id="skills" className="scroll-mt-16 py-12 border-t border-slate-200">
            <Reveal>
              <SectionHeading eyebrow="What I bring" title="Skills" icon={Code2} accent="emerald" />
            </Reveal>
            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-5">
              {data.skills.map((s, i) => (
                <SkillBar key={i} name={s.name} stars={skillStars(s)} delay={i * 50} />
              ))}
            </div>
          </section>
        )}

        {/* Experience */}
        {!!data.experience?.length && (
          <section id="experience" className="scroll-mt-16 py-12 border-t border-slate-200">
            <Reveal>
              <SectionHeading eyebrow="Where I've worked" title="Experience" icon={Briefcase} accent="amber" />
            </Reveal>
            <div className="space-y-3">
              {data.experience.map((e, i) => (
                <Reveal key={i} delay={i * 70}>
                  <AccordionCard
                    defaultOpen={i === 0}
                    accent="amber"
                    title={<>{e.role}{e.company && <span className="text-slate-400 font-normal"> · {e.company}</span>}</>}
                    meta={e.duration && <p className="text-xs text-slate-400 mt-0.5">{e.duration}</p>}
                  >
                    {e.description && <p className="text-[13px] leading-6 text-slate-600">{e.description}</p>}
                  </AccordionCard>
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {/* Education */}
        {!!data.education?.length && (
          <section id="education" className="scroll-mt-16 py-12 border-t border-slate-200">
            <Reveal>
              <SectionHeading eyebrow="Academic background" title="Education" icon={GraduationCap} accent="rose" />
            </Reveal>
            <div className="space-y-5">
              {data.education.map((ed, i) => (
                <Reveal key={i} delay={i * 70}>
                  <div className="relative pl-5 border-l-2 border-rose-100">
                    <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-white border-2 border-rose-500" />
                    <p className="text-[15px] font-semibold text-slate-800">{ed.degree}{ed.fieldOfStudy ? ` · ${ed.fieldOfStudy}` : ''}</p>
                    <p className="text-[13px] text-rose-600 font-medium mt-0.5">{ed.institution}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{[ed.year, ed.grade].filter(Boolean).join(' · ')}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Contact ── */}
      {(student.email || student.phone) && (
        <section id="contact" className="scroll-mt-16 relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 text-white mt-4">
          <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-cyan-400/10 blur-3xl animate-pulse [animation-duration:7s]" />
          <div className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-violet-500/15 blur-3xl animate-pulse [animation-duration:9s]" />
          <Reveal>
            <div className="relative max-w-2xl mx-auto px-6 py-16 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Get in touch</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold mt-2">Let's build something great</h2>
              <p className="text-sm text-blue-100/80 mt-2">Open to opportunities — reach out any time.</p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {student.email && (
                  <a
                    href={`mailto:${student.email}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold bg-white text-blue-900 rounded-full px-5 py-2.5 hover:bg-blue-50 hover:-translate-y-0.5 transition-all shadow-lg shadow-black/10"
                  >
                    <Mail className="w-4 h-4" /> {student.email}
                  </a>
                )}
                {student.phone && (
                  <a
                    href={`tel:${student.phone}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold bg-white/10 border border-white/20 rounded-full px-5 py-2.5 hover:bg-white/20 hover:-translate-y-0.5 transition-all backdrop-blur"
                  >
                    <Phone className="w-4 h-4" /> {student.phone}
                  </a>
                )}
              </div>
            </div>
          </Reveal>
        </section>
      )}

      {/* ── Footer ── */}
      <div className="text-center py-6">
        <p className="text-xs text-slate-400">Portfolio by <span className="font-semibold text-slate-500">Vinsup Skill Academy</span></p>
      </div>
    </div>
  );
}

/** Fades + slides an element up into place the first time it scrolls into
 * view (once — doesn't replay on scroll-back). `delay` (ms) lets a list of
 * items cascade in one after another instead of popping in all at once. */
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
    >
      {children}
    </div>
  );
}

/** A single skill row whose star rating and progress bar animate in (bar
 * grows from 0 to its target width) the first time it scrolls into view. */
function SkillBar({ name, stars, delay }: { name: string; stars: number; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const pct = (stars / 5) * 100;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-medium text-slate-700">{name}</span>
        <span className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`w-3 h-3 transition-colors duration-300 ${n <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
          ))}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-[width] duration-[1200ms] ease-out"
          style={{ width: visible ? `${pct}%` : '0%', transitionDelay: `${delay}ms` }}
        />
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, icon: Icon, accent }: { eyebrow: string; title: string; icon: IconType; accent: Accent }) {
  const a = ACCENT[accent];
  return (
    <div className="mb-8 text-center">
      <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl ${a.badgeBg} mb-3`}>
        <Icon className={`w-5 h-5 ${a.badgeText}`} />
      </div>
      <p className={`text-xs font-bold uppercase tracking-widest ${a.text} flex items-center justify-center gap-1.5`}>
        <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} /> {eyebrow}
      </p>
      <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">{title}</h2>
      <span className={`block w-10 h-1 rounded-full bg-gradient-to-r ${a.bar} mt-3 mx-auto`} />
    </div>
  );
}

/** Collapsible entry used for Projects and Experience — keeps a page with
 * many entries scannable instead of a wall of always-expanded text. */
function AccordionCard({ title, meta, children, defaultOpen, accent }: {
  title: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; accent: Accent;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const a = ACCENT[accent];
  return (
    <div className={`rounded-xl border bg-white transition-all duration-300 ${open ? `${a.border} shadow-sm` : 'border-slate-100 hover:shadow-sm'} hover:-translate-y-0.5`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-800">{title}</h3>
          {meta}
        </div>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? `rotate-180 ${a.text}` : 'text-slate-400'}`} />
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
