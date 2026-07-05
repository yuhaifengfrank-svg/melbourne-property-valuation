# Street Quality Factor — Micro-location 估值因子
**Last updated:** 2026-06-28
**Status:** Design phase — 0 lines of new implementation

---

## 1. 当前状态

现有实现（`lib/street-quality-service.js`）只包含 4 个维度：

| 维度 | 权重 | 代码状态 | 数据源 |
|------|------|---------|--------|
| AADT 交通量 | 0.35 | ✅ 数据+service | VicRoads AADT 2019 (1,227 suburb, 14,662 segments) |
| 街道价格百分位 | 0.35 | ✅ 代码完整 | comparable_sales |
| 道路类型（OSM分类） | 0.20 | ✅ 代码完整 | 地址后缀推算 |
| 街道朝向 | 0.10 | ❌ 仅名字推断 | 实际走向未实现 |

**已打通但未验证的链路：**
- `data/traffic_quality.json` (1.5MB) 已 ETL 完成
- `valuation-engine.js` 第 895 行已调用 `computeStreetQuality()`
- `valuation-engine.js` 的 `anchorFactorAdjustments()` 已有 `streetQualityAdj` 因子（±3% cap）

> **注意：以上链路虽在代码中存在，但从未在 Production 上验证过。** `streetQualityScore` 的实际输出和因子影响均未经过真实估值测试。

**Street Tree 数据管线进展（2026-06-28）：**

| 数据 | 状态 | 说明 |
|------|------|------|
| `data/street_tree_by_street.json` | ✅ 9.0 MB | 17,214 条街级记录（Manningham + Brimbank），198,890 棵树 |
| `data/suburb_tree_canopy.json` | ✅ 122 KB | 174 个 suburb，564,432 棵树（9 个 council centroid reverse-geocode） |
| VM 数据管道 | ✅ 可用 | `/home/ubuntu/aggregate-trees-v4.py` — centroid nearest-neighbor 策略 |

**分批计划：** 其余 7 个 council（Hobsons Bay、Glen Eira、Yarra、Port Phillip、Melbourne、Wyndham、Ballarat）需要 Vicmap Address 或 OSM street name 数据源做街级 reverse geocode，逐个 council 分批完成。

---

## 2. PRD 要求 vs 实现对照

来自 `requirements.md` §4.1：

| 字段 | PRD 要求 | 实现状态 | 备注 |
|------|---------|---------|------|
| `street_type` | quiet → main road | ⚠️ 部分 | OSM 后缀分类 |
| `street_grade` | A/B/C/D | ❌ | 未实现 |
| `streetscape_score` | 1-5 | ❌ | 未实现 |
| `tree_canopy_score` | 1-5 | ❌ | **本设计核心** |
| `traffic_noise_score` | 1-5 | ⚠️ 部分 | 仅 AADT，不含铁路/商业噪音 |
| `access_friction_score` | 1-5 | ❌ | 未实现 |
| `amenity_walkability_score` | 1-5 | ❌ | 未实现 |
| `quiet_vs_busy` | quiet → busy | ❌ | 未实现 |
| `street_tree_maturity` | low/medium/high | ❌ | **本设计核心** |
| 朝向 (实际走向) | — | ❌ | 需要街道 geometry |

---

## 3. 扩展设计

### 3.1 街景绿化 — Street Tree Canopy

**数据源：** 各 Council 的 Street Tree Inventory / Open Data

已有公开数据的大 Melbourne council：

| Council | 数据名称 | 街级聚合 | suburb 级聚合 | 状态 |
|---------|---------|---------|-------------|------|
| **Manningham** | Street Trees | ✅ | ✅ | ✅ 已有 street name 字段 |
| **Brimbank** | Street Trees | ✅ | ✅ | ✅ 已有 street name 字段 |
| **Hobsons Bay** | Street and Park Trees | ⏳ 待做 | ✅ | suburb 级完成，街级需 Vicmap Address reverse geocode |
| **Glen Eira** | Park and Street Trees | ⏳ 待做 | ✅ | 同上 |
| **City of Yarra** | Street and Park Trees | ⏳ 待做 | ✅ | 同上 |
| **Port Phillip** | City of Port Phillip Trees | ⏳ 待做 | ✅ | 同上 |
| **City of Melbourne** | Urban Forest | ⏳ 待做 | ✅ | 同上 |
| **Wyndham** | Wyndham City Council Trees | ⏳ 待做 | ⏳ 0 条 | centroid match 距离不够，需放宽 |
| **Ballarat** | Ballarat Trees | ⏳ 待做 | ✅ | 同上 |

其他 council（Geelong、Bendigo、Merri-bek、Whitehorse、Monash、Stonnington、Bayside、Boroondara、Knox、Casey、Darebin 等）尚未获取，需走各自 council open data portal 或 ArcGIS Hub。

其他 council 也基本都有公开数据。对于无数据的 council，退路：
- **VicMap Vegetation** 覆盖层（Statewide，但精度粗）
- **OpenStreetMap** tree/tree_row tags
- **Satellite imagery** （AI 树冠分割，未来做）

