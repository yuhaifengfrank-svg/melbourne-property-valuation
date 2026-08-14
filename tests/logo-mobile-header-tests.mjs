import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("mobile header keeps brand and language control on one compact row", () => {
  assert.match(index, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(index, /\.topbar \.header-left \.eyebrow\s*\{\s*display:\s*none/);
  assert.match(index, /\.primary-brand img\s*\{\s*height:\s*auto;\s*width:\s*min\(180px, 48vw\)/);
});
test("mobile navigation stays in one accessible horizontal row", () => {
  assert.match(index, /\.topbar-nav\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(index, /\.topbar-nav\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(index, /\.topbar-nav a,[\s\S]*?flex:\s*0 0 auto/);
  assert.match(index, /scrollbar-width:\s*none/);
});
