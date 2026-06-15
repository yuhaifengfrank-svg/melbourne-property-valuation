# Production Payment Readiness — Phase 1 审计报告

**Auditor**: 玄甲 (SSE)  
**Date**: 2026-06-15 21:48 AEST  
**Project**: 澳洲房地产评估系统 (aushomevalue)  
**Branch**: `main` (HEAD `7a3a0e3`)  
**Status**: ⛔ **NO-GO** — 阻塞项未解决前不可开放支付

---

## 1. Production Payment Gate 状态

当前 gate 谓词：`VERCEL_ENV === "preview" && STRIPE_MODE === "test"`

| 检查项 | 结果 |
|--------|------|
| valuation API `paymentsEnabled` | `False` ✅ Production 返回 false |
| create-report-checkout → 503 | `PAYMENTS_GATE_BLOCKED` ✅ |
| Preview E2E 已验证 | ✅ Stripe Test Mode checkout URL 正确返回 |
| 前端 `.layout` `payments-disabled` | ✅ class 存在，按钮隐藏 |
| $3.99 按钮 HTML | ✅ 文案存在，JS 通过 `paymentsDisabled` 控制显示 |

**结论**: ✅ 支付门在生产关闭中，fail-closed 设计正确。但当前 gate 条件不含显式 Production 开关——见 Blocker B1。

---

## 2. Test/Production 隔离审计

### 2.1 环境变量覆盖

| 变量 | Preview | Production | 差异 |
|------|---------|------------|------|
| `STRIPE_SECRET_KEY` | ✅ 配置 (sk-test-placeholder) | ✅ 配置 (sk-test-placeholder) | ⚠️ 同一密钥共用两个环境。转 Live 时须分离 |
| `STRIPE_WEBHOOK_SECRET` | ✅ 配置 (webhook-secret-preview-redacted) | ❌ 未配置 | ✅ 预期内（Live webhook 尚未创建） |
| `STRIPE_PRICE_ID_REPORT_399` | ✅ 配置 (price_1ThoTk) | ✅ 配置 (price_1ThoTk) | ⚠️ 同一 Price ID 共用。转 Live 时须分离 |
| `APP_BASE_URL` | ❌ 未显式配置 | ✅ `https://www.aushomevalue.com.au` | ✅ Preview 使用 `VERCEL_URL` fallback 是有效设计 |
| `REPORT_ACCESS_SESSION_SECRET` | ✅ 配置 | ✅ 配置 | ✅ |
| `TOKEN_SIGNING_SECRET` | ✅ 配置 | ❌ 未配置 | ⚠️ Production 缺失 |
| `STRIPE_MODE` | `test` | `test` | ⚠️ 均设为 `test`，Production 上线前须切换 |
| `DATABASE_URL` | ✅ 配置 | ✅ 配置 | ✅ 各自独立记录，指向不同 Neon branch |
| `IP_HASH_SALT` | ❌ 未配置 | ❌ 未配置 | ⚠️ 均缺失 |
| `PRODUCTION_URL` | ❌ 未配置 | ❌ 未配置 | ⚠️ 均缺失 |

### 2.2 密钥前缀验证

| 密钥 | 前缀 | 与 STRIPE_MODE 一致？ |
|------|------|----------------------|
| `STRIPE_SECRET_KEY` | `sk-test-placeholder` | ✅ Test Mode 正确 |
| `STRIPE_WEBHOOK_SECRET` | `webhook-secret-preview-redacted` | ✅ Test Mode webhook |

### 2.3 数据库端点（Neon）

| 环境 | Endpoint | 用途 |
|------|----------|------|
| Production main | `ep-winter-band-a7qym6bq-pooler` | 主数据库，生产查询 |
| Preview | `ep-young-violet-a7xmpsmz-pooler` | Preview 部署分支 |

两者为 **不同 Neon branch/endpoint**，各自独立。

### 2.4 代码层安全护栏

- `lib/stripe-client.js:validateStripeConfig()` ✅ Preview → live mode 抛异常拒绝
- `validateStripeConfig()` ✅ 校验 `sk-test-placeholder`/`sk-live-placeholder` 前缀与 mode 匹配
- `signed-token.js` ✅ 有 dev fallback，Production 缺 `TOKEN_SIGNING_SECRET` 抛异常

---

## 3. Stripe Live 准备项

> 以下项需在 Stripe Dashboard 中人工操作（当前无任何 Live 配置）。

| 准备项 | 状态 | 操作方 |
|--------|------|--------|
| Live 账户激活 | 🔴 未确认 | 用户 — Stripe Dashboard |
| Live Product `valuation_report_399` 存在 | 🔴 未创建 | 用户 — Stripe Dashboard |
| Live Price AUD 399c, one_time, active | 🔴 未创建 | 用户 — Stripe Dashboard |
| Live Webhook Endpoint 存在 | 🔴 未创建 | 用户 — Stripe Dashboard |
| Webhook events: `checkout.session.completed`, `charge.refunded` 仅此两项 | 🔴 未配置 | 用户 — Stripe Dashboard |
| Webhook endpoint URL: `https://www.aushomevalue.com.au/api/stripe-report-webhook` | 🔴 未配置 | 用户 — Stripe Dashboard |
| Webhook signing secret (`webhook-secret-placeholder...`) 生成并配置到 Vercel | 🔴 未生成 | 用户 — 此操作同时解决 B4 |

