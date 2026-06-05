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
    "enter-manual-data", "manual-data-modal", "manual-data-notes", "manual-data-save", "manual-data-close",
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
  inferPropertyTypeFromAddress,
  createInferredSameComplexValuation,
  createInferredSameStreetValuation,
  createInferredSuburbValuation,
  runAddressValuation,
  renderValuation,
  applyEvidenceFiles,
  buildMarketCrosscheck,
  buildBuiltFormVerification,
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

const addressMatchingCases = [
  {
    type: "Villa",
    address: "Unit 2, number 11 McIntosh Street Oakleigh",
    expected: "Unit 2, 11 McIntosh Street, Oakleigh VIC 3166"
  },
  {
    type: "Villa",
    address: "unit2 11 Macintosh Street Oakley",
    expected: null
  },
  {
    type: "Villa",
    address: "2/11 McIntosh Street Oakleigh",
    expected: "Unit 2, 11 McIntosh Street, Oakleigh VIC 3166"
  },
  {
    type: "Villa",
    address: "2-11 McIntosh Street Oakleigh",
    expected: "Unit 2, 11 McIntosh Street, Oakleigh VIC 3166"
  },
  {
    type: "Villa",
    address: "unit2 number 11 McIntosh Street Oakleigh",
    expected: "Unit 2, 11 McIntosh Street, Oakleigh VIC 3166"
  },
  {
    type: "Villa",
    address: "1/11 McIntosh Street Oakleigh",
    expected: null
  },
  {
    type: "Villa",
    address: "1-11 McIntosh Street Oakleigh",
    expected: null
  },
  {
    type: "House",
    address: "2/11 McIntosh Street Oakleigh",
    expected: null
  },
  {
    type: "House",
    address: "11 McIntosh Street Oakleigh",
    expected: null
  },
  {
    type: "House",
    address: "9 McIntosh Street Oakleigh",
    expected: "9 McIntosh Street, Oakleigh VIC 3166"
  },
  {
    type: "Unit",
    address: "Unit 1, 3 Macintosh Street Oakleigh",
    expected: null
  },
  {
    type: "Unit",
    address: "3 Macintosh Street Oakleigh",
    expected: null
  },
  {
    type: "Townhouse",
    address: "5 Macintosh Street Oakleigh",
    expected: null
  },
  {
    type: "Villa",
    address: "7 Macintosh Street Oakleigh",
    expected: null
  }
];

for (const testCase of addressMatchingCases) {
  const match = context.__test.findValuation(testCase.address, testCase.type);
  const resolvedAddress = match?.address || null;
  if (resolvedAddress !== testCase.expected) {
    throw new Error(`Address matcher resolved ${testCase.address} as ${resolvedAddress}, expected ${testCase.expected}`);
  }
}

const inferredUnitMatch = context.__test.createInferredSameComplexValuation(
  "Unit 1, No.11 McIntosh Street, Oakleigh, VIC",
  "Villa",
  "VIC",
  "Oakleigh"
);
if (!inferredUnitMatch) {
  throw new Error("Same-complex inference should return a valuation for Unit 1, No.11 McIntosh Street");
}
if (inferredUnitMatch.address !== "Unit 1, No.11 McIntosh Street, Oakleigh, VIC") {
  throw new Error(`Same-complex inference should preserve entered address, got ${inferredUnitMatch.address}`);
}
if (inferredUnitMatch.confidence !== "Low-Medium" || inferredUnitMatch.builtFormVerification.status !== "same-complex-inferred") {
  throw new Error("Same-complex inference should lower confidence and flag inferred built form");
}

elements.get("property-state").value = "VIC";
elements.get("suburb").value = "Perth";
elements.get("address").value = "10 Example Street, Perth WA 6000";
const waFullAddress = context.__test.buildEnteredAddress();
if (waFullAddress !== "10 Example Street, Perth WA 6000") {
  throw new Error(`Full address with explicit WA should not be repacked with selected VIC, got ${waFullAddress}`);
}
const waValuation = context.__test.runAddressValuation(waFullAddress, "House", "VIC", "Perth");
if (waValuation.propertyState !== "WA") {
  throw new Error(`Address-level state should override selected state. Expected WA, got ${waValuation.propertyState}`);
}

elements.get("property-state").value = "WA";
elements.get("suburb").value = "Oakleigh";
elements.get("address").value = "Unit 2, 11 McIntosh Street, Oakleigh VIC 3166";
const vicFullAddress = context.__test.buildEnteredAddress();
if (vicFullAddress !== "Unit 2, 11 McIntosh Street, Oakleigh VIC 3166") {
  throw new Error(`Full address with suburb/state should not be duplicated, got ${vicFullAddress}`);
}

