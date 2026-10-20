'use client';

export function EmptyState({ title, description, appearance = 'light' }: { title: string; description: string; appearance?: 'light' | 'dark' }) {
  const dark = appearance === 'dark';
  return (
    <div className="text-center py-12">
      <p className={`text-lg font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>{title}</p>
      <p className={`mt-2 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{description}</p>
    </div>
  );
}
