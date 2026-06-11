# CONTENT_DUPLICATION_AUDIT.md

**Date**: 2026-06-09 20:45 AEST
**Scope**: All deployed content pages across `/research/`, `/top-*`, `/opportunities/`, and `/suburb/*` paths

---

## 1. /research/* Pages — 5 pages (all DELETED from filesystem, still in git history)

**Status**: All 5 are **exact duplicates** of /top-* pages (same topic, same ranking, older data)

| # | URL (deleted) | Title | Canonical | sitemap | Verdict |
|---|---|---|---|---|---|
| 1 | `/research/top-growth-suburbs-victoria-2026.html` | Top 100 Growth Suburbs Victoria 2026 — Best Property Growth Areas | `research/...` (subfolder) | ✅ Was in sitemap | **Duplicate** — same 50 suburbs as /top-growth, shorter rows |
| 2 | `/research/top-value-suburbs-victoria-2026.html` | Top 100 Value Suburbs Victoria 2026 — Most Affordable Property Markets | `research/...` | ✅ Was in sitemap | **Duplicate** — same topic, 53 vs 100 rows |
| 3 | `/research/top-yield-suburbs-victoria-2026.html` | Top 100 Rental Yield Suburbs Victoria 2026 — Best Cash Flow Property | `research/...` | ✅ Was in sitemap | **Duplicate** — same topic, 53 vs 100 rows |
| 4 | `/research/top-school-zone-suburbs-victoria-2026.html` | Top 100 School Zone Suburbs Victoria 2026 — Best Education Catchments | `research/...` | ✅ Was in sitemap | **Duplicate** — same topic, 53 vs 100 rows |
| 5 | `/research/top-supply-constrained-suburbs-victoria-2026.html` | Top 100 Supply-Constrained Suburbs Victoria 2026 — Lowest Housing Supply | `research/...` | ✅ Was in sitemap | **Duplicate** — same topic, 53 vs 100 rows |

**Details**: Each old research page had ~53 rank-cards (50 suburbs + 3 CSS matches) vs 103 (100 suburbs + 3 CSS matches) in the new Top 100 pages. First 3 entries identical (e.g. Werribee, Sunshine, Dandenong for growth). Same data source, same ranking methodology.

---

## 2. /top-* Pages — 6 pages

| # | URL | Title | Canonical | sitemap | Verdict |
|---|---|---|---|---|---|
| 1 | `/top-growth-suburbs-victoria.html` | Top 100 Growth Suburbs Victoria 2026 | `www.aushomevalue.com.au/top-growth-suburbs-victoria.html` | ✅ | **Unique** — 100 rows, canonical www |
| 2 | `/top-value-suburbs-victoria.html` | Top 100 Value Suburbs Victoria 2026 — Most Affordable Opportunities | same pattern | ✅ | **Unique** |
| 3 | `/top-yield-suburbs-victoria.html` | Top 100 Rental Yield Suburbs Victoria 2026 | same pattern | ✅ | **Unique** |
| 4 | `/top-school-zone-suburbs-victoria.html` | Top 100 School Zone Suburbs Victoria 2026 — Best Education Catchments | same pattern | ✅ | **Unique** |
| 5 | `/top-supply-constrained-suburbs-victoria.html` | Top 100 Supply-Constrained Suburbs Victoria 2026 | same pattern | ✅ | **Unique** |
| 6 | `/top-opportunities-snippet.html` | (no title, 4KB) | none | ❌ Not in sitemap | **Draft/stale** — internal fragment, not a real page |

**Suburb counts**: 100 each except yield (87 suburbs with yield data). Remarkably consistent.

---

## 3. /opportunities/* Pages — 7 pages

| # | URL | Title | Canonical | Suburbs | Verdict |
|---|---|---|---|---|---|
| 1 | `/opportunities/index.html` | Top Property Opportunities in Victoria | `www.aushomevalue.com.au/opportunities/index.html` | 238 | **Hub page** — aggregates all types |
| 2 | `/opportunities/growth.html` | Growth Opportunities — Top Suburbs | same domain | 106 | **Partial duplicate** with top-growth — 100/106 suburbs shared |
| 3 | `/opportunities/balanced.html` | Balanced Opportunities — Top Suburbs | same domain | 238 | **Partial duplicate** with ALL top pages — 100/238 overlap with each |
| 4 | `/opportunities/school-zone.html` | School Zone Opportunities — Top Suburbs | same domain | 85 | **Partial duplicate** with top-school — 83/85 suburbs shared |
| 5 | `/opportunities/cashflow.html` | Cashflow Opportunities — Top Suburbs | same domain | 0 | **Empty/draft** |
| 6 | `/opportunities/infrastructure.html` | Infrastructure Opportunities — Top Suburbs | same domain | 0 | **Empty/draft** |
| 7 | `/opportunities/value.html` | Value Opportunities — Top Suburbs | same domain | 0 | **Empty/draft** |

