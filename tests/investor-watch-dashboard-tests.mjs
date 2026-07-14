import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "public/investor-watch/index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "public/investor-watch/investor-watch.js"), "utf8");
const home = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

test("dashboard provides login, quotas, add form and empty states", () => {
  for (const id of ["login-form", "dashboard", "suburb-usage", "property-usage", "add-form", "items", "empty-state"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Free preview · no payment required/);
});

test("dashboard calls only the two aggregated Investor Watch APIs", () => {
  assert.match(js, /\/api\/member\/me/);
  assert.match(js, /\/api\/member\/request-link/);
  assert.match(js, /\/api\/investor-watch\/items/);
  assert.match(js, /\/api\/investor-watch\/add/);
  assert.doesNotMatch(js, /leadContactId\s*:/);
});

test("dashboard has bilingual copy and escapes watch item output", () => {
  assert.match(js, /Keep your property shortlist/);
  assert.match(js, /把你关注的区域和房产集中管理/);
  assert.match(js, /function safe\(/);
  assert.match(js, /safe\(title\)/);
});

test("homepage CTA opens the free preview without claiming paid availability", () => {
  assert.match(home, /href="\/investor-watch\/"/);
  assert.match(home, /Open Investor Watch — Free Preview/);
  assert.match(home, /Free preview\. No payment setup required\./);
  assert.match(home, /Subscription billing is not active during the free preview\./);
});

test("Vercel serves the static dashboard within the Hobby function budget", () => {
  assert.ok(vercel.rewrites.some((rule) => rule.source === "/investor-watch/(.*)"));
  const apiFiles = fs.readdirSync(path.join(root, "api")).filter((name) => name.endsWith(".js") && name !== "_db.js");
  assert.equal(apiFiles.length, 11);
});
