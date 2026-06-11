# VALUATION TYPE AUDIT

> 估值物业类型隔离审计报告
> Date: 2026-06-10
> Author: 玄甲

---

## tl;dr

**类型隔离存在但不够严密。三条污染路径已定位。** 采集阶段误标和 DB fallback 放大是主要风险。

---

## 1. 类型识别链路（全链条）

```
用户输入 propertyType
  ↓
api/valuation.js → body.propertyType
  ↓
valuation-service.js → subject.propertyType = subj.propertyType || propertyType || "House"
  ↓
valuation-engine.js → cleanType() 归一化
  ↓① 浏览器采集（CDP）
  ↓② DB fallback（4级降级）
  ↓
validateComparable() + scoreComparable() → 过滤+评分
```

### 关键节点

- **`cleanType()`**: 关键词匹配归一化，入口干净
- **浏览器采集**: `browser-collector.js` 从 REA/Domain 页面文本解析
- **DB fallback**: `db-comparable-source.js` 4 级降级（suburb+type → suburb only → postcode → SA2）

---

## 2. 污染路径详细分析

### 路径 A：REA 解析默认 House（L119）

```js
// browser-collector.js:100
const s = {
  address, price, propertyType: "House",  // ← 硬编码默认
  ...
};
```

后续 loop（L120）只在匹配到关键词 "House|Townhouse|Apartment|Unit|Villa|Land" 时才覆盖。**如果 REA 页面结构变化导致类型关键词没被匹配，记录会留成 House。**

### 路径 B：Domain 解析地址推断（L137-150）

```js
function inferPropertyType(address, defaultType = 'House') {
  if (/\b(?:unit|flat)\s+\d/i.test(addr) || ...) return 'Unit';
  if (/\b(?:apartment|apt)\s+\d/i.test(addr)) return 'Apartment';
  if (/\btown(?:house)?\b/i.test(addr)) return 'Townhouse';
  if (/\bvilla\b/i.test(addr)) return 'Villa';
  return defaultType;  // 地址里没关键词 → House
}
```

**问题**：一个 4br townhouse 如果地址里不含 "Townhouse" 字样（如 "12 Somerville Court"），就被标成 House。Domain 页面本身是有类型标签的，但当前解析不读。

### 路径 C：DB fallback 放大

```js
// db-comparable-source.js
// Level A: matchSuburbType(suburb, state, type) → ✅ 精确
// Level B: matchSuburb(suburb, state)         → ❌ 不传 propertyType
// Level C: matchPostcode(postcode, state)     → ❌ 不传 propertyType
// Level D: matchSa2(sa2Code)                  → ❌ 不传 propertyType
```

只要 Level A 不足 3 条 → B/C/D 不加类型过滤 → 把 Unit/Apartment/Villa/Townhouse 全部带回。

**引擎会在 `validateComparable` 中用 `typeMatches()` 检查，所以如果 DB 里的 `property_type` 字段正确，Unit 记录会被 reject（House 查 Unit → false）。但前提是入库时类型字段必须正确。如果路径 A/B 已经误标，入库就是错的。**

---

## 3. 当前估算：污染规模

### DB 数据快照

| 类型 | 条数 | 占比 |
|------|------|------|
| House | 3,191 | 75% |
| Unit | 564 | 13% |
| Townhouse | 480 | 11% |
| Villa | 17 | <1% |

- 225/230 suburb 有 ≥3 条 House 记录（Level A 能命中大多数）
- 但 **31 个 suburb 同时有 ≥3 条 House + ≥3 条 Unit/Apartment**
- 混合风险最高的 suburb: Chelsea, Ferntree Gully, Watsonia, Ringwood East, Dandenong

### 混合场景概率估算

| 场景 | 概率 | 影响 |
|------|------|------|
| House 查，Level A 命中 ≥3 条 | ~90% | ✅ 无混合风险 |
| House 查，Level A <3 条，Level B 带回 Unit | ~10% | ✅ DB 字段正确时 reject，字段错时污染 |
| Unit 查，被标为 House 入库 | 中（Domain 源） | ❌ 高影响 |
| Townhouse 查，被标为 House | 低（REA 有 Townhouse 标签） | ❌ 高影响 |

**核心问题：混合的最终严重程度取决于入库时 `property_type` 的准确性，而采集阶段已有两处缺陷。**

---

## 4. 影响评估（按严重性排序）

### 4.1 严重：采集阶段类型误标

**影响范围：Domain 源 1,430+ 条中的 House 类型记录（20 纯 Domain + 186 合并），以及 REA 源中未匹配到关键词的 House 记录**

实际城镇屋被标成 House，进入 House comp pool → 拉低锚点。Unit 被标成 House，进入 House pool → 拉低锚点。

**典型偏差**：House 查被 Unit 拉低 5-15%；Townhouse 被标成 House 查，得到 House 级别估值（差 15-30%）。

### 4.2 中：DB fallback 降级查询

**影响范围：Level A 命中不足 3 条的所有 suburb（约 5-10% 场景）**

不传 propertyType 带回异类，但引擎的 `validateComparable` 会 reject 大部分（字段正确时）。**字段错才是真问题。**

### 4.3 低：TYPE_COMPATIBILITY 过宽

Unit ↔ Apartment 互认，Villa → Townhouse。实际场景中这些类型的价格段差异 ≤ 10%，影响有限。

---

## 5. 现有防御（有用但不够）

| 防御层 | 防护内容 | 缺口 |
|--------|---------|------|
| `validateComparable` → typeMatches | reject 不兼容类型 | 依赖字段准确性 |
| `scoreComparable` | 不匹配类型 0 分 | 总 ≥50 分仍能过 |
| DB Level A matchSuburbType | 子句精确 + ILIKE | 数量不足时降级 |
| cleanType 归一化 | 关键词归一化 | ✅ 无问题 |

---

## 6. 关键数据

### 来源分布

| source | House | Unit | Townhouse | Villa |
|--------|-------|------|-----------|-------|
| realestate.com.au | 2,985 | 561 | 480 | 17 |
| domain.com.au | 20 | — | — | — |
| both（去重合并） | 186 | 3 | — | — |

- REA 95% 主力，Domain 仅 House + 合并共享
- **Domain 无独立的 Unit/Townhouse/Villa 记录**
- 0 条 NULL property_type（✅ 所有记录都有标注）

### 混合风险 suburb 示例

| suburb | House | Unit/Apt | Townhouse |
|--------|-------|----------|-----------|
| Chelsea | 7 | 12 | 2 |
| Ferntree Gully | 11 | 10 | 1 |
| Watsonia | 14 | 10 | 0 |
| Ringwood East | 9 | 10 | 4 |
| Dandenong | 12 | 9 | 4 |
| Noble Park | 14 | 8 | 3 |

---

## 7. 结论

**不是每个估值都错，但漏洞是真实存在的。** 问题不在引擎逻辑（`validateComparable` 做了正确的事），而在于：

1. **采集阶段类型标注有两个缺陷**（REA 默认 House + Domain 地址推断）
2. **DB fallback 降级查询不传类型**（引擎能补救，但不是所有情况都能救）
3. **没有类型验证的正向逻辑**（没有一个"确定这是 House 还是 Unit"的自信信号）

修复需要解决数据采集和 DB fallback 两个环节，再在引擎层加一条正向验证。设计方案见 `VALUATION_V2_DESIGN.md`。
