'use client';

import * as React from 'react';
import { X, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ──
const MAX_TOASTS = 5;

// ── Types ──
export interface ToastProps {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose?: () => void;
}

// ── Variant Icons ──
const variantIcons: Record<string, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const variantIconColors: Record<string, string> = {
  success: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400',
};

// ── Variant Styles ──
const variantStyles: Record<string, string> = {
  default: 'bg-background border-border text-foreground',
  success: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-100',
  error: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-100',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-100',
  info: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-100',
};

// ── Toast Component ──
const Toast: React.FC<ToastProps> = ({
  title,
  description,
  variant = 'default',
  duration = 5000,
  onClose,
}) => {
  const [state, setState] = React.useState<'entering' | 'visible' | 'exiting'>('entering');

  React.useEffect(() => {
    // Transition from entering to visible
    const enterTimer = setTimeout(() => setState('visible'), 20);
    return () => clearTimeout(enterTimer);
  }, []);

  React.useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setState('exiting');
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration]);

  React.useEffect(() => {
    if (state === 'exiting') {
      const exitTimer = setTimeout(() => onClose?.(), 300);
      return () => clearTimeout(exitTimer);
    }
  }, [state, onClose]);

  function handleDismiss() {
    setState('exiting');
  }

  const Icon = variantIcons[variant];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'rounded-xl border p-4 shadow-lg',
        'min-w-[300px] max-w-[420px]',
        'transition-all duration-300 ease-out',
        state === 'entering' && 'translate-x-full opacity-0',
        state === 'visible' && 'translate-x-0 opacity-100',
        state === 'exiting' && 'translate-x-full opacity-0 scale-95',
        variantStyles[variant]
      )}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', variantIconColors[variant])} />
        )}
        <div className="flex-1 min-w-0">
          {title && <div className="font-semibold text-sm leading-tight">{title}</div>}
          {description && <div className="text-sm mt-1 opacity-90 leading-snug">{description}</div>}
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-0.5 opacity-60 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          aria-label="Bildirimi kapat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// ── Context ──
interface ToastContextType {
  toast: (props: Omit<ToastProps, 'id' | 'onClose'>) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

// ── Provider ──
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastProps[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback((props: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = Math.random().toString(36).substring(7);
    const newToast: ToastProps = {
      ...props,
      id,
      onClose: () => removeToast(id),
    };

    setToasts((prev) => {
      const next = [...prev, newToast];
      // Enforce max stack: remove oldest if over limit
      if (next.length > MAX_TOASTS) {
        return next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-0 right-0 z-[100] flex flex-col gap-2 p-4 max-w-[460px] w-full pointer-events-none"
        aria-label="Bildirimler"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast {...t} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Hook ──
export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    return {
      toast: (_props: Omit<ToastProps, 'id' | 'onClose'>) => {
        if (typeof window !== 'undefined') {
          console.warn('useToast: ToastProvider not found. Wrap your app with <ToastProvider>.');
        }
      },
    };
  }
  return context;
}
