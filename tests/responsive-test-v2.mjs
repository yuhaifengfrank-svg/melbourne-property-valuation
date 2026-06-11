/**
 * responsive-test-v2.mjs — Playwright-based responsive layout tests
 *
 * V2: more precise overflow detection, counts only non-scrollable overflow.
 *
 * Run: node tests/responsive-test-v2.mjs
 * Requires: local server on port 3000 serving public/
 */

import { chromium, firefox, webkit } from 'playwright';

const BASE = 'http://localhost:3000';
const VIEWPORTS = [
  { width: 320, height: 568, label: '320' },
  { width: 375, height: 812, label: '375' },
  { width: 390, height: 844, label: '390' },
  { width: 430, height: 932, label: '430' },
  { width: 768, height: 1024, label: '768' },
  { width: 1024, height: 768, label: '1024' },
  { width: 1366, height: 768, label: '1366' },
  { width: 1440, height: 900, label: '1440' },
  /* landscape */
  { width: 736, height: 414, label: '736-landscape' },
];

const PAGES = [
  { path: '/index.html', name: 'homepage' },
  { path: '/top-growth-suburbs-victoria.html', name: 'top-growth' },
  { path: '/top-value-suburbs-victoria.html', name: 'top-value' },
  { path: '/suburb/werribee-vic.html', name: 'suburb-werribee' },
  { path: '/suburb/doncaster-vic.html', name: 'suburb-doncaster' },
  { path: '/opportunities/index.html', name: 'opp-index' },
  { path: '/opportunities/growth.html', name: 'opp-growth' },
];

const BROWSERS = [
  { name: 'Chromium', launcher: chromium },
];

const results = { pass: 0, fail: 0, warnings: [] };

function status(ok, msg) {
  if (ok) { results.pass++; } else { results.fail++; results.warnings.push(msg); }
}

async function main() {
  console.log('=== RESPONSIVE LAYOUT TEST SUITE V2 ===');
  console.log(`Pages: ${PAGES.length}, Viewports: ${VIEWPORTS.length}, Browsers: ${BROWSERS.length}\n`);

  for (const browserCfg of BROWSERS) {
    const browser = await browserCfg.launcher.launch({ headless: true });
    console.log(`\n━━━ ${browserCfg.name} ━━━`);

    for (const pageCfg of PAGES) {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({ viewport: vp, locale: 'en' });
        const page = await ctx.newPage();
        const label = `${pageCfg.name}@${vp.label}`;

        try {
          await page.goto(`${BASE}${pageCfg.path}`, { waitUntil: 'networkidle', timeout: 15000 });

          // 1. Precise overflow: find elements that overflow WITHOUT being in an overflow:auto/scroll container
          const overflowReport = await page.evaluate(() => {
            function isOverflowing(el) {
              const rect = el.getBoundingClientRect();

              // Skip body/html/100vw-wide containers
              const tag = el.tagName.toLowerCase();
              if (tag === 'html' || tag === 'body') return false;

              // Check if this element or any parent has overflow handling
              let parent = el.parentElement;
              let inScrollable = false;
              const origRect = rect; // save for iteration

              while (parent && parent !== document.body) {
                const cs = getComputedStyle(parent);
                if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflow === 'auto' || cs.overflow === 'scroll') {
                  inScrollable = true;
                  break;
                }
                if (cs.overflowX === 'hidden' || cs.overflow === 'hidden') {
                  // hidden parent won't overflow the body, but the element itself might be clipped
                  // skip this one — its overflow handled
                  return false;
                }
                parent = parent.parentElement;
              }

              if (inScrollable) return false;

              // Check actual overflow beyond viewport (right edge)
              const bodyRect = document.body.getBoundingClientRect();
              const viewW = window.innerWidth;
              return rect.right > viewW + 2;
            }

            const all = document.querySelectorAll('*');
            const overflowEls = [];
            for (const el of all) {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0 && isOverflowing(el)) {
                overflowEls.push({
                  tag: el.tagName.toLowerCase(),
                  id: el.id || '',
                  cls: el.className.slice(0,40),
                  w: Math.round(r.width),
                  right: Math.round(r.right),
                  viewW: window.innerWidth,
                  text: (el.textContent||'').trim().slice(0,30),
                });
              }
            }
            return overflowEls;
          });

          const realOverflow = overflowReport.length;
          status(realOverflow === 0, `${label}: ${realOverflow} overflowing elements`);

          // 2. Touch target audit (<a>, <button> only)
          const smallTargets = await page.evaluate(() => {
            const els = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
            const small = [];
            for (const el of els) {
              // Skip checkboxes, radios, hidden inputs
              if (el.type === 'checkbox' || el.type === 'radio') continue;
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
                const tag = el.tagName.toLowerCase();
                const text = (el.textContent || '').trim().substring(0, 30);
                small.push({ tag, text: text || el.id || el.className.slice(0,25), w: Math.round(r.width), h: Math.round(r.height) });
              }
            }
            return small;
          });
          if (smallTargets.length > 5) {
            status(false, `${label}: ${smallTargets.length} targets < 44px (first few: ${smallTargets.slice(0,3).map(t => `<${t.tag}>${t.text} ${t.w}x${t.h}`).join(', ')})`);
          } else {
            results.pass++;
          }

        } catch (e) {
          status(false, `${label}: ERROR: ${e.message}`);
        } finally {
          await ctx.close();
        }
      }
    }
    await browser.close();
  }

  // Summary
  console.log('\n━━━ RESULTS ━━━');
  console.log(`  Pass: ${results.pass}`);
  console.log(`  Fail: ${results.fail}`);
  if (results.warnings.length > 0) {
    console.log('\nFailures:');
    for (const w of results.warnings) {
      console.log(`  ❌ ${w}`);
    }
  }
  console.log(`\n${results.fail === 0 ? '✅ ALL PASS' : `⚠️  ${results.fail} failures`}`);
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
