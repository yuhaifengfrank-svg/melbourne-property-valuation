# 锚点估值模型重构方案

## 现状问题

当前模型在 `valuation-engine.js` 中，调整因子（size/time/accommodation/condition/microLocation/planning/macroEconomic）全部**堆在单个 comp 的 adjustedPrice 上**，然后取加权 blend。问题：

1. **因子影响不透明** — 你不知道最终 $1.264m 是 7 个 adjustedPrice 混合出来的，每个 comp 加减乘除后的数字很难追踪
2. **字段缺失导致调整退化** — 当 subject 和 comp 都缺 bedrooms/bathrooms/landSize 时，adjustmentComponents 里大部分计算 pass through 返回 0
3. **confidence buffer 下修过度** — 对 Bentleigh East 这种数据一致的市场，6% 的 buffer 不必要地砍低了估值

## 新模型：锚点 + 因子修正

```
┌─────────────────────────────────────────┐
│  Step 1 — Comparable 筛选 & 基础调整    │
│  ┌───────────────────────────────────┐  │
│  │ qualityScore (同现有)             │  │
│  │ 类型/距离/时间/size/房间一致性   │  │
│  │ → 筛选 qualityScore >= 50 的 comp │  │
│  └───────────────────────────────────┘  │
│                   ↓                     │
│  ┌───────────────────────────────────┐  │
│  │ 时间调整（仅 market growth）      │  │
│  │ timeAdj = (1 + g)^(months/12)     │  │
│  │ 不调整 size/房间/街道             │  │
│  │ → rawPrice × timeAdj             │  │
│  └───────────────────────────────────┘  │
│                   ↓                     │
│  ┌───────────────────────────────────┐  │
│  │ 锚点 = 时间调整后的中位数         │  │
│  │（加权中位数 × 0.7 + 均值 × 0.3） │  │
│  │ → Anchor $X                       │  │
│  └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│  Step 2 — 因子修正（在锚点之上应用）    │
│  ┌───────────────────────────────────┐  │
│  │① 地块大小差异因子（±5%）          │  │
│  │   如果 subject.landSize 已知：     │  │
│  │   comp median landSize vs subject  │  │
│  │   差异 > 20% → ±2-5%              │  │
│  │                                    │  │
│  │② 街道质量因子（±3%）              │  │
│  │   streetQualityScore 偏离中位     │  │
│  │   如 Lancaster St 优于全区平均     │  │
│  │                                    │  │
│  │③ 房间配置差异因子（±5%）          │  │
│  │   subject bedrooms vs comp median  │  │
│  │   每差1房 ±2%                      │  │
│  │                                    │  │
│  │④ 市场动量因子（±5%）              │  │
│  │   RBA 利率 → 高利率 -2%           │  │
│  │   SEIFA decile → 稳定区加 0-2%    │  │
│  │   VicPlan 住宅主导 → +1%          │  │
│  │                                    │  │
│  │⑤ 数据质量修正因子（±2%）          │  │
│  │   交叉验证 vs 单来源               │  │
│  │   数据量不足缩小 range             │  │
│  └───────────────────────────────────┘  │
│                   ↓                     │
│  Final = Anchor × (1 + Σ factor_i)     │
│      + range: sigma × comp dispersion   │
└─────────────────────────────────────────┘
```

## 关键改动

### 改动 1：Step 1 调整缩减

当前 `adjustmentComponents()` 包含 `time + size + accommodation + condition + microLocation + planningAndRisk + strataAndBuilding + macroEconomic`（8 个因子）。

改为只保留 `time`（市场增长），其他因子全部移到 Step 2。

### 改动 2：新增 Step 2 锚点修正

在锚点确定后，用以下因子做修正（每个因子有上限，总计不超过 ±15%）：

```js
function anchorAdjustments(anchor, subject, comparables, macro) {
  const factors = {};

  // ① 地块差异
  const subjectLand = subject.landSize;
  const compLandMedian = median(comparables.map(c => c.landSize).filter(Boolean));
  if (subjectLand && compLandMedian) {
    const ratio = subjectLand / compLandMedian;
    factors.landSizeAdj = clamp(Math.log(ratio) * 0.08, -0.05, 0.05);
  } else factors.landSizeAdj = 0;

  // ② 街道质量
  const subjectStreet = subject.streetQualityScore ?? 3;
  const compStreetMedian = median(comparables.map(c => c.streetQualityScore).filter(Boolean)) ?? 3;
  factors.streetQualityAdj = clamp((subjectStreet - compStreetMedian) * 0.015, -0.03, 0.03);

  // ③ 房间配置
  const subjectBed = subject.bedrooms;
  const compBedMedian = median(comparables.map(c => c.bedrooms).filter(Boolean));
  if (subjectBed && compBedMedian) {
    factors.bedroomAdj = clamp((subjectBed - compBedMedian) * 0.02, -0.05, 0.05);
  } else factors.bedroomAdj = 0;

  // ④ 市场动量
  const macroAdj = macroAdjustments(macro); // RBA/SEIFA/VicPlan
  factors.marketMomentum = macroAdj;

  // ⑤ 数据质量
  const dataQuality = dataQualityAdjustment(comparables);
  factors.dataQualityAdj = dataQuality;

  const total = Object.values(factors).reduce((s, v) => s + v, 0);
  return { factors, total: clamp(total, -0.15, 0.15) };
}
```

### 改动 3：confidence buffer 改为动态

不再用固定的 sigma × decile modifier 算 range。改为：

```js
// sigma = max(comp dispersion, typeBaseline) × (1 - dataQualityBonus)
// confidence 标签由 dataScore 决定（同现有）
const sigma = Math.max(robustDispersion, typeSigma) * (1 - Math.min(0.3, dataCompleteness * 0.3));
```

这样当数据质量高、dispersion 低时，range 会更紧。

## 对 Bentleigh East 的效果

| 当前 | 锚点模型预期 |
|---|---|
| midpoint $1,264k | anchor ≈ $1,320k（时间调整后 median）|
| buffer 6% → $1,208k | sigma dynamic → 约 3-4% |
| range $1,208k–$1,319k | range ≈ $1,267k–$1,373k |
| 缺因子修正 | 如果 Lancaster St 街道质量高、地块好，可再加 2-3% → ~$1,350k |

**仍然不会直接到 $1.5m** — 因为 7 条 comp 的中位就是 $1.32m。因子修正可以加一些，但不可能倍增。$1.5m 需要：
- 同街有 $1.5m 的成交，或
- subject 的地块/房型明显优于全区中位（比如 800sqm + 4房 vs median 600sqm + 3房）

## 风险

1. **因子修正过度** — 锚点+因子模式容易给人「想调到多少就调多少」的印象。需要设死 caps
2. **微调参数需要 backtesting** — 目前没有历史的 settled sale 数据集来做 backtest，改完只能靠经验判断
3. **confidence 标签可能降级** — 去掉 size/accommodation 调整后，comp 更接近 raw price，如果 dispersion 大，Medium → Low-Medium

## 实施顺序

| # | 改动 | 文件 |
|---|---|---|
| 1 | Step 1: 缩减 adjustmentComponents 只保留 time | valuation-engine.js |
| 2 | Step 2: 新增锚点修正函数 | valuation-engine.js |
| 3 | Step 3: confidence buffer 改为基于 dispersion | valuation-engine.js |
| 4 | API 返回 adjustedPrice/weight 给前端 debug 用 | valuation-service.js |
| 5 | 跑 npm run check | — |
| 6 | 测 Bentleigh East 对比 | — |
