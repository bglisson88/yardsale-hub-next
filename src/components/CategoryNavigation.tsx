'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { CATEGORIES, SUBCATEGORIES } from '@/lib/constants';

export function CategoryNavigation() {
  const [openCategory, setOpenCategory] = useState<number | null>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingFocus = useRef<'first' | 'last' | null>(null);
  const restoringFocus = useRef(false);
  const id = useId();

  useEffect(() => {
    if (openCategory === null) return;

    const closeOutside = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) {
        setOpenCategory(null);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        restoringFocus.current = true;
        triggerRefs.current[openCategory]?.focus();
        restoringFocus.current = false;
        setOpenCategory(null);
      }
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openCategory]);

  useEffect(() => {
    if (openCategory !== null && pendingFocus.current) {
      const links = panelRefs.current[openCategory]?.querySelectorAll<HTMLAnchorElement>('a');
      const index = pendingFocus.current === 'first' ? 0 : (links?.length ?? 1) - 1;
      links?.[index]?.focus();
      pendingFocus.current = null;
    }
  }, [openCategory]);

  const handleTriggerKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + CATEGORIES.length) % CATEGORIES.length;
      triggerRefs.current[next]?.focus();
      setOpenCategory(next);
    } else if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      const position = event.key === 'ArrowUp' ? 'last' : 'first';
      if (openCategory === index) {
        const links = panelRefs.current[index]?.querySelectorAll<HTMLAnchorElement>('a');
        links?.[position === 'first' ? 0 : links.length - 1]?.focus();
      } else {
        pendingFocus.current = position;
        setOpenCategory(index);
      }
    }
  };

  const handlePanelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a'));
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    event.preventDefault();
    links[(current + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
  };

  const linkClass = 'block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-emerald-300 motion-safe:transition-colors';

  return (
    <nav
      ref={navigationRef}
      aria-label="Shop by category"
      className="relative z-[1050] border-y border-slate-800 bg-slate-950 text-slate-300"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpenCategory(null);
        }
      }}
      onPointerLeave={() => {
        if (!navigationRef.current?.contains(document.activeElement)) setOpenCategory(null);
      }}
    >
      <ul className="relative mx-auto max-w-7xl px-4 sm:px-6 md:flex md:justify-between lg:px-8">
        {CATEGORIES.map((category, index) => {
          const expanded = openCategory === index;
          const triggerId = `${id}-trigger-${index}`;
          const panelId = `${id}-panel-${index}`;
          const subcategories = SUBCATEGORIES[category] ?? [];
          const midpoint = Math.ceil(subcategories.length / 2);
          const groups = [subcategories.slice(0, midpoint), subcategories.slice(midpoint)];
          const categoryHref = `/items?category=${encodeURIComponent(category)}`;

          return (
            <li
              key={category}
              className="border-b border-slate-800 last:border-b-0 md:border-0"
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse' && window.matchMedia('(min-width: 768px)').matches) {
                  if (!panelRefs.current.some((panel) => panel?.contains(document.activeElement))) {
                    setOpenCategory(index);
                  }
                }
              }}
            >
              <button
                ref={(element) => { triggerRefs.current[index] = element; }}
                id={triggerId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-haspopup="menu"
                onClick={() => setOpenCategory(expanded ? null : index)}
                onFocus={(event) => {
                  if (!restoringFocus.current && event.currentTarget.matches(':focus-visible') && window.matchMedia('(min-width: 768px)').matches) {
                    setOpenCategory(index);
                  }
                }}
                onKeyDown={(event) => handleTriggerKey(event, index)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-sm font-semibold hover:bg-slate-900 hover:text-emerald-300 motion-safe:transition-colors md:w-auto md:gap-1 md:px-2 md:text-xs lg:gap-2 lg:px-3 lg:text-sm ${expanded ? 'bg-slate-900 text-emerald-300' : ''}`}
              >
                {category}
                <ChevronDown size={14} aria-hidden="true" className={expanded ? 'rotate-180' : ''} />
              </button>
              <div
                ref={(element) => { panelRefs.current[index] = element; }}
                id={panelId}
                role="menu"
                aria-labelledby={triggerId}
                hidden={!expanded}
                onKeyDown={handlePanelKey}
                className="max-h-[60dvh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl shadow-black/30 md:absolute md:inset-x-6 md:top-full md:p-6 lg:inset-x-8"
              >
                <div role="none" className="grid gap-4 sm:grid-cols-3">
                  <div role="none">
                    <Link href={categoryHref} role="menuitem" tabIndex={-1} onClick={() => setOpenCategory(null)} className={`${linkClass} font-bold text-emerald-300`}>
                      All {category}
                    </Link>
                  </div>
                  {groups.map((group, groupIndex) => (
                    <div key={groupIndex} role="group" aria-label={groupIndex === 0 ? `Shop ${category}` : `More ${category}`}>
                      <p aria-hidden="true" className="px-3 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                        {groupIndex === 0 ? 'Shop by subcategory' : 'More to explore'}
                      </p>
                      {group.map((subcategory) => (
                        <Link
                          key={subcategory}
                          href={`${categoryHref}&subcategory=${encodeURIComponent(subcategory)}`}
                          role="menuitem"
                          tabIndex={-1}
                          onClick={() => setOpenCategory(null)}
                          className={linkClass}
                        >
                          {subcategory}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
