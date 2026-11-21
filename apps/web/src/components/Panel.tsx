import { type ReactNode, useId } from 'react';

interface PanelProps {
  title: string;
  /** Short text on the right of the title, e.g. a count. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A titled region of a page. */
export function Panel({ title, aside, children, className = '' }: PanelProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={`min-w-0 rounded-xl border border-line bg-sheet shadow-lift ${className}`}
    >
      <header className="flex min-h-12 items-center justify-between gap-4 border-b border-line px-4 py-2.5">
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {aside && <span className="text-sm text-dim">{aside}</span>}
      </header>
      {children}
    </section>
  );
}
