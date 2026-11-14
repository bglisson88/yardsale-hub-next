# Firebase Functions foundation

Use Node.js 22. Install the root dependencies with `npm ci` and the separate
Functions dependencies with `npm --prefix functions ci`.

From the repository root:

```bash
npm run build:functions
npm run test:functions
npm run test:rules
```

`test:functions` starts Authentication, Functions, Firestore, and Storage
emulators against the local-only `demo-yardsale-hub` project and checks that
the compiled module loads. It exports no endpoints and performs no database
operations. The absence of discovered functions is intentional.

Both `firebase.json` and `firebase.event-freeze.json` retain their existing
Firestore and Storage rules selections. To check the alternative configuration:

```bash
npm run build:functions
npx firebase emulators:exec --config firebase.event-freeze.json \
  --project demo-yardsale-hub --only auth,functions,firestore,storage \
  "node -e \"require('./functions/lib/index.js')\""
```

Admin initialization uses application default credentials, supplied by the
managed runtime in a future deployment. No service-account key is needed.
This foundation does not configure deployment credentials, deploy any
resources, or connect the application's authentication flows to emulators.
Future deployments require separate staging-only IAM and project review;
do not deploy this foundation to production.
