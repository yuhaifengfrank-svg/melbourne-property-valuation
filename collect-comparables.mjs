#!/usr/bin/env node
import { collectComparableResearch } from "./lib/comparable-research-collector.js";

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  if (value) return value.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] || fallback;
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

if (hasFlag("help") || process.argv.length <= 2) {
  console.log(`Usage:
  node collect-comparables.mjs --address "22 Lancaster Street Bentleigh East VIC 3165" --type House --suburb "Bentleigh East" --state VIC

Options:
  --address   Required. Full or partial property address.
  --type      Optional. House, Townhouse, Unit, Apartment, Villa, Vacant land.
  --suburb    Optional. Used when the address does not include suburb.
  --state     Optional. Defaults to VIC unless the address contains VIC/NSW/QLD/WA/SA/TAS/ACT/NT.
  --no-fetch  Build the research/source-link plan without fetching public webpages.
  --pretty    Pretty-print JSON.
`);
  process.exit(0);
}

const result = await collectComparableResearch(
  {
    address: readArg("address"),
    propertyType: readArg("type"),
    suburb: readArg("suburb"),
    state: readArg("state")
  },
  {
    fetch: !hasFlag("no-fetch")
  }
);

console.log(JSON.stringify(result, null, hasFlag("pretty") ? 2 : 0));
