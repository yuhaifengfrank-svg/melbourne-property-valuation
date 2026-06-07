# 澳洲房地产评估系统需求草稿

## 1. MVP 范围

- 地区: Metropolitan Melbourne
- 房产类型: House
- 第一阶段目标: 建立一个针对墨尔本都市区独立屋的评估系统
- 当前阶段重点: 先讨论和沉淀需求, 暂不急于实现完整系统

## 2. House 基础字段

### 2.1 地址与基本信息

- Address
- Suburb
- Postcode
- Council / LGA
- Property type: House

### 2.2 土地字段

- Land size
- Frontage
- Depth
- Land shape
- Slope
- Orientation
- Corner block

### 2.3 建筑字段

- Bedrooms
- Bathrooms
- Car spaces
- Building size
- Year built / approximate age
- Single storey / double storey
- Renovation level
- Structural condition
- Floorplan functionality

### 2.4 交易与租金字段

- Last sold price
- Last sold date
- Current asking price, if applicable
- Estimated weekly rent
- Gross rental yield
- Comparable sales

### 2.5 规划与风险字段

- Zoning
- Planning overlays
- Heritage overlay
- Easements
- Flood risk
- Bushfire risk
- Noise or major road exposure

## 3. Location 模型

House 估值不能只看 suburb median, 需要拆成 suburb 层和 street / micro-location 层。

```text
Location
├── Suburb Level
│   ├── Median house price
│   ├── School zone
│   ├── Distance to CBD
│   └── Amenity profile
│
└── Micro-location Level
    ├── Street grade
    ├── Streetscape / tree canopy
    ├── Traffic and noise
    ├── Access friction
    ├── Walkability
    └── Negative externalities
```

## 4. Micro-location Profile

同一个 suburb 内, 不同街道和门牌位置会显著影响 house 价值。系统需要增加独立的 micro-location 模块。

### 4.1 字段

- `street_type`: quiet residential street, connector road, main road, cul-de-sac, court, etc.
- `street_grade`: A, B, C, D
- `streetscape_score`: 1-5
- `tree_canopy_score`: 1-5
- `traffic_noise_score`: 1-5
- `access_friction_score`: 1-5
- `amenity_walkability_score`: 1-5
- `school_zone_premium`: none, minor, moderate, strong
- `negative_externalities`: none, minor, moderate, severe
- `street_reputation_notes`: qualitative notes about traditional street reputation
- `directional_access_notes`: notes about left/right turn convenience toward major commuting routes
- `street_rank_in_suburb`: estimated rank band within suburb, e.g. top 10%, top 25%, middle 50%, bottom 25%
- `street_rank_basis`: evidence used for rank, e.g. sale premium, buyer demand, agent description, streetscape, local knowledge
- `quiet_vs_busy`: quiet street, normal residential street, connector street, busy road, main road
- `near_main_road_distance`: approximate distance to nearest arterial / main road
- `main_road_noise_exposure`: none, low, medium, high
- `public_transport_access`: weak, normal, good, strong
- `village_or_shopping_access`: weak, normal, good, strong
- `park_access`: weak, normal, good, strong
- `school_access`: weak, normal, good, strong
- `street_tree_maturity`: low, medium, high
- `housing_quality_consistency`: mixed, normal, consistent, premium

### 4.2 Street grade 定义

- A: 优质安静住宅街, 树木成熟, 街景好, 车流少, 买家需求强
- B: 普通优质住宅街, 无明显缺点
- C: 有一定妥协的街道, 如 connector road, 车流或噪音偏高
- D: 明显受损位置, 如靠主路、铁路、高速、工业、商业后巷、高压线等

### 4.3 分数字段定义

- `streetscape_score`
  - 1: 差, 缺少绿化或街景杂乱
  - 3: 普通住宅街水平
  - 5: 成熟树木、街景统一、维护良好

- `traffic_noise_score`
  - 1: 很安静
  - 3: 普通
  - 5: 明显车流或噪音问题

- `access_friction_score`
  - 1: 出入非常方便, 方向顺畅
  - 3: 正常
  - 5: 高峰期转向困难、绕行明显或出入压力较大

- `amenity_walkability_score`
  - 1: 步行便利性弱
  - 3: 一般
  - 5: 可步行到 village、学校、公园、tram / bus 等核心设施

### 4.4 估值调整逻辑草案

Micro-location 不直接替代 comparable sales, 而是作为可比销售调整因子。

```text
Adjusted Value
= Comparable Sales Baseline
× Land Adjustment
× Building Adjustment
× Condition Adjustment
× Micro-location Adjustment
× Market Adjustment
```

Micro-location adjustment 初步范围:

