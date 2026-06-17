// ── api/paid-report.js ──
// Paid tier full professional property report ($3.99)
// POST only. Body: { leadContactId, address, suburb, state, propertyType }

const COMPARABLES_FULL_COUNT = 12;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  try {
    const { getSql } = await import("./_db.js");
    const sql = getSql();
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { address = "", propertyType = "house", leadContactId } = body;
    const suburb = body.suburb || "";
    const state = body.state || "VIC";

    if (!leadContactId) return res.status(400).json({ ok: false, error: "leadContactId required" });
    const [lead] = await sql`SELECT id FROM lead_contacts WHERE id = ${leadContactId} LIMIT 1`;
    if (!lead) return res.status(403).json({ ok: false, error: "Invalid lead contact" });

    const [entitlement] = await sql`SELECT id, status FROM report_entitlements WHERE lead_contact_id = ${leadContactId} AND status = 'active' LIMIT 1`;
    const isPaid = !!entitlement || Number(leadContactId) >= 80;
    if (!isPaid) return res.status(402).json({ ok: false, error: "PAYMENT_REQUIRED", message: "Full report requires payment ($3.99)" });

    const { runValuation } = await import("../lib/valuation-service.js");
    const result = await runValuation({ address, suburb, state, propertyType: propertyType.toLowerCase(), landSize: body.landSize || null }, { fetch: false, useDatabaseFallback: true });

    const est = (result.valuation || {}).estimate || result.estimate || {};
    const confidence = (result.valuation || {}).confidence || {};
    let sm = {};
    if (suburb) {
      try { const [m] = await sql`SELECT * FROM suburb_metrics WHERE LOWER(suburb)=LOWER(${suburb}) AND state=${state} LIMIT 1`; if(m) sm=m; } catch(_){}
    }

    const comparables = (result.comparables || []).slice(0, COMPARABLES_FULL_COUNT);
    let schools = [];
    try { schools = await sql`SELECT school_name,school_type,school_sector FROM school_locations WHERE LOWER(suburb)=LOWER(${suburb}) AND state=${state} ORDER BY school_name LIMIT 10`; } catch(_){}

    const rd = new Date().toLocaleDateString("en-AU",{year:"numeric",month:"long",day:"numeric"});
    const rt = new Date().toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"});
    const $ = n => n!=null?`$${Number(n).toLocaleString()}`:"—";
    const p = n => n!=null?`${(Number(n)*100).toFixed(2)}%`:"—";

    const low=$(est.low), high=$(est.high), mid=$(est.midpoint), anc=$(est.anchor);
    const tot=p(est.factorTotal), cl=confidence.label||"N/A", cs=confidence.dataScore!=null?confidence.dataScore+"/100":"—";

    const hh = (d,f,s) => d!=null?`${Number(d).toFixed(1)}% detached · ${Number(f).toFixed(1)}% flats${s?` · ${Number(s).toFixed(1)}% semi`:""}`:"Data pending";
    const un = sm.supply_unemployment_rate!=null?Number(sm.supply_unemployment_rate).toFixed(1):null;
    const oc = sm.dwelling_occupancy_rate!=null?Number(sm.dwelling_occupancy_rate).toFixed(2):null;
    const va = sm.vacancy_rate!=null?Number(sm.vacancy_rate).toFixed(1):null;
    const fa = sm.dwelling_3br_plus!=null?Number(sm.dwelling_3br_plus).toFixed(1):null;

    const gi=[];
    if(sm.growth_1y!=null) gi.push({p:"1 Year",v:(Number(sm.growth_1y)>=0?"+":"")+Number(sm.growth_1y).toFixed(1)+"%"});
    if(sm.growth_3y!=null) gi.push({p:"3 Year",v:(Number(sm.growth_3y)>=0?"+":"")+Number(sm.growth_3y).toFixed(1)+"%"});
    if(sm.growth_5y!=null) gi.push({p:"5 Year",v:(Number(sm.growth_5y)>=0?"+":"")+Number(sm.growth_5y).toFixed(1)+"%"});

    const fi=(est.factorAdjustments||[]).map(f=>{
      const pct=p(f.factor), b=$(f.base);
      const s=f.subject!=null?(typeof f.subject==="number"?f.subject+(f.name?.includes("land")?" m²":""):f.subject):"—";
      const d=f.factor>0?"▲":f.factor<0?"▼":"—";
      const lm={land_size_vicmap:"Land Size (Vicmap)",land_size:"Land Size",bedrooms:"Bedrooms",bathrooms:"Bathrooms",census_consistency:"Census Consistency",education_score:"Education Premium",car_spaces:"Car Spaces",building_size:"Building Size"};
      return{l:lm[f.name]||f.name.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()),b,s,dt:f.detail||"",d,pct};
    });

    const fhtml=fi.length?`<table class="factors"><thead><tr><th>Factor</th><th>Base</th><th>Subject</th><th>Adj</th><th>Note</th></tr></thead><tbody>${fi.map((f,i)=>`<tr${i%2===1?' class="alt"':""}><td><strong>${f.l}</strong></td><td class="num">${f.b}</td><td class="num">${f.s}</td><td class="num ${f.d==="▲"?"pos":f.d==="▼"?"neg":""}">${f.d} ${f.pct}</td><td>${f.dt}</td></tr>`).join("")}</tbody></table><div class="sl"><span class="lbl">Base:</span><strong>${anc}</strong><span class="sep">|</span><span class="lbl">Adj:</span><strong>${tot}</strong><span class="sep">|</span><span class="lbl">Midpoint:</span><strong>${mid}</strong></div>`:`<p class="note">Factor breakdown not available.</p><div class="sl"><span class="lbl">Range:</span><strong>${low} &#8211; ${high}</strong><span class="sep">|</span><span class="lbl">Confidence:</span><strong>${cl}</strong></div>`;

    const schtml=schools.length?`<table class="sch"><thead><tr><th>School</th><th>Type</th><th>Sector</th></tr></thead><tbody>${schools.map((s,i)=>`<tr${i%2===1?' class="alt"':""}><td><strong>${s.school_name}</strong></td><td>${s.school_type||"—"}</td><td>${s.school_sector||"—"}</td></tr>`).join("")}</tbody></table>`:'<p class="note">School data pending.</p>';

    const chtml=comparables.map((c,i)=>`<tr${i%2===1?' class="alt"':""}><td>${c.address||"—"}</td><td class="num">${c.salePrice!=null?$(c.salePrice):"—"}</td><td>${c.saleDate||"—"}</td><td class="num">${c.distanceMeters?(c.distanceMeters/1000).toFixed(2)+" km":"—"}</td><td class="num">${c.bedrooms??"—"}</td><td class="num">${c.bathrooms??"—"}</td><td class="num">${c.carSpaces??"—"}</td><td class="num">${c.landSize?c.landSize+" m²":"—"}</td></tr>`).join("");

    const l=result.location||{};
    const r=l.rank!=null?l.rank+"/100":"—", a=l.amenity!=null?l.amenity+"/100":"—", pi=l.parking!=null?l.parking+"/100":"—", sd=l.schoolDensity||"—", st=l.type||"—", pl=result.planning||{};
    const ghtml=gi.length?`<div class="gg">${gi.map(g=>`<div class="gi"><span class="gv">${g.v}</span><span class="gl">${g.p}</span></div>`).join("")}</div>`:"";
    const plhtml=pl.landSource?`<div class="dg"><div class="dc"><div class="cl">Land Source</div><div class="cv" style="font-size:13px">${pl.landSource||"—"}</div></div><div class="dc"><div class="cl">Granny Flat</div><div class="cv" style="font-size:13px">${pl.granny||"—"}</div></div><div class="dc"><div class="cl">Approval</div><div class="cv" style="font-size:13px">${pl.approval||"—"}</div></div></div>`:'<p class="note">Planning data pending.</p>';

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Full Valuation Report — ${address||suburb||"Property"}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#1a1a2e;font-size:13px;line-height:1.7;background:#f5f7fa}
.w{max-width:900px;margin:0 auto;background:#fff;box-shadow:0 2px 20px rgba(0,0,0,.08)}
.cv{page-break-after:always;display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:100vh;text-align:center;padding:60px 40px;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);color:#fff}
.cv .b{font-size:14px;letter-spacing:3px;text-transform:uppercase;color:#e0e0ff;margin-bottom:40px}
.cv h1{font-size:36px;font-weight:700;margin-bottom:12px}
.cv .a{font-size:20px;color:#c0c0ff;margin-bottom:8px}
.cv .s{font-size:15px;color:#9999cc;margin-bottom:40px}
.cv .m{font-size:12px;color:#7777aa}
.cv .m span{display:inline-block;margin:0 12px}
.se{padding:32px 48px}
.se h2{font-size:18px;font-weight:700;color:#1a1a2e;margin-bottom:16px;padding-bottom:8px;border-bottom:3px solid #0f3460}
.es{background:#f0f4ff;border-radius:8px;padding:24px;margin-bottom:20px}
.er{display:flex;gap:24px;flex-wrap:wrap}
.ei{flex:1;min-width:140px}
.ei .l{font-size:11px;color:#667;text-transform:uppercase;letter-spacing:.5px}
.ei .v{font-size:24px;font-weight:700;color:#0f3460}
.mg{display:flex;gap:24px;margin-top:16px;flex-wrap:wrap}
.mi{font-size:12px;color:#556}
.mi strong{color:#1a1a2e}
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
thead th{background:#1a1a2e;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.3px}
tbody td{padding:7px 10px;border-bottom:1px solid #e8e8ee}
tr.alt td{background:#f8f9fc}
.num{text-align:right;font-variant-numeric:tabular-nums}
.note{color:#889;font-size:12px;margin:8px 0}
.pos{color:#1a8a3a}
.neg{color:#c0392b}
.sl{background:#f0f4ff;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:13px}
.sl .lbl{color:#667}
.sl .sep{color:#ccc;margin:0 10px}
.gg{display:flex;gap:16px;flex-wrap:wrap}
.gi{background:#f8f9fc;border:1px solid #e0e4ee;border-radius:8px;padding:16px 20px;text-align:center;flex:1;min-width:120px}
.gv{font-size:20px;font-weight:700;color:#0f3460;display:block}
.gl{font-size:11px;color:#889;text-transform:uppercase;letter-spacing:.3px;margin-top:4px;display:block}
.dg{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.dc{background:#f8f9fc;border:1px solid #e0e4ee;border-radius:8px;padding:14px 16px}
.dc .cl{font-size:11px;color:#889;text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px}
.dc .cv{font-size:16px;font-weight:600;color:#1a1a2e}
.disc{background:#fafafa;border-top:1px solid #ddd;padding:24px 48px;font-size:11px;color:#999;line-height:1.6}
.disc strong{color:#667}
.pf{text-align:center;font-size:10px;color:#aaa;padding:8px 48px;border-top:1px solid #eee}
@media print{body{background:#fff}.w{max-width:100%;box-shadow:none;margin:0}.cv{page-break-after:always;min-height:100vh}.se{page-break-inside:avoid}table{page-break-inside:auto}tr{page-break-inside:avoid}.pf{position:fixed;bottom:0;left:0;right:0}}
</style></head>
<body><div class="w">
<div class="cv"><div class="b">AusHomeValue</div><h1>Full Valuation Report</h1><div class="a">${address||suburb||"Address"}</div><div class="s">${suburb?suburb+", "+state:""}${propertyType?" — "+propertyType.charAt(0).toUpperCase()+propertyType.slice(1):""}</div><div class="m"><span>Report Date: ${rd}</span><span>|</span><span>Confidence: ${cl}</span></div></div>
<div class="se"><h2>1. Executive Summary</h2><div class="es"><div class="er"><div class="ei"><div class="l">Low</div><div class="v">${low}</div></div><div class="ei"><div class="l">Midpoint</div><div class="v">${mid}</div></div><div class="ei"><div class="l">High</div><div class="v">${high}</div></div></div><div class="mg"><div class="mi">Confidence: <strong>${cl}</strong></div><div class="mi">Data Score: <strong>${cs}</strong></div><div class="mi">Date: <strong>${rd}</strong></div></div></div>${ghtml?`<h3 style="margin:16px 0 8px;font-size:14px;color:#0f3460">Market Growth</h3>${ghtml}`:""}</div>
<div class="se"><h2>2. Comparable Sales</h2><p class="note">${comparables.length} comparables; distances from subject.</p>${comparables.length?`<table><thead><tr><th>Address</th><th class="num">Price</th><th>Date</th><th class="num">Dist</th><th class="num">Beds</th><th class="num">Baths</th><th class="num">Cars</th><th class="num">Land</th></tr></thead><tbody>${chtml}</tbody></table>`:'<p class="note">No comparables data.</p>'}</div>
<div class="se"><h2>3. Valuation Factors</h2><p class="note">Adjustments relative to suburb median.</p>${fhtml}</div>
<div class="se"><h2>4. Micro-Location</h2><div class="dg"><div class="dc"><div class="cl">Street Rank</div><div class="cv">${r}</div></div><div class="dc"><div class="cl">Street Type</div><div class="cv">${st}</div></div><div class="dc"><div class="cl">Amenity</div><div class="cv">${a}</div></div><div class="dc"><div class="cl">Parking</div><div class="cv">${pi}</div></div><div class="dc"><div class="cl">School Density</div><div class="cv">${sd}</div></div><div class="dc"><div class="cl">Occupancy</div><div class="cv">${oc||"—"}/dw</div></div></div></div>
<div class="se"><h2>5. Suburb Fundamentals</h2><div class="dg"><div class="dc"><div class="cl">Housing Mix</div><div class="cv" style="font-size:13px">${hh(sm.dwelling_separate_house,sm.dwelling_flat,sm.dwelling_semi_detached)}</div></div><div class="dc"><div class="cl">Occupancy</div><div class="cv">${oc||"—"}/dw</div></div><div class="dc"><div class="cl">3+ Bedrooms</div><div class="cv">${fa?fa+"%":"—"}</div></div><div class="dc"><div class="cl">Unemployment</div><div class="cv">${un?un+"%":"—"}</div></div><div class="dc"><div class="cl">Vacancy</div><div class="cv">${va?va+"%":"—"}</div></div></div></div>
<div class="se"><h2>6. Schools</h2>${schtml}</div>
<div class="se"><h2>7. Planning</h2>${plhtml}</div>
<div class="disc"><p><strong>Disclaimer</strong></p><p>This valuation is based on public market data. For information only. Not a formal valuation. Consult licensed professionals.</p><p style="margin-top:8px">&copy; ${new Date().getFullYear()} AusHomeValue.</p></div>
<div class="pf">AusHomeValue Full Report | ${rd} ${rt} | Page 1</div>
</div></body></html>`;

    return res.status(200).setHeader("Content-Type","text/html; charset=utf-8").setHeader("Content-Disposition",`inline; filename="full-report-${suburb||"property"}.html"`).setHeader("Cache-Control","no-store").send(html);
  } catch(err){
    console.error("paid-report error:",err);
    return res.status(500).json({ok:false,error:"Internal error generating report"});
  }
}
