import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useRole, useAuth } from '@/hooks/useAuth';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { Role, ModuleName } from '@/types';
import { useState } from 'react';
import { useSidebarContext } from './SidebarContext';
import {
  LayoutDashboard, Users, Clock, Calendar, DollarSign,
  Building2, HelpCircle,
  Package, FileText, BarChart2, LogOut, ChevronDown, ChevronRight,
  ClipboardList, ShieldAlert, UserPlus, DoorOpen, TrendingUp,
  Wallet, GraduationCap, Target, Megaphone, KeyRound,
  BookOpen, PiggyBank, Store, Repeat, PieChart, X, Receipt, CheckCircle2,
  Presentation, CalendarClock, Handshake, ListChecks, Mic2, Network,
} from 'lucide-react';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  minRole?: Role;
  hideFor?: Role[];
  /** Only show this item to employees who actually have a TrainerAssignment row. */
  trainersOnly?: boolean;
  children?: Omit<NavItem, 'children'>[];
}

// Core HR/ops nav — visible by role, unrelated to module access.
// Kept as-is per the existing HR setup.
const navItems: NavItem[] = [
  { label: 'Dashboard',      to: '/dashboard',      icon: LayoutDashboard },
  { label: 'Employees',      to: '/employees',      icon: Users,         minRole: 'MANAGER' },
  {
    label: 'Attendance',
    to: '/attendance',
    icon: Clock,
    children: [
      { label: 'Attendance',     to: '/attendance',     icon: Clock },
      { label: 'Leave',          to: '/leave',          icon: Calendar },
      { label: 'Permissions',    to: '/permissions',    icon: ShieldAlert },
      { label: 'Leave Requests', to: '/leave-requests', icon: ClipboardList, minRole: 'MANAGER' },
      { label: 'Payroll',        to: '/payroll',        icon: DollarSign,    hideFor: ['SUPER_ADMIN'] },
    ],
  },
  { label: 'Assets',         to: '/assets',         icon: Package },
  { label: 'Documents',      to: '/documents',      icon: FileText },
  { label: 'Helpdesk',       to: '/helpdesk',       icon: HelpCircle },
  { label: 'Onboarding',     to: '/onboarding',     icon: UserPlus,      minRole: 'MANAGER' },
  { label: 'My Training',    to: '/my-training',    icon: Presentation, trainersOnly: true },
  { label: 'Org Chart',      to: '/org-chart',      icon: Network },
  { label: 'Resignation',    to: '/resignation',    icon: DoorOpen },
  { label: 'Org Setup',      to: '/org-setup',      icon: Building2,     minRole: 'HR' },
  { label: 'Reports',        to: '/reports',        icon: BarChart2,     minRole: 'HR' },
];

interface ModuleChild {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Each child carries its own module gate, so nested items (e.g. Digital
   * Marketing / Placements living under Finance (Admin)) stay visible based
   * on their own access grant, independent of the parent's module. */
  module: ModuleName;
}

interface ModuleNavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  module: ModuleName;
  children?: ModuleChild[];
  /** Tab id treated as active when the URL has no `?tab=` yet (first child by default), keyed by pathname. */
  defaultTab?: string;
}

// Path -> default tab id, used to highlight the right child when a tabbed
// page is opened without an explicit `?tab=` query string.
const MODULE_DEFAULT_TABS: Record<string, string> = {
  '/finance/admin': 'register',
  '/digital-marketing': 'campaigns',
  '/production': 'courses',
  '/placements': 'drives',
};