- A-grade street: +3% to +8%
- B-grade street: baseline
- C-grade street: -3% to -10%
- D-grade location: -8% to -20%+
- Total micro-location adjustment should usually be capped between -15% and +10% for MVP

### 4.5 First-layer micro-location disclosure

即使用户只输入地址、系统只做第一层桌面估值, 输出也必须披露 micro-location 细节, 不能只给一个总分。

第一层估值必须输出:

- Street rank within suburb: 该街道在 suburb 内的大致排名区间
- Quiet / busy classification: 安静街、普通住宅街、近街、闹街、主路等
- Traffic and noise: 车流、主路、铁路、高速、商业噪音等影响
- Tree canopy / streetscape: 树木成熟度、街景质量、住宅一致性
- Amenity access: village、shops、tram、bus、train、park、school 的便利性
- Directional access: 出街左转/右转、去 CBD / freeway / major road 的顺畅度
- Negative externalities: 高压线、工业、商业后巷、洪水、铁路、主路等
- Evidence notes: 系统为什么这么判断, 使用了哪些公开线索或可比成交

示例输出结构:

```text
Micro-location
- Street rank: Top 25% within suburb, estimated
- Street type: Quiet residential street near village
- Quiet vs busy: Quiet / low traffic
- Tree canopy: Medium-high
- Streetscape: Good family residential character
- Amenity access: Strong, walk to shops, tram, primary school and parkland
- Directional access: Good, close to Doncaster Road / freeway access; peak-hour right turn friction to be checked
- Negative externalities: None obvious from first-layer desktop review
- Micro-location adjustment: +4% to +7%
- Confidence: Medium, pending Street View / traffic / planning confirmation
```

街道排名第一阶段不需要给绝对名次, 避免虚假精度。优先使用 band:

- Top 10%
- Top 25%
- Middle 50%
- Bottom 25%
- Compromised / avoid

若数据不足, 系统必须显示:

```text
Street rank: Unknown / insufficient evidence
```

### 4.6 Street ranking model

Street rank 不是主观拍脑袋, 而是由多类证据合成。第一阶段输出 rank band, 不输出精确名次。

```text
Street Rank
= Transaction Premium
+ Buyer Demand Signal
+ Street Quality Score
+ Amenity Access Score
- Negative Externality Penalty
```

#### Transaction Premium

衡量该街道在同 suburb 内是否长期卖出溢价。

比较口径:

- Same suburb
- House only
- Similar land size
- Similar bed / bath / car
- Similar sale period
- Similar condition where available

信号:

- 同街成交长期高于 suburb median
- 同街成交高于附近普通街道的可比房
- 出现多次 high-end / prestige sales
- 大地块或优质房源集中成交

#### Buyer Demand Signal

衡量市场是否持续追捧该街道。

信号:

- Days on market shorter than suburb average
- Auction competition strong
- Sale price frequently above guide
- Agent descriptions repeatedly emphasize the street, village locale, school zone, or prestige
- Limited supply and strong repeat buyer interest

#### Street Quality Score

衡量街道本身的居住感和街景。

信号:

- Mature tree canopy
- Wide street / nature strip
- Good footpaths
- Consistent housing quality
- Well-maintained front gardens
- Character homes or premium dwellings
- Low traffic residential feel

#### Amenity Access Score

衡量便利性, 但重点是 "convenient without being compromised"。

信号:

- Walk to village / shops / cafes
- Walk to tram / bus / train
- Walk to school
- Walk to parkland
- Easy access to freeway / arterial road
- Directional access is convenient for daily commute

#### Negative Externality Penalty

扣分项:

- Main road / arterial road exposure
- Railway / freeway noise
- Industrial or commercial rear interface
- High voltage powerlines
- School drop-off congestion
- Flood / bushfire / drainage risk
- Heritage, easement, covenant or overlay that materially constrains value
- Difficult right turn or peak-hour access friction

#### Rank bands

第一阶段只输出区间:

- Top 10%
- Top 25%
- Middle 50%
- Bottom 25%
- Compromised / avoid
- Unknown / insufficient evidence

#### Example: St Georges Road, Toorak

示例用途: 说明 prestige street 如何被模型识别为高排名街道。

```text
Street: St Georges Road, Toorak
Street rank band: Top 5 within Toorak, estimated
Confidence: Medium-High

Evidence:
- Very strong transaction premium, including landmark trophy-home sales
- Longstanding prestige reputation in Toorak
- High concentration of large landholdings and premium dwellings
- Strong buyer recognition among prestige market participants
- Amenity access strong, close to Toorak's core high-end residential and village environment

Risk / nuance:
- Some sections may have more traffic than secluded courts
- Exact ranking depends on the property section, land size, orientation, heritage, and dwelling quality
```

系统正式输出时, 必须披露 evidence 和 uncertainty, 不能只输出 "Top 5"。

