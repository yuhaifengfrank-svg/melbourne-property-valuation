import fs from "node:fs";
import vm from "node:vm";

class MockClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  toggle(value, force) {
    if (force === undefined) {
      if (this.values.has(value)) this.values.delete(value);
      else this.values.add(value);
      return this.values.has(value);
    }
    if (force) this.values.add(value);
    else this.values.delete(value);
    return force;
  }

  contains(value) {
    return this.values.has(value);
  }
}

class MockElement {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.checked = false;
    this.textContent = "";
    this._innerHTML = "";
    this.placeholder = "";
    this.href = "";
    this.download = "";
    this.dataset = {};
    this.style = {};
    this.classList = new MockClassList();
  }

  addEventListener() {}

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === "") this.children = [];
  }

  appendChild(child) {
    this.children = this.children || [];
    this.children.push(child);
  }
  click() {}
  close() {}
  focus() {}
  scrollIntoView() {}
  showModal() {
    this.open = true;
  }
  querySelectorAll() {
    return [];
  }
  querySelector() {
    return new MockElement();
  }
}

function makeDocument() {
  const elements = new Map();
  const ids = [
    "property-state", "suburb", "address", "property-address", "estimated-value", "midpoint", "confidence",
    "mobile-property-address", "mobile-estimated-value", "mobile-midpoint", "mobile-confidence", "check-status",
    "street-rank", "street-type", "amenity-access", "parking-pressure", "land-source", "granny-potential",
    "approval-certainty", "reasons", "suburb-list", "comparables-body", "map-target", "map-station", "map-shops",
    "selected-lvr", "max-loan", "required-equity", "locked-strip", "investor-lock", "investor-detail",
    "report-guide", "evidence-review", "evidence-review-list", "upload-message", "lead-email", "lead-name",
    "lead-phone", "lead-consent", "lead-message", "language-toggle", "start-valuation", "mobile-report-cta",
    "upload-evidence", "evidence-files", "download-pdf", "unlock-report", "modal-close", "modal-register",
    "guide-comparables", "guide-location", "guide-close", "pdf-fill-details", "pdf-close", "open-qr-modal",
    "qr-close", "unlock-title", "unlock-modal", "report-guide-modal", "pdf-requirements-modal", "qr-modal",
    "investor-theme-title", "investor-theme-copy", "investor-theme-list", "investor-theme-detail",
    "evidence-revision-note", "market-crosscheck-title", "market-crosscheck-summary", "market-crosscheck-score",
    "market-source-grid", "market-crosscheck-note"
  ];
  ids.forEach((id) => elements.set(id, new MockElement(id)));
  elements.get("property-state").value = "VIC";

  const chips = ["House", "Vacant land", "Townhouse", "Villa", "Unit", "Apartment", "Commercial"].map((type) => {
    const element = new MockElement();
    element.dataset.type = type;
    if (type === "House") element.classList.add("active");
    return element;
  });
  const lvrs = [0.6, 0.7, 0.8].map((lvr) => {
    const element = new MockElement();
    element.dataset.lvr = String(lvr);
    return element;
  });
  const planningLabels = [new MockElement(), new MockElement(), new MockElement()];

  const document = {
    body: new MockElement("body"),
    documentElement: new MockElement("html"),
    createElement: () => new MockElement(),
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, new MockElement(id));
      return elements.get(id);
    },
    querySelector: (selector) => {
      if (selector === ".chip.active") return chips.find((chip) => chip.classList.contains("active")) || chips[0];
      return new MockElement(selector);
    },
    querySelectorAll: (selector) => {
      if (selector === ".chip") return chips;
      if (selector === ".lvr") return lvrs;
      if (selector === ".fundamentals-grid .detail-panel:nth-child(2) dt") return planningLabels;
      if (selector.includes("detail-panel")) return [new MockElement(), new MockElement(), new MockElement()];
      if (selector.includes("theme-card")) return [];
      if (selector.includes("checklist")) return [];
      if (selector.includes("upload-list")) return [];
      if (selector === "th") return [];
      if (selector === ".facts dt") return planningLabels;
      return [];
    }
  };

  return { document, elements, chips };
}

class MockFileReader {
  readAsText(file) {
    this.result = file.content || "";
    this.onload?.();
  }
}

const { document, elements, chips } = makeDocument();
const objectUrls = [];
const context = {
  console,
  document,
  FileReader: MockFileReader,
  Blob,
  URL: {
    createObjectURL(blob) {
      objectUrls.push(blob);
      return `blob:${objectUrls.length}`;
    },
    revokeObjectURL() {}
  },
  localStorage: new Map(),
  window: {
    matchMedia: () => ({ matches: false })
  },
  fetch: async (url) => {
    if (String(url).includes("/api/leads")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          lead: {
            id: "local",
            lead_score: 90,
            priority: "Hot",
            ip_city: "Melbourne",
            ip_region: "VIC",
            ip_country: "AU"
          },
          notification: { should_send: true }
        })
      };
    }
    return { ok: true };
  }
};

context.localStorage.getItem = (key) => context.localStorage.get(key) || null;
context.localStorage.setItem = (key, value) => context.localStorage.set(key, value);

