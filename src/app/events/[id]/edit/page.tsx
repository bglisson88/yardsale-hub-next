import EventForm from '@/components/EventForm';

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventForm key={id} eventId={id} />;
}
