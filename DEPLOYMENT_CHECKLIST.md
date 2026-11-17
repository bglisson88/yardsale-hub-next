# PR #35 Deployment Readiness

This checklist documents the approved production-readiness work. Completing or
checking an item here is not authorization to change production. Every
production action requires separate authorization.

## Implementation and local validation

- [ ] Obtain the complete currently published production Firestore rules text.
      Do not derive production rules from `firestore.rules` or
      `firestore.production-backup.rules`.
- [ ] Derive production rules from that exact text, preserving owner-only
      `users/{uid}` access, sanitized public event browsing, and unrelated
      permissions.
- [ ] Review all overlapping `match` grants; Firestore grants are additive.
- [ ] Run `npm run type-check`, `npm run build`, `npm run test`,
      `npm run build:functions`, `npm run test:functions`, and `npm run test:rules`.
- [ ] Verify the consent, rate-limit, legacy-general-event, and negative rules
      tests in the emulators.
- [ ] Verify the public event projection Functions and Rules tests, including
      malformed-source omission, stale-trigger reconciliation, and owner-only
      source listing.
- [ ] Verify the production runtime configuration is limited to
      `yardsale-hub-93c49`, `us-south1`, the reviewed
      `yardsale-hub-prod-backend` identity, and the approved limits.

The production rules integration is blocked until the complete published rules
source is available. The tracked `firestore.rules` is staging-only. The
historical production backup is not authoritative. No production rules file or
production Firebase CLI configuration is created by this implementation.

## General-location catalog

Only reviewed, trusted administrators may provision catalog and alias data;
ordinary clients cannot write either. `generalLocations/{locationId}` uses a
lowercase ASCII ID matching `[a-z0-9][a-z0-9_-]{0,63}` and exactly these fields:
`kind` (`city`, `state`, `postalCode`, or `area`), `displayName` (nonempty,
at most 200 characters), `active` (boolean), `approvedAliases` (list of
reviewed strings), `countryCode` (two uppercase letters), and `regionCode`
(string, at most 32 characters). A trusted review must establish that every
display name and alias is genuinely a broad location, never a street address
or precise location. Field types and kind alone do not prove this. Use stable
unique display names including region/country where needed to disambiguate.
Do not import profile locations automatically.

The temporary `generalLocationAliases/current` document contains exactly
`schemaVersion: 1` and an `aliases` map from reviewed legacy display strings to
canonical IDs. A legacy write succeeds only if the alias is indexed and also
equals the active record's display name or one of its reviewed
`approvedAliases`. Canonical writes must match the active record's display name
exactly. The updated frontend searches canonical display names by case-sensitive
prefix and writes the ID; it does not use arbitrary profile values.

The deployed `9ca33e0` client cannot change an unversioned canonical event to a
different location: its update retains the existing `locationId`, which must
still match the public display. It can edit the event without changing that
location when the old form can select it. Use the updated client to change
both the ID and display; older clients cannot edit server-versioned events.
Legacy events without an ID can still change between reviewed aliases.

The alias index is limited by Firestore's 1 MiB document size and index-entry
limits. Keep it small, disable unnecessary indexing for the alias map when
provisioning infrastructure, and verify its serialized size and index limits
before deployment. Never use it as the nationwide catalog. Retire it only after
approved monitoring confirms legacy clients are no longer writing for the
agreed adoption/rollback window; deleting the index denies all no-ID legacy
writes. Review and separately authorize catalog changes, including removals.
An inactive location rejects new or updated writes, but does not hide existing
publicly listed events.

## Public event projection

Public browsing and direct event links read `publicYardSaleEvents`; nonowners
cannot get or list the owner-managed `yardSaleEvents` source. Owners retain source document
gets, filtered owner listings, and existing editing/deletion flows. Clients
cannot create, update, or delete projection documents.

The server projection allowlist contains only `schemaVersion: 1`, `title`,
`description`, `location`, `locationId`, `locationVisibility`, `startDate`, `endDate`,
`photoURL`, `createdAt`, `updatedAt`, and `itemCount`. It omits `userId`,
addresses, coordinates, event versions, and all unknown fields. Projection
requires an exact known source schema and an active catalog record whose
canonical display name matches the source location. Legacy events without a
canonical `locationId`, alias-only events, malformed records, and inactive
locations are not projected. Treat these omissions as requiring review, not
proof that the source data is safe.

