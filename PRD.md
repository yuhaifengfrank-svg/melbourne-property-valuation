# 澳洲房地产评估系统 PRD

## 1. 产品概述

本产品第一阶段先以 **Metropolitan Melbourne House** 为核心估值模型，并逐步扩展到其他 property type。用户输入地址并确认 property type 后，系统自动识别房产基础信息，建立近期可比成交池，结合街道微位置、土地、建筑、房况和规划风险，输出一个可解释的估值区间。

第一版不追求成为正式银行估值或注册估价报告，而是提供一个透明、可回测、以市场成交证据为核心的桌面估值工具。

## 2. MVP 范围

### 2.1 In Scope

- 地区: Metropolitan Melbourne
- 房产类型:
  - Phase 1: House
  - Phase 1.5: Vacant Land
  - Phase 1.5: Townhouse
  - Phase 1.5: Villa
  - Phase 2: Apartment
  - Phase 2: Other / Special Purpose
- 输入方式: 用户手工输入地址
- 输出内容:
  - Estimated value range
  - Model midpoint
  - Confidence level
  - Key comparable sales
  - Micro-location assessment
  - Positive / negative factors
  - Missing checks
- 模型核心:
  - Recent comparable sales baseline
  - Dynamic comparable weighting
  - Street ranking / micro-location model
  - Land, building, condition and planning risk adjustments
  - Confidence scoring
  - Back-testing framework
  - Investor lead capture and gated investment information, future module

### 2.2 Out of Scope

第一版暂不覆盖:

- Commercial property
- Rural property
- Formal bank valuation
- Automated legal advice
- Development feasibility as a standalone product

## 3. 用户流程

### 3.1 第一层桌面估值

```text
User enters address
→ System confirms property type is House
→ System retrieves / infers base property data
→ System builds comparable sales pool
→ System calculates comparable baseline
→ System applies adjustment factors
→ System outputs valuation summary
```

### 3.2 高置信度估值

```text
First-layer valuation
→ User provides current condition evidence
→ System checks title / zoning / overlays / easements
→ System expands and validates comparable sales pool
→ System narrows or revises valuation range
→ System upgrades confidence where justified
```

### 3.3 Lead Capture Flow

系统需要支持渐进式客户线索收集。用户未注册时可以看到基础估值, 但完整报告、详细分析、文件上传和 PDF 下载需要登录或补充资料。

未注册用户可看:

- Estimated value range
- Midpoint
- Confidence
- Property type
- 简化 main reasons
- 简化 micro-location
- 1-2 个 comparable 摘要

注册后可看:

- 完整 comparable sales
- Comparable adjustments
- Street ranking detail
- Suburb fundamentals
- Planning / title / potential detail
- Missing checks
- File uploads
- Revised valuation

PDF 下载前必填:

- Email
- Name
- Phone
- Contact consent

规则:

- Phone 在普通注册时 optional
- Phone 在 PDF 下载前 required
- Contact consent 在普通注册时 optional
- Contact consent 在 PDF 下载前 required
- Consent 文案必须明确说明可通过 phone / SMS / email 联系用户
- Consent status 和 timestamp 必须保存

### 3.4 Property Finance / Private Investment Extension

系统可扩展为地产金融和私募产品的前端入口, 但必须与估值工具清晰分层。

目标:

- 用房产估值工具获客
- 通过用户搜索行为了解投资兴趣
- 收集 investor profile
- 展示 general educational content
- 对私募机会做 eligibility gating
- 为合格投资人提供 gated opportunity / IM / DD room 入口

公开页面原则:

```text
Valuation pages provide property information and general market context.
They must not present personal financial advice or recommend a financial product to a specific user.
```

权限层:

- Public visitor: basic property valuation and general education
- Registered user: full valuation report and investor education
- Profile completed: investor preference and eligibility captured
- Eligibility reviewed: access to gated opportunity summaries
- Qualified / authorised investor: access to detailed IM / DD materials, subject to compliance process

Investor profile fields:

- Investment purpose
- Budget / intended allocation
- Preferred strategy: capital growth, income, development, private credit, landbank, diversified
- Investment horizon
- Risk tolerance
- Wholesale / sophisticated investor status
- Accountant certificate status, if applicable
- SMSF investor flag
- Australian tax residency
- Consent to contact

Opportunity gating:

```text
Specific private investment opportunities should only be visible after investor eligibility checks.
Public content should remain general information.
```

Compliance notes:

- Display general information disclaimer
- Avoid personal financial advice language
- Separate valuation output from financial product recommendation
- Record investor eligibility status
- Record consent, document access and download history
- Require review of AFSL / authorised representative / managed investment scheme requirements before production launch

## 4. 用户端输出模板

用户端应保持简洁，突出结果和解释。

```text
Estimated Value
$X - $Y

Midpoint
$Z

Confidence
Low / Low-Medium / Medium / Medium-High / High

Why this estimate?
- Recent comparable sales support this range
- Land size and house utility
- Street rank and micro-location
- Current condition assumptions
- Planning / title risk assumptions

Key Comparables
- Address / sale date / sale price / land / bed-bath-car

Micro-location
- Street rank within suburb
- Quiet vs busy
- Amenity access
- Tree canopy / streetscape
- Traffic and noise
- Negative externalities

Loan / LVR scenario
- Indicative borrowing at selected LVR
- Deposit / equity required
- Valuation sensitivity
- Not a loan approval

Missing Checks
- Current condition
- Title / zoning / easement / overlays
- Full comparable pool, if incomplete
```

