export type EventLocationVisibility = 'general' | 'exact';

export function getEventDateRange(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): { startDate: Date; endDate: Date } {
  if (!startDate || !startTime || !endDate || !endTime) {
    throw new Error('Please provide both event dates and times.');
  }

  const start = new Date(`${startDate}T${startTime}`);
  const end = new Date(`${endDate}T${endTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Please provide valid event dates and times.');
  }
  if (end <= start) {
    throw new Error('The event end time must be later than its start time.');
  }

  return { startDate: start, endDate: end };
}

export interface PublicEventInput {
  userId: string;
  title: string;
  description: string;
  location: string;
  locationVisibility: EventLocationVisibility;
  address: string;
  startDate: Date;
  endDate: Date;
  photoURL: string | null;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
}

export function buildPublicEventData(input: PublicEventInput) {
  const event = {
    userId: input.userId,
    title: input.title.trim(),
    description: input.description.trim(),
    location: input.location.trim(),
    locationVisibility: input.locationVisibility,
    startDate: input.startDate,
    endDate: input.endDate,
    photoURL: input.photoURL,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    itemCount: input.itemCount,
  };

  if (input.locationVisibility === 'exact') {
    const address = input.address.trim();
    if (!address) throw new Error('Enter the exact sale address to publish it.');
    return { ...event, address };
  }

  return event;
}

export function buildPrivateEventData(userId: string, address: string) {
  const normalizedAddress = address.trim();
  return normalizedAddress ? { userId, address: normalizedAddress } : null;
}
