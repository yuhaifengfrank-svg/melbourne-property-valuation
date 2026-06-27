# DATA_SOURCES.md — 数据源清单

**更新：** 2026-06-25 16:34

---

## 数据源总览

| 政府机构 | 数据类别 | 主要数据 | 更新频率 | 地理粒度 | 是否免费 | 房产分析价值 |
|---------|---------|---------|---------|---------|---------|------------|
| Reserve Bank of Australia | 利率/金融 | Cash Rate、Mortgage Rates、Bond Yield、Exchange Rate、Money Supply、Credit Growth | 每月/每日 | 全国 | ✅ | ⭐⭐⭐⭐⭐ |
| Australian Bureau of Statistics | 人口 | Census、人口增长、年龄、家庭、收入、教育、职业 | 月/季/5年 | SA1~State | ✅ | ⭐⭐⭐⭐⭐ |
| Australian Bureau of Statistics | 劳动力 | 就业、失业、参与率、职位空缺、工资 | 月/季 | SA4/LGA/State | ✅ | ⭐⭐⭐⭐⭐ |
| Australian Bureau of Statistics | 建筑 | Building Approvals、Dwelling Commencements、Completions | 月 | LGA/State | ✅ | ⭐⭐⭐⭐⭐ |
| Australian Bureau of Statistics | 宏观经济 | GDP、State Accounts、Retail Sales、Business Indicators、CPI、PPI | 月/季 | State | ✅ | ⭐⭐⭐⭐⭐ |
| Department of Treasury and Finance Victoria | 州经济 | GSP、财政收入、债务、预算、基础设施支出、Economic Snapshot | 季/年 | State | ✅ | ⭐⭐⭐⭐☆ |
| Valuer-General Victoria | 房价 | Property Sales、Median Price、Sales Volume | 季 | Suburb/LGA | ✅ | ⭐⭐⭐⭐⭐ |
| DFFH | 租赁 | Median Rent、Rental Report | 季 | Suburb/LGA | ✅ | ⭐⭐⭐⭐⭐ |
| DTP (VicPlan) | Planning | Zoning、Overlay、Planning Scheme、Planning Permit | 实时 | Parcel | ✅ | ⭐⭐⭐⭐⭐ |
| DTP (Vicmap) | GIS | Vicmap、Parcel、Address、Road、Boundary | 定期 | Parcel | ✅ | ⭐⭐⭐⭐⭐ |
| Victorian Planning Authority | 新区开发 | PSP、Precinct、Future Development、Growth Areas | 不定期 | Precinct | ✅ | ⭐⭐⭐⭐⭐ |
| DataVic | 开放数据 | 学校、医院、交通、犯罪、环境、Property Sales等数千个数据集 | 持续 | 多种 | ✅ | ⭐⭐⭐⭐⭐ |
| Infrastructure Victoria | 基建 | Major Projects、Infrastructure Pipeline | 年 | State | ✅ | ⭐⭐⭐⭐☆ |
| Department of Education | 教育 | School Zones、Enrolment、NAPLAN | 年 | School | ✅ | ⭐⭐⭐⭐☆ |
| Crime Statistics Agency | 犯罪 | Crime by Suburb、Offence Type | 季 | LGA/Suburb | ✅ | ⭐⭐⭐⭐☆ |
| EPA Victoria | 环境 | Air Quality、Noise、Pollution | 实时 | Local | ✅ | ⭐⭐⭐☆☆ |
| Bureau of Meteorology | 气候 | Rainfall、Temperature、Flood、Climate | 日/月 | Station | ✅ | ⭐⭐⭐☆☆ |
| Australian Taxation Office | 税收 | Tax Statistics、个人收入、行业收入 | 年 | Postcode/LGA | ✅ | ⭐⭐⭐⭐☆ |
| Australian Business Register | 企业 | ABN、企业注册、行业分类 | 实时 | Australia | ✅ | ⭐⭐⭐☆☆ |

---

## 已接入数据源明细（按用途排序）

### 1. 房价中位数 / 销售趋势（VGV）
- **数据源：** Valuer-General Victoria — Victorian Property Sales Report
- **用途：** suburb 房价中位数、house/unit/vacant land 分类、季度和年度趋势
- **状态：** ✅ 已在估值引擎中使用（factor: sales evidence）
- **文件：** `scripts/collect/*`（VGV xlsx & VPSR CSV）
- **局限：** Domain/REA 数据被 Akamai 403 拦截，无法直接采集
- **表：** `comparable_sales`（4.2MB, 9326 rows）
- **ETL：** VM → artifact → Neon
- **更新：** 季度

