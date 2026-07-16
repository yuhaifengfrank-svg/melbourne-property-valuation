#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_IGNORES = new Set(["version.json"]);

function walk(root, current = "") {
  const directory = path.join(root, current);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const relative = path.posix.join(current.split(path.sep).join(path.posix.sep), entry.name);
      return entry.isDirectory() ? walk(root, relative) : [relative];
    });
}

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function compareTrees(leftRoot, rightRoot, { ignores = DEFAULT_IGNORES } = {}) {
  const leftFiles = new Set(walk(leftRoot).filter((file) => !ignores.has(file)));
  const rightFiles = new Set(walk(rightRoot).filter((file) => !ignores.has(file)));
  const allFiles = [...new Set([...leftFiles, ...rightFiles])].sort();
  const entries = [];

  for (const file of allFiles) {
    if (!leftFiles.has(file)) {
      entries.push({ file, status: "right-only" });
      continue;
    }
    if (!rightFiles.has(file)) {
      entries.push({ file, status: "left-only" });
      continue;
    }
    const leftHash = digest(path.join(leftRoot, file));
    const rightHash = digest(path.join(rightRoot, file));
    entries.push({
      file,
      status: leftHash === rightHash ? "identical" : "different",
      leftHash,
      rightHash,
    });
  }

  const counts = entries.reduce((result, entry) => {
    result[entry.status] = (result[entry.status] || 0) + 1;
    return result;
  }, { identical: 0, different: 0, "left-only": 0, "right-only": 0 });
  const drift = counts.different + counts["left-only"] + counts["right-only"];
  return { entries, counts, drift };
}

export function formatReport(result, { leftLabel, rightLabel }) {
  const lines = [
    `Generated-output comparison: ${leftLabel} -> ${rightLabel}`,
    `identical=${result.counts.identical} different=${result.counts.different} left-only=${result.counts["left-only"]} right-only=${result.counts["right-only"]}`,
  ];
  for (const entry of result.entries) {
    if (entry.status !== "identical") lines.push(`${entry.status}\t${entry.file}`);
  }
  lines.push(result.drift === 0 ? "No generated-output drift detected." : `Generated-output drift detected in ${result.drift} file(s).`);
  return lines.join("\n");
}

function parseArgs(argv) {
  const valueAfter = (flag, fallback) => {
    const index = argv.indexOf(flag);
    return index === -1 ? fallback : argv[index + 1];
  };
  return {
    leftRoot: valueAfter("--left", "dist"),
    rightRoot: valueAfter("--right", "public"),
  };
}

export function run(argv = process.argv.slice(2)) {
  const { leftRoot, rightRoot } = parseArgs(argv);
  if (!leftRoot || !rightRoot || !fs.existsSync(leftRoot) || !fs.existsSync(rightRoot)) {
    console.error(`Both comparison directories must exist: left=${leftRoot} right=${rightRoot}`);
    return 2;
  }
  const result = compareTrees(leftRoot, rightRoot);
  console.log(formatReport(result, { leftLabel: leftRoot, rightLabel: rightRoot }));
  return result.drift === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run();
}
