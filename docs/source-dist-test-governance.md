# Source, generated output, and test governance baseline

> Historical PR A baseline. PR B implementation and current policy are recorded in `docs/canonical-source-migration.md`.

## Scope and baseline

- Production baseline: `3a2cb8a4e95534fc24ae7d7b70af8aa332808568`
- Audit date: 16 July 2026 (Australia/Melbourne)
- Phase: PR A only — evidence, read-only drift detection, and governance entry points
- Explicitly unchanged: valuation output, scoring logic, P0 contract, API schema, pages, Production data, `dist/`, and all source/generated files

This document records the current state. It does not authorize the source migration proposed for PR B or test assertion changes proposed for PR C.

## 1. Current runtime and deployment architecture

### Production

1. GitHub `main` is connected to Vercel through Git Integration. The release safeguard rejects executable manual Production deployment commands.
2. `.vercel/project.json` reports no framework, build-command, output-directory, install-command, or root-directory override.
3. `package.json` defines both `build` and `vercel-build` as `node scripts/generate-version.mjs`.
4. That build writes only `public/version.json`, using Vercel/Git metadata. It contains expected non-deterministic SHA, environment, and generation time and is intentionally ignored by Git.
5. `vercel.json` rewrites `/`, assets, legal/admin pages, suburb pages, opportunity pages, Investor Watch, research pages, sitemap, robots, and site statistics explicitly to `public/`.
6. Vercel discovers `api/*.js` as serverless functions. Aggregated rewrites route legacy API URLs into the current API functions.
7. The final catch-all goes to `api/not-found`; there is no route to `dist/`.

Therefore the evidenced Production chain is:

`Git main checkout -> npm install -> generate public/version.json -> Vercel serves public/* rewrites + api/*.js`

`dist/` does **not** participate in the current Production build, Vercel output selection, rewrites, API runtime, GitHub Actions, or release smoke test.

### Local runtime

`dev-server.mjs` serves the repository root with `express.static(__dirname)` and dynamically loads `api/*.js`. Root `index.html`, `app.js`, and `styles.css` are consequently active in that legacy local workflow. Several default tests also read root files directly. This is why Production authority (`public/`) does not yet make root duplicates safe to delete.

No service worker or web manifest registration was found. Redirects, rewrites, and function duration are contained in `vercel.json`; no separate headers configuration was found. Runtime file reads are used for data/models and migrations, but no runtime logic reads `dist/`.

## 2. Duplicate and dual-source inventory

SHA-256 evidence for the primary root/public pairs:

