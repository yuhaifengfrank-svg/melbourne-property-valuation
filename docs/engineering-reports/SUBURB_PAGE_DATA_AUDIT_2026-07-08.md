# Suburb Page Data Audit - 2026-07-08

## Scope

- Production route: `/suburb/*` -> `public/suburb/*`
- Source read: Production Neon `suburb_metrics` (read-only)
- Canonical pages regenerated: 248
- Coverage: 247 VIC, 1 NSW
- Legacy compatibility page: `sans-souci-vic.html` redirects to `sans-souci-nsw.html` and is `noindex`
- Source row update range: 2026-06-27 to 2026-06-30

`dist/suburb` is not used by the Production route. Its 238 files are a stale secondary copy and were not treated as source truth.

## Findings Fixed

1. All 248 old pages used lowercase suburb names in title, metadata and FAQ copy.
2. All filenames were forced to `-vic`, including Sans Souci, NSW.
3. All pages claimed data was updated nightly without page-level evidence.
4. All pages claimed medians were based on recent comparable sales without provenance attached to the page.
5. Missing confidence values could be confused with a real zero score.
6. Implausible coastal vacancy indicators, up to 60.94%, were published without a quality gate.
7. Pages had no machine-readable source payload for full-page reconciliation.
8. The sitemap would have indexed a legacy redirect page.

## Regeneration Result

- 248/248 canonical pages contain a structured `#suburb-page-data` JSON payload.
- Every payload matches the generation snapshot exactly.
- Each page has state-aware filename, title, canonical URL, Place schema and FAQPage schema.
- Missing values display `Data not available`; they are not replaced with zero.
- Sitemap contains 248 canonical suburb URLs and excludes the noindex legacy redirect.
- Mobile/tablet/desktop layout test passed for Doncaster, Aireys Inlet and Sans Souci: 9/9 cases.

## Data Completeness

| Metric | Missing | Publishing treatment |
|---|---:|---|
| Median house price | 0 | Published |
| Median unit price | 43 | Explicitly unavailable |
| Median townhouse price | 46 | Explicitly unavailable |
| Median house rent | 1 | Explicitly unavailable |
| Gross yield | 0 | Published as derived indicator |
| Overall confidence | 33 | Explicitly unavailable |
| Population 2025 | 48 | Population section omitted when no population data exists |
| Price source confidence | 33 | Explicitly unavailable |

## Values Withheld

Fifteen vacancy indicators exceeded the temporary publishable range of 0-15% and are withheld: Aireys Inlet, Anglesea, Barwon Heads, Blairgowrie, Dromana, Lorne, McCrae, Point Lonsdale, Portsea, Queenscliff, Rosebud, Rye, Safety Beach, Sorrento and Tootgarook.

The raw values remain in the database for investigation but are not embedded in public page data.

## Remaining Upstream Issues

1. `govt_house_median` is present for 205 suburbs, but `govt_house_year` is missing for all 248 rows. Government reference medians are therefore withheld until a year and lineage can be attached.
2. The Production database does not yet contain the new registry/observation/evidence tables. These currently exist only in the Preview data-governance workstream, so page provenance can only identify `suburb_metrics`, not an observation-level evidence chain.
3. `suburb_metrics` mixes facts and derived/modelled indicators. The page labels this honestly, but future releases should resolve each metric through the registry and evidence chain.
4. `dist/suburb` should be formally retired or rebuilt from the canonical output to prevent future agents treating it as current Production content.

## Verification

```text
npm run audit:suburbs
5 tests passed, 0 failed

node tests/suburb-page-layout-test.mjs
9/9 viewport cases passed

git diff --check
clean
```

The repository-wide content scan still reports one pre-existing comment in `scripts/compute-ai-summary.mjs`; it is unrelated to generated suburb pages.
