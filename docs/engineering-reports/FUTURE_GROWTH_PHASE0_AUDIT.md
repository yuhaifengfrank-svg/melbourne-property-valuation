# Phase 0 — Future Growth Outlook Audit Report

**Date:** 2026-06-11  
**Author:** 玄甲  
**Status:** ⛔ STOP — Issues found; Phase 0A corrections applied  
**Commit analyzed:** `e101d72`  
**Latest commit:** `d236f9b` → Phase 0A commit incoming  

---

## 一、当前模型完整公式

### 实际线上评分流

```
API GET /api/opportunity?strategy=smart
→ SELECT ... FROM suburb_metrics ORDER BY opportunity_score DESC
→ 完全不读 strategy 参数
```

### opportunity_score 实际计算 (opportunity-scoring-v2.js)

```
opportunityScore =
  undervaluation * 30% +
  growth_1y/3y/5y * 25% +
  gross_yield * 15% +
  vacancy * 15% +
  school_score * 10% +
  confidence * 5%
```

### growth_1y/3y/5y 实际来源 (growth-projector.js)

```
growth_3y = clamp(baseAnnualRate × elasticity × macroAdj, -8%, +25%)
growth_5y = clamp(baseAnnualRate × elasticity × macroAdj × 0.92, -5%, +20%)
growth_1y = method==='D' ? null : baseRate
```

### baseAnnualRate 三级

| 方法 | 数据 | 覆盖 |
|------|------|------|
| A: 自区 OLS | 136天内 ≥3笔/周 | 少数高频交易区 |
| B: 同价位 pooled | 136天内 ≥3笔/周 | 大部分 |
| C: 全市场 | 全市场 136天 | 极少 |
| D: VGV CAGR | govt_5yr_cagr 字段 | 数据不足区 |

---

## 二、当前字段真实含义

| 字段名 | 文档声称 | 实际含义 | 差异等级 |
|--------|---------|---------|---------|
| `growth_1y` | "Projected 1-year price growth %" | 过去136天周度OLS趋势×弹性×宏观。部分区是null（VGV法） | ⚠️ 不是"1年"，是"136天OLS按年化率" |
| `growth_3y` | "Projected 3-year CAGR %" | 年化OLS×弹性×宏观，被 clamp 在 [-8%, +25%]。**这是模型年化率字段，不是3年累计涨幅** | 🔴 不是CAGR，是年化线性趋势×宏观。上限25%导致大量区固定值25% |
| `growth_5y` | "Projected 5-year CAGR %" | growth_3y × 0.92，被 clamp 在 [-5%, +20%]。**这是模型年化率字段，不是5年累计涨幅** | 🔴 不是独立推算，只是 growth_3y × 0.92。上限20%导致固定值20% |
| `undervaluation` | "价格洼地因子0-100" | 从 median_house_price 分档打分。< $500K=90-100, < $750K=70-89, ... | ⚠️ 低价直接等于"被低估" |
| `opportunity_score` | "综合机会分" | 6因子加权，growth占主导。39个区growth_1y=30, growth_3y=25, growth_5y=20 | 🔴 growth_3y=25是clamp上限造成的 |
| `opportunity_type` | "策略分类" | 主要按 threshold 判定，growth优先 | ⚠️ 大量区被标 Growth 不是因为真实增长 |
| `confidence` | "数据可信度" | 直接加入总分5%权重 | 🔴 Confidence 不应该加权进机会分 |
| `population_growth` | "人口增长率" | 绝大多数为 NULL | 🔴 字段名暗示已有数据，实际几乎全空 |
| `vacancy_rate` | "空置率" | SA2 G36 2021普查未居住房屋占比 | ⚠️ 这是空置率proxy，不是实际出租空置率 |
| `conf_population` | "人口置信度" | 从 age_0_4 + age_5_14 占比推算 | ⚠️ 不是人口增长，是年轻人口比例 |

---

## 三、关键发现

### 1. 🔴 growth_3y = 25 是达到模型上限的截断输出

线上 API 返回 50 个区中 39 个 `growth_3y=25`，39 个 `growth_5y=20`。  
原因：`growth-projector.js` 中 `growth_3y = clamp(..., -8, 25)`，`growth_5y = clamp(..., -5, 20)`。  
这些值是 clamp 上限的输出，不具备区域区分度，不适合作为可靠预测。

**证据：**
- Clyde North (均价$770K) → growth_3y=25
- Dandenong (均价$446K) → growth_3y=25  
- South Yarra (均价$661K) → growth_3y=25

三个价格截然不同、位置各不相同区的 growth_3y 完全一样，说明达到了模型限制。

### 2. 🔴 strategy 参数不改变排序

`api/opportunity.js` 第 62 行：

```sql
ORDER BY opportunity_score DESC
```

