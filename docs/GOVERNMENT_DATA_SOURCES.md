# 澳洲政府公开数据源评估报告

> 系统性搜索ABS、RBA、VicPlan及各州/联邦政府的开放数据，评估整合到房地产市场模型的可行性。

---

## 1. 估值总署 (Valuer-General Victoria, VGV) 季度物业销售报告

### 数据内容
- **房屋/单元/空地**中位售价，按**suburb**颗粒度
- 含季度环比（%）和同比（%）变化
- 覆盖过去15个月的季度数据

### 可用文件（免费下载）
```
2025年Q3最新（2026年3月发布）：
  - PDF报告: vpsr-sept-2025-data-released-mar-2026.pdf (4.4MB)
  - Excel: median-house-q3-2025.xls  (230KB，按suburb)
  - Excel: median-unit-q3-2025.xls   (146KB，按suburb)
  - Excel: median-land-q3-2025.xls   (82.5KB，按suburb)
  
年度汇总2014-2024：
  - houses-by-suburb-2014-2024.xlsx  (247KB)
  - units-by-suburb-2014-2024.xlsx   (90KB)
  - land-by-suburb-2014-2024.xlsx    (33KB)
```

### Data.Vic 数据API
- CKAN API: `/api/1/util/snippet/api_info.html?resource_id=19ace27e-97b5-418f-b331-891c57d87fbc`
- **Creative Commons 4.0** 许可，商用可用

### 评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 🟢 免费 | ✅✅✅ | 完全免费，CC 4.0许可，可商用 |
| 🟢 颗粒度 | ✅✅✅ | Suburb级别，230+ Melbourne suburb全覆盖 |
| 🟢 时序长度 | ✅✅✅ | 年度数据2014-2024，季度数据15个月 |
| 🔴 时效性 | ⚠️ 季度延迟 | 上季度数据延迟约4-6个月发布（因验证周期） |
| 🔴 数据量稀疏 | ⚠️ | 高端区样本量少时中位价跳动大 |
| 🔴 可比性 | ⚠️ | Excel格式，非结构化，需手动下载合并 |

### 整合建议
**优先整合** — 可与已有 `comparable_sales` 形成互补：
- `comparable_sales` → 当前市场即时性价比（最新成交对比估值）
- VGV 季度中位价 → 中长期趋势验证源
- 写一个 `lib/vgv-loader.js` 脚本定期下载最新.xls，存入 `suburb_metrics` 表的 `govt_median_price` 和 `chg_12m` 字段
- VGV 数据可作为 growth-projector 的**校准/验证集**：对比模型3年增长率和VGV 2019-2024实际年化的差异

---

## 2. ABS 2021 Census SA2 数据包（已整合）

### 当前状态
✅ 已经下载了 G01-G17 全部19张表，选了9张核心表入 `census_sa2_data` JSONB 字段。

### 已使用的字段
| 表 | 字段 | 用途 |
|----|------|------|
| G01 | 总人口、居住人口 | 人口密度计算 |
| G02 | 中位年龄、出生地 | 人口画像 |
| G17 | 家庭中位收入、个人中位收入 | 收入水平评估 |
| G31 | 家庭中位周租金 | 租金指数计算 |
| G32 | 月度按揭中位数 | 还贷负担评估 |
| G34 | 总家庭数、有按揭家庭数、无按揭、租房家庭 | 住房结构分析 |

### 待补全的Census表

| 表编号 | 内容 | 用途 | 优先度 |
|--------|------|------|--------|
| G45 | 总住房数、空置住房数 | **空置率计算** | **高** |
| G43 | 住房类型（House/Unit/Apartment/Townhouse/其他） | 住房结构分析 | 中 |
| G37  | 按揭偿还和租赁偿还占总收入百分比（4分位） | 住房可负担性 | 中 |
| G47  | 车辆拥有数 | 交通便利度代理 | 低 |
| G40  | 就业行业分布 | 经济结构 | 中 |
| SEIFA | IRSD（社会经济指数）, IEO（教育机会指数） | 社区品质代理 | **高** |

### 评估
Census数据已是最佳免费数据源，但缺点是：
- **2021年数据**已过时约5年，2026年Census尚未发布
- Suburb颗粒度依赖SA2到suburb映射（`school_locations` 表已有 `sa2_code` 映射）
- SEIFA数据可在ABS官网下载CSV免费获取

