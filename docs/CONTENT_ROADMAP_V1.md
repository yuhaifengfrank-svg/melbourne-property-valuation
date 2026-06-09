# Content Roadmap V1

**Date**: 2026-06-09  
**Objective**: 20 high-value SEO pages driving traffic to suburb intelligence + opportunity pages  
**Strategy**: Long-tail Melbourne property keywords with GEO-first structure (entity-rich, FAQ schema, internal links)

---

## Phase 1 — Top 100 Expansions (Week 1–2)

### Track 1.1 — Top 20 → Top 100 (existing sections)
Expand existing 5 research pages from ~20 suburbs to 100 each:
1. Top 100 Growth Suburbs Victoria 2026
2. Top 100 Value Suburbs Victoria 2026
3. Top 100 Yield Suburbs Victoria 2026
4. Top 100 School Zone Suburbs Victoria 2026
5. Top 100 Supply Constrained Suburbs Victoria 2026

**Effort**: Modify `generate-top-pages.cjs` — template rendering, pagination or single-page scroll  
**Traffic potential**: High — "top 100" ranks for "best suburbs Melbourne 2026" style queries

### Track 1.2 — New top-N pages
6. Top 100 Melbourne Suburbs for Families 2026
7. Top 100 First Home Buyer Suburbs Melbourne 2026
8. Top 100 Investor Suburbs Melbourne 2026
9. Top 100 Rental Yield Suburbs Melbourne 2026
10. Top 100 Cheapest Suburbs Melbourne 2026

---

## Phase 2 — Investment Theme Verticals (Week 2–3)

### Growth Corridors
11. Melbourne's Western Growth Corridor — Best Suburbs
12. Melbourne's Northern Growth Corridor — Best Suburbs
13. Melbourne's South-Eastern Growth Corridor — Best Suburbs

### School Zones (high-intent searches)
14. Melbourne's Best School Zone Suburbs for Families
15. Top Public School Zones in Melbourne — 2026 Guide
16. Suburbs Near Melbourne's Top Private Schools

### Supply & Demand
17. Melbourne's Most Supply-Constrained Suburbs — Price Outlook
18. Suburbs With the Highest Development Risk in Melbourne

### Investment Profiles
19. Best Suburbs for House & Land Packages Melbourne 2026
20. Establis Block vs Townhouse — Melbourne Suburb Comparison Guide

---

## Page Template (SEO-optimised)

```
┌──────────────────────────────────────────────────┐
│ H1: Keyword-rich headline (e.g. "Top 100 Growth│
│     Suburbs Victoria 2026 — Ranked & Analysed")  │
├──────────────────────────────────────────────────┤
│ Meta: 150-160 char description with target kw    │
│ JSON-LD: WebPage + Dataset schema                │
├──────────────────────────────────────────────────┤
│ Intro paragraph (2-3 sentences, keyword natural) │
│ Key stats strip (top line: data freshness note)  │
├──────────────────────────────────────────────────┤
│ ┌── Filter/sort controls ──────────────────────┐ │
│ │ [Growth] [Value] [Yield] [School] [Constrain]│ │
│ └──────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────┤
│ Rank 1  ┌──────────────────┐ ┌────────────────┐ │
│         │ Suburb tag       │ │ Score badge     │ │
│         │ Median price     │ │ Growth %        │ │
│         │ School rating ★★★ │ │ Vacancy rate   │ │
│         │ → View suburb    │ │ → Opportunity   │ │
│         │   intelligence   │ │   score         │ │
│         └──────────────────┘ └────────────────┘ │
│   Internal links: 3-4 hyperlinks to suburb pages │
├──────────────────────────────────────────────────┤
│ Rank 2 ... (repeat for 100 rows)                 │
├──────────────────────────────────────────────────┤
│ FAQ section (5-8 Q&A, FAQ schema markup)         │
│ → "What's the best suburb for families in Vic?"  │
│ → "How do we calculate growth scores?"           │
│ → "Should I invest in growth corridor suburbs?" │
├──────────────────────────────────────────────────┤
│ Footer: Related research pages, about, contact   │
└──────────────────────────────────────────────────┘
```

---

## Internal Linking Strategy

Every page must link to:
1. **3-5 individual suburb intelligence pages** (e.g. `/suburb/scoresby-vic.html`)
2. **1-2 opportunity pages** (growth/cashflow/school zone)
3. **1 other research page** (cross-linking within the `/research/` group)
4. **Homepage or top-level hub** (contextual)

Anchor text format:
- ✅ Natural: "Scoresby's 85.9% separate house rate supports family demand"
- ✅ Natural: "Tarneit in Melbourne's western growth corridor shows strong 3-year growth"
- ❌ Avoid: "Click here" or "read more"

---

## GEO (Generative Engine Optimisation) Targets

Each page should answer these questions explicitly for AI crawlers:

| Query type | Example | Where to answer |
|---|---|---|
| Direct ranking | "Top growth suburbs Melbourne 2026" | H1 + first 2 paragraphs |
| Comparison | "Is Tarneit better than Werribee for growth?" | FAQ or in-row comparison note |
| Methodology | "How do you calculate growth?" | FAQ or methodology section |
| Data freshness | "Is this 2024 or 2025 data?" | Key stats strip (always date-stamp) |
| Location | "Suburbs near Melbourne CBD" | Include distance/CBD proximity in each row |

---

## Implementation Priority

| Priority | Page | Effort | Traffic potential | Dependency |
|---|---|---|---|---|
| P0 | Top 100 Growth (expand) | 2h | Very high | Existing API |
| P0 | Top 100 Value (expand) | 2h | Very high | Existing API |
| P0 | Top 100 Yield (expand) | 2h | Very high | Existing API |
| P0 | Top 100 School (expand) | 2h | Very high | Existing API |
| P0 | Top 100 Supply Constrained (expand) | 2h | Very high | Existing API |
| P1 | Family suburbs | 4h | High | Need family-score dimension |
| P1 | First home buyer | 4h | High | Price threshold filtering |
| P1 | Investor suburbs | 4h | High | Existing scoring |
| P2 | Growth corridors (3 pages) | 6h | Medium-high | Geo mapping data |
| P2 | School zone guides (3 pages) | 6h | Medium-high | School data exists |
| P3 | Supply/demand analysis (2 pages) | 4h | Medium | G45 dwelling data |
| P3 | Investment profiles (2 pages) | 4h | Medium | Existing data |

---

## Traffic Estimates (Conservative)

| Phase | Pages | Est. monthly organic | Timeline |
|---|---|---|---|
| Phase 1 (expand) | 5 → 8 | +3,000/mo from long-tail | Week 1-2 |
| Phase 2 (verticals) | 12 | +5,000/mo | Week 2-3 |
| Phase 3 (deep content) | 5 | +2,000/mo | Week 3-4 |
| **Total** | 20+ new pages | **+10,000/mo target** | **4 weeks** |

---

## Next Step

Start with **Phase 1 — Top 100 expansion**: modify `generate-top-pages.cjs` to output 100 rows per page instead of 20-25. This is the highest ROI effort: minimal code change, immediate SEO lift.

Then: **P1 pages** (Family / First Home Buyer / Investor) — each requires only a new API filter dimension or score combination.
