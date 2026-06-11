#!/usr/bin/env node

/**
 * update-status.mjs
 *
 * 自动生成 CURRENT_STATUS.md。
 * 运行方式：node scripts/update-status.mjs
 * 建议：每次 deploy / merge 到 main 后自动运行。
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf-8", timeout: 30000 }).trim();
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

function getTestSummary() {
  // 不重新跑测试（可能耗时 2min+），直接从上次结果提取
  // 如果需要最新测试结果，先手动运行 npm run check
  const outPath = path.join(root, "TEST_RESULTS.log");
  let out;
  try {
    out = readFileSync(outPath, "utf-8");
  } catch {
    return {
      summary: "（测试结果文件 TEST_RESULTS.log 不存在——运行 npm run check 以生成）",
      allLines: "",
      failCount: -1,
      failedTests: [],
    };
  }

  const lines = out.split("\n");
  const summary = lines.filter(l => /^(ℹ|✖|✔) (tests|suites|pass|fail|cancelled|skipped|todo)/.test(l));
  const fails = lines.filter(l => l.startsWith("✖"));

  // Extract failed test names
  const failedTests = [];
  for (const line of lines) {
    const m = line.match(/✖ (.+?)(?: \([\d.]+ms\))?$/);
    if (m) failedTests.push(m[1]);
  }

  return {
    summary: summary.join("\n") || "（无匹配行）",
    allLines: "",
    failCount: fails.length,
    failedTests: [...new Set(failedTests)],
  };
}

function main() {
  const now = new Date().toISOString().replace("T", " ").slice(0, 16);
  const tz = "AEST";
  const branch = run("git rev-parse --abbrev-ref HEAD");
  const head = run("git log --oneline -1");
  const remoteStatus = run("git rev-list --left-right --count origin/HEAD...HEAD 2>/dev/null || echo 'unknown'");
  const nodeVer = process.version;
  const npmVer = run("npm --version");

  const test = getTestSummary();

  const ok = test.failCount === 0 ? "✅" : `⚠️ ${test.failCount} fail`;

  const content = `# CURRENT_STATUS.md

最后更新: ${now} ${tz} — ⚠️ 由 \`scripts/update-status.mjs\` 自动生成，请勿手动编辑。

## 项目 & 分支

| 项 | 值 |
|---|---|
| 项目 | \`${root}\` |
| 分支 | \`${branch}\` |
| HEAD | \`${head}\` |
| 远程同步 | \`${remoteStatus}\` |
| Node | ${nodeVer} / npm ${npmVer} |

## Production

**URL**: https://www.aushomevalue.com.au (canonical)
**Legacy URL**: https://aushomevalue.vercel.app (共存，无 301)

## 测试

\`\`\`
${test.summary || test.allLines || "（测试未执行或超时）"}
\`\`\`

测试状态: ${ok}

${test.failCount > 0 ? `### 失败测试\n\n${test.failedTests.map(t => `- ${t}`).join("\n")}\n` : ""}

---

*此文件由 \`scripts/update-status.mjs\` 生成。运行 \`npm run update-status\` 刷新。*
`;

  const outPath = path.join(root, "CURRENT_STATUS.md");
  writeFileSync(outPath, content, "utf-8");
  console.log(`✅ CURRENT_STATUS.md 已更新 → ${outPath}`);
  if (test.failCount > 0) {
    console.log(`⚠️  ${test.failCount} 个测试失败，已记录到 status 文件`);
  }
}

main();
