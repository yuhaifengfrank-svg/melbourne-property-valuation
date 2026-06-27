# Growth Corridor Score — 设计方案（讨论稿）

## 核心理念

不是二值 `is_growth_corridor = true/false`，而是 **0-100 的 Growth Corridor Score**。
分四层，从规划→供应→人口→市场，层层递进验证。

## 四层架构

### L1：规划（Planning Signal）
**分值范围：0-100**

| 条件 | 分值 |
|---|---|
| Within PSP (Precinct Structure Plan) | +40 |
| Within Activity Centre | +20 |
| Within SRL Station Zone | +20 |
| Within Major Precinct | +15 |
| Major Rezoning (recent VPA amendment) | +20 |
| Within Urban Growth Boundary | +10 |
| **合计上限** | **100** |

### L2：供应（Supply Signal）
**分值范围：0-100**

基于过去 5 年数据：
- Building Approvals（建筑审批量）
- Subdivision Activity（土地分割）
- Lot Supply Pipeline（地块供应）
- Dwelling Approval Trend（住房审批趋势）
- Construction Pipeline（建筑管道）

逻辑：未来供应很多 → Growth Corridor score 继续提高

### L3：人口（Demand Signal）
**分值范围：0-100**

- Population CAGR（5年人口复合增长率）
- Working Age Share（工龄人口占比）
- Migration Rate（净移民率）
- Young Family Share（年轻家庭占比）

逻辑：人往哪走 → 需求端验证

### L4：市场（Market Validation）
**分值范围：0-100**

- House Price Growth（房价增长）
- Land Value Trend（土地价值）
- Vacancy Rate（空置率）
- Rental Demand（租金需求）
- Employment Growth（就业增长）
- Income Growth（收入增长）

逻辑：市场有没有真正响应 → 需求是否有效转化

## 最终 Growth Corridor Score

```
Growth Corridor Score = L1 × W1 + L2 × W2 + L3 × W3 + L4 × W4
```

各层权重待定（取决于我们想强调规划前瞻性，还是市场验证）

## 与现有系统的关系

- 这是 **supply_growth_corridor_score** 的新计算方法
- 不替代 `supply_is_growth_corridor`（旧字段可能废弃）
- 写入 DB，可被 AI 消费
- 可与 opportunity_score / conviction_score / risk_score 并行
