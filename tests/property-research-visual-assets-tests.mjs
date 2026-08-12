import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = process.cwd();
const pages = {
  home: readFileSync(path.join(root, "public/index.html"), "utf8"),
  research: readFileSync(path.join(root, "public/suburb-research.html"), "utf8"),
  opportunities: readFileSync(path.join(root, "public/opportunities/index.html"), "utf8"),
};

const assets = [
  "public/assets/property-research/melbourne-suburb-hero-1600.webp",
  "public/assets/property-research/melbourne-suburb-research-960.webp",
  "public/assets/property-research/melbourne-opportunity-960.webp",
];

test("property research imagery is local, compressed and deployable", () => {
  for (const file of assets) {
    const bytes = statSync(path.join(root, file)).size;
    assert.ok(bytes > 10_000, `${file} is not an empty placeholder`);
    assert.ok(bytes < 350_000, `${file} remains below the page-weight guardrail`);
  }
});
test("core discovery pages use explicit dimensions and descriptive alternatives", () => {
  for (const [name, html] of Object.entries(pages)) {
    const document = new JSDOM(html).window.document;
    const image = document.querySelector('img[src^="/assets/property-research/"]');
    assert.ok(image, `${name} includes the branded property image`);
    assert.match(image.getAttribute("alt") || "", /Melbourne|homes|suburb/i);
    assert.ok(Number(image.getAttribute("width")) > 0);
    assert.ok(Number(image.getAttribute("height")) > 0);
  }
});

test("visuals do not depend on remote image hosts", () => {
  for (const html of Object.values(pages)) {
    const sources = [...new JSDOM(html).window.document.images].map((image) => image.src);
    assert.ok(sources.every((source) => !/^https?:/.test(source)));
  }
});

test("new image captions are bilingual where the page supports language switching", () => {
  const app = readFileSync(path.join(root, "public/app.js"), "utf8");
  const research = readFileSync(path.join(root, "public/suburb-research.js"), "utf8");
  assert.match(app, /See the suburb, then study the evidence/);
  assert.match(app, /先看区域，再研究证据/);
  assert.match(research, /Local context first\. Comparable evidence second/);
  assert.match(research, /先理解区域，再核对可比证据/);
});