### 整合建议
- **立刻补** G45 表做空置率计算（见第4节）
- **立刻补** SEIFA 数据（IRSD+IEO）到 `census_sa2_data`
- 写入 `refresh-suburb-metrics.js` 的夜间批处理
- 用于 scoring 引擎的 Vacancy 因子（当前得分不足）

---

## 3. ABS Indicator API（SDMX 标准）

### 端点
```
GET https://indicator.api.abs.gov.au/v1/dataflows/json   → 返回可用数据流列表
GET https://indicator.api.abs.gov.au/v1/metadata/{id}/json → 返回指定数据流元数据
```

### 需要 API Key
申请流程：填写申请表 → ABS审核 → 获取API Key

### 当前可获取的数据流（2026年）

| 数据流ID | 内容 | 可应用于模型 |
|----------|------|------------|
| CPI_H | 消费价格指数 (月度→季度) | 通胀调整 |
| CPIH | 住房消费价格指数 | 房产通胀度量 |
| LF_H | 劳动力调查 | 区域就业率 |
| BLDG_H | 建筑审批 | 供应侧前导指标 |
| TVD_H | 住宅总价值 | 全国房价趋势 |
| TVDS_H | 住宅总价值细分 | 各州房价趋势 |
| SALM | SA2级小区域劳动力市场 | **区域就业率** |

### 评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 🟢 数据维度 | ✅✅ | SDMX标准，覆盖关键经济指标 |
| 🔴 需要API Key | ⚠️ | 需要申请流程 |
| 🔴 Suburb颗粒度 | ⚠️ | SALM到SA2级别可用 |
| 🔴 实时性 | ✅ | 月度数据，月度发布 |

### 整合建议
- **SALM 数据**（SA2级的就业率）最有价值，可以直接用作 location elasticity 的修正因子
- **CPI住房指数**可用于市场调整因子中的真实增长调整
- 写 `lib/abs-indicator-client.js` 封装SDMX→JSON请求
- 在 `macro-loader.js` 中添加CPI和SALM的定时抓取

---

## 4. ABS 建筑审批数据（Building Approvals, Cat. 8731.0）

### 数据内容
- 每月住宅审批数量（house + unit/apartment）
- 按**州**、**SA4**区域可用
- 审批建筑总值
- 含季节调整和原始数据

### 获取方式
- 免费下载XLSX：https://www.abs.gov.au/statistics/industry/building-and-construction/building-approvals-australia/latest-release
- Victoria州为例：`87310023.xlsx`（Dwelling units approved in new residential buildings, number and value, original - Victoria）

### 评估
Good for supply-side trend but SA4-level is too coarse for suburb-level scoring.

### 整合建议
- 用作**宏观层调整因子**：Melbourne SA4的总审批量同比变化 → 调整 growth-projector 的市场调节系数
- 近期审批下降（2026年趋势）可作为市场冷却的信号因子

---

## 5. ABS 住宅物业价格指数 (RPPI, Cat. 6416.0)

### 数据内容
- 8大首府城市住宅价格指数（定基hedonic质量调整指数）
- 独立屋 vs. 公寓/联排
- 含中位价和交易量数据

### 获取方式
```
https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/total-value-dwellings/latest-release
```

### 整合建议
- 用 Melbourne & "Balance of Victoria" RPPI 月度变化作为 **growth-projector 的宏观调整参考值**
- 对比comparable_sales月度中位增速与官方RPPI，发现sub-market是否偏离

---

## 6. ABS 住宅总价值（Total Value of Dwellings, Cat. 6432.0）

### 下载
```
https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/total-value-dwellings/latest-release
643201.xlsx - 全国数据
643202.xlsx - 各州数据
```

### 整合建议
- 衡量澳洲住宅物业总市值，用作**宏观经济大盘因子**
- 季度住宅数量 × 中位价 = 总存量价值 → 反映整体市场深度

---

## 7. ABS 劳动力数据 (Labour Force, Cat. 6291.0)

### 关键子集

| 名称 | 颗粒度 | 更新频率 | 延迟 |
|------|--------|----------|------|
| Labour Force, Australia Detailed (6291.0) | 州、SA4 | 月度 | 约2周 |
| SALM (Small Area Labour Markets) | **SA2** | 季度 | 约3月 |
| Jobs and Skills Australia dashboards | 就业区域 | 月度 | 约4周 |

