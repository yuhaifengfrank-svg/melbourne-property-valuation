# VALUATION V2 DESIGN

> 估值分层降级方案 + 类型隔离加固
> v0.1 — 设计 + 影响评估，尚未实现
> Date: 2026-06-10

---

## 设计目标

1. **永远返回一个估值** — 从不返回 "no estimate" 或 valuation: null
2. **从不混合 House 和 Unit comparables** — 不同类型严格隔离
3. **估值精度优先于估值数量** — 精度不够时降置信度而非降类型要求

---

## Level A — 精确匹配

**条件**: 同 suburb + 同 propertyType + 最近成交

```
subject: Glen Waverley, House, 4br, 2ba, 650sqm
  ↓
DB: matchSuburbType("Glen Waverley", "House") → 返回 ≥3 条
  ↓
引擎: validateComparable + scoreComparable → 正常估值
```

**变化**: 无改动。当前 `db-comparable-source.js` Level A 逻辑正确。

**预期命中率**: ~90% suburb（225/230 有 ≥3 House 记录）

---

## Level B — 同类型 + 扩大半径

**条件**: 同 propertyType + 坐标半径扩大或 suburb 模糊匹配

### 实现方案

```js
// 新逻辑: matchSuburbTypeOrRadius
if (rows.length < 3) {
  // 同 suburb + 同类型 + 按坐标 5km 半径排序
  rows = await matchSuburbTypeRadius(suburb, state, type, coords, limit);
}
if (rows.length < 3) {
  // 附近 suburb 前缀匹配 + 同类型
  rows = await matchSuburbPrefixType(suburb, state, type, limit);
}
```

⚠️ 当前 `comparable_sales` 表中 80% 记录没有坐标（lat/lon 字段是后来加的）。需要：

- Phase 1: 用 Google Geocoding API 或 local geocode 补充存量数据坐标
- 或者：改为 suburb 前缀模糊匹配（已有 `matchSuburb` 的前缀逻辑）

**更务实的 Level B 方案（无需坐标）**：

```js
// 同 suburb + 同类型 + 放宽日期（从 365 天扩到 730 天）
if (rows.length < 3) {
  rows = await matchSuburbType(sql, suburb, state, type, maxResults, 730);
}
// 同类型 + 前缀 suburb 匹配（Mordialloc → Mordialloc+）
if (rows.length < 3) {
  rows = await matchPrefixSuburbType(sql, suburb, state, type, maxResults, maxAgeDays);
}
```

**预期提升**:
- 日期扩到 2 年：在低频 suburb 中多 10-15% 记录
- 前缀匹配：在多词 suburb 中（如 Brighton East → Brighton）多 5-8%

---

## Level C — Suburb Median 模型

**条件**: 无同类型可比成交

### 实现方案

用 `suburb_snapshots` 表或实时计算的中位价 + 特征调整：

```
base_price = median_price_for_type(suburb, state, propertyType)
  ↓
factor_adjustments:
  - bedrooms: ±2% per bedroom vs median
  - bathrooms: ±1% per bathroom vs median
  - land_size: log ratio × 0.08 (同现有逻辑)
  - market_momentum: (同现有因子)
  - education: (同现有因子)
  - census_consistency: (同现有因子)
  ↓
estimate = base_price × (1 + sum(factors))
range = midpoint ± 12-18% (置信度 Low-Medium)
```

### 数据要求

需要 DB 中有 `suburb_medians_by_type` 视图：

```sql
CREATE MATERIALIZED VIEW suburb_medians_by_type AS
SELECT
  suburb,
  state,
  property_type,
  COUNT(*) as sale_count,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) as median_price,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY sale_price) as q1_price,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY sale_price) as q3_price,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bedrooms) as median_bedrooms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY land_size_sqm) as median_land_size
FROM comparable_sales
WHERE verification_status IN ('cross_source_verified', 'single_source_observed')
  AND sale_price IS NOT NULL
  AND sale_date >= CURRENT_DATE - INTERVAL '2 years'
GROUP BY suburb, state, property_type;
```

### 预期覆盖

从 DB 数据看：
- House 中位价: 225/230 suburb 可用
- Unit 中位价: ~100/230 suburb 可用（需要更多数据）
- Townhouse 中位价: ~80/230 suburb 可用

对于数据不足的类型，按类型比例推算（如 Unit price ≈ 0.65 × House median）。

**置信度标签**: Low（标准差 > 20%）到 Medium（标准差 < 15%）

---

## 三级健康检查

每次估值时记录：

```
{
  level: "A" | "B" | "C",
  compCount: N,
  typeMatch: "exact" | "prefix" | "median",
  confidence: "Medium" | "Low-Medium" | "Low"
}
```

— 为以后打日志分析各层命中率用。

---

## 改动文件清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `lib/valuation-service.js` | 整合三级 fallback 到 `runValuation` |
| 2 | `lib/valuation-engine.js` | 新增 `estimateFromSuburbMedian(subject, medianData)` |
| 3 | `lib/db-comparable-source.js` | 新增 `fetchMedian(suburb, state, type)` |
| 4 | `lib/db-comparable-source.js` | `matchSuburb` 加类型过滤参数（可选） |
| 5 | `lib/browser-collector.js` | `inferPropertyType` 读 Domain 页面类型标签（非仅地址） |
| 6 | `lib/browser-collector.js` | REA 解析硬编码默认 House → 强制推断 |
| 7 | `lib/db-schema.js` | 新增 `suburb_medians_by_type` 物化视图 |
| 8 | `lib/refresh-suburb-metrics.js` | 刷新中位价视图 |
| 9 | `api/valuation.js` | 更新 response 格式包含 level 信息 |

