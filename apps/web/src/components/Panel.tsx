import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  /** Short text on the right of the title, e.g. a count. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A titled region of a page. */
export function Panel({ title, aside, children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-lg border border-line bg-sheet ${className}`}>
      <header className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside && <span className="text-sm text-dim">{aside}</span>}
      </header>
      {children}
    </section>
  );
}
