import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("brand system includes scalable lockup, mark and browser icons", () => {
  for (const file of [
    "public/assets/brand/aushomevalue-logo.svg",
    "public/assets/brand/aushomevalue-logo-reverse.svg",
    "public/assets/brand/aushomevalue-mark.svg",
    "public/favicon.svg",
    "public/favicon.ico",
    "public/apple-touch-icon.png",
  ]) {
    assert.ok(statSync(path.join(root, file)).size > 500, `${file} is a real asset`);
  }
});

test("logo communicates home, value signal and the brand name without scripts", () => {
  const lockup = read("public/assets/brand/aushomevalue-logo.svg");
  assert.match(lockup, /AusHomeValue/);
  assert.match(lockup, /PROPERTY OPPORTUNITY INTELLIGENCE/);
  assert.match(lockup, /#123f33/);
  assert.match(lockup, /#e8844f/);
  assert.doesNotMatch(lockup, /<script/i);
});

test("homepage uses the full logo with accessible home navigation", () => {
  const document = new JSDOM(read("public/index.html")).window.document;
  const brand = document.querySelector(".primary-brand");
  assert.equal(brand?.getAttribute("href"), "/");
  assert.equal(brand?.getAttribute("aria-label"), "AusHomeValue home");
  const image = brand?.querySelector("img");
  assert.equal(image?.getAttribute("src"), "/assets/brand/aushomevalue-logo-reverse.svg");
  assert.match(image?.getAttribute("alt") || "", /Property Opportunity Intelligence/);
});

test("shared page families receive the compact brand mark", () => {
  const shared = read("public/shared-responsive.css");
  const brand = read("public/brand.css");
  assert.match(shared, /aushomevalue-mark\.svg/);
  assert.match(shared, /\.back::before/);
  assert.match(brand, /\.brand::before/);
  for (const file of ["privacy.html", "terms.html", "methodology.html", "model-validation.html", "evidence-handling.html", "sample-report.html"]) {
    const html = read(`public/${file}`);
    assert.match(html, /\/brand\.css/);
    assert.match(html, /class="brand"/);
  }
});
