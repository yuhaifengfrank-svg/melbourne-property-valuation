# CURRENT_STATUS.md

最后更新: 2026-06-07 21:53 AEST — 后续新对话只读此文件。

## 项目 & 分支

| 项 | 值 |
|---|---|
| 项目 | `/Users/FrankAI/Documents/澳洲房地产评估系统` |
| 分支 | `codex-review` — ahead **16**, behind **0** (main) |
| HEAD | `c987744` — working tree **clean** |
| 远程 | `origin/codex-review` (force-pushed, 不合并 main) |

## Production

**URL**: https://aushomevalue.vercel.app (deploy `dpl_HeSAET...`, alias 含 aushomevalue.com.au)

| 测试场景 | 结果 |
|---|---|
| 18 Moresby + Oakleigh South + VIC | ✅ completed, $1,291,949, sufficient(5 comps) |
| wrong suburb (Chelsea) | ✅ address-mismatch, 明确提示 suburb |
| wrong state (NSW) | ✅ address-mismatch (Nominatim 找到 NSW 同名街) |
| Unit 3/18 + Oakleigh South + VIC | ✅ verified + unitStatus: unverified, 估值无 comps |
| 手机排版/comparable 表 | ✅ viewport, mobile grid, 6 列表头 |
| API 参数 propertyType | ✅ 正确传递 "House" 非 "type" |

## 核心功能 (done)

1. 地址核验 (Nominatim) — exact suburb/state/houseNum/road match, partial 不阻塞
2. Unit 地址 — strip prefix 再查, canonical 保留 prefix; unitStatus=unverified
3. DB prefix fallback — exact→prefix→first-word (Oakleigh South→Oakleigh%)
4. subject.address = canonicalAddress (单一 truth)
5. api/valuation.js 硬编码 `{ fetch:false, useDatabaseFallback:true }`

## 测试

fast(21/21) ✅ (~49ms). `npm run check` — 1 integration fixture 不足 (mock salePrice 不够, 不影响生产).

## 未完成

1. DB 仅有 Oakleigh(3166), 缺 Oakleigh South(3167)/Clayton
2. Unit 地址估值 0 comps (DB 无 unit 记录)
3. branch 未合并 main

## 下一步

1. 采集 Oakleigh South+ comparable 数据
2. 合并 codex-review → main
3. Unit 地址 strip prefix 后 match street 记录

## 归档

`docs/archive/2026-06/` — OPENCLAW_HANDOFF / CODEX_REVIEW_SUMMARY / ROADMAP
`memory/archive/` — 历史日志
