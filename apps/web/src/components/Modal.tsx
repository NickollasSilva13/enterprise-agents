import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Button } from './Button';

interface ModalProps {
  title: string;
  children: ReactNode;
  /** Buttons, rendered at the bottom right. */
  footer: ReactNode;
  onClose: () => void;
}

/**
 * Dialog over the page. Focus moves into it when it opens and returns to
 * where it was when it closes; Escape and a click outside close it.
 */
export function Modal({ title, children, footer, onClose }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    const first = panel.current?.querySelector<HTMLElement>(
      '[data-autofocus], input, textarea, select, button',
    );
    first?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 grid grid-cols-1 items-end justify-items-center sm:place-items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade bg-ink/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* On a phone the dialog rises from the bottom, within reach of the thumb. */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92dvh] w-full max-w-md animate-pop flex-col overflow-hidden rounded-t-2xl border border-line bg-sheet shadow-pop sm:max-h-[85dvh] sm:rounded-2xl"
      >
        <div className="overflow-y-auto px-5 pt-5 pb-5">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <div className="mt-3">{children}</div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  /** Names the action, e.g. "Excluir agente". */
  confirmLabel: string;
  busy?: boolean;
  /** Shown when the action failed, so the user can retry or cancel. */
  error?: string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before an action that cannot be undone. Focus starts on "Cancelar". */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} data-autofocus>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-dim">{children}</div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-fail">
          {error}
        </p>
      )}
    </Modal>
  );
}
