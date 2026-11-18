# Firebase Functions

Use Node.js 22. Install root dependencies with `npm ci` and Functions
dependencies with `npm --prefix functions ci`.

The exported `registerPublicProfile` callable registers an authenticated
user's public profile and username claim. It obtains the member-since date
from Firebase Auth and does not publish a profile photo.
For an existing registered account, a valid retry returns its current
username without writes; callers must use the returned username and must not
assume the requested username was acquired. The retry verifies the public
profile, Auth-derived member-since date, username state, and exactly one
UID-matched username claim. It does not depend on requested-name availability,
the current private display name, or current reservation status.
New registrations still require an available, unreserved username and create
the public profile, claim, and state atomically. Partial records and orphan
claims matching the account UID fail closed rather than being repaired.
Each attempt performs a `usernameClaims` UID equality query limited to two
documents, including new accounts. This adds a billed query read even when no
claims match and reads at most two matches. It uses the default single-field
index; malformed extra claim documents that omit or corrupt their `uid` field
cannot be found by this query. The current claim is still required to be the
sole matching claim and to contain exactly `{ uid }`. The bounded query is
not a permanent lock; atomic registration and renaming still coordinate on
the account's profile/state and username claim documents, and trusted writers
must preserve those invariants.
Retries continue to reject non-null public `photoURL` values until PR 2 adds a
trusted publication-approval invariant. A URL alone is not consent.
The `renameUsername` callable atomically changes the username and claim.
The first rename is immediate; later changes require 30 full days. Retrying
the current username does not change the cooldown.

## Profile callable runtime configuration

`registerPublicProfile` and `renameUsername` share validated per-callable
options from `src/runtime-options.ts`; no global Functions defaults are set.
The selected Firebase project (`GCLOUD_PROJECT`) must match
`YSH_EXPECTED_PROJECT_ID`. The builder rejects unknown modes, projects,
regions, service accounts, missing values, unsupported memory, invalid
limits, and inconsistent instance bounds. TypeScript compilation does not
load dotenv or run this validation; Firebase CLI Functions discovery imports
the compiled entry point and fails before deployment if configuration is
missing or invalid.

The intentionally tracked `functions/.env.yardsale-hub-staging` contains only
non-secret staging settings. It pins `yardsale-hub-staging` to `us-south1`,
the dedicated staging runtime service account, and the reviewed per-callable
limits (`maxInstances: 2`, `concurrency: 10`, `timeoutSeconds: 30`,
`memory: 256MiB`, `minInstances: 0`). There is no shared staging `.env` and
the tracked `functions/.env.yardsale-hub-93c49` contains only non-secret,
reviewed production runtime settings. Production discovery is accepted only
for project `yardsale-hub-93c49` and service account
`yardsale-hub-prod-backend@yardsale-hub-93c49.iam.gserviceaccount.com`; it
uses the same region and limits as staging. This file does not create that
service account or grant IAM roles. Those permissions must be verified
separately before any production deployment.

The tracked `functions/.env.demo-yardsale-hub` is emulator-only configuration.
It selects `us-south1` and the same bounded limits, has no service-account
setting, and is accepted only with project `demo-yardsale-hub`. The emulator
integration test also selects `us-south1` in its Functions client. The
Firebase CLI loads `.env.<project-id>` during Functions discovery and
emulation; `FUNCTIONS_EMULATOR` is set for the emulator runtime but is not
relied on for discovery. Direct unit tests pass configuration to the pure
builder and set demo configuration before importing the callables.

### Staging deployment prerequisites

Before any staging deployment, verify the selected project and staging-only
IAM configuration. The runtime account needs only the confirmed Cloud
Datastore User and Firebase Authentication Viewer roles for Firestore and
Auth operations. The deployer identity separately needs the
Firebase/Cloud Functions deployment permissions and
`iam.serviceAccounts.actAs` on the selected runtime account; do not grant
deployment permissions to the runtime account. No service-account key is
used or required.

After approval, target only the intended project and resource:

```bash
firebase deploy --config firebase.json --project yardsale-hub-staging --only functions
```

This is not authorization to deploy; verify the target and deployment
permissions immediately before running it. Do not use an unrestricted deploy.
Billing budget notifications at 50%, 90%, and 100% are alerts, **not hard
spending caps**; they do not stop Functions or guarantee a maximum bill.

From the repository root:

