import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/*
 * One main action per view (primary); the rest are secondary, which reads as a
 * quiet raised surface; ghost is for actions inside a list or a toolbar.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.4)] hover:bg-accent-strong',
  secondary:
    'border border-line bg-sheet-raised text-chalk shadow-lift hover:border-line-strong hover:bg-line',
  ghost: 'text-dim hover:bg-sheet-raised hover:text-chalk',
  danger: 'bg-fail text-ink hover:bg-chalk',
};

const BASE =
  'inline-flex min-h-10 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50';

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
      className={`grid size-10 shrink-0 place-items-center rounded-lg text-dim transition-colors hover:bg-sheet-raised hover:text-chalk active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