### 代码支持的 webhook 事件

`api/stripe-report-webhook.js`：

| 事件 | 处理 | 验证 |
|------|------|------|
| `checkout.session.completed` | ✅ `handleCheckoutCompleted` | 399c, aud, payment mode |
| `charge.refunded` | ✅ `handleChargeRefunded` | CTE 原子撤销 |
| 其他事件 | ✅ 跳过，200 不报错 | 安全 |

---

## 4. 正式域名与回调 URL

| 检查项 | 值 | 状态 |
|--------|-----|------|
| `APP_BASE_URL` | `https://www.aushomevalue.com.au` (Production only) | ✅ 正确 |
| Preview fallback | `VERCEL_URL` (auto-injected) | ✅ 有效设计 |
| Success URL | `<baseUrl>/report-success.html?report_id=<encodedReportId>` | ✅ 正确 |
| Cancel URL | `<baseUrl>/?payment=cancelled&report_id=<encodedReportId>` | ✅ 正确 |
| Webhook URL | `<baseUrl>/api/stripe-report-webhook` | ✅ 动态生成 |
| 硬编码 preview URL | ❌ 未发现 | ✅ |
| 硬编码 bypass secret | ❌ 未发现 | ✅ |

**结论**: ✅ 回调 URL 全动态生成，不含任何硬编码 Preview URL 或 bypass secret。

---

## 5. 商业与法律文案

### 5.1 现有文案

| 检查项 | 内容 | 状态 |
|--------|------|------|
| 价格 | `AUD $3.99 one-time` | ✅ |
| 购买性质 | one-time payment, 非订阅 | ✅ checkout modal 明确 |
| 退款说明 | checkout modal + report-success 均导向 `info@aushomevalue.com.au` | ✅ |
| 联系方式 | `info@aushomevalue.com.au` | ✅ |
| 估值免责声明 | footer 双语：非财务建议、非正式估值 | ✅ |
| 借贷免责声明 | 前端 loan 区域：非贷款批准 | ✅ |
| 隐私/数据处理 | checkout modal "No card details are collected on this site" + footer | ⚠️ 无独立隐私政策链接 |
| 报告期限 | 未明示购买后报告可访问多久 | ⚠️ **缺口** |
| 退款政策 | 无正式政策条款，仅"联系 support" | ⚠️ **缺口** |
| 使用条款链接 | 未发现 Terms of Service 链接 | ⚠️ **缺口** |

### 5.2 文案缺口（Non-Blocker，上线前建议完善）

1. **报告访问期限未明示** — 应说明购买后报告在多长时间内可查看
2. **无正式退款政策** — 当前仅 "contact us"，建议完善退/换政策
3. **无使用条款 (ToS) 链接** — 至少应在 checkout modal 中链接
4. **无独立隐私政策链接** — 当前仅靠说明性文字

> ⚠️ 本报告不构成法律结论，仅供参考建议。

---

## 6. 数据与权限

### 6.1 权限链

```
entitlement (report_entitlements 表, status='active')
+ payment (report_payments 表, status='paid')
+ snapshot (report_snapshots 表)
= 可用
```

| 检查项 | 结果 |
|--------|------|
| entitlement 是唯一权限来源 | ✅ `checkReportEntitlementByContactId` DB 查询为唯一 gate |
| Cookie 不授权 | ✅ cookie 仅身份验证(`verifyReportAccessSession`)，不持有 entitlement |
| Opportunity cookie 不泄露 | ✅ cookie name `aushomevalue_report_access` |
| Refund 撤销 | ✅ CTE 原子操作：先 revoke entitlement，再 refund payment |
| 撤销后重试保护 | ✅ `handleChargeRefunded` idempotent 处理 |

### 6.2 Migration-011 — `idx_rs_draft_id` 索引验证

| 检查项 | 状态 | 来源 |
|--------|------|------|
| idx_rs_draft_id 存在 | ✅ `exists=true` | 当日操作日志 |
| 唯一约束 | ✅ `unique=true` | 当日操作日志 |
| 部分索引 | ✅ `partial=false`（完整索引） | 当日操作日志 |
| 是否需要执行 migration-011 | ❌ **不执行** | 索引已验证正确，本阶段仅只读确认 |

Production DB 的 `idx_rs_draft_id` 已是 full unique index。**本审计阶段不做任何 DROP/CREATE/ALTER**，仅记录已确认状态。开通支付时无需再执行 migration-011。

---

## 7. 最终判定

### 🔴 Blocker 清单（必须解决）

