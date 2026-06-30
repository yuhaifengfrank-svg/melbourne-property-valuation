# Council Data: 接入计划

**创建时间**: 2026-06-30 12:01 (Australia/Melbourne)
**上次更新**: 2026-06-30 13:40 (Australia/Melbourne)
**已落地**: CSA Crime ✅, OSM POI ⬜ 补跑中（170/247 → 77 缺）

---

## 一、目标

围绕 **Build Score / Council Score** 评估维度，抓取 Melbourne/Victoria 各 Council 层面的开放数据，丰富 `suburb_metrics` 中 suburb→council 属性的评分。

## 二、数据源分类

### 2.1 已确认可用（免费）

| 数据 | 来源 | 格式 | 粒度 | 获取方式 |
|------|------|------|------|---------|
| **Council Boundary** | Vicmap (Data.Vic CKAN) | GeoJSON/WFS | LGA | WFS `opendata.maps.vic.gov.au` — 已有 PostGIS 使用经验 |
| **Planning Permit / Development Approvals** | 各 Council 的 eServices / API | HTML/PDF/CSV | 按地址/地块 | 各 Council 不同，需逐个适配 |
| **Building Permits (VBA)** | VBA DataVic | XLSX | LGA | 下载+解析，免费 |
| **Land Tax / Rates** | DELWP / Valuer-General | — | LGA aggregate | 需要确认免费度 |
| **Council Rating / Financials** | VAGO / Know Your Council | CSV/JSON | LGA | data.gov.au / knowyourcouncil.vic.gov.au |
| **SDAPP (Sustainable Design)** | 部分 Council | — | 地址级 | 需要调研 |

### 2.2 需要进一步确认

| 数据 | 原因 |
|------|------|
| **Vicmap Parcel** | 付费 licence |
| **Subdivision Applications** | 各 Council 不同，需适配 |
| **VCAT Applications** | 付费/免费？ |

### 2.3 技术方案

#### 推荐优先级

1. **Building Permits by LGA** — VBA 有现成的按 LGA 统计 excel
2. **Know Your Council financial data** — API 可抓，按 council 维度
3. **Top 20 Council eServices scraping** — 从最大的 council 开始适配

## 三、实施步骤

### Phase 1: Council Registry ✅ **DONE 2026-06-30**

- **council_registry** 表已创建：79 条 VIC LGA 记录
- 字段：lga_code, lga_name, population_2021 (ABS Census via SA2→LGA agg), suburb_count (from school_locations), council_type (Metro/Interface/Regional/Rural), region
- **suburb_metrics 已关联**：247/247 suburb 映射到 council_lga_code
- 脚本：`scripts/populate-council-registry.mjs`（Phase 1 ETL）
- 剩余：area_km² 未填充（需 Vicmap Admin LGA polygon → 从 WFS 或 PostGIS ST_Area 计算）

### Phase 2: Building Permits (VBA) 🟡 **部分完成**

- **council_metrics** + **council_metrics_12m** 表已创建（Migration 016）
- **获取方式**：VBA/BPC Data.Vic CKAN 提供 128 个 XLSX（2015-01 到 2026-03）
- **⚠️ Cloudflare 限制**：vba.vic.gov.au 下载链接受 Cloudflare 保护，`curl`/`fetch` 会返回 HTML 验证页
- **解决方案**：
  - `scripts/fetch-vba-permit-data.mjs` — 尝试自动下载，失败则输出手动 URL
  - `scripts/populate-council-metrics.mjs` — VBA XLSX 解析 + DB 写入
  - 推荐：浏览器手动打开 Data.Vic 页面 → 下载 XLSX → 放入 `/tmp/vba-data/` → 运行 populate 脚本
- 等待实际数据落在 `/tmp/vba-data/` 后执行解析和入库

### Phase 3: Know Your Council

- 爬取 `knowyourcouncil.vic.gov.au` 数据
- 获取：rate_income_pp, population_growth, debt_ratio, satisfaction

### Phase 4: Council eServices (选择性)

- 针对 Top 20 Melbourne Council 逐个适配
- 爬取 Planning Permit 在线查询
- 或者直接采 VPA Precinct Plans 数据替代

### Phase 5: 整合到评分模型

- Council-level 指标通过 suburb→council 映射注入 `suburb_metrics`
- 构建 Council Development Score 作为整体 Supply 评分的一部分

## 四、已知限制

- 79 个 Council 数据格式不统一，无法写通用爬虫
- VBA 数据每季度更新，不是实时
- Know Your Council 每年更新一次
- Council eServices 需单独适配（Melbourne / Kingston / Stonnington 等 API 各不同）

## 五、推荐下一步

**Phase 1: Council Registry → Phase 2: VBA Building Permits** 是最快能出效果的路径。不依赖第三方 API，纯文件下载+解析。

需要新会话执行。
