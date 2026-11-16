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

Both `firebase.json` and `firebase.event-freeze.json` retain their existing
Firestore and Storage rules selections. The rules suite exercises both.
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

The callable code alone does not enforce public read restrictions. Firestore
Rules must make consent and rate-limit records server-only, validate the
marker/revision before an anonymous exact-address read, and reject direct
client exact writes. The local `firestore.rules` is staging-only and exercises
those rules. The complete published production rules source is not present in
the repository; do not copy staging or the historical production backup to
production. Production rules integration remains blocked until that exact
source is supplied.

### Read-only production event audit

`scripts/audit-production-events.cjs` reports aggregate counts for production
event/private/consent consistency and whether public documents contain
address-like fields or coordinates. It does not write data or print event
addresses or user IDs. It refuses to run without the exact project ID and an
explicit read-only confirmation flag. Do not run it until separately
authorized; production event-data audit and any reviewed remediation remain
deployment prerequisites.
