# PR #35 Deployment Readiness

This checklist documents the approved production-readiness work. Completing or
checking an item here is not authorization to change production. Every
production action requires separate authorization.

## Implementation and local validation

- [ ] Obtain the complete currently published production Firestore rules text.
      Do not derive production rules from `firestore.rules` or
      `firestore.production-backup.rules`.
- [ ] Derive production rules from that exact text, preserving owner-only
      `users/{uid}` access, public event browsing, and unrelated permissions.
- [ ] Review all overlapping `match` grants; Firestore grants are additive.
- [ ] Run `npm run type-check`, `npm run build`, `npm run test`,
      `npm run build:functions`, `npm run test:functions`, and `npm run test:rules`.
- [ ] Verify the consent, rate-limit, legacy-general-event, and negative rules
      tests in the emulators.
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
- [ ] If the staging audit finds unsafe public documents, keep the deployment
      blocked until a separate reviewed cleanup is approved and completed.
      Firestore Rules cannot redact fields from public list results.
- [ ] Separately review existing public `location` values for unsafe or
      unapproved values before enabling public browsing. The existing audit
      counts prohibited fields but does **not** classify arbitrary location
      strings; do not log addresses, event IDs, or organizer IDs. Obtain
      separate authorization for any expanded audit or remediation.
- [ ] After separate authorization, provision and review the staging catalog
      and finite legacy alias index, including all intended legacy choices.
      Test malformed, unapproved, inactive, and mismatched locations on create
      and update; confirm removing the alias index rejects legacy writes but
      not canonical writes.
- [ ] Verify public event browsing and general-event create/edit, including
      optional owner-only private addresses from the deployed `9ca33e0` payload.
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
   Review existing public location values separately: the current audit does
   not determine whether arbitrary location strings are broad locations.
2. Separately authorize, provision, and review the catalog and finite alias
   index, then deploy the compatible Functions. Verify approved legacy options.
3. Publish rules derived from the verified live production rules. Public event
   browsing and general-event creation/editing must remain available. Direct
   exact writes from the old website must be denied. Legacy general writes
   with unapproved locations will be denied, including profile locations.
4. Build and verify a preview configured for the production Firebase project.
   Keep the existing Vercel Ignored Build Step unchanged; do not bypass it.
5. Promote the verified preview only after confirming the dashboard action
   does not alter that safeguard, then verify browsing, general events,
   onboarding, and consent-gated exact events.

There will be a temporary exact-event creation/edit transition window between
rules enforcement and website promotion. Public browsing and general-event
creation/editing must remain usable during that window.

## Rollback and recovery

- If website promotion fails, leave the prior production website in place;
  exact writes remain disabled until a compatible website is promoted.
- If Functions fail, do not restore the old direct exact-write rules. Keep
  exact publication disabled, preserve public browsing/general events, and
  investigate callable/runtime failures.
- If rules fail, restore only a reviewed prior ruleset that still denies
  unconsented public addresses and preserves the verified owner-only user
  policy. Never restore the historical backup blindly.
- If an event write response is ambiguous, refresh the event and compare its
  version before retrying. Do not retry with a new operation key until the
  committed state is known.
- Do not delete consent history during recovery. Correct event/marker state
  through reviewed server-side operations.
