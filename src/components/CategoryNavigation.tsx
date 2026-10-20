'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Grid, ShoppingBag,
} from 'lucide-react';
import { CATEGORIES, categoryHref } from '@/lib/categories';

export function CategoryNavigation() {
  const [openCategory, setOpenCategory] = useState<number | null>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const desktopTriggers = useRef<(HTMLButtonElement | null)[]>([]);
  const mobileTriggers = useRef<(HTMLButtonElement | null)[]>([]);
  const desktopPanels = useRef<(HTMLDivElement | null)[]>([]);
  const mobilePanels = useRef<(HTMLDivElement | null)[]>([]);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const restoringFocus = useRef(false);
  const pointerFocus = useRef(false);
  const openSource = useRef<'hover' | 'focus' | 'click' | null>(null);
  const pendingFocus = useRef<'first' | 'last' | null>(null);
  const id = useId();
  const pathname = usePathname();
  const category = openCategory === null ? null : CATEGORIES[openCategory];
  const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:!outline-offset-[-3px] focus-visible:outline-emerald-400';

  const focusLink = useCallback((index: number, position: 'first' | 'last') => {
    const panel = window.matchMedia('(min-width: 768px)').matches
      ? desktopPanels.current[index]
      : mobilePanels.current[index];
    const links = panel?.querySelectorAll<HTMLAnchorElement>('a');
    links?.[position === 'first' ? 0 : links.length - 1]?.focus();
  }, []);

  useEffect(() => {
    setOpenCategory(null);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const close = () => setOpenCategory(null);
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, []);

  useEffect(() => {
    if (openCategory === null) return;
    if (pendingFocus.current) {
      focusLink(openCategory, pendingFocus.current);
      pendingFocus.current = null;
    }
    const closeOutside = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) {
        setOpenCategory(null);
      }
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      restoringFocus.current = true;
      lastTrigger.current?.focus({ preventScroll: true });
      restoringFocus.current = false;
      setOpenCategory(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', escape);
    };
  }, [openCategory, focusLink]);

  const handleTriggerKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    mobile: boolean,
  ) => {
    const triggers = mobile ? mobileTriggers : desktopTriggers;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' ||
        event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End'
        ? CATEGORIES.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + CATEGORIES.length) % CATEGORIES.length;
      const trigger = triggers.current[next];
      trigger?.focus({ preventScroll: true });
      if (!mobile) {
        trigger?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        lastTrigger.current = trigger;
        setOpenCategory(next);
      }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' ||
        (event.key === 'Tab' && !event.shiftKey && openCategory === index && !mobile)) {
      event.preventDefault();
      const position = event.key === 'ArrowUp' ? 'last' : 'first';
      lastTrigger.current = event.currentTarget;
      if (openCategory === index) focusLink(index, position);
      else {
        pendingFocus.current = position;
        setOpenCategory(index);
      }
    }
  };

  const handlePanelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a'));
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === 'Tab' && event.shiftKey && current === 0) {
      event.preventDefault();
      lastTrigger.current?.focus({ preventScroll: true });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      links[(current + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
    }
  };

  const renderLinks = (index: number) => {
    const current = CATEGORIES[index];
    const midpoint = Math.ceil(current.subcategories.length / 2);
    const groups = [
      current.subcategories.slice(0, midpoint),
      current.subcategories.slice(midpoint),
    ];
    return (
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <ShoppingBag className="mb-3 text-emerald-400" size={28} aria-hidden="true" />
          <h2 className="mb-3 text-lg font-bold text-white">{current.label}</h2>
          <Link
            href={categoryHref(current.id)}
            onClick={() => setOpenCategory(null)}
            className={`inline-flex items-center gap-2 rounded p-1 text-sm font-semibold text-emerald-400 hover:underline ${focusClass}`}
          >
            All {current.label}<ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        {groups.map((group, groupIndex) => group.length > 0 && (
          <section key={groupIndex}>
            <h3 className="mb-2 flex items-center gap-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-400">
              <Grid size={16} aria-hidden="true" />
              {groupIndex === 0 ? 'Shop by subcategory' : 'More to explore'}
            </h3>
            <ul>
              {group.map((subcategory) => (
                <li key={subcategory.id}>
                  <Link
                    href={categoryHref(current.id, subcategory.id)}
                    onClick={() => setOpenCategory(null)}
                    className={`block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-emerald-400 ${focusClass}`}
                  >
                    {subcategory.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  };

  const renderTrigger = (index: number, mobile: boolean) => {
    const current = CATEGORIES[index];
    const expanded = openCategory === index;
    const prefix = `${id}-${mobile ? 'mobile' : 'desktop'}-${index}`;
    return (
      <button
        ref={(element) => {
          (mobile ? mobileTriggers : desktopTriggers).current[index] = element;
        }}
        id={`${prefix}-trigger`}
        type="button"
        aria-expanded={expanded}
        aria-controls={`${prefix}-panel`}
        onPointerDown={() => { pointerFocus.current = true; }}
        onPointerUp={() => { pointerFocus.current = false; }}
        onPointerCancel={() => { pointerFocus.current = false; }}
        onClick={(event) => {
          lastTrigger.current = event.currentTarget;
          // A pointer's first click confirms a hover/focus disclosure; subsequent clicks toggle it.
          const confirmed = event.detail > 0 && openSource.current !== 'click';
          setOpenCategory((open) => open === index && !confirmed ? null : index);
          openSource.current = 'click';
        }}
        onFocus={(event) => {
          if (!mobile && !restoringFocus.current && !pointerFocus.current &&
              event.currentTarget.matches(':focus-visible')) {
            lastTrigger.current = event.currentTarget;
            openSource.current = 'focus';
            setOpenCategory(index);
          }
        }}
        onKeyDown={(event) => handleTriggerKey(event, index, mobile)}
        className={`flex w-full items-center justify-between gap-2 border-b-2 px-4 py-4 text-left text-sm font-semibold ${focusClass} ${
          expanded ? 'border-emerald-400 bg-slate-800 text-emerald-400' : 'border-transparent text-slate-300 hover:bg-slate-800 hover:text-emerald-400'
        }`}
      >
        {current.label}
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </button>
    );
  };

  return (
    <>
      {category && (
        <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/25" />
      )}
      <nav
        ref={navigationRef}
        aria-label="Shop by category"
        className="site-nav relative z-40 border-b border-slate-800 bg-slate-950 text-white shadow-sm"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenCategory(null);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse' &&
              window.matchMedia('(min-width: 768px)').matches &&
              !event.currentTarget.contains(document.activeElement)) setOpenCategory(null);
        }}
      >
        <div className="mx-auto hidden max-w-7xl items-center px-2 md:flex lg:px-6">
          <button
            type="button"
            aria-label="Scroll categories left"
            onClick={() => scrollRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
            className={`shrink-0 rounded-lg p-2 text-emerald-400 hover:bg-slate-800 ${focusClass}`}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
            <ul className="flex w-max">
              {CATEGORIES.map((current, index) => (
                <li
                  key={current.id}
                  className="shrink-0"
                  onPointerEnter={(event) => {
                    if (event.pointerType === 'mouse' &&
                        !desktopPanels.current.some((panel) => panel?.contains(document.activeElement))) {
                      lastTrigger.current = desktopTriggers.current[index];
                      if (openCategory !== index) openSource.current = 'hover';
                      setOpenCategory(index);
                    }
                  }}
                >
                  {renderTrigger(index, false)}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            aria-label="Scroll categories right"
            onClick={() => scrollRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
            className={`shrink-0 rounded-lg p-2 text-emerald-400 hover:bg-slate-800 ${focusClass}`}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        {/* Keep the dropdown outside the horizontal scroller so it cannot be clipped. */}
        {CATEGORIES.map((current, index) => (
          <div
            key={current.id}
            ref={(element) => { desktopPanels.current[index] = element; }}
            id={`${id}-desktop-${index}-panel`}
            aria-labelledby={`${id}-desktop-${index}-trigger`}
            hidden={openCategory !== index}
            onKeyDown={handlePanelKey}
            className="absolute inset-x-0 top-full mx-auto hidden max-h-[65dvh] max-w-7xl overflow-y-auto rounded-b-xl border border-slate-700 bg-slate-900 p-6 shadow-xl shadow-black/20 md:block [&[hidden]]:hidden"
          >
            {openCategory === index && renderLinks(index)}
          </div>
        ))}
        <div className="md:hidden">
          <p className="px-4 pt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Shop by category</p>
          <ul>
            {CATEGORIES.map((current, index) => (
              <li key={current.id} className="border-b border-slate-800 last:border-0">
                {renderTrigger(index, true)}
                <div
                  ref={(element) => { mobilePanels.current[index] = element; }}
                  id={`${id}-mobile-${index}-panel`}
                  aria-labelledby={`${id}-mobile-${index}-trigger`}
                  hidden={openCategory !== index}
                  onKeyDown={handlePanelKey}
                  className="bg-slate-900 p-4"
                >
                  {openCategory === index && renderLinks(index)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </>
  );
}