## 5. House 数据字段

### 5.1 地址与基础字段

- Address
- Suburb
- Postcode
- Council / LGA
- Property type
- Property type confidence

### 5.2 土地字段

- Land size
- Frontage
- Depth
- Land shape
- Slope
- Orientation
- Corner block
- Land size source
- Land size confidence
- Title / lot plan reference
- Parent-child address ambiguity

### 5.3 建筑字段

- Bedrooms
- Bathrooms
- Car spaces
- Building size
- Main entrance orientation
- Main living area orientation
- Backyard orientation
- Year built / approximate age
- Single storey / double storey
- Renovation level
- Structural condition
- Floorplan functionality
- Existing secondary dwelling / granny flat
- Granny flat / secondary dwelling potential

### 5.4 Orientation Fields

系统需要区分土地朝向和房屋朝向。

- `land_orientation`: 地块或主要 frontage 朝向
- `main_entrance_orientation`: 房子主入口开门朝向
- `main_living_area_orientation`: 主要客厅 / family room / 后院生活区朝向
- `backyard_orientation`: 后院朝向

影响:

- 北向后院 / 北向主要生活区通常对 Melbourne 买家有正向影响
- 西晒可能带来夏季热负荷, 需要结合遮阳、树木和窗户设计
- 东向早晨采光通常中性到小正向
- 南向主要生活区可能采光较弱, 但要看窗户、天窗、层高和设计
- 主入口朝向对部分买家有偏好影响, 但一般低于 living area / backyard orientation

估值处理:

```text
Orientation should be a small adjustment factor unless it materially affects natural light, thermal comfort, or buyer demand.
It should be disclosed in the building / micro-location explanation, not over-weighted.
```

### 5.5 交易与租金字段

- Last sold price
- Last sold date
- Current asking price, if available
- Estimated weekly rent
- Gross rental yield
- Comparable sales

### 5.5A Loan / LVR Scenario

估值系统可以加入贷款情景模块, 用估值结果推算不同 LVR 下的 indicative borrowing amount。该模块用于教育和初步测算, 不等于贷款批准、信用评估或个人信贷建议。

关键字段:

- `selected_lvr`: 用户选择的 LVR, e.g. 60%, 70%, 80%
- `estimated_value_used`: 使用 midpoint 或用户选择的 low / midpoint / high
- `indicative_max_loan`: estimated value × selected LVR
- `required_deposit_or_equity`: estimated value - indicative max loan
- `purchase_price`: if available
- `shortfall_or_surplus`: loan scenario vs purchase price
- `stamp_duty_and_costs`: optional estimate, if enabled
- `income_serviceability_required`: not calculated in MVP unless finance module added
- `loan_scenario_disclaimer`

示例:

```text
Estimated value midpoint: $1,410,000
Selected LVR: 80%
Indicative loan amount: $1,128,000
Required equity before costs: $282,000
```

规则:

- 默认显示 60%, 70%, 80% LVR tabs / selector
- 若是投资房, 可显示 rental income support, 但不做正式 serviceability
- 若用户输入 purchase price, 系统可显示 valuation shortfall risk
- 若 estimated value low < purchase price, 系统应提示 valuation risk
- 不应承诺任何 lender approval

免责声明:

```text
This is an indicative LVR scenario only. It is not a loan approval, credit assessment or personal financial advice. Actual borrowing capacity depends on lender policy, income, expenses, credit history, security type and full application assessment.
```

### 5.6 规划与风险字段

- Title type
- Zoning
- Planning overlays
- Heritage overlay
- Easements
- Restrictive covenants
- Flood risk
- Bushfire risk
- Vegetation / tree controls
- Noise or major road exposure
- Secondary dwelling planning constraints
- Private open space / rear yard suitability

### 5.7 Secondary Dwelling / Granny Flat Potential

House 估值需要考虑是否已有 granny flat, 或未来是否有加建 secondary dwelling 的潜力。该因素不能仅凭土地面积判断, 需要结合 aerial imagery、site layout、access、zoning、overlays 和 council rules。

关键字段:

- `existing_secondary_dwelling`: yes / no / unknown
- `granny_flat_potential`: none / low / medium / high / unknown
- `rear_yard_depth`: estimated or measured
- `rear_yard_access`: direct side access / narrow side access / no vehicle access / unknown
- `site_coverage_estimate`
- `private_open_space_remaining`
- `services_connection_feasibility`
- `planning_secondary_dwelling_constraints`
- `aerial_imagery_reviewed`: yes / no
- `street_view_reviewed`: yes / no
- `granny_flat_notes`

影响:

- 已有合法 secondary dwelling: 可能提高租金、multi-generational living appeal 和投资吸引力
- 有较高加建潜力: 对部分买家正向, 但应小幅加权, 不可等同于已批准价值
- 无 access、后院过小、overlay 限制、site coverage 过高: potential 应降级

重要限制:

```text
The system can flag granny flat potential, but it must not claim approval is guaranteed.
Any secondary dwelling potential requires planning / building confirmation.
```

### 5.8 Planning Feasibility Engine

系统需要把 council planning 和 Victoria planning controls 结合到 house potential 判断中。输出不应是绝对的 "approved / rejected", 而应是 feasibility band。

