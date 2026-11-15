import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ToastProvider } from '../components/Toast';
import { useLiveRefresh } from '../lib/events';
import { Brand } from './Brand';
import { NAV_ITEMS, PLANNED_AREAS } from './navigation';
import { StatusStrip } from './StatusStrip';

const plannedPhase = (path: string) => PLANNED_AREAS.find((area) => area.path === path)?.phase;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
        const phase = plannedPhase(to);
        return (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-sheet-raised font-semibold text-chalk'
                    : 'text-dim hover:bg-sheet hover:text-chalk'
                }`
              }
            >
              <Icon className="size-4.5 shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              {phase !== undefined && (
                <span className="text-xs text-dim" title={`Planejado para a Fase ${phase}`}>
                  Fase {phase}
                </span>
              )}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

/** Slide-over navigation for narrow screens. */
function MobileMenu({ onClose }: { onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 lg:hidden">
      <div className="absolute inset-0 bg-ink/70" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 border-r border-line bg-ink p-4"
      >
        <div className="flex items-center justify-between">
          <Brand />
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="grid size-10 place-items-center rounded-md text-dim hover:bg-sheet hover:text-chalk"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <nav aria-label="Principal">
          <NavList onNavigate={onClose} />
        </nav>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  useLiveRefresh();

  // Each page starts at the top, as a full navigation would.
  useEffect(() => {
    main.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-line p-4 lg:flex">
        <Brand />
        <nav aria-label="Principal">
          <NavList />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b border-line bg-ink/95 px-4 py-2 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            className="grid size-10 shrink-0 place-items-center rounded-md text-dim hover:bg-sheet hover:text-chalk lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <StatusStrip />
        </header>

        <main ref={main} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <ToastProvider>
            <Outlet />
          </ToastProvider>
        </main>
      </div>

      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
