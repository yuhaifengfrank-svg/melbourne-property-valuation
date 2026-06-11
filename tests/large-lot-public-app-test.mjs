import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CWD = process.cwd();
const JS = `${CWD}/public/app.js`;
const HTML = `${CWD}/public/index.html`;

describe("public/app.js — large-lot frontend hooks", () => {
  const js = readFileSync(JS, "utf-8");

  it("should include valuationMode in result mapping", () => {
    assert.match(js, /valuationMode:\s*result\.valuationMode\s*\|\|\s*"standard_house"/,
      "Missing valuationMode field in result block");
  });

  it("should include experimentalLabel in result mapping", () => {
    assert.match(js, /experimentalLabel:\s*result\.largeLotResult\?\.experimental\s*\|\|\s*null/,
      "Missing experimentalLabel field in result block");
  });

  it("should include valuation-mode-badge rendering (desktop)", () => {
    assert(js.includes('byId("valuation-mode-badge")'),
      "Missing desktop valuation-mode-badge byId call");
  });

  it("should include mobile valuation-mode-badge rendering", () => {
    assert(js.includes('byId("mobile-valuation-mode-badge")'),
      "Missing mobile valuation-mode-badge byId call");
  });

  it("should include experimental-badge rendering (desktop)", () => {
    assert(js.includes('byId("experimental-badge")'),
      "Missing desktop experimental-badge byId call");
  });

  it("should include mobile experimental-badge rendering", () => {
    assert(js.includes('byId("mobile-experimental-badge")'),
      "Missing mobile experimental-badge byId call");
  });

  it("should have the large-lot mode label string (CN + EN)", () => {
    assert.match(js, /大块地估值模式/, "Missing Chinese large-lot mode label");
    assert.match(js, /Large-lot mode/, "Missing English large-lot mode label");
  });

  it("should handle both display:block and display:none for badges", () => {
    assert(js.includes('style.display = "block"'), "Missing block display setter");
    assert(js.includes('style.display = "none"'), "Missing none display setter");
  });
});

describe("public/index.html — badge HTML elements", () => {
  const html = readFileSync(HTML, "utf-8");

  it("should have valuation-mode-badge element", () => {
    assert(html.includes('id="valuation-mode-badge"'),
      "Missing valuation-mode-badge in HTML");
  });

  it("should have mobile-valuation-mode-badge element", () => {
    assert(html.includes('id="mobile-valuation-mode-badge"'),
      "Missing mobile-valuation-mode-badge in HTML");
  });

  it("should have experimental-badge element", () => {
    assert(html.includes('id="experimental-badge"'),
      "Missing experimental-badge in HTML");
  });

  it("should have mobile-experimental-badge element", () => {
    assert(html.includes('id="mobile-experimental-badge"'),
      "Missing mobile-experimental-badge in HTML");
  });
});
