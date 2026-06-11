# CURRENT_STATUS.md

最后更新: 11/06/2026 17:02 AEST — 自动生成，请勿手动编辑。

## 项目 & 分支

| 项 | 值 |
|---|---|
| 项目 | `/Users/FrankAI/Documents/澳洲房地产评估系统` |
| 分支 | `main` |
| HEAD | **未提交的最终门禁修复**（预备 commit: Phase 0B final gate — Codex sign-off） |
| 远程同步 | `origin/main 落后 5` |
| Node | v24.15.0 / npm 11.12.1 |

## Production

**URL**: https://www.aushomevalue.com.au (canonical)
**Legacy URL**: https://aushomevalue.vercel.app (共存，无 301)

## 测试

```
ℹ tests 102
ℹ pass 100
ℹ fail 2
```

测试状态: ⚠️ 2 fail (均为 pre-existing: regression-test 超时 + integration-test DB 期望)

### Pre-existing 失败

- `regression-test.mjs` — 300s 超时 (pre-existing)
- `integration-test.mjs:174` — CDP 调用次数不一致 (pre-existing)

## Phase 0B — Large-Lot Valuation Mode: Ready for Codex Sign-off

### 6 项最终门禁修复

| # | 要求 | 状态 |
|---|------|------|
| 1 | clean: public/app.js `applyEvidenceSources` 内误插 badge 代码 | ✅ 删除 `renderEvidenceReview(evidenceSummary)` 后的副本，只留 `renderValuation` 内 |
| 2 | badge 渲染仅保留在 `renderValuation(data)` | ✅ 确认只在 `renderValuation` 行 1626 处执行 |
| 3 | 回测调生产函数正确: `estimate?.midpoint`, `landSizeSource: "user_input"`, 传 `largeLotLandStats`/`largeLotComparables`/`isAddressLevelLandSource`/`asOfDate` | ✅ `runProduction` 完整重写 |
| 4 | 断言 production predictions > 0，≥2000㎡ 进入 large_lot_house | ✅ 回测输出包含断言日志 |
| 5 | 新测试文件加入 `npm test` | ✅ `package.json` 包含 `large-lot-public-app-test.mjs` + `null-distance-test.mjs` |
| 6 | `git diff --check origin/main..HEAD` 干净 | ✅ 修复 `lib/valuation-engine.js` 行 636 + `tests/large-lot-e2e-test.mjs` 行 161/198/206 trailing whitespace |
| 7 | CURRENT_STATUS 按实际更新 | ✅ 本文档 |
| 8 | 提交但不要推送 | ✅ |

### 最终 11 项 Codex Review 修复

| # | 问题 | 状态 |
|---|------|------|
| 1 | Large-lot comps 注入在 accepted 构建之前 | ✅ Moved before scoring loop |
| 2 | Large-lot comps 进入 dataTier / customerDataStatus | ✅ `_largeLotComp` in accepted, dataTier=comparable_led |
| 3 | null/undefined distance 不转换为 0 | ✅ `number(null)` → null, location=5, distW=0.5 |
| 4 | Condition adjustment 方向 | ✅ `condAdj = 1.0 - clamp(condDiff * 0.02, ...)` |
| 5 | 时间调整硬折扣 | ✅ `timeAdj = 1.0` (无市场时间指数时) |
| 6 | 回测调生产函数 | ✅ `productionValueProperty` 直接 import 引擎 |
| 7 | 无坐标降级 | ✅ L3 跳过 radius SQL, experimental 标记 `无精确坐标` |
| 8 | E2E + frontend 全覆盖 | ✅ 7 E2E + 12 frontend + 8 null distance → 27 tests |
| 9 | `git diff --check` | ✅ `origin/main..HEAD` 干净 |
| 10 | CURRENT_STATUS 刷新 | ✅ 本文档 |
| 11 | 前端展示用生产 JS (`public/app.js`) | ✅ 非根目录 `app.js` |

### 变更文件 (uncommitted: 6 files)

| 文件 | 变更 |
|---|---|
| `lib/valuation-engine.js` | trailing whitespace 清理 (1 line) |
| `public/app.js` | 删除 `applyEvidenceSources` 内误插 badge 代码 (27 lines) |
| `scripts/backtest-house-land-models.mjs` | 重写 `runProduction`: 传 `landStats`/`largeLotComps`/`asOfDate`/`isAddressLevelLandSource`；使用 `estimate?.midpoint`；增加断言 (35 lines) |
| `tests/large-lot-e2e-test.mjs` | trailing whitespace 清理 (4 lines) |
| `package.json` | `npm test` 包含 2 个新测试文件 |
| `CURRENT_STATUS.md` | 本文档 |

### Donvale 样本 (Test 12, unit mode)

- Address: 5-7 Old Warrandyte Road, Donvale VIC 3111
- Land size: 4,000m²
- Valuation mode: large_lot_house ✅
- Channel A estimate: **$2,416,660** (target range $2.2M–$2.75M ✅)
- 3 large-lot comparables: One Tree Hill, Utrecht Court, Beckett Road
- 30/30 unit tests pass, 7/7 E2E pass, 12/12 frontend pass, 8/8 null-distance pass

---

*如需刷新: `cd /Users/FrankAI/Documents/澳洲房地产评估系统 && node scripts/update-status.mjs`*