```bash
npm run build:functions
npm --prefix functions run test:username
npm --prefix functions run test:public-profile
npm run test:functions:integration
npm run test:rules
```

The integration command starts Auth, Functions, and Firestore emulators for
`demo-yardsale-hub`. It requires the configured localhost ports and emulator
hub, fails closed if they are missing or different, and uses only dummy
emulator authorization. It creates unique fixtures and removes them after the suite.
Run emulator suites sequentially and do not share their emulator with other
tests or data. No Firebase credentials or live project are needed.

The tests cover rejected operations and concurrent claims without partial
records. The requests are launched concurrently, but actual transaction
overlap is nondeterministic. Tests do not inject a deterministic failure
during a transaction; that coverage is deferred. Firebase Auth and Firestore
do not share a transaction: an account deleted after the Auth lookup may
leave an orphaned profile. A transaction query does not make that cross-service
race atomic. Both limitations require separate follow-up.

Only `firebase.json` is an approved Firebase deployment configuration. The
obsolete `firebase.event-freeze.json` configuration and its paired Firestore
and Storage rules were retired because they did not preserve current privacy
and permission guarantees; do not recreate or use them for deployment.

A future emergency event freeze must account for both Firestore client Rules
and Admin SDK callables. Firestore Rules do not restrict Admin SDK writes, so
an emergency procedure must separately disable or gate event-writing
Functions, preserve consent-validated private-address reads, and be validated
in staging before use.
Admin initialization in the Functions runtime uses managed credentials for a
future deployment; no service-account key is needed. Deployment requires
separate staging-only IAM and project review.

### Production runtime settings

The production runtime is fail-closed to `yardsale-hub-93c49`, the dedicated
`yardsale-hub-prod-backend` identity, and `us-south1`. The enforced limits are
2 maximum instances, concurrency 10, 30 seconds, 256 MiB, and 0 minimum
instances. Staging and emulator configuration remain separate. This PR does
not create the identity, change IAM, or deploy Functions. Mandatory App Check
enforcement remains disabled pending separate approval.

### Username attempt limits

`registerPublicProfile` and `renameUsername` each use a server-only
`usernameRateLimits/{uid}/operations/{operation}` document. Each operation is
limited to 5 attempts in a rolling 15 minutes and 20 in a rolling 24 hours.
Authenticated requests with syntactically valid usernames count even when
the name is taken, reserved, or the rename cooldown blocks the change. Invalid
request shapes are rejected before consuming quota. Rate-limit consumption
uses its own Firestore transaction before the atomic profile/claim transaction;
a valid failed business attempt still consumes one quota slot. The 30-day
rename cooldown remains unchanged. Clients receive a retry duration in
`resource-exhausted` details and display an actionable message.

### Exact-address event consent

`saveEventWithConsent` handles exact publication and exact-visibility
transitions; `deleteEventWithConsent` handles deletion. Both require an
authenticated organizer and use Admin SDK transactions with
`eventVersion` optimistic checks and operation IDs for retries. Exact
publication requires an affirmative assertion for `exact-address-v1`.
Street addresses are written only to `eventPrivate`; exact writes also create
an active `eventAddressConsent/{eventId}` marker bound to the private
`addressRevision`, and an append-only
`eventAddressConsent/{eventId}/history/{operationId}` record. Downgrades and
deletions revoke the active marker and record history in the same transaction.
General-event client writes remain supported without `eventVersion`, and
callable-managed transitions initialize it from zero.

Operation history binds each operation ID to a SHA-256 fingerprint of the
normalized request and callable type. Identical retries return the original
result without writes, even after later edits; changed payloads are rejected.
Older history without a fingerprint is not accepted as proof of an identical
request: reload the event and use a new operation ID. Fingerprints are
server-only metadata, not anonymized data or proof of consent provenance.
General callable saves create or replace the owner-only private address when
a nonempty address is supplied; an empty address removes any existing private
record. Neither operation publishes the address in the public event document.

The callable requires a canonical `locationId` and matching `location` from an
active trusted `generalLocations` record. It validates the record in the same
transaction as the event write. The frontend searches this catalog rather than
trusting profile locations. Staging Rules separately support a finite reviewed
legacy alias index for direct general-event writes; the callable does not accept
aliases. See `DEPLOYMENT_CHECKLIST.md` for the exact catalog schema, trust
boundary, rollout, and alias retirement conditions.

