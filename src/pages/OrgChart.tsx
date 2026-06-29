import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Users, Network, ChevronDown, Sparkles, ArrowDown } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface EmpNode {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  profilePhoto?: string | null;
  designation?: { id: string; name: string } | null;
  department?: { id: string; name: string; code: string } | null;
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function ini(name: string) {
  return name.split(' ').map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();
}

/** Returns true if any deptKeyword is a substring of the employee's department name. */
function matchesDept(emp: EmpNode, keywords: string[]): boolean {
  const dn = emp.department?.name?.toLowerCase() ?? '';
  return keywords.some((kw) => dn.includes(kw.toLowerCase()));
}

/* ─── Connector helpers ──────────────────────────────────────────────────────── */

/** Simple vertical line from parent down to next element. */
function VLine({ className = '' }: { className?: string }) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="w-0.5 bg-gray-200 h-8" />
    </div>
  );
}

/**
 * Draws:  one vertical drop from the parent → a horizontal bar → N vertical
 * drops, one per child.  Works by knowing the count and computing equal widths.
 */
function BranchConnector({ count }: { count: number }) {
  const positions = Array.from({ length: count }, (_, i) =>
    ((2 * i + 1) / (2 * count)) * 100,
  );
  const first = positions[0];
  const last = positions[positions.length - 1];

  return (
    <div className="relative" style={{ height: 40 }}>
      {/* Vertical from parent to horizontal bar */}
      <div
        className="absolute top-0 w-0.5 h-5 bg-gray-200"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      />
      {/* Horizontal bar spanning first-to-last child midpoint */}
      {count > 1 && (
        <div
          className="absolute h-0.5 bg-gray-200"
          style={{ top: 20, left: `${first}%`, right: `${100 - last}%` }}
        />
      )}
      {/* Vertical drops to each child */}
      {positions.map((pct, i) => (
        <div
          key={i}
          className="absolute w-0.5 h-5 bg-gray-200"
          style={{ top: 20, left: `${pct}%`, transform: 'translateX(-50%)' }}
        />
      ))}
    </div>
  );
}

/* ─── Color palette ──────────────────────────────────────────────────────────── */

type Color = 'blue' | 'violet' | 'emerald' | 'amber' | 'cyan' | 'rose' | 'slate';

