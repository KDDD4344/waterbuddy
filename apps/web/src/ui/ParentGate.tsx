import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { GuardContext, useParentGate, type Guard } from './useParentGate';
import { checkParentAnswer, parentQuestion, type ParentQuestion } from '../domain/modes';
import { Sheet } from './Sheet';

/** After a correct answer, further checks are skipped for this long. */
const UNLOCK_MS = 2 * 60 * 1000;

/**
 * Kid mode (Phase 8, safety rule 5): settings a child shouldn't change alone ask a grown-up
 * question first. When `active` is false every action runs straight away.
 */
export function ParentGateProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const [pending, setPending] = useState<{ action: () => void; why: string; q: ParentQuestion } | null>(null);
  const [input, setInput] = useState('');
  const [wrong, setWrong] = useState(false);
  const unlockedUntil = useRef(0);
  const inputId = useId();

  const guard = useCallback<Guard>(
    (action, why) => {
      if (!active || Date.now() < unlockedUntil.current) {
        action();
        return;
      }
      setInput('');
      setWrong(false);
      setPending({ action, why, q: parentQuestion() });
    },
    [active]
  );

  const close = () => setPending(null);
  const submit = () => {
    if (!pending) return;
    if (!checkParentAnswer(pending.q, input)) {
      setWrong(true);
      setInput('');
      setPending({ ...pending, q: parentQuestion() });
      return;
    }
    unlockedUntil.current = Date.now() + UNLOCK_MS;
    const { action } = pending;
    setPending(null);
    action();
  };

  return (
    <GuardContext.Provider value={guard}>
      {children}
      <Sheet open={!!pending} onClose={close} title="Ask a grown-up">
        {pending && (
          <form
            className="sheet-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <p>{pending.why} A parent or guardian can answer this to carry on.</p>
            <label htmlFor={inputId} className="setting-label">
              {pending.q.text}
            </label>
            <input
              id={inputId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              aria-describedby={wrong ? `${inputId}-err` : undefined}
              aria-invalid={wrong || undefined}
            />
            {wrong && (
              <p id={`${inputId}-err`} className="error" role="alert">
                Not quite. Here&rsquo;s a new one.
              </p>
            )}
            <div className="row">
              <button type="button" className="btn ghost" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn primary grow" disabled={!input}>
                Continue
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </GuardContext.Provider>
  );
}

/** A link to another website. In kid mode a grown-up says yes first. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const guard = useParentGate();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        guard(() => window.open(href, '_blank', 'noopener,noreferrer'), 'This opens another website.');
      }}
    >
      {children}
      <span className="sr-only"> (opens another website)</span>
    </a>
  );
}
