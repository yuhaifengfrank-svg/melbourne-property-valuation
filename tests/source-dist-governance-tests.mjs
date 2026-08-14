import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FORBIDDEN_ROOT_STATIC,
  REQUIRED_PUBLIC_ENTRIES,
  formatReport,
  inspectCanonicalSource,
} from "../scripts/verify-generated.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ahv-canonical-source-"));
  for (const relative of REQUIRED_PUBLIC_ENTRIES) write(root, relative, "fixture");
  write(root, "dev-server.mjs", [
    "const PUBLIC_DIR = path.join(__dirname, \"public\");",
    "app.use(express.static(PUBLIC_DIR));",
  ].join("\n"));
  write(root, "scripts/generate-suburb-pages.js", "const OUT = 'tmp/legacy-suburb-pages';");
  write(root, "scripts/generate-ai-pages.js", "const OUT = 'tmp/legacy-suburb-pages';");
  return root;
}

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

test("canonical public-only fixture passes", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(inspectCanonicalSource(root), []);
});

test("tracked-style dist output is rejected", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, "dist/index.html", "generated");
  assert.match(inspectCanonicalSource(root).join("\n"), /dist\/ exists/);
});

test("every former root duplicate is rejected", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relative of FORBIDDEN_ROOT_STATIC) write(root, relative, "duplicate");
  const violations = inspectCanonicalSource(root);
  for (const relative of FORBIDDEN_ROOT_STATIC) {
    assert.ok(violations.some((violation) => violation.startsWith(relative)), relative);
  }
});

test("missing canonical entries and a non-public dev server are rejected", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(path.join(root, "public/index.html"));
  write(root, "dev-server.mjs", "app.use(express.static(__dirname));");
  const report = formatReport(inspectCanonicalSource(root));
  assert.match(report, /public\/index\.html is missing/);
  assert.match(report, /does not define public\/ as its static root/);
  assert.match(report, /does not serve the canonical PUBLIC_DIR/);
});

test("legacy generators cannot write to dist", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, "scripts/generate-ai-pages.js", "const OUT = 'dist';");
  assert.match(inspectCanonicalSource(root).join("\n"), /generate-ai-pages\.js still writes to tracked dist/);
});
