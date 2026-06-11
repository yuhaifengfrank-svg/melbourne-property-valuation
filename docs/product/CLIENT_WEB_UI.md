# 客户端网页端设计

## 1. 设计原则

第一版 Web App 要让用户快速完成一件事:

```text
输入地址 → 确认房产类型 → 看到估值 → 理解原因 → 补充资料提高准确度
```

原则:

- 先展示简洁估值, 不一开始暴露复杂模型
- 证据可展开, 但默认保持清楚
- 每个估值都显示 confidence 和 missing checks
- 自动查到的内容和需要用户补充的内容必须分开
- Web 作为主系统, 支持地图、可比成交表格、文件上传和报告

## 2. 页面结构

```text
1. Landing / Address Search
2. Property Type Confirmation
3. Valuation Summary
4. Comparable Sales
5. Micro-location
6. Suburb Fundamentals
7. Loan / LVR Scenario
8. Planning / Title / Potential
9. Missing Checks / Upload
10. Revised Valuation
11. Saved Reports / Dashboard
12. Investor Hub, future module
```

## 3. 页面 1: 地址输入

目标: 让用户快速开始。

内容:

```text
输入框: Enter property address
按钮: Start valuation
Property type selector: Auto-detect, House, Vacant Land, Townhouse, Villa, Apartment, Other
```

用户未登录也可以先试算一次基础估值。

登录触发点:

- 保存报告
- 上传文件
- 下载 PDF
- 查看历史估值

## 4. 页面 2: 房产类型确认

系统自动识别 property type, 用户确认。

示例:

```text
Detected property type: House
Confidence: Medium

Please confirm:
[House] [Vacant Land] [Townhouse] [Villa] [Apartment] [Other]
```

若出现地址冲突:

```text
We found related addresses: 1/9 and 2/9.
Land/title structure needs confirmation.
```

## 5. 页面 3: 估值摘要

这是核心首屏。

示例:

```text
46 Bishop Street, Oakleigh VIC 3166

Estimated Value
$1.90m - $2.09m

Midpoint
$1.995m

Confidence
Medium

Main reasons
- Recent comparable sales support this range
- 687 sqm land, subject to title confirmation
- Strong Oakleigh location near station and Eaton Mall
- Large family-home utility
- Title, easements and current condition are not fully verified
```

模块:

- Estimated value range
- Midpoint
- Confidence badge
- Property type
- Main reasons
- Missing checks summary

## 6. 页面 4: 可比成交

内容:

```text
Key Comparables
Address | Sale date | Sale price | Land | Bed/Bath/Car | Similarity | Adjustment
```

每条 comparable 可展开:

- 为什么选它
- 与目标房相似点
- 与目标房不同点
- 调整原因
- 数据来源

规则:

- 最近 3 个月成交优先
- 6 个月内高质量样本充足时, comparable influence 60%-70%
- 不同 property type 不混比, 除非标记为 weak reference

## 7. 页面 5: Micro-location

内容:

```text
Street rank: Top 25% within suburb, estimated
Street type: Quiet residential street
Amenity access: Strong
Traffic/noise: Low to moderate
Road width: Normal
Parking pressure: To be checked
Access to connecting roads: Good
Negative externalities: None obvious
```

地图显示:

- 目标房位置
- station / tram / bus
- schools
- parks
- shops / village
- main roads

## 8. 页面 6: Suburb Fundamentals

内容:

```text
Suburb fundamentals
- Household income: above / similar / below comparison suburbs
- Buyer profile
- Employment drivers
- Price position vs nearby suburbs
- Rental demand
- Medium-term risk notes
```

对比 suburbs:

```text
Oakleigh:
Hughesdale, Huntingdale, Oakleigh East, Oakleigh South, Clayton, Murrumbeena
```

原则:

Suburb fundamentals 用来解释市场背景, 不能盖过 recent comparable sales。

## 9. 页面 7: Planning / Title / Potential

## 9. 页面 7: Loan / LVR Scenario

内容:

```text
Loan scenario
Selected LVR: 80%
Indicative max loan: $1.128m
Required equity before costs: $282k
```

控件:

```text
[60%] [70%] [80%]
Use: Low / Midpoint / High valuation
Optional purchase price input
```

提示:

```text
Indicative only. Not a loan approval or credit assessment.
```

用途:

- 买家快速理解估值和贷款比例关系
- 投资人查看 equity / leverage 情景
- 后续可接 mortgage broker / finance lead capture

## 10. 页面 8: Planning / Title / Potential

内容:

```text
Planning and title
- Zoning
- Overlays
- Easements
- Covenants
- Land size source
- Land size confidence
```

House potential:

```text
Granny flat / secondary dwelling potential
Physical potential: Medium
Planning feasibility: possible_subject_to_constraints
Approval certainty: Not approved
```

