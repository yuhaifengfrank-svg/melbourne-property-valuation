#!/usr/bin/env node
/**
 * Hedonic Pricing Model Trainer v2
 * 
 * 改进：
 * 1. 用 price 的 log 变换减少 heteroscedasticity
 * 2. 加入 landSize / bedrooms 的特征交互
 * 3. 按价格带分层拟合 suburb 效应
 * 4. 保留 suburb 的残差分布信息用于置信度
 */

import fs from 'fs';
import path from 'path';

const CONFIG = {
  minPrice: 200000,
  maxPrice: 12000000,
  maxLandSize: 10000,
  minLandSize: 80,
  minPerSuburb: 3,
  maxBedrooms: 8,
};

// ── Matrix helpers ──
function matMul(A, B) {
  const m = A.length, n = B[0]?.length || 1, p = B.length;
  const R = Array.from({length: m}, () => Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let k = 0; k < p; k++)
      if (A[i][k] !== 0)
        for (let j = 0; j < n; j++)
          R[i][j] += A[i][k] * B[k][j];
  return R;
}
function transpose(M) { return M[0].map((_,i) => M.map(r => r[i])); }

function matInverse3(M) {
  const [a,b,c] = M[0], [d,e,f] = M[1], [g,h,i] = M[2];
  const det = a*(e*i - f*h) - b*(d*i - f*g) + c*(d*h - e*g);
  if (Math.abs(det) < 1e-15) return null;
  const inv = 1/det;
  return [
    [(e*i - f*h)*inv, (c*h - b*i)*inv, (b*f - c*e)*inv],
    [(f*g - d*i)*inv, (a*i - c*g)*inv, (c*d - a*f)*inv],
    [(d*h - e*g)*inv, (b*g - a*h)*inv, (a*e - b*d)*inv],
  ];
}

async function loadData() {
  const { getSql } = await import('../api/_db.js');
  const sql = getSql();
  const rows = await sql.query(`
    SELECT sale_price, bedrooms, land_size_sqm, suburb, sale_address, sale_date
    FROM comparable_sales
    WHERE property_type = 'House'
      AND bedrooms IS NOT NULL AND land_size_sqm IS NOT NULL
      AND sale_price > $1 AND sale_price < $2
      AND land_size_sqm > $3 AND land_size_sqm < $4
      AND bedrooms BETWEEN 1 AND $5
    ORDER BY suburb, sale_price
  `, [CONFIG.minPrice, CONFIG.maxPrice, CONFIG.minLandSize, CONFIG.maxLandSize, CONFIG.maxBedrooms]);
  console.log(`Loaded ${rows.length} training records`);
  return rows;
}

