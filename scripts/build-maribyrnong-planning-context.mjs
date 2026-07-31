#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANNUAL_REPORT = "https://www.maribyrnong.vic.gov.au/files/assets/public/v/2/council-plans-reports-and-publications/annual-reports/maribyrnong-city-council-annual-report-202324.pdf";
const LOCALITIES_SOURCE = "https://www.vic.gov.au/know-your-council-maribyrnong-city-council";
const REGISTER_SOURCE = "https://ecouncil.maribyrnong.vic.gov.au/eservice/dialog/daEnquiryInit.do?doc_type=5&nodeNum=142069";
const AREAS = [
  ["BRAYBROOK", "3019"],
  ["FOOTSCRAY", "3011"],
  ["KINGSVILLE", "3012"],
  ["MAIDSTONE", "3012"],
  ["MARIBYRNONG", "3032"],
  ["SEDDON", "3011"],
  ["TOTTENHAM", "3012"],
  ["WEST FOOTSCRAY", "3012"],
  ["YARRAVILLE", "3013"],
];
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function buildArtifact([suburb, postcode]) {
  return {
    schemaVersion: "planning-context-summary-v1",
    sources: [
      { publisher: "Maribyrnong City Council", url: ANNUAL_REPORT, report: "Annual Report 2023/24", reportingPeriodEnd: "2024-06-30", pages: [75, 76] },
      { publisher: "Victorian Government", url: LOCALITIES_SOURCE, report: "Know Your Council - Maribyrnong City Council", statusChecked: "2026-07-31" },
      { publisher: "Maribyrnong City Council", url: REGISTER_SOURCE, report: "Planning Application Enquiry", statusChecked: "2026-07-31" },
    ],
    geography: {
      suburb,
      postcode,
      council: "Maribyrnong City Council",
      councilContextOnly: true,
      note: "Council-wide service metrics are context, not suburb-level application counts",
    },
    councilPlanningService: {
      medianDecisionDays: 92,
      decidedWithinRequiredTimePercent: 73.66,
      applicationsReceived: 595,
      applicationsDecided: 615,
      periodEnd: "2024-06-30",
      metricDefinitions: {
        medianDecisionDays: "Median number of days between receipt of a planning application and a decision",
        decidedWithinRequiredTimePercent: "Percentage of regular and VicSmart planning application decisions made within their relevant required timeframes",
        applicationsReceived: "Planning applications received during 2023/24",
        applicationsDecided: "Planning application decisions made during 2023/24",
      },
    },
    activityCentre: { included: false, description: "No activity-centre claim is added in this council-context release" },
    publication: {
      publishable: true,
      pagePublished: true,
      limitations: [
        "The latest fully extracted statutory-planning table is the audited 2023/24 council report; it is labelled with its exact period and is not presented as current application activity",
        "The service measures are Maribyrnong-wide facts, not suburb-level application counts",
        "Applications received and decided are whole-council service counts, not proposed dwellings, approvals, commencements or completions",
        "No address-level planning register data is collected or republished",
        "The reviewed planning enquiry portal does not provide a stable official bulk export, so no suburb application count is inferred",
      ],
    },
  };
}

export function writeArtifacts() {
  for (const area of AREAS) {
    fs.writeFileSync(path.join(ROOT, "data", "validation", `${slug(area[0])}-maribyrnong-planning-context-2024.json`), `${JSON.stringify(buildArtifact(area), null, 2)}\n`);
  }
  return { areas: AREAS.length, medianDecisionDays: 92, decidedWithinRequiredTimePercent: 73.66, applicationsReceived: 595, applicationsDecided: 615 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(writeArtifacts()));
