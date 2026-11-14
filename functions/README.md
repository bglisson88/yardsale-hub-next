# Firebase Functions

Use Node.js 22. Install root dependencies with `npm ci` and Functions
dependencies with `npm --prefix functions ci`.

The exported `registerPublicProfile` callable registers an authenticated
user's public profile and username claim. It obtains the member-since date
from Firebase Auth and does not publish a profile photo.

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
leave an orphaned profile. Both limitations require separate follow-up.

Both `firebase.json` and `firebase.event-freeze.json` retain their existing
Firestore and Storage rules selections. The rules suite exercises both.
Admin initialization in the Functions runtime uses managed credentials for a
future deployment; no service-account key is needed. Deployment requires
separate staging-only IAM and project review.
