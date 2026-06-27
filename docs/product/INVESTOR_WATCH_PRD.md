# Investor Watch PRD

**Status:** Draft for implementation planning  
**Product name:** Investor Watch  
**Last updated:** 2026-06-27  
**Scope:** Product definition, membership entitlement, watchlist, monitoring and alerts

## 中文决策摘要

Investor Watch 是 AusHomeValue 的持续监控会员服务，不是另一个估价页面。它要帮助用户收藏 suburb 和具体房产，比较多个候选对象，并在机会评分、市场数据、规划信号或估值证据发生重要变化时提醒用户。

已确认的商业规则：

- 会员价格为 **AUD $9.99/月**；
- 正式付费会员每个账单周期包含 **10 份完整估值报告**；
- 会员额度内不再收取每份 AUD $3.99；
- 非会员仍可按 AUD $3.99 单独购买完整估值报告；
- 重复打开或下载同一份报告不重复扣额度；
- 报告生成失败不扣额度；
- 产品统一使用 **Investor Watch** 名称，不再混用 Investor Pro。

建议的首版核心体验：

1. 用户收藏 suburb 或房产；
2. 在会员 Dashboard 查看最新评分、规划信号、估值报告和变化历史；
3. 系统只在变化达到明确阈值时生成事件；
4. 默认通过每周邮件摘要通知；
5. 用户可独立管理服务提醒和营销授权；
6. 会员可以看到本月 10 份报告额度的使用情况。

尚未最终确认的项目包括：7 天试用期包含几份报告、Watchlist 数量上限、提醒渠道、GST 展示、退款政策，以及重大刷新是否消耗新的报告额度。

## 1. Product Definition

Investor Watch is the ongoing monitoring layer of AusHomeValue. It turns a one-time property search or valuation into a saved decision workspace that can be revisited as market, opportunity and planning signals change.

The product answers a different question from the existing layers:

| Layer | User question | Commercial model |
|---|---|---|
| Free Estimate | What might this property be worth? | Free |
| Top Opportunity | Which suburbs should I investigate? | Free preview and registered Top 10 |
| Full Valuation Report | What evidence supports this specific property decision? | AUD $3.99 per report for non-members |
| Investor Watch | What has changed across the suburbs and properties I care about? | AUD $9.99 per month |

Product positioning:

> Top Opportunity helps users discover where to look. Investor Watch helps them keep watching what matters.

## 2. Product Purpose

### 2.1 User purpose

Investor Watch should help active buyers and property investors:

- maintain a shortlist of suburbs and properties;
- compare several opportunities in one place;
- track changes in Future Opportunity Scores and supporting signals;
- notice material planning, market or data changes without repeatedly searching;
- decide whether to continue watching, investigate further or remove an opportunity;
- access full valuation reports as part of an active membership.

### 2.2 Business purpose

Investor Watch should:

- convert one-time visitors into returning users;
- create a clear upgrade path from free estimate and Top Opportunity;
- provide recurring subscription revenue;
- increase the usefulness of the existing valuation, opportunity and planning data;
- build an ongoing customer relationship without presenting personal financial advice.

## 3. Confirmed Commercial Rules

### 3.1 Pricing

- Investor Watch membership: **AUD $9.99 per month**.
- Non-member full valuation report: **AUD $3.99 per property**.
- Active Investor Watch members do not pay the AUD $3.99 charge for reports included in their membership allowance.

### 3.2 Included reports

- An active membership includes **10 full valuation reports per billing period**.
- The allowance resets at the start of each successful monthly billing period.
- Unused reports do not roll over.
- Reopening or downloading the same report does not consume another report.
- Re-running the same property with no material input change should restore or refresh the existing report and should not consume another report.
- A materially different property or a new report snapshot consumes one report when the report is successfully created and unlocked.
- Failed report generation must not consume the allowance.
- Cancellation leaves access active until the paid period ends, unless a refund or payment dispute requires entitlement withdrawal.

### 3.3 Entitlement order

When a user requests a full report, the server must check access in this order:

1. Active Investor Watch membership with remaining report allowance: unlock and record membership usage.
2. Existing active entitlement for that same report/property: unlock without additional usage or payment.
3. Completed AUD $3.99 one-time purchase for that report/property: unlock.
4. Otherwise: offer the one-time report purchase and the Investor Watch membership.

The frontend must never decide entitlement based only on a success URL, local storage or a client-provided price.

## 4. Target Users

Primary users:

