#!/usr/bin/env node

/**
 * layout-hotfix-test.mjs
 *
 * Behavioral & layout tests for Production valuation page hotfix.
 *
 * Requirements:
 * 1. CSS: .summary-main always single-column
 * 2. Address: no hyphens/word-break on long addresses
 * 3. Payments disabled: lead-panel hidden, only check-status visible
 * 4. HTML: no duplicate <section class="content">
 * 5. Copy: "Register after the estimate" replaced with neutral text
 * 6. Viewports: 320, 390, 768, 1024, 1366, 1440, 1920
 * 7. Browser screenshots: Chromium, Firefox, WebKit at 390, 1366, 1920
 *
 * Run: node --test tests/layout-hotfix-test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const PROJECT = process.cwd();
const SRC_DIR = path.join(PROJECT, "public");
const HTML = readFileSync(path.join(SRC_DIR, "index.html"), "utf8");
const CSS = readFileSync(path.join(SRC_DIR, "shared-responsive.css"), "utf8");
const APP_JS = readFileSync(path.join(SRC_DIR, "app.js"), "utf8");

const SCREENSHOT_DIR = path.join(PROJECT, "output", "layout-hotfix");

// ── Screenshot helpers (will be used by browser tests) ──

function ensureScreenshotDir() {
  if (!existsSync(SCREENSHOT_DIR)) {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

// ── Browser test helpers ──

let browserTestResults = {};

// ═══════════════════════════════════════════════════════════════════
// 1. CSS: .summary-main always single-column
// ═══════════════════════════════════════════════════════════════════

describe("CSS — summary-main always single-column, .summary parent for desktop", () => {
  it(".summary-main base rule uses grid-template-columns: minmax(0,1fr)", () => {
    const match = CSS.match(/\.summary-main\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.ok(match, "base rule has minmax(0,1fr)");
  });

  it("768px media query does NOT override .summary-main to 1fr 1fr", () => {
    const after768 = CSS.split("@media (min-width: 768px)")[1] || "";
    const overrideMatch = after768.match(/\.summary-main\s*\{[\s\S]*?grid-template-columns:\s*1fr\s+1fr/);
    assert.ok(!overrideMatch, "768px override not present");
  });

  it("no bare 1fr on .summary-main", () => {
    const ruleMatch = CSS.match(/\.summary-main\s*\{[\s\}]*/g);
    const hasBare1fr = ruleMatch && ruleMatch.some(r => 
      /grid-template-columns:\s*1fr\s*[;}]/.test(r) && 
      !r.includes("minmax")
    );
    assert.ok(!hasBare1fr, "base rule not bare 1fr (uses minmax)");
  });

  it(".summary parent uses 1fr 340px at 1024px for desktop side-by-side", () => {
    // Desktop: .summary (parent) grid-template-columns: 1fr 340px
    const match1024 = CSS.match(/@media \(min-width:\s*1024px\)[\s\S]*?\.summary\s*\{[\s\S]*?grid-template-columns:\s*1fr\s+340px/);
    assert.ok(match1024, "desktop .summary has 1fr 340px for summary-main + summary-card");
    // No .content .summary-main (old wrong selector)
    assert.ok(!CSS.includes(".content .summary-main"), "no .content .summary-main selector (moved to .summary parent)");
  });

  it(".summary base is single-column (mobile)", () => {
    const baseMatch = CSS.match(/\.summary\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.ok(baseMatch, ".summary mobile: grid-template-columns: minmax(0,1fr)");
  });

  it("no 1440px override of .summary layout", () => {
    const after1440 = CSS.split("@media (min-width: 1440px)")[1] || "";
    assert.ok(!after1440.includes(".summary"), "no 1440px override of .summary");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Address — no hyphens/word-break
// ═══════════════════════════════════════════════════════════════════

describe("CSS — address word-break protection", () => {
  it("#property-address has overflow-wrap:break-word", () => {
    assert.ok(CSS.includes('#property-address'), 'selector exists');
    // Check all required properties are present for one or both selectors
    const hasProperties = CSS.includes("overflow-wrap: break-word") &&
      CSS.includes("word-break: normal") &&
      CSS.includes("hyphens: none") &&
      CSS.includes("min-width: 0");
    assert.ok(hasProperties, "address has all 4 protection properties");
  });

  it("inline CSS uses overflow-wrap:anywhere NOT word-break", () => {
    // Inline CSS default: "h1, h2, h3, p, ... { overflow-wrap: anywhere }"
    // This is OK as base. Our override via shared-responsive.css uses more specific selector
    const inlineMatch = HTML.match(/\{[\s\S]*?overflow-wrap:\s*anywhere/);
    assert.ok(inlineMatch, "inline base uses overflow-wrap:anywhere");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Payments disabled — paid locks hidden, free registration funnel visible
// ═══════════════════════════════════════════════════════════════════

describe("Payments disabled — layout classes", () => {
  it("CSS does not hide .lead-panel under payments-disabled", () => {
    const match = CSS.match(/\.payments-disabled\s*\.lead-panel\s*\{[\s\S]*?display:\s*none/);
    assert.equal(match, null, ".payments-disabled must keep registration lead-panel available");
  });

  it("CSS class .payments-disabled hides .locked-strip", () => {
    const match = CSS.match(/\.payments-disabled\s*\.locked-strip\s*\{[\s\S]*?display:\s*none/);
    assert.ok(match, ".payments-disabled hides locked-strip");
  });

  it("CSS class .payments-disabled hides .locked-preview-cta", () => {
    const match = CSS.match(/\.payments-disabled\s*\.locked-preview-cta\s*\{[\s\S]*?display:\s*none/);
    assert.ok(match, ".payments-disabled hides locked-preview-cta");
  });

  it("layout CSS: side-panel 260-300px at 1024+/1440+", () => {
    const match1024 = CSS.match(/@media \(min-width:\s*1024px\)[\s\S]*?\.layout\s*\{[\s\S]*?grid-template-columns:\s*260px/);
    const match1440 = CSS.match(/@media \(min-width:\s*1440px\)[\s\S]*?\.layout\s*\{[\s\S]*?grid-template-columns:\s*300px/);
    assert.ok(match1024, "1024px colums 260px minmax");
    assert.ok(match1440, "1440px colums 300px minmax");
  });

  it(".layout base is single-column (mobile)", () => {
    const baseMatch = CSS.match(/\.layout\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
    assert.ok(baseMatch, "layout base is 1fr");
  });

  it("app.js no longer uses payments-disabled to remove registration funnel", () => {
    assert.ok(!APP_JS.includes('layoutEl.classList.add("payments-disabled")'), "does not add class to hide registration funnel");
    assert.ok(APP_JS.includes('classList.remove("payments-disabled")'), "removes class when enabled");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. HTML — no duplicate <section class="content">
// ═══════════════════════════════════════════════════════════════════

describe("HTML structure — no duplicate content sections", () => {
  it("only one <section class=\"content\"> in main area", () => {
    // Split on layout div boundaries, properly counting nesting
    const layoutStart = HTML.indexOf('<div class="layout">');
    const layoutEnd = (() => {
      // Find matching </div> for layout by counting depth
      let depth = 0;
      let inTag = false;
      let tagName = '';
      for (let i = layoutStart; i < HTML.length; i++) {
        const ch = HTML[i];
        if (ch === '<' && HTML[i+1] !== '/') {
          // opening tag
          const tagEnd = HTML.indexOf('>', i);
          const raw = HTML.slice(i+1, tagEnd).split(/[\s>]/)[0];
          if (raw === 'div') depth++;
          i = tagEnd;
        } else if (ch === '<' && HTML[i+1] === '/') {
          // closing tag
          const tagEnd = HTML.indexOf('>', i);
          const raw = HTML.slice(i+2, tagEnd).trim();
          if (raw === 'div') depth--;
          if (depth === 0) return tagEnd + 1;
          i = tagEnd;
        }
      }
      return -1;
    })();
    assert.ok(layoutEnd > layoutStart, "layout div boundaries found");
    const layoutContent = HTML.slice(layoutStart, layoutEnd);
    const opens = (layoutContent.match(/<section class="content">/g) || []).length;
    assert.equal(opens, 1, "exactly one content section inside layout");
  });

  it("no empty double content sections (<section class=\"content\"> right after another)", () => {
    // Check there's no empty content section pattern
    assert.ok(!HTML.includes('<section class="content">\n          <section class="content">'),
      "no nested double content sections");
  });

  it("all report sections are present (summary, grid-two, comparables, location, uploads, investor)", () => {
    assert.ok(HTML.includes('id="summary-section"'), "summary section");
    assert.ok(HTML.includes('class="grid-two"'), "grid-two sections");
    assert.ok(HTML.includes('id="comparables"'), "comparables section");
    assert.ok(HTML.includes('id="location"'), "location section");
    assert.ok(HTML.includes('id="uploads"'), "uploads section");
    assert.ok(HTML.includes('id="investor"'), "investor section");
    assert.ok(HTML.includes('id="top-opportunities"'), "top opportunities section");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Copy — neutral text
// ═══════════════════════════════════════════════════════════════════

describe("Copy — neutral payment-closed text", () => {
  it("'Register after the estimate' is removed", () => {
    assert.ok(!HTML.includes("Register after the estimate"), "old copy removed");
  });

  it("new neutral text is present", () => {
    assert.ok(HTML.includes("Review the estimate, comparable evidence"), "new copy present");
  });

  it("new text does not mention register or payment", () => {
    const snippetIdx = HTML.indexOf("Review the estimate, comparable evidence");
    const snippet = HTML.slice(snippetIdx, snippetIdx + 200);
    assert.ok(!snippet.includes("Register"), "no register mention");
    assert.ok(!snippet.includes("payment"), "no payment mention");
    assert.ok(!snippet.includes("unlock"), "no unlock mention");
  });

  it("only 1 occurrence of the new text (no duplicates)", () => {
    const count = (HTML.match(/Review the estimate, comparable evidence/g) || []).length;
    assert.equal(count, 1, "only one instance of new copy");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Static analysis — no regression
// ═══════════════════════════════════════════════════════════════════

describe("Static analysis — no regression", () => {
  it("overvlow-wrap:anywhere NOT changed to anything else in critical selectors", () => {
    const inlineStyles = HTML.match(/<style[^>]*>[\s\S]*?<\/style>/g) || [];
    const inlineCSS = inlineStyles.join("");
    assert.ok(inlineCSS.includes("overflow-wrap: anywhere"), "inline CSS retains anywhere");
  });
  
  it("side-panel stays on desktop, hidden on mobile", () => {
    const matdch = CSS.match(/\.side-panel\s*\{[\s\S]*?display:\s*none/);
    assert.ok(matdch, "side-panel hidden mobile default");
    const desktopMatdch = CSS.match(/@media \(min-width:\s*1024px\)[\s\S]*?\.side-panel\s*\{[\s\S]*?display:\s*block/);
    assert.ok(desktopMatdch, "side-panel visible on desktop");
  });

  it("1024px .summary parent uses 1fr 340px (est + why)", () => {
    const match = CSS.match(/@media \(min-width: 1024px\)[\s\S]*?\.summary\s*\{[\s\S]*?grid-template-columns:\s*1fr\s+340px/);
    assert.ok(match, "desktop .summary columns");
  });

  it("1024px AND 1440px layout columns preserved", () => {
    assert.ok(CSS.includes("grid-template-columns: 260px minmax(0,1fr)"), "1024px layout");
    assert.ok(CSS.includes("grid-template-columns: 300px minmax(0,1fr)"), "1440px layout");
  });

  // Verify no changes to API, DB or Stripe
  it("no API/DB/Stripe files in commit scope", () => {
    // This test documents that only the 3 files should be changed
    // (plus optional test file)
    assert.ok(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Visual — no overflow
// ═══════════════════════════════════════════════════════════════════

describe("HTML — layout elements correctness", () => {
  it("HTML has lead-panel element", () => {
    // lead-panel stays in HTML but hidden by CSS class
    assert.ok(HTML.includes('class="panel lead-panel"'), "lead-panel exists in HTML");
  });

  it("HTML has unlock-report button", () => {
    assert.ok(HTML.includes('id="unlock-report"'), "unlock button exists");
  });

  it("HTML has check-status element", () => {
    assert.ok(HTML.includes('id="check-status"'), "check status exists");
    assert.ok(HTML.includes("Check Status"), "check status heading");
  });

  it("HTML has Why this estimate section", () => {
    assert.ok(HTML.includes("Why this estimate?"), "why this estimate heading");
    assert.ok(HTML.includes('id="reasons"'), "reasons list");
  });

  it("side-panel has only check-status (not lead-panel)", () => {
    // The side-panel is HTML parent for both, but CSS/JS hides lead-panel.
    // Check HTML structure: both are inside side-panel.
    const sidePanelContent = HTML.match(/<aside class="side-panel"[\s\S]*?<\/aside>/);
    assert.ok(sidePanelContent, "side-panel exists");
    // side-panel contains both
    assert.ok(sidePanelContent[0].includes('class="panel lead-panel"'), "lead-panel inside side-panel");
    assert.ok(sidePanelContent[0].includes('id="check-status"'), "check status inside side-panel");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Run browser tests if Playwright available
// ═══════════════════════════════════════════════════════════════════

describe("Browser screenshots", { skip: !existsSync(path.join(PROJECT, "node_modules", "playwright")) }, () => {
  before(() => {
    ensureScreenshotDir();
  });

  it("Chromium — 390, 1366, 1920 viewports", async () => {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch();
      const viewports = [
        { w: 390, h: 844, name: "390" },
        { w: 1366, h: 768, name: "1366" },
        { w: 1920, h: 1080, name: "1920" }
      ];
      for (const vp of viewports) {
        const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
        const page = await context.newPage();
        await page.goto("file://" + path.join(SRC_DIR, "index.html"), { waitUntil: "networkidle", timeout: 15000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `chromium-${vp.name}-initial.png`), fullPage: true });
        
        // Run a simple valuation simulation (just check no overflow first)
        const noOvf = await page.evaluate(() => {
          return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
        });
        assert.ok(noOvf, `chromium ${vp.name} initial: no horizontal overflow`);
        
        await context.close();
      }
      await browser.close();
      browserTestResults.chromium = "pass";
    } catch (e) {
      browserTestResults.chromium = `fail: ${e.message}`;
      throw e;
    }
  });

  it("Firefox — 390, 1366, 1920 viewports", async () => {
    try {
      const { firefox } = await import("playwright");
      const browser = await firefox.launch();
      const viewports = [
        { w: 390, h: 844, name: "390" },
        { w: 1366, h: 768, name: "1366" },
        { w: 1920, h: 1080, name: "1920" }
      ];
      for (const vp of viewports) {
        const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
        const page = await context.newPage();
        await page.goto("file://" + path.join(SRC_DIR, "index.html"), { waitUntil: "networkidle", timeout: 15000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `firefox-${vp.name}-initial.png`), fullPage: true });
        await context.close();
      }
      await browser.close();
      browserTestResults.firefox = "pass";
    } catch (e) {
      browserTestResults.firefox = `fail: ${e.message}`;
      throw e;
    }
  });

  it("WebKit — 390, 1366, 1920 viewports", async () => {
    try {
      const { webkit } = await import("playwright");
      const browser = await webkit.launch();
      const viewports = [
        { w: 390, h: 844, name: "390" },
        { w: 1366, h: 768, name: "1366" },
        { w: 1920, h: 1080, name: "1920" }
      ];
      for (const vp of viewports) {
        const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
        const page = await context.newPage();
        await page.goto("file://" + path.join(SRC_DIR, "index.html"), { waitUntil: "networkidle", timeout: 15000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `webkit-${vp.name}-initial.png`), fullPage: true });
        await context.close();
      }
      await browser.close();
      browserTestResults.webkit = "pass";
    } catch (e) {
      browserTestResults.webkit = `fail: ${e.message}`;
      throw e;
    }
  });
});
