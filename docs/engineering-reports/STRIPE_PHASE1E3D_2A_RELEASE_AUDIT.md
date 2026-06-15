# Stripe Phase 1E3D — 2A Release Audit

**Generated**: 2026-06-13 20:00 AEST (v2)  
**Auditor**: 玄甲 (SSE)  
**Project**: 澳洲房地产评估系统 (aushomevalue)  
**Branch**: `main` (commit `59d724c`)  
**Status**: ⛔ **NOT RELEASABLE** — env vars + Dashboard not configured

---

## 1. 测试结果总览

全部 **18 个 Stripe/支付相关测试文件** 均通过。测试数合计：398。

| 测试文件 | 测试数 | 结果 |
|---|---|---|
| `stripe-client-tests.mjs` | 11 | ✅ 全部通过 |
| `report-checkout-builder-tests.mjs` | 17 | ✅ 全部通过 |
| `report-checkout-service-tests.mjs` | 14 | ✅ 全部通过 |
| `report-payment-schema-tests.mjs` | 11 | ✅ 全部通过 |
| `report-payment-service-tests.mjs` | 16 | ✅ 全部通过 |
| `report-payment-webhook-service-tests.mjs` | 20 | ✅ 全部通过 |
| `report-refund-webhook-service-tests.mjs` | 21 | ✅ 全部通过 |
| `stripe-webhook-event-service-tests.mjs` | 32 | ✅ 全部通过 |
| `stripe-report-webhook-signature-tests.mjs` | 14 | ✅ 全部通过 |
| `stripe-report-webhook-integration-tests.mjs` | 17 | ✅ 全部通过 |
| `report-access-session-tests.mjs` | 31 | ✅ 全部通过 |
| `report-draft-service-tests.mjs` | 24 | ✅ 全部通过 |
| `report-entitlement-service-tests.mjs` | 42 | ✅ 全部通过 |
| `report-payment-status-tests.mjs` | 28 | ✅ 全部通过 |
| `report-purchase-e2e.mjs` (E2E) | 12 | ✅ 全部通过 |
| `report-success-tests.mjs` | 65 | ✅ 全部通过 |
| `report-viewer-tests.mjs` | 30 | ✅ 全部通过 |
| `report-viewer-overflow-test.mjs` | 3 | ✅ 全部通过 |
| **合计** | **398** | **✅ 0 FAIL** |

**git diff --check**: ✅ 对 tracked diff 无空白/冲突标记错误。  
**未跟踪文件**: 8 个（审计报告、设计文档、测试输出、备份文件等），与支付代码无关。

---

## 2. 环境变量配置审计 (PASS / BLOCKER)

### 2.1 本地 `.env` / `.env.production`

| 变量 | 本地 `.env` | `.env.production` | 结论 |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | ❌ 不存在 | ❌ 不存在 | **🔴 BLOCKER** |
| `STRIPE_WEBHOOK_SECRET` | ❌ 不存在 | ❌ 不存在 | **🔴 BLOCKER** |
| `STRIPE_PRICE_ID_REPORT_399` | ❌ 不存在 | ❌ 不存在 | **🔴 BLOCKER** |
| `APP_BASE_URL` | ❌ 不存在 | ❌ 不存在 | **⚠️ 强烈建议配置** |
| `REPORT_ACCESS_SESSION_SECRET` | ❌ 不存在 | ❌ 不存在 | **🔴 BLOCKER** |
| `TOKEN_SIGNING_SECRET` | ❌ 不存在 | `""` (空) | **🔴 BLOCKER** (Preview) / ✅ Production |
| `IP_HASH_SALT` | ❌ 不存在 | `""` (空) | ⚠️ Vercel Preview+Production 已配 |
| `DATABASE_URL` | ✅ 已配 | `""` (空) | ⚠️ Vercel 通过多个 DATABASE_* 变量已配 |

### 2.2 Vercel Dashboard 变量

`npx vercel env ls` 确认：

