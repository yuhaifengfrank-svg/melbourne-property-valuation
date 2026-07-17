# Database credential and environment isolation response

## Scope

This hotfix responds to an embedded database credential found in a manually invoked diagnostic script. The credential was revoked or rotated before the code change, legal Vercel variables were updated, and Production health was verified by the operator.

The response deliberately does not reproduce old or new credentials, connection strings, database usernames, passwords, tokens, or host details.

## Changes

- Remove the tracked diagnostic script after confirming that no package command, CI workflow, application module, or test imports it.
- Reuse the environment selection guard in `api/_db.js` from the valuation service instead of maintaining a second selection rule.
- Require Preview to use its dedicated URL and approved-host variable with an exact hostname match.
- Require non-Preview environments to use only the normal database variable.
- Prohibit fallback in either direction.
- Replace raw database exception logging and public error detail in the affected valuation endpoints with fixed, non-sensitive messages.
- Add regression coverage for environment selection, fail-closed endpoints, and error redaction.

## Operational follow-up

Git history is not rewritten by this hotfix. Historical credential copies must be handled separately through a coordinated repository-security process after credential revocation. No database, Vercel environment, Production deployment, or historical branch is modified by this change.

The repository's Vercel Preview build completed successfully after the hotfix. Live Preview endpoint validation remains a required Draft PR check.
