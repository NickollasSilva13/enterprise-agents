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
    <div className="fixed inset-0 z-30 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/75" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-line-strong bg-sheet p-5"
      >
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div>
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
