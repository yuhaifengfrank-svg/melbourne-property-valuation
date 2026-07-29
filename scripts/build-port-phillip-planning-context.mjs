#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_URL = "https://www.portphillip.vic.gov.au/media/damirfji/ceo-report-september-2025-issue-122-first-quarter-review.pdf";
const LOCALITIES_URL = "https://www.vic.gov.au/know-your-council-port-phillip-city-council";
const AREAS = [
  ["ALBERT PARK", "3206", false],
  ["BALACLAVA", "3183", false],
  ["ELWOOD", "3184", false],
  ["MELBOURNE", "3004", true],
  ["MIDDLE PARK", "3206", false],
  ["PORT MELBOURNE", "3207", true],
  ["RIPPONLEA", "3185", true],
  ["SOUTH MELBOURNE", "3205", false],
  ["SOUTHBANK", "3006", true],
  ["ST KILDA", "3182", false],
  ["ST KILDA EAST", "3183", true],
  ["ST KILDA WEST", "3182", false],
  ["WINDSOR", "3181", true],
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function buildArtifact([suburb, postcode, partialCouncilGeography]) {
  return {
    schemaVersion: "planning-context-summary-v1",
    sources: [
      {
        publisher: "City of Port Phillip",
        url: SOURCE_URL,
        report: "CEO Report Issue 122 — Quarter One 2025/26",
        reportingPeriodEnd: "2025-09-30",
        pages: [34],
      },
      {
        publisher: "Victorian Government",
        url: LOCALITIES_URL,
        report: "Know Your Council — Port Phillip City Council",
        statusChecked: "2026-07-29",
      },
    ],
    geography: {
      suburb,
      postcode,
      council: "City of Port Phillip",
      councilContextOnly: true,
      note: partialCouncilGeography
        ? "This locality crosses council boundaries; the service metrics describe City of Port Phillip only, not the whole suburb"
        : "Council-wide service metrics are context, not suburb-level application counts",
    },
    councilPlanningService: {
      medianDecisionDays: 44,
      decidedWithinRequiredTimePercent: 87.59,
      periodEnd: "2025-09-30",
      processedApplicationDecisions: 266,
      processedWithinRequiredTime: 233,
      metricDefinitions: {
        medianDecisionDays: "Median processing time for all planning applications in the council's Q1 2025/26 report",
        decidedWithinRequiredTimePercent: "233 applications processed within the required timeframe divided by 266 applications processed",
      },
    },
    activityCentre: {
      included: false,
      description: "No state activity-centre claim is added in this council-context release",
    },
    publication: {
      publishable: true,
      pagePublished: true,
      limitations: [
        "The service measures are City of Port Phillip-wide facts, not suburb-level application counts",
        ...(partialCouncilGeography ? ["The suburb crosses council boundaries; Port Phillip context applies only to the Port Phillip portion"] : []),
        "The 266 processed applications are planning service workload, not dwellings, approvals, commencements or completions",
        "The 87.59% service result is calculated from the report's stated 233 of 266 applications",
        "No address-level planning register data is collected or republished in this council-context release",
      ],
    },
  };
}

export function writeArtifacts() {
  for (const area of AREAS) {
    const artifact = buildArtifact(area);
    fs.writeFileSync(
      path.join(ROOT, "data", "validation", `${slug(area[0])}-port-phillip-planning-context-2025.json`),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
  }
  return { areas: AREAS.length, processedApplications: 266, processedWithinRequiredTime: 233 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(writeArtifacts()));
}