```text
Planning Feasibility
├── likely_permissible
├── possible_subject_to_constraints
├── difficult_or_high_risk
├── unlikely
└── unknown_need_manual_review
```

#### 5.8.1 数据来源

优先数据源:

- Title plan: easements, covenants, lot boundaries
- Land title search / title register: title ownership, lot and plan reference
- VicPlan / Planning Property Report: zoning, overlays, planning scheme
- Council property / planning records: property boundaries, rates record, local planning context
- Council planning scheme schedules: local variations, neighbourhood character, DDO/NCO/HO controls
- Aerial imagery / Google Maps: site layout, rear yard, access, existing structures
- Street View: street character, neighbouring built form, vehicle access
- Nearby planning permits: similar approvals/refusals nearby, where available
- Neighbouring property context: height, setbacks, overlooking, overshadowing, building mass

### 5.9 Land Size Source Hierarchy and Cross-check

Land size is a critical valuation input. The system must not rely only on listing portals such as realestate.com.au, Domain, View, PropertyValue or similar AVM/portal pages, especially for subdivided properties, units, villas, townhouses, parent-child addresses, or multi-lot sites.

Authoritative / preferred sources:

1. Title search / title register
2. Title plan / plan of subdivision
3. Survey plan, if available
4. Council property or rates record
5. VicPlan / Planning Property Report parcel data

Secondary sources:

6. Agent Statement of Information
7. Contract of sale / Section 32, if available
8. Agent listing description

Weak / non-authoritative sources:

9. realestate.com.au / Domain / View / PropertyValue / other portal-derived property pages
10. AVM summaries and scraped property profiles

Rules:

- `land_size_sqm` must store both value and source.
- If source is portal-only, set `land_size_confidence` to Low or Medium at best.
- If portal land size conflicts with title/council/VicPlan, authoritative source wins.
- If parent address has child addresses such as `1/9`, `2/9`, or `unit 1`, the system must flag `parent_child_address_ambiguity`.
- If land size cannot be title-confirmed, valuation confidence must be capped at Medium or below.
- If land size materially drives the valuation, missing title confirmation must appear in Missing Checks.

Example:

```text
A parent street address may coexist with child unit addresses.
The system must not treat a portal land-size field as title-confirmed.
Land-size confidence remains Low-Medium until checked against title, plan of subdivision or council records.
```

### 5.10 Automated Check vs Manual Upload Workflow

系统应先自动完成所有公开可查项，再把无法自动获取或需要付费/授权的文件列为 manual upload / manual input。

#### Automated Public Checks

系统应自动尝试:

- Listing portal cross-check: realestate.com.au, Domain, View, PropertyValue, property.com.au 等
- Address normalization and related address detection: parent address, unit numbers, child addresses
- Recent comparable sales search
- Rental estimate cross-check
- VicPlan / Planning Property Report: zone, overlays, planning scheme
- Council public planning register: planning permits, advertised applications, subdivision history where available
- Council public maps, if available
- Google Maps / aerial imagery review
- Street View review
- Nearby built form scan: adjacent height, rear structures, dual occupancy / townhouse pattern
- Nearby street and micro-location assessment
- Street geometry and parking scan: street length, access distance to connecting roads, road width, kerbside parking pressure

#### Manual Upload / Manual Input

如果自动查不到或需要授权/付费, 系统应要求用户上传或输入:

- Title search / Register Search Statement
- Title plan / plan of subdivision
- Section 32 / Vendor Statement
- Contract of Sale
- Council building records
- Building permit records
- Survey plan
- Drainage / services information
- Body corporate / owners corporation certificate, if applicable
- Current inspection notes and photos

#### Output Rules

每次估值输出必须区分:

```text
Automatically checked
Manual checks required
Conflicting sources
User-uploaded evidence
```

Example:

```text
Automated checks completed:
- Portal cross-check
- Related address detection
- VicPlan zoning / overlays
- Recent sales scan
- Street View / aerial review

Manual checks required:
- Title plan
- Plan of subdivision
- Section 32
- Council building records

Reason:
Public portal land size conflicts with related child addresses.
```

#### Confidence Impact

- 自动检查完成但 title 未确认: confidence capped at Medium.
- 自动检查发现 source conflict: confidence capped at Low-Medium until resolved.
- 用户上传 title / plan / Section 32 且无重大问题: confidence may upgrade.
- 用户上传文件发现 easement/covenant/overlay risk: valuation and confidence must update.

#### 5.8.2 Small Second Dwelling / Granny Flat Check

Victoria allows many small second dwellings up to 60 sqm without a planning permit in many cases, but this depends on overlays and special controls. A building permit and siting/building compliance may still be required.

System checks:

- Existing lawful dwelling on the lot
- Proposed gross floor area <= 60 sqm
- Zone permits residential use
- Overlays that may trigger permit or constrain development
- Flood / bushfire / environmental controls
- Heritage / neighbourhood character / vegetation controls
- Site has practical rear yard space
- Access for construction and future use
- Services connection feasibility
- Private open space and site coverage impact

Output:

```text
Small second dwelling feasibility:
Possible, but planning/building confirmation required.
```

#### 5.8.3 Council / Planning Controls Scoring

The system should score planning constraints separately:

