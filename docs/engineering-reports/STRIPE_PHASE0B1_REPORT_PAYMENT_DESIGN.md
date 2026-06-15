# Stripe Phase 0B1 — AUD $3.99 单次估值报告支付设计

**日期**: 2026-06-12
**基准 commit**: `278484c`
**依赖审计**: `docs/engineering-reports/STRIPE_PHASE0A_AUDIT.md`

---

## 0. 设计原则

| # | 原则 | 含义 |
|---|------|------|
| 1 | **数据库 entitlement 是唯一付费权限来源** | 不信任 cookie、localStorage、success URL query param |
| 2 | **不复用 Opportunity token** | `opportunity` gate_level 不能解锁 report，反之亦然 |
| 3 | **Stripe 字段不进 lead 表** | `lead_preferences` 不存任何 Stripe 数据，走独立支付表 |
| 4 | **服务端 Price ID 白名单** | 不接受客户端传金额或 product，只接受服务端已知的 price_id |
| 5 | **Webhook 是唯一可信付款通知** | 不信任 Checkout 跳转时的 query param |
| 6 | **不出测试环境混合** | local dev 用 stripe test key，production 用 live key，通过 NODE_ENV 区分 |

---

## 1. report_id 生成方案

### 格式

```
rp_<timestamp_ms>_<crypto_random_8bytes_hex>
```

示例：`rp_1750612345678_a3f2c91b8e4d`

### 生成位置

`api/valuation.js` 的 `buildLockedPreview()` 阶段（已在免费估值返回时运行）。

### 不可伪造性

- 前缀 `rp_` 可路由区分
- 8 字节 crypto random = 2^64 个可能值，碰撞概率可忽略
- `signed-token.js` 已有 `crypto.randomBytes()`，可直接复用 `generateSessionId()` 的随机数生成方式（增加 entropy）

### 绑定关系

`report_id` → 三元组：

```json
{
  "report_id": "rp_1750612345678_a3f2c91b8e4d",
  "property_key": "3|Moresby Street|Oakleigh|VIC|3166|unit",
  "valuation_version": "v2026-06-12-001",
  "generated_at": "2026-06-12T15:30:00.000Z",
  "midpoint": 825000,
  "low": 780000,
  "high": 870000
}
```

- `property_key` = 地址指纹（`id|street|suburb|state|postcode|type`），同一地址不同单位形成不同 key
- `valuation_version` 跟踪估值引擎版本
- `report_id` 在用户**发起 checkout 时**（`create-checkout-session` API）生成，不是估值时预分配

### 为什么 checkout 时才生成？

延迟分配避免了重复地址的 orphan report_id，确保只在真有购买意图时落库。

---

## 2. Checkout Session 创建 API

### `POST /api/create-checkout-session`

**输入：**

```json
{
  "email": "user@example.com",
  "property_key": "3|Moresby Street|Oakleigh|VIC|3166|unit",
  "address_line": "3/18 Moresby St, Oakleigh VIC 3166",
  "suburb": "Oakleigh",
  "property_type": "Unit",
  "midpoint": 825000,
  "success_path": "/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
  "cancel_path": "/?checkout=cancel",
  "email_consent": true
}
```

**输入校验（服务端）：**

| 字段 | 规则 |
|------|------|
| `email` | 必填，valid email format |
| `property_key` | 必填，格式 `^[^|]+\|[^|]+\|[^|]+\|[^|]+\|\d+\|[^|]+$` |
| `property_type` | 白名单：`house`, `unit`, `apartment`, `townhouse`, `villa`, `vacant_land`, `commercial` |
| `midpoint` | 可选，只记录不信任（用于定价参考，不用于计费） |
| `email_consent` | 可选 boolean，记录到 `consent_records`（type=`service_processing`） |

**Price ID（白名单，硬编码）：**

```javascript
const REPORT_PRICE_ID = process.env.STRIPE_PRICE_ID_REPORT_399;
// 仅接受此 price ID，不接受任何客户端传入的价格或产品
```

**后端流程：**

```
1. 校验输入参数
2. 生成 report_id（crypto random）
3. 查询/创建 Stripe Customer（按 email lookup，存在则复用）
4. 创建 Checkout Session：
   - mode: payment
   - line_items: [{ price: REPORT_PRICE_ID, quantity: 1 }]
   - customer: stripe_customer_id
   - client_reference_id: report_id（用于 webhook 关联）
   - metadata: { report_id, property_key, email, address_line, suburb, property_type, midpoint }
   - success_url: absolute URL with ?checkout=success&session_id={CHECKOUT_SESSION_ID}
   - cancel_url: absolute URL with ?checkout=cancel
5. 在本地 DB 插入 payments 记录（status=pending）
6. 返回 { ok: true, url: checkout_session.url, report_id }
```