Firestore Rules validate individual projection `get` requests, but the broad
anonymous `list` grant cannot validate or redact each returned document without
breaking the browse query. Every listed field is sent to the client. Anonymous
list safety therefore depends on the trusted Functions writer constructing
documents exclusively through the validated projection builder. Admin SDK,
Console, migration, or other privileged writes bypass these Rules and can
expose arbitrary fields in this collection; such writers must not write here
unless they enforce the same allowlist. Reassess this trust boundary before
adding any privileged writer.

Source and catalog triggers reconcile projections transactionally from the
current source/catalog state, not the trigger payload. Retried or out-of-order
source triggers therefore converge to current state; source deletion removes
the projection rather than allowing a stale trigger to recreate it. Catalog
changes refresh events using that location ID. This is asynchronous: event
listing can briefly lag source edits or deletions. The projection never
contains exact addresses, so that delay must not be used to expose private
location data.

Event title and description are public free-text fields. The form warns
organizers not to enter street addresses, access codes, or private contact
information, but cannot detect or guarantee the absence of such content.
Explicit exact-address consent continues to govern only the separate private
address read path. Revocation cannot recall data already downloaded or cached.

Functions do not automatically backfill existing source documents. Any
backfill requires a separately approved, privacy-reviewed plan after an
authorized data audit; do not assume hidden Console collections are empty.
Canonical-ineligible legacy events remain owner-manageable but will not appear
in public browse or resolve from public links until reviewed and corrected.
Older detail clients that read `yardSaleEvents` directly will no longer work
for public visitors; coordinate the Rules and application rollout and verify
projection availability before switching public traffic.

## Required staging verification

- [ ] Separately authorize staging changes before deploying any Functions or
      rules.
- [ ] Before any staging deployment, run the read-only staging event-data
      audit using the staging project and the staging-specific confirmation
      flag. Review aggregate counts for public address/coordinate fields,
      malformed visibility, and inconsistent private records. Do not log
      event IDs, organizer IDs, addresses, or coordinates.

  ```bash
  node functions/scripts/audit-production-events.cjs \
    --project yardsale-hub-staging \
    --confirm-read-only-staging-audit
  ```
- [ ] Treat catalog and alias matches as review-unverified. The audit cannot
      establish that an entry is independently reviewed or genuinely broad,
      and no Firestore review flag proves either. A missing or malformed
      inventory leaves locations unverified. Never import profile locations
      automatically. Establish independent review through a separately
      authorized, reviewer-authenticated inventory and integrity process;
      the audit does not currently verify such an inventory.
- [ ] Review the audit's catalog-matched-but-unverified, suspicious, malformed,
      missing, and other unverified location counts. Suspicious address/
      coordinate patterns are review candidates, not a complete detector. A
      catalog match or zero suspicious count does not prove content is safe.
      Titles, descriptions, other strings, and unrecognized location field
      names may also contain sensitive information; the free-text count is
      not a content inspection.
- [ ] Interpret exact-event anonymous-read counts as conservative assessments
      of the tracked staging Rules, not verified deployed Rules or confirmed
      reads. Potentially readable includes indeterminate cases, including
      Firestore integer-versus-double and non-ASCII size ambiguity. The owner
      read-condition count is separate and assumes an authenticated matching
      owner; it does not prove the account exists or imply anonymous access.
      Policy-structurally plausible counts are not proof of consent provenance
      or independently reviewed location safety. Review potentially readable
      events that fail the stricter structural policy. A marker reported on a
      general event is present but is not necessarily valid.
- [ ] Independently verify the deployed Rules before relying on any Rules
      assessment; the tracked staging Rules are not evidence of what is
      published in either project. Production Rules reconciliation remains
      blocked until the complete currently published production source is
      obtained and reviewed.
- [ ] Use reviewed read-only credentials. The audit emits aggregates, not
      record identifiers or values; small counts can still be identifying.
      Document the approved process for investigating and remediating
      findings without publishing sensitive data. Any remediation requires
      separate authorization.
- [ ] Account for concurrent writes: paginated collection reads and joins are
      not a single consistent snapshot. Coordinate or repeat the audit under
      an approved process and verify remediation before relying on results.
- [ ] If the staging audit finds unsafe public documents, keep the deployment
      blocked until a separate reviewed cleanup is approved and completed.
      Firestore Rules cannot redact fields from public list results.
- [ ] Separately review unverified or suspicious public `location` values and
      other potentially sensitive public content before enabling browsing.
      Do not log addresses, event IDs, or organizer IDs. Obtain separate
      authorization for any expanded inspection or remediation.
