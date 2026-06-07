# CURRENT_STATUS.md — 当前工作状态

最后更新: 2026-06-07 21:45 AEST

## 项目定位

**澳洲房产评估系统** — 通过网页表单输入地址，经 Nominatim 核验后查询 PostgreSQL comparable_sales 表，返回估值报告。

## 分支状态

| 项 | 值 |
|---|---|
| 当前分支 | `codex-review` |
| HEAD | `ca9e421` |
| Ahead of main | 15 |
| Behind main | 0 |
| Working tree | clean |
| Remote | `origin/codex-review`（force-pushed） |

## Production 状态

**URL**: https://aushomevalue.vercel.app

### 验收场景（已验证）

| 场景 | 结果 | 备注 |
|---|---|---|
| 18 Moresby St, Oakleigh South, VIC | ✅ completed, midpoint $1,291,949, 5 comps | `sufficient` |
| Wrong suburb: Chelsea | ✅ address-mismatch | 提示 suburb 不一致 |
| Wrong state: NSW | ✅ address-mismatch | Nominatim 查到的 NSW 同街名 suburb mismatch |
| Unit 3/18 Moresby St | ✅ verified, unitStatus unverified | 估值无 comp（DB 无 unit 数据） |
| DB fallback | ✅ `customerDataStatus: sufficient` | prefix fallback (Oakleigh South→Oakleigh%） |

## 已完成的核心功能

1. **地址核验（Nominatim）** — `collector.js`：suburb exact match、state full-name→abbreviation map、houseNum+road match 四字段全通过才 `verified`；缺失字段返回 `partial`（不阻塞）
2. **Unit 地址处理** — 查询前 strip `Unit X/` 前缀（Nominatim 无法解析 `3/18` 格式）；地址前缀从 `enteredAddress` 保留到 canonical
3. **Frontend 400 安全** — `app.js` 先读 JSON 再 check `response.ok`
4. **DB suburb prefix fallback** — `db-comparable-source.js` exact→prefix→first-word 三层，`Oakleigh South` → `Oakleigh%`
5. **api/valuation.js** — 硬编码 `{ fetch: false, useDatabaseFallback: true }`
6. **subject.address 始终 = canonicalAddress** — 单一 truth，无 fallback 链

## 测试结果

```bash
node --test test-address-verification.mjs test-address-lookup.mjs regression-test.mjs
# 21/21 pass, ~49ms
```

- address-verification: 15/15（含正确的 suburb/state/houseNum/road 四个字段 exact match、partial 场景、unit unverified）
- address-lookup: 5/5（地址解析、canonical 一致性）
- regression: 1/1（property type regression 检查通过）

`npm run check` — 全套含 integration 测试：real Nominatim 超时（单次 10s+），子套件单独跑可通。

## 未完成的问题

1. **DB 数据仅 Oakleigh(3166)** — 无 Oakleigh South(3167) 或 Clayton 的 comparable_sales 数据 → 需要采集管道
2. **Unit 地址估值** — DB 不含 unit prefix 的地址记录，8/20 Oakleigh 地址返回 `valuation-failed`
3. **Wrong state 提示可优化** — NSW 找到同名街道时报 suburb mismatch（技术上正确但不精确）
4. **`codex-review` 尚未合并 main** — 等 DBComparableSource 完善后合并

## 下一步三项任务

1. **填充分区 comparable 数据** — 从 Oakleigh 扩展到 Oakleigh South、Clayton、Carnegie：通过 sync-oakleigh.mjs 或新 cron 采集
2. **`codex-review` → main** — 数据充分后合并 review 分支
3. **Unit 地址 comparable 匹配** — 去除 unit prefix 匹配 DB 中 `18 Moresby Street` 记录

## 不能违反的产品原则

- **地址核验不阻塞非关键字段** — 只有明确冲突才返回 mismatch；Missing = partial
- **`subject.address` 始终 = `canonicalAddress`** — 单一来源
- **不要删除旧文档** — 已归档到 `docs/archive/2026-06/`
- **不在生产环境做实验** — Vercel production 域名不折腾
- **不要做品牌/SEO/GEO 改动** — 核心功能优先

## 旧文档归档

历史交接文档已移到 `docs/archive/2026-06/`：
- `OPENCLAW_HANDOFF.md`（101 行）
- `CODEX_REVIEW_SUMMARY.md`（152 行）
- `ROADMAP.md`（91 行）

workspace memory 已切换为 CURRENT_STATUS.md + MEMORY.md + archive 结构。
