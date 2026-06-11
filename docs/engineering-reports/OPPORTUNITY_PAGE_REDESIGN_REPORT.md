# OPPORTUNITY_PAGE_REDESIGN_REPORT

**Date**: 2026-06-09 20:50 AEST
**Author**: 玄甲
**Status**: Draft — awaiting approval before implementation

---

## 1. Executive Summary

The 7 `/opportunities/*` pages were designed as SPA-style ranking pages, but 5 of the 7 `/top-*` Top 100 pages now fulfill the same role with superior content quality (100 rows vs 53–106, richer format, SEO-optimised). This creates **94–98% duplicate content** for Growth and School Zone opportunity pages, plus 3 pages that are **empty stubs**.

**Proposal**: Repurpose the opportunity pages from ranking pages into **educational strategy guides** with featured examples. Apply consistent redesign across all 7 pages.

---

## 2. Current Page Audit

| Page | Size | Content Words | Suburb Links | H2 Tags | Verdict |
|---|---|---|---|---|---|
| `/opportunities/index.html` | 104KB | 3,654 | 248 | 248 | **Hub** — aggregator, keep as-is |
| `/opportunities/growth.html` | 44KB | 1,590 | 106 | 106 | **DUPLICATE** — pure ranking list |
| `/opportunities/school-zone.html` | 36KB | 1,362 | 85 | 85 | **DUPLICATE** — pure ranking list |
| `/opportunities/value.html` | 2KB | ~50 | 0 | 0 | **EMPTY** — no content |
| `/opportunities/cashflow.html` | 2KB | ~50 | 0 | 0 | **EMPTY** — no content |
| `/opportunities/infrastructure.html` | 2KB | ~50 | 0 | 0 | **EMPTY** — no content |
| `/opportunities/balanced.html` | 101KB | 3,540 | 248 | 248 | **DUPLICATE** — also a ranking list of all suburbs |

---

## 3. Redesign: Visual Mockup (text-based)

Each page follows this structure:

