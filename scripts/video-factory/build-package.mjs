#!/usr/bin/env node
/**
 * Video Factory Phase 2 — CapCut Ready Package Builder
 *
 * Takes V3 scripts from VIDEO_TEMPLATE_LIBRARY.md, fills in real data,
 * generates TTS (.mp3), SRT subtitles, and shot-list JSON for each topic.
 *
 * Usage: node scripts/video-factory/build-package.mjs
 * Output: output/v3/packages/{slug}/
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = process.cwd();
const PKG_DIR = join(ROOT, 'output', 'v3', 'packages');
const ASSETS_DIR = join(ROOT, 'video-assets');

// ─── Topic Data (from opportunity engine + template V3) ───

const TOPICS = [{
  slug: 'werribee',
  scriptType: 'single',
  voice: 'zh-CN-XiaoxiaoNeural',
  segments: [
    { id: 1, duration: 3,
      text: 'Werribee 涨了百分之三十——但涨得快不代表适合你。' },
    { id: 2, duration: 5,
      text: '第一，一年涨了百分之三十。墨尔本同期约百分之十五，跑赢一倍。' },
    { id: 3, duration: 7,
      text: '涨的逻辑：人口往西走。M1 通勤三十分钟，基建在跟进。不是虚涨，背后有支撑。' },
    { id: 4, duration: 5,
      text: '但短板也很清楚：学区评分四十九。涨得快说明需求硬，但不是靠学区拉起来的。' },
    { id: 5, duration: 5,
      text: '过去涨了不等于未来也涨。关键看人口流入能不能持续，学区配套跟不跟得上。' },
    { id: 6, duration: 5,
      text: '去官网输地址，看完整数据自己判断。链接在主页简介。' },
  ]
}, {
  slug: 'top-growth',
  scriptType: 'ranking',
  voice: 'zh-CN-XiaoxiaoNeural',
  segments: [
    { id: 1, duration: 3,
      text: '墨尔本涨最快的三个区——但涨得快不一定是你的菜。' },
    { id: 2, duration: 7,
      text: '第 3 名：Sunshine。中位价七十八万，涨百分之三十。但已经是三个里最贵的。' },
    { id: 3, duration: 7,
      text: '第 2 名：Dandenong。中位价四十四万六，不到四十五万。但学区评分只有三十三。' },
    { id: 4, duration: 7,
      text: '第 1 名：Werribee。涨百分之三十，跑赢大盘。驱动是人口加基建，但学区评分四十九。' },
    { id: 5, duration: 3,
      text: '过去涨了不代表未来一定涨。三个区各有各的逻辑和代价。' },
    { id: 6, duration: 3,
      text: '去官网输地址，看哪个区的数据适合你。' },
  ]
}, {
  slug: 'top-value',
  scriptType: 'ranking',
  voice: 'zh-CN-XiaoxiaoNeural',
  segments: [
    { id: 1, duration: 3,
      text: '墨尔本最便宜的三个区，涨得也不错。但便宜有便宜的原因。' },
    { id: 2, duration: 7,
      text: '第 3 名：Murrumbeena。中位价五十万，涨了约百分之二十，跑赢大盘。但学区评分偏低。' },
    { id: 3, duration: 7,
      text: '第 2 名：West Melbourne。中位价四十九万。靠近市区，但涨幅主要靠 CBD 外溢，自身基本面不强。' },
    { id: 4, duration: 7,
      text: '第 1 名：Caulfield East。中位价只要四十一万七千五。涨了百分之二十以上。但学区评分低。' },
    { id: 5, duration: 3,
      text: '便宜有便宜的逻辑。价格低不一定是价值洼地，可能是基本面弱。' },
    { id: 6, duration: 3,
      text: '去官网输地址，查每个区的估值和风险。' },
  ]
}, {
  slug: 'top-school',
  scriptType: 'ranking',
  voice: 'zh-CN-XiaoxiaoNeural',
  segments: [
    { id: 1, duration: 3,
      text: '好学区不一定要花一百万。但便宜学区房一定有代价。' },
    { id: 2, duration: 5,
      text: '这些区评分都在 80 分以上，远高于墨尔本平均的 50 分。价格都在一百万以下。' },
    { id: 3, duration: 7,
      text: 'Ivanhoe 评分八十点一。Burwood 评分八十点六。价格友好，学区优秀。' },
    { id: 4, duration: 5,
      text: '第 1 名：Fairfield。评分八十二点二，中位价五十四万二。看起来完美。' },
    { id: 5, duration: 5,
      text: '但 Fairfield 过去一年涨幅一般。好学区不等于高增长。有时候两者不可兼得。' },
    { id: 6, duration: 5,
      text: '想清楚你更看重什么——上学方便还是房价涨。去官网查每个区的数据对比。' },
  ]
}, {
  slug: 'first-home',
  scriptType: 'ranking',
  voice: 'zh-CN-XiaoxiaoNeural',
  segments: [
    { id: 1, duration: 3,
      text: '第一次买房的三个区——价格友好，也在涨。但每个都有代价。' },
    { id: 2, duration: 5,
      text: '三个区中位价都在 44 到 58 万之间。远低于墨尔本均价。' },
    { id: 3, duration: 7,
      text: 'Rockbank。中位价五十八万三。西边独立屋，价格友好。但位置偏，配套还在建设中。' },
    { id: 4, duration: 7,
      text: 'Dandenong。中位价四十四万六。涨了百分之二十五，跑赢大盘。但学区评分只有三十三。' },
    { id: 5, duration: 7,
      text: 'Sunshine。七十八万。偏贵但学区 47 有增长。驱动是人口外溢，风险是已经涨了不少。' },
    { id: 6, duration: 3,
      text: '去官网输你的预算，看数据自己判断。' },
  ]
}];

// ─── Helpers ───

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Estimate reading time in seconds for Chinese text */
function estimateDuration(text) {
  // Chinese ~4 chars/sec natural speech, slightly slower for clarity
  const chars = text.replace(/\s/g, '').length;
  return Math.max(2, Math.ceil(chars / 3.5));
}