const wrongStreetInferredUnitMatch = context.__test.createInferredSameComplexValuation(
  "Unit 1, No.11 MacIntosh Street, Oakleigh, VIC",
  "Villa",
  "VIC",
  "Oakleigh"
);
if (wrongStreetInferredUnitMatch) {
  throw new Error("Same-complex inference should not treat MacIntosh Street as McIntosh Street");
}

const relatedParentUnitCases = [
  "Unit 1, 9 McIntosh Street, Oakleigh, VIC",
  "unit1 9 McIntosh Street Oakleigh VIC",
  "unit 1 9 McIntosh Street Oakleigh VIC",
  "Unit 1/9 McIntosh Street Oakleigh VIC",
  "1/9 McIntosh Street Oakleigh VIC",
  "1-9 McIntosh Street Oakleigh VIC",
  "U1/9 McIntosh Street Oakleigh VIC",
  "U 1, 9 McIntosh Street Oakleigh VIC",
  "Unit 2 No.9 McIntosh Street Oakleigh VIC",
  "unit2 number 9 McIntosh Street Oakleigh VIC"
];

for (const address of relatedParentUnitCases) {
  const relatedParentUnitMatch = context.__test.createInferredSameComplexValuation(
    address,
    "Unit",
    "VIC",
    "Oakleigh"
  );
  if (!relatedParentUnitMatch) {
    throw new Error(`Related parent-address inference should return a valuation for ${address}`);
  }
  if (relatedParentUnitMatch.address !== address) {
    throw new Error(`Related parent-address inference should preserve entered address, got ${relatedParentUnitMatch.address}`);
  }
if (relatedParentUnitMatch.confidence !== "Low") {
    throw new Error("Related parent-address inference should keep confidence low until same-unit evidence is provided");
  }
}

const unrelatedParentUnitMatch = context.__test.createInferredSameComplexValuation(
  "Unit 3, 9 McIntosh Street, Oakleigh, VIC",
  "Unit",
  "VIC",
  "Oakleigh"
);
if (unrelatedParentUnitMatch) {
  throw new Error("Related parent-address inference should only support explicitly related unit numbers");
}

const sameStreetMatch = context.__test.createInferredSameStreetValuation(
  "7 McIntosh St Oakleigh",
  "House",
  "VIC",
  "Oakleigh"
);
if (!sameStreetMatch) {
  throw new Error("Same-street inference should return a valuation for 7 McIntosh St Oakleigh");
}
if (sameStreetMatch.address !== "7 McIntosh St Oakleigh" || sameStreetMatch.confidence !== "Low") {
  throw new Error("Same-street inference should preserve entered address and keep confidence low");
}
if (sameStreetMatch.builtFormVerification.status !== "same-street-inferred") {
  throw new Error("Same-street inference should flag the valuation as same-street inferred");
}

const wrongStreetSameStreetMatch = context.__test.createInferredSameStreetValuation(
  "7 Macintosh St Oakleigh",
  "House",
  "VIC",
  "Oakleigh"
);
if (wrongStreetSameStreetMatch) {
  throw new Error("Same-street inference should not treat Macintosh Street as McIntosh Street");
}

const suburbLevelMatch = context.__test.createInferredSuburbValuation(
  "99 Example Road, Oakleigh, VIC",
  "House",
  "VIC",
  "Oakleigh"
);
if (!suburbLevelMatch) {
  throw new Error("Suburb-level inference should return a low-confidence valuation for a residential Oakleigh address");
}
if (suburbLevelMatch.address !== "99 Example Road, Oakleigh, VIC" || suburbLevelMatch.confidence !== "Low") {
  throw new Error("Suburb-level inference should preserve entered address and keep confidence low");
}
if (suburbLevelMatch.builtFormVerification.status !== "suburb-inferred") {
  throw new Error("Suburb-level inference should flag the valuation as suburb inferred");
}

const directUnitPipelineMatch = context.__test.runAddressValuation(
  "Unit 2, 11 McIntosh Street, Oakleigh, VIC",
  "House",
  "VIC",
  "Oakleigh"
);
if (directUnitPipelineMatch.type !== "Villa" || directUnitPipelineMatch.address !== "Unit 2, 11 McIntosh Street, Oakleigh VIC 3166") {
  throw new Error("Address valuation pipeline should infer direct-address unit/villa type before using the default House chip");
}
if (directUnitPipelineMatch.midpointValue !== 840000) {
  throw new Error("Address valuation pipeline should calculate direct-address value from comparable prices, not stored static values");
}