**输出：**

```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/c/pay/cs_test_xxx",
  "report_id": "rp_1750612345678_a3f2c91b8e4d"
}
```

**UI 行为：** 前端收到 `url` 后执行 `window.location.href = url`，跳转到 Stripe Checkout。

---

## 3. 数据库 Schema（最小版 — Phase 0B1 只含报告支付）

### 表 1: `payments`

```sql
CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    report_id TEXT NOT NULL UNIQUE,
    checkout_session_id TEXT,
    stripe_payment_intent_id TEXT,
    stripe_customer_id TEXT,
    email TEXT NOT NULL,
    property_key TEXT NOT NULL,
    amount INTEGER NOT NULL,           -- cents, e.g. 399
    currency TEXT NOT NULL DEFAULT 'aud',
    status TEXT NOT NULL DEFAULT 'pending',
        CHECK (status IN ('pending', 'completed', 'refunded', 'expired', 'failed')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_report_id ON payments (report_id);
CREATE INDEX IF NOT EXISTS idx_payments_checkout_session ON payments (checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_email ON payments (email);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent ON payments (stripe_payment_intent_id);
```

### 表 2: `report_entitlements`

```sql
CREATE TABLE IF NOT EXISTS report_entitlements (
    id BIGSERIAL PRIMARY KEY,
    report_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    property_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
        CHECK (status IN ('active', 'refunded', 'revoked')),
    granted_by TEXT NOT NULL DEFAULT 'webhook:checkout.session.completed',
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_report_entitlements_email ON report_entitlements (email);
CREATE INDEX IF NOT EXISTS idx_report_entitlements_property_key ON report_entitlements (property_key);
CREATE INDEX IF NOT EXISTS idx_report_entitlements_status ON report_entitlements (status);
```

### 表 3: `stripe_webhook_events`（幂等日志）

```sql
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id BIGSERIAL PRIMARY KEY,
    stripe_event_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processed',
        CHECK (status IN ('received', 'processed', 'skipped', 'failed')),
    related_report_id TEXT REFERENCES payments(report_id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON stripe_webhook_events (stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type ON stripe_webhook_events (type);
```

### 新表纳入 DB 初始化

在 `api/_db.js` 的 `initCustomerFunnel` 之后或另一个 `initPayments` 函数中运行上述 CREATE TABLE IF NOT EXISTS。**PS：迁移脚本应放 `db/migration-010-payments.sql`。**

### 不使用 Lead 现有表的理由

| 表 | 为什么不直接存 |
|----|---------------|
| `lead_contacts` | Stripe customer 映射需要独立记录，不与 contact consent 耦合 |
| `lead_preferences` | 产品要求禁止将 Stripe 字段放进 lead 表 |
| `lead_events` | 支付事件可复用此表记录 event_type=`payment_event`，但核心数据在 payments 表 |
| `consent_records` | 只允许 `service_processing` 和 `marketing`。`email_consent` 可写入 `service_processing`，但 payment 授权不在此表。独立的 `stripe_webhook_events` 更干净 |

---

## 4. Webhook 端点设计

### `POST /api/stripe-webhook`

**签名验证（强制）：**

```javascript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,           // raw body — Vercel 需要 buffer 模式
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  // ... process event
}
```

**Vercel 特殊处理：**
- Vercel serverless 默认解析 JSON body，但 webhook 需要原始 body
- 需要在 C2 实施时处理：要么关闭 body parser（`config = { api: { bodyParser: false } }`），要么在 proxy layer 传入 buffer

**幂等处理：**

```javascript
// 1. 从 event 中提取 stripe_event_id (event.id)
// 2. 查找 stripe_webhook_events 表
// 3. 如果已存在 status='processed' → 返回 200 跳过
// 4. 如果已存在 status='received' → 等待完成
// 5. 插入 stripe_webhook_events (stripe_event_id, type, status='received')
// 6. 处理逻辑 → 更新 status='processed' 或 'failed'
```

### 处理的事件

| Stripe Event | 处理逻辑 |
|-------------|----------|
| `checkout.session.completed` | 验证 `payment_status === 'paid'` → 创建 `report_entitlements` 行 → 更新 `payments status='completed'` |
| `checkout.session.expired` | 更新 `payments status='expired'` |
| `charge.refunded` | 更新 `payments status='refunded'` → 更新 `report_entitlements status='refunded'` |