- buyers comparing multiple properties before purchase;
- investors monitoring several suburbs;
- registered Top Opportunity users with a developing shortlist;
- valuation report customers who want ongoing monitoring.

Investor Watch is not intended to provide:

- personal financial advice;
- a formal valuation;
- development approval advice;
- automated legal, lending or taxation advice;
- access to specific private investment products without separate eligibility and compliance controls.

## 5. Core User Experience

### 5.1 Entry points

Investor Watch may be offered from:

- Top Opportunity results;
- suburb pages;
- valuation results;
- full report viewer and report success page;
- the primary navigation;
- the Investor Watch dashboard.

All product surfaces must use the name **Investor Watch**. The temporary name **Investor Pro** must not be used in new implementation work.

### 5.2 Membership dashboard

The dashboard should show:

- saved suburbs;
- saved properties;
- latest Future Opportunity Score and previous score;
- material changes since the user's last visit;
- latest valuation/report status;
- planning signal status;
- alert history;
- report allowance, for example `3 of 10 reports used`;
- next billing date and membership status;
- manage or cancel subscription action.

### 5.3 Watchlist actions

Users should be able to:

- save and remove a suburb;
- save and remove a property;
- add a short private note;
- choose an investment goal for each watched item;
- open the latest suburb or property evidence;
- compare selected items;
- choose which alert categories are enabled.

Recommended MVP limits:

- up to 20 saved suburbs;
- up to 30 saved properties;
- up to 10 full valuation reports per billing period.

These are product safeguards, not pricing promises, and may be adjusted before launch.

## 6. Monitoring and Alerts

Investor Watch should notify users only when a meaningful signal changes. It must not send an alert merely because a scheduled job ran.

### 6.1 Initial alert categories

1. **Opportunity score change**
   - Future Opportunity Score changes by at least 5 points; or
   - ranking moves by at least 10 positions.
2. **Planning signal change**
   - zone or overlay result changes;
   - planning constraint level changes;
   - a previously unavailable planning field becomes available.
3. **Market signal change**
   - material median price, rent, yield or vacancy update;
   - new source period replaces the prior period.
4. **Property evidence change**
   - new relevant comparable evidence is available;
   - valuation confidence changes materially;
   - a saved report becomes stale and should be refreshed.
5. **Weekly opportunity digest**
   - concise summary of meaningful changes across the user's watchlist.

### 6.2 Alert rules

- Default delivery: weekly email digest.
- Urgent planning changes may be sent separately after data-quality validation.
- Users must be able to disable each alert category.
- Marketing consent and service-alert consent must remain separate.
- Every email must identify why the user received it and provide an unsubscribe/preferences link.
- Alerts must display source period, confidence and limitations where applicable.

## 7. Data Model

The final schema should follow the repository's lightweight Neon approach and should not store raw GIS geometry.

### 7.1 Proposed tables

#### `investor_watch_memberships`

- `id`
- `lead_contact_id`
- `stripe_customer_id`
- `stripe_subscription_id`
- `status` (`trialing`, `active`, `past_due`, `canceled`, `unpaid`)
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end`
- `created_at`
- `updated_at`

#### `investor_watch_items`

- `id`
- `lead_contact_id`
- `item_type` (`suburb`, `property`)
- `suburb`
- `state`
- `postcode`
- `property_key` nullable for suburb items
- `display_address` nullable for suburb items
- `investment_goal`
- `private_note`
- `status` (`active`, `archived`)
- `created_at`
- `updated_at`

Unique active watch items should be enforced per user and canonical item identity.

#### `investor_watch_snapshots`

- `id`
- `watch_item_id`
- `snapshot_type` (`opportunity`, `planning`, `market`, `valuation`)
- `source_period`
- `payload_json`
- `data_quality_status`
- `created_at`

#### `investor_watch_events`

- `id`
- `watch_item_id` nullable for membership events
- `lead_contact_id`
- `event_type`
- `previous_snapshot_id`
- `current_snapshot_id`
- `materiality_score`
- `event_payload_json`
- `created_at`

#### `investor_watch_alert_preferences`

- `lead_contact_id`
- category-level boolean settings
- digest frequency
- timezone
- `service_email_consent_at`
- `updated_at`

#### `investor_watch_alert_deliveries`

- `id`
- `lead_contact_id`
- `event_id`
- `channel`
- `status`
- `provider_message_id`
- `sent_at`
- `failed_at`

#### `membership_report_usage`

- `id`
- `membership_id`
- `report_id`
- `property_key`
- `billing_period_start`
- `usage_type`
- `idempotency_key`
- `created_at`

The database must prevent the same report from consuming allowance twice.

## 8. API Plan

Initial authenticated endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/investor-watch/status` | GET | Membership, report allowance and alert summary |
| `/api/investor-watch/items` | GET | List active watch items |
| `/api/investor-watch/items` | POST | Add a suburb or property |
| `/api/investor-watch/items/:id` | PATCH | Update note, goal or alert settings |
| `/api/investor-watch/items/:id` | DELETE | Archive a watch item |
| `/api/investor-watch/compare` | POST | Compare selected watched items |
| `/api/investor-watch/events` | GET | Retrieve material change history |
| `/api/investor-watch/alert-preferences` | GET/PATCH | Manage service-alert preferences |
| `/api/investor-watch/create-subscription` | POST | Create Stripe subscription checkout |
| `/api/investor-watch/customer-portal` | POST | Open Stripe Customer Portal |
| `/api/report-entitlement` | POST | Resolve membership or one-time report access |

