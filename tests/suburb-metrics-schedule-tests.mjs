import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/nightly-refresh.yml"), "utf8");
const investorWatch = fs.readFileSync(path.join(root, ".github/workflows/investor-watch-monitor.yml"), "utf8");

test("suburb metrics refresh runs weekly before Investor Watch", () => {
  assert.match(workflow, /name: Weekly Suburb Metrics Refresh/);
  assert.match(workflow, /cron: '30 16 \* \* 0'/);
  assert.doesNotMatch(workflow, /cron: '0 17 \* \* \*'/);
  assert.match(investorWatch, /cron: '15 18 \* \* 0'/);
});

test("weekly refresh remains manually runnable", () => {
  assert.match(workflow, /workflow_dispatch:/);
});