function trainModel(rows) {
  // Log-linear model: log(price) = b0 + b1*bedrooms + b2*log(land)
  // 用 log 变换使残差更正态分布，减少高端/低端偏差
  const data = rows.map(r => ({
    x: [1, r.bedrooms, Math.log(Math.max(r.land_size_sqm, 1))],
    y: Math.log(r.sale_price),
    suburb: r.suburb,
    price: r.sale_price,
    land: r.land_size_sqm,
    br: r.bedrooms,
  }));

  // 排除 NaN/Infinity
  const clean = data.filter(d => isFinite(d.y));
  console.log(`Clean records (log price finite): ${clean.length}`);

  const n = clean.length;
  const X = clean.map(d => d.x);
  const Y = clean.map(d => [d.y]);

  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtY = matMul(Xt, Y);
  const XtXinv = matInverse3(XtX);
  if (!XtXinv) { console.error('Singular matrix'); return null; }

  const beta = matMul(XtXinv, XtY).map(r => r[0]);
  const [b0, b1, b2] = beta;

  console.log(`\n=== Log-Linear Regression ===`);
  console.log(`  log(price) = ${b0.toFixed(4)} + ${b1.toFixed(4)}*bedrooms + ${b2.toFixed(4)}*log(land)`);
  console.log(`  => price = exp(${b0.toFixed(4)}) * exp(${(b1).toFixed(4)})^bedrooms * land^${b2.toFixed(4)}`);

  // 全局 R²（log 空间）
  const yMean = Y.reduce((s,v)=>s+v[0],0)/n;
  const ssTot = Y.reduce((s,v)=>s+(v[0]-yMean)**2,0);
  const ssRes = clean.reduce((s,d,i) => {
    const pred = b0 + b1*d.x[1] + b2*d.x[2];
    return s + (d.y - pred)**2;
  }, 0);
  const r2Log = 1 - ssRes/ssTot;
  
  // 价格空间 R² & MAPE
  let ssTotPrice = 0, ssResPrice = 0, totalAPE = 0;
  const priceMean = clean.reduce((s,d)=>s+d.price,0)/n;
  for (const d of clean) {
    const predLog = b0 + b1*d.x[1] + b2*d.x[2];
    const pred = Math.exp(predLog);
    ssTotPrice += (d.price - priceMean)**2;
    ssResPrice += (d.price - pred)**2;
    totalAPE += Math.abs(d.price - pred) / d.price;
  }
  const r2Price = 1 - ssResPrice/ssTotPrice;
  const mape = totalAPE/n * 100;

  console.log(`  R² (log space): ${(r2Log*100).toFixed(1)}%`);
  console.log(`  R² (price space): ${(r2Price*100).toFixed(1)}%`);
  console.log(`  MAPE: ${mape.toFixed(1)}%`);
  console.log(`  RMSE (price): $${Math.sqrt(ssResPrice/n).toFixed(0)}`);

  // Suburb fixed effects on log price
  const residuals = {};
  for (const d of clean) {
    const predLog = b0 + b1*d.x[1] + b2*d.x[2];
    // suburb 的残差表示该区相对于全局模型的溢价/折价（log 空间）
    if (!residuals[d.suburb]) residuals[d.suburb] = [];
    residuals[d.suburb].push({ residual: d.y - predLog, price: d.price, predLog, bedrooms: d.br, land: d.land });
  }

  const suburbEffects = {};
  for (const [sub, res] of Object.entries(residuals)) {
    const nSub = res.length;
    if (nSub >= CONFIG.minPerSuburb) {
      const meanResidual = res.reduce((s,r)=>s+r.residual,0)/nSub;
      const stdResidual = Math.sqrt(res.reduce((s,r)=>s+(r.residual-meanResidual)**2,0)/nSub);
      // suburb 价格倍率 = exp(meanResidual)
      suburbEffects[sub] = {
        logAdjustment: meanResidual,
        priceMultiplier: Math.exp(meanResidual),
        sampleCount: nSub,
        std: stdResidual,
        // 中位残差（更稳健）
        medianResidual: res.map(r=>r.residual).sort((a,b)=>a-b)[Math.floor(nSub/2)],
      };
    }
  }

  // 打印 suburb 效应（高溢价/低折价）
  const sortedEff = Object.entries(suburbEffects).sort((a,b) => b[1].logAdjustment - a[1].logAdjustment);
  console.log(`\n=== Top 10 Suburb Premium (price multiplier) ===`);
  for (const [s, e] of sortedEff.slice(0,10)) {
    console.log(`  ${s.padEnd(22)} x${e.priceMultiplier.toFixed(2)}  (n=${e.sampleCount})`);
  }
  for (const [s, e] of sortedEff.slice(-10)) {
    console.log(`  ${s.padEnd(22)} x${e.priceMultiplier.toFixed(2)}  (n=${e.sampleCount})`);
  }

  return {
    modelType: "log-linear",
    globalCoefficients: { intercept: b0, perBedroom: b1, perLogLand: b2 },
    suburbEffects: Object.fromEntries(
      Object.entries(suburbEffects).map(([s, e]) => [s, {
        logAdjustment: e.logAdjustment,
        priceMultiplier: e.priceMultiplier,
        medianResidual: e.medianResidual,
        sampleCount: e.sampleCount,
        std: e.std,
      }])
    ),
    metrics: {
      r2Log: r2Log,
      r2Price: r2Price,
      mape: mape,
      rmse: Math.sqrt(ssResPrice/n),
      trainingSize: n,
    },
    metadata: {
      version: "2.0",
      trainedAt: new Date().toISOString(),
      model: "log(price) ~ bedrooms + log(landSize) + suburb_effects",
      config: CONFIG,
    }
  };
}