必须区分:

- 能不能放得下
- planning 是否可能支持
- 是否已经批准

## 11. 页面 9: Missing Checks / 上传资料

内容分两列。

```text
Automatically checked
✓ Portal cross-check
✓ Related address detection
✓ Recent comparable sales
✓ VicPlan / public planning check
✓ Street View / aerial review
✓ Suburb fundamentals

Manual checks required
□ Title search
□ Title plan / plan of subdivision
□ Section 32
□ Easements / covenants
□ Building inspection
□ Current photos
```

上传按钮:

```text
[Upload Section 32]
[Upload Title Plan]
[Upload Photos]
[Enter Manual Data]
```

## 12. 页面 10: 修正估值

用户上传资料后, 系统重新计算。

示例:

```text
Revised Estimate
$1.94m - $2.06m

Confidence upgraded
Medium → Medium-High

What changed
- Title confirmed land size
- No major easement found
- Current condition confirmed good
```

## 13. 页面 11: Dashboard

登录后可查看:

- Saved valuations
- Uploaded documents
- Revised reports
- Watched properties
- Downloadable PDFs

## 14. 登录方式

第一版建议:

```text
Email magic link
```

未登录:

- 可以试算基础估值

登录后:

- 保存估值
- 上传文件
- 下载报告
- 管理多个房产

## 15. Lead Capture / 客户线索收集

第一版采用渐进式收集信息, 不在用户进入时一次性要求太多资料。

### 14.1 未登录用户

未登录用户可以:

- 输入地址
- 查看基础估值区间
- 查看 confidence
- 查看 3-5 条主要原因
- 查看简化版 micro-location

未登录用户不能:

- 查看完整 comparable adjustment
- 查看完整 planning / title / potential 分析
- 上传文件
- 下载 PDF
- 保存历史记录

### 14.2 注册 / 登录

用户点击查看完整报告时, 要求输入:

- Email: required
- Name: required
- Phone: optional
- Purpose: optional, buy / sell / invest / refinance / research
- Contact consent: optional but recommended

示例文案:

```text
Create a free account to unlock the full property report.

Email *
Name *
Phone
Purpose
[ ] I agree that you may contact me about this property report.
```

### 14.3 下载 PDF

下载 PDF 前需要补充更完整的 lead 信息:

- Email: required
- Name: required
- Phone: required
- Contact consent: required

示例文案:

```text
To download the PDF report, please provide your phone number.

Phone *
[ ] I agree that you may contact me by phone, SMS or email about this property report.
```

规则:

- Phone 在普通注册时 optional
- Phone 在 PDF download 时 required
- Contact consent 在普通注册时 optional
- Contact consent 在 PDF download 时 required
- Consent text must be explicit and stored with timestamp

### 14.4 后台 Lead 状态

Lead status:

- anonymous_search
- email_captured
- registered
- full_report_unlocked
- pdf_requested
- pdf_downloaded
- uploaded_documents
- contact_consented

后台应记录:

- searched address
- property type
- estimated value range
- confidence
- user email
- user name
- phone, if provided
- contact consent status
- consent timestamp
- report download timestamp
- uploaded document count

## 16. Investor Hub / 地产金融私募入口

Investor Hub 是估值系统之后的扩展模块。它不应在公开估值页直接销售金融产品, 而是用于 general education、投资人画像收集和 gated opportunity access。

### 15.1 用户入口

可以在估值结果页下方出现:

```text
Explore property-backed investment themes
- Private credit
- Development finance
- Income property
- Landbank / redevelopment strategy
```

未注册用户点击时:

```text
Create an account to access investor education and opportunity summaries.
```

注册用户点击时:

```text
Complete investor profile
```

### 15.2 Investor Profile

字段:

- Investment purpose
- Intended allocation range
- Preferred strategy
- Investment horizon
- Risk tolerance
- Wholesale / sophisticated investor status
- Accountant certificate status
- SMSF investor flag
- Australian tax residency
- Contact consent

### 15.3 Opportunity Gating

权限层:

- Public: general information only
- Registered: education and market themes
- Profile completed: opportunity summary request
- Eligibility reviewed: gated opportunity access
- Qualified / authorised: IM / DD room access

重要文案:

```text
This information is general in nature and does not take into account your personal objectives, financial situation or needs.
Specific opportunities are only available after eligibility and compliance review.
```

## 17. 推荐首版导航

```text
Valuation
Comparables
Location
Suburb
Planning
Loan
Uploads
Report
Investor Hub
```

## 18. 第一版不做

- 复杂移动 App
- 完整 CRM
- 银行估值报告
- 自动法律建议
- 付费 title search 自动购买
- 公开展示具体私募产品条款
- 未做 eligibility review 就开放 IM / DD materials
