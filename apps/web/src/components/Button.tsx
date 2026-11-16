import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong',
  secondary: 'border border-line-strong text-chalk hover:bg-sheet-raised',
  ghost: 'text-dim hover:bg-sheet-raised hover:text-chalk',
  danger: 'bg-fail text-ink hover:bg-chalk',
};

const BASE =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

/** Classes of a button, for links that should look like one. */
export const buttonClass = (variant: Variant = 'secondary') => `${BASE} ${VARIANTS[variant]}`;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'secondary', className = '', type, ...props }: ButtonProps) {
  return (
    <button type={type ?? 'button'} className={`${buttonClass(variant)} ${className}`} {...props} />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also the tooltip. */
  label: string;
}

/** Square button that shows only an icon. */
export function IconButton({ label, className = '', type, ...props }: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={`grid size-10 shrink-0 place-items-center rounded-md text-dim transition-colors hover:bg-sheet-raised hover:text-chalk disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
