#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANNUAL_REPORT = "https://www.yarracity.vic.gov.au/sites/default/files/2025-10/2024-25_Yarra_City_Council_Annual_Report.pdf";
const LOCALITIES_SOURCE = "https://www.vic.gov.au/know-your-council-yarra-city-council";
const AREAS = [
  ["ABBOTSFORD", "3067", false],
  ["ALPHINGTON", "3078", true],
  ["BURNLEY", "3121", false],
  ["CARLTON NORTH", "3054", true],
  ["CLIFTON HILL", "3068", false],
  ["COLLINGWOOD", "3066", false],
  ["CREMORNE", "3121", false],
  ["FAIRFIELD", "3078", true],
  ["FITZROY", "3065", false],
  ["FITZROY NORTH", "3068", true],
  ["PRINCES HILL", "3054", false],
  ["RICHMOND", "3121", false],
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function buildArtifact([suburb, postcode, partialCouncilGeography]) {
  return {
    schemaVersion: "planning-context-summary-v1",
    sources: [
      {
        publisher: "City of Yarra",
        url: ANNUAL_REPORT,
        report: "Annual Report 2024/25",
        reportingPeriodEnd: "2025-06-30",
        pages: [270, 271],
      },
      {
        publisher: "Victorian Government",
        url: LOCALITIES_SOURCE,
        report: "Know Your Council - Yarra City Council",
        statusChecked: "2026-07-30",
      },
    ],
    geography: {
      suburb,
      postcode,
      council: "City of Yarra",
      councilContextOnly: true,
      note: partialCouncilGeography
        ? "This locality crosses council boundaries; the service metrics describe City of Yarra only, not the whole suburb"
        : "Council-wide service metrics are context, not suburb-level application counts",
    },
    councilPlanningService: {
      medianDecisionDays: 119,
      decidedWithinRequiredTimePercent: 46.63,
      periodEnd: "2025-06-30",
      metricDefinitions: {
        medianDecisionDays: "Median number of days between receipt of a planning application and a decision",
        decidedWithinRequiredTimePercent: "Regular decisions within 60 days plus VicSmart decisions within 10 days, divided by all planning application decisions",
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
        "The service measures are City of Yarra-wide facts, not suburb-level application counts",
        ...(partialCouncilGeography ? ["The suburb crosses council boundaries; Yarra context applies only to the Yarra portion"] : []),
        "The service measures do not count proposed dwellings, approvals, commencements or completions",
        "No address-level planning register data is collected or republished in this council-context release",
        "The public register was not treated as a reusable suburb dataset because the reviewed interface does not provide a stable official bulk export",
      ],
    },
  };
}

export function writeArtifacts() {
  for (const area of AREAS) {
    const artifact = buildArtifact(area);
    fs.writeFileSync(
      path.join(ROOT, "data", "validation", `${slug(area[0])}-yarra-planning-context-2025.json`),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
  }
  return { areas: AREAS.length, medianDecisionDays: 119, decidedWithinRequiredTimePercent: 46.63 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(writeArtifacts()));
}
