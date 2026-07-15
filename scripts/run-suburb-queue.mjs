// ── Run suburb queue sequentially, one at a time ──
// node scripts/run-suburb-queue.mjs [startIndex] [endIndex]
// Each suburb = separate exec of collect-one-suburb.mjs
// Resumes from queue index, logs progress.

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const PROJECT = "/Users/FrankAI/Documents/澳洲房地产评估系统";
const COLLECTOR = path.join(PROJECT, "scripts/collect-one-suburb.mjs");
const QUEUE_FILE = "/tmp/suburb-queue.json";
const PROGRESS_FILE = "/tmp/suburb-collection-progress.json";
const LOG_FILE = "/tmp/suburb-collection-2026-07-12.log";
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const suburbs = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
const startIdx = parseInt(process.argv[2] || "0");
const endIdx = parseInt(process.argv[3] || String(suburbs.length));

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
};

const saveProgress = (idx, success, fail) => {
  fs.writeFileSync(
    PROGRESS_FILE,
    JSON.stringify({
      idx,
      total: suburbs.length,
      success,
      fail,
      lastSuburb: idx > 0 ? suburbs[idx - 1] : null,
      updatedAt: new Date().toISOString(),
    })
  );
};

const collectOne = (suburb) => {
  const NODE_BIN = "/Users/FrankAI/.local/bin/node";
const cmd = `DATABASE_URL="${DB_URL}" ${NODE_BIN} "${COLLECTOR}" "${suburb}" "VIC" "" "1" "5"`;
  try {
    const out = execSync(cmd, {
      cwd: PROJECT,
      timeout: 120_000,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      env: { ...process.env, DATABASE_URL: DB_URL },
    });
    return out;
  } catch (e) {
    return `ERROR: ${e.message.slice(0, 200)}`;
  }
};

let success = 0;
let fail = 0;

log(`=== Starting queue run ${startIdx}→${endIdx} (${suburbs.length} total) ===`);

for (let i = startIdx; i < endIdx; i++) {
  const suburb = suburbs[i];
  const label = `[${i + 1}/${suburbs.length}] ${suburb}`;
  process.stdout.write(`${label} ... `);

  const result = collectOne(suburb);
  const inserted = (result.match(/→ (\d+) inserted/) || [])[1];
  const ok = result.includes("No sales found") || /→ \d+ inserted/.test(result);
  const skip = result.includes("skipped");

  if (ok) {
    success++;
    process.stdout.write(`✓ ${inserted ? inserted + " inserted" : "no data"}${skip ? " (some skipped)" : ""}\n`);
    log(`${label} ✓ ${inserted ? inserted + " inserted" : "no data"}${skip ? " (some skipped)" : ""}`);
  } else {
    fail++;
    process.stdout.write(`✗ failed\n`);
    log(`${label} ✗ ${result.slice(0, 150)}`);
  }

  // Progress checkpoint every 10
  if ((i + 1) % 10 === 0) {
    saveProgress(i + 1, success, fail);
    log(`CHECKPOINT: ${i + 1}/${suburbs.length} | Succ:${success} Fail:${fail}`);
  }

  // 4-second cooldown between suburbs
  if (i < endIdx - 1) {
    await new Promise((r) => setTimeout(r, 4000));
  }
}

saveProgress(endIdx, success, fail);
log(`=== COMPLETED ${startIdx}→${endIdx} | Success:${success} Failed:${fail} ===`);
console.log(`\n=== DONE: ${success} success, ${fail} failed ===`);
