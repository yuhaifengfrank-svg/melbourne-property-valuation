# Video Factory Phase 2 — 交付总结

## 5 个 CapCut Ready Package

每个包包含：

| 文件 | 说明 |
|------|------|
| `audio.mp3` | Edge-TTS 中文女声（XiaoxiaoNeural）音频 |
| `subtitles.srt` | 逐段时间轴字幕，可直接导入剪映/CapCut |
| `shotlist.json` | 分镜时间轴 JSON（#/start/end/duration/text） |
| `script.txt` | 纯文本脚本 |
| `package-report.md` | 导入指引 + Shot List 表格 |

## 话题清单

| 包 | 时长 | 模板 | 内容风格 V3 |
|----|------|------|-------------|
| werribee | ~30s | A (Single Suburb) | 基准对比 + 驱动 + 风险 + 过去≠未来 |
| top-growth | ~30s | B (Growth+Opp) | 每个区标注风险 |
| top-value | ~30s | C (Value) | 便宜≠价值洼地 |
| top-school | ~30s | D (School) | 学区 vs 增长 trade-off |
| first-home | ~30s | E (First Buyer) | 每个区有代价 |

## TTS

- **引擎**: Edge-TTS（免费，微软 Azure 边缘）
- **音色**: zh-CN-XiaoxiaoNeural（女性，温暖新闻风）
- **语速**: -10%（略慢，适合数据类内容）

## 怎样用

1. 下载 `output/v3/packages/{slug}/` 文件夹
2. 新建 CapCut/剪映 项目
3. 导入 `audio.mp3`
4. 导入 `/video-assets/{slug}/` 下的截图 PNG
5. 导入 `subtitles.srt` → 自动生成字幕
6. 按 shotlist.json 的时间把截图拖到时间轴上
7. 加 0.3s 转场过渡即可导出