const app = fs.readFileSync(new URL("./app.js", import.meta.url), "utf8");
const expose = `
globalThis.__test = {
  valuations,
  commercialPendingValuation,
  findValuation,
  renderValuation,
  applyEvidenceFiles,
  buildMarketCrosscheck,
  buildDetailedReportLines,
  createPdfDocument,
  buildEnteredAddress,
  get currentValuation() { return currentValuation; }
};
`;

vm.createContext(context);
vm.runInContext(`${app}\n${expose}`, context, { filename: "app.js" });

const evidenceFiles = [
  {
    name: "title-plan-section-32.txt",
    content: "section 32 certificate of title title plan plan of subdivision no easement"
  },
  {
    name: "planning-street-condition.txt",
    content: "planning zoning overlay council quiet wide street trees low traffic renovated good condition well maintained"
  },
  {
    name: "photos-inspection-notes.txt",
    content: "current photos inspection notes updated kitchen updated bathroom courtyard car space"
  }
];

const cases = [
  { type: "House", state: "VIC", suburb: "Oakleigh", address: "9 McIntosh Street", expected: "9 McIntosh Street, Oakleigh VIC 3166" },
  { type: "Vacant land", state: "VIC", suburb: "Oakleigh", address: "13 Gadd Street", expected: "13 Gadd Street, Oakleigh VIC 3166" },
  { type: "Townhouse", state: "VIC", suburb: "Oakleigh", address: "Unit 1, 5 McIntosh Street", expected: "Unit 1, 5 McIntosh Street, Oakleigh VIC 3166" },
  { type: "Villa", state: "VIC", suburb: "Oakleigh", address: "Unit 2, 11 McIntosh Street", expected: "Unit 2, 11 McIntosh Street, Oakleigh VIC 3166" },
  { type: "Unit", state: "VIC", suburb: "Oakleigh", address: "Unit 1, 3 McIntosh Street", expected: "Unit 1, 3 McIntosh Street, Oakleigh VIC 3166" },
  { type: "Apartment", state: "VIC", suburb: "Oakleigh", address: "Apartment 12, 20 Haughton Road", expected: "Apartment 12, 20 Haughton Road, Oakleigh VIC 3166" },
  { type: "Commercial", state: "VIC", suburb: "Oakleigh", address: "Commercial Shop 1, Test Street", expected: "Commercial Shop 1, Test Street, Oakleigh, VIC", pending: true }
];

const results = [];

for (const testCase of cases) {
  chips.forEach((chip) => chip.classList.toggle("active", chip.dataset.type === testCase.type));
  elements.get("property-state").value = testCase.state;
  elements.get("suburb").value = testCase.suburb;
  elements.get("address").value = testCase.address;
  elements.get("lead-email").value = `regression-${testCase.type.toLowerCase().replaceAll(" ", "-")}@example.com`;
  elements.get("lead-name").value = `Regression ${testCase.type}`;
  elements.get("lead-phone").value = "0400000000";
  elements.get("lead-consent").checked = true;

  const fullAddress = context.__test.buildEnteredAddress();
  const match = testCase.pending ? null : context.__test.findValuation(fullAddress, testCase.type);
  if (testCase.pending) {
    context.__test.renderValuation({
      ...context.__test.commercialPendingValuation,
      address: fullAddress
    });
  } else {
    if (!match) throw new Error(`No valuation matched for ${testCase.type}: ${fullAddress}`);
    context.__test.renderValuation(match);
  }

  const before = context.__test.currentValuation.midpointValue;
  if (!testCase.pending) {
    await context.__test.applyEvidenceFiles(evidenceFiles);
  }
  const after = context.__test.currentValuation.midpointValue;
  const marketCrosscheck = context.__test.buildMarketCrosscheck(context.__test.currentValuation);
  const reportLines = context.__test.buildDetailedReportLines();
  const pdf = context.__test.createPdfDocument(reportLines);
  const header = Buffer.from(await pdf.arrayBuffer()).subarray(0, 8).toString();
  const reportText = reportLines.map((line) => line.text).join("\n");

  results.push({
    type: testCase.type,
    address: context.__test.currentValuation.address,
    value: context.__test.currentValuation.value,
    before,
    after,
    changed: testCase.pending ? "pending" : before !== after,
    confidence: context.__test.currentValuation.confidence,
    marketSources: marketCrosscheck.sources.length,
    sourceScore: marketCrosscheck.score ?? "pending",
    hasCorePortals: marketCrosscheck.sources.some((source) => source.name === "realestate.com.au") &&
      marketCrosscheck.sources.some((source) => source.name === "Domain"),
    reportHasCrosscheck: reportText.includes("9A. Public market cross-check queue"),
    pdf: header.startsWith("%PDF-1.") ? "ok" : "failed",
    reportLines: reportLines.length
  });
}

console.table(results);

const failures = results.filter((row) => {
  if (row.pdf !== "ok") return true;
  if (row.type !== "Commercial" && !row.changed) return true;
  if (row.type !== "Commercial" && row.marketSources !== 8) return true;
  if (row.type !== "Commercial" && !row.hasCorePortals) return true;
  if (!row.reportHasCrosscheck) return true;
  if (row.type === "Commercial" && row.changed !== "pending") return true;
  return false;
});

if (failures.length) {
  console.error("Regression failures:", failures);
  process.exit(1);
}

console.log("All property type regression checks passed.");