- `zone_support_score`: whether residential / secondary dwelling use is supported
- `overlay_constraint_score`: heritage, flood, bushfire, vegetation, DDO, NCO, SBO, LSIO, etc.
- `easement_constraint_score`: whether easements block rear-yard building area
- `covenant_constraint_score`: whether private restrictions may prevent second dwelling
- `site_layout_score`: whether physical layout supports a secondary dwelling
- `neighbourhood_character_score`: whether nearby built form supports similar scale
- `neighbour_amenity_risk_score`: overlooking, overshadowing, visual bulk, noise, access

#### 5.8.4 Neighbouring Built Form

Neighbouring houses matter because council assessment often considers neighbourhood character and amenity impact.

System should inspect:

- Adjacent building height: single / double / three-storey
- Rear setbacks of neighbouring dwellings
- Existing outbuildings / garages / studios in rear yards
- Pattern of dual occupancy or second dwellings nearby
- Overlooking risk into neighbouring secluded private open space
- Overshadowing risk to neighbouring private open space
- Visual bulk along side and rear boundaries
- Whether nearby approvals show council acceptance of similar built form

Use:

```text
If nearby properties already have similar rear studios / second dwellings / dual occupancy,
planning feasibility may improve.

If the street is strongly single-storey heritage / neighbourhood-character sensitive,
planning feasibility may reduce.
```

#### 5.8.5 Output Rules

The system must separate:

- Physical potential: can it fit?
- Planning potential: is it likely supported?
- Approval certainty: has it actually been approved?

Example output:

```text
Granny flat potential: Medium
Physical fit: Good rear yard depth, access to be confirmed
Planning feasibility: Possible subject to overlays and building permit
Neighbouring context: Similar low-scale rear structures nearby
Approval certainty: Not approved; requires planning/building confirmation
Valuation impact: small positive, not valued as approved secondary dwelling
```

## 6. Property Type Taxonomy

系统第一步必须确认 property type。不同 property type 共享同一个估值框架，但每个类型有不同字段、可比成交池和调整项。

### 6.1 Supported Property Types

```text
Property Type
├── House
├── Vacant Land
├── Townhouse
├── Villa
├── Apartment
└── Other / Special Purpose
```

定义:

- `House`: 独立屋, 通常有独立土地和门牌。
- `Vacant Land`: 空地、可建住宅土地、可推倒重建地块、潜在开发地。
- `Townhouse`: 多层或低密度联排, 常见共墙、共用 driveway 或 owners corporation。
- `Villa`: 低密度 villa/unit, 通常单层或低层, 可能位于小 block 内, 有私人 courtyard 或 garage。
- `Apartment`: strata apartment, 价值重点在室内面积、楼宇质量、楼层、物业费和设施。
- `Other / Special Purpose`: retirement village、student apartment、serviced apartment、NDIS/SDA、rooming house、boarding house 等特殊类型。第一版只识别并提示人工复核, 不自动强估。

### 6.2 Property Type Selection Flow

```text
User enters address
→ System detects likely property type
→ User confirms property type
→ System selects matching valuation model
→ System builds same-type comparable sales pool
→ System outputs valuation and confidence
```

若公开数据与用户输入冲突:

```text
Property type confidence should be Low or Low-Medium.
System should ask user to confirm before final valuation.
```

### 6.3 Model Coverage by Phase

| Type | Phase | Model status |
| --- | --- | --- |
| House | Phase 1 | Core model |
| Vacant Land | Phase 1.5 | Prototype model |
| Townhouse | Phase 1.5 | Prototype model |
| Villa | Phase 1.5 | Prototype model |
| Apartment | Phase 2 | Later model |
| Other / Special Purpose | Phase 2+ | Identify and manual review |

## 7. Property Type Extension: Vacant Land, Townhouse, Villa, Apartment

House、Vacant Land、Townhouse、Villa、Apartment 共享同一个估值框架，但不能使用完全相同的字段和权重。

共同框架:

```text
Estimated Value
= Comparable Sales Baseline
× Time / Market Adjustment
× Property-specific Adjustment
× Current Condition Adjustment
× Micro-location Adjustment
× Planning / Title / Body Corporate / Constraint Risk Adjustment
```

共同原则:

- Comparable sales 仍然是估值锚点。
- Comparable pool 必须优先使用同 property type。
- Vacant Land 必须优先和 vacant land / development site / land-value sales 比。
- Townhouse 不能直接和 house 混比。
- Villa 不能直接和 apartment 混比。
- Apartment 不能直接和 villa/townhouse 混比。
- Apartment 必须进入独立 apartment model, 不应并入 townhouse / villa model。
- 如果同类型成交不足, 可扩展参考范围, 但必须降低 confidence 并披露原因。

### 7.1 Vacant Land 类型

Vacant Land 包括:

- Residential vacant land
- Knockdown rebuild site
- Development site
- Subdivision potential land
- Corner block with redevelopment potential

Vacant Land 关键字段:

- `land_size_sqm`
- `frontage_m`
- `depth_m`
- `land_shape`
- `slope`
- `orientation`
- `corner_block`
- `zoning`
- `planning_overlays`
- `heritage_overlay`
- `easements`
- `restrictive_covenants`
- `services_available`: water, sewer, electricity, gas, NBN
- `road_access`
- `soil_or_contamination_risk`
- `flood_risk`
- `bushfire_risk`
- `vegetation_controls`
- `buildable_area_sqm`
- `subdivision_potential`
- `development_yield_potential`
- `highest_and_best_use_notes`

