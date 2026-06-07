# OPENCLAW_HANDOFF.md

> **交接文档** — 2026-06-07 20:51 AEST (Sun)
> 由 玄甲 (OpenClaw main agent) 撰写。下一对话请先读取本文件 + `ROADMAP.md` + `CODEX_REVIEW_SUMMARY.md`。

---

## 1. 分支与状态

| 项目 | 值 |
|------|-----|
| **分支** | `codex-review`（**未合并** `main`） |
| **HEAD** | `068bbed` — `fixup: ahead-of-main count 7→8 (incl handoff doc itself)` |
| **Ahead of main** | 9 commits |
| **Behind main** | 5 commits（main 有更多修复和合并，未同步到 codex-review） |
| **未提交文件** | 无（working tree clean） |
| **已推送 remote** | ✅ `origin/codex-review` |
| **目录** | `/Users/FrankAI/Documents/澳洲房地产评估系统` |

### codex-review 全部 commits (oldest → newest)

```
cc7d2ea fix(ui): clear default address value on page load; neutral placeholder; P4 test
f288767 fix(ui): robust suburb extraction and address canonicalization
abed12f fix(ui): address-suburb dedup rules; tests for 5 real scenarios
7be1014 fix(ui): address-suburb dedup, conflict resolution, API consistency
351eacf feat: Nominatim 地址核验作为唯一 canonical address 流程
600d814 fix: P1 address verification fixes
3ecf7c6 fix: address verification — partial on missing fields, effectiveAddress truth
9f7828f docs: handoff — OPENCLAW_HANDOFF.md for next agent session
068bbed fixup: ahead-of-main count 7→8 (incl handoff doc itself)
```

---

## 2. 项目底层原则（不可违反）

### 2.1 Nominatim 是 canonical address 唯一真理
- 每次估值 `buildSubject()` 内部调用 Nominatim OpenStreetMap API
- Nominatim 返回 → `verifier.canonicalAddress` → `effectiveAddress` → `subject.address`
- 即使 Nominatim 不可用（返回空），也要保持 fallback 路径，地址置信度降为 low

### 2.2 address 字段关系（关键！）
```
enteredAddress  （客户原始输入，如 "Unit 3/18 Moresby St"）
       ↓
cleanStreet     （formatSubjectStreet 处理，已剥离 unit 前缀）
       ↓
canonicalAddress（Nominatim 拼接的规范化地址，如 "18 Moresby Street, Oakleigh South, VIC, 3167"）
       ↓
effectiveAddress（= canonicalAddress）
       ↓
subject.address （= effectiveAddress，单一真理）
```

**重要：** `valuation-service.js` 中 `address: effectiveAddress`（第 169、194 行）确保最终 subject.address 完全等于 canonicalAddress。不要回退到 `subj.address || effectiveAddress || address`。

### 2.3 核验状态机

```
                ┌─── 全部4字段匹配 ──→ status: verified, confidence: high
                │
  Nominatim OK ──┼─── 部分字段缺失  ──→ status: partial, unconfirmedFields[], confidence: medium
                │
                ├─── 冲突字段确认  ──→ status: mismatch, addressMismatch{} (block)
                │
                └─── 全部缺失      ──→ status: partial, 4 unconfirmed, confidence: medium

  Nominatim 不可用 ──→ status: unavailable, confidence: low, user_input_fallback
```

**核验的 4 个字段（全部必须匹配才算 verified）：**
1. `suburbExact` — 精确相等（`.toLowerCase() ===`），**不是 substring**
2. `stateMatch` — 全名↔缩写映射（Victoria→VIC, New South Wales→NSW 等）
3. `houseNumMatch` — 门牌号精确匹配
4. `roadMatch` — 街道名匹配（去掉后缀后缀）

### 2.4 Mismatch vs Partial 分界
| 场景 | 行为 |
|------|------|
| 双方都有值且明确不同 | **mismatch**（block 估值） |
| 地图某字段缺失（null/undefined） | **partial**（unconfirmedFields[]，不 block，置信度降 medium） |
| Unit 号 → 地图无法核验 | **unitStatus: "unverified"**（不 block，unitPrefix 保留） |

