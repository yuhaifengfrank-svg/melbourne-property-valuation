#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const WFS_URL = "https://opendata.maps.vic.gov.au/geoserver/wfs";
const TYPE_NAME = "open-data-platform:plan_overlay";
const PAGE_SIZE = 2000;
const MELBOURNE_BBOX = "143.8,-38.7,145.8,-37.2";
const DEFAULT_OUTPUT = "/home/ubuntu/raw/vicplan/heritage_overlays_melbourne.geojson";

const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const outputPath = resolve(outputArg ? outputArg.slice("--output=".length) : DEFAULT_OUTPUT);
const filter = `zone_code LIKE 'HO%' AND BBOX(geom,${MELBOURNE_BBOX},'EPSG:4326')`;

async function fetchPage(startIndex) {
  const url = new URL(WFS_URL);
  const params = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: TYPE_NAME,
    count: String(PAGE_SIZE),
    startIndex: String(startIndex),
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    CQL_FILTER: filter,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { "User-Agent": "AusHomeValue/1.0" } });
  if (!response.ok) throw new Error(`VicPlan WFS ${response.status} at startIndex=${startIndex}`);
  return response.json();
}

const features = [];
let startIndex = 0;
let expectedTotal = Infinity;
while (startIndex < expectedTotal) {
  const page = await fetchPage(startIndex);
  const rows = page.features || [];
  expectedTotal = Number(page.totalFeatures ?? page.numberMatched ?? rows.length);
  features.push(...rows);
  console.log(`[heritage-artifact] ${features.length}/${expectedTotal}`);
  if (rows.length === 0) break;
  startIndex += rows.length;
}

const artifact = {
  type: "FeatureCollection",
  metadata: {
    source: WFS_URL,
    typeName: TYPE_NAME,
    filter,
    bbox: MELBOURNE_BBOX.split(",").map(Number),
    generatedAt: new Date().toISOString(),
    featureCount: features.length,
  },
  features,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(artifact));
console.log(`[heritage-artifact] wrote ${features.length} features to ${outputPath}`);