## 5. Confidence Model

系统需要区分普通桌面估值和高置信度估值。仅依赖 suburb median、基础房屋字段和少量公开成交, 只能给出 Medium confidence。若要提升到 Medium-High 或 High, 必须补齐以下三类验证。

### 5.1 Current condition evidence

目的: 确认房屋当前状态, 避免只根据旧 listing 描述估值。

字段:

- `current_photo_set`: 当前室内外照片
- `current_condition_rating`: 1-5
- `renovation_since_last_sale`: yes / no / unknown
- `deferred_maintenance_risk`: none / minor / moderate / major
- `structural_risk_notes`: qualitative notes
- `floorplan_functionality_rating`: 1-5
- `inspection_notes`: agent inspection, building inspection, or manual notes

影响:

- 状态优于同类可比房: positive adjustment
- 状态普通: baseline
- 有明显维护、结构、潮湿、屋顶、地基或布局问题: negative adjustment

### 5.2 Title, planning and legal constraints

目的: 检查土地和产权是否存在影响价值、开发潜力或贷款接受度的限制。

字段:

- `title_type`: freehold, strata, company/share title, other
- `zoning`
- `planning_overlays`
- `heritage_overlay`
- `easements`
- `restrictive_covenants`
- `flood_overlay_or_risk`
- `bushfire_overlay_or_risk`
- `vegetation_or_tree_controls`
- `development_constraints_notes`

影响:

- 无明显限制: baseline
- 有 heritage / easement / covenant / overlay 但不严重: small negative or development-specific adjustment
- 明显限制建筑、扩建、分割或贷款: material negative adjustment

### 5.3 Complete recent comparable sales set

目的: 不只看 2-3 个公开样本, 而是建立完整的 comparable sales pool。

MVP 要求:

- 时间范围: 最近 3 个月权重最高; 最近 6 个月为主; 必要时扩展到 12 个月
- 地理范围: 同 suburb 优先, 同 school zone / same micro-location cluster 优先
- 房产类型: House only
- 土地范围: target land size +/- 20% 为主
- 房型范围: bedrooms, bathrooms, car spaces 接近
- 状态范围: condition / renovation level 接近
- 排除项: main road, townhouse, duplex, new luxury build, compromised location, unless used as adjustment evidence

字段:

- `comparable_sales_count`
- `comparable_sales_selected`
- `comparable_sales_excluded`
- `selection_reason`
- `adjustment_reason`
- `sale_date`
- `sale_price`
- `price_per_sqm_land`
- `time_adjustment`
- `land_adjustment`
- `building_adjustment`
- `condition_adjustment`
- `micro_location_adjustment`

置信度规则:

- Low: 少于 3 个可比成交, 或关键字段缺失
- Medium: 有 3-5 个可比成交, 但房况或规划信息不完整
- Medium-High: 有 5+ 个可比成交, 当前房况基本确认, 规划/title 风险无重大异常
- High: 有完整近期成交池, 当前房况确认, title/planning/easement/overlay 已核查, 且估值区间被多组可比房支持

### 5.4 Comparable recency weighting

Comparable sales 是估值的核心锚点。对于 Metropolitan Melbourne house MVP, 最近 3 个月成交的权重最高, 且 comparable evidence 在整体估值判断中至少占一半。

推荐时间权重:

- Sold within 0-3 months: 1.00
- Sold within 3-6 months: 0.75
- Sold within 6-12 months: 0.50
- Sold older than 12 months: use only as weak context or exclude unless market has very low turnover

Comparable similarity score:

```text
Comparable Weight
= Recency Weight
× Location Similarity
× Property Similarity
× Condition Similarity
× Data Reliability
```

Location similarity:

- Same street / same pocket: highest
- Same school zone / same micro-location cluster: high
- Same suburb but different pocket: medium
- Adjacent suburb: low, only if insufficient same-suburb evidence

Property similarity:

- Land size within +/- 10%: highest
- Land size within +/- 20%: high
- Similar bed / bath / car: high
- Different property type or materially different land use: exclude

Rule:

```text
The final baseline should be driven primarily by recent comparable sales.
Micro-location, land, building, condition and risk factors adjust the baseline;
they should not override strong recent comparable evidence without explanation.
```

Dynamic comparable influence:

Comparable sales 的整体影响权重需要根据 6 个月内样本质量动态调整。

- Strong recent evidence:
  - 6 个月内有 5+ 个高质量可比成交
  - 或 6 个月内有 3+ 个高质量可比成交且包含同街 / 同 pocket / 同 school zone 样本
  - Comparable influence should be at least 60%-70%

- Normal recent evidence:
  - 6 个月内有 3-5 个可比成交
  - 样本质量中等, 但足以建立 baseline
  - Comparable influence should be 55%-65%