- [ ] After separate authorization, provision and review the staging catalog
      and finite legacy alias index, including all intended legacy choices.
      Test malformed, unapproved, inactive, and mismatched locations on create
      and update; confirm removing the alias index rejects legacy writes but
      not canonical writes.
- [ ] Verify public event browsing and detail read only the projection, malformed or
      legacy source events are unavailable to public visitors, and owners can still list,
      read, edit, and delete their own source events.
- [ ] Verify general-event create/edit, including optional owner-only private
      addresses from the deployed `9ca33e0` payload.
- [ ] Verify client writes cannot create exact events, alter exact events,
      modify server-managed `eventVersion`, or access consent/rate-limit records.
- [ ] Verify exact publication, address revision matching, stale writes,
      revocation, deletion, idempotent retry, and anonymous address reads only
      with a valid active marker.
- [ ] Verify registration and rename rolling limits under concurrent calls and
      retain the 30-day rename cooldown.
- [ ] Verify existing-account onboarding does not overwrite private user data.

Do not treat staging verification as production authorization.

## Production data and identity prerequisites

- [ ] Separately authorize and run the read-only event audit only after the
      exact published rules source and read-only credentials are reviewed:

  ```bash
  node functions/scripts/audit-production-events.cjs \
    --project yardsale-hub-93c49 \
    --confirm-read-only-production-audit
  ```

- [ ] Review aggregate audit results for public addresses/coordinates,
      missing/orphan private records, owner mismatches, and exact events
      without matching consent. The tool does not print addresses or user IDs.
- [ ] If legacy data requires repair, review a migration plan and obtain
      separate authorization. Never infer consent from legacy visibility.
- [ ] Verify the production backend service account and its minimum required
      roles; this repository change does not create IAM resources.
- [ ] Verify production Firebase/Vercel project configuration and callable
      reachability. Mandatory App Check enforcement is not approved.
- [ ] Verify Vercel **Promote to Production** behavior and production
      environment compatibility in advance.

## Future coordinated release (separate authorization required)

1. Complete the read-only audit and any separately approved data remediation.
   Review existing public location values and other free text separately: the
   audit cannot prove that arbitrary strings are broad locations or safe.
2. Separately authorize, provision, and review the catalog and finite alias
   index, then deploy the compatible Functions. Verify approved legacy options.
3. Publish rules derived from the verified live production rules. Deny public
   source gets and listing, permit anonymous list access only to the trusted-writer
   projection collection (with schema validation on individual gets), preserve
   owner-scoped source listing, and deny client projection writes. Direct exact
   writes from the old website must be denied. Legacy general writes with
   unapproved locations will be denied, including profile locations.
4. Separately authorize and review any required projection backfill. Do not
   infer production emptiness from collection visibility.
5. Build and verify a preview configured for the production Firebase project.
   Keep the existing Vercel Ignored Build Step unchanged; do not bypass it.
6. Promote the verified preview only after confirming the dashboard action
   does not alter that safeguard, then verify browsing, general events,
   onboarding, and consent-gated exact events.

There will be a temporary exact-event creation/edit transition window between
rules enforcement and website promotion. Public browsing and general-event
creation/editing must remain usable during that window.

## Rollback and recovery

- `firebase.json` is the only approved Firebase deployment configuration. The
  obsolete `firebase.event-freeze.json` configuration and its paired
  `firestore.event-freeze.rules` and `storage.event-freeze.rules` files are
  retired and must not be used for deployment or rollback.
- A future emergency event freeze must separately stop or gate Admin SDK
  callables; Firestore Rules do not constrain Admin SDK writes. Preserve
  consent-validated private-address reads and validate any emergency
  configuration in staging before use.
- If website promotion fails, leave the prior production website in place;
  exact writes remain disabled until a compatible website is promoted.
- If projection Functions fail, keep anonymous source listing denied and do
  not fall back to listing owner-managed source documents. Investigate trigger
  failures; projection browsing may be stale or unavailable until repaired.
- If consent Functions fail, do not restore the old direct exact-write rules.
  Keep exact publication disabled and investigate callable/runtime failures.
- If rules fail, restore only a reviewed prior ruleset that still denies
  unconsented public addresses and preserves the verified owner-only user
  policy. Never restore the historical backup blindly.
- If an event write response is ambiguous, refresh the event and compare its
  version before retrying. Do not retry with a new operation key until the
  committed state is known.
- Do not delete consent history during recovery. Correct event/marker state
  through reviewed server-side operations.