| 变量 | Production | Preview | 结论 |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | ❌ 缺失 | ❌ 缺失 | **🔴 BLOCKER** |
| `STRIPE_WEBHOOK_SECRET` | ❌ 缺失 | ❌ 缺失 | **🔴 BLOCKER** |
| `STRIPE_PRICE_ID_REPORT_399` | ❌ 缺失 | ❌ 缺失 | **🔴 BLOCKER** |
| `APP_BASE_URL` | ❌ 缺失 | ❌ 缺失 | **⚠️ 强烈建议配置** |
| `REPORT_ACCESS_SESSION_SECRET` | ❌ 缺失 | ❌ 缺失 | **🔴 BLOCKER** |
| `TOKEN_SIGNING_SECRET` | ✅ 已配 | ❌ 缺失 | **🔴 BLOCKER** (Preview) |
| `IP_HASH_SALT` | ✅ 已配 | ✅ 已配 | ✅ |
| `DATABASE_URL` | ✅ | ✅ | ✅ |
| `ADMIN_KEY` | ✅ 已配 | ✅ 已配 | ✅ |
| `PRODUCTION_URL` | ✅ 已配 | ❌ 缺失 | ⚠️ 仅 Production |
| `VERCEL_OIDC_TOKEN` | ✅ 自动注入 | ✅ 自动注入 | ✅ |

---

## 3. 代码层面审计明细

### 3.1 Migration-010 与 `api/_db.js` 逐项一致 ✅

对比 `db/migration-010-report-payments.sql` 与 `api/_db.js` 中的 `ensureReportPaymentSchema`：

| 检查项 | Migration | _db.js | 一致? |
|---|---|---|---|
| `report_drafts` 表 | ✅ 存在 | ✅ 存在 | ✅ |
| `report_snapshots` 表 | ✅ 存在 | ✅ 存在 | ✅ |
| `report_payments` 表 | ✅ 存在 | ✅ 存在 | ✅ |
| `report_entitlements` 表 | ✅ 存在 | ✅ 存在 | ✅ |
| `stripe_webhook_events` 表 | ✅ 存在 | ✅ 存在 | ✅ |
| FK `report_snapshots.draft_id → report_drafts.draft_id` | ✅ | ✅ | ✅ |
| FK `report_snapshots.lead_contact_id → lead_contacts(id)` | ✅ | ✅ | ✅ |
| FK `report_payments.report_id → report_snapshots.report_id` | ✅ | ✅ | ✅ |
| FK `report_entitlements.report_payment_id → report_payments(id)` | ✅ | ✅ | ✅ |
| FK `report_entitlements.lead_contact_id → lead_contacts(id)` | ✅ | ✅ | ✅ |
| UNIQUE `report_snapshots.draft_id` | ✅ | ✅ | ✅ |
| UNIQUE `report_entitlements(report_id, lead_contact_id)` | ✅ | ✅ | ✅ |
| UNIQUE `report_payments.purchase_intent_key` | ✅ | ✅ | ✅ |
| UNIQUE `stripe_webhook_events.stripe_event_id` | ✅ | ✅ | ✅ |
| `report_snapshots.snapshot_hash` 非空 | ✅ | ✅ | ✅ |
| ALTER TABLE 顺序: draft_id 在 lead_contact_id 之前 | ✅ | ✅ | ✅ |
| 不修改任何已有表（只 ADD） | ✅ | ✅ | ✅ |
| `ensureReportPaymentSchema` 不由 `ensureSchema` 自动调用 | ✅ | ✅ | ✅ |
| 无卡号/支付敏感数据列 | ✅ | ✅ | ✅ |

**结论**: ✅ 完全一致

### 3.2 Webhook 签名验证 ✅

- `api/stripe-report-webhook.js` 使用 `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`
  - handler export config: `{ api: { bodyParser: false } }` ✅（直接读取 raw body，不经过 JSON 解析）
  - raw body 读取: `await streamToBuffer(req)`，通过缓冲区拼接确保完整
  - 签名失效 → 返回 400 `SIGNATURE_INVALID`，不暴露签名值
  - 缺失 `STRIPE_WEBHOOK_SECRET` → 503 `WEBHOOK_NOT_CONFIGURED`
  - 不直接导入 Stripe SDK 或 SECRET_KEY — 只用 webhook 模块的 `constructEvent` ✅
  - 正文超过 1MB → 413 `WEBHOOK_BODY_TOO_LARGE`
  - 辅助函数 `stripe-webhook-event-service.js` 提供事件幂等性（`claimWebhookEvent` → INSERT ON CONFLICT）
  - sanitise 错误信息（移除 webhook-secret-placeholder, v1=, sk-test-placeholder/sk-live-placeholder 等敏感模式）

