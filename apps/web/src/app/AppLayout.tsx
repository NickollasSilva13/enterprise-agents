import { CircleHelp, Menu, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { ToastProvider } from '../components/Toast';
import { useLiveRefresh } from '../lib/events';
import { useAttention } from '../lib/frame-queries';
import { Bell } from './Bell';
import { Brand } from './Brand';
import { HELP_ITEM, isCurrent, NAV_GROUPS, type NavItem, PLANNED_AREAS } from './navigation';
import { SearchDialog } from './SearchDialog';
import { StatusStrip } from './StatusStrip';
import { YouCard } from './YouCard';
import { TONES } from '../lib/tone';

const plannedPhase = (path: string) => PLANNED_AREAS.find((area) => area.path === path)?.phase;

/*
 * The current entry is a raised row with a violet bar and icon: clear where
 * you are, without a block of colour competing with the page's own action.
 */
const NAV_LINK =
  'relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors';
const NAV_CURRENT =
  'bg-sheet-raised font-semibold text-chalk before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-accent';
const NAV_REST = 'text-dim hover:bg-sheet-raised/60 hover:text-chalk';

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { counts } = useAttention();
  const { to, label, icon: Icon } = item;
  const current = isCurrent(item, pathname);
  const phase = plannedPhase(to);
  const count = item.counter ? counts[item.counter] : 0;
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={current ? 'page' : undefined}
      className={`${NAV_LINK} ${current ? NAV_CURRENT : NAV_REST}`}
    >
      <Icon className={`size-4.5 shrink-0 ${current ? 'text-glow' : ''}`} aria-hidden />
      <span className="flex-1">{label}</span>
      {count > 0 && (
        <span
          className={`grid min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold ${TONES.wait.tint} ${TONES.wait.text}`}
        >
          {count}
          <span className="sr-only"> esperando você</span>
        </span>
      )}
      {phase !== undefined && (
        <span className="text-xs" title={`Planejado para a Fase ${phase}`}>
          Fase {phase}
        </span>
      )}
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const groupId = useId();
  return (
    <div className="space-y-5">
      {NAV_GROUPS.map((group, index) => {
        const labelId = `${groupId}-${index}`;
        return (
          <div key={group.label ?? index}>
            {group.label && (
              <p id={labelId} className="mb-1 px-3 text-xs font-medium text-dim">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5" aria-labelledby={group.label ? labelId : undefined}>
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavItemLink item={item} {...(onNavigate ? { onNavigate } : {})} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Help and the user's card, at the foot of the menu (D1, D5). */
function MenuFoot({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <div className="mt-auto space-y-2">
      <Link
        to={HELP_ITEM.to}
        onClick={onNavigate}
        aria-current={pathname === HELP_ITEM.to ? 'page' : undefined}
        className={`${NAV_LINK} ${pathname === HELP_ITEM.to ? NAV_CURRENT : NAV_REST}`}
      >
        <CircleHelp className="size-4.5 shrink-0" aria-hidden />
        <span className="flex-1">{HELP_ITEM.label}</span>
      </Link>
      <YouCard onNavigate={onNavigate} />
    </div>
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
      <div
        className="absolute inset-0 animate-fade bg-ink/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-slide-in flex-col gap-6 overflow-y-auto border-r border-line bg-sheet px-3 py-4 shadow-pop"
      >
        <div className="flex items-center justify-between">
          <Brand />
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="grid size-10 place-items-center rounded-md text-dim hover:bg-sheet-raised hover:text-chalk"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <nav aria-label="Principal">
          <NavList onNavigate={onClose} />
        </nav>
        <MenuFoot onNavigate={onClose} />
      </div>
    </div>
  );
}

/** Opens the search on Ctrl K (⌘K on a Mac), from anywhere. */
function useSearchShortcut(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  useLiveRefresh();
  useSearchShortcut(setSearchOpen);

  // Each page starts at the top, as a full navigation would.
  useEffect(() => {
    main.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-line bg-sheet px-3 py-4 lg:flex">
        <span className="px-2 py-1">
          <Brand />
        </span>
        <nav aria-label="Principal">
          <NavList />
        </nav>
        <MenuFoot />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-line bg-ink/85 px-2 py-2 backdrop-blur-md sm:gap-3 sm:px-4 lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            className="grid size-10 shrink-0 place-items-center rounded-md text-dim hover:bg-sheet-raised hover:text-chalk lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <StatusStrip />
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-keyshortcuts="Control+K Meta+K"
              className="flex size-10 items-center justify-center gap-2 rounded-lg text-dim transition-colors hover:bg-sheet-raised hover:text-chalk md:w-64 md:justify-start md:border md:border-line md:bg-sheet md:px-3 md:hover:border-line-strong"
            >
              <Search className="size-4.5 shrink-0" aria-hidden />
              {/* The name read aloud is the text on screen (WCAG 2.5.3): on a phone, only the word. */}
              <span className="sr-only flex-1 text-left text-sm md:not-sr-only">Buscar…</span>
              <kbd className="hidden rounded-md border border-line bg-sheet-raised px-1.5 font-sans text-xs md:inline">
                Ctrl K
              </kbd>
            </button>
            <Bell />
          </div>
        </header>

        <main
          ref={main}
          className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-12 sm:px-6 lg:px-10 lg:pt-8"
        >
          <ToastProvider>
            <Outlet />
          </ToastProvider>
        </main>
      </div>

      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
