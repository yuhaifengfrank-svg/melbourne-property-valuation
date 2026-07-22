import fs from "node:fs";
import { aggregatePlanningPipeline } from "../lib/planning-application-normalizer.js";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath) throw new Error("Usage: node scripts/summarize-planning-pipeline.mjs input.json [output.json]");
const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const summary = aggregatePlanningPipeline(source.records, source.filters);
const result = {
  schemaVersion: "planning-pipeline-summary-v1",
  source: source.source,
  filters: source.filters,
  quality: source.quality,
  summary: {
    rawApplicationCount: summary.rawApplicationCount,
    uniqueProjectCount: summary.uniqueProjectCount,
    amendmentCount: summary.amendmentCount,
    quantifiedResidentialProjects: summary.quantifiedResidentialProjects,
    grossProposedDwellings: summary.grossProposedDwellings,
    netProposedDwellings: summary.netProposedDwellings,
    weightedNetPipeline: Number(summary.weightedNetPipeline.toFixed(2)),
    unresolvedResidentialProjects: summary.unresolvedResidentialProjects,
  },
  projectAudit: summary.projects
    .filter((project) => project.newDwellings != null || project.quality === "unresolved")
    .map((project) => ({
      applicationNumber: project.applicationNumber,
      baseApplicationNumber: project.baseApplicationNumber,
      amendment: project.amendment,
      lodgedDate: project.lodgedDate,
      status: project.status,
      decision: project.decision,
      statusWeight: project.statusWeight,
      newDwellings: project.newDwellings,
      demolishedDwellings: project.demolishedDwellings,
      netDwellings: project.netDwellings,
      quality: project.quality,
      warnings: project.warnings,
    })),
};
const payload = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath) fs.writeFileSync(outputPath, payload);
else process.stdout.write(payload);