```
┌──────────────────────────────────────────────────────┐
│  ← AusHomeValue                                      │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │  [ICON] Growth Strategy Guide                    ││
│  │  ─────────────────────────                       ││
│  │  What drives property growth and how to          ││
│  │  identify the next rising corridor.              ││
│  │                                                  ││
│  │  [📈 Full Growth Ranking →]  (link to top-*)    ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ┌─── STRATEGY ────────────────────────────────────┐│
│  │  ## Why Growth Matters                          ││
│  │  Long-form explanatory content...                ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ┌─── METHODOLOGY ─────────────────────────────────┐│
│  │  ## How We Score Growth                          ││
│  │  - Price momentum (1y/3y/5y CAGR)                ││
│  │  - Infrastructure pipeline weighting             ││
│  │  - Supply constraint adjustment                   ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ┌─── FEATURED ────────────────────────────────────┐│
│  │  ## Featured Growth Opportunities                ││
│  │                                                  ││
│  │  ┌──────┐ ┌──────┐ ┌──────┐                    ││
│  │  │Suburb│ │Suburb│ │Suburb│                    ││
│  │  │ A    │ │ B    │ │ C    │                    ││
│  │  │score │ │score │ │score │                    ││
│  │  └──────┘ └──────┘ └──────┘                    ││
│  │                                                  ││
│  │  [View full ranking of 100 suburbs →]            ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ┌─── FAQ ─────────────────────────────────────────┐│
│  │  - What is a good growth score?                   ││
│  │  - Which areas grow fastest?                      ││
│  │  - How long should I hold?                        ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

**Key visual changes**:
1. Hero section with strategy title + subtitle + CTA to /top page
2. Strategy section: 2-3 paragraphs explanatory content
3. Methodology section: How this factor is scored
4. Featured section: **5-10** suburb cards (not 100) with justification
5. FAQ section: 5-8 FAQ schema items
6. Footer: cross-links to all pages

---

## 4. Page-by-Page Content Plan

### 4.1 Growth Strategy (`/opportunities/growth.html`)

| Section | Content |
|---|---|
| H1 | Growth Investment Strategy — Victoria 2026 |
| Meta desc | Learn how to identify growth suburbs in Victoria. Our data-driven methodology scores price momentum, infrastructure and supply dynamics. |
| Strategy | "Growth investing targets suburbs where price growth is driven by structural factors: population inflows, infrastructure investment, and supply constraints. Unlike yield-focused strategies, growth investing prioritises capital appreciation over cash flow..." (3 paragraphs) |
| Methodology | Weighted growth scores: 3-year CAGR (40%), 1-year momentum (25%), infrastructure pipeline (20%), supply constraint (15%). Confidence-adjusted for data recency. |
| Featured | Top 10 suburbs — 3 cards visible, "view all" link to /top-growth-suburbs-victoria.html |
| CTA | **→ View full Top 100 Growth Rankings** |
| FAQ | 5 questions |

### 4.2 School Zone Strategy (`/opportunities/school-zone.html`)

| Section | Content |
|---|---|
| H1 | School Zone Investment Strategy — Melbourne 2026 |
| Meta desc | How school zones affect property values. ICSEA scores, catchment data and family demand — a complete guide to education-focused investing. |
| Strategy | "School zone premiums are among the most persistent in property. Suburbs within high-performing public school catchments command 10-20% premiums over comparable areas. This page explains how we measure school quality..." |
| Methodology | ICSEA (Index of Community Socio-Educational Advantage) scores from ACARA. We rank suburbs by weighted average school quality within catchment, combined with family-demand indicators (3+ bedroom proportion, separate house proportion). |
| Featured | Top 8 suburbs — 3 cards visible |
| CTA | **→ View full Top 100 School Zone Rankings** |
| FAQ | 6 questions including "What is ICSEA?", "Which zone has the fastest growth?" |

### 4.3 Value Strategy (`/opportunities/value.html`) — **NEW**

| Section | Content |
|---|---|
| H1 | Value Investment Strategy — Undervalued Suburbs 2026 |
| Meta desc | Find Melbourne's most affordable entry points. Our value score identifies suburbs trading below fundamental fair value with growth corridors alignment. |
| Strategy | Full content — explain PIR (price-to-income), undervaluation relative to adjacent suburbs, infrastructure pipeline creating future value uplift. |
| Methodology | Value score = price-to-median-income ratio + comparable suburb discount + growth corridor adjacency |
| Featured | Top 10 value suburbs |
| CTA | **→ View full Top 100 Value Rankings** |

### 4.4 Cashflow Strategy (`/opportunities/cashflow.html`) — **NEW**

| Section | Content |
|---|---|
| H1 | Cashflow Investment Strategy — Rental Yield Victoria 2026 |
| Meta desc | Positive cashflow property investing in Victoria. High-yield suburbs, rental demand drivers and vacancy rate analysis. |
| Strategy | Full content — explain gross yield vs net yield, rental demand drivers, vacancy rate as counter-indicator, interest-rate sensitivity. |
| Methodology | Yield score = weighted gross rental yield (60%) + vacancy rate (negative factor, 25%) + population growth (15%) |
| Featured | Top 10 yield suburbs |
| CTA | **→ View full Top 100 Rental Yield Rankings** |

### 4.5 Infrastructure Strategy (`/opportunities/infrastructure.html`) — **NEW**

| Section | Content |
|---|---|
| H1 | Infrastructure-Led Property Strategy — Victoria 2026 |
| Meta desc | Melbourne's infrastructure pipeline and its property market impact. SRL, airport rail, suburban rail loop and growth corridor infrastructure. |
| Strategy | Full content — Suburban Rail Loop, Metro Tunnel, Western Growth Corridor, airport rail link. Map of key infrastructure zones. |
| Methodology | Infrastructure score = government funding committed + project stage + proximity impact radius + population density adjacency |
| Featured | Top 6 infrastructure-adjacent suburbs |
| CTA | **→ View all suburbs on Research Centre** |

### 4.6 Balanced Strategy (`/opportunities/balanced.html`) — **REVIEW**

| Section | Content |
|---|---|
| H1 | Balanced Property Strategy — Diversified Portfolio 2026 |
| Meta desc | Combine growth, yield and school quality into a balanced investment strategy. Best all-round suburbs for diversified portfolios. |
| Strategy | Full content — diversification theory, risk-balancing across factors, why balanced suburbs offer downside protection |
| Methodology | Balanced score = equal-weighted composite of growth + value + yield + school + supply scores |
| Featured | Top 10 balanced suburbs |
| CTA | **→ View Research Centre for all suburb data** |

### 4.7 Opportunities Hub (`/opportunities/index.html`) — **MINOR UPDATE**

| Change | Detail |
|---|---|
| Remove count badges | "Growth Opportunities (106)" → "Growth Strategy" |
| Add strategy descriptions | Each link gets a 1-line subtitle describing the strategy |
| Keep cross-links | Maintain as navigation hub |

---

## 5. Implementation Plan

### Files to modify (7 HTML pages):
| File | Action |
|---|---|
| `public/opportunities/index.html` | Minor: update nav links, remove count badges, add descriptions |
| `public/opportunities/growth.html` | **Full rewrite**: strategy + methodology + featured 10 + FAQ |
| `public/opportunities/school-zone.html` | **Full rewrite**: strategy + methodology + featured 10 + FAQ |
| `public/opportunities/value.html` | **Full rewrite**: create from scratch |
| `public/opportunities/cashflow.html` | **Full rewrite**: create from scratch |
| `public/opportunities/infrastructure.html` | **Full rewrite**: create from scratch |
| `public/opportunities/balanced.html` | **Full rewrite**: strategy + methodology + featured 10 + FAQ |

### Template structure for each page:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>{Strategy Title} | AusHomeValue</title>
  <meta name="description" content="{SEO description}" />
  <link rel="canonical" href="https://www.aushomevalue.com.au/opportunities/{slug}.html" />
  <script type="application/ld+json">{FAQ Schema}</script>
  <style>...</style>
</head>
<body>
  <!-- Strategy Hero -->
  <!-- Methodology Section -->
  <!-- Featured Opportunities (5-10 cards) -->
  <!-- FAQ Section -->
  <!-- Footer with cross-links -->
</body>
</html>
```

