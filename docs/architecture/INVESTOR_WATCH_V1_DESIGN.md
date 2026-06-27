# Investor Watch V1 技术设计蓝图

**状态：** Phase 1 设计稿  
**日期：** 2026-06-27  
**关联产品文档：** `docs/product/INVESTOR_WATCH_PRD.md`  
**实施环境：** Vercel Preview + 独立 Neon Preview branch

## 1. 本阶段目标

Phase 1 只建设 Investor Watch 的会员和 Watchlist 地基，使测试用户可以安全登录、收藏 suburb/房产，并在 Dashboard 查看收藏对象和报告额度。

本阶段不做：

- Production 数据库变更；
- Stripe 真实订阅；
- 邮件提醒发送；
- 定时监控任务；
- 自动扣减正式报告额度；
- 面向公众收费上线。

## 2. 关键设计决定

### 2.1 身份方式

采用 **Email Magic Link**，不建立密码系统。

原因：

- 现有用户关系已经围绕 `lead_contacts.email_lower` 建立；
- Resend 邮件能力已存在；
- 不需要保存密码或实现密码重置；
- 比继续使用 24 小时 Opportunity Cookie 更适合长期会员；
- 后续 Stripe Customer 可以稳定绑定到同一 `lead_contact_id`。

现有 `aushomevalue_opportunity_gate` Cookie 只保留给 Top Opportunity，不作为 Investor Watch 登录凭证。

### 2.2 Session 方式

- 登录后设置独立的 `aushomevalue_member_session` Cookie；
- Cookie 必须是 `HttpOnly; Secure; SameSite=Lax; Path=/`；
- Cookie 只保存随机 Session token，不保存 email、会员状态或报告额度；
- 数据库只保存 token 的 SHA-256 hash；
- 建议 Session 有效期 30 天；
- 登出、密码式安全事件或账户禁用时可以服务端撤销；
- 每次受保护请求都从数据库解析 `lead_contact_id`。

### 2.3 权限原则

- Email 不是认证凭证；
- 客户端传入的 `lead_contact_id`、会员状态和报告余额一律不可信；
- 所有 Watchlist 数据必须按当前 Session 的 `lead_contact_id` 查询；
- Preview 中使用测试会员状态，不创建真实 Stripe 订阅；
- 会员和报告权限最终以数据库状态为准。

## 3. 系统蓝图

```text
Browser
  |
  |-- POST /api/member/request-link
  |       -> member_login_tokens
  |       -> Resend Magic Link
  |
  |-- GET /api/member/verify?token=...
  |       -> consume one-time login token
  |       -> member_sessions
  |       -> HttpOnly member session cookie
  |
  |-- GET /api/investor-watch/status
  |-- GET/POST /api/investor-watch/items
  |-- PATCH/DELETE /api/investor-watch/item
  |
  v
Vercel API
  |
  |-- member-session-service
  |-- investor-watch-service
  |-- report-entitlement resolver (Phase 2+)
  |
  v
Neon Preview
  |-- lead_contacts
  |-- member_login_tokens
  |-- member_sessions
  |-- investor_watch_memberships
  |-- investor_watch_items
  |-- membership_report_usage
```

## 4. 现有组件复用

| 现有组件 | Phase 1 用法 |
|---|---|
| `lead_contacts` | 会员主体，不另建重复 email 用户表 |
| `lead_preferences` | 可读取已有预算、目标和 property type 偏好 |
| `consent_records` | 记录服务条款和独立营销授权 |
| `lib/notify-registration.js` | 抽取通用 Resend 发送能力，不直接复用通知正文 |
| `lib/signed-token.js` | 参考 Cookie 安全属性；不复用 24 小时 Opportunity token 作为会员 Session |
| `report_entitlements` | Phase 2 接入会员报告权限时复用 |
| `report_snapshots` | 已生成的完整报告继续使用现有快照体系 |
| `/api/opportunity` | Dashboard 的 suburb 最新机会信号来源 |
| `/api/suburb-intelligence` | Dashboard 的 suburb 结构化信息来源 |
| planning cache/summary | 后续 planning signal 监控来源 |