### 2. 租金 — DFFH Rental Report
- **用途：** 季度租金中位数、区域变化、租赁市场强弱信号
- **状态：** ✅ 已在估值引擎中使用（factor: rental yield）
- **文件：** `scripts/collect/*`
- **表：** `suburb_metrics` 含租金字段（464KB, 488 rows）
- **ETL：** VM → artifact → Neon
- **更新：** 季度

### 3. 规划 / zoning / overlay — VicPlan
- **数据源：** Department of Transport and Planning (VicPlan)
- **用途：** 每块地的 zoning、overlay、规划限制、可开发性初筛
- **状态：** ✅ 已接入（Phase B）
- **表 1：** `vicplan_zones`（119MB, 49500 rows）— ⚠️ Phase C 待删除
- **表 2：** `vicplan_overlays`（129MB, 174682 rows）— ⚠️ Phase C 待删除
- **表 3：** `planning_cache`（1.9MB, 3640 rows）— Phase B cache-first
- **ETL：** `scripts/build-planning-cache.mjs` → VM 生成 → 写入 Neon
- **API：** cache-first (近似匹配 330m)，miss 回退 ST_Contains
- **覆盖：** 52%（ETL 采样密度不足，需优化到 95%+ 才能安全 Phase C）
- **更新：** 按需

### 4. 地块 / parcel / cadastral — Vicmap Property
- **数据源：** Data.Vic — Vicmap Property
- **用途：** 维洲土地 parcel、property boundary、GIS 数据
- **状态：** ⚠️ 待开发
- **全州数据：** 417 万条 polygon，~4GB GeoJSON（全量太大不进 Neon）
- **Metro 范围：** ~167 万条，~1.4GB GeoJSON（VM 上分批下载可行）
- **ETL 方案：** VM raw/ → VM processed/（WFS 分批下载）→ artifact（只取属性表：ufi, pfi, status, geometry 中心点）
- **交付：** 只入 metro 范围，仅存属性字段 + centroid (lat/lon)，不进完整 polygon
- **预估 artifact 大小：** < 50MB
- **WFS 端点：** `open-data-platform:property_view`（含更多属性）或 `v_property_mp`
- **源 URL：** `https://opendata.maps.vic.gov.au/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=open-data-platform:property_view` 加 bbox 筛 Metro
- **依赖：** VM 空间计算

### 5. 人口 / 收入 / 家庭结构 — ABS Census
- **数据源：** ABS Census / QuickStats / Data by Region
- **用途：** suburb/SA2 人口增长、收入、年龄、家庭、职业、住房结构
- **状态：** ✅ 已接入
- **表：** `census_sa2_data`（6.4MB, 524 SA2s, JSONB 单表 9 张核心表）
- **因子：** 8 号因子「Census 一致性」（PIR/MTI）
- **补充表：** `salm_sa2_data`（632KB, 510 rows）
- **ETL：** VM（ABS API 下载 → JSONB 入库）
- **更新：** 5 年（Census）+ 年度更新

### 6. 宏观经济 / 利率 — RBA
- **数据源：** Reserve Bank of Australia
- **用途：** Cash Rate、Mortgage Rates、Bond Yield、Money Supply、Credit Growth
- **状态：** ✅ 已接入
- **表：** `macro_indicators`（272KB, 632 rows）+ VM artifact `rba_macro_full`（5,175 rows）
- **文件：** `scripts/collect/rba/*`
- **更新：** 每月

### 7. 人口增长预测 — VIF2023
- **数据源：** Department of Transport and Planning — Victoria in Future 2023
- **用途：** SA2/LGA 级人口、家庭、住房需求预测到 2051
- **状态：** ⚠️ 已发现，待开发
- **源 URL：** `https://discover.data.vic.gov.au/dataset/vif2023-victoria-demographic-projections-to-2051`
- **格式：** XLSX
- **ETL 方案：** VM 下载 Excel → 解析为 CSV → processed 表 → artifact 入 `population_projections` 新表
- **预估大小：** 小（人口数据，几千行）
- **更新：** 每 2-3 年

### 8. 新区开发 — VPA FUS Land Use
- **数据源：** Victorian Planning Authority — Future Urban Structure Land Use
- **用途：** PSP 边界、绿地新区土地用途分类、增长方向分析
- **状态：** ✅ 原始数据已下载到 VM
- **元数据：**
  - 包含 87 个 PSP，8521 个 polygon
  - 大小：17MB GeoJSON（全量入 Neon 可行）
  - 坐标：EPSG:28355
  - CRS：GDA94/MGA zone 55
- **源 URL：** `https://opendata.arcgis.com/datasets/d0e72fe577bf4a4abf4782a57c8fd386_0.geojson`
- **字段：**
  - `LU_CLASS` — land use 大类（Residential/Employment/Open Space/Transport/Education）
  - `LU_TYPE` — 中类（Commercial/Industrial/Business...）
  - `LU_SUBTYPE` — 小类
  - `PSP_NO` — PSP 编号
  - `PSP_DATE` — PSP 批准日期
  - `LegendCat` — 图例分类
  - `Area_ha` — 面积（公顷）
  - `EXISTING` — Y/N 是否已有开发