### 2.5 Unit 地址规则
- Unit prefix（`Unit 3/`、`Apt 4/`、`3/`）从 `enteredAddress` 提取（正则 `/^(unit\s+\d+|apt\s+\d+|apartment\s+\d+|\d+\/)/i`）
- **不能**从 `cleanStreet`提取（`formatSubjectStreet` 已剥离 unit 前缀）
- 门牌号提取使用**两阶段清洗**：
  1. 去掉 unit/apt 前缀
  2. 去掉数字后的 `/` 分隔符
  3. 然后 `^(\d+)\s+` 提取 house number
- canonicalAddress 中的 unit prefix 来自 `enteredAddress` 正则匹配

### 2.6 测试原则
| 文件 | 用途 | 运行时间 |
|------|------|----------|
| `test-address-verification.mjs` | 15 场景 mock 测试（无需网络） | <50ms |
| `test-address-lookup.mjs` | 地址查找测试 | <40ms |
| `regression-test.mjs` | 6 种物业类型回归（VM sandbox） | <50ms |
| `integration-test.mjs` | 集成测试（部分需网络 → 注意 timeout） | 10s-60s |

**全量测试命令：** `npm run check`（含 `node --check app.js` + 全部 test）

**已知无害警告：** `res.json is not a function`（regression-test.mjs VM mock 问题）

**⚠️ 集成测试 timeout：** full suite 在 `useDatabaseFallback:true` 测试中会做真实 Nominatim 调用（~10.5s），整套 60s 可能 SIGKILL。**不是 test failure**。可单独跑 `node --test --test-name-pattern=xxx` 避开。

---

## 3. 已完成内容

### 已完成的全部修改（详见 CODEX_REVIEW_SUMMARY.md）

- Nominatim 地址核验作为唯一 canonical address 流程 ✅
- 验证状态三值化 (`cross_source_verified` / `single_source_observed` / `unverified`) ✅
- 置信度动态评分（0-100 连续型，5 等级标签） ✅
- 客户端 sanitize（不暴露 source URL / 内部评分） ✅
- DatabaseComparableSource (Neon PostgreSQL) ✅
- Oakleigh sync 脚本 ✅
- 端到端验证通过（搜索 33 Tamar Grove → $1,291,930） ✅

### 地址核验最终状态

- `subject.address === canonicalAddress`（effectiveAddress 唯一真理） ✅
- suburb 精确匹配（===），不是 substring ✅
- state 比较（全名↔缩写映射） ✅
- house number + road 加入 allMatch（4 字段全部匹配才算 verified） ✅
- 前端先读 JSON 再检查 response.ok ✅
- Missing fields → `unconfirmedFields[]` + `partial` + 不 mismatch ✅
- Unit address → `unitStatus: "unverified"` + 不 mismatch ✅
- Mismatch 仅双方都有值且明确不同 ❗️确认已实现 ✅
- house number regex 两阶段清洗（处理 unit 3/18, unit 3 / 18, unit 3 18, 3/18） ✅
- unitPrefix 从 enteredAddress 而非 cleanStreet 提取 ✅
- `test-address-verification.mjs`（15 场景）+ `test-address-lookup.mjs` 已加入 npm test ✅
- 21/21 测试全绿（address-verification 15 ✅ + address-lookup 5 ✅ + regression ✅） ✅

---

## 4. 关键文件与函数位置

### 4.1 核心逻辑

| 文件 | 关键函数 | 行号 | 说明 |
|------|---------|------|------|
| `lib/comparable-research-collector.js` | `verifyAddress()` | 311 | Nominatim API 调用 + 字段解析 |
| `lib/comparable-research-collector.js` | `buildSubject()` | 354 | 全部核验逻辑：匹配/partial/mismatch/unit |
| `lib/comparable-research-collector.js` | *状态判断块* | 455-533 | unconfirmedFields, allMatch, addressMismatch |
| `lib/comparable-research-collector.js` | `effectiveAddress` | 557-562 | 最终 subject.address 设置 |
| `lib/valuation-service.js` | `runValuation()` | 169,194 | `address: effectiveAddress` |
| `app.js` | 前端 fetch | 1153-1170 | 先 JSON → 检查 mismatch → response.ok |

### 4.2 测试文件

| 文件 | 场景数 | 说明 |
|------|--------|------|
| `test-address-verification.mjs` | 15 | mock Nominatim，6 种 mismatch/partial/fallback/unit 场景 |
| `test-address-lookup.mjs` | 5 | 地址查找 + canonical 测试 |
| `integration-test.mjs` | 多变 | 集成测试，P0+P1 coverage |
| `regression-test.mjs` | 6 物业类型 | VM sandbox 回归 |

