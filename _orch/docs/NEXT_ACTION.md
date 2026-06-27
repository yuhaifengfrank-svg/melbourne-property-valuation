# NEXT_ACTION.md — Single Highest Priority Action

**Last updated:** 2026-06-26 22:50 AEST

---

## Current Priority: Data pipeline stabilization & suburb content creation

### Why this changed

6/26 完成了数据管线核心补全：自住率修复、G41 全面写入、undervaluation V2 模型上线。当前重点是**内容验证**和**小红书输出准备**，而非架构决策。

### Recent completion (2026-06-26)

| Item | Status |
|------|--------|
| 自住率修复 (G37) | ✅ |
| G41 dwelling 全面写入 (Step 5.5) | ✅ |
| 住房人均/库存 (Step 5.6) | ✅ |
| vacancy_rate_adjusted 修正 (Step 5.7/5.8) | ✅ |
| 20 suburb 数据完整性验证 | ✅ 19/20 达 95%+ 填充率 |
| Doncaster 小红书数据包交付 | ✅ |
| Undervaluation V1/V2 模型开发 | ✅ V2 已写入 Step 5.9 |
| Doncaster HHD 收入验证 | ✅ $1,595/周 (ABS G02, 确认有效) |

### 当前阻塞

| 阻塞项 | 状态 | 原因 |
|--------|------|------|
| VicPlan Phase C | ✅ **方案 A 已跑** | planning_cache 47,480→66,473 行。**明天验证 cache hit rate** → 达标后删大表 |
| Infrastructure 评分 | 🔴 无区分度 | 20 项目 + 20km 半径 → 全部归一化 100 |
| VPA FUS ETL | 🔴 Python 脚本崩溃 | KeyError: 'coordinates' — 多几何类型未处理 |
| Growth Corridor Score | 🔴 设计完成，0 行代码 | L1-L4 全空，需先建数据管线 |
| SeparateHouse 系数 | ⚠️ 用户说「先这样」 | 高密度公寓区干扰模型，暂不修复 |

### 下一步建议

## 明天（2026-06-27）优先级

1. 🔴 **VicPlan Phase C 验证** — 在 Production 上测几个 suburb 的 cache hit rate（curl /api/valuation ↗ 看 response 里 planningSignals 的 source 字段）。确认 >95% 后删 vicplan_zones + vicplan_overlays (248MB)
2. 🔴 **小红书第一篇** — 用 Doncaster 数据包出内容
3. 🟡 **Growth Corridor Score** — 已有完整设计框架（30/25/20/15/10 五层权重），等用户绿光
4. 🟡 **VPA FUS ETL** — 修 Python 脚本几何类型处理，推 Stage
5. 🟡 **Infrastructure** — 手动 INSERT 30+ 项目 + 收紧半径

### 遗留决策（待用户指示）

- Chrome CDP 位置
- raw 存储格式
- Promote 策略
- Growth Corridor Score 实现优先级
- `supply_is_growth_corridor` 数据方案

### Phase C 验证清单（明天做）

- [ ] 在 Production 上 curl 几个不同 suburb 的估值 API
- [ ] 确认 response 里 `planningSignals.source` = `"planning_cache"`
- [ ] 如果全部 cache hit → 删 vicplan_zones + vicplan_overlays
- [ ] 如果仍有 miss → 评估是否需要再加密度

### Do NOT

- Do NOT promote to Production before data collection architecture is stable
- Do NOT push main without review
- Do NOT deploy vercel --prod
- Do NOT run Phase C before observation period

### 密码状态

| 位置 | 状态 |
|------|------|
| 本地 `.env` | ✅ 新密码已写入，DB 连接正常 |
| Vercel Production | ✅ 已同步新密码，API 正常 |