The callable code alone does not enforce public read restrictions. Firestore
Rules must make consent and rate-limit records server-only, validate the
marker/revision before an anonymous exact-address read, and reject direct
client exact writes. The local `firestore.rules` is staging-only and exercises
those rules. `firestore.production-candidate.rules` reconciles the supplied
production baseline for review only. It is not wired into deployment. Do not
copy staging or the historical production backup to production; follow the
remaining release gates in `DEPLOYMENT_CHECKLIST.md`.

### Public event projection

Public browse and detail clients read `publicYardSaleEvents`, not the
owner-managed `yardSaleEvents` collection. The projection contains only schema
version `1`, title, description, canonical general location and ID, visibility, event dates,
photo URL, and item count. It never contains an organizer ID, address,
coordinates, event version, or unrecognized source fields; Rules deny all
client writes. Source listing and individual source gets are owner-only.
Owners can still open and edit unprojected events. Older clients that read
source events directly cannot load public details under these Rules. Rules strictly validate individual
projection gets, but the broad anonymous list grant cannot validate or redact
each returned document without breaking the browse query. Every list result is
returned in full. List safety relies on the trusted Functions writer using the
allowlisted builder. Admin SDK, Console, migration, or other privileged writes
bypass Rules and could expose arbitrary fields through public listing; no
other writer may target this collection without enforcing the same contract.

`projectPublicYardSaleEvent` reconciles from the current source document inside
a Firestore transaction instead of trusting a trigger's historical payload.
Consequently retries and out-of-order invocations converge on the latest
source state; a deleted source cannot be recreated from an old trigger.
`refreshPublicEventsForLocation` removes or refreshes projections when a
trusted canonical location changes. Events with missing/legacy location IDs,
invalid schemas, unexpected fields, or inactive/noncanonical catalog entries
are omitted until separately reviewed and corrected. Existing source events
are not automatically backfilled.

The web form labels titles and descriptions as public and warns users not to
place street addresses, access codes, or private contact data in free text.
Text inspection is not complete: those fields remain organizer-authored public
content, and the warning cannot guarantee that private information is absent.
Exact street addresses remain in `eventPrivate`; only the existing explicit
consent and active marker permit anonymous reads. Revocation does not recall
previously downloaded or cached addresses.

Deploy projection Functions before enabling the public projection Rules and
frontend. Review any existing source data before a one-time backfill; backfill
is a separate approval and is never performed by these triggers or deployment
steps. Production Rules must be derived from the verified active production
Rules source, not copied from this staging-only file.

### Read-only projection coverage audit

`npm --prefix functions run audit:projections -- --project yardsale-hub-staging`
performs a read-only aggregate audit; add `--plan` to label the output as a
dry-run plan. The command accepts only the explicit staging project, loads the
tracked staging Functions settings, rejects emulator or conflicting project
configuration, and requires `GOOGLE_APPLICATION_CREDENTIALS` to point to a
trusted, reviewed impersonation configuration for the hardcoded
`yardsale-hub-staging-audit` service account. It accepts
`impersonated_service_account` with an `authorized_user` source or
`external_account` with a file-sourced workload identity JWT and Google's
STS endpoint. It does not accept service-account keys, executable or
URL-based credential sources, or alternate impersonation endpoints.
`YSH_PROJECTION_AUDIT_SERVICE_ACCOUNT` must match the reviewed identity but
cannot override it.

The audit checks the issued access token's email with Google's token-info
endpoint and requires `email_verified` to be `true` or `"true"` before
constructing Firestore. The token requests datastore access
and the email scope needed for this check. Firestore receives the verified
client explicitly via GoogleAuth, with no second ADC lookup. The Firestore
resource project and both credentials' quota project are pinned to
`yardsale-hub-staging`; conflicting quota configuration is rejected. Do not
use the writable Functions runtime service account for this audit.

The audit reuses the projection builder and catalog validator. It reports
structural eligibility separately from publication approval; publication
approval is always zero because this repository has no reviewer-attested
content manifest. It paginates the full catalog, source, and projection
collections and emits aggregate counts only. `scanCompleted` means every
requested read completed; `scanConsistency` is explicitly best-effort and
non-atomic because Firestore does not provide a shared snapshot across these
pages and collections. Concurrent changes are not detected, so run the audit
when data is quiescent and repeat it before acting on counts. The audit store
exposes only document/query reads, and no cleanup, backfill, or
stale-reconciliation write command is implemented.

