import { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarContextValue {
  mobileOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const value: SidebarContextValue = {
    mobileOpen,
    open: () => setMobileOpen(true),
    close: () => setMobileOpen(false),
    toggle: () => setMobileOpen((v) => !v),
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebarContext(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  // Fallback so Sidebar/Header never crash if rendered outside a provider.
  if (!ctx) {
    return { mobileOpen: false, open: () => {}, close: () => {}, toggle: () => {} };
  }
  return ctx;
}