### 不需要在此阶段处理的事件

| 事件 | 原因 |
|------|------|
| `checkout.session.async_payment_succeeded` | 不处理 delayed payment methods |
| `checkout.session.async_payment_failed` | 同上 |
| `charge.dispute.*` | 争议处理在 Phase 1+ |
| `customer.subscription.*` | Phase 0B2 |

---

## 5. 权限检查（valuation-full 改造方案）

### `POST /api/valuation-full` 上线后工作方式

```
1. 接收 body { email, report_id }
2. 查询 report_entitlements
   WHERE report_id = ? AND email = ? AND status = 'active'
3. 如果存在 → 返回完整估值数据（从 valuation engine 或缓存）
4. 如果不存在 → 返回 { ok: false, status: "locked" }
5. 不读取 Opportunity cookie
6. 不需要 signed-token.js 层面的 "report" gate_level
```

### 为什么不需要新 gate_level

当前 `signed-token.js` 的 HMAC token 用于 Opportunity 免登录验证（24h 时效）。Report 权限通过数据库 entitlement 检查，不走 token。

**Future-proof：** 如果未来需要 "已购用户自动登录查看报告" 功能，可在 `valuation-full` 中读 Opportunity cookie：
- 有 cookie 且有效 → 提取 email → 查 entitlements
- 无 cookie → 要求传 email + report_id（普通用户输入 email 即可查看自己买的报告）

### 权限隔离

| 访问路径 | 检查什么 | 能否解锁报告 | 能否解锁 Opportunity |
|----------|----------|-------------|---------------------|
| `aushomevalue_opportunity_gate` cookie | HMAC token `gate_level=opportunity` | ❌ | ✅ Top 10 |
| `POST /api/valuation-full` body | `report_entitlements` DB | ✅ | ❌ |
| `POST /api/unlock-opportunity` cookie | HMAC token `gate_level=opportunity` | ❌ | ✅ |

---

## 6. Success URL 不直接解锁

### 设计

成功页面 URL: `/?checkout=success&session_id=cs_test_xxx`

**前端行为：**
1. 页面加载时检测 URL 中的 `checkout=success` 和 `session_id`
2. 调用 `POST /api/check-report-entitlement` 轮询（带重试 + 超时）
3. 不从 URL 参数直接展示报告

**`POST /api/check-report-entitlement`：**

```json
// 输入
{ "session_id": "cs_test_xxx", "email": "user@example.com" }

// 输出
{ "ok": true, "status": "active" | "pending" | "expired", "report_id": "rp_xxx" }
```

**轮询逻辑（前端）：**
- 每 2 秒轮询，最多 30 秒
- 返回 `active` → 移除 query param，显示报告
- 返回 `pending` → 继续等待 webhook
- 超时 → 显示"处理中，请稍后刷新"

**安全：** `session_id` 单独不足以解锁报告。必须等 webhook 写入 entitlement 后，`check-report-entitlement` 才会返回 `active`。

---

## 7. 退款撤销

### 流程

```
Webhook: charge.refunded
→ 更新 payments SET status='refunded'
→ 更新 report_entitlements SET status='refunded', revoked_at=NOW()
→ 在 lead_events 记录 event_type='payment_event', event_data={action:'refund', report_id, email}
```

### 撤销后用户看到什么

- `POST /api/valuation-full` → 返回 `{ ok: false, status: "refunded" }`
- `POST /api/check-report-entitlement` → 返回 `{ ok: true, status: "refunded" }`
- 前端显示："This report has been refunded and is no longer accessible."

### 争议处理（Phase 1+）

`charge.dispute.created` / `charge.dispute.funds_withdrawn`：类似 refund 逻辑，更新 status='disputed'。

---

## 8. 重复点击防护

### 场景 1: 同一用户同一地址重复点击 "Unlock Full Report"

**方案：** 在 `create-checkout-session` 入口检查：

```sql
SELECT status FROM payments
WHERE email = ? AND property_key = ? AND status = 'pending';
-- 如果有 pending → 返回已有 checkout URL，不创建新的
```

```sql
SELECT status FROM report_entitlements
WHERE email = ? AND property_key = ? AND status = 'active';
-- 如果有 active → 返回 { ok: true, already_purchased: true, report_id }
```

### 场景 2: 同一 Checkout Session 重复回调

由 `stripe_webhook_events.stripe_event_id UNIQUE` 约束保证幂等。
Stripe 保证同一 event_id 只会发送一次，Vercel 偶发重试时重复插入会因 UNIQUE 冲突而失败。

