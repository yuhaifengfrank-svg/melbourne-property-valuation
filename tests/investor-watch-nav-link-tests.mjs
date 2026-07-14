import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const html = readFileSync(join(ROOT, "public/index.html"), "utf-8");
const appJs = readFileSync(join(ROOT, "public/app.js"), "utf-8");
const iwHtml = readFileSync(join(ROOT, "public/investor-watch/index.html"), "utf-8");

function findAttr(html, attr, value) {
  // Find an anchor tag that has a certain attribute value
  const anchors = html.match(/<a\s[^>]*>/g) || [];
  return anchors.find(a => a.includes(`${attr}="${value}"`));
}

function i18nValue(line) {
  // Extract the i18n value from a line like: ... "key": "value",
  const m = line.match(/:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

test("nav link href=/investor-watch/ when data-i18n=nav-investor-watch", () => {
  const navAnchor = findAttr(html, "data-i18n", "nav-investor-watch");
  assert.ok(navAnchor, "nav-investor-watch anchor must exist");
  assert.ok(navAnchor.includes('href="/investor-watch/"'), `nav anchor must have href=/investor-watch/, got: ${navAnchor}`);
  assert.ok(!navAnchor.includes("#investor-watch"), "nav must not point to #investor-watch");
});

test("CTA link href=/investor-watch/ when data-i18n=investor-watch-coming-soon", () => {
  const ctaAnchor = findAttr(html, "data-i18n", "investor-watch-coming-soon");
  assert.ok(ctaAnchor, "CTA anchor must exist");
  assert.ok(ctaAnchor.includes('href="/investor-watch/"'), `CTA must have href=/investor-watch/, got: ${ctaAnchor}`);
});

test("no href=#investor-watch anywhere", () => {
  const hashRef = html.match(/href="#investor-watch"/g);
  assert.equal(hashRef, null, "No link should use #investor-watch anchor");
});

test("en CTA says 'Open' not 'Join' or 'Coming Soon'", () => {
  const enLine = appJs.split("\n").find(l =>
    l.includes('"investor-watch-coming-soon"') && !l.includes("//") && !/[\u4e00-\u9fff]/.test(l)
  );
  assert.ok(enLine, "en investor-watch-coming-soon i18n line found");
  const val = i18nValue(enLine);
  assert.ok(val, "en i18n value extracted");
  assert.ok(val.includes("Open"), `English CTA should say 'Open', got: ${val}`);
  assert.ok(!val.includes("Join"), `English CTA should not say 'Join', got: ${val}`);
  assert.ok(!val.includes("Coming Soon"), `English CTA should not say 'Coming Soon', got: ${val}`);
});

test("zh CTA says '打开' not '加入'", () => {
  const zhLine = appJs.split("\n").find(l =>
    l.includes('"investor-watch-coming-soon"') && /[\u4e00-\u9fff]/.test(l)
  );
  assert.ok(zhLine, "zh investor-watch-coming-soon i18n line found");
  assert.ok(zhLine.includes("打开"), `Chinese CTA should say '打开', got line: ${zhLine}`);
  assert.ok(!zhLine.includes("加入"), `Chinese CTA should not say '加入'`);
});

test("billing note exists in both locales", () => {
  const enLine = appJs.split("\n").find(l =>
    l.includes("investor-watch-billing-note") && !/[\u4e00-\u9fff]/.test(l)
  );
  assert.ok(enLine, "en investor-watch-billing-note i18n key exists");
  assert.ok(enLine.includes("not active"), "English billing note mentions billing not active");

  const zhLine = appJs.split("\n").find(l =>
    l.includes("investor-watch-billing-note") && /[\u4e00-\u9fff]/.test(l)
  );
  assert.ok(zhLine, "zh billing note exists");
});

test("billing note element present in HTML", () => {
  assert.ok(html.includes("investor-watch-billing-note"), "billing-note element in HTML");
  assert.ok(html.includes('data-i18n="investor-watch-billing-note"'), "billing-note data-i18n attr exists");
});

test("funnel-watch-copy no longer says Coming Soon", () => {
  const enLine = appJs.split("\n").find(l =>
    l.includes("funnel-watch-copy") && !/[\u4e00-\u9fff]/.test(l)
  );
  assert.ok(enLine, "en funnel-watch-copy found");
  assert.ok(!enLine.includes("Coming Soon"), "funnel-watch-copy should not say Coming Soon");
});

test("investor-watch product page exists", () => {
  assert.ok(iwHtml.length > 1000, "investor-watch/index.html should be a real page");
});

test("investor-watch product page does not link back to #investor-watch", () => {
  const hashRef = iwHtml.match(/href="#investor-watch"/g);
  assert.equal(hashRef, null, "investor-watch page should not link back to #investor-watch anchor");
});