const PALETTE: Record<Color, { strip: string; avatar: string; text: string; badge: string; border: string; teamBg: string; memberAvatar: string }> = {
  blue:    { strip: 'bg-blue-600',    avatar: 'bg-white/20 text-white',   text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-700',     border: 'border-blue-300',    teamBg: 'bg-blue-50',    memberAvatar: 'bg-blue-100 text-blue-700' },
  violet:  { strip: 'bg-violet-600',  avatar: 'bg-white/20 text-white',   text: 'text-violet-700',  badge: 'bg-violet-100 text-violet-700', border: 'border-violet-300',  teamBg: 'bg-violet-50',  memberAvatar: 'bg-violet-100 text-violet-700' },
  emerald: { strip: 'bg-emerald-600', avatar: 'bg-white/20 text-white',   text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700',border: 'border-emerald-300',teamBg: 'bg-emerald-50', memberAvatar: 'bg-emerald-100 text-emerald-700' },
  amber:   { strip: 'bg-amber-500',   avatar: 'bg-white/20 text-white',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700',   border: 'border-amber-300',   teamBg: 'bg-amber-50',   memberAvatar: 'bg-amber-100 text-amber-700' },
  cyan:    { strip: 'bg-cyan-600',    avatar: 'bg-white/20 text-white',   text: 'text-cyan-700',    badge: 'bg-cyan-100 text-cyan-700',     border: 'border-cyan-300',    teamBg: 'bg-cyan-50',    memberAvatar: 'bg-cyan-100 text-cyan-700' },
  rose:    { strip: 'bg-rose-600',    avatar: 'bg-white/20 text-white',   text: 'text-rose-700',    badge: 'bg-rose-100 text-rose-700',     border: 'border-rose-300',    teamBg: 'bg-rose-50',    memberAvatar: 'bg-rose-100 text-rose-700' },
  slate:   { strip: 'bg-slate-700',   avatar: 'bg-white/20 text-white',   text: 'text-slate-700',   badge: 'bg-slate-100 text-slate-700',   border: 'border-slate-300',   teamBg: 'bg-slate-50',   memberAvatar: 'bg-slate-100 text-slate-700' },
};

/* ─── Leader Card ────────────────────────────────────────────────────────────── */

interface LeaderCardProps {
  name: string;
  abbr: string;            // 2-letter initials
  role: string;
  division: string;
  color: Color;
  highlight?: boolean;     // Clement & Gokul get larger styling
  team: EmpNode[];
  badge?: string;          // e.g. "POC · Spark"
  dashed?: boolean;        // Mithun gets a dashed border
}

function LeaderCard({ name, abbr, role, division, color, highlight, team, badge, dashed }: LeaderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const c = PALETTE[color];

  return (
    <div
      className={`rounded-xl border-2 bg-white overflow-hidden transition-shadow
        ${dashed ? 'border-dashed border-purple-400' : c.border}
        ${highlight ? 'shadow-xl' : 'shadow-sm'}
        w-full`}
    >
      {/* Colour strip + avatar */}
      <div className={`${c.strip} ${highlight ? 'py-5' : 'py-3'} px-4 flex flex-col items-center gap-2`}>
        {badge && (
          <span className="text-[10px] font-bold tracking-widest uppercase text-white/80 bg-white/10 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        <div
          className={`${c.avatar} ${highlight ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-sm'} rounded-full flex items-center justify-center font-bold border-2 border-white/30`}
        >
          {abbr}
        </div>
      </div>

      {/* Text content */}
      <div className="p-3 text-center space-y-0.5">
        <p className={`font-bold leading-tight ${highlight ? 'text-sm' : 'text-xs'}`}>{name}</p>
        <p className={`text-xs font-semibold ${c.text}`}>{role}</p>
        <p className="text-[11px] text-muted-foreground leading-tight">{division}</p>

        {team.length > 0 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 flex items-center gap-1 mx-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Users className="w-3 h-3" />
            {team.length} team member{team.length !== 1 ? 's' : ''}
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
        {team.length === 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground/50 italic">No members assigned yet</p>
        )}
      </div>

      {/* Expanded team list */}
      {expanded && team.length > 0 && (
        <div className={`border-t border-gray-100 px-3 pb-3 pt-2 ${c.teamBg} space-y-1.5 max-h-48 overflow-y-auto`}>
          {team.map((emp) => (
            <div key={emp.id} className="flex items-center gap-2">
              <div
                className={`${c.memberAvatar} w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0`}
              >
                {ini(`${emp.firstName} ${emp.lastName}`)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium leading-tight truncate">
                  {emp.firstName} {emp.lastName}
                </p>
                {emp.designation && (
                  <p className="text-[10px] text-muted-foreground truncate">{emp.designation.name}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Top-level named node (Directors / Pooranam) ───────────────────────────── */

function TopNode({
  label, sublabel, meta, variant,
}: {
  label: string; sublabel: string; meta?: string; variant: 'directors' | 'cbpo';
}) {
  if (variant === 'directors') {
    return (
      <div className="mx-auto max-w-sm w-full">
        <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 shadow-lg px-6 py-5 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-400/30 border-2 border-amber-300 flex items-center justify-center mx-auto mb-2">
            <Network className="w-6 h-6 text-amber-700" />
          </div>
          <p className="font-bold text-amber-900 text-base tracking-wide">{label}</p>
          <p className="text-xs text-amber-700 mt-0.5 font-medium">{sublabel}</p>
        </div>
      </div>
    );
  }

  // CBPO card
  return (
    <div className="mx-auto max-w-xs w-full">
      <div className="rounded-xl border-2 border-slate-300 bg-gradient-to-br from-slate-800 to-slate-900 shadow-xl px-6 py-5 text-center">
        <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center mx-auto mb-3 text-white font-bold text-xl">
          PA
        </div>
        <p className="font-bold text-white text-base">{label}</p>
        <p className="text-xs font-semibold text-slate-300 mt-0.5">{sublabel}</p>
        {meta && <p className="text-[11px] text-slate-400 mt-0.5">{meta}</p>}
      </div>
    </div>
  );
}

/* ─── Division header badge ──────────────────────────────────────────────────── */

function DivisionBadge({ label, sub, color }: { label: string; sub: string; color: string }) {
  return (
    <div className={`${color} rounded-lg px-4 py-2.5 text-center mb-1`}>
      <p className="font-bold text-sm tracking-wide">{label}</p>
      <p className="text-[11px] opacity-80 mt-0.5">{sub}</p>
    </div>
  );
}

/* ─── Mithun POC special node ────────────────────────────────────────────────── */

function MithunNode() {
  return (
    <div className="mt-4 mx-auto max-w-sm w-full">
      {/* Visual connector hinting cross-team role */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 border-t-2 border-dashed border-purple-300" />
        <Sparkles className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
        <div className="flex-1 border-t-2 border-dashed border-purple-300" />
      </div>
      <div className="rounded-xl border-2 border-dashed border-purple-400 bg-purple-50 px-4 py-3 text-center shadow-sm">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-full bg-purple-200 text-purple-800 flex items-center justify-center font-bold text-sm">
            MI
          </div>
        </div>
        <p className="font-bold text-sm text-purple-900">Mithun</p>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full mt-0.5">
          <Sparkles className="w-2.5 h-2.5" /> Spark · POC
        </span>
        <p className="text-[11px] text-purple-700 mt-1.5 leading-relaxed">
          Cross-team coordinator for
        </p>
        <div className="flex flex-wrap justify-center gap-1 mt-1">
          {['Sales', 'Production', 'Admin & Finance'].map((t) => (
            <span key={t} className="text-[10px] bg-purple-200 text-purple-800 font-medium px-2 py-0.5 rounded-full">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */

export default function OrgChartPage() {
  const [employees, setEmployees] = useState<EmpNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/api/org/chart');
        setEmployees(r.data.data);
      } catch {
        setError('Failed to load org chart data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ── Department-to-leader matching ── */

  const teamOf = (keywords: string[]) =>
    employees.filter((e) => matchesDept(e, keywords));

  const clementTeam   = teamOf(['digital', 'marketing', 'placement']);
  const gokulTeam     = teamOf(['sales', 'crm']);
  const gauravB2CTeam = teamOf(['production', 'learning', 'training', 'delivery']);
  const jayasooriyaTeam = teamOf(['admin', 'finance', 'accounts', 'operations']);
  const gauravB2BTeam = teamOf(['technical', 'tech', 'development', 'engineering', 'it']);
  const selvakumarTeam = teamOf(['outreach', 'logistics', 'business development', 'bdm']);

  const totalHeadcount = employees.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Page header */}
      <div className="px-6 py-6 border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100">
              <Network className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Organisation Chart</h1>
              <p className="text-xs text-muted-foreground">
                Spark Institute — Leadership &amp; Team Structure
              </p>
            </div>
          </div>
          {!loading && !error && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-slate-50 border rounded-lg px-3 py-1.5">
              <Users className="w-4 h-4" />
              <span className="font-medium">{totalHeadcount}</span> active employee{totalHeadcount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Chart body */}
      <div className="px-4 py-8 overflow-x-auto">
        <div className="min-w-[900px] max-w-5xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              Loading org chart…
            </div>
          ) : error ? (
            <div className="text-center py-24 text-red-600 text-sm">{error}</div>
          ) : (
            <>
              {/* ── Level 1: Directors / HO ── */}
              <TopNode
                variant="directors"
                label="Board of Directors"
                sublabel="Headquarters (HO)"
              />

              <VLine />

              {/* ── Level 2: CBPO ── */}
              <TopNode
                variant="cbpo"
                label="Pooranam Annamalai"
                sublabel="Chief Business Process Officer"
                meta="CBPO · Spark Institute"
              />

              {/* ── Split connector → B2C & B2B ── */}
              <BranchConnector count={2} />

              {/* ── Level 3: Divisions ── */}
              <div className="grid grid-cols-2 gap-8 items-start">

                {/* ══ B2C Division ══ */}
                <div>
                  <DivisionBadge
                    label="B2C Division"
                    sub="Business to Consumer"
                    color="bg-blue-600 text-white"
                  />

                  {/* Top row: Highlighted leads — Clement & Gokul */}
                  <BranchConnector count={2} />
                  <div className="grid grid-cols-2 gap-3">
                    <LeaderCard
                      name="Clement"
                      abbr="CL"
                      role="Chief Growth Officer"
                      division="Digital Marketing & Placements"
                      color="blue"
                      highlight
                      team={clementTeam}
                    />
                    <LeaderCard
                      name="Gokul"
                      abbr="GK"
                      role="VP Sales"
                      division="Sales"
                      color="violet"
                      highlight
                      team={gokulTeam}
                    />
                  </div>

                  {/* Separator */}
                  <div className="my-4 flex items-center gap-2">
                    <div className="flex-1 border-t border-gray-100" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium px-2">Operations</span>
                    <div className="flex-1 border-t border-gray-100" />
                  </div>

                  {/* Bottom row: Gaurav & Jayasoorya */}
                  <BranchConnector count={2} />
                  <div className="grid grid-cols-2 gap-3">
                    <LeaderCard
                      name="Gaurav Kumar"
                      abbr="GK"
                      role="Learning Delivery Manager"
                      division="Production"
                      color="emerald"
                      team={gauravB2CTeam}
                    />
                    <LeaderCard
                      name="Jayasoorya Subramanian"
                      abbr="JS"
                      role="AGM"
                      division="Admin &amp; Finance"
                      color="amber"
                      team={jayasooriyaTeam}
                    />
                  </div>

                  {/* Mithun POC */}
                  <MithunNode />
                </div>

                {/* ══ B2B Division ══ */}
                <div>
                  <DivisionBadge
                    label="B2B Division"
                    sub="Business to Business"
                    color="bg-indigo-700 text-white"
                  />

                  <BranchConnector count={2} />
                  <div className="grid grid-cols-2 gap-3">
                    <LeaderCard
                      name="Gaurav"
                      abbr="GV"
                      role="Learning Delivery Manager"
                      division="Technical"
                      color="cyan"
                      team={gauravB2BTeam}
                    />
                    <LeaderCard
                      name="Selvakumar"
                      abbr="SK"
                      role="Sr. Business Dev. Manager"
                      division="Outreach · Logistics · Sales"
                      color="rose"
                      team={selvakumarTeam}
                    />
                  </div>

                  {/* Legend / note */}
                  <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-[11px] text-indigo-700 space-y-1">
                    <p className="font-semibold flex items-center gap-1">
                      <ArrowDown className="w-3 h-3" /> How team members appear
                    </p>
                    <p className="text-indigo-600/80 leading-relaxed">
                      Each leader's team auto-populates from the employee database when a
                      new employee is onboarded and assigned to the matching department.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Legend ── */}
              <div className="mt-10 border-t pt-6">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold text-center mb-3">
                  Legend
                </p>
                <div className="flex flex-wrap justify-center gap-4 text-xs">
                  {[
                    { color: 'bg-amber-300', label: 'Board / HO' },
                    { color: 'bg-slate-700', label: 'CBPO' },
                    { color: 'bg-blue-600', label: 'CGO (Highlighted)' },
                    { color: 'bg-violet-600', label: 'VP Sales (Highlighted)' },
                    { color: 'bg-emerald-600', label: 'Production' },
                    { color: 'bg-amber-500', label: 'Admin & Finance' },
                    { color: 'bg-cyan-600', label: 'Technical (B2B)' },
                    { color: 'bg-rose-600', label: 'Outreach / Sales (B2B)' },
                    { color: 'bg-purple-400 border-dashed border-2 border-purple-400 bg-transparent', label: 'Spark POC (Cross-team)' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={`w-3 h-3 rounded-sm flex-shrink-0 ${color}`} />
                      <span className="text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
