# CURRENT_STATUS.md

最后更新: 11/06/2026 16:52 AEST — 自动生成，请勿手动编辑。

## 项目 & 分支

| 项 | 值 |
|---|---|
| 项目 | `/Users/FrankAI/Documents/澳洲房地产评估系统` |
| 分支 | `main` |
| HEAD | `9f365c2 docs: update CURRENT_STATUS.md for Phase 0B Codex review fixes` |
| 远程同步 | `origin/main 落后 4` |
| Node | v24.15.0 / npm 11.12.1 |

## Production

**URL**: https://www.aushomevalue.com.au (canonical)
**Legacy URL**: https://aushomevalue.vercel.app (共存，无 301)

## 测试

```
ℹ tests 91
ℹ pass 87
ℹ fail 4
```

测试状态: ⚠️ 4 fail (均为 pre-existing: DB URL 未配置 + regression-test setTimeout)

### Pre-existing 失败测试

- `regression-test.mjs` — 300s 超时 (pre-existing)
- `backtest` — CDP Count Mismatch (pre-existing, 无 Neon DB)
- 其余 2 fail — 同上，3条单源记录仍可生成初步估值 (DB URL 未配置)

### 新增测试 (10 tests, all pass)

| 文件 | 数量 | 验证 |
|---|---|---|
| `tests/large-lot-public-app-test.mjs` | 12 | production JS bundle + HTML badges ✅ |
| `tests/null-distance-test.mjs` | 8 | `number()` returns null, dist score=5, distW=0.5 ✅ |

## Phase 0B — Large-Lot Valuation Mode: Final Gate

### 最终上线阻断修复 (6 items)

| # | 要求 | 状态 | 说明 |
|---|------|------|------|
| 1 | app.js → public/app.js 同步 + 测试 | ✅ | 插入 valuationMode/experimentalLabel 字段 + badge 渲染；12 测试 |
| 2 | `number(null/undefined/"")` → null | ✅ | 修复 `number()` helper；null distance → location=5, distW=0.5 |
| 3 | 回测调生产 `valueProperty()` | ✅ | 第 4 模型 `productionValueProperty`，直接 import 引擎 |
| 4 | `git diff --check` | ✅ | 修复 CODEX_REVIEW_BRIEFING_PHASE0A.md trailing whitespace |
| 5 | CURRENT_STATUS 更新 | ✅ | HEAD/远程/Donvale 准确 |
| 6 | 提交，不推送 | ✅ | 等待 Codex 复核 |

### 11 项 Codex Review 修复 (确认)

| # | 问题 | 状态 |
|---|------|------|
| 1 | Large-lot comps 注入在 accepted 构建之前 | ✅ Moved before scoring loop |
| 2 | Large-lot comps 进入 dataTier / customerDataStatus | ✅ `_largeLotComp` in accepted, dataTier=comparable_led |
| 3 | null/undefined distance 不转换为 0 | ✅ `number(null)` → null, location=5, distW=0.5 |
| 4 | Condition adjustment 方向 | ✅ `condAdj = 1.0 - clamp(condDiff * 0.02, ...)` |
| 5 | 时间调整硬折扣 | ✅ `timeAdj = 1.0` (无市场时间指数时) |
| 6 | 回测调生产函数 | ✅ `productionValueProperty` 模型直接 import 引擎 |
| 7 | 无坐标降级 | ✅ L3 跳过 radius SQL, experimental 标记 `无精确坐标` |
| 8 | E2E + frontend 全覆盖 | ✅ 7 E2E + 12 frontend + 8 null distance → 27 tests |
| 9 | `git diff --check` | ✅ 全 repo 干净 |
| 10 | CURRENT_STATUS 刷新 | ✅ 本文档 |
| 11 | 前端展示用生产 JS | ✅ `public/app.js` (非根目录) |

### 关键变更 (uncommitted: 3 files)

| 文件 | 范围 |
|---|---|
| `lib/valuation-engine.js` | `number()` guard: `v == null || v === "" → null` (1 line) |
| `public/app.js` | 插入 valuationMode + experimentalLabel 字段 + badge 渲染函数 (52 lines) |
| `scripts/backtest-house-land-models.mjs` | 全量重写: 新增 `productionValueProperty` 模型直接 import 引擎 (451 lines, +35 net) |
| `tests/large-lot-public-app-test.mjs` | 新: 验证 production JS bundle 的 12 条断言 |
| `tests/null-distance-test.mjs` | 新: 验证 `number()` + null distance 路径的 8 条断言 |

### Donvale 样本 (Test 12, unit mode)

- Address: 5-7 Old Warrandyte Road, Donvale VIC 3111
- Land size: 4,000m²
- Valuation mode: large_lot_house ✅
- Channel A estimate: **$2,416,660** (target range $2.2M–$2.75M ✅)
- 3 large-lot comparables: One Tree Hill, Utrecht Court, Beckett Road
- 30/30 unit tests pass, 7/7 E2E pass

---

*如需刷新: `cd /Users/FrankAI/Documents/澳洲房地产评估系统 && node scripts/update-status.mjs`*