Vacant Land 估值中特别重要的因素:

- Comparable land sales
- Price per sqm of land
- Frontage / depth usability
- Regular shape premium
- Corner block premium
- Zoning and overlay constraints
- Easement and covenant penalty
- Service connection readiness
- Development or subdivision potential
- Demolition cost if treated as knockdown/rebuild

Vacant Land 估值公式:

```text
Estimated Land Value
= Comparable Land Sales Baseline
× Time / Market Adjustment
× Land Size / Shape Adjustment
× Frontage / Depth Adjustment
× Zoning / Development Potential Adjustment
× Micro-location Adjustment
× Planning / Constraint Risk Adjustment
```

建议解释权重:

- Comparable land sales influence: 60%-75% when recent land comps are strong
- Zoning / development potential: 10%-20%
- Land shape / frontage / depth: 10%-15%
- Micro-location: 8%-12%
- Planning / constraints: penalty-based

### 7.2 Townhouse 额外字段

Townhouse 除了 House 共有字段外，需要额外记录:

- `internal_area_sqm`: 室内面积
- `land_component_sqm`: 土地占比 / lot size
- `private_open_space_sqm`: 私人庭院或露台面积
- `number_of_levels`: 层数
- `street_frontage`: 是否临街
- `own_street_address`: 是否有独立门牌感
- `own_driveway`: 是否独立 driveway
- `garage_type`: garage / carport / open space
- `attached_sides`: 共墙数量
- `number_in_complex`: 小区内总套数
- `position_in_complex`: front / middle / rear / standalone
- `shared_driveway`: 是否共用车道
- `body_corporate_fee`: body corporate / owners corporation fee
- `common_area_quality`: 公共区域维护水平
- `builder_quality`: 建筑商 / 建造质量
- `privacy_overlooking_risk`: 隐私和被俯视风险
- `energy_efficiency_rating`: 能效, 如有

Townhouse 估值中特别重要的额外因素:

- Street-facing townhouse premium
- Own driveway premium
- Low or no body corporate premium
- Small boutique complex premium
- Rear townhouse discount or privacy premium, depending layout
- Shared driveway / tight access penalty
- Poor common area or high owners corporation fee penalty

### 7.3 Townhouse 调整项

建议解释权重:

- Comparable sales influence: 60%-70% when recent townhouse comps are strong
- Micro-location: 10%-15%
- Building utility: 10%-15%
- Land / private open space: 5%-10%
- Complex / frontage / position: 5%-10%
- Condition: 5%-10%
- Body corporate / title risk: penalty-based

### 7.4 Villa 额外字段

Villa 指低密度 villa unit，不包括高层 apartment。除 House 共有字段外，需要额外记录:

- `unit_internal_area_sqm`: 室内面积
- `land_component_sqm`: 土地占比, 如可得
- `private_courtyard_sqm`: 私人庭院面积
- `single_level`: 是否单层
- `number_in_block`: block 内总套数
- `position_in_block`: front / middle / rear
- `street_frontage`: 是否临街
- `own_driveway`: 是否独立 driveway
- `garage_or_carport`: garage / carport / open space
- `body_corporate_fee`
- `common_insurance_or_shared_costs`
- `owner_occupier_ratio`: 自住比例, 如可得
- `privacy_rating`: 隐私
- `noise_exposure_within_block`: block 内噪音影响
- `renovation_level`
- `accessibility_single_level_premium`: 单层无楼梯适老化优势

Villa 估值中特别重要的额外因素:

- Single-level villa premium
- Front unit with street frontage premium
- Rear quiet unit premium or frontage discount, depending buyer segment
- Small block premium, e.g. block of 2-4
- Own driveway / lock-up garage premium
- Large private courtyard premium
- High body corporate fee penalty
- Poor common area / shared driveway penalty
- Low land component discount

### 7.5 Villa 调整项

建议解释权重:

- Comparable sales influence: 60%-70% when recent unit/villa comps are strong
- Micro-location: 8%-12%
- Building utility: 10%-15%
- Land component / courtyard: 8%-12%
- Complex / block quality: 5%-10%
- Condition: 5%-10%
- Body corporate / title risk: penalty-based

### 7.6 Apartment 额外字段

Apartment 指 strata apartment。Apartment 必须和 Townhouse / Villa 分开建模。该类型第一版先记录字段和 prototype, 完整估值模型放到 Phase 2。

Apartment 额外字段:

- `internal_area_sqm`
- `balcony_area_sqm`
- `total_area_sqm`
- `floor_level`
- `aspect`
- `view_quality`
- `bedrooms`
- `bathrooms`
- `car_spaces`
- `storage_cage`
- `car_park_on_title`
- `building_age`
- `building_height`
- `number_of_apartments_in_building`
- `body_corporate_fee`
- `facilities`: lift, gym, pool, concierge, etc.
- `cladding_or_defect_risk`
- `owner_occupier_ratio`
- `short_stay_restrictions`
- `noise_exposure`
- `lending_restriction_risk`

Apartment 估值中特别重要的因素:

- Internal area and floorplan efficiency
- Floor level, aspect and views
- Building quality and defect risk
- Body corporate fee and facilities value
- Car space and storage on title
- Owner occupier ratio
- Lending restrictions
- Comparable apartment sales in same building or nearby similar buildings