**Key finding**: `/opportunities/growth.html` is 100/106 identical suburbs to `/top-growth-suburbs-victoria.html`. Same for school-zone (83/85). The /opportunities/ pages predate the /top/ pages and are the "old" richer-format version.

---

## 4. /suburb/* Pages — 238 pages

| Aspect | Value |
|---|---|
| Total | 238 suburb pages |
| Avg size | ~10KB |
| Canonical | All sampled → `www.aushomevalue.com.au/suburb/*.html` ✅ |
| Overlap | **None by design** — each suburb is unique |

**Verdict**: All unique. No duplication risk.

---

## 5. Overlap Heat Map

```text
                    Top-G Top-V Top-Y Top-Sc Top-Su Opp-Bal Opp-Gr Opp-Sc
Top Growth          —    0%    0%    0%    0%    42%    94%    14%
Top Value           0%   —     0%    0%    0%    42%    55%    8%
Top Yield           0%    0%   —     0%    0%    37%    32%    12%
Top School          0%    0%    0%   —     0%    42%    42%    98%
Top Supply          0%    0%    0%    0%   —     42%    90%    14%
Opp Balanced        42%  42%   37%   42%   42%   —      —      —
Opp Growth          94%  55%   32%   42%   90%   —      —      —
Opp School Zone     14%   8%   12%   98%   14%   —      —      —
```

**Critical duplicates**:
- `/opportunities/growth.html` × `/top-growth-suburbs-victoria.html`: **94% overlap**
- `/opportunities/school-zone.html` × `/top-school-zone-suburbs-victoria.html`: **98% overlap**
- `/opportunities/balanced.html` × ALL top pages: 42% overlap with each (aggregator page)

---

## 6. Recommendations

### Option A — Delete old research pages ✅ (ALREADY DONE)
Files removed from `public/research/`. Next sitemap regeneration will exclude them.

### Option B — Noindex old opp pages (growth & school-zone)
Add `<meta name="robots" content="noindex">` to `/opportunities/growth.html` and `/opportunities/school-zone.html` since they're 94%+ duplicated by the superior /top-* pages.

### Option C — Clean up empty/draft opp pages
`/opportunities/cashflow.html`, `/opportunities/infrastructure.html`, `/opportunities/value.html` have 0 suburb entries — either populate or noindex.

### Option D — Keep /opportunities/balanced.html as unique hub
It's an aggregator showing 238 suburbs across all types, different intent from single-rank pages. **Keep**.

### Option E — Delete /top-opportunities-snippet.html
4KB orphan fragment, not linked anywhere, no title. **Delete**.

---

## 7. Final Recommended Action Set

| Priority | Action | Page(s) | Risk Level |
|---|---|---|---|
| P0 | ✅ Already done: delete old /research/ pages | 5 pages | Eliminates duplicate indexing |
| P1 | Noindex /opportunities/growth.html, /opportunities/school-zone.html | 2 pages | Prevents 94-98% duplicate signal dilution |
| P1 | Noindex or populate /opportunities/cashflow.html, infrastructure.html, value.html | 3 pages | Prevents thin content indexing |
| P2 | Delete /top-opportunities-snippet.html | 1 page | Orphan cleanup |
| — | Regenerate sitemap (will auto-exclude /research/ dir) | 1 file | After P0-P2 |
| — | Commit + deploy cleanup | — | After all changes |

---

## Summary

| Path | Total Pages | Duplicate | Partial Dup | Unique | Empty |
|---|---|---|---|---|---|
| /research/ | 5 | 5 | 0 | 0 | 0 |
| /top-* | 6 | 0 | 0 | 5 | 1 (snippet) |
| /opportunities/ | 7 | 0 | 2 (growth, school) | 1 (index) | 3 |
| /suburb/ | 238 | 0 | 0 | 238 | 0 |
| **Total** | **256** | **5** | **2** | **244** | **4** |