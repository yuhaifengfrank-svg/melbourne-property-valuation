# 增长推算模型 — 3年/5年增长率推算方案

## 问题

`comparable_sales` 只有最近 3-4 个月的密集数据（2026/03–2026/06），
之前的 sales 极度稀疏，无法直接用 YOY 同比计算 growth_3y 或 growth_5y。

## 思路

以近期数据为锚点，用宏观经济因子作为时间序列修正，通过**分层模型**反向推算中期增长率。

```
Suburb 年化增长率 = 基准趋势率 × 位置弹性系数 × 宏观周期修正
```

---

## 模型结构

### 第 1 层 — 基准趋势率（Base Rate）

从已有 sales 数据计算当前momentum。

**数据窗口：** 2026/03 – 2026/06（4 个月，230 个 suburb 均覆盖）

**方法 A：月度线性回归（高频区 ≥10 条/subs）**
- 对每个 suburb 按周粒度计算 log(price) 序列
- OLS 拟合：`log(price) = α + β × week + ε`
- 年化月率 = `(exp(β × 4.33) - 1) × 100`
- 适用：约 120 suburb（当月 ≥5 条的）

**方法 B：价格段聚合回归（中频区 3-9 条/subs）**
- 按 price tier 分组（<400K、400-600K、600-800K、800K-1.2M、>1.2M）
- 组内 pooled 回归：含 suburb fixed effect
- 拟合出的 β 作为该 tier 的共同趋势
- 适用：约 80 suburb

**方法 C：全量宏观平均（低频区 <3 条）**
- 不做 suburb 级回归，用全市场 median 趋势作为基准
- 适用：约 30 suburb（高端区、低交易量区）

### 第 2 层 — 弹性修正系数（Location Elasticity）

将 suburb 的静态特征转化为增长率调整系数。

**因子矩阵：**

| 因子 | 数据源 | 系数范围 | 逻辑 |
|------|--------|----------|------|
| Price Tier | suburb_metrics.median_house_price | 0.85 – 1.15 | 低价区弹性大，高价区弹性小 |
| School Score | suburb_metrics.school_score | 1.00 – 1.12 | ICSEA > 1100 有学区溢价 |
| IRSAD Decile | ABS SEIFA  | 0.90 – 1.10 | 高社会经济指数抗跌，但爆发力弱 |
| IER Decile | ABS SEIFA | 0.90 – 1.10 | 经济资源充足的区增长更稳 |
| 人口密度 | ABS ERP / km² | 0.90 – 1.05 | 内城更稳，外城波动更大 |
| 供给压力 | Vicmap PSA (optional) | 0.85 – 1.00 | 新开发多 → 供过于求压力 |

**弹性计算：**
```
location_elasticity = Σ(w_i × factor_i)
基准 = 1.0，范围 [0.80, 1.20]
长期看高分学校区的溢价更确定，短期看低价区的 momentum 更强
```

### 第 3 层 — 宏观周期修正（Macro Adjustment）

用宏观经济因子推算未来 3-5 年的周期位置。

**数据来源与建模：**

| 宏观因子 | 数据来源 | 建模方式 |
|----------|----------|----------|
| 现金利率 | RBA F1.1 | 利率曲线 → 房地产周期相位估计 |
| 住房贷款利率 | RBA F5 | 直接贷款成本 → 购买力影响 |
| CPI | ABS 6401.0 | 通胀 → 名义/实际增长调整 |
| 失业率 | ABS 6291.0 | 劳动力市场 → 住房需求 |
| 人口增长 | ABS ERP | 结构性需求增量 |
| GDP | ABS 5206.0 | 整体经济 → 财富效应 |

**周期相位识别（简称）：**
```
如果现金利率处于下行周期初期
  → macro_adj_3y = 1.05-1.10（宽松预期推动）
如果利率处于高位平台期
  → macro_adj_3y = 0.90-0.95（高成本抑制）
如果利率接近周期底部
  → macro_adj_3y = 1.10-1.15（进入扩张期）
```

**远期衰减（3y → 5y）：**
```
macro_adj_5y = macro_adj_3y × 0.9
（远期预测可信度自然衰减）
```

**低频区额外修正：**
```
macro_adj_3y_lowfreq = macro_adj_3y_standard × 1.15
（低频区受宏观影响更大，缺乏自身数据锚点）
```

---

## 计算公式总表

```
growth_3y_avg_annual = 基准趋势率 × location_elasticity × macro_adj_3y
growth_5y_avg_annual = growth_3y_avg_annual × 0.85

growth_3y (total) = (1 + growth_3y_avg_annual / 100)^3 × 基准价格 - 基准价格
growth_5y (total) = (1 + growth_5y_avg_annual / 100)^5 × 基准价格 - 基准价格
```

---

## 数据流（Pipeline）

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ comparable_sales │────▶│ 基准趋势率计算     │────▶│                 │
│ (最近4个月)       │     │ (A/B/C 三路回归)  │     │                 │
└─────────────────┘     └──────────────────┘     │  增长率汇总引擎   │
                                                 │                  │
┌─────────────────┐     ┌──────────────────┐     │  输出:            │
│ suburb_metrics  │────▶│ 位置弹性系数      │────▶│  growth_3y       │
│ (房价/学校/SEIFA) │     │ (价格段+学校+人口) │     │  growth_5y       │
└─────────────────┘     └──────────────────┘     │  growth_3y_conf  │
                                                 │  growth_5y_conf  │
┌─────────────────┐     ┌──────────────────┐     └─────────────────┘
│ RBA F1.1/F5     │────▶│ 宏观周期修正      │
│ ABS CPI/失业率   │     │ (相位识别+因子加权)│
└─────────────────┘     └──────────────────┘
     ↑ 外部 API 调用        RBA/ABS 数据
     (rba-client.js)       缓存在本地 DB 表
     (abs-client.js)
```

## 实施成本估算

| 阶段 | 文件 | 估算行数 | 依赖 |
|------|------|----------|------|
| 1. 宏观数据采集 & 缓存 | `lib/macro-data-cache.js` 或复用已有 client | ~150 | RBA/ABS API 调通 |
| 2. 基准趋势率计算 | `lib/growth-base-rate.js` | ~200 | comparable_sales |
| 3. 弹性系数计算 | `lib/growth-elasticity.js` | ~120 | suburb_metrics + SEIFA |
| 4. 宏观周期修正 | `lib/growth-macro-adj.js` | ~150 | 宏观数据 |
| 5. 增长推算引擎（集成） | `lib/growth-projector.js` | ~200 | 1-4 |
| 6. 整合到 refresh-suburb-metrics | 修改现有文件 | ~50 | 5 |
| 7. 新建宏观数据表 | `db/migration-004-macro.sql` | ~40 | Neon DB |
| **合计** | | **~910** | |

---

## 说明

1. 数据不足的区会标记 `conf` 字段（high/medium/low），前端可据此显示置信度
2. 3y / 5y 值随每次 nightly batch 刷新，数据积累越多越准
3. 宏观修正系数每周更新（RBA 数据一般每月更新一次）
4. 随着真实 sales 数据积累，模型权重会逐渐从「推算」偏向「真实 YOY」