All writes require server-side identity resolution, validation, rate limits and audit logging. Email supplied in a request body must not be treated as authentication.

## 9. Subscription and Payment Rules

- Stripe price IDs must be selected from a server-side allowlist.
- Stripe webhook events are the authority for subscription status.
- Webhook processing must be signature-verified and idempotent.
- `checkout.session.completed` alone does not permanently activate membership without matching product, customer and subscription data.
- `invoice.paid` maintains active access.
- `invoice.payment_failed` moves the membership into the appropriate recovery state.
- `customer.subscription.deleted` removes access at the effective cancellation time.
- Refund and dispute handling must update entitlements and report usage consistently.
- Card data must never be collected or stored by AusHomeValue.

## 10. Trial Policy

Confirmed:

- The product direction includes a 7-day free trial.

Open decision before billing implementation:

- whether trial users receive the full 10-report allowance.

Recommended launch rule:

- trial users may create one included full report;
- paid active members receive 10 reports per billing period;
- reports already created during trial remain accessible if separately purchased or after membership payment succeeds.

This recommendation requires explicit product approval before implementation.

## 11. Delivery Phases

### Phase 1 - Product foundation in Preview

- finalise identity and membership model;
- create watchlist schema and APIs;
- build dashboard with saved suburbs and properties;
- integrate current opportunity and planning data;
- add report allowance ledger;
- no production billing.

### Phase 2 - Monitoring engine

- scheduled snapshots;
- deterministic change detection;
- event materiality thresholds;
- dashboard change history;
- test-only alert delivery.

### Phase 3 - Subscription and report entitlement

- Stripe product and price;
- checkout and customer portal;
- webhook subscription lifecycle;
- 10-report monthly allowance;
- one-time AUD $3.99 fallback for non-members.

### Phase 4 - Alerts and controlled launch

- email preferences and unsubscribe flow;
- weekly digest;
- production observability and support process;
- limited customer rollout;
- verify alert quality before broader launch.

## 12. Success Metrics

Product metrics:

- percentage of registered Top 10 users who save a watch item;
- percentage of report customers who start a membership;
- weekly active Investor Watch members;
- average active watch items per member;
- report allowance usage;
- alert open and return-to-site rate;
- subscription trial-to-paid conversion;
- monthly cancellation rate.

Trust and quality guardrails:

- false or duplicate alert rate;
- alerts sent with stale or unreliable data;
- report allowance double-count incidents;
- entitlement or billing mismatches;
- unsubscribe and preference failures;
- customer support complaints about unexplained score changes.

## 13. Launch Acceptance Criteria

Investor Watch is not ready for public paid launch until:

- a user can add, view and remove watch items;
- membership identity cannot be spoofed with an email address;
- report usage is idempotent and billing-period aware;
- active subscribers receive included reports without a separate AUD $3.99 charge;
- non-members can still purchase a single report;
- cancellation and failed-payment states are handled;
- change detection is tested against known before/after snapshots;
- duplicate and low-value alerts are suppressed;
- alert preferences and unsubscribe work;
- Preview end-to-end tests pass using Stripe test mode and an isolated database branch;
- Production launch has an explicit rollback plan.

## 14. Decisions Still Required

Before implementation begins, confirm:

1. Trial report allowance: recommended one report during the 7-day trial.
2. Whether the 20-suburb and 30-property watchlist limits are acceptable.
3. Whether launch alerts are email-only or email plus another channel.
4. Whether monthly billing price includes GST and how it is displayed.
5. The support, refund and cancellation policy.
6. Whether a materially refreshed report consumes another allowance unit.
