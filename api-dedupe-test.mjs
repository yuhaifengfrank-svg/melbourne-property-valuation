const endpoint = "https://www.aushomevalue.com.au/api/leads";
const stamp = (process.env.TEST_RUN_ID || new Date().toISOString())
  .replaceAll("-", "")
  .replaceAll(":", "")
  .replaceAll(".", "")
  .replace("T", "-")
  .replace("Z", "");

const cases = [
  { type: "House", address: "1 Test House Street, Melbourne VIC", suburb: "Melbourne", state: "VIC" },
  { type: "Vacant land", address: "2 Test Land Road, Melbourne VIC", suburb: "Melbourne", state: "VIC" },
  { type: "Townhouse", address: "3/10 Test Townhouse Lane, Melbourne VIC", suburb: "Melbourne", state: "VIC" },
  { type: "Villa", address: "4/10 Test Villa Lane, Melbourne VIC", suburb: "Melbourne", state: "VIC" },
  { type: "Unit", address: "5/10 Test Unit Lane, Melbourne VIC", suburb: "Melbourne", state: "VIC" },
  { type: "Apartment", address: "Apartment 6, 10 Test Apartment Lane, Melbourne VIC", suburb: "Melbourne", state: "VIC" },
  { type: "Commercial", address: "Shop 7, 10 Test Commercial Lane, Melbourne VIC", suburb: "Melbourne", state: "VIC" }
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
      estimatedValue: "Not provided in lead dedupe test",
      midpointValue: null,
      confidence: "Pending",
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
