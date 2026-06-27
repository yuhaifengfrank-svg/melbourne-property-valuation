import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function collectFunctions(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFunctions(entryPath);
    if (!entry.isFile() || !entry.name.endsWith(".js")) return [];
    if (entry.name.startsWith("_")) return [];
    return [entryPath];
  });
}

test("Vercel Hobby deployment stays within the 12-function budget", () => {
  const functions = collectFunctions(path.resolve("api"));
  assert.ok(
    functions.length <= 12,
    `Expected no more than 12 functions, found ${functions.length}: ${functions.join(", ")}`
  );
});

test("compatibility rewrites preserve member and UV public endpoints", () => {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  assert.ok(config.rewrites.some((rewrite) =>
    rewrite.source === "/api/member/(.*)" &&
    rewrite.destination === "/api/member?action=$1"
  ));
  assert.ok(config.rewrites.some((rewrite) =>
    rewrite.source === "/api/uv" &&
    rewrite.destination === "/api/valuation?uv=1"
  ));
});
