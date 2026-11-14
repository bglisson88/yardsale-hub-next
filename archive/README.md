# Archived Firebase configuration

`firebase.production-rollback.json` is retained verbatim for historical
reference only. Its referenced Firestore rules allow public reads of
`/users/{uid}`, so this configuration is unsafe for routine deployment and
must never be used for routine deploys.

The rules file paths in the archived configuration are unchanged and may no
longer resolve from this location. Do not repair those paths or select this
configuration for deployment. Any emergency rollback requires a separately
reviewed recovery procedure and staging validation.