传 `?strategy=value`、`?strategy=growth`、`?strategy=cashflow` 全部返回相同顺序。  
`getWeightsV2(strategy)` 只在 `opportunity-scoring-v2.js` 的 `scorePropertyV2()` 中使用——那是 per-property 评分，不是 suburb_metrics 的排名。

### 3. 🔴 Confidence 直接增加了评分

`computeSuburbScore(m)` 中：

```javascript
confidenceScore = (u > 0 && g3 > 0 ? 40 : 20) + (g5 > 0 ? 30 : 10) + (s > 0 ? 30 : 10);
// finalScore = ... + confidenceScore * 0.05
```

数据有的区额外+5分。这违反了 Confidence 应该单独显示，不应增加机会分的原则。

### 4. 🔴 growth_3y/growth_5y 含义严重误导

文档称："Projected 3-year / 5-year CAGR %"。  
实际上：
- 不是 CAGR（不是年复合增长率）
- 不是未来预测
- 是短窗口 OLS 线性趋势 × 弹性系数 × 宏观调整
- 被 clamp 到 [-8%, 25%] 和 [-5%, 20%]，大量数据被截断

### 5. 🟡 Vacancy 数据来自 2021 Census

`vacancy_rate` 来自 SA2 G36（未居住房屋占比），不是实际出租空置率。  
12 个无 SA2 映射的郊区用全州均值填充。  
文档标注了"Vacancy proxy"，但页面没有说明数据来自 2021 年普查。

### 6. 🟡 低价 = 低估的逻辑

`calcUndervaluationV2()` 中：
- 中位价 < $500K → score 90-100
- 低价区直接获得高 undervaluation 分

没有考虑：
- 为什么便宜（基本面弱？就业差？供应过量？）
- Price/Income 比率
- 通勤距离

### 7. 🟡 VGV 数据（待核验）

`govt_5yr_cagr` 相关 provenance 需确认：
- 实际来源：ABS SA2 5 年 CAGR
- **待核验事项**：
  - 数据文件的具体下载 URL 和 release 编号
  - 文件 checksum 是否有效
  - 实际下载日期
  - mapping 方法（SA2→suburb）和覆盖率
  - 是否包含 house/unit/land 分类

### 8. 🟢 Infrastructure 和 Supply Constraint 已建字段但未入主评分

`infrastructure_score` 和 `supply_constraint_score` 存在，但 `computeSuburbScore()` 不读这两个字段。  
只在 `classifyOpportunityV2()` 中用于判定 Infrastructure Opportunity 类型。

---

## 四、线上 vs 文档差异

| 方面 | 文档声称 | 线上实际 |
|------|---------|---------|
| Top Growth 页面 | "Ranked by weighted 1, 3 and 5-year price growth" | 直接按 opportunity_score DESC 排序。opportunity_score 含 undervaluation 30% + 其他因子 |
| strategy 参数 | 支持 smart/growth/value/cashflow/school | 全部返回相同排序 |
| growth_3y | "Projected 3-year CAGR" | 136天OLS年化率被clamp，大量区固定25%。实际是模型年化率字段，不是3年累计涨幅 |
| 因子数量 | 6因子 | undervaluation实际是price_tier_to_score映射 |
| 数据日期 | 无标注 | 未显示数据来源和时效 |

---

## 五、当前数据缺失及默认值

| 字段 | 缺失数/总数 | 默认值 |
|------|-----------|--------|
| growth_3y | 7/50 区 null | -8 (clamp下限) |
| growth_1y | 7/50 区 null | - |
| median_unit_price | 若干区 null | - |
| population_growth | 几乎全 null | - |
| supply_constraint_score | 未知 | - |
| infrastructure_score | 未知 | - |
| conf_* 字段 | 未知 | - |
| vacancy_rate (12个区) | 12 | 全州均值 |

---

## 六、重复计算风险

1. ✅ `growth_3y` 和 `growth_5y` 非独立（growth_5y = growth_3y × 0.92）而非两个独立推算
2. ✅ `calcGrowthScoreV2()` 中同时加权 `g1 + g3×2 + g5×2`，但 g3 和 g5 高度关联
3. 🟡 `calcRentalScoresV2()` 中 yield 从 `gross_yield` 计算，但 `gross_yield` 又从 `median_house_rent / median_house_price` 计算

---

## 七、strategy 排序问题

```javascript
// opportunity-scoring-v2.js
function getWeightsV2(strategy) {
  // 修改权重
}

// scorePropertyV2(sale, metrics, strategy) 中调用了 getWeightsV2
// 但 scanOpportunitiesV2() → sale-level 评分 → 按机会分排名

// api/opportunity.js 中 SELECT ... ORDER BY opportunity_score DESC
// 完全不使用 strategy 参数
```

**结论：** `getWeightsV2()` 仅用于 `scorePropertyV2()`（per-property 评分），该路径在 `scanOpportunitiesV2()` 中被调用。  
但线上 API `api/opportunity.js` 直接读 `suburb_metrics.opportunity_score`，是预先算好的固定值，strategy 无效。

