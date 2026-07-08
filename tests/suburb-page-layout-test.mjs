import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://localhost:3000';
const pages = [
  '/suburb/doncaster-vic.html',
  '/suburb/aireys-inlet-vic.html',
  '/suburb/sans-souci-nsw.html',
];
const viewports = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const pathname of pages) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const response = await page.goto(`${base}${pathname}`, { waitUntil: 'networkidle' });
      assert.equal(response?.status(), 200, `${pathname} should load`);
      const result = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        h1: document.querySelector('h1')?.textContent?.trim(),
        metrics: document.querySelectorAll('.metric-card').length,
        jsonData: Boolean(document.querySelector('#suburb-page-data')),
      }));
      assert.ok(result.scrollWidth <= result.clientWidth + 1, `${pathname} overflows at ${viewport.width}px`);
      assert.ok(result.h1, `${pathname} has no heading`);
      assert.ok(result.metrics >= 9, `${pathname} has incomplete metrics`);
      assert.equal(result.jsonData, true, `${pathname} has no structured audit data`);
      await context.close();
    }
  }
  console.log(`Suburb layout audit passed: ${pages.length * viewports.length}/9 cases.`);
} finally {
  await browser.close();
}
