const puppeteer = require("puppeteer");
const fs = require("fs");

const BASE = "https://www.aushomevalue.com.au";
const OUT = __dirname + "/video-assets/werribee";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Homepage
  console.log("📸 01-homepage...");
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });
  await page.screenshot({ path: `${OUT}/01-homepage.png`, fullPage: true });
  console.log("   ✅");

  // Go to Werribee suburb page
  console.log("📸 Loading Werribee suburb page...");
  await page.goto(`${BASE}/suburb/werribee-vic.html`, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  // Full page screenshot
  const fullPath = `${OUT}/02-werribee-suburb.png`;
  await page.screenshot({ path: fullPath, fullPage: true });
  console.log("   ✅");

  // Get bounding boxes for key sections
  const getBox = (text, containerSelector = null) => page.evaluate(({ text, containerSelector }) => {
    const iter = document.evaluate(`//*[contains(text(),'${text}')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    let el = iter.singleNodeValue;
    if (!el) return null;

    // If we want a container, find it
    if (containerSelector) {
      const container = el.closest(containerSelector);
      if (container) el = container;
    }

    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
  }, { text, containerSelector });

  // Helper: scroll to a y-position and take a clip screenshot
  async function clipRegion(name, headingText, padding, fixedHeight) {
    const box = await getBox(headingText);
    if (!box) {
      console.log(`   ⚠️ Cannot find "${headingText}"`);
      return;
    }

    const scrollY = Math.max(0, box.top + window.scrollY);
    await page.evaluate((y) => { window.scrollTo(0, Math.max(0, y - 80)); }, box.top);

    // Wait for any lazy content
    await new Promise(r => setTimeout(r, 500));

    // Re-get since scroll changed positions
    const box2 = await getBox(headingText);
    if (!box2) return;

    const clip = {
      x: Math.max(0, box2.left - padding),
      y: Math.max(0, box2.top - padding),
      width: Math.min(box2.width + padding * 2, 1440),
      height: fixedHeight || Math.min(box2.height + padding * 2, 2000)
    };
    await page.screenshot({ path: `${OUT}/${name}.png`, clip });
    const size = fs.statSync(`${OUT}/${name}.png`).size;
    console.log(`   ✅ ${name}.png (${(size/1024).toFixed(0)}KB)`);
  }

  // 3. Confidence card: "Overall Intelligence Confidence" strong + "High confidence" text
  // It's near the top of the page, let's get a region that includes both
  console.log("📸 03-confidence-card...");
  const confBox = await getBox("Overall Intelligence Confidence");
  if (confBox) {
    const clip = {
      x: Math.max(0, confBox.left - 20),
      y: Math.max(0, confBox.top - 60),
      width: 1440,
      height: 180
    };
    await page.screenshot({ path: `${OUT}/03-confidence-card.png`, clip });
    const size = fs.statSync(`${OUT}/03-confidence-card.png`).size;
    console.log(`   ✅ 03-confidence-card.png (${(size/1024).toFixed(0)}KB)`);
  } else {
    console.log("   ⚠️ Confidence heading not found");
  }

  // 4. Top Strengths: "Why Werribee Scores Highly" section — the 3 strong items (Value, Growth, Infrastructure)
  console.log("📸 04-top-strengths...");
  const whyBox = await getBox("Why Werribee Scores Highly");
  if (whyBox) {
    // This section has 3 items, each with a <strong> + <text>. Height ~300px
    await page.evaluate((y) => { window.scrollTo(0, Math.max(0, y - 60)); }, whyBox.top);
    await new Promise(r => setTimeout(r, 300));
    const whyBox2 = await getBox("Why Werribee Scores Highly");
    if (whyBox2) {
      const clip = {
        x: Math.max(0, whyBox2.left - 20),
        y: Math.max(0, whyBox2.top - 20),
        width: Math.min(whyBox2.width + 40, 1440),
        height: 320
      };
      await page.screenshot({ path: `${OUT}/04-top-strengths.png`, clip });
      console.log(`   ✅ (${(fs.statSync(`${OUT}/04-top-strengths.png`).size/1024).toFixed(0)}KB)`);
    }
  } else {
    console.log("   ⚠️ Why Werribee heading not found");
  }

  // 5. Top Risks: the lowest-scoring factors — Yield (23/C), Vacancy (50/B), School (45/C)
  console.log("📸 05-top-risks...");
  const yieldBox = await getBox("Yield Score");
  const schoolBox = await getBox("School Score");
  if (yieldBox && schoolBox) {
    // From Yield Score heading to bottom of School Score content
    const topY = yieldBox.top;
    const bottomY = schoolBox.top + (schoolBox.height || 80);
    await page.evaluate((y) => { window.scrollTo(0, Math.max(0, y - 40)); }, topY);
    await new Promise(r => setTimeout(r, 300));
    const yb2 = await getBox("Yield Score");
    if (yb2) {
      await page.screenshot({
        path: `${OUT}/05-top-risks.png`,
        clip: {
          x: Math.max(0, yb2.left - 20),
          y: Math.max(0, yb2.top - 20),
          width: 1440,
          height: 450  // Covers Yield + Vacancy + School items
        }
      });
      console.log(`   ✅ (${(fs.statSync(`${OUT}/05-top-risks.png`).size/1024).toFixed(0)}KB)`);
    }
  } else {
    console.log("   ⚠️ Risk factors not found");
  }

  // 6. Investment suitability: full Factor Breakdown section — from heading to before Why Werribee
  console.log("📸 06-investment-suitability...");
  const factorBox = await getBox("Factor Breakdown");
  const whyBox2 = await getBox("Why Werribee Scores Highly");
  if (factorBox && whyBox2) {
    const sectionHeight = (whyBox2.top + 60) - factorBox.top;
    await page.evaluate((y) => { window.scrollTo(0, Math.max(0, y - 20)); }, factorBox.top);
    await new Promise(r => setTimeout(r, 300));
    const fb2 = await getBox("Factor Breakdown");
    if (fb2) {
      await page.screenshot({
        path: `${OUT}/06-investment-suitability.png`,
        clip: {
          x: Math.max(0, fb2.left - 20),
          y: Math.max(0, fb2.top - 20),
          width: 1440,
          height: Math.min(sectionHeight, 1800)
        }
      });
      console.log(`   ✅ (${(fs.statSync(`${OUT}/06-investment-suitability.png`).size/1024).toFixed(0)}KB)`);
    }
  } else {
    console.log("   ⚠️ Factor Breakdown not found");
  }

  const sizes = fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort().map(f => {
    const s = fs.statSync(`${OUT}/${f}`);
    return `${f}: ${(s.size / 1024).toFixed(0)}KB`;
  });
  console.log("\n📊 Final files:");
  sizes.forEach(s => console.log(`  ${s}`));

  await browser.close();
  console.log("🎉 Done");
})();
