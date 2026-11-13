import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

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
            className={`rounded-md border bg-sheet-raised px-4 py-2 text-sm shadow-lg ${
              message.tone === 'ok' ? 'border-ok' : 'border-fail'
            }`}
          >
            {message.text}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