**结论**: ✅ 签名验证实现正确

### 3.3 事件类型处理 ✅

| 事件 | 处理函数 | 行为 |
|---|---|---|
| `checkout.session.completed` | `handleCheckoutCompleted` | 验证金额(399c)/货币(aud)/元数据/模式(payment)，创建/更新支付记录为 paid，创建 active entitlement |
| `charge.refunded` | `handleChargeRefunded` | 验证 amount_refunded > 0，原子性撤销 entitlement（CTE），更新支付为 refunded |
| 其他事件 | 跳过 | 返回 200，不报错 |

Idempotency: `claimWebhookEvent` 使用 `INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING`，已处理事件不可重入，失败事件可 retry。

**结论**: ✅ 事件路径完整

### 3.4 固定 Price ID ✅

- `lib/report-checkout-builder.js` 中 `buildReportCheckoutParams` 调用 `getReportPriceId()`，该函数从 `process.env.STRIPE_PRICE_ID_REPORT_399` 读取
- 没有任何硬编码的 Price ID 字符串
- 生产环境缺少该变量 → `getStripe()`/`getReportPriceId()` 抛出异常 → `createReportCheckout` 捕获返回 `STRIPE_NOT_CONFIGURED`
- `buildReportCheckoutParams` 只接收 `reportId` 和 `purchaseIntentKey`，不接受客户端提供的 Price ID

**结论**: ✅ Price ID 来源正确，无硬编码

### 3.5 成功/取消 URL ✅

- 成功 URL（`lib/report-checkout-builder.js` 实际代码）:
  ```
  <baseUrl>/report-success.html?report_id=<encodedReportId>
  ```
  - URL 使用 encodeURIComponent(reportId) 编码
  - 不使用 `{CHECKOUT_SESSION_ID}` 占位符
- 取消 URL:
  ```
  <baseUrl>/?payment=cancelled&report_id=<encodedReportId>
  ```
  - 同样编码 reportId
- `getAppBaseUrl()` 优先级链:
  1. `APP_BASE_URL` 环境变量（**强烈建议配置**）
  2. `PRODUCTION_URL` 环境变量
  3. `VERCEL_URL`（Vercel 自动注入 —— Preview 部署可行）
  4. `http://localhost:3000`（仅当以上全部缺失时的最终 fallback）
- 缺失 `APP_BASE_URL` 时不直接阻断支付，但强烈建议配置以确保 URL 正确

### ⚠️ 代码注释漂移

`lib/report-checkout-builder.js` 顶部 JSDoc 注释仍写：
```
//   success_url = getAppBaseUrl() + "/payment-success.html?session_id={CHECKOUT_SESSION_ID}"
```

实际代码使用的是 `/report-success.html?report_id=<reportId>`。注释在 Phase 1E3C-3B-2 重构时未同步更新。非功能阻断，建议后续修正。

### 3.6 AUD $3.99 文案 ✅

| 位置 | 值 | 来源 |
|---|---|---|
| `lib/report-checkout-builder.js` | `amount_cents: 399, currency: "aud"` | 硬编码常量 |
| `lib/report-checkout-builder.js` | `PRODUCT_CODE: "valuation_report_399"` | 硬编码常量 |
| `lib/report-payment-service.js` | `amount_cents: 399, currency: "aud"` | 硬编码 INSERT 值 |
| `lib/report-payment-webhook-service.js` | `399` | 验证 amount === 399 |
| `public/app.js` (多个位置) | `"AUD $3.99"` | 硬编码显示文本 |
| Stripe PRICE_ID | 从环境变量 `STRIPE_PRICE_ID_REPORT_399` 读取 | 不硬编码 |

