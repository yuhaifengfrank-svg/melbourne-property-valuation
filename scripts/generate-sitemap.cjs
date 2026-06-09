#!/usr/bin/env node
/**
 * generate-sitemap.cjs — SEO sitemap.xml generator
 *
 * Scans /public for .html files and /public/suburb/*.html
 * Writes sitemap.xml to /public/.
 *
 * Usage: node scripts/generate-sitemap.cjs
 * Output: public/sitemap.xml
 *
 * Run after generating new suburb pages or top-N pages.
 * Vercel rewrite: /sitemap.xml → /public/sitemap.xml
 * (must be added to vercel.json)
 */

const fs = require('fs');
const path = require('path');

// Use canonical domain — must match <link rel="canonical"> in pages
// Change to production domain when live
const BASE = 'https://www.aushomevalue.com.au';
const PUBLIC = path.join(__dirname, '..', 'public');

// Priority and changefreq mapping
const PRIORITY = {
  '/': '1.0',
  '/top-growth-suburbs-victoria.html': '0.9',
  '/top-value-suburbs-victoria.html': '0.9',
  '/top-yield-suburbs-victoria.html': '0.9',
  '/top-school-zone-suburbs-victoria.html': '0.9',
  '/top-supply-constrained-suburbs-victoria.html': '0.9',
  '/opportunities/index.html': '0.8',
};

const CHANGEFREQ = {
  '/': 'daily',
  '/suburb/': 'weekly',
  '/opportunities/': 'weekly',
};

function getPriority(urlPath) {
  return PRIORITY[urlPath] || '0.7';
}

function getChangefreq(urlPath) {
  if (urlPath === '/') return 'daily';
  if (urlPath.startsWith('/suburb/')) return 'weekly';
  if (urlPath.startsWith('/opportunities/')) return 'weekly';
  return 'weekly';
}

function collectUrls() {
  const urls = [];

  // Homepage
  urls.push({ path: '/', lastmod: getFileMtime(path.join(PUBLIC, 'index.html')) });

  // Top ranking pages (Phase 3A)
  const topPages = [
    'top-growth-suburbs-victoria.html',
    'top-value-suburbs-victoria.html',
    'top-yield-suburbs-victoria.html',
    'top-school-zone-suburbs-victoria.html',
    'top-supply-constrained-suburbs-victoria.html',
  ];
  for (const f of topPages) {
    const fullPath = path.join(PUBLIC, f);
    if (fs.existsSync(fullPath)) {
      urls.push({ path: '/' + f, lastmod: getFileMtime(fullPath) });
    }
  }

  // Research centre pages (Track C V1)
  const researchDir = path.join(PUBLIC, 'research');
  if (fs.existsSync(researchDir)) {
    const researchFiles = fs.readdirSync(researchDir).filter(f => f.endsWith('.html'));
    for (const f of researchFiles) {
      urls.push({ path: '/research/' + f, lastmod: getFileMtime(path.join(researchDir, f)) });
    }
  }

  // Opportunities category pages
  const oppDir = path.join(PUBLIC, 'opportunities');
  if (fs.existsSync(oppDir)) {
    const oppFiles = fs.readdirSync(oppDir).filter(f => f.endsWith('.html'));
    for (const f of oppFiles) {
      urls.push({ path: '/opportunities/' + f, lastmod: getFileMtime(path.join(oppDir, f)) });
    }
  }

  // Suburb pages
  const suburbDir = path.join(PUBLIC, 'suburb');
  if (fs.existsSync(suburbDir)) {
    const suburbFiles = fs.readdirSync(suburbDir).filter(f => f.endsWith('.html'));
    for (const f of suburbFiles) {
      urls.push({ path: '/suburb/' + f, lastmod: getFileMtime(path.join(suburbDir, f)) });
    }
  }

  return urls;
}

function getFileMtime(fullPath) {
  try {
    const stat = fs.statSync(fullPath);
    return stat.mtime.toISOString().split('T')[0]; // YYYY-MM-DD
  } catch {
    return '2026-06-09';
  }
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildXml(urls) {
  const entries = urls
    .map(u => {
      const loc = escapeXml(BASE + u.path);
      const lastmod = u.lastmod;
      const priority = getPriority(u.path);
      const changefreq = getChangefreq(u.path);
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

function main() {
  const urls = collectUrls();
  console.log(`Collected ${urls.length} URLs for sitemap`);

  const xml = buildXml(urls);
  const outPath = path.join(PUBLIC, 'sitemap.xml');
  fs.writeFileSync(outPath, xml, 'utf-8');
  console.log(`Wrote ${outPath} (${xml.length} bytes)`);

  // Summary
  const suburbCount = urls.filter(u => u.path.startsWith('/suburb/')).length;
  const oppCount = urls.filter(u => u.path.startsWith('/opportunities/')).length;
  const topCount = urls.filter(u => u.path.startsWith('/top-')).length;
  console.log(`  Homepage: 1`);
  console.log(`  Top ranking pages: ${topCount}`);
  console.log(`  Opportunity pages: ${oppCount}`);
  console.log(`  Suburb pages: ${suburbCount}`);
  console.log('Done.');

  // Validate
  const hasRoot = urls.some(u => u.path === '/');
  if (!hasRoot) console.warn('WARNING: No homepage in sitemap!');
}

main();
