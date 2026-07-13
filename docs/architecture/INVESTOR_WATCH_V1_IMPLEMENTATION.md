# Investor Watch V1 implementation baseline

Status: implementation in progress  
Production base: `main` at `3fff7d7`  
Implementation branch: `feat/investor-watch-v1`

## Product boundary

Investor Watch is a membership and monitoring layer over the existing valuation,
Future Opportunity, planning, report-entitlement and customer-funnel systems. It
must not duplicate those systems or create a separate user identity.

## Reused authorities

| Concern | Existing authority |
|---|---|
| Customer identity | `lead_contacts.id` |
| Consent | `consent_records` |
| Suburb metrics | `suburb_metrics` |
| Opportunity score | `lib/future-opportunity-outlook.js` |
| Planning state | planning summary/cache and planning signal service |
| Purchased reports | `report_entitlements` and report snapshots |
| Email transport | Resend transport |
| Payment primitives | Stripe client and webhook event idempotency |

## New V1 responsibilities

- One-time Magic Link authentication and revocable member sessions.
- Free membership record and server-enforced watch limits.
- Canonical suburb/property watch items.
- Versioned opportunity-score history.
- Planning fingerprints and change events.
- Notification preferences, disabled by default in the MVP.
- A bilingual member dashboard.

## API constraint

The production baseline already consumes the current API function budget.
Member actions must be routed through one `api/member.js` function and watch
actions through one `api/investor-watch.js` function. Action-specific handlers
belong under `lib/`, not under `api/`.

## Delivery gates

1. Migration, rollback and schema tests pass without a database connection.
2. Migration is dry-run and applied only on a dedicated Neon Preview branch.
3. Authentication and ownership tests pass with mock SQL.
4. Existing valuation, opportunity, payment and report tests remain green.
5. Preview browser flow passes before any production migration or CTA change.

## Explicitly out of MVP

- Live Stripe subscriptions.
- Automated email alerts.
- AI-generated investment summaries.
- Production database writes.
- Changes to the existing $3.99 report purchase flow.