**聚合逻辑：**
1. 下载各 council 的 Street Tree GeoJSON/CSV
2. 按 street name + suburb 聚合：树的数量 / 密度 / 平均 DBH（胸径） 
3. 按街道分段：一段街道的绿化密度 score 1-5
4. 写入 `data/street_tree_by_street.json`

**评分逻辑：**

```
tree_canopy_score (1-5):
  1: 无/几乎无街边树
  2: 零星树木
  3: 有树但稀疏/树龄小
  4: 树木茂密，中等以上树冠
  5: 成熟林荫大道级
```

---

### 3.2 朝向 — 实际街道走向

**当前问题：** `streetOrientationScore()` 靠街道名里的 North/South/East/West 猜走向，完全不靠谱。
- "North Road" → 东西走向 ✅（但这个名字猜对了纯属巧合）
- "East Boundary Road" → 同样推断为南北走向 ✅
- 大部分街道名没有方位词 → 返回 "unknown"（score 3）

**改进方案：**
1. 用 Vicmap Property 或 OpenStreetMap 的道路中心线 geometry
2. 对地址所在路段（或最近的 200m 路段）计算方位角
3. 东西走向（接近 90° 或 270° 的方位角，或 Bearing 80°–100°/260°–280°）→ house 可以朝北 → 好
4. 南北走向（接近 0°/180°）→ 只有单侧房屋能朝北 → 差

**数据源选择：**

| 数据源 | 精度 | 获取难度 | 推荐 |
|-------|------|---------|------|
| OpenStreetMap 道路线 | 澳洲 GraphHopper 数据 | 免费，可下载 | ⭐ 首选 |
| Vicmap Transport | Statewide 官方 | 需 license | 次选 |
| Nominatim OSM 返回的道路几何 | 按需单条 | API 调用慢 | 备选 |

**实现路径：**
1. 下载 Melbourne metro 范围的 OSM road network
2. 对每条道路路段计算 bearing
3. 按 street name + suburb 聚合为路段走向
4. 地址估值时，查该街道的走向 → 赋值 orientation score

---

### 3.3 街道情况 — 已有 + 扩展

**已有的：**
- AADT 交通量 ✅ — 权重 0.35
- OSM 道路类型分类 ✅ — 权重 0.20
- 街道价格百分位 ✅ — 权重 0.35

**待扩展（按优先级）：**

| 扩展项 | 数据源 | 优先级 | 说明 |
|-------|-------|--------|------|
| 距主路距离 | OSM / Nominatim | P1 | 距最近 arterial road 的直线距离 |
| 铁路/电车噪音 | Vicmap Transport + TramTracker | P1 | 距铁路线 100m、tram line 50m 内降分 |
| 商业后巷/工业区 | VicPlan zoning | P2 | 商业/工业 zone 的邻近度 |
| 路边停车 | OSM parking tags | P3 | 低优先级 |
| 人行道宽度 | OSM sidewalk tags | P3 | 低优先级 |

---

## 4. 数据管线设计

### 4.1 架构

```
Council Open Data (GeoJSON/CSV)          OSM Road Network
         ↓                                     ↓
  VM: raw/street-tree/                  VM: raw/osm-roads/
         ↓                                     ↓
  ETL script: ingest-street-tree.mjs    ETL script: ingest-osm-roads.mjs
         ↓                                     ↓
  processed/street_tree_by_street.json   processed/street_bearing_by_street.json
         ↓                                     ↓
  本地 sync 到 data/                    本地 sync 到 data/
         ↓                                     ↓
  street-quality-service.js 加载两个 JSON 并集成评分
```

### 4.2 文件结构

```
data/
  traffic_quality.json          ← ✅ 已有 (1.5MB)
  street_tree_by_street.json    ← ❌ 待生成
  street_bearing_by_street.json ← ❌ 待生成
  osm_road_class.json           ← ⚠️ 考虑清理现有 hardcode

scripts/
  ingest-street-tree.mjs        ← ❌ 待编写
  ingest-osm-roads.mjs          ← ❌ 待编写

lib/
  street-quality-service.js     ← ⚠️ 需要扩展现有 service
```

---

## 5. 估值模型集成

### 5.1 因子结构更新

当前 `streetQualityScore` 是一个 1-5 整数。扩展后保持 1-5 输出，但内部维度更多。

**新权重提议：**

| 维度 | 当前权重 | 新权重 | 说明 |
|------|---------|--------|------|
| AADT 交通量 | 0.35 | 0.20 | 降低，因为 AADT 只覆盖主干道 |
| 街道价格百分位 | 0.35 | 0.20 | 降低，避免把价格本身当质量 |
| 道路类型（OSM） | 0.20 | 0.10 | residential suffix 已够好 |
| 街道朝向 | 0.10 | 0.10 | 不变 |
| **绿化/树冠** | — | **0.20** | **新增** |
| **噪音环境** | — | **0.10** | **新增**（铁路、主路邻近度） |
| **街道等级综合** | — | **0.10** | **新增**（council street grade 或聚合分类） |

### 5.2 估值影响调整

