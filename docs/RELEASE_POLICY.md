# AusHomeValue Release Policy

## Production authority

- `main` is the only branch authorised to create a Production deployment.
- Production deployments must be created by the Vercel Git Integration.
- Feature and fix branches may create Preview deployments only.
- Do not run `vercel --prod` from a workstation or feature branch.
- Do not move the custom-domain aliases until the main deployment is Ready and its slug has passed smoke tests.

## Required release sequence

1. Update the feature branch with the latest `origin/main`.
2. Pass the Pull Request Release Guard and the feature-specific tests.
3. Verify the Preview deployment, including responsive widths and relevant authenticated flows.
4. Merge through a PR into `main`.
5. Confirm `/version.json` reports the expected main SHA, branch `main`, and environment `production`.
6. Pass the automated formal-domain smoke test.
7. Keep the previous Ready Production deployment as the rollback point.

## Rollback boundary

- A frontend/API release rollback moves Vercel aliases to the previous Ready deployment.
- Never restore or mutate Neon merely to roll back application code.
- Database restore, migration, branch deletion, and secret rotation require separate explicit approval.

## Public statistics

- `public/site-stats.json` is the single source for homepage scale claims.
- Never hard-code counts in HTML or translation maps.
- The weekly read-only audit compares published claims with Production data.
- Update statistics through a reviewed PR using `DATABASE_URL=... node scripts/update-site-stats.mjs --write`.
- Public display rounds down, so claims remain conservative as data grows.
