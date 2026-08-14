# Canonical static source migration

## Scope and baseline

- Production/main baseline: `73cb580a6fe08ca8c03920e0c54e419aba362057`
- Audit and migration date: 16 July 2026 (Australia/Melbourne)
- Scope: make `public/` the sole authoritative static source, migrate the local static server and relevant tests, and retire obsolete tracked `dist/` output.
- Explicitly unchanged: Production configuration, database schema/data, valuation and scoring logic, P0 public score contract, API response schema, routes/rewrites, page content, and dependencies.

## Before-change behavior

### Production

The deployed chain was already `main checkout -> generate public/version.json -> Vercel public/* rewrites + api/*.js`. Read-only Production checks returned:

- `/version.json`: HTTP 200, commit `73cb580a6fe08ca8c03920e0c54e419aba362057`, branch `main`, environment `production`.
- `/`: HTTP 200; SHA-256 `f4c119b800596ecda4f45a77b02fbf908ca0de00ad77c67b25a4e3dffc486046`.
- `/opportunities/`: HTTP 200; SHA-256 `23f0872e8d2799a0537b3265d9d3b10d14e7e3e388e4ff18d1fba994b64d0f7d`.
- `/api/opportunity?suburb=Balwyn&strategy=balanced&maxResults=5`: HTTP 200; Balwyn score value `49`, display `49/100`, complete public score object, `futureOpportunityIndex=49`, and no `legacyOpportunityScore` or `legacyOpportunityType`.

The build command was and remains `node scripts/generate-version.mjs`. It writes only ignored `public/version.json`; there is no Vercel output-directory or framework override. The deployed homepage matched `public/index.html`.

### Local runtime and tests

Before this migration, `dev-server.mjs` exposed the repository root. Root `index.html`, `app.js`, and related files formed a stale second local runtime while Production used `public/`. Several root-level tests also read that second copy.

Pre-change validation:

| Validation | Result |
| --- | --- |
| P0 Opportunity | PASS, 40/40 |
| Investor Watch baseline | PASS, 153/153 |
| Release safeguards | PASS, 6/6 |
| Governance | PASS, 4/4 |
| Content scan | PASS |
| Production build | PASS |
| JavaScript syntax checks | PASS |
| `npm test` | 100/102; two documented pre-existing failures |
| `node --test tests/*.mjs` | 919/950; 31 documented pre-existing failures |

## Root/public duplicate inventory and decision

The detailed pre-change SHA-256 inventory remains in `docs/source-dist-test-governance.md`. Six pairs were byte-identical: `404.html`, the three admin files, `styles.css`, and the WeChat QR image. Five root files were stale/different: `index.html`, `app.js`, `opportunity-gate.js`, `robots.txt`, and `sitemap.xml`.

Production/Vercel used only the `public/` copies. Searches covered static and dynamic imports, `require`, runtime file reads, package scripts, GitHub Actions, Vercel rewrites, API modules, tests, documentation, and string paths. After migrating the active local server and current tests, no active runtime consumer remained. The 11 root copies were therefore removed; no content was merged from the stale copies into Production files.

## After-change runtime

`public/` is now the sole static authority:

- Vercel continues to serve the same `public/` files and API functions under the unchanged `vercel.json`.
- `dev-server.mjs` serves only `public/`, preserves API routes, returns `public/404.html` for non-API misses, and leaves unknown API routes to an API-style 404.
- package syntax checks and relevant source-reading tests point explicitly to `public/`.
- no copy-back step, symlink, or second generated static tree was introduced.

Local server smoke results after migration:

| Path | Result |
| --- | --- |
| `/` | 200, `text/html` |
| `/opportunities/` | 200, `text/html` |
| `/app.js` | 200, JavaScript MIME |
| `/styles.css` | 200, CSS MIME |
| `/missing-page` | 404 using canonical HTML |
| traversal attempt to root `package.json` | 404; file not exposed |
| `/api/health` | 200, JSON |

## `dist/` consumer investigation and decision

`dist/` contained 246 tracked legacy HTML outputs. The investigation found:

- no Vercel rewrite, output setting, build command, API runtime read, GitHub Actions job, npm development/test/build command, Docker file, packaging/archive/release script, or current test consumer;
- no documented live offline deployment or download consumer;
- the most recent `dist/` history was legacy database-backed page regeneration, and every file is recoverable from baseline SHA `73cb580a6fe08ca8c03920e0c54e419aba362057` or earlier Git history;
- the only executable writers were `scripts/generate-suburb-pages.js` and `scripts/generate-ai-pages.js`; neither is part of build or CI, and both require mutable external data.

With those consumers excluded, all stop-tracking conditions were met subject to clean-checkout Preview validation. The 246 tracked files were removed, `/dist/` was added to `.gitignore`, and both legacy generators now default to ignored `tmp/legacy-suburb-pages/`. The generators were not run and no database was accessed.

## Governance

`npm run verify:generated` is now a read-only canonical-source rule check. It:

- fails if `dist/` exists;
- fails if any of the 11 governed root static duplicates returns;
- requires key `public/` entries;
- checks that the local server serves `PUBLIC_DIR` mapped to `public/`;
- rejects either legacy generator writing directly to `dist/`.

It performs no writes, generation, deletion, network request, or database connection. Its fixture tests cover the compliant case and each violation class.

## Post-change validation

| Command/check | Result |
| --- | --- |
| `npm run verify:generated` | PASS |
| `npm run test:governance` | PASS, 5/5 |
| P0 Opportunity targeted suite | PASS, 40/40 |
| `npm run test:investor-watch:baseline` | PASS, 153/153 |
| `npm run test:release-safeguards` | PASS, 6/6 |
| `npm run test:content` | PASS |
| `npm run build` | PASS; ignored local `public/version.json` only |
| JavaScript syntax checks | PASS |
| local static/API smoke | PASS, 7/7 |
| `npm test` | 101/102; only the pre-existing CDP/database-call assertion remains |
| `node --test tests/*.mjs` | 920/951; the same 31 broad-suite failures remain, plus one new passing governance test |

The 31 broad-suite failures retain the PR A categories: stale historical assertions, unavailable browser prerequisites, restricted localhost tests, Production/network diagnostics, database/environment suites, and Node parent-suite failure records. No failure was skipped, deleted, or weakened. A standalone historical `mobile-regression-test.mjs` now loads the canonical app but retains old behavioral expectations and is recorded for PR C rather than changing those assertions here.

## Equivalence, risk, and rollback

The deployed files, routes, API modules, P0 contract, score value/display, valuation logic, and Vercel configuration are unchanged. The principal risk is an undocumented external consumer of tracked `dist/`; repository, history, build, deployment, and documentation searches found none. Preview must confirm clean-checkout behavior before review.

Rollback is a single PR revert to baseline `73cb580a6fe08ca8c03920e0c54e419aba362057`. The removed root and `dist/` files are recoverable from that SHA. No database, environment, Production alias, or external resource rollback is required.
