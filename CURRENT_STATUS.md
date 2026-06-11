# CURRENT_STATUS.md

最后更新: 11/06/2026 13:45 AEST — ⚠️ 由 `scripts/update-status.mjs` 自动生成，请勿手动编辑。

## 项目 & 分支

| 项 | 值 |
|---|---|
| 项目 | `/Users/FrankAI/Documents/澳洲房地产评估系统` |
| 分支 | `main` |
| HEAD | `ab6dbcf feat: Content Style V2 — hook-first, conversational, investor-aware` |
| 远程同步 | `0	0` |
| Node | v24.15.0 / npm 11.12.1 |

## 测试

```
ℹ tests 75
ℹ pass 69
ℹ fail 6 (pre-existing: DB URL, regression-test)
```

## Large-Lot Valuation Mode (Phase 0B)

**Status**: ⚠️ 代码完成，待 Codex review

### 改动文件
- `lib/valuation-engine.js` — `detectLargeLotMode`, `selectLargeLotComparables`, `channelAEstimate`, `channelBEstimate`, `largeLotConfidence`, `channelBFeasible`
- `lib/valuation-service.js` — 注入 largeLotLandStats / largeLotComparables / isAddressLevelLandSource
- `lib/db-comparable-source.js` — `fetchLargeLotComparables` + `DatabaseComparableSource.fetchLargeLot`
- `lib/land-size-service.js` — `isAddressLevelLandSource`, `getLandSizeP90`, `getLandSizeMedian`
- `scripts/backtest-house-land-models.mjs` — Large-lot 分组报告
- `tests/large-lot-mode-tests.mjs` — 30 测试，TDD 全部通过

### 样本验证
- 5-7 Old Warrandyte Road, Donvale VIC 3111
- Channel A estimate: **$2,320,719** (含 One Tree Hill + Utrecht Court)
- 目标范围: $2.20m–$2.75m

## Production

**URL**: https://www.aushomevalue.com.au (canonical)
**Legacy URL**: https://aushomevalue.vercel.app (共存，无 301)

## 测试

```
ℹ tests 72
ℹ pass 65
ℹ fail 7
```

测试状态: ⚠️ 7 fail

### 失败测试

- regression-test.mjs
- 3条单源记录仍可生成初步估值

---

*此文件由 `scripts/update-status.mjs` 生成。运行 `npm run update-status` 刷新。*
