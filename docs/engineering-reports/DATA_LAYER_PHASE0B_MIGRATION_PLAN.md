# Data Layer Phase 0B — Migration Readiness & Environment Audit

Date: 2026-06-19  
Repository: `/Users/FrankAI/Documents/澳洲房地产评估系统`  
Scope: Data Layer Phase 0 foundation migration readiness  
Commit under review: `c5cec2f`  
Remote baseline: `origin/main` at `83775e9`  
Latest remediation check: 2026-06-19 21:12 AEST  

## 1. Executive Decision

**Status: Preview migration completed. NO-GO for Production migration.**

The Phase 0 data-layer code and migration are structurally low-risk.

An initial audit found that the Vercel Preview `DATABASE_URL` resolved to the same Neon endpoint as the known production/main database:

```text
Preview Vercel DB host:    ep-winter-band-a7qym6bq-pooler
Production/local DB host:  ep-winter-band-a7qym6bq-pooler
DB_DISTINCT: NO
```

That blocker was remediated by overwriting the Vercel Preview `DATABASE_URL` with the `stripe-preview` Neon branch. A clean Preview deployment was then created and runtime-tested:

```text
Preview deployment: https://aushomevalue-9onlvc2gk-frankyhf.vercel.app
Scoresby valuation: OK, midpoint=810,808, comparableCount=12, draft token present
Oakleigh South valuation: midpoint=null, comparableCount=0
```

This behavior matches the isolated Preview seed database profile: Scoresby data exists; Oakleigh South production data does not. Therefore Preview isolation is now verified at runtime.

Migration-012 was then executed on the verified Preview database only. The three target tables now exist in Preview:

```text
data_source_registry
suburb_planning_summary
property_planning_cache
```

Production migration remains out of scope until separately approved.

## 2. What Was Reviewed

Reviewed items:

- Git state for current local branch and remote baseline.
- Vercel environment variable names and target environments.
- Vercel Preview `DATABASE_URL` fingerprint using read-only queries.
- Local `.env` database fingerprint as the known production/main reference.
- Existing table presence for the three new Phase 0 data-layer tables.
- Row-count sanity checks for core production data tables.
- Static safety of `db/migration-012-data-layer-foundation.sql`.

Actions performed:

- Vercel Preview `DATABASE_URL` was overwritten with the `stripe-preview` Neon branch connection string.
- A clean Preview deployment was created from `git archive HEAD`.
- Runtime API checks were performed against that Preview deployment.
- Migration-012 was executed on the verified Preview database.
- Post-migration table-existence checks passed.
- Post-migration Preview smoke tests passed.

Actions not performed:

- No `git push`.
- No DDL/DML write against Production.
- No Stripe, webhook, or payment configuration changes.

## 3. Current Git State

Current local HEAD:

```text
c5cec2f feat: add data layer foundation schema and derived planning utilities
```

Remote baseline:

```text
origin/main = 83775e9
```

`c5cec2f` is local-only at the time of this audit. It has not been pushed or deployed.

The Phase 0 commit contains the intended foundation files:

| File | Role |
| --- | --- |
| `api/_db.js` | Adds `ensureDataLayerFoundationSchema()` |
| `db/migration-012-data-layer-foundation.sql` | Creates three derived data-layer tables |
| `docs/engineering-reports/DATA_LAYER_PHASE0_DESIGN.md` | Phase 0 design documentation |
| `lib/data-source-registry.js` | Data-source registry service |
| `lib/planning-derived-service.js` | Derived planning record helpers |
| `scripts/backfill-planning-derived-dry-run.mjs` | Read-only dry-run script |
| `tests/data-layer-foundation-tests.mjs` | 80 contract/static tests |

Previously verified tests:

```text
node tests/data-layer-foundation-tests.mjs  -> 80/80 pass
node --check relevant JS files              -> pass
git diff --check                            -> pass
```