| # | 阻塞项 | 影响范围 | 修复方式 |
|---|--------|---------|----------|
| B1 | 当前 gate 只允许 `VERCEL_ENV=preview + STRIPE_MODE=test`，Production + live 永远被阻断 | Production 支付无法激活 | 新增显式 `PAYMENTS_ENABLED=true` 环境变量作为 Production 开关，保持默认 `false`。gate 条件更新为 `paymentsEnabled === true` |
| B2 | `TOKEN_SIGNING_SECRET` 在 Production 缺失 | Draft token 无法安全生成 | 配置 Production 版 secret |
| B3 | Stripe Live 产品/Price/Webhook 未创建 | 无法收款 | 用户操作 Stripe Dashboard（见下方清单） |
| B4 | Stripe Live webhook secret 未配置到 Vercel (STRIPE_WEBHOOK_SECRET) | 无法验证 webhook 签名 | 创建 Live webhook 后配置 |

> B1、B2 可在 Vercel Dashboard 或 CLI 中操作。  
> B3、B4 须登录 Stripe Dashboard。

### 🟡 Non-Blocker 清单（上线前建议修复）

| # | 项目 | 优先级 |
|---|------|--------|
| N1 | 文案：报告访问期限未明示 | Medium |
| N2 | 文案：无正式退款政策 | Medium |
| N3 | 文案：无使用条款/隐私政策链接 | Low-Medium |

| N5 | `IP_HASH_SALT` 在 Preview+Production 均缺失 | Low |
| N6 | `PRODUCTION_URL` 环境变量缺失 | Low |
| N7 | Preview 与 Production 共用同一 Stripe Test key（转 Live 时自然分离） | Low |
| N7 | `lib/report-checkout-builder.js` 注释笔误（`session_id`→`report_id`） | Low |

### 👤 需要用户人工完成的 Stripe Dashboard 操作

> 登录 https://dashboard.stripe.com，切换到 **Live Mode**

1. **创建 Price** — AUD $3.99 (399c), one_time, active → 复制 `price_...`
2. **创建 Webhook Endpoint** → URL: `https://www.aushomevalue.com.au/api/stripe-report-webhook`
3. **选择 Webhook Events**: `checkout.session.completed` + `charge.refunded`
4. **复制 Webhook Signing Secret** (`webhook-secret-placeholder...`)
5. 返回后在 Vercel 配置以下环境变量（target=production）：
   - `STRIPE_SECRET_KEY` = `sk-live-placeholderxxx`
   - `STRIPE_PRICE_ID_REPORT_399` = `price_...`
   - `STRIPE_WEBHOOK_SECRET` = `webhook-secret-placeholder...`
   - `STRIPE_MODE` = `live`
   - **注意**：不要给 Preview 配置 Live key — 代码层已有 guard 拒绝 Preview + live 组合

### ✅ 推荐上线顺序

```
Step 1: 新增 PAYMENTS_ENABLED env var、更新 gate 条件、代码审查 → 部署
Step 2: 配置 TOKEN_SIGNING_SECRET（Production 目标）
Step 3: 用户操作 Stripe Dashboard（Price, Webhook）
Step 4: 配置 Stripe Live env vars（Secret Key, Price ID, Webhook Secret, Mode）
Step 5: Preview Deploy 验证（bypass + Stripe CLI trigger 测试）
Step 6: 部署到 Production（vercel --prod）
Step 7: 设置 PAYMENTS_ENABLED=true → 再部署
Step 8: 真人测试 production 支付
Step 9: 监控 webhook 成功率 + 退款测试
```

### 🔄 回滚方案

| 层级 | 操作 | 影响 |
|------|------|------|
| 快速回滚 | 删除 `PAYMENTS_ENABLED` env var 或设为 `false` → 部署 | 立即阻止新交易 |
| 次快 | 将 `STRIPE_SECRET_KEY` 改为无效值 | 所有 Stripe API 调用失败 |
| 环境变量 | 恢复 gate 条件 / 删除 Production Stripe env vars | |
| 代码 | `git revert` HEAD → 部署（HEAD `7a3a0e3`） | |
| Stripe | 停用 webhook endpoint、删除 Live price/product | 不影响已售报告 |
| 数据 | 不涉及 schema 变更，entitlement 数据保留 | |

---

### 判定：⛔ NO-GO — 4 个 Blocker

| Blocker | 修复方 | 预估时间 |
|---------|--------|---------|
| B1 — Production 开关 (PAYMENTS_ENABLED) | 代码 + 部署 | 1-2h（含 review） |
| B2 — TOKEN_SIGNING_SECRET | Vercel CLI / Dashboard | 5min |
| B3 — Stripe Live 配置 | 用户 Dashboard | ~30min |
| B4 — Live webhook secret | 用户 Dashboard → Vercel CLI | 5min |

其中 B1 是唯一需要代码变更的 blocker。B2-B4 是配置项。建议先走 Step 1-4，最后完成 B1（因为设了 PAYMENTS_ENABLED=true 后支付就真正开放了）。

---

*Report generated by 玄甲 (SSE) — Phase 1 只读审计，未修改任何环境变量、代码或数据。*