Before provisioning the audit identity, follow
[`STAGING_PROJECTION_AUDIT_IAM_CHECKLIST.md`](STAGING_PROJECTION_AUDIT_IAM_CHECKLIST.md).
The checklist specifies the minimum Firestore entity read/list permissions,
scoped short-lived impersonation, and required positive and negative IAM
verification. It is a plan only; no service account or IAM binding is created
by this repository.

Treat structurally eligible records as requiring manual review. Catalog field
shape does not prove that labels are broad locations, and source title,
description, and location text can still contain sensitive information.
`projectionsWithSensitiveFieldNames` only detects suspicious field names; it
does not inspect text values for addresses or other sensitive content. All
source events still require manual content review. Malformed, field-name
flagged, and orphan projections are counted for proposed cleanup; do not assume
that rebuilding a projection makes its content safe.

Before any staging validation, separately approve the read-only identity and
access, verify the target project and Vercel Preview configuration, and review
the aggregate-only audit and plan. After separately approved catalog
provisioning and content review, a future change may add distinct, explicitly
authorized commands for cleaning unsafe projections, backfilling approved
missing projections, and reconciling approved stale projections. Those future
commands must not change source events, consent records, or Firestore Rules.

The audit adapter also has a synthetic Firestore Emulator integration suite.
It runs as part of `npm run test:functions:integration` in CI, sharing that
step's Firestore Emulator startup. To run it alone, use
`npm run test:functions:projection-audit-integration`; both paths use the
local demo project only. The test refuses to run without the expected local
Firestore Emulator endpoint and demo project and rejects configured service
account credentials. It does not access staging or live Firebase.

### Read-only event-data audit

`scripts/audit-production-events.cjs` accepts only `yardsale-hub-93c49` with
`--confirm-read-only-production-audit` or `yardsale-hub-staging` with
`--confirm-read-only-staging-audit`. It rejects unknown or mismatched project
IDs, conflicting or duplicate project/confirmation arguments, emulator
configuration, and a conflicting `GCLOUD_PROJECT`. It reports aggregate
counts for event/private/consent consistency and scans every document in
`publicYardSaleEvents`. Projection counts cover schema failures, unexpected
fields, nested sensitive field names, address-like text, orphan documents,
sources without projections, projection/source mismatches, and exact
projections with stale consent state. Consent-marker counts also identify
orphaned or structurally stale markers. The audit is read-only and does not
print document IDs, addresses, coordinates, or organizer IDs. It does not
repair, delete, or backfill documents.

The projection scan validates the explicit projection allowlist and compares
projection values with the current source, including Firestore timestamp
precision. Address detection uses conservative street-address and coordinate
patterns across string values; it is a review signal, not complete detection.
Titles, descriptions, locations, and even a valid field allowlist can contain
private text. Catalog and alias matches are review-unverified: neither a
match nor a Firestore flag proves independent review. The audit does not
verify a reviewer-authenticated inventory. Structural policy checks do not
prove consent provenance.

Anonymous-read assessments conservatively model the tracked staging Rules:
potentially readable includes indeterminate outcomes, such as Firestore
integer-versus-double and non-ASCII size ambiguity, rather than confirmed
reads. Owner read conditions are counted separately and assume an authenticated
matching owner. Neither assessment establishes which Rules are deployed;
independently verify the published Rules before relying on these counts.

The collection scans and joins are not a consistent snapshot during concurrent
writes. Aggregates can be identifying when counts are small and do not provide
record identifiers for remediation. `test/audit-production-events.test.cjs`
exercises the audit and projection-validation logic with synthetic data only;
it makes no Firebase requests. `test/public-event-projection.test.cjs` also
checks the offline reconciliation result after a simulated exact-consent
revocation. `test/event-consent.integration.test.cjs` runs last in
`npm run test:functions:integration` against the local Auth, Functions, and
Firestore emulators for `demo-yardsale-hub`. It loads the production-candidate
Rules into the disposable Firestore emulator, then exercises the real
callables and waits for server-confirmed projection creation, refresh, and
removal. It verifies that revocation blocks new address reads even before
the projection catches up; it cannot recall an address already disclosed or
cached. Production deployment configuration is unchanged. See
`DEPLOYMENT_CHECKLIST.md` for migration, review, and cutover safeguards.

Run the staging audit before any staging deployment only after separate
authorization. Run the production audit only after separate authorization and
review of the exact production rules source and read-only credentials.
Neither audit performs remediation; remediation requires separate approval.
