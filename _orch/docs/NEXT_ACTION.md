# NEXT ACTION — 2026-07-15 11:25 AEST

## 下一步（新会话）

在最新的 Vercel Preview 上测试 Nominatim 解析是否恢复正常。

PR #9 已应用两个 Codex 补丁：
- `2f65d152` `fix: geocode Australian unit street addresses`（导入 `streetAddressForGeocoding`）
- `62c12aa5` `fix: support compact unit address formats`（`Unit1`/`FlatA` 紧凑格式 + `hasUnitDesignator` 导出）

最新 Preview URL: `https://aushomevalue-guqftcwvb-frankyhf.vercel.app`

### 验证步骤

1. 在 Preview 上提交 `Unit 1, 11 McIntosh Street, Oakleigh VIC 3166` 的估值请求
2. 检查返回的 valuation 数据：坐标是否正常，估值系数是否一致
3. 如果有问题，续查 Vercel 环境 Nominatim 可达性

## 第一句话
```
继续验证 PR #9 最新 Preview 的 Nominatim 解析结果。新 Preview URL: https://aushomevalue-guqftcwvb-frankyhf.vercel.app 。请用 Unit 1, 11 McIntosh Street, Oakleigh VIC 3166 提交一个估值请求，确认坐标是否解析成功。
```
```