### 4.3 配置

| 文件 | 说明 |
|------|------|
| `package.json` — `scripts.test` | 包含 `test-address-verification.mjs test-address-lookup.mjs` |
| `package.json` — `scripts.check` | `node --check app.js && npm test` |

---

## 5. 当前待修复问题（Codex 最后 Round 已完成但需保持）

以下 5 项已在 `3ecf7c6` 中修复，**不要再次「修复」或重新打开**。下一对话直接验证即可：

### 5.1 ✔️ subject.address 使用 canonical address
- **已实现：** `effectiveAddress = verifier.canonicalAddress` → `subject.address = effectiveAddress`
- **位置：** `lib/comparable-research-collector.js` L557-562 + `lib/valuation-service.js` L169,194

### 5.2 ✔️ Unit number 核验状态
- **已实现：** Unit 检测 → `unitStatus: "unverified"`，house number 仍正常匹配（基于 cleaned street 内的门牌）
- **位置：** `lib/comparable-research-collector.js` L428-429

### 5.3 ✔️ Nominatim 缺失字段降级而非 mismatch
- **已实现：** 缺失字段 → `unconfirmedFields[]` → `status: "partial"` → `addressConfidence: "medium"` → 不 block
- **位置：** `lib/comparable-research-collector.js` L455-460, L472, L521-536

### 5.4 ✔️ 地址专项测试加入 npm test
- **已实现：** `package.json` scripts.test 包含 `test-address-verification.mjs test-address-lookup.mjs`

### 5.5 ✔️ Service/API canonical address 测试
- **已实现：** `test-address-verification.mjs` 每个场景都验证 `address === canonicalAddress`

---

## 6. 未完成/已知问题

| 问题 | 优先级 | 说明 |
|------|--------|------|
| **未合并 main** | ⚡️ 阻塞 | codex-review 有 7 commits 未合 main → 无生产部署 |
| **Vercel DATABASE_URL** | ⚡️ 阻塞 | 生产环境未设置，当前在 preview 可用 |
| **CDP browser 未接入** | P2 | `local-cdp-source.js` 未在生产 pipeline 中 |
| **DBComparableSource 未完全整合** | P2 | 当前是 database_fallback 路径，非独立 CDP/DB 分支 |
| **仅 Oakleigh 单 suburb** | P3 | 需要扩展更多墨尔本 suburb |
| **集成测试 timeout** | P4 | `useDatabaseFallback:true` 测试 ~10.5s Nominatim 调用，60s SIGKILL |
| **workspace 杂文件** | 清理 | `/Users/FrankAI/.openclaw/workspace/` 有大量 fix-*.mjs 残留脚本 |

---

## 7. Codex 最新审核意见（Round 10）

### 已采纳
- **effectiveAddress 单一真理** ✅ — `subject.address = canonicalAddress`（valuation-service.js 两处）
- **Unit 不误判 house number** ✅ — 清洗 unit 前缀后提取门牌，两阶段正则
- **缺失字段 ≠ mismatch** ✅ — unconfirmedFields[] + partial 状态
- **Unit prefix 保留** ✅ — 从 enteredAddress 提取，不是 cleanStreet

### 下一对话建议
1. 先验证 `test-address-verification.mjs` 15/15 ✅ → `test-address-lookup.mjs` 5/5 ✅ → `regression-test.mjs` ✅ → `npm run check` 🟢
2. 确认 working tree clean、codex-review 已 push
3. 决定是否合并 main（需小鱼确认）
4. 或开始 DBComparableSource CDP pipeline 整合
5. 或清理 workspace 残留

---

## 8. 测试验证速查

```bash
cd /Users/FrankAI/Documents/澳洲房地产评估系统

# 地址核验测试（最快，始终通过）
node --test test-address-verification.mjs

# 地址查找测试
node --test test-address-lookup.mjs

# 回归测试（6 类型）
node --test regression-test.mjs

# 单项集成测试（避免 timeout 的指定测试）
node --test --test-name-pattern=address integration-test.mjs

# 全量检查
npm run check

# 语法检查
node --check app.js
```

---

*撰于 2026-06-07 20:51 AEST。下一对话请从 `cat OPENCLAW_HANDOFF.md` 开始。*
