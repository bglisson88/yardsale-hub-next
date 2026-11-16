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

## Required staging verification

- [ ] Separately authorize staging changes before deploying any Functions or
      rules.
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
2. Publish rules derived from the verified live production rules. Public event
   browsing and general-event creation/editing must remain available. Direct
   exact writes from the old website must be denied.
3. Deploy the reviewed production Functions and verify their identity,
   limits, and callable behavior.
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
