# OPENCLAW_HANDOFF.md — Codex Review 状态

## 分支状态

| 项 | 值 |
|---|---|
| **当前分支** | `codex-review` |
| **HEAD** | `0d6bd64` — `fix: suburb prefix fallback in db-comparable-source` |
| **Ahead of main** | 13 commits（clean history，force-pushed） |
| **Behind main** | 0 commits（已 rebase 到最新 main） |
| **GitHub 远程** | `origin/codex-review`（force-pushed） |
| **Vercel Production** | `aushomevalue-db0hv3sue-frankyhf.vercel.app` → `aushomevalue.vercel.app` |
| **GitHub 远程关联** | 项目 GitHub Vercel 集成未开启；vercel deploy --prod 通过 CLI 部署 |

## Production 实测结果

**验证 URL：** https://aushomevalue.vercel.app

场景：`18 Moresby St, Oakleigh South, VIC, PropertyType: House`

| 字段 | 值 |
|---|---|
| `(subject.)address` | `18 Moresby Street, Oakleigh South, VIC, 3167` |
| `suburb` | `Oakleigh South`（不重复 canonical） |
| `verification.status` | `verified` |
| `suburbExact` / `stateMatch` | `true` / `true` |
| `customerDataStatus` | `sufficient` |
| `valuation.estimate.midpoint` | `1,291,948` |
| `valuation.confidence.label` | `Medium` |
| `comparables` 条数 | 5 |
| 表头 | address, salePrice, saleDate, distanceMeters |

## 本轮修复总结

| # | 修复 | 文件 | 描述 |
|---|------|------|------|
| 1 | Nominatim 查询去除 unit prefix | `collector.js` | 查询前 strip `Unit X/`，否则 `Unit 3/18` Nominatim 无法解析 |
| 2 | 前端发送 useDatabaseFallback | `app.js` | 前端 POST body 加 `useDatabaseFallback: true` |
| 3 | API 固定 useDatabaseFallback | `api/valuation.js` | serverless API 始终 `{ fetch: false, useDatabaseFallback: true }` |
| 4 | DB suburb 前缀 fallback | `db-comparable-source.js` | `matchSuburb`: exact → prefix → first-word prefix fallback |
| 5 | 前端 key 正确 | `app.js` | POST body 用 `propertyType`（不是 `type`） |

## DB 数据注意事项

- **只有 `Oakleigh` (postcode 3166) 数据**，无 `Oakleigh South` (3167)
- suburb 前缀匹配：`"Oakleigh South"` → `"Oakleigh%"` → 匹配到 `"Oakleigh"` 的 5 条记录
- **如需 direct DB test**：`api/health.js` 已删除；用 `node --input-type=module` + `getSql()` 测试

## 已知问题

1. **DB 数据不足**——只有 5 条 Oakleigh 记录，来自单个采集批次。需要 cron 采集更多 suburbs 数据
2. **Unit 地址 valuation**——`Unit 3/18 Moresby` 地址核验通过但查 DB comparable 无匹配，返回 `valuation-failed`
3. **Wrong state 错误消息**——Nominatim 查到了 NSW 同街名，消息显示 suburb mismatch（技术上正确但可优化）
4. **Deploy force-push**——`codex-review` 分支在 remote 已被 force-push 覆盖

## 代码框架

### 关键文件

| 文件 | 职责 |
|------|------|
| `api/valuation.js` | Vercel serverless handler。`{ fetch: false, useDatabaseFallback: true }` |
| `lib/valuation-service.js` | 估值流程编排。collector → DB fallback → valuation engine |
| `lib/comparable-research-collector.js` | 地址核验（Nominatim） + browser collector（Vercel 环境跳过） |
| `lib/db-comparable-source.js` | DB 查询。`matchSuburb` 3-tier fallback |
| `lib/valuation-engine.js` | 估值引擎（未修改） |
| `app.js` | 前端逻辑。`useDatabaseFallback: true` 硬编码 |

### 关键函数位置

- **`verifyAddress()`**: `collector.js:308-341` — Nominatim 查询
- **`buildSubject()`**: `collector.js:354-580` — 地址核验 + canonicalAddress 构建
- **`matchSuburb()`**: `db-comparable-source.js:118-156` — **3-tier suburb 匹配**
- **`matchSuburbType()`**: `db-comparable-source.js:104-115` — 精确 suburb + type
- **DB fallback 入口**: `valuation-service.js:108-138` — `comps.length < 3` 时触发

### 执行流程（Production Vercel）

```
app.js POST → api/valuation.js handler
  → runValuation(body, { fetch:false, useDatabaseFallback:true })
    → collectComparableResearch()          // 只做 Nominatim 验证，跳过浏览器
    → if (comps.length < 3) → dbSource.fetch()
      → matchSuburbType(Oakleigh South)    // 0 hits
      → matchSuburb(Oakleigh South)        // prefix fallback → 5 hits
    → valueProperty()                      // 估值引擎
    → sanitizeForClient()                  // 删除内部字段
```

## 测试

```bash
# 完整本地测试（21/21）
node --test test-address-verification.mjs test-address-lookup.mjs regression-test.mjs

# Production API 测试
curl -X POST "https://aushomevalue.vercel.app/api/valuation" \
  -H "Content-Type: application/json" \
  -d '{"address":"18 Moresby St","suburb":"Oakleigh South","state":"VIC","propertyType":"House"}'

# Vercel 日志
npx vercel logs aushomevalue.vercel.app --limit 20 --expand
```

## 下一代理主要工作

1. 确认 `codex-review` merge 到 `main`（需用户确认）
2. 继续 DBComparableSource CDP pipeline 集成
3. 导入更多 Oakleigh South / Clayton area comparable 数据
4. 完善 Unit 地址 comparable 匹配（DB 不含 unit prefix 记录）
5. 清理 workspace 中的 `fix-*.mjs` 残留文件
6. 考虑 Unit 地址在 comparable 表中的存储格式