## 4. Vercel Environment Inventory

`npx vercel env ls` showed the following relevant environment variables:

| Variable | Environment |
| --- | --- |
| `DATABASE_URL` | Preview |
| `DATABASE_URL` | Production |
| `TOKEN_SIGNING_SECRET` | Preview |
| `TOKEN_SIGNING_SECRET` | Production |
| `REPORT_ACCESS_SESSION_SECRET` | Preview, Production |
| `STRIPE_SECRET_KEY` | Production |
| `STRIPE_PRICE_ID_REPORT_399` | Production |
| `STRIPE_WEBHOOK_SECRET` | Preview |
| `STRIPE_WEBHOOK_SECRET` | Production |
| `STRIPE_MODE` | Production |
| `APP_BASE_URL` | Production |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Preview |

Production `DATABASE_URL` could not be safely fingerprinted via `vercel env pull`: the pulled value was effectively empty/opaque. Therefore the "Production reference" in this audit is the local `.env` database, which matches the known production/main data profile used throughout earlier recovery work.

The Preview `DATABASE_URL` was pullable and queryable.

## 5. Database Fingerprints

### 5.1 Production/Main Reference (`.env`)

Read-only query result:

| Field | Value |
| --- | --- |
| Host short | `ep-winter-band-a7qym6bq-pooler` |
| Host SHA-12 | `857c09340858` |
| Database | `neondb` |
| Schema | `public` |
| Pooled | `true` |
| `data_source_registry` | absent |
| `suburb_planning_summary` | absent |
| `property_planning_cache` | absent |
| `comparable_sales` | 4,977 rows |
| `vicplan_zones` | 51,366 rows |
| `vicplan_overlays` | 174,682 rows |
| `report_snapshots` | 2 rows |

### 5.2 Vercel Preview Environment

Read-only query result:

| Field | Value |
| --- | --- |
| Host short | `ep-winter-band-a7qym6bq-pooler` |
| Host SHA-12 | `857c09340858` |
| Database | `neondb` |
| Schema | `public` |
| Pooled | `true` |
| `data_source_registry` | absent |
| `suburb_planning_summary` | absent |
| `property_planning_cache` | absent |
| `comparable_sales` | 4,977 rows |
| `vicplan_zones` | 51,366 rows |
| `vicplan_overlays` | 174,682 rows |
| `report_snapshots` | 2 rows |

### 5.3 Initial Isolation Conclusion

```text
DB_DISTINCT = NO
```

At initial audit time, Preview pointed to the same endpoint/data profile as the known production/main database. This was the blocker.

### 5.4 Remediation Verification

After updating Vercel Preview `DATABASE_URL`, a clean Preview deployment was created from `HEAD` using `git archive` to avoid uncommitted local files:

| Field | Value |
| --- | --- |
| Deployment URL | `https://aushomevalue-9onlvc2gk-frankyhf.vercel.app` |
| Deployment target | Preview |
| Source | `git archive HEAD` clean temp directory |
| Production alias touched | No |
| Production env touched | No |

Runtime read-only API checks:

| Address | Result |
| --- | --- |
| `8 Melrose Ct, Scoresby VIC 3179` | `midpoint=810808`, `comparableCount=12`, `reportDraftToken=true` |
| `18 Moresby St, Oakleigh South VIC 3167` | `midpoint=null`, `comparableCount=0`, `reportDraftToken=true` |

Interpretation:

- Scoresby exists in the Preview seed dataset.
- Oakleigh South exists in production/main but not in the Preview seed dataset.
- Therefore this Preview deployment is no longer using the production/main data profile.

## 5.5 Preview Migration Result

Migration target:

```text
ep-young-violet-a7xmpsmz-pooler.ap-southeast-2.aws.neon.tech
```

Pre-migration:

| Table | Before |
| --- | --- |
| `data_source_registry` | `null` |
| `suburb_planning_summary` | `null` |
| `property_planning_cache` | `null` |