### 整合建议
- **SALM SA2级就业率** → 可直接 match `census_sa2_data` 表中的 `sa2_code`（已有映射）
- 高就业率 = 高的社区经济健康度 → scoring引擎的Positive信号
- 在`macro-loader.js`中增加SALM数据下载解析

---

## 8. APS 社会租户数据（提供空置率代理）

### 链接
``` 
https://www.housingdata.gov.au  → AIHW Housing Data Dashboard
```
含公租房、社区住房、等待名单数据。

### 整合建议
- Suburb级别的社会住房密度可作为**社区稳定性指标**
- 等待列表长度→区域住房需求紧迫度

---

## 9. 维多利亚城市规划数据（VicPlan + VPA）

### 当前已有
- **VicPlan API**：`/arcgis/services/PlanningZones/MapServer` — RESTful，可查询任意坐标的规划分区
- 已在 `vicplan-client.js` 中封装 `getZoningForCoordinates(lat, lng)` 方法

### VPA开放式数据（免费，更新版）
| 数据集 | 格式 | 内容 |
|--------|------|------|
| [VPA Precinct Boundaries](https://discover.data.vic.gov.au/dataset/vpa-precinct-boundaries) | GeoJSON, Shapefile | Melbourne growth area precinct boundaries |
| [VPA Open Data Portal](https://data-planvic.opendata.arcgis.com) | ArcGIS Online | VPA precinct structure plans, housing yield estimates |
| Urban Growth Boundary | WMS, Shapefile | Melbourne UGB 边界 |

### 新增潜在数据

| 数据集 | 内容 | 可用性 | 价值 |
|--------|------|--------|------|
| Greenfields Precinct Structure Plans | 新增住宅估算（lot yield） | ✅ 免费 | 🔥 **高** |
| Urban Growth Boundary | 增长边界位置 | ✅ 免费 | 🔥 **高** |
| Activity Centre Boundaries | 活动中心区划 | ✅ 免费 | 中 |
| Transport Overlay | 交通规划覆盖 | ✅ 免费 | 中 |

### 整合建议
- **Urban Growth Boundary**：suburb是否在UGB内 → 增长潜力分类（Infill vs Greenfields）
- VPA Precinct Structure Plans → **未来住房供应指标**（plan前 vs plan后的lot数量对比）
- 可写入 `suburb_metrics` 表的 `is_growth_boundary` 和 `planned_new_lots` 字段

---

## 10. 维多利亚土地信息（Vicmap）— 免费 + 付费

### 免费层
| 数据集 | 格式 | 说明 |
|--------|------|------|
| Vicmap Address | WFS/Shapefile | 所有维多利亚地址 |
| Vicmap Property | WFS/Shapefile | 产权边界 |
| Vicmap Admin Boundaries | WFS/Shapefile | LGA/SSC/SA边界 |

### 付费层（LANDATA）
- Property Sales History Report — $17.50/次
- Valuation Report — $17.50/次

### 评估
免费层适于地理空间分析，但产权边界数据不如直接通过 API 按坐标查询 VicPlan。

---

## 11. APS 联邦：National Housing Data Exchange

### 链接
```
https://housing-data-exchange.ahdap.org
```

### 可用数据集
- ABS Mesh Block 2021 人口和住房数（免费）
- NHHA 输出和成果数据
- 各州社会住房存量数据

### Mesh Block 数据价值
ABS官方只发布了Excel格式（12个工作表），但有社区整理的CSV版本：
```
https://github.com/carlhiggs/abs_mesh_block_counts_csv
```
包含：
- 各Mesh Block的居住人口
- 各Mesh Block的住房单位总数（occupied + unoccupied）
- 最细颗粒度的免费居住数据

**关键用途**：Mesh Block → SA1 → SA2 → Suburb聚合，可估算**空置率**（1 - 居住人口/住房数×平均家庭规模）

---

## 12. RBA 统计表格更新

### 已整合的
✅ 36个月 RBA现金利率 + 90天银行票据 → `macro_indicators` 表

### 新增可用表格
| 表号 | 名称 | 价值 | 频率 |
|------|------|------|------|
| D1 | Housing Credit Growth (月度) | 房贷增长 → 需求指标 | 月度 |
| D2.1 | Household and Business Balance Sheets | 家庭负债 → 按揭风险代理 | 月度 |
| E1 | Interest Rates (各种央行利率) | 参考利率（已接入） | 月度 |
| F1 | CPI （已在G4新增） | 房价调整的通胀因子 | 月度 |
| G4 | Consumer Price Inflation – Monthly | 月度CPI（2026年新版） | 月度 |

### 整合建议
| 表 | 用法 | 优先度 |
|----|------|--------|
| D1 住房信贷增长 | growth-projector 的宏观调整因子：信贷紧缩→调整下调 | **高** |
| D2.1 家庭资产负债表 | 用于Census一致性因子的补充验证 | 中 |
| G4 月度CPI | CPI月度数据替代季度数据，提升增长模型时效性 | **高** |

---

## 13. 南澳估价总署（Office of the Valuer-General SA）

### 免费数据
```
https://valuergeneral.sa.gov.au/News-and-Publications/publisheddataandstatistics
```
- 阿德莱德 metropolitan 中位房价，按suburb + 季度
- CSV格式可下载

### 评估
不适用于维多利亚市场，但方法可供参考。

---

## 14. 关键商业数据源（注意：均为付费）

以下为商业产品，信息仅供参考，不建议购买：

| 供应商 | 产品 | 价格 | 内容 |
|--------|------|------|------|
| CoreLogic / Cotality | 住宅价格指数 | ~$300+/月 | hedonic指数，suburb级，日度更新 |
| CoreLogic / Cotality | Suburb Scorecard | API付费 | 全套suburb统计指标 |
| PropTrack | 价格指数 | API付费 | 月度更新 |
| SIRCA (大学合作) | CoreLogic数据 | 学术许可 | 仅限研究用途 |

---

## 15. 优先整合路线图

综合所有数据源的评估，按**整合价值/实现成本**排序：

```
优先级 ⭐⭐⭐ (立刻做)
  1. G45 空置住房数据 → census_sa2_data 补全 → suburb_metrics.vacancy_rate
  2. SEIFA IRSD + IEO 数据 → census_sa2_data 补全 → 社区品质因子
  3. Abs-indicator-client 封装 SALM SA2 就业率 → 月度/季度更新 → 区域经济健康度

优先级 ⭐⭐ (本周做)
  4. VGV 季度中位价数据 loader（lib/vgv-loader.js）
     - 下载 median-house-q3-2025.xls (2026年3月发布)
     - 接入 refresh-suburb-metrics 夜间批处理
     - 用作 growth-projector 的校准验证集
  5. Urban Growth Boundary 数据 → suburb_metrics.is_growth_boundary
  6. RBA D1 住房信贷增长 → macro_indicators
  7. RBA G4 月度CPI → macro_indicators（替代季度CPI）

优先级 ⭐ (条件允许时)
  8. ABS 建筑审批 (8731.0) → 供给侧前导指标
  9. Mesh Block 住房数 → 更精确的空置率因子
  10. VPA Precinct Structure Plans → 未来住房供应量
```

### 模型影响矩阵

| 数据源 | 估值引擎 | Growth Model | 评分引擎 | 租金预测 | 风险分析 |
|--------|---------|-------------|---------|---------|---------|
| VGV 季度中位价 | 🔵校准 | 🔴校准 | - | - | - |
| G45 空置率 | - | - | 🔴核心因子 | 🔴核心因子 | 🔴核心因子 |
| SEIFA | 🔵辅助 | - | 🔵辅助 | - | 🔵辅助 |
| SALM就业率 | - | 🔵辅助 | 🔵辅助 | 🔵辅助 | - |
| 建筑审批 | - | 🔵辅助 | - | - | 🔵辅助 |
| UGB 增长边界 | - | 🔴核心因子 | 🔵辅助 | - | - |
| RBA D1信贷增长 | - | 🔴核心因子 | - | - | 🔵辅助 |
| Mesh Block 人口密度 | - | - | 🔵辅助 | 🔵辅助 | 🔵辅助 |

> 🔴 = 直接影响，🔵 = 辅助/验证，- = 低关联

---

## 附录A：数据采集脚本建议

### 新增文件清单

```
lib/vgv-loader.js              → VGV季度中位价XLS解析 → 更新 suburb_metrics
lib/abs-indicator-client.js    → ABS Indicator API → macro_indicators + census_sa2_data
lib/salm-loader.js             → SALM SA2就业率 → census_sa2_data.salm_data
lib/mesh-block-loader.js       → Mesh Block住房数（一次性）→ census_sa2_data
```

### 数据库字段扩展

```sql
-- suburb_metrics 新增字段
ALTER TABLE suburb_metrics ADD COLUMN govt_median_house_price NUMERIC(10,2);
ALTER TABLE suburb_metrics ADD COLUMN govt_median_unit_price NUMERIC(10,2);
ALTER TABLE suburb_metrics ADD COLUMN govt_chg_12m NUMERIC(5,2);
ALTER TABLE suburb_metrics ADD COLUMN is_urban_growth_boundary BOOLEAN;

-- census_sa2_data JSONB 新增键
-- $.g45_total_dwellings      → G45表: 总住房数
-- $.g45_unoccupied_dwellings → G45表: 空置住房数
-- $.seifa_irsd               → IRSD得分
-- $.seifa_ieo                → IEO得分
-- $.salm_unemployment_rate   → SALM就业率
-- $.salm_labour_force        → SALM劳动力总数

-- macro_indicators 新增系列
-- 'RBA_D1_HOUSING_CREDIT_MOM'  → 住房信贷月度增长
-- 'ABS_CPI_MONTHLY_MELBOURNE'  → 墨尔本CPI月度数据
```

---

## 附录B：数据集列表

| # | 数据源 | 提供方 | 许可 | 免费 | API | 频率 | Suburb级 |
|---|--------|--------|------|------|-----|------|---------|
| 1 | VGV季度中位价 | 维多利亚估价总署 | CC-BY 4.0 | ✅ | CKAN | 季度 | ✅ |
| 2 | ABS Census 2021 G表 | ABS | CC-BY 4.0 | ✅ | SDMX | 5年 | ✅(SA2) |
| 3 | ABS Indicator API | ABS | 需Key | ✅ | SDMX | 月度 | ❌(SA4↑) |
| 4 | ABS 建筑审批 8731.0 | ABS | CC-BY 4.0 | ✅ | ⚠️XLSX | 月度 | ❌(州↑) |
| 5 | ABS RPPI 6416.0 | ABS | CC-BY 4.0 | ✅ | ⚠️XLSX | 季度 | ❌(首府) |
| 6 | ABS 总住宅价值 6432.0 | ABS | CC-BY 4.0 | ✅ | ⚠️XLSX | 季度 | ❌(州↑) |
| 7 | ABS 劳动调查 6291.0 | ABS | CC-BY 4.0 | ✅ | ⚠️XLSX | 月度 | ⚠️(SA4) |
| 8 | SALM SA2就业 | DEWR | CC-BY 4.0 | ✅ | ⚠️XLSX | 季度 | ✅(SA2) |
| 9 | AIHW Housing Dashboard | AIHW | CC-BY 4.0 | ✅ | ❌ | 年度 | ⚠️ |
| 10 | VicPlan规划分区 | DTP Vic | CC-BY 4.0 | ✅ | REST | 实时 | ✅(坐标) |
| 11 | VPA Precinct Boundaries | VPA | CC-BY 4.0 | ✅ | ArcGIS | 不定期 | ✅(区域) |
| 12 | Urban Growth Boundary | DTP Vic | CC-BY 4.0 | ✅ | WMS | 不定期 | ✅ |
| 13 | Vicmap Address | DTP Vic | CC-BY 4.0 | ✅ | WFS | 定期更新 | ✅ |
| 14 | RBA D1 住房信贷 | RBA | CC-BY | ✅ | ⚠️XLSX | 月度 | ❌(全国) |
| 15 | RBA G4 月度CPI | RBA | CC-BY | ✅ | ⚠️XLSX | 月度 | ❌ |
| 16 | CoreLogic / Cotality Index | Cotality | 商业 | ❌ | API | 日度 | ✅ |
| 17 | PropTrack Index | PropTrack | 商业 | ❌ | API | 月度 | ✅ |
| 18 | Mesh Block 住房数 | ABS | CC-BY 4.0 | ✅ | ⚠️XLSX | 5年 | ✅(MB) |

---

*最后更新：2026-06-09*
*来源范围：ABS, RBA, VicPlan, VGV, VPA, DEWR, AIHW, Cotality, PropTrack 官方网站*