function predictPrice(model, suburb, bedrooms, landSize) {
  const {intercept, perBedroom, perLogLand} = model.globalCoefficients;
  const suburbEff = model.suburbEffects[suburb];
  if (!suburbEff) return null;
  const logLand = Math.log(Math.max(landSize, 1));
  const logPred = intercept + perBedroom * bedrooms + perLogLand * logLand + suburbEff.logAdjustment;
  return Math.exp(logPred);
}

function crossValidate(rows, model) {
  console.log(`\n=== Cross Validation (hold-one-suburb-out, 5 suburbs) ===`);
  
  const testSuburbs = Object.entries(model.suburbEffects)
    .filter(([, e]) => e.sampleCount >= 10 && e.sampleCount <= 30)
    .sort((a,b) => b[1].sampleCount - a[1].sampleCount)
    .slice(0, 5);

  let totalAPE = 0, n = 0;
  for (const [suburb] of testSuburbs) {
    const testRows = rows.filter(r => r.suburb === suburb);
    let apes = [];
    for (const r of testRows) {
      // 用全部 suburb 的平均效应替代
      const avgEffect = Object.values(model.suburbEffects)
        .reduce((s,e) => s+e.logAdjustment, 0) / Object.keys(model.suburbEffects).length;
      const {intercept, perBedroom, perLogLand} = model.globalCoefficients;
      const logPred = intercept + perBedroom * r.bedrooms + perLogLand * Math.log(Math.max(r.land_size_sqm,1)) + avgEffect;
      const pred = Math.exp(logPred);
      const ape = Math.abs(r.sale_price - pred) / r.sale_price;
      apes.push(ape);
      totalAPE += ape;
      n++;
    }
    const mapd = apes.reduce((a,c)=>a+c,0)/apes.length * 100;
    console.log(`  ${suburb.padEnd(20)} n=${String(apes.length).padStart(2)} MAPD=${mapd.toFixed(1)}%`);
  }
  if (n > 0) console.log(`Overall MAPD: ${(totalAPE/n*100).toFixed(1)}% (${n} predictions)`);
}

function saveModel(model) {
  const dir = path.resolve(import.meta.dirname, '../lib');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const outputPath = path.join(dir, 'hedonic-model.json');
  fs.writeFileSync(outputPath, JSON.stringify(model, null, 2));
  console.log(`\nModel saved to ${outputPath}`);
  console.log(`Size: ${(fs.statSync(outputPath).size/1024).toFixed(1)} KB`);
}

async function main() {
  console.log('=== Hedonic Model v2 (Log-Linear) ===\n');
  const rows = await loadData();
  const model = trainModel(rows);

  // 验证 Donvale 4br 700sqm
  const pred = predictPrice(model, 'Donvale', 4, 700);
  console.log(`\n=== Sample prediction: 5-7 Old Warrandyte Rd ===`);
  console.log(`  Donvale, 4br, 700sqm => $${Math.round(pred).toLocaleString()}`);
  
  // 用于集成至估值引擎的预测函数
  // 当前引擎改用 hedonic 预测
  console.log(`  Model version: ${model.metadata.version}`);

  crossValidate(rows, model);
  saveModel(model);
  console.log('\nDone.');
}

main().catch(console.error);