const relatedUnitPipelineMatch = context.__test.runAddressValuation(
  "unit1 9 McIntosh Street Oakleigh VIC",
  "House",
  "VIC",
  "Oakleigh"
);
if (relatedUnitPipelineMatch.type !== "Unit" || relatedUnitPipelineMatch.confidence !== "Low") {
  throw new Error("Address valuation pipeline should classify related parent-address unit intake as Unit with low confidence");
}
if (!relatedUnitPipelineMatch.comparables.some((row) => row[0].includes("McIntosh Street"))) {
  throw new Error("Related unit intake should use nearby comparable price evidence");
}

const sameStreetPipelineMatch = context.__test.runAddressValuation(
  "7 McIntosh St Oakleigh",
  "House",
  "VIC",
  "Oakleigh"
);
if (sameStreetPipelineMatch.type !== "House" || sameStreetPipelineMatch.builtFormVerification.status !== "same-street-inferred") {
  throw new Error("Address valuation pipeline should classify 7 McIntosh St as a same-street house intake");
}

const wrongStreetPipelineMatch = context.__test.runAddressValuation(
  "7 Macintosh St Oakleigh",
  "House",
  "VIC",
  "Oakleigh"
);
if (wrongStreetPipelineMatch.builtFormVerification.status === "same-street-inferred") {
  throw new Error("Address valuation pipeline should not use McIntosh same-street evidence for Macintosh Street");
}

const mapCrosscheck = context.__test.buildMarketCrosscheck(
  context.__test.runAddressValuation("Apt1204 88 Station Street Oakleigh VIC", "House", "VIC", "Oakleigh")
);
const googleMapsSource = mapCrosscheck.sources.find((source) => source.name === "Google Maps");
if (!googleMapsSource?.url.includes("google.com/maps/search")) {
  throw new Error("Market cross-check should include a Google Maps address verification link");
}

const broadCustomerIntakeCases = [
  {
    label: "same street house",
    address: "7 McIntosh St Oakleigh",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "House",
    expectedStatus: "same-street-inferred",
    expectValue: true
  },
  {
    label: "single-field same street house",
    address: "7 McIntosh St Oakleigh",
    selectedType: "House",
    suburb: "",
    expectedType: "House",
    expectedStatus: "same-street-inferred",
    expectValue: true
  },
  {
    label: "different Oakleigh house street",
    address: "22 Atherton Road Oakleigh VIC",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "House",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "unlisted Oakleigh unit",
    address: "Unit 4, 25 Example Road Oakleigh VIC",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "Unit",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "unlisted Oakleigh unit slash format",
    address: "4/25 Example Road Oakleigh VIC",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "Unit",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "unlisted Oakleigh apartment",
    address: "Apartment 5, 88 Station Street Oakleigh VIC",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "Apartment",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "unlisted Oakleigh apartment shorthand",
    address: "Apt1204 88 Station Street Oakleigh VIC",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "Apartment",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "unlisted Oakleigh apartment slash number",
    address: "1204/88 Station Street Oakleigh VIC",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "Apartment",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "Oakleigh South house",
    address: "12 Random Street Oakleigh South VIC",
    selectedType: "House",
    suburb: "Oakleigh South",
    expectedType: "House",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "same street name but different suburb",
    address: "16 Moresby St Oakleigh VIC",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "House",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "single-field same street name but different suburb",
    address: "16 Moresby St Oakleigh VIC",
    selectedType: "House",
    suburb: "",
    expectedType: "House",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "same street and same suburb",
    address: "16 Moresby St Oakleigh South VIC",
    selectedType: "House",
    suburb: "Oakleigh South",
    expectedType: "House",
    expectedStatus: "same-street-inferred",
    expectValue: true
  },
  {
    label: "same street with misspelled suburb field",
    address: "16 moresby st",
    selectedType: "House",
    suburb: "Oakley South",
    expectedType: "House",
    expectedStatus: "same-street-inferred",
    expectValue: true
  },
  {
    label: "same street with lowercase suburb field",
    address: "16 moresby st",
    selectedType: "House",
    suburb: "oakleigh south",
    expectedType: "House",
    expectedStatus: "same-street-inferred",
    expectValue: true
  },
  {
    label: "same street with compact typo suburb field",
    address: "16 moresby st",
    selectedType: "House",
    suburb: "OAKLBIghsOUTH",
    expectedType: "House",
    expectedStatus: "same-street-inferred",
    expectValue: true
  },
  {
    label: "single-field same street and same suburb",
    address: "16 Moresby St Oakleigh South VIC",
    selectedType: "House",
    suburb: "",
    expectedType: "House",
    expectedStatus: "same-street-inferred",
    expectValue: true
  },
  {
    label: "land wording",
    address: "Land 40 Random Road Oakleigh VIC",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "Vacant land",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "direct vacant land",
    address: "13 Gadd Street Oakleigh VIC",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "Vacant land",
    expectedStatus: "standard",
    expectValue: true
  },
  {
    label: "commercial wording",
    address: "Commercial Shop 8 Random Road Oakleigh VIC",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "Commercial",
    expectedStatus: "standard",
    expectPending: true
  },
  {
    label: "wrong street spelling still gets suburb-level only",
    address: "7 Macintosh St Oakleigh",
    selectedType: "House",
    suburb: "Oakleigh",
    expectedType: "House",
    expectedStatus: "suburb-inferred",
    expectValue: true
  },
  {
    label: "Carnegie unit without same-suburb evidence waits for public data",
    address: "3/150 Grange Road Carnegie VIC",
    selectedType: "House",
    suburb: "Carnegie",
    expectedType: "Unit",
    expectedStatus: "current-form-priority",
    expectManualReview: true
  },
  {
    label: "Melbourne apartment with street and suburb typos waits for public data",
    address: "508/220 spencer5 street melnourne VIC",
    selectedType: "House",
    suburb: "melnourne",
    expectedType: "Apartment",
    expectedStatus: "current-form-priority",
    expectManualReview: true
  },
  {
    label: "incomplete address needs manual review",
    address: "",
    selectedType: "House",
    suburb: "",
    expectedType: "House",
    expectedStatus: "standard",
    expectManualReview: true
  }
];

