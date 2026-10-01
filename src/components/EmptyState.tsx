'use client';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-lg font-semibold text-gray-900">{title}</p>
      <p className="text-gray-600 mt-2">{description}</p>
    </div>
  );
}
