import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

const CONTROL =
  'w-full rounded-md border bg-ink px-3 py-2 text-chalk placeholder:text-dim disabled:cursor-not-allowed disabled:opacity-60';

const border = (invalid: boolean) => (invalid ? 'border-fail' : 'border-line-strong');

interface FieldProps {
  label: string;
  /** Help shown under the control. */
  hint?: ReactNode;
  /** Problem with the current value; replaces the hint. */
  error?: string | undefined;
}

interface FieldShellProps extends FieldProps {
  id: string;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-note`} className="mt-1 text-sm text-fail">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-note`} className="mt-1 text-sm text-dim">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const describedBy = (id: string, props: FieldProps) =>
  props.error || props.hint ? `${id}-note` : undefined;

type TextFieldProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>;

export function TextField({ label, hint, error, className = '', ...input }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { label, hint, error })}
        className={`${CONTROL} ${border(Boolean(error))} ${className}`}
        {...input}
      />
    </FieldShell>
  );
}

type TextAreaFieldProps = FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>;

export function TextAreaField({
  label,
  hint,
  error,
  className = '',
  ...textarea
}: TextAreaFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { label, hint, error })}
        className={`${CONTROL} ${border(Boolean(error))} ${className}`}
        {...textarea}
      />
    </FieldShell>
  );
}

type SelectFieldProps = FieldProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>;

export function SelectField({
  label,
  hint,
  error,
  className = '',
  children,
  ...select
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { label, hint, error })}
        className={`${CONTROL} ${border(Boolean(error))} ${className}`}
        {...select}
      >
        {children}
      </select>
    </FieldShell>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Leitor ativo". */
  label: string;
  /** Text shown beside the switch; defaults to none. */
  children?: ReactNode;
  disabled?: boolean;
}

/** On/off control that takes effect immediately. */
export function Switch({ checked, onChange, label, children, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        aria-hidden
        className={`flex h-6 w-10 shrink-0 items-center rounded-full border px-0.5 transition-colors ${
          checked ? 'justify-end border-ok bg-ok/25' : 'justify-start border-line-strong bg-ink'
        }`}
      >
        <span className={`size-4.5 rounded-full ${checked ? 'bg-ok' : 'bg-idle'}`} />
      </span>
      {children}
    </button>
  );
}
