import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "api");
const MAX_FUNCTIONS = 12;

function apiFunctions(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return apiFunctions(absolute);
    return entry.isFile() && entry.name.endsWith(".js") && entry.name !== "_db.js"
      ? [path.relative(apiDir, absolute)]
      : [];
  });
}

test("Vercel API function count stays within the current production budget", () => {
  const functions = apiFunctions(apiDir);
  assert.ok(
    functions.length <= MAX_FUNCTIONS,
    `API function budget exceeded (${functions.length}/${MAX_FUNCTIONS}): ${functions.join(", ")}`
  );
});

test("Investor Watch must use aggregated APIs", () => {
  const functions = apiFunctions(apiDir);
  assert.equal(functions.some((name) => name.startsWith("member/")), false);
  assert.equal(functions.some((name) => name.startsWith("investor-watch/")), false);
});

test("Investor Watch weekly monitoring uses the existing GitHub scheduler", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/investor-watch-monitor.yml"), "utf8");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.match(workflow, /cron: '15 18 \* \* 0'/);
  assert.match(workflow, /secrets\.INVESTOR_WATCH_CRON_SECRET/);
  assert.match(workflow, /\/api\/investor-watch\/monitor/);
  assert.equal("crons" in vercel, false);
});

test("legacy lead consent and suburb intelligence URLs use aggregated functions", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.ok(vercel.rewrites.some((rule) =>
    rule.source === "/api/lead-consent" && rule.destination === "/api/member?action=lead-consent"
  ));
  assert.ok(vercel.rewrites.some((rule) =>
    rule.source === "/api/suburb-intelligence" && rule.destination === "/api/opportunity?action=suburb-intelligence"
  ));
});