for (const testCase of broadCustomerIntakeCases) {
  const valuation = context.__test.runAddressValuation(testCase.address, testCase.selectedType, "VIC", testCase.suburb);
  const builtFormVerification = context.__test.buildBuiltFormVerification(valuation);
  if (valuation.type !== testCase.expectedType) {
    throw new Error(`${testCase.label}: expected type ${testCase.expectedType}, got ${valuation.type}`);
  }
  if (builtFormVerification.status !== testCase.expectedStatus) {
    throw new Error(`${testCase.label}: expected status ${testCase.expectedStatus}, got ${builtFormVerification.status}`);
  }
  if (testCase.expectValue && (!Number.isFinite(valuation.midpointValue) || /Manual review/i.test(valuation.value))) {
    throw new Error(`${testCase.label}: expected model-calculated value, got ${valuation.value}`);
  }
  if (testCase.expectPending && valuation.value !== "Coming soon") {
    throw new Error(`${testCase.label}: expected commercial pending state, got ${valuation.value}`);
  }
  if (testCase.expectManualReview && valuation.value !== "Manual review required") {
    throw new Error(`${testCase.label}: expected manual review for incomplete address, got ${valuation.value}`);
  }
}

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
  context.__test.renderValuation(context.__test.runAddressValuation(fullAddress, testCase.type, testCase.state, testCase.suburb));

  const before = context.__test.currentValuation.midpointValue;
  if (!testCase.pending) {
    await context.__test.applyEvidenceFiles(evidenceFiles);
  }
  const after = context.__test.currentValuation.midpointValue;
  const marketCrosscheck = context.__test.buildMarketCrosscheck(context.__test.currentValuation);
  const builtFormVerification = context.__test.buildBuiltFormVerification(context.__test.currentValuation);
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
    builtFormStatus: builtFormVerification.status,
    reportHasBuiltForm: reportText.includes("Current property form check"),
    reportHidesInternalLogic: !/Layer 1|Layer 2|Layer 3|source confidence|Weighted market-source|Public market cross-check queue|realestate\.com\.au 24|Domain 22/i.test(reportText),
    pdf: header.startsWith("%PDF-1.") ? "ok" : "failed",
    reportLines: reportLines.length
  });
}

console.table(results);

const failures = results.filter((row) => {
  if (row.pdf !== "ok") return true;
  if (row.type !== "Commercial" && !row.changed) return true;
  if (row.type !== "Commercial" && row.marketSources !== 9) return true;
  if (row.type !== "Commercial" && !row.hasCorePortals) return true;
  if (["Townhouse", "Villa", "Unit", "Apartment"].includes(row.type) && row.builtFormStatus !== "current-form-priority") return true;
  if (!row.reportHasBuiltForm) return true;
  if (!row.reportHidesInternalLogic) return true;
  if (row.type === "Commercial" && row.changed !== "pending") return true;
  return false;
});

if (failures.length) {
  console.error("Regression failures:", failures);
  process.exit(1);
}

console.log("All property type regression checks passed.");
