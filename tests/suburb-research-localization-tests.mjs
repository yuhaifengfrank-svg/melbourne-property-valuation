import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const index = readFileSync(path.join(root, "public/index.html"), "utf8");
const app = readFileSync(path.join(root, "public/app.js"), "utf8");
const blogIndex = readFileSync(path.join(root, "public/blog/index.html"), "utf8");
const languageScript = readFileSync(path.join(root, "public/blog/blog-language.js"), "utf8");
const generator = readFileSync(path.join(root, "scripts/content-factory-pipeline.mjs"), "utf8");

function blogArticles() {
  const base = path.join(root, "public/blog/2026/2026-W29");
  return readdirSync(base)
    .filter((file) => file.endsWith(".html"))
    .map((file) => readFileSync(path.join(base, file), "utf8"));
}

test("Suburb Research is a highlighted direct navigation item with mobile layout support", () => {
  assert.match(index, /class="nav-suburb-research nav-cta" href="\/suburb-research\.html" data-i18n="nav-blog"/);
  assert.match(index, /\.nav-suburb-research\s*\{/);
  assert.match(index, /@media \(max-width: 720px\)[\s\S]*\.topbar-nav \.nav-suburb-research/);
  assert.doesNotMatch(index, /more-menu-panel[\s\S]{0,300}href="\/suburb-research\.html"/);
});

test("homepage language choice persists for linked Suburb Research pages", () => {
  assert.match(app, /localStorage\.getItem\("aushomevalue\.language"\)/);
  assert.match(app, /localStorage\.setItem\("aushomevalue\.language", language\)/);
  assert.match(languageScript, /aushomevalue\.language/);
});

test("Suburb Research index and all current articles load shared responsive language assets", () => {
  assert.match(blogIndex, /\/blog\/blog-language\.css/);
  assert.match(blogIndex, /\/blog\/blog-language\.js/);
  const articles = blogArticles();
  assert.ok(articles.length >= 15);
  for (const article of articles) {
    assert.match(article, /\/blog\/blog-language\.css/);
    assert.match(article, /\/blog\/blog-language\.js/);
  }
});

test("Chinese mode covers index copy and every current English reason or risk phrase", () => {
  assert.match(languageScript, /维州区域研究/);
  assert.match(languageScript, /数据驱动的区域分析/);
  assert.match(languageScript, /document\.querySelectorAll\("\.blog-card \.tag"\)\.forEach\(translateTextTree\)/);
  assert.match(languageScript, /← 区域研究/);
  for (const phrase of [
    "Budget fit using either lowest median",
    "Elevated vacancy may indicate softer rental demand",
    "Infrastructure access signal",
    "Low vacancy demand signal",
    "Lower rental yield may reduce income appeal",
    "New supply may compete with resale demand",
    "Rental income signal",
    "School catchment demand signal",
    "Standard market risk; validate property condition and micro-location",
    "Supply constraint support",
  ]) {
    assert.match(languageScript, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("future content generation keeps the shared language assets", () => {
  assert.match(generator, /\/blog\/blog-language\.css/);
  assert.match(generator, /\/blog\/blog-language\.js/);
  assert.match(generator, /'Smart Buy': '智选型'/);
});