- **ETL 方案：** VM 上重投影（EPSG:28355 → 4326）→ artifact（每行的 centroid + 属性）→ Neon `vpa_fus_landuse` 新表
- **预估 artifact 大小：** < 10MB
- **更新：** 不定期（做一次即可，VPA 更新时补）
- **对估值影响：** ⭐⭐⭐⭐⭐ — 增长区未来供给方向、土地用途识别

### 9. VPA PSP 道路中心线 — Pending
- **数据源：** Data.Vic — PSP Road Centrelines（不是 FUS）
- **用途：** PSP 新区规划道路网络
- **状态：** ❌ 未探索
- **ETL 方案：** 找到 URL 后，类似 FUS 处理

### 10. 建筑审批 — ABS Building Approvals
- **数据源：** Australian Bureau of Statistics
- **用途：** 月度住宅/非住宅 approvals
- **状态：** ⚠️ 待开发
- **ETL 方案：** ABS Data API（已有 `abs-client.js`）→ JSON → `building_approvals` 新表
- **预估大小：** 小（月度数据，几千行）
- **更新：** 每月
- **更新：** 每 2-3 年

### 11. 就业 / 经济活动 — ABS Labour Force
- **数据源：** Australian Bureau of Statistics
- **用途：** 失业率、就业参与率、行业结构
- **状态：** ⚠️ 待开发
- **ETL 方案：** ABS Data API → `labour_force_stats` 新表
- **预估大小：** 小
- **更新：** 每月

### 12. 教育 — School Zones / NAPLAN
- **数据源：** Department of Education + MySchool
- **用途：** School zones、enrolment、NAPLAN 成绩
- **状态：** ⚠️ 待深挖
- **已做：** `school_locations`（1MB, 2859 rows）+ `school_profiles`（880KB, 2310 rows）
- **待做：** School zone polygons（SHP from DataVic）、NAPLAN 成绩数据
- **ETL 方案：** DataVic 下载 school zone SHP → VM 处理 → `school_zones` 新表
- **更新：** 年

### 13. 犯罪 — Crime Statistics Agency
- **数据源：** Crime Statistics Agency Victoria
- **用途：** Suburb/LGA 级别犯罪率、犯罪类型
- **状态：** ❌ 未接入
- **源 URL：** `https://www.crimestatistics.vic.gov.au`
- **ETL 方案：** 直接抓 CSV → `crime_stats` 新表
- **预估大小：** ~10MB（季度数据）
- **更新：** 季度
- **路径：** A（本地拉→Neon）

### 14. 基建 — Infrastructure Victoria / Big Build
- **数据源：** Infrastructure Victoria + Major Road Projects Victoria
- **用途：** 重大基建项目（交通、医院、教育）、完工时间、预算
- **状态：** ⚠️ 已有 20 条种子数据待扩充
- **表：** `infrastructure_projects`（16KB, 20 rows）— 结构完整
- **表结构：** id, project_name, project_type, description, suburb, state, lga, estimated_budget_m, estimated_completion, status, source_url, latitude, longitude, catchment_sa3, catchment_radius_km, confidence_score
- **已有类型：** Employment(7), Transport(6), Health(4), Education(3)
- **ETL 方案：** 从 Victoria's Big Build + VPA 项目页批量抓取 → 脚本灌入
- **预估大小：** 小（~100-200 条重大项目）
- **路径：** A（本地脚本）
- **更新：** 年

### 15. Vicmap Address — 地址附加数据
- **数据源：** Data.Vic — Vicmap Address
- **用途：** 补充地址到坐标映射、街道交叉口等
- **状态：** ❌ 未探索
- **ETL 方案：** 先确认数据大小（类似 Vicmap Property 量级），如果太大只取 metro 范围
- **预估：** 可能很大（全州数百万地址点）

### 16. EPA 环境 — Air Quality / Pollution
- **数据源：** EPA Victoria
- **用途：** 空气质量、污染源、噪声数据
- **状态：** ❌ 未接入
- **ETL 方案：** EPA API → `environmental_factors` 新表
- **预估大小：** 小
- **路径：** A
- **更新：** 实时/日

### 17. BOM 气候 — Weather / Flood
- **数据源：** Bureau of Meteorology
- **用途：** 降雨量、洪水风险区
- **状态：** ❌ 未接入
- **ETL 方案：** BOM API → `climate_risk` 新表
- **预估大小：** 小
- **路径：** A

