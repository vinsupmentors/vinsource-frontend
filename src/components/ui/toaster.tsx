import { useState, createContext, useContext, useCallback, useEffect, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'default' | 'success' | 'error' | 'info';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextType {
  toast: (opts: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextType>({
  toast: () => {},
  dismiss: () => {},
});

export const useToast = () => useContext(ToastContext);

const variantStyles: Record<ToastVariant, string> = {
  default: 'bg-card border text-foreground',
  success: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-950/50 dark:border-green-800 dark:text-green-100',
  error: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/50 dark:border-red-800 dark:text-red-100',
  info: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-100',
};

const IconMap: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  default: Info,
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, t.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [t.duration, onDismiss]);

  const variant = t.variant ?? 'default';
  const Icon = IconMap[variant];

  return (
    <div className={cn('w-80 rounded-xl border shadow-lg px-4 py-3 flex items-start gap-3', variantStyles[variant])}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-70" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{t.title}</p>
        {t.description && <p className="text-xs mt-0.5 opacity-75">{t.description}</p>}
      </div>
      <button onClick={onDismiss} className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Wrap your entire app with this so useToast() works anywhere */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...opts, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem t={t} onDismiss={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** @deprecated Use ToastProvider instead — kept for backward compat */
export function Toaster() {
  return null;
}
