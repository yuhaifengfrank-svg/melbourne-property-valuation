# AusHomeValue Roadmap

**Branch:** `codex-review`（20 commits ahead of `main`，未合并）  
**Last updated:** 2026-06-07

---

## Current State

### Oakleigh Pilot — Closed
- **5 Oakleigh House comparables** in Neon DB (`aushomevalue-leads`)
  - 3 `cross_source_verified`（REA + Domain 双源匹配）
  - 2 `single_source_observed`（Domain only，REA 未以 House 类型收录）
- Vercel Preview 端到端验证通过
- 估值引擎动态置信度评分（0-100）：综合数据量、新鲜度、特征完整度、离群度、cross-check 比例
- 单来源作为扣分项（10-20%），非硬性上限

### Verification Status System
| Status | Condition | Example |
|--------|-----------|---------|
| `cross_source_verified` | ≥2 sources, date diff ≤90 days | REA + Domain 匹配 |
| `single_source_observed` | 1 source, address+price+date+collect URL complete | Domain only |
| `unverified` | Incomplete fields | — |

### Evidence Mode
| Mode | Trigger |
|------|---------|
| `database_verified` | ≥1 `cross_source_verified` |
| `database_single_source` | ≥5 `single_source_observed` |
| `research_only` | Not enough data |

### Confidence Scoring (Dynamic, 0-100)
```
dataScore = (countScore + coreBonus + recencyBonus + crossBonus
             + qualityBonus + completenessBonus + vicplanBoost)
            × outlierPenalty × sourcePenalty
```
- **High** (≥78 + ≥3 cross-checked)
- **Medium-High** (≥65 + ≥2 cross-checked)
- **Medium** (≥50)
- **Low-Medium** (≥30)
- **Low** (<30)
- Single source penalty: 0%→1.0, ≤50%→0.90, >50%→0.80
- Outlier penalty: ≤7.5%→1.0, ≤10%→0.9, >15%→0.6
- Client sees only final label, no internal weights/source levels

### Client-Side Security
- `api/valuation.js` sanitizes output: no `sourceUrl`, `sourceName`, `verificationStatus`, `_sourceMode`, `qualityBand/Score`, `adjustments`, `weight`
- Upload only saves files + generates summary (+ "Evidence received, pending review")
- No midpoint/range/confidence adjustment from uploads

### Tests
- **28 tests** all green: integration (P0+P1 coverage) + regression (6 property types)

---

## Immediate Blockers Before Production

| Blocker | Status |
|---------|--------|
| No `DATABASE_URL` env var set on Vercel production | TODO |
| CDP browser pipeline not wired for periodic cron | TODO |
| Single suburb only (Oakleigh) | TODO |
| Upload evidence auto-adjust removed | ✅ Done |

---

## Next Phases

### Phase 2 — Suburb Coverage Expansion
- Cron-based CDP scraping for Melbourne suburbs
- Automatic data sync to Neon DB
- Mapping from `comparable_sales` → valuation pipeline

### Phase 3 — User & Business
- Search analytics
- Multi-suburb report aggregator
- SEO landing pages per suburb

### Phase 4 — Full Australian Coverage
- Interstate data collection
- PriceFinder / CoreLogic fallback integration
- ABS + VicPlan enrichment at scale

---

## Technical Debt
- `app.js` ~3100 lines: could modularize (low priority)
- `rba-client.js` returns empty (data source issue, not affecting estimates)
- `regression-test.mjs` VM mock prints `res.json is not a function` warnings (harmless)
- 2 Norfolk, 5 Saxon: Domain only, not House on REA — maintained as `single_source_observed`
