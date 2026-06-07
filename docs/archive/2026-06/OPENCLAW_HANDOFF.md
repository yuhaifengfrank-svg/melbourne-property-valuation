# OPENCLAW_HANDOFF.md — Codex Review 状态

## 分支与生产状态

| 项 | 值 |
|---|---|
| **当前分支** | `codex-review` |
| **HEAD** | `976b583` — `docs: update OPENCLAW_HANDOFF.md for production deployment fix` |
| **Ahead of main** | 14 commits（clean history，已 force-push 到 origin） |
| **Behind main** | 0 commits（已 rebase 到最新 main） |
| **Working tree** | ✅ clean |
| **GitHub 远程** | `origin/codex-review`（force-pushed） |
| **Vercel Production** | https://aushomevalue.vercel.app |

## Production 实测结果

**场景：** `18 Moresby St, Oakleigh South, VIC, propertyType: House`

| 字段 | 值 |
|---|---|
| `subject.address` | `18 Moresby Street, Oakleigh South, VIC, 3167` |
| `suburb` | `Oakleigh South`（不重复 canonical） |
| `verification.status` | `verified` |
| `suburbExact` / `stateMatch` | `true` / `true` |
| `customerDataStatus` | `sufficient` |
| `valuation.estimate.midpoint` | `$1,291,948` |
| `valuation.confidence.label` | `Medium` |
| `comparables` | 5 条（Oakleigh 后缀匹配） |
| comparable 表头 | address, salePrice, saleDate, distanceMeters |

## 本轮修复清单

| # | 修复 | 文件 | 描述 |
|---|------|------|------|
| 1 | 前端 `propertyType` | `app.js` | POST body 包含 `propertyType: inferredType`（不是 `type`） |
| 2 | API 硬编码 fallback | `api/valuation.js` | 始终 `{ fetch: false, useDatabaseFallback: true }` |
| 3 | DB suburb prefix fallback | `db-comparable-source.js` | `matchSuburb`: exact → prefix(`Oakleigh%`) → first-word prefix |
| 4 | DB source 依赖 `propertyType` | `db-comparable-source.js` | `matchSuburb` 和 `matchSuburbType` 都需要 `subject.propertyType` |
| 5 | 清理 debug logs | `api/valuation.js` + `lib/` | 移除所有 console.log debug 语句 + 删除 `api/health.js` `api/db-debug.js` |

## Production 排查教训

- **核心矛盾**：`integration-test.mjs` 用 `type: "House"` curl API → `body.propertyType: undefined` → `dbSource.fetch()` 收到 `propertyType: undefined` → `matchSuburbType` 跳过（`if (!type) return []`）→ `matchSuburb` 需要 `propertyType` truthy 才执行 3-tier fallback → DB 返回 0 条
- **修复**：前端 `app.js` 发送 `propertyType: inferredType`（已存在），API 侧硬编码 `useDatabaseFallback: true`
- **DB 数据**: `comparable_sales` 表只有 `Oakleigh`(3166) 数据，无 `Oakleigh South`(3167)

## 代码框架

### 关键文件

| 文件 | 职责 |
|------|------|
| `api/valuation.js` | Vercel serverless handler |
| `lib/valuation-service.js` | 估值编排入口 |
| `lib/comparable-research-collector.js` | 地址核验（Nominatim） |
| `lib/db-comparable-source.js` | DB 查询，含 `matchSuburb` 3-tier |
| `lib/valuation-engine.js` | 估值引擎（未修改） |
| `app.js` | 前端逻辑 |

### Production 执行流程

```
app.js POST → api/valuation.js handler
  → runValuation(body, { fetch:false, useDatabaseFallback:true })
    → collectComparableResearch()       // 仅 Nominatim 验证，跳过浏览器
    → if comps < 3 → dbSource.fetch()
      → matchSuburbType(Oakleigh South) // 0 hits（无 exact 数据）
      → matchSuburb(Oakleigh South)     // prefix fallback → 5 hits
    → valueProperty()                   // 估值引擎
    → sanitizeForClient()               // 删除内部字段
```

### 测试

```bash
# 21 个 fast tests
cd /Users/FrankAI/Documents/澳洲房地产评估系统
node --test test-address-verification.mjs test-address-lookup.mjs regression-test.mjs

# Production API
curl -s -X POST "https://aushomevalue.vercel.app/api/valuation" \
  -H "Content-Type: application/json" \
  -d '{"address":"18 Moresby St","suburb":"Oakleigh South","state":"VIC","propertyType":"House"}'

# Vercel logs
npx vercel logs aushomevalue.vercel.app --limit 20 --expand
```

## 未完成任务

1. **`codex-review` → `main` 合并** — 等待 DBComparableSource 完善 + cron 采集足够数据
2. **DB 数据补充** — 需 Oakleigh South / Clayton 等 suburb 的 comparable_sales 数据
3. **SEO/GEO 任务** — 未开始
4. **cleanup** — `fix-*.mjs` 残留文件

## 下一代理启动流程

1. 读取 `cat OPENCLAW_HANDOFF.md ROADMAP.md CODEX_REVIEW_SUMMARY.md`
2. `cd /Users/FrankAI/Documents/澳洲房地产评估系统 && git status && git log --oneline -5` 确认 HEAD
3. `npm run check` 确认测试
4. 确认 working tree clean 后开始新任务
