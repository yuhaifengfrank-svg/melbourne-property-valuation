# 估值模型完整性审计清单

## 1. 审计目标

本清单用于检查估值模型中的每个指标是否具备:

- 明确字段
- 估值作用
- 自动可查来源
- 权威 / 付费 / 用户上传来源
- Cross-check 规则
- Missing 时的用户补充方式
- Confidence 影响

原则:

```text
先自动查免费权威公开数据。
再使用商业网站 / portal / agent / market publication 数据。
商业或 portal 数据至少需要 3 个独立来源交叉比对; 5 个以上来源才支持更高置信度。
再列出付费、授权、合同或用户现场资料用于确认。
任何关键字段若只有 portal source, 不得当成 confirmed。
```

## 1.1 数据来源层级

```text
Layer 1: 免费权威公开数据
- ABS Census / QuickStats / DataPacks / Community Profiles / SEIFA
- RBA / APRA public statistics for interest-rate, credit and macro context
- State government records
- Land Use Victoria / LANDATA
- VicPlan / Planning Property Report
- Council planning registers and public maps
- State Revenue Office / Valuer-General publications where relevant

Layer 2: 商业网站 / 市场发布 / agent 数据
- realestate.com.au
- Domain
- property.com.au
- View
- PropertyValue
- agent sold results / auction results
- rental listing portals
- commercial market commentary or suburb reports

Layer 3: 交叉比对和确认
- 至少 3 个独立市场来源才可作为 secondary market evidence
- 5 个以上来源, 且无重大冲突, 才可支持更高 confidence
- 若 portal / commercial data 与 title、council、planning 或 government data 冲突, 权威来源优先
- 若少于 3 个来源或来源冲突, confidence cap 到 Medium 或以下, 并显示 Missing Checks
```

## 1.2 商业公开来源加权置信度

商业网站、agent 结果、market publication 数据不应只按数量计算, 应按来源覆盖率、知名度、成交/出租数据相关性给权重。第一版权重是可配置模型参数, 后续应根据实际抓取成功率、覆盖率、回测误差和市场使用情况校准。

### 1.2.1 来源组权重

| 来源组 | 初始权重 | 用途 |
| --- | ---: | --- |
| realestate.com.au | 24 | 最大核心门户之一, listing / sold / property profile 权重最高 |
| Domain | 22 | 最大核心门户之一, listing / sold / property profile 权重最高 |
| Agent sold / auction results | 14 | 成交结果、auction result、agent campaign evidence |
| property.com.au | 12 | property profile / sold / attribute cross-check |
| PropertyValue / OnTheHouse style AVM profile | 8 | AVM/profile 辅助验证 |
| View / Homely style portal evidence | 6 | portal 辅助验证 |
| Rental portal evidence | 6 | rent/yield/investor context |
| Local market / suburb report | 8 | suburb-level market commentary, only as secondary support |

总分 = 100。

### 1.2.2 计算规则

```text
market_source_confidence_score
= sum(aligned_source_weights)
- sum(conflicting_source_weights)
- conflict_penalty
```

- 8 个来源组全部抓到且一致: `100`
- 少一个来源: 扣该来源权重
- 来源存在但与多数来源显著冲突: 扣该来源权重, 并加 conflict penalty
- 少于 3 个独立市场来源: source confidence cap 到 Medium 或以下
- 5 个以上来源一致: 可支持 High source confidence
- 该分数是 source confidence, 不是最终 valuation confidence

### 1.2.3 Source confidence bands

| Score | Label | 解释 |
| ---: | --- | --- |
| 90-100 | Very High | 多数高权重来源一致 |
| 75-89 | High | 主要来源一致, 少量来源缺失 |
| 60-74 | Medium-High | 样本可用, 仍需补充或校准 |
| 45-59 | Medium | 来源不足或部分冲突 |
| <45 | Low | 不足以支撑可靠市场锚点 |

最终 valuation confidence 还必须结合 recent comparable quality、title/planning、condition、property type fit 和 missing checks。

## 2. 核心估值链路

```text
Estimated Value
= Comparable Sales Baseline
× Time / Market Adjustment
× Property-specific Adjustment
× Current Condition Adjustment
× Micro-location Adjustment
× Planning / Title / Body Corporate / Constraint Risk Adjustment
```

用户可见区间:

