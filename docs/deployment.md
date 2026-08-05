# Deployment pipeline

The Cloud Run workflow uses two protected GitHub environments:

1. Every push to `main` deploys the commit to `staging` and runs smoke tests.
2. A production promotion starts only from `workflow_dispatch` on `main` with
   `promote_to_production=true`.
3. The `production` GitHub environment must require a reviewer. The production
   job waits for that approval after the same commit passes staging.

## Required GitHub environments

Create `staging` and `production` under **Settings → Environments**. Configure
these secrets independently in both environments:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

Configure these environment variables independently:

- `GCP_PROJECT_ID`
- `DEPLOYMENT_ENVIRONMENT` (`staging` or `production`)
- `GCP_REGION`
- `CLOUD_RUN_SERVICE`
- `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID` (optional)
- `FIREBASE_DATABASE_ID`
- `FIREBASE_APPCHECK_SITE_KEY` (required when App Check is enforced)
- `FIREBASE_APP_CHECK_REQUIRED`
- `ENABLE_BOOTSTRAP_ADMIN`
- `BOOTSTRAP_ADMIN_EMAIL` (only while a controlled bootstrap is needed)
- `NEXT_PUBLIC_ENABLE_OFFLINE_MODE` (must be `false` outside local development)

`GCP_PROJECT_ID` and `FIREBASE_PROJECT_ID` must match. The workflow refuses a
cross-project deployment.

## Staging values

The isolated staging environment currently uses:

```text
GCP_PROJECT_ID=assetguard-staging-jlc
DEPLOYMENT_ENVIRONMENT=staging
FIREBASE_PROJECT_ID=assetguard-staging-jlc
FIREBASE_DATABASE_ID=(default)
CLOUD_RUN_SERVICE=control-de-epp-staging
GCP_REGION=us-central1
FIREBASE_APP_CHECK_REQUIRED=false
ENABLE_BOOTSTRAP_ADMIN=false
NEXT_PUBLIC_ENABLE_OFFLINE_MODE=false
```

Keep App Check disabled only until its staging key has been registered and
verified. Never copy staging values, service accounts, or secrets into the
`production` environment.

## Production protection

Under **Settings → Environments → production**:

- Add at least one required reviewer.
- Prevent administrators from bypassing the protection rule when available.
- Restrict deployment branches to `main`.

The workflow also requires a manual dispatch with the production checkbox, so
an ordinary merge cannot deploy production.

## Automated smoke checks

Every deployment verifies:

- the Cloud Run endpoint responds;
- runtime Firebase project and database match the selected environment;
- Firebase runtime configuration has `Cache-Control: no-store`;
- the Google popup-compatible COOP header is present;
- a kiosk request without a session returns `401`;
- a cross-site kiosk request returns `403` and emits no cookie.

Firestore rules are deployed with a generated configuration that targets the
environment's exact `FIREBASE_DATABASE_ID`.
