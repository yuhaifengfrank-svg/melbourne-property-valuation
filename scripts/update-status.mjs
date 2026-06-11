#!/usr/bin/env node

/**
 * update-status.mjs — Auto-generate CURRENT_STATUS.md
 *
 * Runs tests itself so the result is always fresh.
 * Usage: npm run update-status
 * Replaces: manual edits to CURRENT_STATUS.md
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf-8", timeout: 60000 }).trim();
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

function getNowLocal() {
  // Generate timestamp in AEST/AEDT without relying on env TZ
  const now = new Date();
  // Build AEST timestamp via UTC with offset.
  // Melbourne AEDT=+11 (Oct-Apr), AEST=+10 (Apr-Oct).
  // getTimezoneOffset: -660 = AEDT (+11), -600 = AEST (+10)
  const melbOffsetMinutes = -now.getTimezoneOffset(); // positive = east of UTC
  const melb = new Date(now.getTime() + melbOffsetMinutes * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  const local = `${pad(melb.getUTCDate())}/${pad(melb.getUTCMonth() + 1)}/${melb.getUTCFullYear()} ${pad(melb.getUTCHours())}:${pad(melb.getUTCMinutes())}`;
  // Determine AEST vs AEDT from offset: -660 = +11 = AEDT, -600 = +10 = AEST
  const tzName = now.getTimezoneOffset() === -660 ? "AEDT" : "AEST";
  return { local, tz: tzName };
}

function getTestSummary() {
  // Run tests and capture output — 10 min timeout, large buffer
  const out = runWithTimeout(600000);
  const lines = out.split("\n");

  // Parse the summary line: "ℹ tests 72", "ℹ pass 66", "ℹ fail 6", etc.
  const tests = lines.find(l => /^ℹ tests \d+/.test(l));
  const pass = lines.find(l => /^ℹ pass \d+/.test(l));
  const fail = lines.find(l => /^ℹ fail \d+/.test(l));

  const parseNum = (s) => (s ? parseInt(s.match(/\d+/)?.[0] || "0", 10) : 0);
  const total = parseNum(tests);
  const failCount = parseNum(fail);

  // Extract unique failing top-level test names
  // Top-level fail: starts with "✖ " (no leading space)
  // Subtest fail: starts with "  ✖" or "    ✖" (indented)
  const failedTests = [];
  for (const l of lines) {
    // Only match top-level failures: "✖ TestName (...)"
    if (/^✖ .+? \([\d.]+ms\)$/.test(l)) {
      const name = l.replace(/^✖ /, "").replace(/ \([\d.]+ms\)$/, "").trim();
      if (name && !name.startsWith('"') && !name.includes(" ")) {
        failedTests.push(name);
      }
    }
  }

  // Also catch test groups that fail: "✖ P1: 数据可信度" etc.
  // These don't have (ms) suffix
  const namedFails = [];
  for (const l of lines) {
    if (/^✖ [A-Za-z0-9\u4e00-\u9fff].+/.test(l) && !/ \([\d.]+ms\)$/.test(l)) {
      const name = l.replace(/^✖ /, "").trim();
      if (name && !name.startsWith('"') && !name.includes("tests") && !name.includes("suites") && !name.includes("pass") && !name.includes("fail")) {
        namedFails.push(name);
      }
    }
  }

  // Unique merge
  const uniqueFails = [...new Set([...failedTests, ...namedFails])];

  // Summary string for the file
  const summaryLines = [tests, pass, fail].filter(Boolean).join("\n");

  return {
    summary: summaryLines || "（测试未返回标准摘要行）",
    failCount,
    failedTests: uniqueFails,
  };
}

function runWithTimeout(ms) {
  try {
    return execSync("npm test 2>&1", { cwd: root, encoding: "utf-8", timeout: ms, maxBuffer: 10 * 1024 * 1024 }).trim();
  } catch (e) {
    // execSync throws on non-zero exit — but stdout still has results
    if (e.stdout) return e.stdout.toString();
    return `ERROR: ${e.message}`;
  }
}

function getGitStatus() {
  const branch = run("git rev-parse --abbrev-ref HEAD");
  const headLine = run("git log --oneline -1");
  const [shortHash, ...rest] = headLine.split(" ");
  const headMsg = rest.join(" ");

  // Get ahead/behind vs origin
  let syncStatus;
  try {
    const revList = execSync(
      "git rev-list --left-right --count origin/HEAD...HEAD 2>/dev/null || echo unknown",
      { cwd: root, encoding: "utf-8", timeout: 10000 }
    ).trim();
    syncStatus = revList;
  } catch {
    syncStatus = "unknown";
  }

  return { branch, shortHash, headMsg, syncStatus };
}

function main() {
  const { local, tz } = getNowLocal();
  const { branch, shortHash, headMsg, syncStatus } = getGitStatus();
  const nodeVer = process.version;
  const npmVer = run("npm --version");

  console.log("📡 Running tests...");
  const test = getTestSummary();
  console.log(`   ✅ ${test.summary.replace(/\n/g, " | ")}`);

  const ok = test.failCount === 0 ? "✅ All pass" : `⚠️ ${test.failCount} fail`;
  const hashLine = `${shortHash} ${headMsg}`;

  // Build test block
  let testBlock = `\`\`\`\n${test.summary}\n\`\`\`\n\n测试状态: ${ok}`;
  if (test.failedTests.length > 0) {
    testBlock += `\n\n### 失败测试\n\n${test.failedTests.map(t => `- ${t}`).join("\n")}`;
  }

  const content = `# CURRENT_STATUS.md

最后更新: ${local} ${tz} — ⚠️ 由 \`scripts/update-status.mjs\` 自动生成，请勿手动编辑。

## 项目 & 分支

| 项 | 值 |
|---|---|
| 项目 | \`${root}\` |
| 分支 | \`${branch}\` |
| HEAD | \`${hashLine}\` |
| 远程同步 | \`${syncStatus}\` |
| Node | ${nodeVer} / npm ${npmVer} |

## Production

**URL**: https://www.aushomevalue.com.au (canonical)
**Legacy URL**: https://aushomevalue.vercel.app (共存，无 301)

## 测试

${testBlock}

---

*此文件由 \`scripts/update-status.mjs\` 生成。运行 \`npm run update-status\` 刷新。*
`;

  const outPath = path.join(root, "CURRENT_STATUS.md");
  writeFileSync(outPath, content, "utf-8");
  console.log(`\n✅ CURRENT_STATUS.md 已更新 → ${outPath}`);
}

try {
  await main();
} catch (err) {
  console.error("Fatal:", err.message);
  process.exit(1);
}
