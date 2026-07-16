import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compareTrees, formatReport } from "../scripts/verify-generated.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ahv-generated-"));
  const left = path.join(root, "left");
  const right = path.join(root, "right");
  fs.mkdirSync(left);
  fs.mkdirSync(right);
  return { root, left, right };
}

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

test("identical generated trees report no drift", (t) => {
  const dirs = fixture();
  t.after(() => fs.rmSync(dirs.root, { recursive: true, force: true }));
  write(dirs.left, "suburb/example.html", "same");
  write(dirs.right, "suburb/example.html", "same");
  const result = compareTrees(dirs.left, dirs.right);
  assert.equal(result.drift, 0);
  assert.equal(result.counts.identical, 1);
});

test("content differences are reported with hashes", (t) => {
  const dirs = fixture();
  t.after(() => fs.rmSync(dirs.root, { recursive: true, force: true }));
  write(dirs.left, "page.html", "legacy");
  write(dirs.right, "page.html", "deployed");
  const result = compareTrees(dirs.left, dirs.right);
  assert.equal(result.drift, 1);
  assert.equal(result.entries[0].status, "different");
  assert.notEqual(result.entries[0].leftHash, result.entries[0].rightHash);
});

test("missing and additional files are both visible", (t) => {
  const dirs = fixture();
  t.after(() => fs.rmSync(dirs.root, { recursive: true, force: true }));
  write(dirs.left, "left.html", "left");
  write(dirs.right, "right.html", "right");
  const result = compareTrees(dirs.left, dirs.right);
  assert.deepEqual(result.counts, { identical: 0, different: 0, "left-only": 1, "right-only": 1 });
  assert.match(formatReport(result, { leftLabel: "left", rightLabel: "right" }), /left-only\tleft\.html/);
  assert.match(formatReport(result, { leftLabel: "left", rightLabel: "right" }), /right-only\tright\.html/);
});

test("build-generated version metadata is the only default exclusion", (t) => {
  const dirs = fixture();
  t.after(() => fs.rmSync(dirs.root, { recursive: true, force: true }));
  write(dirs.right, "version.json", '{"commit":"runtime"}');
  const result = compareTrees(dirs.left, dirs.right);
  assert.equal(result.drift, 0);
  assert.equal(result.entries.length, 0);
});
