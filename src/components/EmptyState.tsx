'use client';

import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <div className="text-center py-14 px-4 bg-white rounded-2xl border-2 border-dashed border-brand-200">
      {icon && (
        <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-lg font-bold text-gray-900">{title}</p>
      <p className="text-gray-600 mt-2">{description}</p>
    </div>
  );
}