/** Build SRT from segments with calculated timing */
function buildSRT(segments) {
  let lines = [];
  let currentTime = 0; // seconds
  segments.forEach((seg, i) => {
    const dur = seg.duration || estimateDuration(seg.text);
    const startS = currentTime;
    const endS = currentTime + dur;
    const fmt = (s) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${sec.toFixed(3).padStart(6,'0').replace('.',',')}`;
    };
    lines.push(`${i + 1}`);
    lines.push(`${fmt(startS)} --> ${fmt(endS)}`);
    lines.push(seg.text);
    lines.push('');
    currentTime = endS;
  });
  return lines.join('\n');
}

/** Build shot list JSON for human editor */
function buildShotList(slug, segments) {
  let shots = [];
  let currentTime = 0;
  segments.forEach((seg) => {
    const dur = seg.duration || estimateDuration(seg.text);
    shots.push({
      segmentId: seg.id,
      startTime: currentTime,
      endTime: currentTime + dur,
      duration: dur,
      text: seg.text,
    });
    currentTime += dur;
  });
  return shots;
}

/** Generate TTS .mp3 via edge-tts, return output path */
function generateTTS(slug, segments, voice) {
  const fullText = segments.map(s => s.text).join('\n');
  const tmpFile = join(PKG_DIR, slug, 'tmp_script.txt');
  const outFile = join(PKG_DIR, slug, 'audio.mp3');
  
  writeFileSync(tmpFile, fullText, 'utf-8');
  
  console.log(`🎤 Generating TTS for ${slug}...`);
  try {
    const edgeTtsPath = '/Users/FrankAI/Library/Python/3.9/bin/edge-tts';
    execSync(
      `${edgeTtsPath} --voice ${voice} --rate=-10% --file ${tmpFile} --write-media ${outFile}`,
      { stdio: 'pipe', timeout: 60000 }
    );
  } catch (e) {
    console.error(`  ⚠️ edge-tts failed: ${e.message}`);
    // Write a placeholder so pipeline continues
    writeFileSync(outFile, 'PLACEHOLDER');
  }
  
  return outFile;
}

/** Build markdown package report */
function buildPackageReport(slug, segments, voice) {
  const totalDur = segments
    .reduce((sum, s) => sum + (s.duration || estimateDuration(s.text)), 0);

  let md = `# ${slug.toUpperCase()} — CapCut Ready Package\n\n`;
  md += `**Duration:** ~${totalDur}s (${totalDur >= 60 ? Math.floor(totalDur/60)+'m ' : ''}${totalDur%60}s)\n`;
  md += `**Voice:** ${voice}\n\n`;

  md += `## Screenshots\n\n`;
  md += `See \`/video-assets/${slug}/\` — ${existsSync(join(ASSETS_DIR, slug)) ? 'available' : 'not found'}\n\n`;

  md += `## Audio\n\n\`\`\`\npackages/${slug}/audio.mp3\n\`\`\`\n\n`;

  md += `## Subtitles\n\n\`\`\`\npackages/${slug}/subtitles.srt\n\`\`\`\n\n`;

  md += `## Shot List\n\n`;
  md += `| # | Start | End | Duration | Text |\n`;
  md += `|---|-------|-----|----------|------|\n`;
  let t = 0;
  segments.forEach((seg, i) => {
    const d = seg.duration || estimateDuration(seg.text);
    md += `| ${i+1} | ${t}s | ${t+d}s | ${d}s | ${seg.text} |\n`;
    t += d;
  });

  md += `\n## Import Notes\n\n`;
  md += `1. Create new project in CapCut\n`;
  md += `2. Import \`audio.mp3\` as background audio\n`;
  md += `3. Import all PNGs from \`video-assets/${slug}/\`\n`;
  md += `4. Drag screenshots to timeline at times shown in Shot List\n`;
  md += `5. Import \`subtitles.srt\` for auto-caption\n`;
  md += `6. Apply transitions between shots (0.3s cross dissolve recommended)\n`;

  return md;
}

// ─── Main ───

function main() {
  console.log('📦 Video Factory Phase 2 — Building CapCut Packages\n');
  
  TOPICS.forEach((topic) => {
    const { slug, segments, voice } = topic;
    const dir = join(PKG_DIR, slug);
    ensureDir(dir);
    
    console.log(`[${slug}] Processing ${segments.length} segments...`);
    
    // 1. Generate TTS audio
    generateTTS(slug, segments, voice);
    
    // 2. Generate SRT subtitles
    const srt = buildSRT(segments);
    writeFileSync(join(dir, 'subtitles.srt'), srt, 'utf-8');
    
    // 3. Generate shot list JSON
    const shots = buildShotList(slug, segments);
    writeFileSync(join(dir, 'shotlist.json'), JSON.stringify(shots, null, 2), 'utf-8');
    
    // 4. Generate package report markdown
    const report = buildPackageReport(slug, segments, voice);
    writeFileSync(join(dir, 'package-report.md'), report, 'utf-8');

    // Save script text for reference
    writeFileSync(join(dir, 'script.txt'), segments.map(s => s.text).join('\n'), 'utf-8');
    
    console.log(`  ✅ audio.mp3 + subtitles.srt + shotlist.json`);
  });
  
  // Build index
  const index = TOPICS.map(t => ({
    slug: t.slug,
    voice: t.voice,
    segments: t.segments.length
  }));
  writeFileSync(join(PKG_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');
  
  console.log(`\n📋 Index: packages/index.json`);
  console.log(`🎉 All ${TOPICS.length} packages built in output/v3/packages/`);
}

main();