- High: midpoint ±3%
- Medium-High: midpoint ±5%
- Medium: midpoint ±7%
- Low-Medium: midpoint ±10%
- Low: 不给超过 ±10% 的主估值区间, 应提示资料不足或人工复核

Comparable influence:

- Strong recent evidence: 60%-70%
- Normal recent evidence: 55%-65%
- Weak recent evidence: 45%-55%

## 3. 指标审计矩阵

| 指标 | 子因素 | 自动可查来源 | 权威/上传来源 | Cross-check | Missing 处理 | Confidence 影响 |
| --- | --- | --- | --- | --- | --- | --- |
| Property type | house, vacant land, townhouse, villa, apartment, special purpose | portals, council public data, address pattern, listing category | contract, Section 32, title plan, OC certificate | portals vs title/contract vs user confirmation | 用户确认 property type | 类型冲突时 cap Low-Medium |
| Address | full address, unit number, parent/child address | geocoder, portals, VicPlan, council maps | title, contract, council rates | normalized address vs title lot/plan | 用户输入正确地址 / 上传合同 | 地址冲突时估值不可高置信 |
| Land size | sqm, frontage, depth | portals, VicPlan parcel, council maps | title search, title plan, plan of subdivision, survey, Section 32 | portal vs title/council/VicPlan | 上传 title/plan/survey | 未 title-confirmed 时 cap Medium; 冲突时 cap Low-Medium |
| Land quality | shape, slope, orientation, corner block, usable area | aerial imagery, maps, Street View | survey, title plan, site inspection | map measurement vs survey/title | 用户补 frontage/depth/照片 | 大地/开发价值依赖时影响高 |
| Building utility | bed, bath, car, building size, storeys, floorplan | portals, listing photos/floorplan | contract, building report, inspection, floorplan | portals vs photos/floorplan | 用户补 floorplan/照片 | 缺失时 condition/building confidence 降低 |
| Orientation | land orientation, main entrance, living area, backyard | maps, aerial, floorplan, Street View | floorplan, inspection, user confirmation | maps vs floorplan/user | 用户手工确认朝向 | 小幅影响, 缺失通常不大幅降 confidence |
| Current condition | renovation, structure, maintenance, defects | listing photos, recent listing text | inspection report, building report, current photos | old listing vs current photos | 上传 current photos/report | 缺失时 cap Medium 或 Medium-High 以下 |
| Rental profile | weekly rent, range, yield, demand | portals, rental listings, suburb rent data | lease, property manager estimate | multiple rental portals vs actual lease | 用户输入 lease/rent appraisal | 投资分析影响中等 |
| Comparable sales | price, date, land, bed/bath/car, type | sold portals, agent results, market data | CoreLogic/Pricefinder/contract evidence | same type, same period, similar property | 用户上传 sold evidence / agent report | 核心锚点; 样本少于 3 降 confidence |
| Market timing | sale date, market index, monthly trend | sold data, suburb profile, price index | paid data providers | local recent sales vs index | 手工输入 market movement | 中等; 不可盖过 recent comps |
| Micro-location | street rank, quiet/busy, access, amenity, negative uses | maps, Street View, aerial, sales premium, local amenities | site visit, local agent notes | map/street view vs sales premium | 用户补本地观察 | 影响 10%-15%; 需披露 evidence |
| Street geometry | street length, exits, road width, parking, passing comfort | maps, Street View, council road data if public | site visit, user photos | Street View vs user/site observation | 用户补照片/停车观察 | 影响小到中; 窄路/停车压力需扣分 |
| Planning/title | zoning, overlays, easements, covenants, title type | VicPlan, council public maps | title search, Section 32, plan of subdivision | VicPlan/council vs title/Section 32 | 上传 title/Section 32 | 关键项; 风险未查时 cap Medium |
| Granny flat / secondary dwelling | existing, rear yard, access, services, planning feasibility | aerial, Street View, VicPlan, council permits | title, Section 32, building/planning permits, site inspection | physical fit vs planning controls vs title constraints | 上传 permits/title/photos | 只能 flag potential, 不能当 approved value |
| Neighbouring built form | height, setbacks, rear structures, dual occupancy pattern | Street View, aerial, council permits | site inspection, planning files | imagery vs permit history | 用户补照片/notes | 影响 planning feasibility 和 micro-location |
| Suburb fundamentals | income, jobs, owner/renter, price, rent, growth | ABS Census, QuickStats, DataPacks, SEIFA, suburb profiles | paid market data | ABS as authority, portals/reports as secondary | 无则显示 unavailable | 解释性指标, 不盖过 comps |
| Body corporate | fee, OC status, special levies, common area | listing, portals | OC certificate, contract, Section 32 | listing fee vs OC certificate | 上传 OC certificate | townhouse/villa/apartment 关键 |

