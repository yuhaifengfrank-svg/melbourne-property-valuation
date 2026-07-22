import { readFileSync } from "node:fs";

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { result.push(current); current = ""; }
    else current += char;
  }
  result.push(current.replace(/\r$/, ""));
  return result;
}

function number(value) {
  if (value == null || value.trim() === "" || value.trim() === "-") return null;
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function priorYearQuarter(quarter) {
  const match = /^(Mar|Jun|Sep|Dec)-(\d{2})$/.exec(quarter);
  if (!match) throw new Error(`Invalid quarter: ${quarter}`);
  return `${match[1]}-${String(Number(match[2]) - 1).padStart(2, "0")}`;
}

export function parseSalmFile(path, latestQuarter = "Dec-25") {
  const lines = readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith("Data Item,"));
  if (headerIndex < 0) throw new Error("SALM header not found");
  const header = splitCsvLine(lines[headerIndex]);
  const quarterNames = header.slice(3);
  if (!quarterNames.includes(latestQuarter)) throw new Error(`Quarter ${latestQuarter} not present`);
  const grouped = new Map();
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const row = splitCsvLine(line);
    const [item, sa2Name, sa2Code] = row;
    if (!sa2Code) continue;
    const target = grouped.get(sa2Code) || { sa2_code: sa2Code, sa2_name: sa2Name, historical_data: {} };
    for (let index = 0; index < quarterNames.length; index++) {
      const value = number(row[index + 3]);
      if (value == null) continue;
      const quarter = quarterNames[index];
      const point = target.historical_data[quarter] ||= {};
      if (item === "Smoothed labour force (persons)") point.lf = value;
      if (item === "Smoothed unemployment (persons)") point.unemp = value;
      if (item === "Smoothed unemployment rate (%)") point.rate = value;
    }
    grouped.set(sa2Code, target);
  }
  const baseQuarter = priorYearQuarter(latestQuarter);
  return [...grouped.values()].map((row) => {
    const latest = row.historical_data[latestQuarter] || {};
    const base = row.historical_data[baseQuarter] || {};
    const employmentCount = latest.lf != null && latest.unemp != null ? latest.lf - latest.unemp : null;
    const baseEmployment = base.lf != null && base.unemp != null ? base.lf - base.unemp : null;
    const growth = employmentCount != null && baseEmployment > 0 ? ((employmentCount / baseEmployment) - 1) * 100 : null;
    return {
      ...row,
      latest_quarter: latestQuarter,
      labour_force: latest.lf ?? null,
      unemployed: latest.unemp ?? null,
      unemployment_rate: latest.rate ?? null,
      employment_count: employmentCount,
      employment_growth_yoy: growth,
      employment_growth_base_quarter: baseQuarter,
      quarters_available: Object.keys(row.historical_data).length
    };
  });
}

export function aggregateSalmRows(rows) {
  if (!rows.length) return null;
  const sum = (key) => rows.every((row) => row[key] != null) ? rows.reduce((total, row) => total + Number(row[key]), 0) : null;
  const labourForce = sum("labour_force");
  const unemployed = sum("unemployed");
  const employmentCount = sum("employment_count");
  const baseEmployment = rows.every((row) => row.base_employment_count != null)
    ? rows.reduce((total, row) => total + Number(row.base_employment_count), 0)
    : null;
  return {
    sa2_codes: rows.map((row) => row.sa2_code),
    latest_quarter: rows[0].latest_quarter,
    labour_force: labourForce,
    unemployed,
    unemployment_rate: labourForce > 0 ? unemployed / labourForce * 100 : null,
    employment_count: employmentCount,
    employment_growth_yoy: employmentCount != null && baseEmployment > 0 ? (employmentCount / baseEmployment - 1) * 100 : null
  };
}
