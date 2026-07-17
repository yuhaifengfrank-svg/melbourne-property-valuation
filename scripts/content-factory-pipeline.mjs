#!/usr/bin/env node

/**
 * content-factory-pipeline.mjs — Content Factory V2
 *
 * 混合策略：Template 骨架 + 本地规则生成
 * 零 AI API 成本，内容工厂全自动运行。
 *
 * 数据来源：www.aushomevalue.com.au API（免数据库直连）
 *
 * 产出：
 *   1. public/blog/YYYY/WEEK/blog-slug.html  (站内博客 HTML)
 *   2. output/social/WEEK/xiaohongshu-N-slug.md (小红书文案)
 *   3. public/sitemap.xml 自动更新
 *
 * 用法：
 *   node scripts/content-factory-pipeline.mjs
 *
 * 内容选择策略：
 *   - 每周选择 5 个尚未生成博客的 suburb（按机会分排序）
 *   - 新 suburb 优先（score 高的优先写）
 *   - 全部写完后发空运行（每周检查即可）
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');
const BLOG_DIR = resolve(PUBLIC, 'blog');
const OUTPUT_DIR = resolve(ROOT, 'output', 'social');
const SITEMAP_PATH = resolve(PUBLIC, 'sitemap.xml');
const API = 'https://www.aushomevalue.com.au/api/opportunity?action=top';

// ── 配置 ──
const MAX_PER_WEEK = 5;
const DATE = new Date();
const Y = DATE.getFullYear();
const M = String(DATE.getMonth() + 1).padStart(2, '0');
const D = String(DATE.getDate()).padStart(2, '0');

// ── Week ID (ISO 8601) ──
function isoWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3);
  const firstThursday = d.valueOf();
  d.setMonth(0, 1);
  if (d.getDay() !== 4) d.setMonth(0, 1 + ((4 - d.getDay()) + 7) % 7);
  return `${d.getFullYear()}-W${String(Math.ceil((((firstThursday - d) / 86400000) + d.getDay() + 1) / 7)).padStart(2, '0')}`;
}
const WEEK_ID = isoWeek(new Date());

// ── 工具函数 ──

function slugify(text) {
  return text.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function fmtPrice(price) {
  if (!price && price !== 0) return '数据暂无';
  return `$${(price / 1000).toFixed(0)}K`;
}

const TYPE_ZH = {
  'Growth Opportunity': '增长型 📈',
  'Value Opportunity': '价值型 💎',
  'Cashflow Opportunity': '现金流型 💰',
  'School Opportunity': '学区型 🏫',
  'Income Opportunity': '收益型 💵',
  'Infrastructure Opportunity': '基建型 🏗️',
  'Balanced Opportunity': '平衡型 ⚖️',
};
const BAND_ZH = {
  'Strong': '强势',
  'Balanced': '均衡',
  'Developing': '发展中',
};

/**
 * 从 API 获取 suburb 数据
 */
async function fetchSuburbs() {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  if (!data.ok || !data.opportunities) throw new Error('API 返回格式异常');
  return data.opportunities;
}

/**
 * 获取本周已生成的 slug
 */
function getExistingSlugs() {
  const slugs = new Set();
  const weekDir = resolve(BLOG_DIR, String(Y), WEEK_ID);
  if (existsSync(weekDir)) {
    readdirSync(weekDir).forEach(f => {
      if (f.endsWith('.html')) slugs.add(f.replace('.html', ''));
    });
  }
  return slugs;
}

/**
 * 获取所有已生成的 blog slug（跨周）
 */
function getAllBlogSlugs() {
  const slugs = new Set();
  const blogYearDir = resolve(BLOG_DIR, String(Y));
  if (existsSync(blogYearDir)) {
    for (const weekDir of readdirSync(blogYearDir)) {
      const full = resolve(blogYearDir, weekDir);
      if (!existsSync(full) || !readdirSync) continue;
      try {
        for (const f of readdirSync(full)) {
          if (f.endsWith('.html')) slugs.add(f.replace('.html', ''));
        }
      } catch {}
    }
  }
  return slugs;
}