**静态检查**: Stripe Price 的 amount 是 399 AUD cents，与前端显示的 $3.99 一致 ✅

### 3.7 权限链验证 ✅

```
Free Valuation → createReportDraft → 返回 signed draft token（30分钟有效）
       ↓
Checkout → verifyReportDraftToken → consumeDraftIntoSnapshot → INSERT report_snapshot
       ↓
Stripe Checkout Session → 用户支付 →
       ↓
Webhook checkout.session.completed → handleCheckoutCompleted → INSERT report_entitlement (active)
       ↓
Report Viewer → extractReportAccessCookie → verifyReportAccessSession
       ↓
valuation-full API → verifyReportAccessSession → checkReportEntitlementByContactId → 返回 snapshot
```

**关键约束**：
- Draft token 签名密钥: `TOKEN_SIGNING_SECRET`（派生 HMAC key, context prefix "report-draft-v1"）
- Session cookie 签名密钥: `REPORT_ACCESS_SESSION_SECRET`
- 数据库是唯一 entitlement 权威（cookie 不授权，仅验证身份）
- Cookie 30分钟 TTL，不持有完整 entitlement 状态
- `checkReportEntitlementByContactId` 检查 `report_entitlements.status='active'` + `report_payments.status='paid'` + `report_snapshots` 存在
- Opportunity cookie 不可用于 Report viewer（不同名称、不同密钥）
- 撤销（refund）使用 CTE 原子性操作：先检查 entitlement，再更新支付，再更新 entitlement

**结论**: ✅ 权限链完整，无安全漏洞

### 3.8 Stripe Test Mode 检测 ⚠️

`lib/stripe-client.js` 当前行为：
- `NODE_ENV === "test"` → 返回 mock（不连接 Stripe）
- 生产环境：`new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" })`
- ❌ **未做 `sk-test-placeholder` vs `sk-live-placeholder` 前缀校验**
- 没有 `STRIPE_MODE` 环境变量来控制 test/live 模式选择

**建议**（在配置密钥前完成）：
- 增加 `STRIPE_MODE` 环境变量（`"test"` / `"live"`）
- 启动时校验 `sk-test-placeholder` / `sk-live-placeholder` 前缀是否与模式匹配
- 防止 Preview 环境误用 Production Live key

---

## 4. Stripe Dashboard 待人工确认项

以下项目 **无法从本地或 Vercel 确认**，环境变量缺失不等于 Dashboard 中不存在，需人工在 Stripe Dashboard 中确认：

| # | 配置项 | 状态 |
|---|---|---|
| 1 | **Stripe 账户激活**（Test Mode） | 🔴 NOT CONFIRMED |
| 2 | **Stripe Secret Key** (`sk-test-placeholder...`) 已生成 | 🔴 NOT CONFIRMED |
| 3 | **Stripe Webhook Secret** (`webhook-secret-placeholder...`) 已生成 | 🔴 NOT CONFIRMED |
| 4 | **Stripe Product + Price** (AUD 399c, one_time, active) 已创建 | 🔴 NOT CONFIRMED |
| 5 | **Price ID**（`price_...`）已记录，可用于 `STRIPE_PRICE_ID_REPORT_399` | 🔴 NOT CONFIRMED |
| 6 | **Webhook Endpoint** 创建并指向 `<deploy-url>/api/stripe-report-webhook` | 🔴 NOT CONFIRMED |
| 7 | **Webhook 订阅事件**: `checkout.session.completed`, `charge.refunded` | 🔴 NOT CONFIRMED |
| 8 | **"Send all events to this endpoint"** 未启用 | 🔴 NOT CONFIRMED |

---

## 5. 最终阻断项

### 🔴 必须解决才能部署支付