### 18. ATO 税收统计 — 补充收入数据
- **数据源：** ATO Taxation Statistics
- **用途：** Postcode/LGA 级别个人收入、行业收入（可验证 ABS 数据）
- **状态：** ❌ 未接入
- **ETL 方案：** ATO 网站 CSV 下载 → `ato_income_stats` 新表
- **路径：** A

---

## 已接入但不用的数据源

| 数据 | 说明 |
|------|------|
| ATO 税收统计 | 个人收入、行业收入，可补充 ABS 收入数据 |

---

## By Priority: 开发顺序

| # | 数据源 | 路径 | 预估 artifact 大小 | 难度 | 房产价值 | 前置依赖 | 状态 |
|---|-------|------|-------------------|------|---------|---------|------|
| 1 | **VPA FUS Land Use** ⭐ | B → A | < 10MB | 低 | ⭐⭐⭐⭐⭐ | VM 重投影 | ✅ 已下至 VM，待 ETL |
| 2 | **Infrastructure VIC** | A | < 1MB | 中 | ⭐⭐⭐⭐ | 无 | ⚠️ 20/20 种子数据，待扩充 |
| 3 | **Vicmap Property (Metro)** | B | < 50MB | 中 | ⭐⭐⭐⭐ | VM PostGIS | ⚠️ 待下载 |
| 4 | **Crime Stats** | A | ~10MB | 低 | ⭐⭐⭐⭐ | 无 | ❌ |
| 5 | **ABS Building Approvals** | A | < 1MB | 低 | ⭐⭐⭐⭐ | 无 | ❌ |
| 6 | **ABS Labour Force** | A | < 1MB | 低 | ⭐⭐⭐ | 无 | ❌ |
| 7 | **VIF2023 人口预测** | A | < 1MB | 低 | ⭐⭐⭐⭐ | 无 | ⚠️ 已发现 |
| 8 | **School Zone Polygons** | B | < 10MB | 中 | ⭐⭐⭐ | 无 | ❌ |
| 9 | **EPA / BOM** | A | < 1MB | 低 | ⭐⭐⭐ | 无 | ❌ |
| 10 | **Vicmap Address** | B | 待评估 | 高 | ⭐⭐⭐ | VM | ❌ |
| 11 | **ATO 税收** | A | < 1MB | 低 | ⭐⭐ | 无 | ❌ |
| - | **ETL 采样优化** | — | 不变 | 低 | ⭐⭐⭐ | 现有 planning_cache | ⚠️ Phase C 阻塞 |
| - | **Phase C (删大表)** | — | -248MB | 低 | - | ETL 95%+ | ❌ 阻塞 |

---

## "Oracle Data Factory" 数据处理架构

### 数据流

```
Government sources (CSV/API/Shapefile/GeoJSON/WFS WFS)
    ↓
VM (Python/Node ETL) → raw/ → processed/ → artifacts/
    ↓
Stage Neon → dry-run verify → Production Neon
    ↓
Vercel API (read-only)
    ↓
End user
```

### 路径定义

| 路径 | 说明 | 适用场景 |
|------|------|---------|
| **A** | 本地脚本 → 直接写入 Neon | < 50MB、无空间计算、CSV/API 数据 |
| **B** | VM 计算 → artifact → Neon | 大文件、空间数据、需要 PostGIS |
| **B→A** | VM 下载/预处理 → artifact（小） → 本地 ETL 入 Neon | 中等大小、处理简单、无空间依赖 |

### 规则

- **VM 是唯一计算节点** — 原始数据不进 Neon
- **Neon 是 API 缓存层** — 轻量，只存最终结果（artifacts）
- **Vercel 只读** — 不写数据库
- **Stage-first promote** — 所有数据先到 Stage 验证再 promote 到 Production
- **Production guard** — `sync_artifact.py` 正则匹配 `ep-winter-band` 阻止误写

### VM 容量

| 资源 | 容量 |
|------|------|
| Disk total | 45GB |
| Used | 6.9GB (16%) |
| Available | **38GB** |
| Memory | 已安装（可用 1-2GB 用于 ETL） |

---

## 注意事项

1. **Domain/REA 反爬**：Akamai 403 无法绕过，二手房源实时数据不可直接采集
2. **VGV unit xlsx**：源 URL 403'd → unit 中位数用 VIC 比率 0.699 估算
3. **Growth projection**：数据窗口仅 4 个月，需持续补充
4. **Nominatim 坐标波动**：Vercel US-East vs 本地 Melbourne 坐标差 ~100-200m，planning_cache 用 330m 范围近似匹配
5. **价格数据**全部从政府免费源获取（VGV、DFFH），未依赖商业源如 CoreLogic 或 RP Data
6. **Vicmap WFS 默认 CRS** 是 EPSG:7844 (GDA2020)，查询时可用 EPSG:4326 bbox 过滤
7. **WFS numberMatched** 有 5000 条返回限制，需要分批下载（count=5000 + startIndex）
