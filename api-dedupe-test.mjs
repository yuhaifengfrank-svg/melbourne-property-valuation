const endpoint = "https://www.aushomevalue.com.au/api/leads";
const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");

const cases = [
  { type: "House", address: "9 McIntosh Street, Oakleigh VIC 3166", suburb: "Oakleigh", state: "VIC", value: "$1.14m - $1.36m", midpoint: 1250000 },
  { type: "Vacant land", address: "13 Gadd Street, Oakleigh VIC 3166", suburb: "Oakleigh", state: "VIC", value: "$1.02m - $1.18m", midpoint: 1100000 },
  { type: "Townhouse", address: "Unit 1, 5 McIntosh Street, Oakleigh VIC 3166", suburb: "Oakleigh", state: "VIC", value: "$930k - $1.03m", midpoint: 980000 },
  { type: "Villa", address: "Unit 2, 11 McIntosh Street, Oakleigh VIC 3166", suburb: "Oakleigh", state: "VIC", value: "$790k - $870k", midpoint: 830000 },
  { type: "Unit", address: "Unit 1, 3 McIntosh Street, Oakleigh VIC 3166", suburb: "Oakleigh", state: "VIC", value: "$720k - $810k", midpoint: 765000 },
  { type: "Apartment", address: "Apartment 12, 20 Haughton Road, Oakleigh VIC 3166", suburb: "Oakleigh", state: "VIC", value: "$540k - $610k", midpoint: 575000 },
  { type: "Commercial", address: "Commercial Shop 1, Test Street, Oakleigh VIC 3166", suburb: "Oakleigh", state: "VIC", value: "Coming soon", midpoint: null }
];

async function postLead(testCase, attempt) {
  const slug = testCase.type.toLowerCase().replaceAll(" ", "-");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-ip-country": "AU",
      "x-vercel-ip-country-region": "VIC",
      "x-vercel-ip-city": "Melbourne"
    },
    body: JSON.stringify({
      name: `Codex ${testCase.type} Regression DO NOT CONTACT`,
      email: `codex-${slug}-regression-${stamp}@example.com`,
      phone: "0400000000",
      contactConsent: true,
      pdfDownload: true,
      propertyAddress: testCase.address,
      propertySuburb: testCase.suburb,
      propertyState: testCase.state,
      propertyType: testCase.type,
      estimatedValue: testCase.value,
      midpointValue: testCase.midpoint,
      confidence: testCase.type === "Commercial" ? "Pending" : "High",
      selectedLvr: 60,
      language: "en",
      eventType: "pdf_download",
      analysis: {
        regression: true,
        attempt,
        propertyType: testCase.type
      }
    })
  });

  if (!response.ok) {
    throw new Error(`${testCase.type} attempt ${attempt} failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  return {
    type: testCase.type,
    attempt,
    id: body.lead?.id,
    shouldSend: body.notification?.should_send,
    duplicateOf: body.notification?.duplicate_of || "",
    priority: body.lead?.priority,
    score: body.lead?.lead_score
  };
}

const results = [];
for (const testCase of cases) {
  results.push(await postLead(testCase, 1));
  results.push(await postLead(testCase, 2));
}

console.table(results);

const failures = [];
for (const testCase of cases) {
  const rows = results.filter((row) => row.type === testCase.type);
  if (rows[0]?.shouldSend !== true) failures.push(`${testCase.type}: first submit should_send should be true`);
  if (rows[1]?.shouldSend !== false) failures.push(`${testCase.type}: duplicate submit should_send should be false`);
  if (!rows[1]?.duplicateOf) failures.push(`${testCase.type}: duplicate submit should reference duplicate_of`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("All API duplicate-notification checks passed.");
