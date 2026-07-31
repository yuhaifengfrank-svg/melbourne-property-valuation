#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANNUAL_REPORT = "https://www.maroondah.vic.gov.au/files/assets/public/v/3/documents/about-council/reporting-on-our-progress/annual-report-2024-25.pdf";
const LOCALITIES_SOURCE = "https://www.vic.gov.au/know-your-council-maroondah-city-council";
const REGISTER_SOURCE = "https://www.maroondah.vic.gov.au/Development/Planning/Planning-applications";
const AREAS = [
  ["BAYSWATER NORTH", "3153"], ["CROYDON", "3136"], ["CROYDON HILLS", "3136"],
  ["CROYDON NORTH", "3136"], ["CROYDON SOUTH", "3136"], ["HEATHMONT", "3135"],
  ["KILSYTH", "3137"], ["KILSYTH SOUTH", "3137"], ["PARK ORCHARDS", "3114"],
  ["RINGWOOD", "3134"], ["RINGWOOD EAST", "3135"], ["RINGWOOD NORTH", "3134"],
  ["VERMONT", "3133"], ["WARRANWOOD", "3134"], ["WONGA PARK", "3115"],
];
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function buildArtifact([suburb, postcode]) {
  return {
    schemaVersion: "planning-context-summary-v1",
    sources: [
      { publisher: "Maroondah City Council", url: ANNUAL_REPORT, report: "Annual Report 2024/25", reportingPeriodEnd: "2025-06-30", pages: [171] },
      { publisher: "Victorian Government", url: LOCALITIES_SOURCE, report: "Know Your Council - Maroondah City Council", statusChecked: "2026-07-31" },
      { publisher: "Maroondah City Council", url: REGISTER_SOURCE, report: "Planning applications service", statusChecked: "2026-07-31" },
    ],
    geography: {
      suburb, postcode, council: "Maroondah City Council", councilContextOnly: true,
      note: "Council-wide service metrics are context, not suburb-level application counts",
    },
    councilPlanningService: {
      medianDecisionDays: 29,
      decidedWithinRequiredTimePercent: 85.83,
      periodEnd: "2025-06-30",
      metricDefinitions: {
        medianDecisionDays: "Median number of days between receipt of a planning application and a decision",
        decidedWithinRequiredTimePercent: "Percentage of regular and VicSmart planning application decisions made within legislated timeframes",
      },
    },
    activityCentre: { included: false, description: "No activity-centre claim is added in this council-context release" },
    publication: {
      publishable: true, pagePublished: true,
      limitations: [
        "The service measures are Maroondah-wide facts, not suburb-level application counts",
        "No address-level planning application data is collected or republished",
        "No suburb application, dwelling, approval, commencement or completion count is inferred",
        "Localities can cross council boundaries; the metrics describe Maroondah City Council only",
      ],
    },
  };
}

export function writeArtifacts() {
  for (const area of AREAS) fs.writeFileSync(path.join(ROOT, "data", "validation", `${slug(area[0])}-maroondah-planning-context-2025.json`), `${JSON.stringify(buildArtifact(area), null, 2)}\n`);
  return { areas: AREAS.length, medianDecisionDays: 29, decidedWithinRequiredTimePercent: 85.83 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(writeArtifacts()));
