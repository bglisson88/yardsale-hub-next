import EventForm from '@/components/EventForm';

export default function EditEventPage({ params }: { params: { id: string } }) {
  return <EventForm key={params.id} eventId={params.id} />;
}
