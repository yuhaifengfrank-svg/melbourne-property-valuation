# CURRENT_STATUS.md

最后更新: 2026-06-11 00:44 AEST — ⚠️ 由 `scripts/update-status.mjs` 自动生成，请勿手动编辑。

## 项目 & 分支

| 项 | 值 |
|---|---|
| 项目 | `/Users/FrankAI/Documents/澳洲房地产评估系统` |
| 分支 | `main` |
| HEAD | `180c834 reorg: consolidate scattered docs into docs/ subdirectory` |
| 远程同步 | `unknown` |
| Node | v24.15.0 / npm 11.12.1 |

## Production

**URL**: https://www.aushomevalue.com.au (canonical)
**Legacy URL**: https://aushomevalue.vercel.app (共存，无 301)

## 测试

```
ℹ tests 72
ℹ suites 14
ℹ pass 63
ℹ fail 9
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
✖ failing tests:
```

测试状态: ⚠️ 16 fail

### 失败测试

- 本地环境可返回 sufficient
- P1: 数据可信度
- useDatabaseFallback:true 带 mock DB 返回 limited
- CDP ≥3 collector comps 时 DB 不被调用
- DB verified 映射为 sufficient
- 仅 unverified DB 记录不触发 sufficient
- P1: 数据库 source
- 3条单源记录仍可生成初步估值
- P3: 来源验证规则
- P2: 上传文件不自动调整估值
- 场景3: 地址含 Oakleigh South + Suburb=Oakleigh → 以地址为准, 三者一致
- P4: 前端代码契约检查
- regression-test.mjs
- 场景3: 地址含 Oakleigh South + Suburb=Oakleigh → 以地址为准，canonical/payload/subject 一致
- 地址解析 - 真实函数执行测试
- failing tests:


---

*此文件由 `scripts/update-status.mjs` 生成。运行 `npm run update-status` 刷新。*
