# CURRENT_STATUS.md

最后更新: 2026-06-08 11:37 AEST — 后续新对话只读此文件。

## 项目 & 分支

| 项 | 值 |
|---|---|
| 项目 | `/Users/FrankAI/Documents/澳洲房地产评估系统` |
| 分支 | `codex-review` — ahead **18**, behind **0** (main) |
| HEAD | `50f6c44` — working tree **clean** |
| 远程 | `origin/codex-review` (force-pushed) |

## 测试

`npm run check` (node --check + node --test ×72) ✅ **72/72 全绿**

```
ℹ tests 72
ℹ suites 14
ℹ pass 72
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

包含: 地址核验、数据可信度、数据库 source、物业类型覆盖(6类)、地址州冲突、索引迁移、cron隔离、上传逻辑、来源验证、前端渲染、代码契约、regression(7类型全过)、Nominatim buildSubject(15场景)。

## Production

**URL**: https://aushomevalue.vercel.app (deploy `dpl_HeSAET...`)

## 核心功能 (done)

1. 地址核验 (Nominatim) — exact suburb/state/houseNum/road match, partial 不阻塞
2. Unit 地址 — strip prefix 再查, canonical 保留 prefix; unitStatus=unverified
3. DB prefix fallback — exact→prefix→first-word (Oakleigh South→Oakleigh%)
4. subject.address = canonicalAddress (单一 truth)
5. api/valuation.js 硬编码 `{ fetch:false, useDatabaseFallback:true }`
6. `customerDataStatus` — sufficient / limited / unavailable 三级映射
7. addressMismatch — DB source injected 时跳过地址冲突检测
8. 7 种 property type 全回归通过: House, Vacant land, Townhouse, Villa, Unit, Apartment, Commercial

## 待合并

`codex-review` → `main`。等待 Codex 最终确认。
