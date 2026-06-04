import fs from "node:fs";
import assert from "node:assert/strict";
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
  constructor(id = "", recorder = null) {
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
    this.children = [];
    this.listeners = {};
    this.recorder = recorder;
    this.classList = new MockClassList();
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === "") this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
  }

  async click() {
    this.recorder?.clicks.push(this.id || this.dataset.theme || "anonymous");
    const handlers = this.listeners.click || [];
    for (const handler of handlers) await handler({ target: this });
  }

  close() {
    this.open = false;
  }

  focus() {
    this.recorder?.focuses.push(this.id || "anonymous");
  }

  scrollIntoView() {
    this.recorder?.scrolls.push(this.id || this.selector || "anonymous");
  }

  showModal() {
    this.open = true;
    this.recorder?.modals.push(this.id || "dialog");
  }

  querySelectorAll(selector) {
    if (selector === "li") return this.children.filter((child) => child.tagName === "li");
    return [];
  }

  querySelector() {
    return new MockElement("", this.recorder);
  }
}

function makeDocument() {
  const recorder = { clicks: [], focuses: [], modals: [], scrolls: [] };
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

  ids.forEach((id) => elements.set(id, new MockElement(id, recorder)));
  elements.get("property-state").value = "VIC";
  elements.get("suburb").value = "Oakleigh";
  elements.get("address").value = "9 McIntosh Street";

  const chips = ["House", "Vacant land", "Townhouse", "Villa", "Unit", "Apartment", "Commercial"].map((type) => {
    const element = new MockElement("", recorder);
    element.dataset.type = type;
    if (type === "House") element.classList.add("active");
    return element;
  });
  const lvrs = [0.6, 0.7, 0.8].map((lvr) => {
    const element = new MockElement("", recorder);
    element.dataset.lvr = String(lvr);
    return element;
  });
  const themeCards = [
    ["privateCredit", "property-backed private credit"],
    ["developmentFinance", "development finance themes"],
    ["incomeProperty", "income property themes"]
  ].map(([theme, detail]) => {
    const element = new MockElement("", recorder);
    element.dataset.theme = theme;
    element.dataset.detail = detail;
    element.classList.add("theme-card");
    element.classList.add("detail-trigger");
    return element;
  });
  const detailPanels = [new MockElement("", recorder), new MockElement("", recorder), new MockElement("", recorder)];
  const planningLabels = [new MockElement("", recorder), new MockElement("", recorder), new MockElement("", recorder)];
  const selectorElements = {
    ".mobile-value-card": new MockElement("mobile-value-card", recorder),
    ".lead-panel": new MockElement("lead-panel", recorder),
    "#comparables": new MockElement("comparables", recorder),
    "#location": new MockElement("location", recorder),
    "#uploads": new MockElement("uploads", recorder)
  };

  const document = {
    body: new MockElement("body", recorder),
    documentElement: new MockElement("html", recorder),
    createElement: (tagName = "") => {
      const element = new MockElement("", recorder);
      element.tagName = tagName;
      return element;
    },
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, new MockElement(id, recorder));
      return elements.get(id);
    },
    querySelector: (selector) => {
      if (selector === ".chip.active") return chips.find((chip) => chip.classList.contains("active")) || chips[0];
      if (selectorElements[selector]) return selectorElements[selector];
      return new MockElement(selector, recorder);
    },
    querySelectorAll: (selector) => {
      if (selector === ".chip") return chips;
      if (selector === ".lvr") return lvrs;
      if (selector === ".theme-card") return themeCards;
      if (selector === ".detail-panel, .detail-trigger") return [...detailPanels, ...themeCards];
      if (selector === ".fundamentals-grid .detail-panel:nth-child(2) dt") return planningLabels;
      if (selector.includes("detail-panel")) return detailPanels;
      if (selector.includes("checklist")) return [];
      if (selector === "th") return [];
      if (selector === ".facts dt") return planningLabels;
      return [];
    }
  };

  return { document, elements, recorder, themeCards };
}

class MockFileReader {
  readAsText(file) {
    this.result = file.content || "";
    this.onload?.();
  }
}

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./styles.css", import.meta.url), "utf8");

assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/);
assert.ok(html.indexOf('class="mobile-value-card"') < html.indexOf('class="layout"'), "mobile summary should appear before detailed sections");
assert.doesNotMatch(html, /Free public data first|Layer 1|Layer 2|Layer 3|Market source cross-check|MVP|source confidence/i);
assert.match(css, /@media \(max-width: 680px\)/);
assert.match(css, /\.mobile-value-card[\s\S]*width: calc\(100vw - 40px\)/);
assert.match(css, /\.upload-panel[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);

const { document, elements, recorder, themeCards } = makeDocument();
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
    matchMedia: (query) => ({ matches: query.includes("max-width: 680px") })
  },
  fetch: async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      lead: {
        id: "mobile-local",
        lead_score: 90,
        priority: "Hot",
        ip_city: "Melbourne",
        ip_region: "VIC",
        ip_country: "AU"
      },
      notification: { should_send: true }
    })
  })
};

context.localStorage.getItem = (key) => context.localStorage.get(key) || null;
context.localStorage.setItem = (key, value) => context.localStorage.set(key, value);

const app = fs.readFileSync(new URL("./app.js", import.meta.url), "utf8");
vm.createContext(context);
vm.runInContext(app, context, { filename: "app.js" });

await elements.get("start-valuation").click();
assert.equal(elements.get("mobile-property-address").textContent, "9 McIntosh Street, Oakleigh VIC 3166");
assert.equal(elements.get("mobile-estimated-value").textContent, "$1.14m - $1.36m");
assert.ok(recorder.scrolls.includes("mobile-value-card"), "mobile valuation should scroll to quick result card");

await elements.get("mobile-report-cta").click();
assert.ok(recorder.scrolls.includes("lead-panel"), "locked mobile CTA should take user to registration form");
assert.ok(recorder.focuses.includes("lead-email"), "locked mobile CTA should focus email");

await elements.get("upload-evidence").click();
assert.ok(recorder.clicks.includes("evidence-files"), "upload button should trigger hidden file input");

await elements.get("enter-manual-data").click();
assert.ok(elements.get("manual-data-modal").open, "manual data button should open notes modal");
elements.get("manual-data-notes").value = "title confirms land size, renovated kitchen, quiet wide street, no visible easement";
await elements.get("manual-data-save").click();
assert.ok(!elements.get("manual-data-modal").open, "manual data save should close modal");
assert.match(elements.get("upload-message").textContent, /manual evidence|manual item|evidence/i);

await elements.get("download-pdf").click();
assert.ok(elements.get("pdf-requirements-modal").open, "PDF without phone and consent should open requirement modal");
assert.match(elements.get("lead-message").textContent, /Phone number and contact consent/);

await themeCards[0].click();
assert.ok(elements.get("unlock-modal").open, "locked investor theme should open registration modal");
elements.get("unlock-modal").close();

elements.get("lead-email").value = "mobile-regression@example.com";
elements.get("lead-name").value = "Mobile Regression";
await elements.get("unlock-report").click();
assert.ok(elements.get("report-guide-modal").open, "unlock should explain where report details are on mobile");

await themeCards[2].click();
assert.equal(elements.get("investor-theme-title").textContent, "Income property");
assert.match(elements.get("investor-theme-copy").textContent, /rent, occupancy, yield/);
assert.ok(!elements.get("investor-theme-detail").classList.contains("hidden"), "investor theme content should be visible after unlock");

elements.get("lead-phone").value = "0412345678";
elements.get("lead-consent").checked = true;
await elements.get("download-pdf").click();
assert.ok(objectUrls[0] instanceof Blob, "PDF download should create a Blob after phone and consent");
assert.equal(await objectUrls[0].text().then((text) => text.slice(0, 8)), "%PDF-1.4");

await elements.get("open-qr-modal").click();
assert.ok(elements.get("qr-modal").open, "QR code should open larger modal for mobile long-press scanning");

console.table([
  { check: "Viewport meta and mobile CSS", result: "passed" },
  { check: "Estimate moves to mobile value card", result: "passed" },
  { check: "Locked CTA routes to registration", result: "passed" },
  { check: "Upload evidence opens file picker", result: "passed" },
  { check: "PDF requires phone and consent", result: "passed" },
  { check: "Investor themes unlock content", result: "passed" },
  { check: "PDF Blob generated after details", result: "passed" },
  { check: "QR modal opens for long press", result: "passed" }
]);
console.log("Mobile regression checks passed.");
