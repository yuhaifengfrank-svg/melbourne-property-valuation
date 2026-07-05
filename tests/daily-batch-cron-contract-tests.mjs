import assert from "node:assert/strict";
import fs from "node:fs";

const script = fs.readFileSync("scripts/daily-batch-collection.mjs", "utf8");
const wrappers = [
  "cron-batch-slot1.sh",
  "cron-batch-slot2.sh",
  "cron-coastal.sh",
].map((file) => fs.readFileSync(file, "utf8"));

assert.match(script, /timeZone:\s*"Australia\/Melbourne"/);
assert.match(script, /const BATCH_DATE = melbourneDate\(\)/);
assert.match(script, /databaseDate\(st\.last_run_date\) === today/);
assert.match(script, /await sql\.query\(text, params\)/);
assert.doesNotMatch(script, /await sql\.unsafe\(/);
assert.match(script, /const TOTAL_BATCHES = 12/);

for (const wrapper of wrappers) {
  assert.match(wrapper, /NODE_BIN="\/Users\/FrankAI\/\.local\/bin\/node"/);
  assert.match(wrapper, /"\$NODE_BIN"/);
}

console.log("daily batch cron contract: 9/9 passed");
