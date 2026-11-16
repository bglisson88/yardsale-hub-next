# Firebase Setup Guide

This guide covers local and emulator setup. It is not authorization to create
or change any Firebase resources.

## Local web configuration

Set the Firebase Web App values in an untracked `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_APP_NAME=YardSale Hub
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Never commit private credentials. The Firebase Web App configuration is
client-side configuration; Admin credentials and service-account keys must
never be placed in the web environment.

## Rules and data privacy

Do not paste historical rule examples into Firebase Console. Older versions
of this guide allowed public reads of private `users/{uid}` documents and
permitted unvalidated event writes.

The tracked `firestore.rules` is staging-only. It is exercised with local
emulators; it is not the production rules source. The historical
`firestore.production-backup.rules` is also not authoritative. Production
rules must be derived from the complete verified published rules source,
preserving owner-only user access, public event discovery, and all unrelated
permissions. Until that exact source is available, production rules
integration is blocked. Do not publish rules from this repository as a
production change without separate authorization.

Public event documents must contain no street address or precise coordinates.
General-location addresses belong in owner-only `eventPrivate` documents.
Exact addresses are publicly readable only while a server-managed
`exact-address-v1` consent marker matches the address revision. Legacy
visibility values are not proof of consent.

## Functions

The local Functions emulator uses `functions/.env.demo-yardsale-hub` and the
`demo-yardsale-hub` project. Staging and production have separate, fail-closed
configuration. The production settings name project `yardsale-hub-93c49` and
the approved `yardsale-hub-prod-backend` identity; this repository does not
create the service account or grant IAM roles.

Username registration and rename are limited independently to 5 attempts per
rolling 15 minutes and 20 per rolling 24 hours per authenticated UID. The
30-day rename cooldown remains in force. Exact event creation, exact-address
edits, visibility transitions, and deletion use authenticated server
callables and atomic Firestore transactions.

## Local checks

Install dependencies and run the local app:

```bash
npm ci
npm --prefix functions ci
npm run dev
```

For code validation, use the commands in `DEPLOYMENT_CHECKLIST.md`. Emulator
tests do not publish rules or modify live Firebase data. Deployments,
migrations, IAM changes, and production audits each require separate
authorization.

Keep the existing Vercel Ignored Build Step unchanged. Do not bypass it as
part of Firebase or website setup.
