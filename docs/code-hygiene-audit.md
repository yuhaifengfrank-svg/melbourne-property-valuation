# Code hygiene audit — safe cleanup phase 1

## 1. Audit baseline

- Baseline SHA: `5bb418d1b404d5761b57a20a157519445bbb0940`
- Audit date: 16 July 2026 (Australia/Melbourne)
- Branch: `chore/repository-hygiene-safe-cleanup`
- Scope: repository structure, tracked artifacts, ignore rules, package manifest and lockfile, JavaScript modules, API functions, static routes/assets, generated pages, tests, scripts, database migrations, GitHub Actions, Vercel configuration, environment templates, archived code, documentation, dependency references, and dead-code markers.
- Method: `git ls-files`, `rg`, `rg --files`, framework/deployment configuration inspection, package script inspection, dependency-reference searches, file comparisons, syntax checks, project tests, contract suites, and the production build command.

The audit deliberately excludes `.worktrees/`. Git identifies each child as an independent linked worktree. The container remains untouched and is ignored only by this checkout's local `.git/info/exclude`; that local rule is not part of this commit.

## 2. Safe now — implemented

### Remove tracked `.DS_Store`

- Change: delete the root `.DS_Store` and add `.DS_Store` to `.gitignore`.
- Evidence: `file .DS_Store` identified it as `Apple Desktop Services Store`; `git ls-files '*DS_Store'` found only this file; repository-wide source/config/script/test searches found no consumer; Finder metadata has no deployment or runtime role.
- Risk: negligible. This removes only workstation metadata and prevents it from being recommitted. No application, API, route, content, score, model, or deployment configuration is changed.

No dependency was removed. Every declared package has a source, script, test, configuration, or tooling reference, or could not be proven runtime-independent with sufficient confidence. The lockfile was therefore not edited.

## 3. Needs verification — not changed

| Candidate | Evidence observed | Why it remains | Future verification |
| --- | --- | --- | --- |
| `dist/` (246 tracked files) | `scripts/generate-ai-pages.js` and `scripts/generate-suburb-pages.js` explicitly generate into `dist`; engineering documentation says `dist/` is synchronized to `public/`. | It looks generated, but may be a retained publication/source artifact. Removing it without confirming the release workflow could change operational behavior. | Confirm ownership and deployment/re-generation procedure, reproduce all files from a clean checkout, compare hashes with `public/`, then test a preview deployment before a dedicated removal PR. |
| Root/public duplicate static files | `styles.css`, `admin.html`, and `404.html` are byte-identical; `index.html`, `app.js`, `robots.txt`, and `sitemap.xml` differ. Vercel rewrites explicitly serve `public/` paths. | Root files may support local workflows, legacy hosting, or generators. The differing pairs make a bulk deduplication unsafe. | Inventory every hosting/local-server entry point and generator, then validate root and Vercel behavior separately. |
| `api-archive/` (7 tracked files) | No active package, Vercel, workflow, script, or test reference was found in the inspected paths. | Its archival/recovery purpose is explicit, and dynamic or operational use cannot be disproved from code alone. | Ask the owner to confirm the retention policy and verify Git history is the sole required recovery mechanism. |
| `_orch/` (9 tracked files) | Contains orchestration data/config/docs; no active reference was found outside the directory. | It may be consumed by a local orchestration tool through convention rather than import. | Identify the owning tool and run its discovery/status command before considering removal. |
| Historical scripts and root utilities | Several scripts have hard-coded local paths or one-off migration/import roles. | Database, migration, and data-loader behavior is explicitly out of scope, and one-off operational invocation is not discoverable from imports alone. | Build an owner-approved runbook and retirement list; remove only in a separate operational cleanup. |
| Broad test failures | The all-tests run exposes stale assertions, environment-dependent production audits, and browser/server restrictions. | Fixing tests or business behavior would exceed this hygiene PR and could alter protected valuation/opportunity behavior. | Triage on a dedicated branch using Node 22 and required isolated test services; update only after confirming intended current behavior. |

## 4. Keep

- `public/` static files and assets: directly served through `vercel.json` rewrites and route conventions.
- `api/*.js`: Vercel automatically discovers these serverless functions; absence of a conventional import is not dead-code evidence.
- `lib/opportunity-public-contract.js`, `lib/future-opportunity-outlook.js`, `futureOpportunityIndex`, and related tests: active P0 public score contract and compatibility path.
- `db/`, migration runners, and database service modules: operational data history and runtime dependencies; database changes are prohibited in this phase.
- `tests/`, fixtures, `sample-evidence/`, and snapshots: tests and documentation reference these assets, and low direct import counts do not prove they are unused.
- GitHub Actions, `vercel.json`, `.env` example material, package lockfile, and generated `public/version.json` rule: build/deployment conventions require them.
- Declared dependencies: retained because references exist or safe removal could not be proven. Version upgrades were intentionally not attempted.
- TODO/deprecated text in archived documentation and data: these are historical/reference content, not proven executable dead code.

## 5. Validation results

Environment: Node `v24.15.0`, npm `11.12.1`. CI config currently selects Node 22, so environment-sensitive failures should be rechecked there before separate remediation.

| Command | Result | Details |
| --- | --- | --- |
| `npm ci` | PASS | 206 packages installed from `package-lock.json`; no dependency or lockfile changes. npm reported existing transitive deprecation warnings for `inflight`, `rimraf@3`, and `glob@7`; versions were not changed. |
| `node --check app.js` | PASS | JavaScript syntax check passed. |
| `npm test` | FAIL (existing/unrelated) | 100/102 passed. Failures: `integration-test.mjs` expected zero DB calls when three CDP comparables exist but observed one; `regression-test.mjs` VM context lacks `setTimeout`. Neither file nor its implementation dependency was changed by this PR. |
| `node --test tests/future-opportunity-api-tests.mjs tests/future-opportunity-outlook-tests.mjs tests/opportunity-funnel-page-tests.mjs tests/homepage-product-narrative-tests.mjs` | PASS | P0 Opportunity contract suite: 40/40 passed, including canonical `score`, `/100` display, missing-data handling, compatibility field, and personalised ranking behavior. |
| `npm run test:investor-watch:baseline` | PASS | 153/153 passed. |
| `npm run test:release-safeguards` | PASS | 6/6 passed. |
| `npm run test:content` | PASS | No disallowed content in scanned `public` and `scripts` files. |
| `node --test tests/*.mjs` | FAIL (mixed existing/environmental) | 915/946 passed; 31 failed. Observed causes include stale assertions against current `main`, production/database audit prerequisites, Playwright browser launch restrictions, and local server `listen EPERM`. P0 and Investor Watch targeted suites pass independently. No assertions were weakened or skipped. |
| `npm run build` | PASS | Production build command completed and generated ignored local version metadata (`local@local`). |
| ESLint | NOT AVAILABLE | No ESLint configuration, dependency, or package script exists in this baseline. |
| TypeScript typecheck | NOT APPLICABLE | No TypeScript configuration or TypeScript source was found; the project is JavaScript. |

Final repository checks (`git diff --check`, status, diff/stat, and comparison with `origin/main`) are performed after this report is finalized and are recorded in the pull request. The intended committed diff is limited to deleting `.DS_Store`, adding its ignore rule, and this evidence-based audit report. No valuation formula, scoring logic, P0 contract, API schema, database object, route, page behavior, UI copy, SEO metadata, analytics, authentication, environment variable, caching, or Production setting is modified.
