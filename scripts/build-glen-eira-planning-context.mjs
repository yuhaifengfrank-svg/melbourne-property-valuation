#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANNUAL_REPORT = "https://www.gleneira.vic.gov.au/media/502lfqsl/glen-eira-city-council-annual-report-2024-2025-webfile.pdf";
const ACTIVITY_CENTRES = "https://www.planning.vic.gov.au/guides-and-resources/strategies-and-initiatives/train-and-tram-zone-activity-centres/about-our-plans";
const AREAS = [
  ["BENTLEIGH", "3204", "stage_2"],
  ["BENTLEIGH EAST", "3165", null],
  ["BRIGHTON EAST", "3187", null],
  ["CARNEGIE", "3163", "stage_1"],
  ["CAULFIELD", "3162", "stage_2"],
  ["CAULFIELD EAST", "3145", "stage_2"],
  ["CAULFIELD NORTH", "3161", "stage_2"],
  ["CAULFIELD SOUTH", "3162", "stage_2"],
  ["ELSTERNWICK", "3185", "stage_2"],
  ["GARDENVALE", "3185", null],
  ["GLEN HUNTLY", "3163", "stage_2"],
  ["MCKINNON", "3204", null],
  ["MOORABBIN", "3189", "pilot"],
  ["MURRUMBEENA", "3163", "stage_1"],
  ["ORMOND", "3204", "stage_2"],
  ["RIPPONLEA", "3185", null],
  ["ST KILDA EAST", "3183", null],
].map(([suburb, postcode, activityCentre]) => ({ suburb, postcode, activityCentre }));

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const title = (value) => value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());

function artifact(area) {
  return {
    schemaVersion: "planning-context-summary-v1",
    sources: [
      {
        publisher: "Glen Eira City Council",
        url: ANNUAL_REPORT,
        report: "Annual Report 2024-2025",
        reportingPeriodEnd: "2025-06-30",
        pages: [77, 217],
      },
      ...(area.activityCentre ? [{
        publisher: "Victorian Department of Transport and Planning",
        url: ACTIVITY_CENTRES,
        report: "Train and Tram Zone Activity Centres Program",
        statusChecked: "2026-07-24",
      }] : []),
    ],
    geography: {
      suburb: area.suburb,
      postcode: area.postcode,
      council: "Glen Eira City Council",
      councilContextOnly: true,
      note: "Council-wide service metrics are context, not suburb-level application counts",
    },
    councilPlanningService: {
      medianDecisionDays: 70,
      decidedWithinRequiredTimePercent: 80,
      periodEnd: "2025-06-30",
      metricDefinitions: {
        medianDecisionDays: "Median days between receipt of a planning application and a decision",
        decidedWithinRequiredTimePercent: "Planning application decisions made within the relevant required time divided by all planning application decisions",
      },
    },
    activityCentre: area.activityCentre ? {
      included: true,
      programGroup: area.activityCentre,
      description: area.activityCentre === "stage_1"
        ? "Included in Stage 1 of Victoria's Train and Tram Zone Activity Centres Program"
        : area.activityCentre === "stage_2"
          ? "Included in Stage 2 of Victoria's Train and Tram Zone Activity Centres Program"
          : "Included in Victoria's Activity Centres Pilot Program",
    } : {
      included: false,
      description: "No activity-centre program claim is published for this suburb",
    },
    publication: {
      publishable: true,
      pagePublished: true,
      limitations: [
        "The 70-day and 80% measures are council-wide service metrics, not suburb-level application counts",
        "These metrics do not measure proposed dwellings, approvals, commencements or completions",
        "The Glen Eira ePathway application register is not collected or republished because its published terms restrict use to the statutory planning process",
        "Activity-centre inclusion is a policy signal, not a forecast that a specific property will be redeveloped",
      ],
    },
  };
}

