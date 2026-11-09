import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type ToastInput = { text: string; action?: { label: string; run: () => void }; ms?: number };
type ToastMsg = ToastInput & { id: number };

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** One toast at a time, announced politely to screen readers. Undo lives here. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((t: ToastInput) => {
    window.clearTimeout(timer.current);
    setMsg({ ...t, id: Date.now() });
    timer.current = window.setTimeout(() => setMsg(null), t.ms ?? 6000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {msg && (
          <div className="toast" key={msg.id}>
            <span>{msg.text}</span>
            {msg.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  msg.action?.run();
                  setMsg(null);
                }}
              >
                {msg.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(ToastContext);
}