| Root | Production path | Relationship | Root SHA-256 | Production SHA-256 | Current consumers |
| --- | --- | --- | --- | --- | --- |
| `index.html` | `public/index.html` | different | `21ee20669ccf40a9e58e110577d4c9bb16e1a2c077891b6c17272ae728019cb8` | `f4c119b800596ecda4f45a77b02fbf908ca0de00ad77c67b25a4e3dffc486046` | root local server/tests; public Vercel |
| `app.js` | `public/app.js` | different | `59c12bb2b8b44ced2d094b1fd6139576dd208aad8ac9d9e1d768ec1def059b39` | `8ae9672b36c1bfb92561c1a27246fb6465992ac30458c26030580b91e4755f6a` | root tests/local; public Vercel |
| `styles.css` | `public/styles.css` | identical | `fc899f02db8a90f65961044cf4937cea7209e6b20951156a2b9b96d2a2d72dd8` | same | root local; public Vercel |
| `admin.html` | `public/admin.html` | identical | `a2045df3937f26950fdc2314c9ef620fa02eda9864e84e14738599b58b8aef96` | same | root legacy; public rewrite |
| `admin.js` | `public/admin.js` | identical | `231a9175e7d34bb78bd0c6fec208fbca27d858a4b68c589f44ec04d22fc94bff` | same | root legacy; public rewrite |
| `admin.css` | `public/admin.css` | identical | `cb2f9e6406cb4c30a8029d5e29c972630f4d0555271eda851a35ba01762fc6ce` | same | root legacy; public rewrite |
| `404.html` | `public/404.html` | identical | `4ec0f145f40b20105a51341467ed1c4d8191787b491b470b59c4050de7e8d72a` | same | historical/static; public asset |
| `robots.txt` | `public/robots.txt` | different | `462ed98b332c9f0cb4deba0bbcb06d872ef95a7550d6c995046b721332dc6759` | `9bdfd893ab80e920c01f8f8e31355361d60d0ef57149acd927c046ace4eaa431` | public rewrite is Production |
| `sitemap.xml` | `public/sitemap.xml` | different | `88187645a892da0b2ddd535c25e42dc20f336f9b49c2e51614438b228d031cbd` | `734220fd3d2dff1566692c8fbac0a88e7c9c915ca325731e04857719048768b2` | public rewrite is Production |
| `opportunity-gate.js` | `public/opportunity-gate.js` | different | `4acc96ac85c8623ebc424c217826bdb27d9f0f0d24db94f47970f54de2b8a1bd` | `ac330d7b85955bb770358134da2224d4cac62e658fdcd6b80d98c7dbdf2c8213` | public page uses public copy |
| `assets/aushomevalue-wechat-qr.jpg` | `public/assets/aushomevalue-wechat-qr.jpg` | identical | `277885a3780e7fb1481d7ed8235adf8848b446c1d23988d8bc8263951c53b356` | same | public asset path is Production |

Other exact duplicates exist in historical documentation/data, but none is safe to delete in PR A because operational ownership or data provenance is not established.

## 3. What `dist/` is and how it was generated

`dist/` contains 246 tracked HTML files: 238 suburb pages, seven opportunity pages, and `top-opportunities-snippet.html`. All 246 have same-path files in `public/`, and all 246 differ by SHA-256.

Evidence classifies `dist/` as a **tracked legacy generated artifact**, not current source and not current deployment output:

- `scripts/generate-suburb-pages.js` writes `dist/suburb/` and `dist/opportunities/`, queries `suburb_metrics`, and requires `DATABASE_URL`.
- `scripts/generate-ai-pages.js` reads and rewrites HTML in `dist/` using the Production opportunity API.
- Historical commits show `dist/` regeneration and later syncing to `public/`.
- Current `public/` has separate generators: `generate-suburb-pages-v2.cjs`, `generate-top-pages.cjs`, `generate-research-pages.cjs`, and `generate-sitemap.cjs`, plus subsequent direct/manual edits documented in engineering reports.
- The current build command does not invoke any of those content generators.
- No active Vercel or GitHub Actions reference to `dist/` exists.

The old `dist/` generator was not executed during this audit: `DATABASE_URL` is not present in the ordinary shell, the generator writes directly into tracked `dist/`, and its result depends on mutable database state. The `public/` generators likewise write in place and some query Production. Running them would not be a clean, isolated, deterministic build.

## 4. Drift measurement and causes

`npm run verify:generated` performs a read-only tree comparison. It changes no file, prints every difference, and returns non-zero for drift. The only default exclusion is `version.json`, whose SHA/time/environment are expected build-time values.

Baseline result:

- identical: 0
- same-path content differences: 246
- `dist/`-only files: 0
- `public/`-only files: 41
- total reported drift: 287

The 246 content differences are systematic, not timestamps: `public/` pages have evolved through newer generators, legal/SEO/content work, P0 Opportunity contract work, and direct page changes while `dist/` last changed in older generation commits. The 41 `public/`-only files are deployed application/legal/admin/research/Investor Watch assets that never belonged to the legacy `dist/` tree. They are reported separately so tree scope is explicit rather than silently ignored.

## 5. Test classification matrix