Post-migration:

| Table | After |
| --- | --- |
| `data_source_registry` | `data_source_registry` |
| `suburb_planning_summary` | `suburb_planning_summary` |
| `property_planning_cache` | `property_planning_cache` |

Execution output included:

```text
MIGRATION_012_PREVIEW_OK
```

Post-migration Preview smoke test:

| Address | Result |
| --- | --- |
| `8 Melrose Ct, Scoresby VIC 3179` | HTTP 200, `midpoint=810808`, `comps=12`, `hasDraft=true` |
| `18 Moresby St, Oakleigh South VIC 3167` | HTTP 200, `midpoint=null`, `comps=0`, `hasDraft=true` |

The smoke result is consistent with the isolated Preview seed data profile.

## 6. Migration-012 Static Safety Review

File:

```text
db/migration-012-data-layer-foundation.sql
```

The migration creates three lightweight derived tables:

1. `data_source_registry`
2. `suburb_planning_summary`
3. `property_planning_cache`

Static safety findings:

| Check | Result |
| --- | --- |
| No `DROP` | Pass |
| No `TRUNCATE` | Pass |
| No `DELETE` | Pass |
| No mutation of `vicplan_zones` / `vicplan_overlays` | Pass |
| No `geometry` / `geography` columns | Pass |
| Creates only new derived tables and indexes | Pass |
| Uses `CREATE TABLE IF NOT EXISTS` | Pass |
| Uses `CREATE INDEX IF NOT EXISTS` | Pass |
| Planning score constrained to `[-15, 15]` | Pass |
| `heritage_status` defaults to `unknown` | Pass |

The SQL itself is acceptable for a controlled migration. The initial unsafe target-environment issue has been remediated for Preview, but Production remains a separate approval step.

## 7. Expected Storage Impact

The migration creates empty derived tables and B-tree indexes only.

Expected immediate storage impact:

```text
< 1 MB
```

There are no copied geometries and no large spatial indexes in migration-012.

Future storage growth will depend on backfill choices:

- `data_source_registry`: tiny metadata table.
- `suburb_planning_summary`: hundreds of rows, tiny.
- `property_planning_cache`: grows with property queries; still much smaller than VicPlan geometry tables.

## 8. Product Impact If Migration Is Run Correctly

If run against the correct isolated Preview database:

- Existing valuation flow should be unaffected.
- Existing `$3.99` report payment flow should be unaffected.
- Existing Opportunity / Investor Watch UI should be unaffected.
- New derived planning tables are not automatically used unless future code paths read from them.
- Existing PostGIS VicPlan tables remain untouched.

The migration is a foundation step, not a product-facing launch by itself.

## 9. Blockers

### B1 — Preview DB Is Not Isolated

Severity: High  
Status: Resolved

Initial audit finding: Preview Vercel `DATABASE_URL` resolved to the same Neon endpoint as the production/main reference.

Do not run Preview migration while:

```text
Preview host == ep-winter-band-a7qym6bq-pooler
```

Required fix:

Set Preview `DATABASE_URL` back to a separate Neon branch/endpoint, for example the known `stripe-preview` branch or another dedicated preview branch.

Resolution:

- Vercel Preview `DATABASE_URL` was overwritten.
- A fresh Preview deployment was created.
- Runtime behavior now matches the isolated Preview seed database.

### B2 — Production `DATABASE_URL` Cannot Be Directly Fingerprinted From Vercel Pull

Severity: Medium  
Status: Blocking for production migration, not blocking for code review

`vercel env pull --environment=production` did not expose a usable `DATABASE_URL` value. This is common with sensitive encrypted values, but it means we should not claim direct runtime identity from that command.

Before any production migration, verify the production database identity through one of:

- Vercel Dashboard visual confirmation.
- A temporary read-only diagnostic endpoint, if approved.
- Vercel API / CLI workflow that confirms host without exposing credentials.
- Direct Neon Console confirmation of the Production branch connection string.

