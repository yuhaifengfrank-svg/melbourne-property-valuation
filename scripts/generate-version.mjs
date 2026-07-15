import fs from "node:fs";
import path from "node:path";

const version = {
  commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local",
  branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || "local",
  environment: process.env.VERCEL_ENV || "local",
  generatedAt: new Date().toISOString()
};

const output = path.resolve("public/version.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(version, null, 2)}\n`, { mode: 0o644 });
console.log(`[build] version metadata generated for ${version.branch}@${version.commit.slice(0, 12)}`);