| Class | Current entry/examples | CI | External needs | Ordinary local suitability |
| --- | --- | --- | --- | --- |
| Default mixed suite | `npm test`; root address/integration/regression plus model and large-lot tests | none | mocks, VM; some DB fallback paths | currently unstable: 100/102 |
| P0 contract | four Future Opportunity/API/page/narrative files | indirectly covered in Investor Watch subset, not PR guard | none | stable: 40/40 |
| Investor Watch baseline | `npm run test:investor-watch:baseline` | not PR guard | mocks only | stable: 153/153 |
| Release safeguard | `npm run test:release-safeguards` | PR guard | Git history/static config | stable: 6/6 |
| Content scan | `npm run test:content` | none | none | stable |
| Governance | `npm run test:governance` | new in PR A | temporary fixture directories only | stable: 4/4 |
| Database/integration | planning, migration, DB environment and data-layer suites | scheduled workflows exercise selected DB jobs | dedicated URLs/secrets for live verification | mock/static tests local; live checks must be explicit |
| Browser/E2E | layout, responsive, property-type, report purchase/viewer | none | Playwright browsers and/or localhost listener | not suitable in restricted shell without prerequisites |
| Production smoke/audit | `smoke:production`, production valuation audits | Production smoke on pushes to `main` | Production network; expected SHA for smoke | explicit only; never unit/default |
| One-off diagnostics | responsive v2, production audit batches, `v2-fix`, phase audit scripts | none | varies | retain but do not present as stable default |

The repository has 71 files under `tests/` plus root-level test/diagnostic scripts. Many are standalone scripts rather than `node:test` suites, which is why blindly executing `tests/*.mjs` mixes incompatible environments.

## 6. Root cause of the two `npm test` failures

1. `integration-test.mjs` — “CDP >=3 collector comps means DB is not called”: the assertion expects zero DB calls, but the current valuation service invokes a database-backed path beyond the old fallback assumption. The observable count is consistently one. This is an outdated integration assumption or a product defect; deciding which requires validating the intended valuation contract. PR A does not change either code or assertion.
2. `regression-test.mjs` — the test runs root `app.js` in a VM context without `setTimeout`. Root `app.js` now schedules `loadHomeOpportunities`, so evaluation fails before assertions. This is a test harness environment defect, not a browser runtime defect. PR C should add the required timer mock after confirming the test remains meaningful.

## 7. Classification of the 31 full-suite failures

The reproduced result is 915/946 passed and 31 failed. Node reports both leaf failures and some containing suites/files, so category totals below describe the observed failure records rather than pretending every line is an independent product defect.

- **Stale static/product assertions:** Investor Watch function count expects 11 while current verified count is 12; layout More-menu expects the old Investor Watch placement; four Phase 0A opportunity assertions expect old disclaimer/strategy/meta behavior; `v2-fix` contains historical page expectations.
- **Browser launch prerequisites:** layout browser screenshots, property-type auto-select, report-viewer overflow, and responsive suites require installed browsers and permissions unavailable in the restricted environment.
- **Local server restriction:** all 12 report-purchase E2E cases fail at `listen(127.0.0.1)` with `EPERM` before scenario assertions.
- **Production/network diagnostics:** four production valuation audit batch files require Production network access and are diagnostic scripts, not isolated tests.
- **Database/environment suites:** planning-signal Phase 1A includes environment-sensitive/live verification assumptions and exits at file level in the broad mixed run.
- **Container failures:** Node also reports failed parent suites/files for some failed children (for example Navigation and Browser screenshots); those wrapper failures contribute to the reported 31.

No failing test is deleted, skipped, or weakened in PR A.

## 8. Recommended authority and tracking policy

### Authority candidate

For deployed static content, `public/` is the only evidence-backed authority candidate because Vercel serves it explicitly. `api/` and `lib/` remain runtime source. Root static files remain active only for the legacy local server and tests and cannot be deleted until those consumers move to `public/` or an agreed source directory.

