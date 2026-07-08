import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rootHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const publicHtml = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const rootApp = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const publicApp = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

for (const [name, html] of [["root", rootHtml], ["public", publicHtml]]) {
  test(`${name} homepage uses current conservative data claims`, () => {
    assert.match(html, /180,000\+<\/strong> <span data-i18n="stat-sales">sales records indexed/);
    assert.match(html, /2,800\+<\/strong> <span data-i18n="stat-schools">schools mapped/);
    assert.match(html, /500\+<\/strong> <span data-i18n="stat-suburbs">suburbs with sales coverage/);
    assert.doesNotMatch(html, /3,600\+/);
    assert.doesNotMatch(html, /230\+/);
  });
}

test("English translations describe indexed records rather than verified comparables", () => {
  for (const source of [rootApp, publicApp]) {
    assert.match(source, /"sales records indexed"/);
    assert.match(source, /"suburbs with sales coverage"/);
  }
});

test("Chinese translations preserve the evidence distinction", () => {
  for (const source of [rootApp, publicApp]) {
    assert.match(source, /"条成交记录已收录"/);
    assert.match(source, /"个区域有成交覆盖"/);
  }
});

test("product copy reflects current reports and subscription policy", () => {
  for (const source of [rootHtml, publicHtml, rootApp, publicApp]) {
    assert.doesNotMatch(source, /Own analysis coming soon|Our own suburb reports coming soon/);
  }
  assert.match(publicHtml, /Included with subscription/);
  assert.match(publicApp, /Active subscribers receive full valuation reports/);
  assert.match(publicApp, /订阅期间免费包含/);
});
