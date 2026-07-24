#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANNUAL_REPORT = "https://www.kingston.vic.gov.au/files/sharedassets/public/v/1/hptrim/corporate-planning-reporting-annual-report-annual-report-2024-2025/kingston-annual-report-2024-25_final.pdf";
const MOORABBIN_ACTIVITY_CENTRE = "https://www.planning.vic.gov.au/guides-and-resources/strategies-and-initiatives/train-and-tram-zone-activity-centres/activity-centres-pilot-program/moorabbin";
const MENTONE_ACTIVITY_CENTRE = "https://www.planning.vic.gov.au/guides-and-resources/strategies-and-initiatives/train-and-tram-zone-activity-centres/mentone/mentone";
const LOCALITIES_SOURCE = "https://www.vic.gov.au/know-your-council-kingston-city-council";
const AREAS = [
  ["ASPENDALE", "3195"], ["ASPENDALE GARDENS", "3195"], ["BONBEACH", "3196"],
  ["BRAESIDE", "3195"], ["CARRUM", "3197"], ["CHELSEA", "3196"],
  ["CHELSEA HEIGHTS", "3196"], ["CHELTENHAM", "3192"], ["CLARINDA", "3169"],
  ["CLAYTON SOUTH", "3169"], ["DINGLEY VILLAGE", "3172"], ["EDITHVALE", "3196"],
  ["HEATHERTON", "3202"], ["HIGHETT", "3190"], ["MENTONE", "3194"],
  ["MOORABBIN", "3189"], ["MOORABBIN AIRPORT", "3194"], ["MORDIALLOC", "3195"],
  ["OAKLEIGH SOUTH", "3167"], ["PARKDALE", "3195"], ["PATTERSON LAKES", "3197"],
  ["WATERWAYS", "3195"],
].map(([suburb, postcode]) => ({
  suburb,
  postcode,
  partialCouncilGeography: ["CHELTENHAM", "HIGHETT", "MOORABBIN", "OAKLEIGH SOUTH"].includes(suburb),
  activityCentre: suburb === "MOORABBIN"
    ? { programGroup: "pilot", url: MOORABBIN_ACTIVITY_CENTRE, description: "Moorabbin is included in Victoria's finalised Activity Centres Pilot Program" }
    : suburb === "MENTONE"
      ? { programGroup: "stage_2", url: MENTONE_ACTIVITY_CENTRE, description: "Mentone station is included in the approved Stage 2 Train and Tram Zone Activity Centres Program" }
      : null,
}));

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const title = (value) => value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());

