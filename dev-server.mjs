import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { collectComparableResearch } from "./lib/comparable-research-collector.js";
import { valueProperty } from "./lib/valuation-engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.post("/api/valuation", async (req, res) => {
  try {
    const { address, suburb, state, propertyType, bedrooms, bathrooms, carSpaces, landSize } = req.body || {};
    if (!address) {
      return res.json({ ok: false, status: "missing-address", error: "Address is required", valuation: null });
    }

    console.log(`[valuation] ${address} (${propertyType || "?"})`);

    const collectorResult = await collectComparableResearch({
      address, suburb, state, propertyType,
      bedrooms: parseInt(bedrooms) || 3,
      bathrooms: parseInt(bathrooms) || 2,
      carSpaces: parseInt(carSpaces) || 2,
      landSize: parseInt(landSize) || 400
    });

    if (!collectorResult.ok || !collectorResult.comparables?.length) {
      return res.json({
        ok: true,
        status: "no-comparables",
        valuation: null,
        message: "Could not collect comparable sales data for this address.",
        sourceResults: collectorResult.sourceResults,
        subject: collectorResult.subject || {}
      });
    }

    const comps = collectorResult.comparables;
    const subject = collectorResult.subject;

    const valuation = valueProperty({
      publicData: {
        absProfile: collectorResult.absProfile || null,
        rbaRates: collectorResult.rbaRates || null,
        vicplan: collectorResult.vicplan || null
      },
      subject: {
        address: subject.address,
        propertyType: subject.propertyType || propertyType || "House",
        bedrooms: parseInt(bedrooms) || comps[0]?.bedrooms || 3,
        bathrooms: parseInt(bathrooms) || comps[0]?.bathrooms || 2,
        carSpaces: parseInt(carSpaces) || comps[0]?.carSpaces || 2,
        landSize: parseInt(landSize) || comps[0]?.landSize || 400,
        conditionScore: 3,
        microLocationScore: 3,
        streetQualityScore: (() => {
          const a = (address || '').toLowerCase();
          if (/\b(close|place|court|way|loop|circuit|parade|garden|grove|green|view|vista|ridge|crest|heights|chase|vale|meadow|park)$/.test(a)) return 5;
          if (/\b(avenue|ave|crescent|cres|drive|dr|terrace|terr|walk|lane|rise|gate|glen|dell|bend|nook|lea|field|brook|dene|side)$/.test(a)) return 4;
          if (/\b(street|st|road|way|broadway)$/.test(a)) return 3;
          if (/\b(highway|hwy|motorway|freeway|expressway|by-pass|bypass)$/.test(a)) return 2;
          return 3;
        })(),
        planningScore: 3,
        riskScore: 2
      },
      comparables: comps,
      annualMarketGrowthRate: 0.03
    });

    if (valuation.ok && valuation.estimate) {
      const acc = valuation.acceptedComparables || [];
      res.json({
        ok: true,
        status: "completed",
        subject: {
          ...(collectorResult.subject || {}),
          address: collectorResult.subject?.address || address,
          propertyType: collectorResult.subject?.propertyType || propertyType || "House",
          state: collectorResult.subject?.state || state || "VIC",
          suburb: collectorResult.subject?.suburb || suburb || ""
        },
        valuation: {
          ok: true,
          estimate: { midpoint: valuation.estimate.midpoint, low: valuation.estimate.low, high: valuation.estimate.high },
          confidence: valuation.confidence,
          statisticalIntervals: valuation.statisticalIntervals,
          acceptedComparables: acc
        },
        comparables: acc.map(c => ({
          address: c.address, salePrice: c.salePrice, adjustedPrice: c.adjustedPrice,
          qualityBand: c.qualityBand, qualityScore: c.qualityScore, bedrooms: c.bedrooms,
          bathrooms: c.bathrooms, carSpaces: c.carSpaces, landSize: c.landSize, distanceMeters: c.distanceMeters
        })),
        sourceResults: collectorResult.sourceResults
      });
    } else {
      res.json({
        ok: true, status: "valuation-failed", valuation: null,
        message: valuation.status || "Valuation engine could not produce an estimate",
        subject: collectorResult.subject || {}
      });
    }
  } catch (err) {
    console.error("[valuation] error:", err.message);
    res.json({ ok: false, status: "error", error: err.message, valuation: null });
  }
});

app.get("/api/health", (req, res) => { res.json({ ok: true, time: new Date().toISOString() }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🏠 AusHomeValue dev server running at http://127.0.0.1:${PORT}`);
});
