'use client';

import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  icon,
  appearance = 'light',
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  appearance?: 'light' | 'dark';
}) {
  const dark = appearance === 'dark';
  return (
    <div className={`text-center py-14 px-4 rounded-2xl border-dashed ${dark ? 'bg-slate-900 border border-slate-700' : 'bg-white border-2 border-brand-200'}`}>
      {icon && (
        <div className={`mx-auto mb-4 w-20 h-20 rounded-full flex items-center justify-center ${dark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-brand-100 text-brand-600'}`} aria-hidden="true">
          {icon}
        </div>
      )}
      <p className={`text-lg font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{title}</p>
      <p className={`mt-2 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{description}</p>
    </div>
  );
}
