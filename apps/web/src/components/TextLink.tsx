import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** How a link inside text looks (Phase 31): screens never spell the colour out. */
export const LINK = 'text-info underline underline-offset-4';

/** The "back to…" link above a page title. */
export const BACK_LINK = `mb-3 inline-flex items-center gap-1 text-sm ${LINK}`;

interface TextLinkProps {
  to: string;
  children: ReactNode;
  className?: string;
}

/** A link inside running text, to another screen of the app. */
export function TextLink({ to, children, className = '' }: TextLinkProps) {
  return (
    <Link to={to} className={`${LINK} ${className}`}>
      {children}
    </Link>
  );
}
