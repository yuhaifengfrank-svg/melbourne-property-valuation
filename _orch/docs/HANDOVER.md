# HANDOVER — 2026-07-15 11:25 AEST

## 当前目标
排查 PR #9（`fix/unit-comparable-types`）Preview 环境上 Nominatim 地理编码返回 null 的原因，使 `Unit 1, 11 McIntosh Street, Oakleigh VIC 3166` 能解析出坐标。

## 已完成

1. **Codex 补丁应用**（`fix: geocode Australian unit street addresses`）
   - 新建 `lib/address-geocoding.js` + `tests/unit-address-geocoding-tests.mjs`
   - 修改 `lib/comparable-research-collector.js`：用 `streetAddressForGeocoding()` 替换内联 strip 正则
   - 7 个 geocoding 测试 + 3 个 compatibility 测试全部通过
   - Hash: `2f65d152`
   - 已 push 到 `origin/fix/unit-comparable-types`

2. **Vercel Preview 部署**
   - 第一轮 URL: `https://aushomevalue-4ze4wpaev-frankyhf.vercel.app`
   - 已测试两次，结果一致

3. **测试结果**
   - `subject.coordinates`: ❌ `None`（问题的核心）
   - `midpoint`: $617,594 | `low`: $524,955 | `high`: $710,233
   - `confidence`: Low-Medium (47)
   - `comparableCount`: 12
   - `acceptedComparables`: free summary 层面为空（需 full report cookie auth 才能看明细）
   - 两次结果: ✅ 一致（仅 reportDraftToken 不同）

4. **bundle 打包完成并转交 Codex**
   - `aushomevalue-pr9-latest.bundle` → `~/Downloads/`
   - 含 origin/main + origin/fix/unit-comparable-types 两个 ref
   - SHA-256: `354da899ab2fef9ad374790752f17a3429cdfdf66a3176e46c8bcdb68c352407`
   - 5.8 MB, verify ✅

5. **Codex 第二次补丁应用**（`fix: support compact unit address formats`）
   - `git am` 应用成功
   - 新 commit: `62c12aa5`
   - 语法检查通过
   - 20/20 测试全部通过
   - 已 push 到 `origin/fix/unit-comparable-types`
   - Vercel 自动部署: `https://aushomevalue-guqftcwvb-frankyhf.vercel.app` ✅ Ready

## 分支 & HEAD

| 字段 | 值 |
|------|-----|
| Branch | `fix/unit-comparable-types` |
| HEAD commit | `2f65d152 fix: geocode Australian unit street addresses` |
| Origin | ahead of `origin/fix/unit-comparable-types` |
| Worktree | 无当前活跃 worktree |

## 脏文件（均为 untracked，session 外引入）
- `.worktrees/`, `_orch/handoffs/`, `_orch/tasks/`, `memory/`, `scripts/run-suburb-queue.mjs`, `scripts/run-suburb-queue.sh`

## 已排查的内容

1. **本地 `buildSubject()` 正常返回坐标**
   - `11 McIntosh Street` → Nominatim 返回 `lat=-37.9102885, lon=145.0986924`
   - strip 逻辑（`Unit 1, 11...` → `11 McIntosh Street`）正常
   - `unit-address-geocoding.js` 的 7 个测试全部通过

2. **Nominatim 从澳洲可达，427ms 返回**
   - 从本地 curl Nominatim 仅 0.43s

3. **Vercel 函数在 `iad1`（美东华盛顿）**
   - 疑点：Vercel 到 Nominatim（德国）的网络延迟或限流

4. **`verifyAddress()` 没有 fetch timeout**
   - 如果 Nominatim 在 Vercel 环境内 hang/慢，`catch` 会捕获返回 `{ ok: false }`
   - `buildSubject` 里 `if (v.ok && v.results?.length > 0)` 会跳过，坐标=null

5. **`valuation-full` 端点需要 HttpOnly Cookie + `reportId`，不能直接用 `reportDraftToken`**
   - 所以 free summary 返回的 `acceptedComparables` 信息有限

## 已知问题 / 待排查

### Nominatim 在 Vercel 环境不可用的原因（核心 blocking issue）
- [ ] Vercel iad1 到 nominatim.openstreetmap.org 的 DNS 解析
- [ ] Vercel iad1 到 nominatim 的网络延迟是否导致 fetch 超时
- [ ] Nominatim 是否对 Vercel IP range 有速率限制（1 req/s）
- [ ] Vercel 函数内环境变量是否影响了 fetch（如 HTTP_PROXY）
- [ ] `verifyAddress` 函数中的 fetch 是否需要设置信号超时

### 估值引擎的坐标角色
- [ ] 坐标 null 是否影响 `acceptedComparables` 过滤（距离评分需要坐标）
- [ ] 为什么 comparableCount=12 但 acceptedComparables 为空
  - 也许是 valuation-service 中 `sanitizeForClient` 过滤掉了所有 comparable
  - 或者是在 full report 层面才有，free summary 默认隐藏

## 用户决定
- 按指令执行 Codex 补丁应用流程（不做其他改动）
- 不得修改估值系数、合并 main、操作 Production

## 下一动作
**排查 Vercel 环境 Nominatim 网络可达性**

打开新会话后，第一句话应该是：

> 继续排查 PR #9 Preview 环境 Nominatim 解析问题。当前已知本地 `verifyAddress("11 McIntosh Street VIC")` 返回 `{ lat: -37.9102885, lon: 145.0986924 }`，但在 Vercel Preview `aushomevalue-4ze4wpaev-frankyhf.vercel.app` 上 `subject.coordinates` 为 null。最可能是 Vercel iad1 到 nominatim.openstreetmap.org 的网络问题。下一步请从 Vercel 环境中直接测试 Nominatim 可达性，并检查 `verifyAddress` 的 fetch 是否需要添加信号超时。

## DO NOT
- 合并 main
- 修改估值系数
- 修改 Production
- 运行 migration
- 新建或删除 Neon database/branch
- 暴露 secret/cookie/api key