function markup(data) {
  const activity = data.activityCentre.included
    ? `<article class="ahv-planning-card"><div class="ahv-planning-label">Activity centre</div><div class="ahv-planning-value">Included</div><div class="ahv-planning-meta">${data.activityCentre.description}</div></article>`
    : "";
  return `
<!-- AHV_GLEN_EIRA_PLANNING_CONTEXT_START -->
<style id="ahv-glen-eira-planning-style">.ahv-planning{max-width:960px;margin:36px auto;padding:0 20px 36px;color:#17211d}.ahv-planning h2{font-size:1.35rem;margin:0 0 6px}.ahv-planning-intro,.ahv-planning-meta{color:#66736d}.ahv-planning-intro{margin:0 0 16px}.ahv-planning-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.ahv-planning-card{background:#fff;border:1px solid #dbe2de;border-radius:10px;padding:16px}.ahv-planning-label{font-size:.76rem;text-transform:uppercase;letter-spacing:.04em;color:#66736d;font-weight:700}.ahv-planning-value{font-size:1.4rem;font-weight:800;margin:5px 0}@media(max-width:560px){.ahv-planning{padding:0 14px 30px}.ahv-planning-grid{grid-template-columns:1fr}}</style>
<section class="ahv-planning" aria-labelledby="ahv-glen-eira-planning-heading">
  <h2 id="ahv-glen-eira-planning-heading">Glen Eira planning context</h2>
  <p class="ahv-planning-intro">Council-wide planning service facts for the year ended 30 June 2025. These are context only, not suburb application or dwelling counts.</p>
  <div class="ahv-planning-grid">
    <article class="ahv-planning-card"><div class="ahv-planning-label">Median decision time</div><div class="ahv-planning-value">70 days</div><div class="ahv-planning-meta">Council-wide planning applications</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Within required time</div><div class="ahv-planning-value">80%</div><div class="ahv-planning-meta">Council-wide planning decisions</div></article>
${activity}
  </div>
</section>
<!-- AHV_GLEN_EIRA_PLANNING_CONTEXT_END -->
`;
}

function pageTemplate(area) {
  const name = title(area.suburb);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} VIC Planning Research | AusHomeValue</title><meta name="description" content="Source-labelled Glen Eira planning context for ${name}, Victoria."><link rel="canonical" href="https://www.aushomevalue.com.au/suburb/${slug(area.suburb)}-vic.html"><meta name="robots" content="index, follow"><link rel="stylesheet" href="/shared-responsive.css"><style>*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#17211d;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}.topbar{background:#0d6b57;padding:14px 24px}.topbar a{color:#fff;text-decoration:none;font-weight:700}.container{max-width:960px;margin:auto;padding:32px 20px 12px}.breadcrumb,.eyebrow,.notice{color:#66736d}.notice{max-width:920px;margin:0 auto 48px;padding:14px 16px;background:#e8f3ef;border-left:4px solid #0d6b57;border-radius:6px}</style></head><body><div class="topbar"><a href="/">← AusHomeValue</a></div><main class="container"><div class="breadcrumb"><a href="/">Home</a> / <a href="/suburb-research.html">Suburb Research</a> / ${name}</div><h1>${name}, VIC — Planning Research</h1><p class="eyebrow">Postcode ${area.postcode} · Glen Eira council context · Only verified, source-labelled metrics are shown.</p></main><!-- AHV_GLEN_EIRA_PLANNING_CONTEXT_INSERT --><div class="notice"><strong>Data availability:</strong> suburb-level application counts are omitted because no approved reusable source is available.</div></body></html>`;
}

for (const area of AREAS) {
  const data = artifact(area);
  fs.writeFileSync(
    path.join(ROOT, "data", "validation", `${slug(area.suburb)}-glen-eira-planning-context-2025.json`),
    `${JSON.stringify(data, null, 2)}\n`,
  );
  const page = path.join(ROOT, "public", "suburb", `${slug(area.suburb)}-vic.html`);
  let html = fs.existsSync(page) ? fs.readFileSync(page, "utf8") : pageTemplate(area);
  html = html.replace(/[\r\n]*<!-- AHV_GLEN_EIRA_PLANNING_CONTEXT_START -->[\s\S]*?<!-- AHV_GLEN_EIRA_PLANNING_CONTEXT_END -->[\r\n]*/g, "");
  html = html.includes("<!-- AHV_GLEN_EIRA_PLANNING_CONTEXT_INSERT -->")
    ? html.replace("<!-- AHV_GLEN_EIRA_PLANNING_CONTEXT_INSERT -->", markup(data))
    : html.replace("</body>", `${markup(data)}</body>`);
  fs.writeFileSync(page, html);
}

console.log(JSON.stringify({ areas: AREAS.length, councilMetrics: { medianDecisionDays: 70, withinRequiredTimePercent: 80 } }));
