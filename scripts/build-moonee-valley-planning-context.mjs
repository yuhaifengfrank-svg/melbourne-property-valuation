#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANNUAL_REPORT = "https://mvcc.vic.gov.au/wp-content/uploads/2025/10/Annual-Report-2024-25.pdf";
const LOCALITIES_SOURCE = "https://www.vic.gov.au/know-your-council-moonee-valley-city-council";
const REGISTER_SOURCE = "https://online.mvcc.vic.gov.au/epathway/Production/web/Default.aspx";
const AREAS = [
  ["ABERFELDIE", "3040", false],
  ["AIRPORT WEST", "3042", false],
  ["ASCOT VALE", "3032", false],
  ["AVONDALE HEIGHTS", "3034", false],
  ["ESSENDON", "3040", false],
  ["ESSENDON NORTH", "3041", false],
  ["ESSENDON WEST", "3040", false],
  ["FLEMINGTON", "3031", true],
  ["KEILOR EAST", "3033", true],
  ["MOONEE PONDS", "3039", false],
  ["NIDDRIE", "3042", false],
  ["STRATHMORE", "3041", false],
  ["STRATHMORE HEIGHTS", "3041", false],
  ["TRAVANCORE", "3032", false],
];
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function buildArtifact([suburb, postcode, partialCouncilGeography]) {
  return {
    schemaVersion: "planning-context-summary-v1",
    sources: [
      { publisher: "Moonee Valley City Council", url: ANNUAL_REPORT, report: "Annual Report 2024/25", reportingPeriodEnd: "2025-06-30", pages: [138, 139, 167] },
      { publisher: "Victorian Government", url: LOCALITIES_SOURCE, report: "Know Your Council - Moonee Valley City Council", statusChecked: "2026-07-31" },
      { publisher: "Moonee Valley City Council", url: REGISTER_SOURCE, report: "Planning Application Enquiries portal", statusChecked: "2026-07-31" },
    ],
    geography: {
      suburb,
      postcode,
      council: "Moonee Valley City Council",
      councilContextOnly: true,
      note: partialCouncilGeography
        ? "This locality crosses council boundaries; the service metrics describe Moonee Valley City Council only, not the whole suburb"
        : "Council-wide service metrics are context, not suburb-level application counts",
    },
    councilPlanningService: {
      medianDecisionDays: 79,
      decidedWithinRequiredTimePercent: 84.48,
      applicationsDecided: 786,
      periodEnd: "2025-06-30",
      metricDefinitions: {
        medianDecisionDays: "Median number of days between receipt of a planning application and a decision",
        decidedWithinRequiredTimePercent: "Percentage of Standard and VicSmart planning application decisions made within their relevant required timeframes",
        applicationsDecided: "Standard and VicSmart planning application decisions made during 2024/25",
      },
    },
    activityCentre: { included: false, description: "No activity-centre claim is added in this council-context release" },
    publication: {
      publishable: true,
      pagePublished: true,
      limitations: [
        "The service measures are Moonee Valley-wide facts, not suburb-level application counts",
        ...(partialCouncilGeography ? ["The suburb crosses council boundaries; Moonee Valley context applies only to the Moonee Valley portion"] : []),
        "Applications decided is a whole-council service count, not a proposed dwelling, approval, commencement or completion count",
        "No address-level planning register data is collected or republished",
        "The reviewed planning enquiry portal does not provide a stable official bulk export, so no suburb application count is inferred",
      ],
    },
  };
}

export function writeArtifacts() {
  for (const area of AREAS) {
    fs.writeFileSync(path.join(ROOT, "data", "validation", `${slug(area[0])}-moonee-valley-planning-context-2025.json`), `${JSON.stringify(buildArtifact(area), null, 2)}\n`);
  }
  return { areas: AREAS.length, medianDecisionDays: 79, decidedWithinRequiredTimePercent: 84.48, applicationsDecided: 786 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(writeArtifacts()));