Apartment 与 Townhouse / Villa 的关键区别:

- Apartment 重点看 internal area、floor level、aspect、view、building quality、body corporate、facilities、defect risk。
- Townhouse / Villa 重点看 land component、private open space、street frontage、own driveway、position in complex/block。
- Apartment 的最佳 comparable 通常是同楼、同 building type、同楼层/面积段的 apartment sale。
- Townhouse / Villa 的最佳 comparable 通常是同区低密度 townhouse/villa sale。

### 7.7 Other / Special Purpose

Other / Special Purpose 包括:

- Student apartment
- Serviced apartment
- Retirement village
- Rooming house
- Boarding house
- NDIS / SDA housing
- Caravan park
- Hotel / motel
- Church / school / community facility

第一版规则:

```text
System should identify the type, explain that standard residential valuation may not apply, and request manual review.
Confidence should be Low unless a dedicated model exists.
```

### 7.8 Property Type Confidence

Townhouse、Villa、Apartment 在公开数据中经常标注不一致。系统必须显式输出:

- Property type detected
- Property type confidence
- Why this type was selected
- Whether user confirmation is required

若系统无法确认 house / vacant_land / townhouse / villa / apartment:

```text
Confidence should be Low or Low-Medium.
System should ask user to confirm property type before final valuation.
```

## 8. 估值模型

### 7.1 核心公式

```text
Estimated Value
= Comparable Sales Baseline
× Time / Market Adjustment
× Land Adjustment
× Building Utility Adjustment
× Current Condition Adjustment
× Micro-location Adjustment
× Planning / Title Risk Adjustment
```

### 7.2 Comparable Sales Baseline

Comparable sales 是估值锚点。系统必须先由近期可比成交建立 baseline，再做其他调整。

```text
Baseline = Σ(Adjusted Comparable Price × Comparable Weight)
```

```text
Comparable Weight
= Recency Weight
× Location Similarity
× Property Similarity
× Condition Similarity
× Data Reliability
```

### 7.3 时间权重

- Sold within 0-3 months: 1.00
- Sold within 3-6 months: 0.75
- Sold within 6-12 months: 0.50
- Sold older than 12 months: use only as weak context or exclude unless turnover is low

### 7.4 Dynamic Comparable Influence

Comparable influence 根据 6 个月内样本质量动态调整。

- Strong recent evidence:
  - 6 个月内有 5+ 个高质量可比成交
  - 或 6 个月内有 3+ 个高质量可比成交且包含同街 / 同 pocket / 同 school zone 样本
  - Comparable influence: 60%-70%

- Normal recent evidence:
  - 6 个月内有 3-5 个可比成交
  - Comparable influence: 55%-65%

- Weak recent evidence:
  - 6 个月内少于 3 个可比成交
  - 或样本差异大，需要扩展到 12 个月
  - Comparable influence: 45%-55%
  - 估值区间扩大，confidence 下降

- Insufficient evidence:
  - 12 个月内仍缺少有效可比成交
  - 使用 suburb trend、older sales、broader area evidence 和人工复核
  - Confidence 应为 Low 或 Low-Medium

### 7.5 调整项建议范围

这些权重用于解释和校准，不是简单线性相加。

- Comparable sales influence: 45%-70%，由样本质量决定
- Micro-location adjustment: 10%-15%
- Land adjustment: 10%-15%
- Building utility adjustment: 8%-12%
- Current condition adjustment: 5%-10%
- Planning / title risk: penalty-based，通常 0%-5%，重大问题时更高

## 9. Comparable Sales 规则

### 8.1 可比成交筛选

优先筛选:

- Same suburb
- Same property type: House only
- Same school zone / same micro-location cluster where relevant
- Sale date within 0-6 months
- Land size within target +/- 20%
- Similar bedrooms / bathrooms / car spaces
- Similar condition / renovation level where available

### 8.2 排除或降权

- Townhouse / unit / villa
- Main road compromised property
- Development site
- Knockdown-only sale
- Brand-new luxury build, unless target is comparable
- Unusual title or legal constraint
- Missing core property data

### 8.3 Baseline 生成

每个 comparable 需要先调整为接近 target property 的等价价格:

- Time / market adjustment
- Land size adjustment
- Building utility adjustment
- Condition adjustment
- Micro-location adjustment
- Planning / risk adjustment

然后用相似度权重加权平均，生成 baseline。

## 10. Micro-location 模型

House 估值不能只看 suburb median，需要拆成 suburb 层和 street / micro-location 层。

```text
Location
├── Suburb Level
│   ├── Median house price
│   ├── School zone
│   ├── Distance to CBD
│   └── Amenity profile
│
└── Micro-location Level
    ├── Street rank
    ├── Street grade
    ├── Streetscape / tree canopy
    ├── Traffic and noise
    ├── Access friction
    ├── Street geometry and parking
    ├── Walkability
    └── Negative externalities
```

### 10.0 Suburb Fundamentals and Comparative Analysis

估值结果需要包含 suburb 层面的基本面分析。该分析不应替代 recent comparable sales, 但用于解释长期需求、租金支撑、买家结构、风险和与周边 suburb 的相对位置。

#### Key suburb indicators

系统应尽量自动收集:

- Median household income
- Employment status / unemployment rate
- Occupation profile: professionals, managers, technicians, service workers, etc.
- Household composition: families, couples, singles, students
- Owner occupier vs renter ratio
- Population and age profile
- Education level, if available
- Median house price
- Median unit/apartment price
- 12-month price growth
- 5-year price trend
- Median rent by property type
- Rental yield
- Vacancy pressure, if available
- Auction clearance or days on market, if available
- School access and school reputation
- Transport and CBD access
- Major employment nodes: university, hospital, business park, shopping centre, industrial precinct

#### Comparative suburb set

每个 suburb 应选择 3-6 个 comparison suburbs:

- Adjacent suburbs
- Similar price bracket suburbs
- Substitute buyer suburbs
- Nearby higher-tier and lower-tier alternatives

Example:

```text
Oakleigh comparison set:
- Hughesdale
- Huntingdale
- Oakleigh East
- Oakleigh South
- Clayton
- Murrumbeena
```

#### Output

用户端输出应简洁:

```text
Suburb fundamentals:
- Household income: above / similar / below metro comparison
- Buyer profile: family-oriented, mixed owner-occupier/renter
- Employment drivers: Monash University, Monash Medical, Chadstone, local retail, transport access
- Price position: cheaper than Hughesdale/Murrumbeena, stronger amenity than some outer alternatives
- Rental support: strong due to transport, university/medical/employment access
- Risk: affordability ceiling and stock-quality variation
```

#### Valuation impact

Suburb fundamentals should affect:

- Market commentary
- Confidence explanation
- Rental demand assessment
- Medium-term growth / risk notes
- Comparable suburb expansion when same-suburb samples are insufficient

Suburb fundamentals should not directly overpower strong recent comparable evidence.

### 9.1 Micro-location 字段

- `street_type`
- `street_grade`
- `street_rank_in_suburb`
- `street_rank_basis`
- `quiet_vs_busy`
- `streetscape_score`
- `tree_canopy_score`
- `street_tree_maturity`
- `housing_quality_consistency`
- `traffic_noise_score`
- `main_road_noise_exposure`
- `near_main_road_distance`
- `access_friction_score`
- `directional_access_notes`
- `amenity_walkability_score`
- `public_transport_access`
- `village_or_shopping_access`
- `park_access`
- `school_access`
- `school_zone_premium`
- `negative_externalities`
- `street_reputation_notes`
- `street_length_m`
- `distance_to_nearest_connector_road_m`
- `distance_to_nearest_arterial_road_m`
- `number_of_exit_routes`
- `cul_de_sac_or_no_through_road`
- `road_width_rating`
- `kerbside_parking_availability`
- `parking_pressure_rating`
- `passing_width_comfort`
- `driveway_access_difficulty`
- `school_or_shopping_parking_spillover`
- `street_access_notes`

### 9.2 Street Grade

- A: 优质安静住宅街，树木成熟，街景好，车流少，买家需求强
- B: 普通优质住宅街，无明显缺点
- C: 有一定妥协的街道，如 connector road，车流或噪音偏高
- D: 明显受损位置，如主路、铁路、高速、工业、商业后巷、高压线等

### 9.3 Street Ranking Model

```text
Street Rank
= Transaction Premium
+ Buyer Demand Signal
+ Street Quality Score
+ Amenity Access Score
- Negative Externality Penalty
```

第一阶段只输出 rank band，不输出精确名次。

- Top 10%
- Top 25%
- Middle 50%
- Bottom 25%
- Compromised / avoid
- Unknown / insufficient evidence

系统必须披露 evidence 和 uncertainty，不能只输出 rank。

### 9.4 First-layer Micro-location Disclosure

即使用户只输入地址，第一层估值也必须披露:

- Street rank within suburb
- Quiet / busy classification
- Traffic and noise
- Tree canopy / streetscape
- Amenity access
- Directional access
- Street length and access to connecting roads
- Road width and passing comfort
- Kerbside parking availability and parking pressure
- Negative externalities
- Evidence notes

示例:

```text
Micro-location
- Street rank: Top 25% within suburb, estimated
- Street type: Quiet residential street near village
- Quiet vs busy: Quiet / low traffic
- Tree canopy: Medium-high
- Streetscape: Good family residential character
- Amenity access: Strong
- Directional access: Good, peak-hour right-turn friction to be checked
- Road width / parking: Normal residential street, parking pressure to be checked
- Negative externalities: None obvious from first-layer desktop review
- Micro-location adjustment: +4% to +7%
- Confidence: Medium
```

### 9.5 Street Geometry, Access and Parking

Street quality must include the physical road environment, not just suburb reputation.

Key factors:

- Street length: very short street / normal street / long through street
- Distance from property to nearest connector road
- Distance from property to nearest arterial road
- Number of exit routes: one-way out / two-way access / multiple exits
- Cul-de-sac or no-through-road status
- Road width: narrow / normal / wide
- Kerbside parking: easy / moderate / constrained / very constrained
- Passing comfort: can two cars pass comfortably when cars are parked?
- Driveway access: easy / tight / difficult
- Parking spillover from schools, shops, stations, parks or apartments
- Garbage truck / delivery access constraints

Valuation impact:

- Quiet short street with easy access and adequate parking: small positive
- Cul-de-sac: positive for quietness, but possible access inconvenience
- Narrow street with heavy kerbside parking: negative
- Long through street with traffic shortcut behaviour: negative
- Close to shops/schools/station with parking spillover: mixed, convenience positive but parking pressure negative

