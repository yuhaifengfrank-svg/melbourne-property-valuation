#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANNUAL_REPORT = "https://www.darebin.vic.gov.au/files/assets/public/v/2/about-council/documents/darebin-city-council-annual-report_20242025.pdf";
const LOCALITIES_SOURCE = "https://www.vic.gov.au/know-your-council-darebin-city-council";
const REGISTER_SOURCE = "https://www.darebin.vic.gov.au/Planning-and-building/Planning/Planning-step-6-feedback-and-assessment/Advertised-applications-and-planning-register";
const AREAS = [
  ["ALPHINGTON", "3078", true],
  ["BUNDOORA", "3083", true],
  ["COBURG", "3058", true],
  ["COBURG NORTH", "3058", true],
  ["FAIRFIELD", "3078", true],
  ["KEON PARK", "3073", false],
  ["KINGSBURY", "3083", false],
  ["MACLEOD", "3085", true],
  ["NORTHCOTE", "3070", false],
  ["PRESTON", "3072", false],
  ["REGENT WEST", "3072", false],
  ["RESERVOIR", "3073", false],
  ["THORNBURY", "3071", false],
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function buildArtifact([suburb, postcode, partialCouncilGeography]) {
  return {
    schemaVersion: "planning-context-summary-v1",
    sources: [
      {
        publisher: "Darebin City Council",
        url: ANNUAL_REPORT,
        report: "Annual Report 2024/25",
        reportingPeriodEnd: "2025-06-30",
        page: 101,
      },
      {
        publisher: "Victorian Government",
        url: LOCALITIES_SOURCE,
        report: "Know Your Council - Darebin City Council",
        statusChecked: "2026-07-30",
      },
      {
        publisher: "Darebin City Council",
        url: REGISTER_SOURCE,
        report: "Advertised applications and planning register access page",
        statusChecked: "2026-07-30",
      },
    ],
    geography: {
      suburb,
      postcode,
      council: "Darebin City Council",
      councilContextOnly: true,
      note: partialCouncilGeography
        ? "This locality crosses council boundaries; the service metrics describe Darebin City Council only, not the whole suburb"
        : "Council-wide service metrics are context, not suburb-level application counts",
    },
    councilPlanningService: {
      medianDecisionDays: 104,
      decidedWithinRequiredTimePercent: 55.77,
      periodEnd: "2025-06-30",
      metricDefinitions: {
        medianDecisionDays: "Median number of days between receipt of a planning application and a decision",
        decidedWithinRequiredTimePercent: "Planning application decisions made within the statutory required timeframes divided by all planning application decisions",
      },
    },
    activityCentre: {
      included: false,
      description: "No activity-centre claim is added in this council-context release",
    },
    publication: {
      publishable: true,
      pagePublished: true,
      limitations: [
        "The service measures are Darebin-wide facts, not suburb-level application counts",
        ...(partialCouncilGeography ? ["The suburb crosses council boundaries; Darebin context applies only to the Darebin portion"] : []),
        "The service measures do not count proposed dwellings, approvals, commencements or completions",
        "No address-level planning register data is collected or republished in this council-context release",
        "The reviewed planning register interface does not provide a stable official bulk export, so no suburb application count is inferred",
      ],
    },
  };
}

export function writeArtifacts() {
  for (const area of AREAS) {
    fs.writeFileSync(
      path.join(ROOT, "data", "validation", `${slug(area[0])}-darebin-planning-context-2025.json`),
      `${JSON.stringify(buildArtifact(area), null, 2)}\n`,
    );
  }
  return { areas: AREAS.length, medianDecisionDays: 104, decidedWithinRequiredTimePercent: 55.77 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(writeArtifacts()));
}
