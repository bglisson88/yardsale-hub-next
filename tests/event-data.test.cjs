const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildPrivateEventData,
  buildPublicEventData,
  getEventDateRange,
} = require(process.env.CATEGORY_TEST_BUILD + '/event-data.js');

const dates = {
  startDate: new Date('2026-11-10T09:00:00'),
  endDate: new Date('2026-11-10T12:00:00'),
};

function eventInput(overrides = {}) {
  return {
    userId: 'organizer',
    title: 'Neighborhood Sale',
    description: 'Saturday sale',
    location: 'Nederland',
    locationId: 'nederland-tx',
    locationVisibility: 'general',
    address: '',
    ...dates,
    photoURL: null,
    createdAt: new Date('2026-11-01T10:00:00'),
    updatedAt: new Date('2026-11-01T10:00:00'),
    itemCount: 0,
    ...overrides,
  };
}

test('general event documents exclude street addresses and precise coordinates', () => {
  const data = buildPublicEventData(eventInput({
    address: '12 Main Street',
  }));
  assert.equal(data.locationVisibility, 'general');
  assert.equal(data.location, 'Nederland');
  assert.equal(data.locationId, 'nederland-tx');
  assert.equal('address' in data, false);
  assert.equal('latitude' in data, false);
  assert.equal('longitude' in data, false);
  assert.deepEqual(buildPrivateEventData('organizer', ' 12 Main Street '), {
    userId: 'organizer',
    address: '12 Main Street',
  });
});

test('general event without a private address is valid', () => {
  assert.equal(buildPrivateEventData('organizer', '  '), null);
  assert.equal(buildPublicEventData(eventInput()).locationVisibility, 'general');
});

test('exact event keeps its confirmed address private', () => {
  const input = eventInput({
    locationVisibility: 'exact',
    address: ' 12 Main Street ',
  });
  const data = buildPublicEventData(input);

  assert.equal(data.locationVisibility, 'exact');
  assert.equal(data.location, 'Nederland');
  assert.equal('address' in data, false);
  assert.equal('latitude' in data, false);
  assert.equal('longitude' in data, false);

  assert.deepEqual(buildPrivateEventData('organizer', input.address), {
    userId: 'organizer',
    address: '12 Main Street',
  });
});

test('exact event requires a non-empty address', () => {
  assert.throws(
    () => buildPublicEventData(eventInput({ locationVisibility: 'exact' })),
    /exact sale address/,
  );
});

test('event end must be later than start and date/time values must be valid', () => {
  assert.deepEqual(
    getEventDateRange('2026-11-10', '09:00', '2026-11-10', '12:00'),
    dates,
  );
  assert.throws(
    () => getEventDateRange('2026-11-10', '12:00', '2026-11-10', '09:00'),
    /end time must be later/,
  );
  assert.throws(
    () => getEventDateRange('', '09:00', '2026-11-10', '12:00'),
    /provide both event dates and times/,
  );
  assert.throws(
    () => getEventDateRange('not-a-date', '09:00', '2026-11-10', '12:00'),
    /valid event dates and times/,
  );
});