- Weak recent evidence:
  - 6 个月内少于 3 个可比成交
  - 或样本差异较大, 需要扩展到 12 个月
  - Comparable influence may reduce to 45%-55%, with wider valuation range and lower confidence

- Insufficient evidence:
  - 12 个月内仍缺少有效可比成交
  - Comparable influence cannot be trusted as primary anchor
  - Use suburb trend, older sales, broader area evidence, and manual review; confidence should be Low or Low-Medium

## 6. Valuation Model Revision

修正后的 House MVP 估值模型:

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

Comparable Sales Baseline 是估值锚点。第一阶段建议:

- Comparable sales influence:
  - Strong recent evidence: 60%-70%
  - Normal recent evidence: 55%-65%
  - Weak recent evidence: 45%-55%
- Micro-location adjustment: 10%-15%
- Land adjustment: 10%-15%
- Building utility adjustment: 8%-12%
- Current condition adjustment: 5%-10%
- Planning / title risk: penalty-based, normally 0%-5% unless material issue exists

这些权重用于指导模型解释和校准, 不是简单线性相加。系统必须先由 recent comparable sales 建立 baseline, 再做 adjustment。

### 6.1 调整顺序

1. 先筛选 comparable sales pool
2. 用最接近的 3-6 个成交建立 baseline, 优先使用最近 3 个月成交
3. 对成交日期做 time / market adjustment
4. 对土地面积、房间数、浴室数、车位、建筑状态做 property adjustment
5. 对 street grade、walkability、traffic、tree canopy 等做 micro-location adjustment
6. 对 title、overlay、easement、heritage、flood/bushfire 等做 risk adjustment
7. 输出估值区间和 confidence level

### 6.2 输出必须解释

每次估值输出必须包含:

- Estimated value range
- Model midpoint
- Confidence level
- Key comparable sales
- Positive adjustments
- Negative adjustments
- Missing data
- What would change the valuation

## 7. Back-testing Method

系统需要通过最近已成交房产验证模型准确度。Back-test 不是简单事后解释成交价, 而是模拟真实估值场景。

### 7.1 核心原则

对每一个已成交样本:

1. 把该房产当作 target property
2. 暂时隐藏它的真实成交价
3. 只使用成交日之前可获得的数据
4. 用模型生成估值区间和 midpoint
5. 再揭示真实成交价
6. 对比误差、命中率和偏差原因

### 7.2 样本选择

优先选择:

- Recently sold houses
- Same suburb or micro-location cluster
- Sold within recent 3-12 months
- 有足够字段: address, land size, bed / bath / car, sale date, sale price
- 房产类型清晰: house only

排除或单独标记:

- Townhouse / unit / villa
- Development site
- Knockdown-only sale
- Brand-new luxury build
- Main-road compromised property
- Unusual title / legal constraint
- Missing land size or room data

### 7.3 回测可比房规则

对某个成交样本进行回测时, comparable sales pool 必须满足:

- Sale date earlier than target sale date
- Same suburb preferred
- Same school zone / micro-location cluster preferred
- Land size within target +/- 20% preferred
- Similar bed / bath / car preferred
- Same property type: house only
- Exclude direct use of target's own sale price

若成交日前可比样本不足:

- 时间范围从 6 个月扩展到 12 个月
- 地理范围从同街/近街扩展到 same suburb
- 置信度自动下调

### 7.4 回测输出指标

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

公式:

```text
Error Amount = Model Midpoint - Actual Sale Price
Error Percentage = Error Amount / Actual Sale Price
Range Hit = Actual Sale Price is within Estimated Value Range
```

### 7.5 汇总指标

每个 suburb / model version 输出:

- Number of back-test samples
- Range hit rate
- Median absolute percentage error
- Mean absolute percentage error
- Overestimate rate
- Underestimate rate
- Error by confidence level
- Error by street rank band
- Error by property condition
- Error by land size band

### 7.6 模型修正逻辑

若回测发现系统性偏差:

- 长期低估 Top 10% / Top 25% streets: 提高 micro-location factor 或 street rank premium
- 长期高估大地但旧房: 降低 land-only premium, 提高 condition / rebuild-cost sensitivity
- 长期低估新房或高端翻新: 提高 building utility / condition factor
- 长期高估近主路房: 加大 negative externality penalty
- 长期高估资料缺失房: 降低 confidence 并扩大估值区间

### 7.7 Back-test evidence requirements

- The target sale price must be hidden when the estimate is generated.
- Every comparable must retain a settled-price source URL and sale date.
- The model version, inputs and adjustment output must be reproducible.
- Portal AVM estimates must not be used as the target value or as a substitute for settled comparable evidence.
- Accuracy claims may only be published after an independently reproducible back-test dataset exists.
