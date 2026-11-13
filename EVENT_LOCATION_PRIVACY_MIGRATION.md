# Event Location Privacy Rollout

The event UI, `firestore.rules`, and `firebase.json` in this change are not
production-ready until existing event documents have been reviewed and migrated.
Firestore cannot filter public query results using per-document rules, so
`yardSaleEvents` list access is public for marketplace browsing. Any private
address or precise coordinates left in a legacy event document would therefore
remain publicly readable through collection queries. Direct document reads
reject unclassified records unless the caller owns the event.

No live data is changed by this document or by the code change.

## Required pre-deployment migration

Run this process in a verified backup and staging project first. Use a
trusted, temporary Admin SDK script kept outside the repository; never put
service-account credentials in source control.

For each document in `yardSaleEvents`:

1. Copy a non-empty existing `address` into `eventPrivate/{eventId}` with
   `{ userId: event.userId, address }`. Preserve an already-existing private
   address unless an operator has verified it should be replaced.
2. Set `locationVisibility` to `general`. Do not infer consent to publish an
   exact location from a previously public address.
3. Delete `address`, `latitude`, and `longitude` from the public event record.
   Existing coordinates may be placeholders and must not be copied as exact
   coordinates.
4. Preserve all unrelated event fields and values, including dates, photo URL,
   owner, and `itemCount`.
5. If an event has no address, do not create an empty `eventPrivate` record.

Before any rule deployment, verify every event has a valid visibility
classification and that no general-visibility event contains address or
coordinate fields. Verify private records are keyed to the matching owner, and
run the public upcoming-events and owner dashboard queries against the migrated
dataset.

The app's current profile of event dates and item counts is unchanged by this
migration. Review malformed or incomplete legacy records separately; do not
silently invent required values.

## Coordinated rollout

The current app writes legacy event documents and cannot safely coexist with
the new rules. The new app uses `eventPrivate` batches that old rules may reject,
while the new rules reject old clients that omit `locationVisibility`. Schedule
a coordinated maintenance window:

1. Back up and migrate existing event documents.
2. Pause old event creation/edit traffic during the transition.
3. Publish the reviewed Firestore rules.
4. Release the app version with the event privacy model.
5. Verify general and exact event creation/editing, public browsing, private
   owner reads, and dashboard counts in production.
6. Resume event writes after all checks pass.

Do not publish the rules alone or release this UI against the old rules. No
Firestore rules or live data were deployed or migrated as part of this change.