### 场景 3: 用户打开多个标签页各自创建 Checkout

- 每个标签页创建独立的 `checkout_session_id`，对应独立的 `payments` 行
- 如果其中一个付款成功 → entitlement 授予 → 其他 checkouts 仍为 pending
- webhook 可能需要额外逻辑：如果某个 pending checkout 对应的 email+property_key 已有 active entitlement，可将该 checkout 标记为 `duplicate`

---

## 9. 环境变量清单

### Vercel Environment（Production）

| 变量 | 来源 | 用途 |
|------|------|------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard | 服务端 Stripe API 调用 |
| `STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard | 前端（如果未来用 Elements） |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard | webhook 签名验证 |
| `STRIPE_PRICE_ID_REPORT_399` | Stripe Dashboard | Report one-time payment price |
| `DATABASE_URL` | 已有 | Neon DB 连接 |
| `TOKEN_SIGNING_SECRET` | 已有 | HMAC token 签名 |

### Local Development

| 变量 | 值 |
|------|-----|
| `STRIPE_SECRET_KEY` | `sk-test-placeholder...` |
| `STRIPE_PUBLISHABLE_KEY` | `pk-test-placeholder...` |
| `STRIPE_WEBHOOK_SECRET` | `webhook-secret-placeholder...` |
| `STRIPE_PRICE_ID_REPORT_399` | `price_test_...` |
| `NODE_ENV` | `development` |

---

## 10. 最小测试清单

### 单元测试

| # | 测试 | 预期 |
|---|------|------|
| 1 | `create-checkout-session` 缺少 email | 400 |
| 2 | `create-checkout-session` 无效 property_key | 400 |
| 3 | `create-checkout-session` 白名单外 property_type | 400 |
| 4 | 同一 email + property_key + pending → 返回已有 URL | 不去 Stripe |
| 5 | 同一 email + property_key + active → 返回 already_purchased | 不去 Stripe |
| 6 | webhook 签名错误 → 400 | 不处理 |
| 7 | webhook 幂等 → 重复 event_id → 200 skip | 不重复写入 |
| 8 | `check-report-entitlement` 无 session_id → 400 | |
| 9 | `check-report-entitlement` valid session + no entitlement → pending | |
| 10 | `check-report-entitlement` after webhook → active | |
| 11 | `valuation-full` 无 entitlement → locked | |
| 12 | `valuation-full` active entitlement → 返回报告 | |

### 集成/手动测试

| # | 场景 | 验证点 |
|---|------|--------|
| 1 | 完整购买流程：免费估值→点击 Unlock→Stripe Checkout→付款→跳回→显示报告 | 全部 200，无 500 |
| 2 | 取消付款：点击 Unlock→Stripe→cancel→跳回 | 无 entitlement |
| 3 | 重复购买：同一地址付两次 | 第二次提示 already purchased |
| 4 | 退款：Stripe 发起退款→用户刷新 | 报告锁定 + 提示 refunded |
| 5 | Opportunity cookie 访问 valuation-full | 拒绝 |
| 6 | 手动构造 success URL | 不显示报告 |
| 7 | 成功 URL 带过期 session_id | pending→no entitlement |

### 回滚方案

1. **Vercel 回滚**: `vercel rollback <deployment_id>` 恢复到上一版本
2. **DB 回滚**: 删除 `payments`, `report_entitlements`, `stripe_webhook_events` 表（不影响现有 lead 表）
3. **Stripe 回滚**: 删除 product → 用户无法完成 checkout（服务端 API 返回 400 而非 500，不会半开状态）
4. **前端回滚**: `public/app.js` 中所有 "Unlock Full Report" CTA 改回 `alert("Coming Soon")`

---

## 11. 首期上线范围（明确不做什么）

| 功能 | 此阶段 | 后续阶段 |
|------|--------|----------|
| AUD $3.99 单次报告 | ✅ | — |
| PDF 生成/下载 | ✅ 同报告权限 | — |
| $9.99/month 订阅 | ❌ | Phase 0B2 |
| 7 天免费试用 | ❌ | Phase 0B2 |
| Customer Portal | ❌ | Phase 1A |
| 争议处理 | ❌ | Phase 1A |
| GST 显示 `$3.99 (incl. GST)` | ❌ 产品决策待定 | Phase 0C |
| Email notification（付款成功/失败） | ❌ | Phase 1A |
| 缓存估值报告数据 | ❌ valuation-full 每次都跑引擎 | Phase 1A（性能优化） |

---

## 12. 产品决策项（待确认）

| # | 决策 | 选项 |
|---|------|------|
| 1 | **报告访问期限** | 永久访问 / X 天 / X 个月 |
| 2 | **GST 处理** | $3.99 含 GST / $3.99 +GST / 等税务确认 |
| 3 | **退款政策** | 标准数字产品无退款 / 澳洲消费者法 30 天内退款 / 逐案处理 |
| 4 | **同一地址再次购买** | 允许（生成新 report_id）/ 不允许（提示已购） |
| 5 | **免责声明位置** | Checkout 前展示 / 报告中 / 两处 |
| 6 | **email 通知** | 付款成功邮件 / PDF 下载通知 / 无通知 |

---

## 13. 完整用户流程

```
[用户]
  1. 输入地址 → 免费估值概要 (api/valuation.js)
  2. 看到 lockedPreview + "Unlock Full Report — AUD $3.99"
  3. 点击 CTA