| # | 阻断项 | 说明 |
|---|---|---|
| 1 | `STRIPE_SECRET_KEY` 未配置（Vercel Preview + Production） | Stripe 连接不可用 |
| 2 | `STRIPE_WEBHOOK_SECRET` 未配置（Vercel Preview + Production） | Webhook 签名验证不可用 |
| 3 | `STRIPE_PRICE_ID_REPORT_399` 未配置（Vercel Preview + Production） | Stripe Checkout Session 无法创建 |
| 4 | `REPORT_ACCESS_SESSION_SECRET` 未配置（Vercel Preview + Production） | 报告访问 cookie 签名在 Production 环境不可用 |
| 5 | `TOKEN_SIGNING_SECRET` 未配置（Vercel Preview） | Preview 部署中报告 draft token 无法安全生成（代码不会自动回退 dev secret） |
| 6 | Stripe Dashboard 账户激活及配置状态未确认 | Product、Price、Webhook 端点均需人工确认 |

### ⚠️ 强烈建议但非阻断

| # | 项目 | 说明 |
|---|---|---|
| 1 | `APP_BASE_URL` 未配置（Vercel Preview + Production） | 缺失时优先使用 `VERCEL_URL`（Vercel 自动注入），仅最终 fallback 到 `localhost:3000` |

### ⚠️ 安全建议

| # | 建议 | 优先级 |
|---|---|---|
| 1 | 增加 `STRIPE_MODE` 环境变量 + `sk-test-placeholder`/`sk-live-placeholder` 前缀校验 | 🔴 配置密钥前 |
| 2 | 修正 `lib/report-checkout-builder.js` 顶部注释（`payment-success`→`report-success`, `session_id`→`report_id`） | 🟢 非功能阻断技术债 |

---

## 6. 部署就绪判断

| 条件 | 状态 |
|---|---|
| 代码测试通过 (398/398) | ✅ |
| git diff --check (tracked) | ✅ |
| migration-010 vs _db.js 一致 | ✅ |
| 权限链完整 | ✅ |
| Webhook 签名实现正确 | ✅ |
| Price ID / 金额 / 货币一致 | ✅ |
| 成功/取消 URL 正确 | ✅ |
| 前端文案 "$3.99" 正确 | ✅ |
| Cookie HttpOnly/Secure/SameSite 安全配置 | ✅ |
| 错误消息不泄露敏感信息 | ✅ |
| 幂等性正确处理（事件 + 支付 + entitlement） | ✅ |
| `STRIPE_SECRET_KEY` 已配 | **🔴 缺失** |
| `STRIPE_WEBHOOK_SECRET` 已配 | **🔴 缺失** |
| `STRIPE_PRICE_ID_REPORT_399` 已配 | **🔴 缺失** |
| `REPORT_ACCESS_SESSION_SECRET` 已配 | **🔴 缺失** |
| `TOKEN_SIGNING_SECRET` (Preview) 已配 | **🔴 缺失** |
| Stripe Dashboard 配置确认 | **🔴 NOT CONFIRMED** |
| `sk-test-placeholder` 前缀校验 | ⚠️ 尚未实现 |

**最终结论**: ⛔ **不可部署支付功能**。代码正确（398/398 测试通过），但 5 个环境变量缺失 + 1 个仅 Production 配了 + Dashboard 全部未确认，Payment 流程在任何环境都无法正常运行。

---

## 7. 部署建议

### 先决条件（Ordered）

1. **实现 `STRIPE_MODE` + key 前缀校验**（安全护栏，配置密钥前做）
2. **Stripe Dashboard**: 激活 Test Mode，创建 Product (AUD $3.99) + Webhook endpoint
3. **Vercel 配置**: 补全 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_PRICE_ID_REPORT_399`、`REPORT_ACCESS_SESSION_SECRET`、`TOKEN_SIGNING_SECRET` 到 Preview + Production
4. **强烈建议**: 配置 `APP_BASE_URL`
5. **Preview Deploy**: 用 Preview URL 通过 Stripe CLI `stripe trigger checkout.session.completed` 端到端测试
6. **生产前**: 切换到 Live 模式的 key + webhook secret + Price ID

---

## 8. 下一步

- 代码无需修改（398/398 测试通过），仅需修正注释漂移（3.5 节）和增加 key 前缀校验（可选）
- 此报告已提交 **Codex** 进行架构审核
- 待 Codex 审核通过后，可推进 Vercel 环境变量配置 + Stripe Dashboard 设置