// Business modules — visibility driven entirely by effective module access
// (department default, overridden per-user via Master Control), independent of role.
// Each module is its own top-level item. Placements and Digital Marketing are
// separate expandable groups so users with only one of the two accesses see
// exactly the right section.
const moduleNavItems: ModuleNavItem[] = [
  { label: 'Sales',              to: '/sales',             icon: TrendingUp,    module: 'SALES' },
  { label: 'Finance (Sales)',    to: '/finance/sales',     icon: Wallet,        module: 'FINANCE_SALES' },
  {
    label: 'Finance (Admin)',
    to: '/finance/admin',
    icon: DollarSign,
    module: 'FINANCE_ADMIN',
    children: [
      { label: 'Expense Register',   to: '/finance/admin?tab=register',  icon: BookOpen,      module: 'FINANCE_ADMIN' },
      { label: 'HO Ledger',          to: '/finance/admin?tab=ledger',    icon: ClipboardList, module: 'FINANCE_ADMIN' },
      { label: 'HO Funds',           to: '/finance/admin?tab=funds',     icon: PiggyBank,     module: 'FINANCE_ADMIN' },
      { label: 'Vendors',            to: '/finance/admin?tab=vendors',   icon: Store,         module: 'FINANCE_ADMIN' },
      { label: 'Recurring Expenses', to: '/finance/admin?tab=recurring', icon: Repeat,        module: 'FINANCE_ADMIN' },
      { label: 'Category Summary',   to: '/finance/admin?tab=summary',   icon: PieChart,      module: 'FINANCE_ADMIN' },
    ],
  },
  {
    label: 'Digital Marketing',
    to: '/digital-marketing',
    icon: Megaphone,
    module: 'DIGITAL_MARKETING',
    children: [
      { label: 'Campaigns',        to: '/digital-marketing?tab=campaigns', icon: Megaphone,     module: 'DIGITAL_MARKETING' },
      { label: 'Recharges',        to: '/digital-marketing?tab=recharges', icon: Receipt,       module: 'DIGITAL_MARKETING' },
      { label: 'Daily Reports',    to: '/digital-marketing?tab=reports',   icon: ClipboardList, module: 'DIGITAL_MARKETING' },
      { label: 'Closed Campaigns', to: '/digital-marketing?tab=closed',    icon: CheckCircle2,  module: 'DIGITAL_MARKETING' },
      { label: 'Spend Summary',    to: '/digital-marketing?tab=summary',   icon: PieChart,      module: 'DIGITAL_MARKETING' },
    ],
  },
  {
    label: 'Placements',
    to: '/placements',
    icon: Target,
    module: 'PLACEMENTS',
    children: [
      { label: 'Drives',               to: '/placements?tab=drives',    icon: CalendarClock, module: 'PLACEMENTS' },
      { label: 'Partners',             to: '/placements?tab=partners',  icon: Handshake,     module: 'PLACEMENTS' },
      { label: 'Placement Pool',       to: '/placements?tab=pool',      icon: ListChecks,    module: 'PLACEMENTS' },
      { label: 'Softskill & Aptitude', to: '/placements?tab=softskill', icon: Mic2,          module: 'PLACEMENTS' },
      { label: 'Reports',              to: '/placements?tab=reports',   icon: BarChart2,     module: 'PLACEMENTS' },
    ],
  },
  { label: 'Admin & Ops',        to: '/admin-ops',         icon: Building2,     module: 'ADMIN' },
  {
    label: 'Production',
    to: '/production',
    icon: GraduationCap,
    module: 'PRODUCTION_TRAINING',
    children: [
      { label: 'Courses',              to: '/production?tab=courses',  icon: BookOpen,      module: 'PRODUCTION_TRAINING' },
      { label: 'Batches & Schedules',  to: '/production?tab=batches',  icon: ClipboardList, module: 'PRODUCTION_TRAINING' },
      { label: 'Students',            to: '/production?tab=students', icon: GraduationCap, module: 'PRODUCTION_TRAINING' },
      { label: 'Projects / Feedback / Tests', to: '/production?tab=content', icon: FileText, module: 'PRODUCTION_TRAINING' },
      { label: 'Reports',             to: '/production?tab=reports',  icon: BarChart2,     module: 'PRODUCTION_TRAINING' },
    ],
  },
];

// Explicit top-of-sidebar ordering requested by the user.
// Anything not listed here falls through to the "More" section, and
// Resignation is pinned to sit right above Master Control / Sign out.
const PINNED_TOP = ['Dashboard', 'Attendance', 'Finance (Admin)', 'Digital Marketing', 'Production', 'Placements'];
const PINNED_SECOND = ['Employees', 'Onboarding', 'Assets', 'Documents'];
const PINNED_LAST = ['Resignation'];

