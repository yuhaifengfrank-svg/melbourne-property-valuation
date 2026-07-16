#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const FORBIDDEN_ROOT_STATIC = [
  "404.html",
  "admin.css",
  "admin.html",
  "admin.js",
  "app.js",
  "assets/aushomevalue-wechat-qr.jpg",
  "index.html",
  "opportunity-gate.js",
  "robots.txt",
  "sitemap.xml",
  "styles.css",
];

export const REQUIRED_PUBLIC_ENTRIES = [
  "public/404.html",
  "public/admin.html",
  "public/app.js",
  "public/index.html",
  "public/opportunities/index.html",
  "public/robots.txt",
  "public/sitemap.xml",
  "public/styles.css",
];

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

export function inspectCanonicalSource(root = process.cwd()) {
  const violations = [];

  if (exists(root, "dist")) {
    violations.push("dist/ exists; generated output must remain untracked and absent");
  }

  for (const relative of FORBIDDEN_ROOT_STATIC) {
    if (exists(root, relative)) {
      violations.push(`${relative} duplicates the canonical public/ source`);
    }
  }

  for (const relative of REQUIRED_PUBLIC_ENTRIES) {
    if (!exists(root, relative)) violations.push(`${relative} is missing`);
  }

  const serverPath = path.join(root, "dev-server.mjs");
  if (!fs.existsSync(serverPath)) {
    violations.push("dev-server.mjs is missing");
  } else {
    const server = fs.readFileSync(serverPath, "utf8");
    if (!/PUBLIC_DIR\s*=\s*path\.join\(__dirname,\s*["']public["']\)/.test(server)) {
      violations.push("dev-server.mjs does not define public/ as its static root");
    }
    if (!/express\.static\(PUBLIC_DIR\)/.test(server)) {
      violations.push("dev-server.mjs does not serve the canonical PUBLIC_DIR");
    }
  }

  for (const relative of ["scripts/generate-suburb-pages.js", "scripts/generate-ai-pages.js"]) {
    const target = path.join(root, relative);
    if (!fs.existsSync(target)) continue;
    const source = fs.readFileSync(target, "utf8");
    if (/const\s+OUT\s*=\s*["']dist["']/.test(source)) {
      violations.push(`${relative} still writes to tracked dist/`);
    }
  }

  return violations;
}

export function formatReport(violations) {
  if (violations.length === 0) return "Canonical source governance passed: public/ is the sole static source.";
  return [
    `Canonical source governance failed with ${violations.length} violation(s):`,
    ...violations.map((violation) => `- ${violation}`),
  ].join("\n");
}

export function run(root = process.cwd()) {
  const violations = inspectCanonicalSource(root);
  console.log(formatReport(violations));
  return violations.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run();
}