---

## 改动细则

### Fix 1: browser-collector.js — REA 默认 House（关键修复）

**当前**（L100）：`propertyType: "House"` 硬编码

**改为**：

```js
// 先用 inferPropertyType 从地址推断；如果有明确页面标签覆盖它
const inferredType = inferPropertyType(address);
const s = {
  address, price,
  propertyType: inferredType,  // 不是硬编码 House
  ...
};
// 后续 loop 中标配覆盖：if (/^(House|Townhouse|...)$/i.test(l)) s.propertyType = l;
// 覆盖逻辑不变（页面标签优先于地址推断）
```

### Fix 2: browser-collector.js — Domain 读类型标签

**当前**：纯 `inferPropertyType(address)`

**改为**：同时在 Domain 解析 loop 中扫描类型关键词（跟 REA 一样做关键词匹配）：

```js
// 在 parseDomainSold 的 loop 中加一行
if (/^(House|Townhouse|Apartment|Unit|Villa|Land)$/i.test(l)) s.propertyType = l;
```

### Fix 3: db-comparable-source.js — Level B/C/D 加类型过滤

**当前**：`matchSuburb(suburb, state)` 不传 propertyType

**改为**：加可选类型过滤参数，语义为「优先同类型，同类型不足时放宽」：

```js
// matchSuburb 加可选 type 参数
async function matchSuburb(sql, suburb, state, type, limit, maxAgeDays) {
  let rows;
  if (type) {
    rows = await matchSuburbType(sql, suburb, state, type, limit, maxAgeDays);
  }
  if (!rows || rows.length < 3) {
    rows = await sql`...`;  // 不加类型过滤
  }
  return rows;
}
```

### Fix 4: valuation-service.js — 三级整合

**当前**：Level A + Level B 合并后直送引擎，不足时返回 "no-comparables"

**改为**：

```js
async function runValuation(params) {
  // ... 采集 comps（现有逻辑不变）...

  // 三级 fallback
  if (comps.length < 3) {
    const levelB = await getLevelBComps(subject, state, type);
    comps = mergeUnique(comps, levelB, maxResults);
  }
  if (comps.length < 3) {
    const levelC = await getLevelCMedian(subject, state, type);
    // Level C 不走引擎的 comparable 评分，直接估值
    return estimateFromMedian(subject, levelC);
  }

  // 正常走引擎
  const valuation = valueProperty({ subject, comparables: comps, ... });
  return valuation;
}
```

### Fix 5: valuation-engine.js — 中位价估值函数

```js
export function estimateFromSuburbMedian(subject, medianData) {
  if (!medianData || !medianData.median_price) {
    return {
      ok: false,
      status: "no-median-data",
      estimate: null,
      confidence: { label: "Low", dataScore: 0 }
    };
  }

  const basePrice = medianData.median_price;
  const factors = calculateMedianFactors(subject, medianData);
  const midpoint = Math.round(basePrice * (1 + factors.total));
  
  // 上下浮动 15%，降置信度
  return {
    ok: true,
    status: "suburb-median-estimated",
    estimate: {
      midpoint,
      low: Math.round(midpoint * 0.85),
      high: Math.round(midpoint * 1.15),
      anchor: basePrice,
      factorTotal: factors.total,
      factorAdjustments: factors.applied
    },
    confidence: {
      label: "Low",
      dataScore: Math.max(20, Math.min(45, medianData.sale_count * 3)),
      reasons: [
        `Suburb median model: ${medianData.sale_count} sales in ${medianData.property_type} pool`,
        "Wider range (15%) due to model-based estimate"
      ]
    },
    acceptedComparables: [],
    modelVersion: "1.0.0"
  };
}
```

---

## 影响评估

### 对精度的影响

| 层级 | 预期精度 | 覆盖范围 |
|------|---------|---------|
| Level A (exact) | ±8-12% | ~90% |
| Level B (radius) | ±10-15% | ~95% |
| Level C (median) | ±15-20% | ~99% |

### 对用户体验的影响

- **正面**: 永远有返回值，不再 "no estimate"
- **负面**: Level B/C 的置信度标记为 Low，可能降低信任感
- **tradeoff**: 有估值+低置信 永远好过 无估值

### 对性能的影响

- Level C 是单次 DB 查询 + O(1) 计算，性能影响为 0
- Level B 的 suburb 前缀匹配 + 类型过滤也是索引查询
- 总和请求延时增加 < 50ms

---

## 不在此范围的事

- **实时网页采集改进**（网站反爬策略独立处理）
- **类型预测模型**（用 ML 判断记录的真实 propertyType）
- **坐标补充**（大量纬度缺失，需要单独 geocode 管线）
- **Unit/Apartment 子类型细分**（Studio / 1br / Penthouse 等）

---

## 实施建议

1. **先修 Fix 1-3**（采集+DB fallback 类型隔离）→ 1 天
2. **再修 Fix 4-5**（三级 fallback + median 模型）→ 1 天
3. **部署后监控** Level B/C 命中率和置信度分布 → 1 周
4. **然后考虑** Unit/Apartment 细分和坐标补充

当前最大的精度瓶颈其实是**采集阶段的类型误标**，修复它会同时在 Level A 和 Level B 提升准确性。Median 模型是兜底——填补最后 5-10% 的 "no estimate" 场景。