function artifact(area) {
  return {
    schemaVersion: "planning-context-summary-v1",
    sources: [
      {
        publisher: "City of Kingston",
        url: ANNUAL_REPORT,
        report: "Annual Report 2024-25",
        reportingPeriodEnd: "2025-06-30",
        pages: [51],
      },
      {
        publisher: "Victorian Government",
        url: LOCALITIES_SOURCE,
        report: "Know Your Council – Kingston City Council",
        statusChecked: "2026-07-25",
      },
      ...(area.activityCentre ? [{
        publisher: "Victorian Department of Transport and Planning",
        url: area.activityCentre.url,
        report: "Train and Tram Zone Activity Centres Program",
        statusChecked: "2026-07-25",
      }] : []),
    ],
    geography: {
      suburb: area.suburb,
      postcode: area.postcode,
      council: "Kingston City Council",
      councilContextOnly: true,
      note: area.partialCouncilGeography
        ? "This locality crosses council boundaries; the service metrics describe Kingston City Council only, not the whole suburb"
        : "Council-wide service metrics are context, not suburb-level application counts",
    },
    councilPlanningService: {
      medianDecisionDays: 84,
      decidedWithinRequiredTimePercent: 67.04,
      periodEnd: "2025-06-30",
      metricDefinitions: {
        medianDecisionDays: "Median number of days between receipt of a planning application and a decision",
        decidedWithinRequiredTimePercent: "Planning application decisions made within the relevant required time divided by all planning application decisions",
      },
    },
    activityCentre: area.activityCentre ? {
      included: true,
      programGroup: area.activityCentre.programGroup,
      description: area.activityCentre.description,
    } : {
      included: false,
      description: "No reviewed state activity-centre program claim is published for this suburb",
    },
    publication: {
      publishable: true,
      pagePublished: true,
      limitations: [
        "The service measures are council-wide facts, not suburb-level application counts",
        ...(area.partialCouncilGeography ? ["The suburb crosses council boundaries; Kingston context applies only to the Kingston portion"] : []),
        "These metrics do not measure proposed dwellings, approvals, commencements or completions",
        "No address-level planning register data is collected or republished in this council-context release",
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
<!-- AHV_KINGSTON_PLANNING_CONTEXT_START -->
<style id="ahv-kingston-planning-style">.ahv-planning{max-width:960px;margin:36px auto;padding:0 20px 36px;color:#17211d}.ahv-planning h2{font-size:1.35rem;margin:0 0 6px}.ahv-planning-intro,.ahv-planning-meta{color:#66736d}.ahv-planning-intro{margin:0 0 16px}.ahv-planning-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.ahv-planning-card{background:#fff;border:1px solid #dbe2de;border-radius:10px;padding:16px}.ahv-planning-label{font-size:.76rem;text-transform:uppercase;letter-spacing:.04em;color:#66736d;font-weight:700}.ahv-planning-value{font-size:1.4rem;font-weight:800;margin:5px 0}@media(max-width:560px){.ahv-planning{padding:0 14px 30px}.ahv-planning-grid{grid-template-columns:1fr}}</style>
<section class="ahv-planning" aria-labelledby="ahv-kingston-planning-heading">
  <h2 id="ahv-kingston-planning-heading">Kingston planning context</h2>
  <p class="ahv-planning-intro">Council-wide planning service facts for the year ended 30 June 2025. These are context only, not suburb application or dwelling counts.</p>
  <div class="ahv-planning-grid">
    <article class="ahv-planning-card"><div class="ahv-planning-label">Median decision time</div><div class="ahv-planning-value">84 days</div><div class="ahv-planning-meta">Kingston-wide service measure</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Within required time</div><div class="ahv-planning-value">67.04%</div><div class="ahv-planning-meta">Kingston-wide service measure</div></article>
${activity}
  </div>
</section>
<!-- AHV_KINGSTON_PLANNING_CONTEXT_END -->
`;
}

function pageTemplate(area) {
  const name = title(area.suburb);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} VIC Planning Research | AusHomeValue</title><meta name="description" content="Source-labelled Kingston planning context for ${name}, Victoria."><link rel="canonical" href="https://www.aushomevalue.com.au/suburb/${slug(area.suburb)}-vic.html"><meta name="robots" content="index, follow"><link rel="stylesheet" href="/shared-responsive.css"><style>*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#17211d;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}.topbar{background:#0d6b57;padding:14px 24px}.topbar a{color:#fff;text-decoration:none;font-weight:700}.container{max-width:960px;margin:auto;padding:32px 20px 12px}.breadcrumb,.eyebrow,.notice{color:#66736d}.notice{max-width:920px;margin:0 auto 48px;padding:14px 16px;background:#e8f3ef;border-left:4px solid #0d6b57;border-radius:6px}</style></head><body><div class="topbar"><a href="/">← AusHomeValue</a></div><main class="container"><div class="breadcrumb"><a href="/">Home</a> / <a href="/suburb-research.html">Suburb Research</a> / ${name}</div><h1>${name}, VIC — Planning Research</h1><p class="eyebrow">Postcode ${area.postcode} · Kingston council context · Only verified, source-labelled metrics are shown.</p></main><!-- AHV_KINGSTON_PLANNING_CONTEXT_INSERT --><div class="notice"><strong>Data availability:</strong> suburb-level application counts are omitted because no approved reusable source is included in this release.</div></body></html>`;
}

for (const area of AREAS) {
  const data = artifact(area);
  fs.writeFileSync(path.join(ROOT, "data", "validation", `${slug(area.suburb)}-kingston-planning-context-2025.json`), `${JSON.stringify(data, null, 2)}\n`);
  const page = path.join(ROOT, "public", "suburb", `${slug(area.suburb)}-vic.html`);
  let html = fs.existsSync(page) ? fs.readFileSync(page, "utf8") : pageTemplate(area);
  html = html.replace(/[\r\n]*<!-- AHV_KINGSTON_PLANNING_CONTEXT_START -->[\s\S]*?<!-- AHV_KINGSTON_PLANNING_CONTEXT_END -->[\r\n]*/g, "");
  html = html.includes("<!-- AHV_KINGSTON_PLANNING_CONTEXT_INSERT -->")
    ? html.replace("<!-- AHV_KINGSTON_PLANNING_CONTEXT_INSERT -->", markup(data))
    : html.replace("</body>", `${markup(data)}</body>`);
  fs.writeFileSync(page, html);
}

console.log(JSON.stringify({ areas: AREAS.length, councilMetrics: { medianDecisionDays: 84, withinRequiredTimePercent: 67.04 } }));
