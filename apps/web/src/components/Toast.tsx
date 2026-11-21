import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { TONES } from '../lib/tone';

type Tone = 'ok' | 'fail';

interface ToastMessage {
  readonly id: number;
  readonly text: string;
  readonly tone: Tone;
}

type Notify = (text: string, tone?: Tone) => void;

const ToastContext = createContext<Notify>(() => {});

const DISPLAY_MS = 5000;

/** Confirms the result of an action without interrupting the user. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const notify = useCallback<Notify>((text, tone = 'ok') => {
    const id = nextId.current++;
    setMessages((current) => [...current, { id, text, tone }]);
    setTimeout(() => {
      setMessages((current) => current.filter((message) => message.id !== id));
    }, DISPLAY_MS);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex flex-col items-center gap-2"
      >
        {messages.map((message) => (
          <p
            key={message.id}
            className={`flex animate-pop items-center gap-2 rounded-xl border bg-sheet-raised py-2.5 pr-4 pl-3 text-sm font-medium shadow-pop ${
              message.tone === 'ok' ? 'border-ok/60' : 'border-fail/60'
            }`}
          >
            {message.tone === 'ok' ? (
              <CircleCheck className={`size-4.5 shrink-0 ${TONES.ok.ink}`} aria-hidden />
            ) : (
              <CircleAlert className={`size-4.5 shrink-0 ${TONES.fail.ink}`} aria-hidden />
            )}
            {message.text}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