This audit does **not** designate every file in `public/` as hand-maintained source. Many are generated outputs without deterministic build integration. PR B must first decide whether templates/data become the canonical source or whether selected `public/` pages remain canonical content.

### `dist/` policy recommendation

Do not delete `dist/` in PR A. Evidence says it is not deployed, but stopping tracking should occur only in PR B after a clean-checkout Vercel build and preview prove identical Production routes/assets and after owners confirm it has no offline publication consumer. If retained, it needs one isolated deterministic generator and CI verification; the current database/Production-dependent in-place chain does not meet that standard.

## 9. Recommended standard test commands

PR C should establish these roles after contract review:

- `npm test`: stable local, no Production, live DB, browser, or listener dependency
- `npm run test:unit`: pure functions/services
- `npm run test:contract`: P0/API/page contracts
- `npm run test:integration`: mocked/local integration with declared prerequisites
- `npm run test:db`: explicit isolated DB tests
- `npm run test:e2e`: browser + local service prerequisites
- `npm run test:production`: read-only Production smoke/diagnostics
- `npm run test:release`: release safeguards and build checks
- `npm run test:all`: orchestrated union with clear skips/prerequisite failures
- `npm run verify:generated`: read-only source/output drift report

PR A adds only `verify:generated` and `test:governance`; it does not relabel existing mixed suites before PR C.

## 10. Phased migration and rollback

1. **PR A (this PR):** land evidence, read-only detection, and detector tests. Roll back by reverting this PR; runtime output is unaffected.
2. **PR B after PR A merge:** capture Production route/content/API/build baselines; choose canonical static source; update local server/tests/generators; reproduce outputs in a temporary directory; compare preview; then remove only proven duplicates or stop tracking `dist/`. Roll back by reverting PR B to PR A's main SHA; no database rollback.
3. **PR C after PR B merge:** separate test entry points, fix harness prerequisites, and update only assertions proven obsolete by current contracts. Roll back test orchestration independently without reverting PR B source governance.

## 11. Human decisions required before PR B

- Should template/data inputs become canonical for generated suburb/opportunity/research pages, or should selected `public/*.html` remain editorial source?
- Does any offline, archival, or external consumer still use tracked `dist/`?
- Should the legacy root `dev-server.mjs` serve `public/`, or should a new explicit source directory feed both local and Vercel outputs?
- Which current root/public differences are intentional product differences versus missed synchronization?
- Are database-derived pages allowed to change whenever regenerated, or must generation use a versioned snapshot?
- Is the extra database call with three CDP comparables intended behavior?
- Which historical Phase 0A/V2 assertions represent contracts that must still hold?
- Which browser engines and Node version are required in CI for PR C?

Until these decisions are made and PR A is merged, do not begin PR B.

## 12. PR A validation record

| Command | Result |
| --- | --- |
| `npm ci` | PASS; 206 packages installed from the existing lockfile; no lockfile change |
| `npm run test:governance` | PASS, 4/4 |
| P0 Opportunity targeted suite | PASS, 40/40 |
| `npm run test:investor-watch:baseline` | PASS, 153/153 |
| `npm run test:release-safeguards` | PASS, 6/6 |
| `npm run test:content` | PASS |
| `node --check app.js` and new script/test syntax checks | PASS |
| `npm run build` | PASS; generated ignored local `public/version.json` only |
| `npm test` | Existing failure state, 100/102; the two root causes are documented above |
| `node --test tests/*.mjs` after adding governance tests | Existing failure state, 919/950; the same 31 failures remain and all four new tests pass |
| `npm run verify:generated` | Expected non-zero baseline result: 287 drift records (246 different, 41 `public/`-only) |
| `git diff --check` | PASS |

The drift command is deliberately not added as a required green CI check while the repository contains known drift. Doing so would either break every PR or require an allowlist that conceals real content differences. PR B must resolve or explicitly baseline the relationship before CI enforcement.