### Data source per page (static, fetched once at generation time):
| Page | API | Limit |
|---|---|---|
| Growth | `/api/top-growth?limit=200` | Fetch top 10 for featured |
| School Zone | `/api/top-school?limit=200` | Fetch top 10 for featured |
| Value | `/api/top-value?limit=200` | Fetch top 10 for featured |
| Cashflow | → same as Yield | `/api/top-yield?limit=200` |
| Infrastructure | `/api/top-supply?limit=200` + manual cluster suburbs | 6 featured |
| Balanced | `/api/opportunity?type=balanced&limit=200` | Fetch top 10 for featured |

---

## 6. Current vs Proposed Metrics

| Metric | Current | Proposed |
|---|---|---|
| Growth page suburb cards | 106 (duplicate) | 10 (featured examples) |
| Growth page content paragraphs | 2 | 10+ |
| School Zone page suburb cards | 85 (duplicate) | 10 |
| Empty pages (value/cashflow/infra) | 3 | 3 with full content |
| Total content words (all opp pages) | ~10k | ~30k+ |
| Internal links /top-* | 0 (they compete) | 7 links across each page |
| FAQ Schema | 0 | 5-8 per page |

---

## 7. Recommendation

**Approve**: Rewrite all 7 opportunity pages as educational strategy guides.

**Rationale**:
1. Eliminates 94-98% duplicate content with /top-* ranking pages
2. Creates 3 new content pages from empty stubs
3. Adds ~20k words of unique explanatory content
4. Strengthens internal linking /top-* ranking pages
5. Positions opportunity section as "learn" not "rank"
6. Maintains all existing URLs and canonical tags

**Not changing**: scoring engine, APIs, data sources, suburb page template.

---

## Appendices

### A. URL Map
```
Current URL                      → New Role
/opportunities/index.html        → Hub (minor update)
/opportunities/growth.html       → Growth Strategy Guide
/opportunities/school-zone.html  → School Zone Strategy Guide
/opportunities/value.html        → Value Investment Guide [NEW]
/opportunities/cashflow.html     → Cashflow Strategy Guide [NEW]
/opportunities/infrastructure.html → Infrastructure Strategy Guide [NEW]
/opportunities/balanced.html     → Balanced Portfolio Guide [REWRITE]
```

### B. Cross-Linking Plan
Each opportunity page links to:
- The corresponding `/top-*.html` ranking page (e.g. growth opp → top growth)
- The Research Centre `/research/`
- The valuation engine `/` (homepage)
- 2-3 suburb intelligence pages from featured section
- 5-8 FAQ internal links to suburb pages