---

## 八、数据源审计

### 已接入

| 源 | 状态 | 备注 |
|----|------|------|
| VGV Median Prices | ✅ | 230 suburb，来源及数据期待核验 |
| ABS Census G02/G36/G41 | ✅ | 2021数据，部分区无SA2映射 |
| SEIFA IRSD/IEO | ✅ | 2021数据 |
| ACARA School | ✅ | 年度更新 |
| RBA Cash Rate | ✅ | 月更新 |
| comparable_sales | ✅ | 约4,252条 |
| **SALM (DEWR)** | **已入库** | 已写入部分 suburb_metrics 字段，**但未进入当前 opportunity_score** |

### 未接入（但被需求要求）

| 源 | 对模型重要性 | 缺失影响 |
|----|-------------|---------|
| VIF (未来人口/家庭) | 🔴 核心 | Demand 无法计算 |
| ABS ERP (实际人口) | 🔴 核心 | 无法验证 VIF 路径 |
| ABS Building Approvals | 🔴 核心 | Supply 无法计算 |
| SALM (就业/失业) | 🟡 补充 | 已入库未使用，数据完整但未接入评分 |
| VPA PSP | 🟡 重要 | Supply 缺少中长期规划 |
| VicPlan Zoning | 🟡 重要 | Supply 缺少开发限制 |
| VicBigBuild | 🟡 重要 | 基础设施驱动 |

---

## 九、Phase 0A 修正内容

已验证修正：

| 修正项 | 状态 |
|--------|------|
| ✅ "假数据" → "达到模型上限的截断输出，不具备区域区分度" | 已改 |
| ✅ 136周 → 136天 | 已改 |
| ✅ SALM 状态 → "已入库，写入部分 field，未进入 opportunity_score" | 已改 |
| ✅ 删除"14个免费数据源均已完成许可审计"不实声明 | 已改 |
| ✅ VGV 可靠性 → 标注待核验 | 已改 |
| ✅ growth_3y/5y → 明确是模型年化率字段，不是3年/5年累计涨幅 | 已改 |

### 线上止误导修正

| 修正项 | 涉及文件 | 状态 |
|--------|---------|------|
| ✅ 移除 "forecast price appreciation" 措辞 | public/index.html, public/top-growth-suburbs-victoria.html | 已改 |
| ✅ 移除 "Projected CAGR" / "forecast" / "prediction" | trust-layer.js, factor-breakdown.js | 已改 |
| ✅ Top Growth 页添加实验性提示 | public/top-growth-suburbs-victoria.html | 已改 |
| ✅ strategy 非默认参数返回 unsupported_strategy | api/opportunity.js | 已改 |
| ✅ Opportunity Score 标注为 Beta 综合指标 | API meta | 已改 |
| ✅ 新增测试确认无误导措辞 | tests/ | 已改 |

---

## 十、建议 Migration 计划

（Phase 0A 完成前不执行）

1. Phase 1: 数据基础（VIF + ERP + BA + SALM + registry）
2. Phase 2: 评分 V1（Demand 40 / Supply 40 / Market Position 20）
3. Phase 3: API + 网站升级
4. Phase 4: 历史回测
5. Phase 5: 校准预测

---

## 十一、实施风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| VIF 下载后地理映射复杂 | 中 | 高 | 先确认SA2→suburb映射方法 |
| Building Approvals 地理层级不足 | 高 | 中 | SA2级可用，cluster suburb需pool |
| 回测前发布精确增长率 | 中 | 高 | Phase 0明确禁止精确百分比 |
| Strategy改排序破坏现有页面 | 中 | 高 | 保留兼容API，新增排序路径 |
| Vercel冷启动+DB query超时 | 低 | 中 | 缓存在Vercel Edge |

---

## 十二、修改文件清单

### 新增
- `docs/engineering-reports/FUTURE_GROWTH_PHASE0_AUDIT.md`

### 修改
| 文件 | 修改内容 |
|------|---------|
| `api/opportunity.js` | strategy=smart 默认；非 smart 返回 unsupported_strategy 状态码。Opportunity Score 标注为 Beta 综合指标 |
| `public/top-growth-suburbs-victoria.html` | 移除 "forecast price appreciation"，改为 "experimental market trend signal"；添加 Future Growth 模型开发中提示 |
| `public/index.html` | 移除 "forecast price appreciation" |
| `public/trust-layer.js` | 移除 "3yr CAGR" / "forecast" / "prediction" 措辞 |
| `output/v3/PHASE0_AUDIT_REPORT.md` | 已废弃，被 new location 取代 |

---

## ⛔ Phase 0A 完成 — 等待验收

当前状态：
- 审计报告已修订并移至 `docs/engineering-reports/`
- 线上止误导修改已部署
- strategy 非默认参数已标记
- 测试已通过
- 旧 URL 全部保持可用