// ── 小红书文案生成 ──

function generateXiaohongshu(suburb, index) {
  const price = fmtPrice(suburb.medianHousePrice || suburb.selectedMedianPrice);
  const score = suburb.futureOpportunityIndex || 0;
  const type = TYPE_ZH[suburb.opportunityType] || suburb.opportunityType || '平衡型';
  const band = BAND_ZH[suburb.band] || suburb.band || '';
  const school = suburb.schoolScore != null ? `${Math.round(suburb.schoolScore)}/100` : '数据有限';
  const vacancy = suburb.vacancyRate != null ? `${suburb.vacancyRate}%` : 'N/A';
  const growthSignal = suburb.why?.find(w => w.includes('growth') || w.includes('Supply')) || '';
  const rentalSignal = suburb.why?.find(w => w.includes('Rental') || w.includes('Income')) || '';

  // 亮点
  let highlight = '';
  const scoreNum = score;
  if (scoreNum >= 65) {
    highlight = `${suburb.suburb} 机会分 ${Math.round(scoreNum)}/100，在维州郊区中属于优质选项。`;
  } else if (scoreNum >= 60) {
    highlight = `${suburb.suburb} 机会分 ${Math.round(scoreNum)}/100，各项指标均衡。`;
  } else {
    highlight = `${suburb.suburb} 机会分 ${Math.round(scoreNum)}/100，发展中市场值得关注。`;
  }

  if (suburb.why?.length) {
    const wy = suburb.why[0];
    if (wy.includes('Supply')) highlight += ` 供应紧张是其主要驱动因素。`;
    else if (wy.includes('School')) highlight += ` 学区质量是其核心优势。`;
    else if (wy.includes('Rental') || wy.includes('Income')) highlight += ` 租金收益表现良好。`;
    else if (wy.includes('Budget')) highlight += ` 价格适中，性价比突出。`;
  }

  const slug = slugify(suburb.suburb) + '-' + (suburb.state || 'vic').toLowerCase();
  const confidence = suburb.confidence ? `【${suburb.confidence}信心度】` : '';

  const lines = [
    `【维州房产】${suburb.suburb} — ${band} ${type} ${confidence}🏠`,
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    highlight,
    '',
    '📊 关键数据一览：',
    `📍 中位价：${price}`,
    `🏫 学区评分：${school}`,
    `📉 空置率：${vacancy}`,
    `🔢 综合机会分：${Math.round(scoreNum)}/100`,
    `🏷️ 类型：${type}`,
    '',
    growthSignal ? `📈 信号：${growthSignal}` : '',
    rentalSignal ? `💰 信号：${rentalSignal}` : '',
    '',
    suburb.why?.filter(w => w !== growthSignal && w !== rentalSignal).slice(0, 2).map(w => `• ${w}`).join('\n') || '',
    '',
    '━━━━━━━━━━━━━━━━',
    '',
    '🔍 免费查看完整估值 + 算算你能贷多少',
    `👉 aushomevalue.com.au`,
    `👉 aushomevalue.com.au/suburb/${slug}`,
    '',
    '⚠️ 数据仅供参考，不构成投资建议。房产投资需结合实地考察和专业意见。',
    '',
    `#澳洲房产 #维州房产 #${suburb.suburb} #墨尔本买房 #房产投资 #房产评估 #AusHomeValue #墨尔本郊区`,
  ].filter(Boolean).join('\n');

  return lines;
}

// ── 博客 HTML 生成 ──