## 5. 数据库设计

所有迁移必须先在独立 Preview branch dry-run 和 apply。Migration 应可重复检查，并提供回滚 SQL。

### 5.1 `member_login_tokens`

用途：一次性 Magic Link 验证。

```sql
CREATE TABLE member_login_tokens (
  id BIGSERIAL PRIMARY KEY,
  lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  requested_ip_hash TEXT,
  requested_user_agent_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

约束：

- 原始 token 不写数据库和日志；
- token 有效期建议 15 分钟；
- token 只能使用一次；
- 新请求可使该账户之前未使用的 token 失效；
- 对 email、IP 和 Session 做速率限制。

### 5.2 `member_sessions`

```sql
CREATE TABLE member_sessions (
  id BIGSERIAL PRIMARY KEY,
  lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

索引：

- `member_sessions(session_token_hash)` unique；
- `member_sessions(lead_contact_id, expires_at)`；
- 定期清理过期和撤销 Session。

### 5.3 `investor_watch_memberships`

```sql
CREATE TABLE investor_watch_memberships (
  id BIGSERIAL PRIMARY KEY,
  lead_contact_id BIGINT NOT NULL UNIQUE REFERENCES lead_contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('preview', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  report_limit INTEGER NOT NULL DEFAULT 10 CHECK (report_limit >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Phase 1 仅允许人工建立 `preview` 测试会员。Production 不允许使用 `preview` 状态解锁付费权益。

### 5.4 `investor_watch_items`

```sql
CREATE TABLE investor_watch_items (
  id BIGSERIAL PRIMARY KEY,
  lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('suburb', 'property')),
  canonical_item_key TEXT NOT NULL,
  suburb TEXT NOT NULL,
  state TEXT NOT NULL,
  postcode TEXT,
  property_key TEXT,
  display_address TEXT,
  investment_goal TEXT,
  private_note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (item_type = 'suburb' AND property_key IS NULL)
    OR
    (item_type = 'property' AND property_key IS NOT NULL)
  )
);
```

使用规范化 identity key 防止重复收藏：

- suburb: `suburb|state|postcode`；
- property: 现有 canonical `property_key`；
- 删除行为优先归档，重新收藏时恢复原记录；
- 私人备注最大 1,000 字符；
- Phase 1 服务端限制 20 个 active suburbs 和 30 个 active properties。

`canonical_item_key` 由服务端生成，并建立 partial unique index：

```sql
CREATE UNIQUE INDEX investor_watch_items_active_unique
ON investor_watch_items (lead_contact_id, canonical_item_key)
WHERE status = 'active';
```

不能依赖客户端生成或提交 `canonical_item_key`。

### 5.5 `membership_report_usage`

```sql
CREATE TABLE membership_report_usage (
  id BIGSERIAL PRIMARY KEY,
  membership_id BIGINT NOT NULL REFERENCES investor_watch_memberships(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL REFERENCES report_snapshots(report_id),
  property_key TEXT NOT NULL,
  billing_period_start TIMESTAMPTZ NOT NULL,
  usage_type TEXT NOT NULL CHECK (usage_type IN ('included_report', 'trial_report', 'adjustment')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (membership_id, report_id, billing_period_start)
);
```

Phase 1 只显示测试额度，不接入真实报告扣减。Phase 2 才允许报告服务写入此表。

## 6. Magic Link 流程

### 6.1 请求链接

`POST /api/member/request-link`

请求：

```json
{
  "email": "user@example.com",
  "returnTo": "/investor-watch/"
}
```

统一响应：

```json
{
  "ok": true,
  "message": "If this email can be used, a sign-in link has been sent."
}
```

无论 email 是否存在都返回相同响应，避免账户枚举。

服务端步骤：

1. 规范化 email；
2. 执行速率限制；
3. 创建或复用 `lead_contacts`；
4. 生成至少 32 bytes 随机 token；
5. 仅保存 token hash；
6. 用 Resend 发送同域名 Magic Link；
7. 不在日志中输出完整 email 或 token。

### 6.2 验证链接

`GET /api/member/verify?token=...&returnTo=...`

服务端步骤：

1. hash token 并原子消费未过期记录；
2. 创建随机会员 Session；
3. 设置 HttpOnly Cookie；
4. 只允许站内 `returnTo` 路径；
5. 303 redirect 到 `/investor-watch/`；
6. token 使用后立即失效。

### 6.3 当前会员

`GET /api/member/me`

认证成功返回最少信息：

```json
{
  "ok": true,
  "member": {
    "membershipStatus": "preview",
    "reportsUsed": 0,
    "reportLimit": 10,
    "periodEnd": null
  }
}
```

不要返回 Stripe IDs、Session token 或完整内部账户记录。

### 6.4 登出

`POST /api/member/logout`

- 撤销数据库 Session；
- 清除 Cookie；
- 使用 POST，避免链接预取意外登出。

## 7. Watchlist API

### 7.1 状态摘要

`GET /api/investor-watch/status`

返回：

- membership status；
- active suburb/property 数量；
- report usage；
- unread material event 数量（Phase 2 前固定为 0）。

### 7.2 查询收藏

`GET /api/investor-watch/items?type=suburb|property&status=active`

- 只能查询当前 Session 用户；
- 默认按 `updated_at DESC`；
- 最多返回当前产品上限；
- 只返回 Dashboard 所需字段。

### 7.3 新增收藏

`POST /api/investor-watch/items`

Suburb 请求示例：

```json
{
  "itemType": "suburb",
  "suburb": "Doncaster",
  "state": "VIC",
  "postcode": "3108",
  "investmentGoal": "balanced"
}
```

Property 请求必须使用服务端可验证的 canonical property identity，不接受任意客户端 `property_key` 直接写入。

重复新增应返回现有 item，不创建第二行。

### 7.4 修改收藏

`PATCH /api/investor-watch/item`

允许修改：

- `itemId`；
- `investmentGoal`；
- `privateNote`；
- `status`。

不允许修改 item owner、canonical identity 或会员状态。

### 7.5 删除收藏

`DELETE /api/investor-watch/item`

请求只提交 `itemId`。服务端按 Session owner 归档该行。

## 8. Dashboard 信息架构

路径：`/investor-watch/`

### 8.1 未登录状态

- Investor Watch 简短价值说明；
- Email Magic Link 输入框；
- 不显示虚假的 Watchlist 数据；
- 明确当前 Preview 状态，不触发支付。

### 8.2 已登录状态

顶部工具栏：

- Investor Watch 标题；
- 报告额度 `0 / 10 used`；
- membership 状态；
- Account/Logout 菜单。

主视图：

- `Overview`：收藏数量和最近更新；
- `Suburbs`：收藏 suburb 列表；
- `Properties`：收藏 property 列表；
- `Reports`：现有报告与额度；
- `Alerts`：Phase 1 显示尚未启用说明。

每个 Watch item 最少显示：

- 名称或地址；
- 当前 Opportunity Score；
- confidence/data-quality 状态；
- 最新数据期；
- planning signal 摘要；
- private note；
- 查看详情和移除操作。

### 8.3 收藏入口

Phase 1 接入：

- Top Opportunity result card：`Save to Investor Watch`；
- suburb page：`Watch this suburb`；
- valuation result：`Watch this property`。

未登录点击时先完成 Magic Link 登录，成功后恢复待收藏动作。待收藏内容必须存在短期服务端状态中，不能把任意写入 payload 放进 URL。

## 9. 服务模块边界

建议新增：

```text
lib/member-session-service.js
lib/member-magic-link-service.js
lib/investor-watch-service.js
lib/membership-report-usage-service.js   # Phase 2 写入，Phase 1 只读
lib/resend-client.js                     # 从现有通知模块抽取通用发送器
```

API handler 只负责：

- method、headers、body 和 response；
- 调用身份解析；
- 调用 service；
- 映射安全的公开错误。

SQL、权限判断和额度事务必须位于 service 层，避免多个 API 各自实现不同规则。

## 10. 安全控制

必须具备：

- Magic Link 一次性、短 TTL、数据库原子消费；
- Session token 高熵随机值，数据库只存 hash；
- 所有登录和写入端点速率限制；
- 不在错误响应中返回数据库、Resend 或 token 原始错误；
- `returnTo` 只允许站内路径，防止 open redirect；
- Watch item owner 从 Session 推导；
- 所有文本输入长度限制和结构验证；
- private notes 不允许作为 HTML 渲染；
- Cookie 设置和撤销测试；
- Preview 和 Production 数据库、Cookie 与邮件模板隔离；
- Preview 邮件必须明显标注测试环境。

## 11. Phase 1 测试蓝图

### 11.1 Unit tests

- token 生成、hash、过期和一次性消费；
- Session 创建、验证、撤销和过期；
- email/returnTo/input validation；
- canonical item key；
- item limit 和重复收藏；
- owner isolation；
- private note escaping；
- 公开错误不泄露内部信息。

### 11.2 API integration tests

- 请求 Magic Link 始终返回统一公开响应；
- 无 Session 的 Watch API 返回 401；
- 用户 A 不能读取或修改用户 B 的 item；
- 重复收藏幂等；
- 达到 Watchlist 上限返回稳定错误；
- Logout 后 Session 立即失效。

### 11.3 Preview E2E

1. 测试邮箱请求 Magic Link；
2. 在测试模式捕获或人工打开链接；
3. 登录 Dashboard；
4. 从 Top Opportunity 收藏一个 suburb；
5. 从估价结果收藏一个 property；
6. Dashboard 显示两项；
7. 修改备注；
8. 移除并恢复收藏；
9. 登出后受保护数据不可访问；
10. Production 数据库行数不变化。

## 12. 实施顺序

### Step 1 - 设计冻结

- 确认 Magic Link；
- 确认 30 天 Session；
- 确认 20 suburb / 30 property 上限；
- 确认 Phase 1 不收费。

### Step 2 - Migration dry-run

- 编写 Migration 和 rollback；
- 只检查 Preview branch；
- 输出建表前后 schema diff；
- 不触碰 Production。

### Step 3 - 身份服务

- 通用 Resend client；
- request-link/verify/me/logout；
- Session middleware/service；
- 安全与集成测试。

### Step 4 - Watchlist service/API

- canonical identity；
- CRUD；
- limit、owner 和幂等控制；
- API 测试。

### Step 5 - Dashboard

- 未登录和已登录状态；
- suburb/property tabs；
- 报告额度只读；
- Top Opportunity、suburb、valuation 收藏入口。

### Step 6 - Preview 验收

- E2E 测试；
- 响应式页面检查；
- 数据隔离检查；
- 安全审计；
- 形成 Phase 1 handover。

## 13. Phase 1 验收标准

只有满足以下条件才算完成：

- Magic Link 不泄露账户存在状态；
- 登录 Session 可服务端撤销；
- 用户之间数据严格隔离；
- Watchlist CRUD 和重复收藏幂等；
- Dashboard 能显示真实 Preview 数据；
- Top Opportunity 和估价结果可进入收藏流程；
- Production 数据库和正式用户不受影响；
- 所有新增测试通过；
- 没有 Stripe 实际扣款；
- 文档记录 Migration、rollback、测试结果和下一步。

## 14. Phase 1 之后

完成此地基后，再依次实施：

1. 报告会员权益和每月 10 份额度；
2. Watch snapshot 和变化检测；
3. Dashboard event history；
4. 每周 Resend 摘要；
5. Stripe 月度订阅和 Customer Portal；
6. 小范围 Production rollout。
