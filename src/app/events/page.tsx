import Link from 'next/link';
export default function Events() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Yard Sale Events</h1>
        </div>
        <Link
          href="/events/new"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
        >
          Create Event
        </Link>
      </div>
      <p role="status" className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-700">
        Public event browsing is temporarily unavailable while we improve privacy protections.
      </p>
    </div>
  );
}