function generateBlogHTML(suburb, peers) {
  const slug = slugify(suburb.suburb) + '-' + (suburb.state || 'vic').toLowerCase();
  const price = fmtPrice(suburb.medianHousePrice || suburb.selectedMedianPrice);
  const unitPrice = fmtPrice(suburb.medianUnitPrice);
  const score = Math.round(suburb.futureOpportunityIndex || 0);
  const band = BAND_ZH[suburb.band] || suburb.band || '';
  const type = suburb.opportunityType || 'Balanced';
  const typeZh = TYPE_ZH[type] || type;
  const school = suburb.schoolScore != null ? Math.round(suburb.schoolScore) : null;
  const infra = suburb.infrastructureScore != null ? Math.round(suburb.infrastructureScore) : null;
  const supply = suburb.supplyConstraintScore != null ? Math.round(suburb.supplyConstraintScore) : null;
  const vacancy = suburb.vacancyRate;
  const yield_ = suburb.grossYield;
  const confidence = suburb.confidence || 'Medium';
  const why = suburb.why || [];
  const risks = suburb.risks || [];

  const pubDate = new Date(DATE);
  pubDate.setDate(pubDate.getDate() - ((pubDate.getDay() + 6) % 7));
  const pubDateStr = pubDate.toISOString().split('T')[0];

  const title = `${suburb.suburb} 房产分析 ${Y} — 机会评分 ${score}/100 | AusHomeValue`;
  const desc = `${suburb.suburb} 维州房产市场分析：机会评分 ${score}/100，中位价 ${price}，学区 ${school || '数据有限'}，置信度 ${confidence}。`;

  const peersHTML = (peers && peers.length > 0)
    ? peers.slice(0, 4).map(p => {
        const ps = slugify(p.suburb) + '-' + (p.state || 'vic').toLowerCase();
        return `<tr>
          <td><a href="https://www.aushomevalue.com.au/suburb/${ps}">${p.suburb}</a></td>
          <td>${fmtPrice(p.medianHousePrice || p.selectedMedianPrice)}</td>
          <td>${p.schoolScore != null ? Math.round(p.schoolScore) + '/100' : 'N/A'}</td>
          <td>${p.futureOpportunityIndex != null ? Math.round(p.futureOpportunityIndex) + '/100' : 'N/A'}</td>
        </tr>`;
      }).join('\n')
    : '';

  const whyHTML = why.length > 0
    ? `<ul>${why.map(w => `<li>${w}</li>`).join('\n')}</ul>`
    : '<p>基于多维度数据模型的综合评估。</p>';

  const riskHTML = risks.length > 0
    ? `<ul>${risks.map(r => `<li>${r}</li>`).join('\n')}</ul>`
    : '<p>当前数据未发现明确风险信号。</p>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="https://www.aushomevalue.com.au/blog/${Y}/${WEEK_ID}/${slug}">
  <meta name="robots" content="index, follow">
  <meta property="article:published_time" content="${pubDateStr}">
  <meta property="article:author" content="AusHomeValue">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="https://www.aushomevalue.com.au/blog/${Y}/${WEEK_ID}/${slug}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${suburb.suburb} 房产分析 ${Y}",
    "description": "${desc}",
    "author": { "@type": "Organization", "name": "AusHomeValue" },
    "datePublished": "${pubDateStr}",
    "publisher": { "@type": "Organization", "name": "AusHomeValue" }
  }
  </script>
  <style>
    .blog-container { max-width: 800px; margin: 0 auto; padding: 24px 16px; line-height: 1.8; }
    .blog-container h1 { font-size: 1.8em; margin-bottom: 8px; }
    .blog-container .meta { color: #6b7280; font-size: 0.9em; margin-bottom: 24px; }
    .blog-container h2 { font-size: 1.3em; margin: 28px 0 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    .blog-container .data-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .blog-container .data-table th, .blog-container .data-table td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
    .blog-container .data-table th { background: #f3f4f6; font-weight: 600; }
    .blog-container .highlight-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .blog-container .cta-box { background: #f0f7ff; border: 1px solid #b8d4fe; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
    .blog-container .cta-box a { display: inline-block; background: #2563eb; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
    .blog-container .cta-box a:hover { background: #1d4ed8; }
    .blog-container ul { padding-left: 20px; }
    .blog-container li { margin: 6px 0; }
  </style>
</head>
<body>
  <div class="blog-container">
    <h1>${suburb.suburb} — 房产市场深度分析（${Y}）</h1>
    <div class="meta">📅 ${pubDateStr} · 📍 ${suburb.suburb}, ${suburb.state || 'VIC'} · 🔢 机会评分 ${score}/100 · ${confidence}</div>

    <p>${suburb.suburb} 位于维州${suburb.state === 'VIC' ? '墨尔本' : suburb.state}地区，在我们的数据评估体系中获得了 <strong>${score}/100</strong> 的综合机会评分，${band}市场，类型为 <strong>${typeZh}</strong>。置信度：${confidence}。</p>

    <h2>📊 核心数据</h2>
    <table class="data-table">
      <tr><th>指标</th><th>数据</th></tr>
      <tr><td>中位房价</td><td>${price}</td></tr>
      <tr><td>中位单元房价格</td><td>${unitPrice}</td></tr>
      <tr><td>学区评分</td><td>${school != null ? school + '/100' : '数据有限'}</td></tr>
      <tr><td>基建评分</td><td>${infra != null ? infra + '/100' : '数据有限'}</td></tr>
      <tr><td>供应约束分</td><td>${supply != null ? supply + '/100' : '数据有限'}</td></tr>
      <tr><td>空置率</td><td>${vacancy != null ? vacancy + '%' : 'N/A'}</td></tr>
      <tr><td>毛租金回报</td><td>${yield_ != null ? yield_ + '%' : 'N/A'}</td></tr>
    </table>

    <h2>📈 评分驱动因素</h2>
    ${whyHTML}

    <h2>⚠️ 注意事项</h2>
    ${riskHTML}

    <h2>📋 综合评级</h2>
    <div class="highlight-box">
      <strong>机会评分：</strong>${score}/100 — ${score >= 65 ? '优质机会，各项指标积极。' : score >= 55 ? '良好机会，市场表现均衡。' : '发展中市场，需结合实际考察。'}<br>
      <strong>投资类型：</strong>${typeZh}<br>
      <strong>置信度：</strong>${confidence}<br>
      <strong>数据更新：</strong>${suburb.dataUpdated || pubDateStr}
    </div>

    ${peersHTML ? `
    <h2>🔍 同类郊区对比</h2>
    <table class="data-table">
      <tr><th>郊区</th><th>中位价</th><th>学区</th><th>机会分</th></tr>
      ${peersHTML}
    </table>` : ''}

    <h2>🔬 数据来源与方法</h2>
    <p>分析基于 AusHomeValue 多维度评分模型（模型版本：${suburb.modelVersion || 'future_outlook_v1'}），涵盖可负担性、收入、需求、供应、基建、学区等多个维度。数据通过公开市场和统计渠道获取。</p>
    <p>综合机会指数（Future Opportunity Index）为 0-100 的 3-5 年方向性筛选信号，<strong>非价格预测、非投资建议</strong>。</p>

    <div class="cta-box">
      <p><strong>想了解 ${suburb.suburb} 某套房产的具体估值？</strong></p>
      <p>输入地址，免费获取估值 + LVR 计算</p>
      <a href="https://www.aushomevalue.com.au">开始免费估值 →</a>
    </div>

    <hr style="margin: 32px 0;">
    <p style="color: #9ca3af; font-size: 0.85em;">
      免责声明：本分析基于可获得的公开数据及 AusHomeValue 模型生成，仅供研究参考。<br>
      不构成投资、法律或财务建议。房产投资有风险，请结合实地考察和专业意见做出决策。
    </p>
  </div>
</body>
</html>`;
}

// ── 博客索引页生成 ──

function generateBlogIndex(allSlugs, allSuburbs) {
  const suburbMap = {};
  if (allSuburbs) {
    for (const s of allSuburbs) {
      const slug = slugify(s.suburb) + '-' + (s.state || 'vic').toLowerCase();
      suburbMap[slug] = s;
    }
  }

  // 扫描所有已存在的博客文件（跨周）
  const entries = [];
  const blogYearDir = resolve(PUBLIC, 'blog', String(Y));
  if (existsSync(blogYearDir)) {
    for (const weekDir of readdirSync(blogYearDir)) {
      const full = resolve(blogYearDir, weekDir);
      if (!existsSync(full)) continue;
      let stats;
      try { stats = readdirSync(full); } catch { continue; }
      for (const f of stats) {
        if (!f.endsWith('.html') || f === 'index.html') continue;
        const slug = f.replace('.html', '');
        const s = suburbMap[slug];
        entries.push({
          slug,
          suburb: s ? s.suburb : slug.replace(/-vic$|-nsw$|-qld$|-sa$|-wa$|-tas$|-act$|-nt$/i, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          score: s ? Math.round(s.futureOpportunityIndex || 0) : null,
          weekId: weekDir,
          band: s ? (BAND_ZH[s.band] || s.band || '') : '',
          opportunityType: s ? (TYPE_ZH[s.opportunityType] || s.opportunityType || '') : '',
          confidence: s ? (s.confidence || '') : '',
        });
      }
    }
  }

  // 按周排序（最新在前）
  entries.sort((a, b) => b.weekId.localeCompare(a.weekId));

  const cards = entries.map(e => {
    const scoreBadge = e.score ? `<span class="tag tag-score">${e.score}/100</span>` : '';
    const bandBadge = e.band ? `<span class="tag tag-band">${e.band}</span>` : '';
    const typeBadge = e.opportunityType ? `<span class="tag tag-type">${e.opportunityType}</span>` : '';
    const confBadge = e.confidence ? `<span class="tag tag-conf">${e.confidence}</span>` : '';
    return `    <div class="blog-card">
      <h2><a href="/blog/${Y}/${e.weekId}/${e.slug}">${e.suburb} — Market Analysis</a></h2>
      <div class="meta">Week ${e.weekId.replace(/^.*-W/, 'Week ')} · ${Y}</div>
      <p>Data-driven suburb analysis covering median price, opportunity score, school zone quality, rental yield, supply constraints and comparable suburbs.</p>
      <div class="tags">
        <span class="tag tag-vic">VIC</span>
        ${scoreBadge}
        ${bandBadge}
        ${typeBadge}
        ${confBadge}
      </div>
    </div>`;
  }).join('\n\n');

  const today = DATE.toISOString().split('T')[0];

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Suburb Research &amp; Market Analysis | AusHomeValue</title>
  <meta name="description" content="In-depth suburb market analysis for Victorian property. Data-driven research on opportunity scores, median prices, school zones, rental yields and more." />
  <link rel="canonical" href="https://www.aushomevalue.com.au/blog/" />
  <meta property="og:title" content="Suburb Research &amp; Market Analysis | AusHomeValue" />
  <meta property="og:description" content="In-depth suburb market analysis for Victorian property." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://www.aushomevalue.com.au/blog/" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, system-ui, -apple-system, sans-serif;
      background: #f4f6f5; color: #17211d; line-height: 1.6;
    }
    a { color: #0d6b57; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .topbar {
      background: linear-gradient(135deg, #0d6b57 0%, #0a8f6e 100%);
      color: white; padding: 14px 24px; position: sticky; top: 0; z-index: 100;
    }
    .topbar .inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: 16px; }
    .topbar a { color: white; font-weight: 600; font-size: 1.1rem; }
    .topbar .back { opacity: 0.85; font-size: 0.95rem; }
    .topbar .back:hover { opacity: 1; text-decoration: none; }
    .container { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    h1 { font-size: clamp(1.5rem, 4vw, 2rem); font-weight: 800; line-height: 1.25; margin-bottom: 8px; color: #0d2b24; }
    .page-desc { color: #4a5650; font-size: 0.95rem; max-width: 680px; margin-bottom: 28px; line-height: 1.6; }
    .blog-list { display: flex; flex-direction: column; gap: 16px; }
    .blog-card {
      background: white; border: 1px solid #dbe2de; border-radius: 10px;
      padding: 20px 24px; transition: box-shadow 0.15s, transform 0.12s;
    }
    .blog-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.06); transform: translateY(-1px); }
    .blog-card h2 { font-size: 1.15rem; font-weight: 700; margin-bottom: 6px; }
    .blog-card h2 a { color: #0d2b24; }
    .blog-card h2 a:hover { color: #0d6b57; }
    .blog-card .meta { font-size: 0.85rem; color: #66736d; margin-bottom: 8px; }
    .blog-card p { font-size: 0.92rem; color: #4a5650; line-height: 1.55; }
    .blog-card .tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
    .tag { font-size: 0.78rem; padding: 2px 10px; border-radius: 30px; font-weight: 500; }
    .tag-vic { background: #e8eaed; color: #444; }
    .tag-score { background: #e8f3ef; color: #0d6b57; }
    .tag-band { background: #f0e8d8; color: #7a5a2a; }
    .tag-type { background: #e3eef5; color: #1a5a7a; }
    .tag-conf { background: #f5ede3; color: #7a5a1a; }
    .footer { text-align: center; padding: 40px 20px; color: #9ca3af; font-size: 0.85rem; }
    .empty { color: #66736d; padding: 40px; text-align: center; }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="inner">
      <a href="/" class="back">← AusHomeValue</a>
      <span style="opacity:0.7; font-size:0.9rem;">/ Suburb Research</span>
    </div>
  </div>
  <div class="container">
    <h1>🏡 Suburb Research</h1>
    <p class="page-desc">Data-driven analysis of Victorian suburbs, generated weekly from our property intelligence model. Each article covers median prices, opportunity scores, school zones, supply constraints and rental dynamics.</p>

    <p style="margin-bottom:20px; color:#66736d; font-size:0.85rem;">Updated ${today} &middot; ${entries.length} articles</p>

    <div class="blog-list">
${cards}
    </div>
  </div>
  <div class="footer">
    <p>⚠️ All data for research reference only. Not investment advice.</p>
    <p>&copy; 2026 AusHomeValue &mdash; Australian Property Intelligence</p>
  </div>
</body>
</html>`;

  const indexPath = resolve(PUBLIC, 'blog', 'index.html');
  writeFileSync(indexPath, html);
  return entries.length;
}

// ── Sitemap 更新 ──

function updateSitemap(newSlugs) {
  let existing = '';
  try { existing = readFileSync(SITEMAP_PATH, 'utf-8'); } catch {
    existing = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>';
  }

  const today = DATE.toISOString().split('T')[0];
  const existingUrls = new Set();
  existing.replace(/<loc>(.*?)<\/loc>/g, (_, loc) => existingUrls.add(loc));

  let newEntries = '';
  for (const slug of newSlugs) {
    const url = `https://www.aushomevalue.com.au/blog/${Y}/${WEEK_ID}/${slug}.html`;
    if (!existingUrls.has(url)) {
      newEntries += `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    }
  }

  if (!newEntries) {
    return false;
  }

  const updated = existing.replace('</urlset>', newEntries + '</urlset>');
  writeFileSync(SITEMAP_PATH, updated);
  return true;
}

// ── 主流程 ──

async function main() {
  console.log(`\n🔧 Content Factory V2 — ${Y} ${WEEK_ID}`);
  console.log(`📅 ${Y}-${M}-${D}`);
  console.log('━'.repeat(54));

  // 1. 拉数据
  console.log('\n[1/4] 从 API 获取 suburb 数据...');
  const allSuburbs = await fetchSuburbs();
  console.log(`  → ${allSuburbs.length} 个郊区数据`);

  // 2. 选本周要写的 suburb
  const existingSlugs = getExistingSlugs();
  const allBlogSlugs = getAllBlogSlugs();
  const available = allSuburbs.filter(s => {
    const slug = slugify(s.suburb) + '-' + (s.state || 'vic').toLowerCase();
    return !existingSlugs.has(slug);
  });
  const selected = available.slice(0, MAX_PER_WEEK);
  console.log(`[2/4] 选择 ${selected.length} 个（本周已写 ${existingSlugs.size}，历史总计 ${allBlogSlugs.size}，剩余 ${available.length}）`);

  if (selected.length === 0) {
    console.log('\n✅ 本周 suburb 已全部覆盖！');
    console.log(`   总计已写 ${allBlogSlugs.size} 篇博客`);
    return { wrote: 0, newSlugs: [] };
  }

  // 3. 生成内容
  console.log('\n[3/4] 生成内容...');
  const weekDir = resolve(BLOG_DIR, String(Y), WEEK_ID);
  mkdirSync(weekDir, { recursive: true });
  const socialDir = resolve(OUTPUT_DIR, WEEK_ID);
  mkdirSync(socialDir, { recursive: true });

  const newSlugs = [];

  for (let i = 0; i < selected.length; i++) {
    const suburb = selected[i];
    const slug = slugify(suburb.suburb) + '-' + (suburb.state || 'vic').toLowerCase();
    newSlugs.push(slug);

    // 同类郊区
    const peers = allSuburbs
      .filter(s => s.opportunityType === suburb.opportunityType && s.suburb !== suburb.suburb)
      .sort((a, b) => (b.futureOpportunityIndex || 0) - (a.futureOpportunityIndex || 0))
      .slice(0, 4);

    // 博客
    const blogHtml = generateBlogHTML(suburb, peers);
    writeFileSync(resolve(weekDir, `${slug}.html`), blogHtml);
    console.log(`  📝 博客 [${i + 1}/${selected.length}]: ${suburb.suburb} ✓`);

    // 小红书
    const xhs = generateXiaohongshu(suburb, i + 1);
    writeFileSync(resolve(socialDir, `xiaohongshu-${i + 1}-${slug}.md`), xhs);
    console.log(`  📕 小红书 [${i + 1}/${selected.length}]: ${suburb.suburb} ✓`);
  }

  // 4. 更新 sitemap
  console.log('\n[4/4] 更新 sitemap...');
  const sitemapUpdated = updateSitemap(newSlugs);
  console.log(`  🗺️  ${sitemapUpdated ? '已添加 ' + newSlugs.length + ' 个 URL' : '无需更新'}`);

  // 5. 重新生成 blog index
  console.log('\n[5/5] 生成博客索引页...');
  const indexCount = generateBlogIndex(null, allSuburbs);
  console.log(`  📋 ${indexCount} 篇博客 → public/blog/index.html`);

  // 写入运行标记
  const stampDir = resolve(ROOT, '.content-factory');
  mkdirSync(stampDir, { recursive: true });
  writeFileSync(
    resolve(stampDir, `run-${Y}-${WEEK_ID}.json`),
    JSON.stringify({ week: WEEK_ID, date: `${Y}-${M}-${D}`, count: selected.length, slugs: newSlugs, sitemapUpdated }, null, 2)
  );

  console.log('\n' + '━'.repeat(54));
  console.log(`✅ Content Factory 完成！`);
  console.log(`   📝 博客 ${selected.length} 篇 → public/blog/${Y}/${WEEK_ID}/`);
  console.log(`   📕 小红书 ${selected.length} 篇 → output/social/${WEEK_ID}/`);
  console.log(`   🗺️  ${sitemapUpdated ? 'sitemap 已更新' : 'sitemap 无需更新'}`);
  console.log(`   📋 博客索引已刷新 → public/blog/index.html (${indexCount} 篇)`);
  console.log('');
  console.log('📱 小红书发布步骤：');
  console.log(`   cd output/social/${WEEK_ID}/`);
  console.log('   cat xiaohongshu-1-*.md  # 复制内容到小红书');
  console.log('');

  return { wrote: selected.length, newSlugs };
}

export { main, generateBlogHTML, generateXiaohongshu, generateBlogIndex, updateSitemap, slugify, fmtPrice };

// 直接运行
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch(err => {
    console.error('\n❌ Content Factory 失败:', err.message);
    process.exit(1);
  });
}