[前端 → 服务端]
  4. 收集 email (+ 可选 service consent)
  5. 调用 POST /api/create-checkout-session
     Body: { email, property_key, address_line, ..., email_consent }

[服务端]
  6. 校验参数 → 生成 report_id → 检查是否已购/待处理
  7. 查询/创建 Stripe Customer (stripe.customers.create)
  8. 创建 Checkout Session (stripe.checkout.sessions.create)
     → metadata: { report_id, property_key, email }
  9. 插入 payments (status=pending)
  10. 返回 { url, report_id }

[前端]
  11. window.location.href = url → Stripe Checkout 页面
  12. 用户在 Stripe 上输入卡号 → 付款

[Stripe → Webhook]
  13. POST /api/stripe-webhook → checkout.session.completed
  14. 验证签名 + 幂等检查
  15. 确认 payment_status === 'paid'
  16. 更新 payments SET status='completed', payment_intent_id=...
  17. 插入 report_entitlements (status='active')
  18. 插入 lead_events (event_type='payment_event')
  19. 返回 200

[用户跳回网站]
  20. URL: /?checkout=success&session_id=cs_test_xxx
  21. 前端检测 query param → POST /api/check-report-entitlement
      { session_id, email }
  22. 后端查 payments + entitlements → 返回 { status: "active" }
  23. 前端移除 query param，显示完整报告
  24. 报告内容通过 POST /api/valuation-full 带 report_id 获取
```

---

## 14. 安全要点总结

| # | 措施 | 防护对象 |
|---|------|----------|
| 1 | Price ID 白名单（环境变量），不接受客户端金额 | 价格篡改 |
| 2 | Webhook 签名验证（`stripe.webhooks.constructEvent`） | 伪造付款通知 |
| 3 | 幂等表 (`stripe_webhook_events.stripe_event_id UNIQUE`) | 重复处理/多扣款 |
| 4 | Success URL 轮询 + 不信任 URL 参数 | 未付款直接访问 |
| 5 | `report_entitlements` 检查 email + property_key | 跨用户报告泄露 |
| 6 | entitlement 不依赖 Opportunity cookie | 权限隔离 |
| 7 | 退款后 status='refunded' | 撤销经济补偿后的访问 |
| 8 | `payments` 表独立，Stripe 字段不进 lead 表 | 数据隔离 |
| 9 | 不记录卡号、完整支付详情到应用日志 | PCI 合规 |

---

## 15. 实施入口汇总

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | `npm install stripe` | 新增依赖 |
| `db/migration-010-payments.sql` | 新建 | 3 张新表 DDL |
| `api/_db.js` | 修改 | 增加 `initPayments()` 表初始化 |
| `api/create-checkout-session.js` | 新建 | Checkout Session 创建 API |
| `api/stripe-webhook.js` | 新建 | Webhook 接收端点 |
| `api/check-report-entitlement.js` | 新建 | 前端轮询检查 |
| `api/valuation-full.js` | 重写 | 从 hardcoded coming_soon → 查 entitlement → 返回报告 |
| `public/app.js` | 修改 | btn 从 `alert("Coming Soon")` → API 调用 |
| `public/index.html` | 无改动/极少 | 页面本身结构不变，按钮行为由 JS 管理 |
| `.env` | 新增 | Stripe 环境变量（local dev） |
| `vercel.json` | 无改动 | 无需额外 rewrite |
| Stripe Dashboard | 创建 1 Product + 1 Price | AUD $3.99 one-time |
| Stripe Dashboard | 配置 Webhook 端点 | 指向 `https://aushomevalue.vercel.app/api/stripe-webhook` |

---

*由玄甲生成 — 仅供 Codex 复核，勿用于代码实施*
