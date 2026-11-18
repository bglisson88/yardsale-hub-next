# Staging Projection Audit IAM Checklist

This checklist is a plan for a separately authorized staging-only setup. It
does not create identities, roles, keys, or IAM bindings. Do not run the audit
until an authorized reviewer approves the identity, effective permissions,
project target, and data access.

## Target identity and scope

- [ ] Use only Firebase/Google Cloud project `yardsale-hub-staging`.
- [ ] Use the dedicated identity
      `yardsale-hub-staging-audit@yardsale-hub-staging.iam.gserviceaccount.com`.
- [ ] Keep this identity separate from
      `yardsale-hub-staging-backend@yardsale-hub-staging.iam.gserviceaccount.com`
      and all Functions runtime identities.
- [ ] Grant Firestore data access only on the staging project. Do not grant the
      identity access on production, a parent folder, or the organization.
- [ ] Inspect inherited organization/folder/project policies and group
      memberships for indirect production access. A project-level staging
      binding alone does not prove that no broader inherited access exists.
- [ ] Do not create or download a user-managed service-account key.

## Minimum Firestore data permissions

The audit performs document gets and collection queries over
`yardSaleEvents`, `publicYardSaleEvents`, and `generalLocations`. The minimum
Firestore data permissions are:

- `datastore.entities.get` — read document contents.
- `datastore.entities.list` — run collection queries and list matching
  documents.

Prefer a project-scoped custom role containing exactly those two permissions.
Do not grant entity create, update, or delete permissions, database
administration, or unrelated project roles. The predefined
`roles/datastore.viewer` can be considered only after an administrator reviews
its current permission set and accepts any additional permissions. Do not
assume `roles/viewer` provides Firestore document access.

The human or workload principal that starts the audit also needs to obtain
short-lived credentials for the dedicated service account. Prefer service
account impersonation over a downloaded key. Use a reviewed credential
configuration of a type documented in the Functions README. The audit
validates its target, then explicitly impersonates the hardcoded staging
audit account and verifies the issued access token's email. If using the
predefined `roles/iam.serviceAccountTokenCreator`, scope it to this service account only,
not the project; review its permissions and organizational policy before
granting it. Do not grant that role to the audit service account itself.

## Provisioning plan — do not execute without separate approval

1. [ ] Confirm the staging project ID and confirm that the active CLI,
      environment file, and Firebase configuration all target
      `yardsale-hub-staging`.
2. [ ] Review the service account's project policy and inherited organization
      and folder policies. Confirm it has no production project access and is
      not the Functions runtime identity.
3. [ ] Create or verify the dedicated service account only after separate
      approval. Do not create user-managed keys.
4. [ ] Create or review a staging-project custom role with exactly
      `datastore.entities.get` and `datastore.entities.list`, then bind it only
      to the dedicated audit service account.
5. [ ] Separately bind the approved human/workload principal's impersonation
      permission on the dedicated service account only. Prefer short-lived
      impersonated ADC credentials; do not share or persist access tokens.
6. [ ] Verify effective policy before any Firestore data access:
      - Use IAM Policy Troubleshooter for both required permissions on the
        staging Firestore project/database and confirm they are allowed.
      - Test `datastore.entities.create`, `datastore.entities.update`, and
        `datastore.entities.delete` on the same staging resource and confirm
        they are denied.
      - Check database deletion/administration permissions and confirm they
        are not granted.
      - Inspect inherited policies and troubleshoot the same read permissions
        against the production project; confirm they are denied.
      - Verify the ADC source principal can impersonate only the dedicated
        audit identity. The audit fixes Firestore's project and both source
        and impersonated-auth quota projects to `yardsale-hub-staging`; confirm
        none point to production. The hardcoded target cannot be changed
        through ADC files or environment settings.
7. [ ] Have a second reviewer confirm the project, identity, effective
      permissions, and negative write/production checks. Record approval
      without recording credentials or access tokens.
8. [ ] Only after a separate data-access approval, run the documented
      aggregate-only audit against staging. Do not use this identity for
      backfill, cleanup, Functions execution, or event publication.

## Verification sources

- [Cloud Firestore IAM permissions and roles](https://firebase.google.com/docs/firestore/security/iam)
- [Cloud Firestore roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/firestore)
- [Service account impersonation](https://docs.cloud.google.com/docs/authentication/use-service-account-impersonation)
- [Application Default Credentials](https://docs.cloud.google.com/docs/authentication/application-default-credentials)

The audit CLI independently requires the explicit staging project,
`YSH_FUNCTIONS_MODE=staging`, and the configured dedicated identity. It loads
the specified credential configuration without an implicit ADC lookup and
pins Firestore and both quota project configurations to staging. Its
Firestore adapter exposes only `get` and
query-read operations. These application checks do not replace IAM
verification; IAM must independently deny writes and production access.
