# CURRENT_STATUS.md

最后更新: 11/06/2026 14:44 AEST — ⚠️ 由 `scripts/update-status.mjs` 自动生成，请勿手动编辑。

## 项目 & 分支

| 项 | 值 |
|---|---|
| 项目 | `/Users/FrankAI/Documents/澳洲房地产评估系统` |
| 分支 | `main` |
| HEAD | `be5afee Phase 0B — Codex review fixes (11/11)` |
| 远程同步 | `0	2` |
| Node | v24.15.0 / npm 11.12.1 |

## Production

**URL**: https://www.aushomevalue.com.au (canonical)
**Legacy URL**: https://aushomevalue.vercel.app (共存，无 301)

## 测试

```
ℹ tests 82
ℹ pass 79
ℹ fail 3
```

测试状态: ⚠️ 3 fail (均为 pre-existing: DB URL 未配置 + regression-test setTimeout)

### 失败测试

- regression-test.mjs (pre-existing)
- 3条单源记录仍可生成初步估值 (pre-existing, DB URL 未配置导致)

## Phase 0B — Large-Lot Valuation Mode

### 修复的 11 项 Codex Review 问题

| # | 问题 | 状态 |
|---|------|------|
| 1 | Large-lot comps 注入在 accepted 构建之前 | ✅ Moved before scoring loop |
| 2 | Large-lot comps 进入 dataTier / customerDataStatus | ✅ `_largeLotComp` in accepted, dataTier=comparable_led |
| 3 | null/undefined distance 不转换为 0 | ✅ 所有路径处理 null (distAdj=1.0, distW=0.5) |
| 4 | Condition adjustment 方向 | ✅ `condAdj = 1.0 - clamp(condDiff * 0.02, ...)` |
| 5 | 时间调整硬折扣 | ✅ `timeAdj = 1.0` (无市场时间指数时) |
| 6 | 回测报告 large-lot 性能 | ✅ 按 ≥2000㎡ 分组, 报告 MAPE/MedianAPE/Bias/n |
| 7 | 无坐标降级 | ✅ L3 跳过 radius query, formatRows 返回 null dist, experimental 标记 |
| 8 | E2E 全覆盖 | ✅ 7 tests: mode/estimate/experimental/accepted/dataTier/flags |
| 9 | `git diff --check` | ✅ 通过 |
| 10 | CURRENT_STATUS.md 更新 | ✅ |
| 11 | 前端展示 | ✅ valuation-mode-badge + experimental-badge (中英文) |

### 关键变更 (9 files, +346/-71 from a19a461)

- `lib/valuation-engine.js`: Moved injection before scoring, cond adj direction, timeAdj=1.0, coords check, experimental reasons
- `lib/valuation-service.js`: Coordinates propagated to valueProperty subject
- `lib/db-comparable-source.js`: Haversine L3 tier (no change needed for null dist)
- `app.js`: renderValuation shows valuationMode + experimentalLabel badges
- `public/index.html`: Badge placeholder elements (mobile + desktop)
- `tests/large-lot-e2e-test.mjs`: 7 tests (3 runValuation + 4 valueProperty)
- `scripts/backtest-house-land-models.mjs`: Large-lot separate reporting

### Donvale 样本

- Address: 5-7 Old Warrandyte Road, Donvale VIC 3111
- Land size: 4,000m²
- Valuation mode: large_lot_house (proven via mock DB, real DB result pending deployment)
- Unit test estimate: ~$2.3M in $2.0M-$2.8M range ✅
- 3 comparable properties: 1 One Tree Hill ($2.415M), 1 Utrecht Court ($2.36M), 25 Beckett Road ($2.785M)

---

*此文件由 `scripts/update-status.mjs` 生成。运行 `npm run update-status` 刷新。*