## 10. Recommended Execution Plan

### Step 1 — Preview DB Isolation

Completed.

The Preview environment has been restored to an isolated database profile and verified through a fresh deployment.

### Step 2 — Restore Preview DB Isolation

In Vercel Dashboard:

```text
Project -> Settings -> Environment Variables -> DATABASE_URL -> Preview
```

Completed through Vercel CLI. Preview must remain on the dedicated preview Neon branch. It must not be `ep-winter-band-a7qym6bq-pooler`.

Expected pattern after fix:

```text
Production/Main: ep-winter-band-...
Preview:         ep-<different-branch>-...
```

### Step 3 — Re-run Read-only Fingerprint

Runtime verification has effectively confirmed:

```text
DB_DISTINCT = YES
```

Recommended additional checks before migration, if a direct Preview connection string is available in the local shell:

- Host short names differ.
- Host SHA-12 values differ.
- Preview row profile differs from production/main.
- New tables are still absent or explicitly known.

### Step 4 — Run Migration-012 on Verified Preview Only

Completed.

Migration was executed using the verified Preview connection string explicitly, not `.env`.

Before executing, run:

```sql
SELECT to_regclass('public.data_source_registry');
SELECT to_regclass('public.suburb_planning_summary');
SELECT to_regclass('public.property_planning_cache');
```

Then execute:

```text
db/migration-012-data-layer-foundation.sql
```

After executing, verify:

```sql
SELECT to_regclass('public.data_source_registry');
SELECT to_regclass('public.suburb_planning_summary');
SELECT to_regclass('public.property_planning_cache');
```

Result: all three exist.

### Step 5 — Push Code Only After Review

After Codex review accepts `c5cec2f`, push the code.

Do not treat a push as permission to migrate production.

### Step 6 — Deploy Preview

Already completed for runtime verification:

```text
https://aushomevalue-9onlvc2gk-frankyhf.vercel.app
```

Deploy `c5cec2f` to Preview again after review if a canonical Preview URL is required.

Verify:

- Home page 200.
- Valuation API still returns midpoint and comparables.
- Payments remain in expected mode for the target environment.
- No new data-layer table is required for existing user flows.

### Step 7 — Preview Smoke Tests

Run:

- Free valuation flow.
- Paid report disabled/enabled behavior appropriate for Preview.
- Planning signal report rendering.
- Opportunity page.
- Investor Watch promotional UI.

Completed minimum smoke:

- Scoresby valuation still returns a valid estimate and draft token.
- Oakleigh South remains absent from the Preview seed profile.

### Step 8 — Observe Preview

Let Preview run with the new schema before touching Production.

### Step 9 — Production Migration Plan

Only after Preview is verified:

1. Reconfirm Production DB identity.
2. Confirm the current production table counts.
3. Confirm no duplicate table-name conflicts.
4. Run migration-012 during a low-traffic window.
5. Verify table existence.
6. Do not run any backfill until separately approved.

## 11. Rollback Plan

Because migration-012 only creates new tables and indexes, rollback is unlikely to be needed for product behavior. Existing code should continue without reading these tables unless explicitly wired.

If a rollback is required, do not immediately drop tables in Production. First:

1. Disable any code path reading the new tables.
2. Deploy rollback code.
3. Confirm product behavior.
4. Only then consider dropping the new tables after data-loss review.

For Preview, dropping the new empty tables is acceptable if the Preview branch is confirmed isolated.

## 12. Final Recommendation

Proceed with code review of `c5cec2f`.

Preview `DATABASE_URL` has been corrected, runtime-verified, and migration-012 has been applied to the Preview database.

The safe next action is:

```text
Review and commit the Phase 0B report + helper script, then decide whether to push c5cec2f and related support files.
```

Production migration must remain separate and should not be bundled with Preview validation.
