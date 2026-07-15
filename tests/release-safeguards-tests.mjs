import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const stats = JSON.parse(read("public/site-stats.json"));

test("published site statistics cannot regress below verified minimums", () => {
  assert.ok(stats.comparableSales >= 180000, `comparableSales regressed to ${stats.comparableSales}`);
  assert.ok(stats.schoolsMapped >= 2800, `schoolsMapped regressed to ${stats.schoolsMapped}`);
  assert.ok(stats.suburbsCovered >= 500, `suburbsCovered regressed to ${stats.suburbsCovered}`);
});

test("homepage uses the single site-stats source and contains no legacy claims", () => {
  for (const file of ["index.html", "public/index.html"]) {
    const html = read(file);
    assert.match(html, /data-site-stat="comparableSales"/);
    assert.match(html, /data-site-stat="schoolsMapped"/);
    assert.match(html, /data-site-stat="suburbsCovered"/);
    assert.match(html, /src="\/site-stats\.js"/);
    assert.doesNotMatch(html, />3,600\+</);
    assert.doesNotMatch(html, />230\+</);
  }
});

test("site stats and deployment version are exposed as static files", () => {
  const config = JSON.parse(read("vercel.json"));
  const rewrites = new Map(config.rewrites.map(rule => [rule.source, rule.destination]));
  assert.equal(rewrites.get("/site-stats.json"), "/public/site-stats.json");
  assert.equal(rewrites.get("/site-stats.js"), "/public/site-stats.js");
  assert.equal(rewrites.get("/version.json"), "/public/version.json");
  assert.equal(fs.existsSync(path.join(root, "public/site-stats.js")), true);
  assert.equal(fs.existsSync(path.join(root, "site-stats.js")), false);
  assert.match(read("scripts/generate-version.mjs"), /VERCEL_GIT_COMMIT_SHA/);
  assert.match(read("scripts/generate-version.mjs"), /VERCEL_GIT_COMMIT_REF/);
  assert.match(read("scripts/generate-version.mjs"), /VERCEL_ENV/);
});

test("site stats script renders verified rounded counts into the homepage DOM", async () => {
  const elements = new Map([
    ["comparableSales", [{ textContent: "—" }]],
    ["schoolsMapped", [{ textContent: "—" }]],
    ["suburbsCovered", [{ textContent: "—" }]]
  ]);
  const document = {
    querySelectorAll(selector) {
      const match = selector.match(/^\[data-site-stat="([^"]+)"\]$/);
      return match ? elements.get(match[1]) || [] : [];
    }
  };
  const fetchCalls = [];
  const fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return { ok: true, json: async () => stats };
  };
  const context = vm.createContext({ document, fetch, Intl, Number, Math, Object });
  vm.runInContext(read("public/site-stats.js"), context);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "/site-stats.json");
  assert.equal(fetchCalls[0].options.cache, "no-cache");
  assert.equal(elements.get("comparableSales")[0].textContent, "190,000+");
  assert.equal(elements.get("schoolsMapped")[0].textContent, "2,800+");
  assert.equal(elements.get("suburbsCovered")[0].textContent, "500+");
});

test("release workflows enforce branch freshness and Production provenance", () => {
  assert.match(read(".github/workflows/pull-request-guard.yml"), /merge-base --is-ancestor origin\/main HEAD/);
  assert.match(read(".github/workflows/production-smoke.yml"), /EXPECTED_SHA/);
  assert.match(read("scripts/smoke-production.mjs"), /version\.environment === "production"/);
  assert.match(read("scripts/smoke-production.mjs"), /version\.branch === "main"/);
});

test("Production deployment commands are absent from executable configuration", () => {
  const executableFiles = [
    "package.json",
    ...fs.readdirSync(path.join(root, ".github/workflows")).map(name => `.github/workflows/${name}`),
    ...fs.readdirSync(path.join(root, "scripts")).filter(name => /\.(mjs|js)$/.test(name)).map(name => `scripts/${name}`)
  ];
  for (const file of executableFiles) {
    assert.doesNotMatch(read(file), /vercel\s+--prod/, `${file} contains a prohibited manual Production deploy`);
  }
});
