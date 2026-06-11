#!/usr/bin/env node

/**
 * capture-topic.mjs — Generate screenshot assets for a video topic
 *
 * Usage:
 *   node scripts/video-factory/capture-topic.mjs --topic "Why Werribee Scores Highly"
 *   node scripts/video-factory/capture-topic.mjs --topic "Top Growth Suburbs"
 *   node scripts/video-factory/capture-topic.mjs --all
 *
 * Output: /video-assets/{slug}/
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const BASE_URL = "https://www.aushomevalue.com.au";
const OUT_DIR = path.join(ROOT, "video-assets");

// Parse args
const args = process.argv.slice(2);
const topicArg = args.includes("--all") ? null : args[args.indexOf("--topic") + 1];

// Load topics
const topics = JSON.parse(readFileSync(path.join(__dirname, "topics.json"), "utf-8")).topics;

const topicsToRun = topicArg
  ? topics.filter(t => t.name.toLowerCase() === topicArg.toLowerCase())
  : topics;

if (topicsToRun.length === 0) {
  console.error(`No topic found matching "${topicArg}". Available:`);
  topics.forEach(t => console.error(`  - ${t.name}`));
  process.exit(1);
}

// ─── Puppeteer script generator ───

function generatePuppeteerScript(topic) {
  const slug = topic.slug;
  const outPath = path.join(OUT_DIR, slug);
  const hasRanking = topic.hasRanking;
  const rankingPage = hasRanking ? `${BASE_URL}${topic.ranking}` : null;
  const hasSuburb = !!topic.suburb;
  const suburbPage = hasSuburb ? `${BASE_URL}/suburb/${topic.suburb}` : null;
  const sections = topic.sections || [];

  const suburbLanding = hasSuburb
    ? `"${suburbPage}"`
    : hasRanking
      ? `"${rankingPage}"`
      : `"${BASE_URL}"`;

  let scripts = [];

  const addShot = (name, url, opts = "{}") => {
    scripts.push(`
  console.log("📸 ${name}...");
  await shot(desktop, "${name}", ${url}, ${opts});`);
  };
  const addMobileShot = (name, url, opts = "{}") => {
    scripts.push(`
  await shot(mobile, "${name}", ${url}, ${opts});`);
  };
  const addTextSnap = (name, text, opts = "{}") => {
    scripts.push(`
  console.log("📸 ${name}...");
  await ${name === "04-confidence-card" ? '' : 'desktop.goto(' + suburbLanding + ', { waitUntil: \"networkidle0\", timeout: 30000 });' }
  await snapByText(desktop, "${name}", "${text}", ${opts});`);
  };

  let result = `const puppeteer = require("puppeteer");
const fs = require("fs");
const OUT = "${outPath}";
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name, urlOrFn, opts = {}) {
  const o = { fullPage: true, clip: null, mobile: false, ...opts };
  if (typeof urlOrFn === "string") {
    await page.goto(urlOrFn, { waitUntil: "networkidle0", timeout: 30000 });
  } else {
    await urlOrFn(page);
  }
  await new Promise(r => setTimeout(r, 1500));
  const suffix = o.mobile ? "-mobile" : "";
  const p = \`\${OUT}/\${name}\${suffix}.png\`;
  if (o.clip) { await page.screenshot({ path: p, clip: o.clip }); }
  else { await page.screenshot({ path: p, fullPage: o.fullPage }); }
  const kb = (fs.statSync(p).size / 1024).toFixed(0);
  console.log(\`   ✅ \${name}\${suffix}.png (\${kb}KB)\`);
}

async function getBox(page, text) {
  return page.evaluate((txt) => {
    const iter = document.evaluate(\`//*[contains(text(),'\${txt}')]\`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const el = iter.singleNodeValue;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), y: Math.round(r.top + window.scrollY), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  }, text);
}

async function snapByText(page, name, text, opts = {}) {
  const { padding = 20, height = null, mobile = false } = opts;
  const suffix = mobile ? "-mobile" : "";
  const box = await getBox(page, text);
  if (!box) { console.log(\`   ⚠️ Cannot find "\${text}"\`); return; }
  await page.evaluate((y) => { window.scrollTo(0, Math.max(0, y - 80)); }, box.y);
  await new Promise(r => setTimeout(r, 500));
  const box2 = await getBox(page, text);
  if (!box2) return;
  const clip = { x: Math.max(0, box2.left - padding), y: Math.max(0, box2.top - padding), width: Math.min(box2.width + padding * 2, 1440), height: height || Math.min(box2.height + padding * 2, 2000) };
  await page.screenshot({ path: \`\${OUT}/\${name}\${suffix}.png\`, clip });
  console.log(\`   ✅ \${name}\${suffix}.png (\${(fs.statSync(\`\${OUT}/\${name}\${suffix}.png\`).size/1024).toFixed(0)}KB)\`);
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  // ── Desktop ──
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 900 });

  // 1. Homepage
  console.log("📸 01-homepage...");
  await shot(desktop, "01-homepage", "${BASE_URL}");
`;

  if (hasRanking) {
    result += `
  // 2. Ranking page
  console.log("📸 02-ranking-page...");
  await shot(desktop, "02-ranking-page", "${rankingPage}");
`;
  }

  if (suburbPage) {
    result += `
  // 3. Suburb page
  console.log("📸 03-suburb-page...");
  await shot(desktop, "03-suburb-page", "${suburbPage}");

  // 4. Confidence card (suburb page only)
  console.log("📸 04-confidence-card...");
  await desktop.goto("${suburbPage}", { waitUntil: "networkidle0", timeout: 30000 });
  await snapByText(desktop, "04-confidence-card", "Overall Intelligence Confidence", { height: 180 });
`;
  }

  if (suburbPage && sections.includes("factors")) {
    result += `
  // 5. Factor breakdown
  console.log("📸 05-factor-breakdown...");
  await desktop.goto("${suburbPage}", { waitUntil: "networkidle0", timeout: 30000 });
  const fbBox = await desktop.evaluate(() => {
    const el = document.evaluate("//*[contains(text(),'Factor Breakdown')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!el) return null;
    let current = el;
    let height = 0;
    while (current && current.tagName !== "H2" && height < 2000) {
      height += current.offsetHeight || 0;
      current = current.nextElementSibling;
    }
    const r = el.parentElement ? el.parentElement.getBoundingClientRect() : el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), height: Math.min(height + 100, 2000) };
  });
  if (fbBox) {
    await desktop.evaluate((y) => { window.scrollTo(0, Math.max(0, y - 20)); }, fbBox.top);
    await new Promise(r => setTimeout(r, 500));
    const fbEl2 = await getBox(desktop, "Factor Breakdown");
    if (fbEl2) {
      await desktop.screenshot({ path: \`\${OUT}/05-factor-breakdown.png\`, clip: { x: Math.max(0, fbEl2.left - 20), y: Math.max(0, fbEl2.top - 20), width: 1440, height: fbBox.height } });
      console.log(\`   ✅ 05-factor-breakdown.png\`);
    }
  }
`;
  }

  if (suburbPage && sections.includes("strengths")) {
    result += `
  // 6. Why this suburb (top strengths)
  console.log("📸 06-why-this-suburb...");
  await desktop.goto("${suburbPage}", { waitUntil: "networkidle0", timeout: 30000 });
  await snapByText(desktop, "06-why-this-suburb", "Why Werribee Scores Highly", { height: 320 });
`;
  }

  if (suburbPage && sections.includes("risks")) {
    result += `
  // 7. Risks (low-scoring factors)
  console.log("📸 07-opportunity-card...");
  await desktop.goto("${suburbPage}", { waitUntil: "networkidle0", timeout: 30000 });
  await snapByText(desktop, "07-opportunity-card", "Yield Score", { height: 450 });
`;
  }

  // ── Mobile ──
  result += `
  // ── Mobile ──
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844 });
  console.log("\\n📱 Mobile captures...");
  await shot(mobile, "01-homepage", "${BASE_URL}", { mobile: true });
`;

  if (hasRanking) {
    result += `  await shot(mobile, "02-ranking-page", "${rankingPage}", { mobile: true });\n`;
  }

  if (suburbPage) {
    result += `  await shot(mobile, "03-suburb-page", "${suburbPage}", { mobile: true });\n`;
    result += `  await mobile.goto("${suburbPage}", { waitUntil: "networkidle0", timeout: 30000 });\n`;
    result += `  await snapByText(mobile, "04-confidence-card", "Overall Intelligence Confidence", { height: 200, mobile: true });\n`;
  }

  result += `
  await browser.close();
  console.log("\\n🎉 Done — ${topic.name}");
})();
`;

  return result.trim();
}

// ─── Main ───

for (const topic of topicsToRun) {
  console.log(`\n=== ${topic.name} ===`);
  const script = generatePuppeteerScript(topic);
  const scriptPath = path.join(__dirname, `_capture-${topic.slug}.cjs`);
  writeFileSync(scriptPath, script, "utf-8");

  try {
    execSync(`node "${scriptPath}"`, { cwd: ROOT, stdio: "inherit", timeout: 180000 });
  } catch (e) {
    console.error(`Failed: ${topic.name} — ${e.message}`);
  }
}

console.log("\n🎉 All topics complete");