Output example:

```text
Street access and parking:
- Street length: short-to-normal residential street
- Exit routes: two practical exits
- Access distance: close to connector road without direct arterial exposure
- Road width: normal
- Kerbside parking: moderate
- Passing comfort: acceptable
- Parking pressure: low to moderate, subject to school/shop peak periods
```

## 11. Confidence Model

Confidence 表示系统对估值区间可靠程度的判断，不表示房子好坏。

```text
Confidence Score
= Comparable Quality
+ Data Completeness
+ Property Type Certainty
+ Condition Certainty
+ Planning / Title Certainty
+ Model Back-test Reliability
```

建议权重:

- Comparable Quality: 30%
- Data Completeness: 20%
- Property Type Certainty: 10%
- Condition Certainty: 15%
- Planning / Title Certainty: 15%
- Model Back-test Reliability: 10%

映射:

- 0-40: Low
- 40-60: Low-Medium
- 60-75: Medium
- 75-88: Medium-High
- 88-100: High

### 10.1 Confidence 升级条件

Medium-High 或 High 需要补齐:

- 当前房况证据: 当前照片、inspection notes、维护状态、是否翻新
- Title / planning check: title type、zoning、overlays、easements、covenants、flood / bushfire risk
- Complete recent comparable sales set: 最近 6-12 个月完整同区、同学区、同土地/房型/微位置成交池

### 10.2 Valuation Range Width

用户可见估值区间必须有上限。第一版 House MVP 中，估值区间相对 `model_midpoint` 的最大默认幅度不得超过 **-10% 到 +10%**。

默认区间规则:

- High: -3% to +3%
- Medium-High: -5% to +5%
- Medium: -7% to +7%
- Low-Medium: -10% to +10%
- Low: 不自动给出超过 -10% to +10% 的宽区间; 应降低 confidence 并提示数据不足或需要人工复核

规则:

```text
The user-visible valuation range must not exceed model_midpoint ±10% by default.
If data quality is too weak for a ±10% range, the system should not pretend to be precise.
It should show Low confidence, explain missing data, and request additional evidence.
```

例外:

- 如果用户明确要求显示 broader uncertainty band, 系统可以在专业详情中显示 sensitivity scenario, 但主估值区间仍应保持在 ±10% 以内或标记为 unable to provide reliable estimate.

## 12. Back-testing Method

Back-test 用于验证模型准确度。它必须模拟真实估值场景，而不是事后解释成交价。

### 11.1 回测流程

1. 选择一个已成交 house 作为 target property
2. 暂时隐藏真实成交价
3. 只使用成交日之前可获得的数据
4. 用模型生成 estimated range 和 midpoint
5. 揭示真实成交价
6. 对比误差、命中率和偏差原因

### 11.2 回测规则

Comparable sales pool 必须满足:

- Sale date earlier than target sale date
- Same suburb preferred
- Same school zone / micro-location cluster preferred
- Land size within target +/- 20% preferred
- Similar bed / bath / car preferred
- Same property type: house only
- Exclude direct use of target's own sale price

### 11.3 回测指标

每个样本输出:

- Target address
- Target sale date
- Actual sale price
- Model estimated range
- Model midpoint
- Confidence level
- Error amount
- Error percentage
- Range hit: yes / no
- Direction: overestimate / underestimate / within range
- Main cause of error

```text
Error Amount = Model Midpoint - Actual Sale Price
Error Percentage = Error Amount / Actual Sale Price
Range Hit = Actual Sale Price is within Estimated Value Range
```

汇总输出:

- Number of samples
- Range hit rate
- Median absolute percentage error
- Mean absolute percentage error
- Overestimate rate
- Underestimate rate
- Error by confidence level
- Error by street rank band
- Error by property condition
- Error by land size band

## 13. Back-testing Requirements

Historical back-testing must only use source-backed settled sales that were not used to construct the estimate. Each record must retain the sold-price source URL, sale date, subject features, comparable set, model version and generated timestamp. No back-test accuracy claim may be published until the dataset and calculation can be independently reproduced.

## 16. Product Requirements

### 16.1 Functional Requirements

- User can enter a Melbourne house address.
- System confirms property type: house, vacant land, townhouse, villa, apartment, or other/special purpose.
- System returns first-layer desktop valuation.
- System displays key comparable sales and reasons.
- System displays micro-location assessment.
- System displays missing checks and confidence explanation.
- System stores factor-level adjustments for auditability.
- System supports back-testing by suburb and model version.
- System supports public basic valuation without registration.
- System locks full report details behind email login.
- System requires phone number and contact consent before PDF download.
- System records lead status, consent timestamp and searched property address.

### 16.2 Non-functional Requirements

- Valuation output must be explainable.
- System must avoid false precision.
- Street ranking must use bands unless strong evidence supports otherwise.
- Missing data must be visible to users.
- Comparable sales must remain the valuation anchor where recent samples are sufficient.
- Model results must be versioned for back-testing.

## 17. Future Extensions

- Add full Apartment model
- Add automated Street View / image-based streetscape scoring
- Add Google Maps / aerial imagery assisted site layout review
- Add granny flat / secondary dwelling feasibility scoring
- Add title / planning API integration
- Add suburb-by-suburb back-testing dashboard
- Add rental yield and investment score
- Add PDF valuation report