## 4. 自动核查清单

系统应自动尝试:

- Address normalization
- Related address detection: `9`, `1/9`, `2/9`, `unit 1`, parent/child titles
- Layer 1 authority checks: ABS, RBA/APRA, VicPlan, council, LANDATA/Land Use Victoria where accessible
- Portal cross-check: realestate.com.au, Domain, View, PropertyValue, property.com.au
- Minimum market-source rule: 3 independent sources required, 5+ preferred for higher confidence
- Recent sold comparable scan
- Rental estimate cross-check
- VicPlan / Planning Property Report
- Council public planning register
- Council public maps, if available
- Google Maps / aerial imagery review
- Street View review
- Nearby built form scan
- Street geometry and parking scan
- Suburb fundamentals and comparison suburbs

自动核查输出必须分为:

```text
completed
failed
conflict_found
manual_required
not_applicable
```

## 5. 手工上传 / 输入清单

系统无法可靠自动取得时, 用户可上传或输入:

- Title search / Register Search Statement
- Title plan / plan of subdivision
- Survey plan
- Section 32 / Vendor Statement
- Contract of Sale
- Council building records
- Building permits
- Planning permits
- Drainage / services information
- Owners corporation certificate
- Current inspection notes
- Current photos
- Floorplan
- Lease / rent appraisal
- Local street observations: parking, road width, access friction

## 6. Source Reliability Rules

### 6.1 Source tiers

Authoritative:

- Title search / title register
- Title plan / plan of subdivision
- Survey plan
- Section 32 / contract, where relevant
- Council records
- VicPlan / Planning Property Report for planning controls

Strong market evidence:

- Verified recent sold comparable data
- Agent Statement of Information
- Paid data providers, if available

Secondary:

- Listing description
- Listing photos and floorplans
- Rental listing data
- Suburb profile pages

Weak:

- Portal AVM summaries
- Scraped property profiles
- Old listing data

### 6.2 Conflict handling

If sources conflict:

```text
Authoritative source wins.
Portal-only value is not confirmed.
System must disclose the conflict.
Confidence must be capped until resolved.
```

Examples:

- Portal land size conflicts with child addresses: require title/plan.
- Portal labels property as house but address is `1/5`: require type confirmation.
- AVM sources differ materially: disclose and rely on comparables.

## 7. Confidence Gating Rules

Confidence cannot exceed:

- Medium-High if current condition is not verified.
- Medium if land size is not title/council/VicPlan cross-checked and land drives value.
- Low-Medium if property type conflicts across sources.
- Low-Medium if parent-child address ambiguity exists and title is missing.
- Medium if planning/title risk has only public portal support.
- Low if fewer than 3 usable comparable sales exist within 12 months.

Confidence may upgrade when:

- Title/plan confirms land and lot structure.
- Section 32 confirms zoning, overlays, easements and covenants.
- Current photos or inspection confirm condition.
- 5+ strong same-type comparable sales exist within 6 months.
- Back-test reliability for the suburb/model is strong.

## 8. Required Output Structure

Every valuation should output:

```text
Estimated value range
Model midpoint
Confidence label and score
Property type and type confidence
Comparable baseline and key comparable sales
Major positive factors
Major negative factors
Micro-location summary
Suburb fundamentals summary
Automatically checked items
Conflicting sources
Manual checks required
What would change the valuation
```

## 9. Implementation Notes

- Store every source reference at field level where possible.
- Keep raw source values before choosing canonical values.
- Do not silently overwrite a portal value with title value; record the conflict resolution.
- Comparable sales should be same property type unless explicitly downgraded and disclosed.
- Apartment must remain separate from townhouse/villa.
- Granny flat potential must remain separate from approval certainty.
- Suburb fundamentals are explanatory and contextual, not the main price anchor.