export function Sidebar() {
  const { can, role } = useRole();
  const { signOut, user } = useAuth();
  const { modules, canManageAccess } = useModuleAccess();
  const location = useLocation();
  const currentTab = new URLSearchParams(location.search).get('tab');
  const [expanded, setExpanded] = useState<string[]>([]);
  const { mobileOpen, close } = useSidebarContext();

  const toggle = (label: string) =>
    setExpanded((p) => p.includes(label) ? p.filter((l) => l !== label) : [...p, label]);

  const visible = navItems.filter((item) => {
    if (item.minRole && !can(item.minRole)) return false;
    if (item.hideFor && role && item.hideFor.includes(role as Role)) return false;
    if (item.trainersOnly && !user?.isTrainer) return false;
    return true;
  });

  const visibleModules = moduleNavItems
    .map((item) => {
      if (!item.children) {
        return modules[item.module] ? item : null;
      }
      const visibleChildren = item.children.filter((child) => !!modules[child.module]);
      if (visibleChildren.length === 0) return null;
      return { ...item, children: visibleChildren };
    })
    .filter((item): item is ModuleNavItem => item !== null);

  // Build the combined, reordered list of entries to render.
  type Entry = { kind: 'core'; item: NavItem } | { kind: 'module'; item: ModuleNavItem };
  const allEntries: Entry[] = [
    ...visible.map((item) => ({ kind: 'core' as const, item })),
    ...visibleModules.map((item) => ({ kind: 'module' as const, item })),
  ];
  const byLabel = (label: string) => allEntries.find((e) => e.item.label === label);

  const topSection = PINNED_TOP.map(byLabel).filter(Boolean) as Entry[];
  const secondSection = PINNED_SECOND.map(byLabel).filter(Boolean) as Entry[];
  const lastSection = PINNED_LAST.map(byLabel).filter(Boolean) as Entry[];

  const pinnedLabels = new Set([...PINNED_TOP, ...PINNED_SECOND, ...PINNED_LAST]);
  const moreSection = allEntries.filter((e) => !pinnedLabels.has(e.item.label));

  const handleNavClick = () => close();

  const renderEntry = (entry: Entry) => {
    if (entry.kind === 'core') {
      const item = entry.item;
      const Icon = item.icon;
      const isExpanded = expanded.includes(item.label);

      if (item.children) {
        return (
          <div key={item.label}>
            <button
              onClick={() => toggle(item.label)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              }
            </button>
            {isExpanded && (
              <div className="ml-4 mt-0.5 pl-3 border-l border-sidebar-border space-y-0.5">
                {item.children.filter((child) => {
                  if (child.minRole && !can(child.minRole)) return false;
                  if (child.hideFor && role && child.hideFor.includes(role as Role)) return false;
                  return true;
                }).map((child) => {
                  const ChildIcon = child.icon;
                  return (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      onClick={handleNavClick}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                          isActive
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                        )
                      }
                    >
                      <ChildIcon className="w-3.5 h-3.5" />
                      {child.label}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      return (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={handleNavClick}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
            )
          }
        >
          <Icon className="w-4 h-4 flex-shrink-0" />
          {item.label}
        </NavLink>
      );
    }

    // module entry
    const item = entry.item;
    const Icon = item.icon;

    if (item.children) {
      const isExpanded = expanded.includes(item.label);
      const isOnModule = location.pathname === item.to;
      return (
        <div key={item.label}>
          <button
            onClick={() => toggle(item.label)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isOnModule
                ? 'text-sidebar-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {isExpanded
              ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            }
          </button>
          {isExpanded && (
            <div className="ml-4 mt-0.5 pl-3 border-l border-sidebar-border space-y-0.5">
              {item.children.map((child) => {
                const ChildIcon = child.icon;
                const [childPath, childQuery] = child.to.split('?');
                const childTab = childQuery ? new URLSearchParams(childQuery).get('tab') : null;
                const isOnChildPath = location.pathname === childPath;
                const isChildActive = childTab
                  ? isOnChildPath && (currentTab === childTab || (!currentTab && childTab === MODULE_DEFAULT_TABS[childPath]))
                  : isOnChildPath;
                return (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    onClick={handleNavClick}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                      isChildActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    )}
                  >
                    <ChildIcon className="w-3.5 h-3.5" />
                    {child.label}
                  </NavLink>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={handleNavClick}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            isActive
              ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
          )
        }
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {item.label}
      </NavLink>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 w-64 bg-sidebar flex flex-col z-50 border-r border-sidebar-border',
          'transform transition-transform duration-200 ease-in-out',
          'lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-sidebar-border">
          <img src="/vinsup-logo.png" alt="Vinsup" className="h-9 w-auto object-contain flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sidebar-foreground font-bold text-sm leading-tight">Vin-Source Portal</p>
            <p className="text-sidebar-foreground/50 text-xs capitalize truncate">
              {role?.replace(/_/g, ' ').toLowerCase()}
            </p>
          </div>
          <button
            onClick={close}
            className="lg:hidden w-8 h-8 rounded-lg hover:bg-sidebar-accent flex items-center justify-center text-sidebar-foreground/60 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {topSection.map(renderEntry)}
          {secondSection.map(renderEntry)}

          {moreSection.length > 0 && (
            <>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                More
              </p>
              {moreSection.map(renderEntry)}
            </>
          )}

          {/* Master Control — visible only to users explicitly granted access-management rights */}
          {canManageAccess && (
            <>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                Governance
              </p>
              <NavLink
                to="/master-control"
                onClick={handleNavClick}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )
                }
              >
                <KeyRound className="w-4 h-4 flex-shrink-0" />
                Master Control
              </NavLink>
            </>
          )}

          {lastSection.length > 0 && (
            <>
              <div className="pt-2 border-t border-sidebar-border mt-2" />
              {lastSection.map(renderEntry)}
            </>
          )}
        </nav>

        {/* Bottom: user + logout */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg mb-1">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.employee
                ? `${user.employee.firstName[0]}${user.employee.lastName[0]}`
                : user?.email[0].toUpperCase()
              }
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sidebar-foreground text-xs font-medium truncate">
                {user?.employee
                  ? `${user.employee.firstName} ${user.employee.lastName}`
                  : user?.email
                }
              </p>
              <p className="text-sidebar-foreground/50 text-[10px] truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
                    Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