当前 `streetQualityAdj` 的 cap 是 ±3%。Micro-location 的设计预期调整范围更宽：

```
PRD 期望：
  A-grade:   +3% to +8%
  B-grade:   baseline
  C-grade:   -3% to -10%
  D-grade:   -8% to -20%+

当前实现 (engine anchorFactorAdjustments):
  streetQualityAdj: cap ±3%
  （仅按 subject vs comp median 的差值 × 0.015，远不够宽）
```

**需要调整：** 扩大 `streetQualityAdj` 的 cap 从 ±3% 到至少 ±8%，或者把 micro-location 调整独立为一个单独的 factor（而非合并到 street quality 中）。

### 5.3 Confidence 联动

当 street quality 数据源不全时（如该 council 无 open data），应：
- `streetQualityScore` 仍可输出（基于可用数据）
- 但 confidence 在披露中注明 "Desktop estimate, data source limited"

---

## 6. 实施计划

### Phase 1 — Street Tree 数据管线（P0）

| Step | 任务 | 输出 | 状态 |
|------|------|------|------|
| 1.1 | 调研并下载 9 个 council 的 Street Tree data | VM: raw/street-tree/ | ✅ 完成 |
| 1.2a | Manningham + Brimbank 街级聚合 | `street_tree_by_street.json` (17,214 streets) | ✅ 完成 |
| 1.2b | 其余 7 个 council 的 suburb 级聚合 | `suburb_tree_canopy.json` (174 suburbs) | ✅ 完成 |
| 1.2c | 7 个 council 分批街级聚合（需 Vicmap Address reverse geocode） | 逐 council 更新 `street_tree_by_street.json` | ⏳ 进行中 |
| 1.3 | 集成到 `street-quality-service.js` | tree_canopy_score 维度 + 重算权重 | ❌ 待做 |
| 1.4 | 端到端测试 5 个 suburb 的 street quality 输出 | 验证评分合理性 | ❌ 待做 |

### Phase 2 — 街道朝向 OSM 数据管线（P1）

| Step | 任务 | 输出 |
|------|------|------|
| 2.1 | 下载 Melbourne OSM road network（Geofabrik 或 Overpass API） | raw/osm-roads/ |
| 2.2 | 编写 ETL `ingest-osm-roads.mjs` | street_bearing_by_street.json |
| 2.3 | 替换 `streetOrientationScore()` 的硬编码规则 | 改用实际 bearing 数据 |
| 2.4 | 端到端测试 | 验证 10 条已知朝向的街道 |

### Phase 3 — Factor cap 扩展（P2）

| Step | 任务 | 输出 |
|------|------|------|
| 3.1 | 评估当前 streetQualityAdj ±3% 的合理性 | 分析现有估值中的实际分配 |
| 3.2 | 调整 `FACTOR_CAPS.streetQualityAdj` | 建议扩至 ±6% |
| 3.3 | 影响分析：用真实地址跑 20 组对比 | 确保不产生异常估值 |

### Phase 4 — 噪音环境（P3）

| Step | 任务 | 输出 |
|------|------|------|
| 4.1 | 铁路线数据 | VicTrack / OSM railway |
| 4.2 | 主路邻近度 | 已有 AADT 道路数据即可 |
| 4.3 | 端到端测试 | 验证铁路 100m 内的自动降分 |

---

## 7. 风险与已知限制

1. **Council 数据格式不统一** — 每个 council 的数据结构、字段名、坐标系不同，ETL 需要适配器模式
2. **数据更新频率未知** — 部分 council 的 tree inventory 可能是几年一更
3. **Metro vs 远郊 coverage** — 远郊 council 可能无 open data（需 VicMap Vegetation 退路）
4. **OSM 道路 geometry 精度** — 澳洲 OSM 精度尚可但非官方，可能与实际有偏差
5. **朝向并非绝对** — 东西走向的街道上不一定所有 house 都朝北（还要看地块在街的哪一侧）

---

## 8. 依赖项

- 已有：`data/traffic_quality.json`
- 待获取：Council Street Tree Inventories（10+ council data portals）
- 待获取：Melbourne OSM road geometry（Geofabrik extract ~50MB）
- 工具：Python 用于 gj 转换；Node.js 用于 ETL 集成
- VM：用于下载和预处理大文件

---

## 9. 验证标准

Phase 1 完成后，用以下地址验证：

| 地址 | 预期 | 说明 |
|------|------|------|
| 1 St Kilda St, Brighton | 低分 | St Kilda St 是 Brighton 主路，AADT 高，树木少 |
| 1 Mangarra Rd, Canterbury | 高分 | Canterbury 老钱区，林荫大道 |
| 1 North Rd, Oakleigh | 中低分 | North Rd 是主干道，交通量大 |
| 1 Willgilson Ct, Oakleigh | 高分 | Court 型死胡同，安静，如果树多则更高 |

---

## 10. 参考

- `requirements.md` §3, §4 — 原始产品需求
- `street-quality-service.js` — 当前实现
- `valuation-engine.js` §Street Quality Adj — 因子调整
- `data/traffic_quality.json` — 已有 AADT 数据
