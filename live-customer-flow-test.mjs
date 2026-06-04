const endpoint = "https://www.aushomevalue.com.au/api/leads";
const emailEndpoint = "https://formsubmit.co/ajax/info@aushomevalue.com.au";
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
const sendTestEmail = process.env.SEND_TEST_EMAIL === "1";

const leadPayload = {
  name: "Codex Mobile Full Flow DO NOT CONTACT",
  email: `codex-mobile-full-flow-${stamp}@example.com`,
  phone: "0412345678",
  contactConsent: true,
  pdfDownload: true,
  propertyAddress: "9 McIntosh Street, Oakleigh VIC 3166",
  propertySuburb: "Oakleigh",
  propertyState: "VIC",
  propertyType: "House",
  estimatedValue: "$1.208m - $1.308m",
  midpointValue: 1258000,
  confidence: "High",
  selectedLvr: 60,
  language: "en",
  eventType: "pdf_download",
  analysis: {
    test: true,
    channel: "mobile",
    flow: [
      "mobile login",
      "address valuation",
      "photo evidence upload",
      "manual notes",
      "valuation revised",
      "registration",
      "phone supplied",
      "contact consent checked",
      "PDF download",
      "database save",
      "email notification dedupe"
    ],
    evidenceSummary: [
      "Photo evidence: renovated kitchen, updated bathroom, good condition, quiet wide street.",
      "Manual notes: title confirms land size; no visible easement."
    ]
  }
};

async function postLead(attempt) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-ip-country": "AU",
      "x-vercel-ip-country-region": "VIC",
      "x-vercel-ip-city": "Melbourne"
    },
    body: JSON.stringify({
      ...leadPayload,
      analysis: {
        ...leadPayload.analysis,
        attempt
      }
    })
  });

  if (!response.ok) {
    throw new Error(`API attempt ${attempt} failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  return {
    attempt,
    id: body.lead?.id,
    shouldSend: body.notification?.should_send,
    duplicateOf: body.notification?.duplicate_of || "",
    priority: body.lead?.priority,
    score: body.lead?.lead_score,
    region: [body.lead?.ip_city, body.lead?.ip_region, body.lead?.ip_country].filter(Boolean).join(", ")
  };
}

async function sendEmailNotification(firstResult) {
  if (!sendTestEmail) {
    return { sent: false, reason: "SEND_TEST_EMAIL not enabled" };
  }
  if (!firstResult.shouldSend) {
    return { sent: false, reason: "API said notification should not send" };
  }

  const response = await fetch(emailEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      _subject: `TEST DO NOT CONTACT AusHomeValue full mobile flow: ${leadPayload.propertyAddress}`,
      _template: "table",
      name: leadPayload.name,
      email: leadPayload.email,
      phone: leadPayload.phone,
      property_address: leadPayload.propertyAddress,
      property_suburb: leadPayload.propertySuburb,
      property_state: leadPayload.propertyState,
      estimated_value: leadPayload.estimatedValue,
      confidence: leadPayload.confidence,
      activity: "PDF download",
      visitor_region: firstResult.region || "Melbourne, VIC, AU",
      lead_score: firstResult.score,
      priority: firstResult.priority,
      contact_consent: "Yes",
      pdf_download: "Yes",
      submitted_at: new Date().toISOString(),
      test_note: "Automated Codex full-flow test. DO NOT CONTACT."
    })
  });

  return { sent: response.ok, status: response.status, text: response.ok ? "" : await response.text() };
}

const first = await postLead(1);
const second = await postLead(2);
const email = await sendEmailNotification(first);

console.table([first, second]);
console.table([{ check: "database first save", result: Boolean(first.id) }, { check: "database duplicate save", result: Boolean(second.id) }, { check: "first notification allowed", result: first.shouldSend === true }, { check: "duplicate notification blocked", result: second.shouldSend === false }, { check: "duplicate reference", result: Boolean(second.duplicateOf) }, { check: "test email sent", result: email.sent, note: email.reason || email.status || "" }]);

const failures = [];
if (!first.id) failures.push("first lead was not stored");
if (!second.id) failures.push("duplicate lead was not stored");
if (first.shouldSend !== true) failures.push("first lead should allow notification");
if (second.shouldSend !== false) failures.push("duplicate lead should block notification");
if (!second.duplicateOf) failures.push("duplicate lead should reference duplicate_of");
if (sendTestEmail && !email.sent) failures.push(`test email failed: ${email.status || email.reason} ${email.text || ""}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Live customer flow checks passed.");
