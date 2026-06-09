let mapInstance = null;

const valuations = [
  // Codex: all static valuations removed — API-only
];

const emptyValuation = {
  aliases: [],
  address: "Enter an address to start",
  addressZh: "请输入地址开始",
  type: "House",
  value: "Pending",
  valueZh: "待输入",
  midpoint: "Pending",
  midpointZh: "待输入",
  midpointValue: NaN,
  confidence: "Pending",
  confidenceZh: "待输入",
  status: "Pending",
  statusZh: "待输入",
  reasons: [
    "Enter a Melbourne property address to generate a first-layer estimate.",
    "Register after the estimate to unlock comparable sales, micro-location and planning checks."
  ],
  reasonsZh: [
    "请输入墨尔本房产地址，生成第一层估值。",
    "估值后注册，即可解锁可比成交、微位置和规划检查。"
  ],
  comparables: [],
  location: {
    rank: "Pending",
    type: "Pending",
    amenity: "Pending",
    parking: "Pending",
    rankZh: "待输入",
    typeZh: "待输入",
    amenityZh: "待输入",
    parkingZh: "待输入"
  },
  suburb: ["Suburb fundamentals will appear after an address is entered."],
  suburbZh: ["输入地址后会显示区域基本面。"],
  planning: {
    landSource: "Pending",
    granny: "Pending",
    approval: "Pending",
    landSourceZh: "待输入",
    grannyZh: "待输入",
    approvalZh: "待输入"
  },
  map: {}
};

const commercialPendingValuation = {
  aliases: [],
  address: "Commercial valuation module coming soon",
  addressZh: "商业地产估值模块后续开放",
  type: "Commercial",
  value: "Coming soon",
  valueZh: "后续开放",
  midpoint: "Pending",
  midpointZh: "待开放",
  midpointValue: NaN,
  confidence: "Pending",
  confidenceZh: "待开放",
  status: "Pending",
  statusZh: "待开放",
  reasons: [
    "Commercial property needs a separate valuation model and is not priced with the residential framework.",
    "Future checks will include rental income, lease term, tenant covenant, outgoings, cap rate and vacancy risk.",
    "For early commercial enquiries, leave contact details and send lease documents or income information for manual review."
  ],
  reasonsZh: [
    "商业地产需要独立估值模型，不能用住宅模型直接估。",
    "后续检查会包括租金收入、租约期限、租客质量、outgoings、cap rate 和空置风险。",
    "如果现在有商业地产咨询，可以留下联系方式，并补充租约或收益资料做人工复核。"
  ],
  comparables: [],
  location: {
    rank: "Trade area to be assessed",
    type: "Commercial catchment",
    amenity: "Tenant and customer access pending",
    parking: "Loading / customer parking pending",
    rankZh: "商圈等级待评估",
    typeZh: "商业覆盖区域",
    amenityZh: "租客和客流便利性待评估",
    parkingZh: "装卸 / 客户停车待评估"
  },
  suburb: [
    "Commercial analysis will review trade area, foot traffic, tenant mix, vacancy, competing supply and business exposure.",
    "Income evidence and lease documents are more important than residential-style bedroom/land comparisons.",
    "A commercial module will be built separately after the residential workflow is stable."
  ],
  suburbZh: [
    "商业地产分析会评估商圈、客流、租户组合、空置率、竞争供应和经营风险。",
    "收益证据和租约文件比住宅的房间数/土地比较更重要。",
    "商业地产模块会在住宅估值流程稳定后单独开发。"
  ],
  planning: {
    landSource: "Lease and income schedule required",
    granny: "Cap rate / yield model pending",
    approval: "Zoning, use and tenancy risk pending",
    landSourceZh: "需要租约和收益表",
    grannyZh: "Cap rate / yield 模型待开发",
    approvalZh: "Zoning、用途和租约风险待评估"
  },
  planningLabels: {
    en: ["Income evidence", "Yield / cap rate", "Use / tenancy risk"],
    zh: ["收益证据", "收益率 / cap rate", "用途 / 租约风险"]
  },
  modelNotes: [
    "Commercial model will be separate from residential: income, lease quality and market yield will be the primary valuation anchors.",
    "Future core fields: net income, lease expiry, options, WALE, tenant covenant, outgoings, incentives, vacancy, zoning/use and comparable yields."
  ],
  modelNotesZh: [
    "Commercial 模型会独立于住宅模型：收益、租约质量和市场 yield 会是主要估值锚点。",
    "后续核心字段：净收益、租约到期、续租权、WALE、租户质量、outgoings、incentives、空置率、zoning/use 和可比 yield。"
  ],
  map: {
    target: "C",
    station: "Trade area",
    shops: "Tenant mix",
    stationZh: "商圈",
    shopsZh: "租户组合"
  }
};

let unlocked = false;
let currentValuation = emptyValuation;
let selectedLvr = 0.6;
let language = "en";
let activeInvestorTheme = null;
let uploadedEvidenceSummary = [];
const sentLeadNotificationKeys = new Set();

const marketSourceGroups = [
  {
    key: "googleMaps",
    name: "Google Maps",
    weight: 0,
    role: "Address existence, location and built-form map check",
    roleZh: "地址存在性、位置和建筑形态地图核验",
    url: ({ formattedAddress }) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formattedAddress)}`
  },
  {
    key: "realestate",
    name: "realestate.com.au",
    weight: 24,
    role: "Core sold/listing portal",
    roleZh: "核心成交 / 挂牌门户",
    url: ({ suburb, state, type }) => `https://www.realestate.com.au/sold/in-${encodeURIComponent(`${suburb} ${state}`)}/list-1?source=refinement&propertyTypes=${encodeURIComponent(type || "house")}`
  },
  {
    key: "domain",
    name: "Domain",
    weight: 22,
    role: "Core sold/listing portal",
    roleZh: "核心成交 / 挂牌门户",
    url: ({ suburb, state }) => `https://www.domain.com.au/sold-listings/${encodeURIComponent(`${suburb} ${state}`)}/`
  },
  {
    key: "agentResults",
    name: "Agent sold / auction results",
    weight: 14,
    role: "Local agency result confirmation",
    roleZh: "本地中介成交 / 拍卖结果确认",
    url: ({ address, suburb, state }) => `https://www.google.com/search?q=${encodeURIComponent(`${address} ${suburb} ${state} sold auction result agent`)}`
  },
  {
    key: "propertyComAu",
    name: "property.com.au",
    weight: 12,
    role: "Property profile and sold history",
    roleZh: "物业档案和成交历史",
    url: ({ address, suburb, state }) => `https://www.property.com.au/search?query=${encodeURIComponent(`${address} ${suburb} ${state}`)}`
  },
  {
    key: "avmProfile",
    name: "PropertyValue / OnTheHouse profile",
    weight: 8,
    role: "AVM/profile cross-check",
    roleZh: "AVM / 物业档案交叉比对",
    url: ({ address, suburb, state }) => `https://www.google.com/search?q=${encodeURIComponent(`${address} ${suburb} ${state} PropertyValue OnTheHouse`)}`,
  },
  {
    key: "viewHomely",
    name: "View / Homely portal evidence",
    weight: 6,
    role: "Secondary portal signal",
    roleZh: "第二层门户信号",
    url: ({ address, suburb, state }) => `https://www.google.com/search?q=${encodeURIComponent(`${address} ${suburb} ${state} View Homely sold`)}`,
  },
  {
    key: "rentalEvidence",
    name: "Rental portal evidence",
    weight: 6,
    role: "Rent and yield context",
    roleZh: "租金和收益率背景",
    url: ({ suburb, state, type }) => `https://www.realestate.com.au/rent/in-${encodeURIComponent(`${suburb} ${state}`)}/list-1?source=refinement&propertyTypes=${encodeURIComponent(type || "house")}`
  },
  {
    key: "localMarketReport",
    name: "Local market / suburb report",
    weight: 8,
    role: "Suburb trend context",
    roleZh: "区域走势背景",
    url: ({ suburb, state }) => `https://www.google.com/search?q=${encodeURIComponent(`${suburb} ${state} suburb property market report sold prices`)}`
  }
];

const byId = (id) => document.getElementById(id);

function getSelectedState() {
  return byId("property-state")?.value || "VIC";
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeSuburbName(value) {
  const compact = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (/^oakl[a-z]*south$/.test(compact) || compact === "oakleysouth") return "Oakleigh South";
  if (/^oakl[a-z]*$/.test(compact) || compact === "oakley") return "Oakleigh";
  if (compact === "melnourne" || compact === "melbourn" || compact === "melbourne") return "Melbourne";
  return toTitleCase(
    String(value || "")
      .toLowerCase()
      .replace(/\boakley\b|\boaklrigh\b/g, "oakleigh")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function getEnteredSuburb() {
  return normalizeSuburbName(byId("suburb")?.value.trim() || "");
}

function explicitStateFromAddress(address) {
  return String(address || "").match(/\b(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\b/i)?.[1]?.toUpperCase() || "";
}

function buildEnteredAddress() {
  const streetAddress = byId("address").value.trim();
  const enteredSuburb = getEnteredSuburb();
  const inlineSuburb = suburbFromAddress(streetAddress);
  const addressState = explicitStateFromAddress(streetAddress);
  const state = addressState || getSelectedState();

  // 确定有效 suburb：下拉框显式输入的优先，其次地址中内嵌的 suburb
  // 注意：suburbFromAddress 对 "12 Joelson Av"（无 suburb）可能误将街道名当作 suburb
  // 所以取 enteredSuburb 优先；若用户没填下拉框才尝试从地址解析
  let effectiveSuburb = "";
  if (enteredSuburb) {
    effectiveSuburb = enteredSuburb;
  } else if (inlineSuburb && !looksLikeStreetOnly(inlineSuburb)) {
    effectiveSuburb = inlineSuburb;
  }

  // 构建 canonical address
  const parts = [streetAddress];
  // 如果 effectiveSuburb 已经包含在 streetAddress 中（case-insensitive），不追加
  // 检查：streetAddress 是否以 suburb 结尾，或者包含 ", suburb" 或 " suburb,"
  const suburbInAddress = effectiveSuburb &&
    (streetAddress.toLowerCase().includes(", " + effectiveSuburb.toLowerCase()) ||
     streetAddress.toLowerCase().includes(" " + effectiveSuburb.toLowerCase() + ",") ||
     streetAddress.toLowerCase().endsWith(" " + effectiveSuburb.toLowerCase()));
  if (effectiveSuburb && !suburbInAddress) {
    parts.push(effectiveSuburb);
  }
  if (!addressState && state) parts.push(state);
  return {
    canonicalAddress: parts.filter(Boolean).join(", "),
    effectiveSuburb: effectiveSuburb
  };
}

function looksLikeStreetOnly(text) {
  const streetSuffixes = /\b(street|avenue|road|grove|drive|court|crescent|parade|place|lane|pde|rd|st|dr|crt|hwy|tce|wy|bvd|cl|ct|gdn|grn|gr|pkwy|pl|pt|sq|trc|close|circuit|gate|way|rise|view|vale|ridge)\b$/i;
  if (/^\d+$/.test(text.trim())) return true;
  if (streetSuffixes.test(text.trim())) return true;
  return false;
}

function suburbFromAddress(address) {
  const cleaned = String(address || "").replace(/\bVIC\b|\bNSW\b|\bQLD\b|\bWA\b|\bSA\b|\bTAS\b|\bACT\b|\bNT\b|\b\d{4}\b/gi, "");
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    if (looksLikeStreetOnly(lastPart)) return "";
    return toTitleCase(lastPart);
  }
  const normalized = normalizeAddress(cleaned);
  const inlineSuburbMatch = normalized.match(
    /^(?:unit\s+\d+\s+)?(?:\d+\s*\/\s*)?\d+\s+.+?\s+(?:street|avenue|road|grove|drive|court|crescent|parade|place|lane|pde|rd|st|dr|crt|hwy|tce|wy|bvd|cl|ct|gdn|grn|gr|pkwy|pl|pt|sq|trc)\s+(.+)$/i
  );
  if (inlineSuburbMatch?.[1]) {
    const extracted = inlineSuburbMatch[1].trim();
    if (looksLikeStreetOnly(extracted)) return "";
    return toTitleCase(extracted);
  }
  // 当地址中没有逗号分隔时，不宜猜测 suburb（13 Joelson Av 无 suburb 时总是返回街道片段）
  // 只靠逗号分隔的最后部分来判断
  return "";
}
function stateFromAddress(address) {
  return explicitStateFromAddress(address) || getSelectedState();
}

function isAttachedOrStrataType(type) {
  return /townhouse|villa|unit|apartment/i.test(String(type || ""));
}

function hasUnitAddressPattern(address) {
  return /\bunit\b|\bapt\b|\bapartment\b|^\s*\d+\s*\/|,\s*\d+\s*\//i.test(String(address || ""));
}

function buildBuiltFormVerification(data = currentValuation) {
  if (data.builtFormVerification) return data.builtFormVerification;
  const currentForm = data.type || "Property";
  if (!isAttachedOrStrataType(currentForm) && !hasUnitAddressPattern(data.address)) {
    return {
      status: "standard",
      summary: "No current built-form conflict is indicated for this address.",
      summaryZh: "该地址未显示当前建筑形态冲突。",
      currentForm,
      currentFormZh: currentForm,
      legacyRisk: "No legacy single-dwelling conflict is flagged.",
      legacyRiskZh: "未标记旧独立屋记录冲突。",
      action: "Use the selected property type and recent same-type evidence.",
      actionZh: "按所选物业类型和近期同类型证据处理。"
    };
  }
  return {
    status: "current-form-priority",
    summary: `This property is being assessed as ${currentForm}. Older single-dwelling records should not be used as the valuation anchor.`,
    summaryZh: `该物业按 ${currentForm} 处理。旧的单一独立屋记录不应作为估值锚点。`,
    currentForm,
    currentFormZh: currentForm,
    legacyRisk: "Some public profiles may lag behind subdivision, redevelopment or new townhouse/unit completion.",
    legacyRiskZh: "部分公开物业档案可能滞后于 subdivision、重建或新建 townhouse/unit 完工状态。",
    action: "Prioritise current photos, title/plan of subdivision, owners corporation information and same-type comparable sales.",
    actionZh: "优先使用当前照片、产权/subdivision plan、业主委员会资料和同类型可比成交。"
  };
}

function normalizePropertyTypeForPortal(type) {
  const normalized = String(type || "house").toLowerCase();
  if (normalized.includes("apartment") || normalized.includes("unit")) return "unit-apartment";
  if (normalized.includes("townhouse")) return "townhouse";
  if (normalized.includes("villa")) return "villa";
  if (normalized.includes("land")) return "land";
  return "house";
}

function formatAddressForMap(address, suburb, state) {
  const signature = getAddressSignature(address);
  const street = signature.streetNumber && signature.streetName
    ? `${signature.streetNumber} ${toTitleCase(signature.streetName)}`
    : String(address || "").trim();
  return [street, normalizeSuburbName(suburb), state].filter(Boolean).join(", ");
}

function buildMarketCrosscheck(data = currentValuation) {
  const suburb = data.propertySuburb || suburbFromAddress(data.address) || getEnteredSuburb() || "Australia";
  const state = data.propertyState || stateFromAddress(data.address) || getSelectedState();
  const type = normalizePropertyTypeForPortal(data.type);
  const comparableCount = Array.isArray(data.comparables) ? data.comparables.length : 0;
  const pending = data.type === "Commercial" || data.confidence === "Pending";
  const formattedAddress = formatAddressForMap(data.address, suburb, state);
  const context = { address: data.address, formattedAddress, suburb, state, type };

  const sources = marketSourceGroups.map((source, index) => {
    const coreSource = index < 4;
    const status = pending
      ? "pending"
      : comparableCount >= 3 && coreSource
        ? "ready-to-verify"
        : "search-generated";
    const statusZh = pending
      ? "待开放"
      : comparableCount >= 3 && coreSource
        ? "可核对"
        : "已生成搜索";
    return {
      ...source,
      status,
      statusZh,
      url: source.url(context)
    };
  });

  const readyWeight = sources.reduce((sum, source) => {
    if (source.status === "ready-to-verify") return sum + source.weight;
    return sum;
  }, 0);
  const independentCount = sources.filter((source) => source.status !== "pending").length;
  const score = pending ? null : Math.min(100, readyWeight);
  const band = pending
    ? "Pending"
    : independentCount < 3
      ? "Low"
      : score >= 75
        ? "High"
        : score >= 60
          ? "Medium-High"
          : score >= 45
            ? "Medium"
            : "Low";
  const bandZh = {
    Pending: "待开放",
    Low: "低",
    Medium: "中",
    "Medium-High": "中高",
    High: "高"
  }[band] || band;

  return {
    score,
    band,
    bandZh,
    independentCount,
    sources,
    summary: pending
      ? "Commercial cross-check is a later module because income, lease and yield evidence need a separate model."
      : `Generated ${sources.length} public market checks for ${suburb} ${state}. Core portal evidence is weighted before lower-weight secondary sources.`,
    summaryZh: pending
      ? "商业地产 cross-check 会作为后续独立模块，因为收益、租约和 yield 需要单独模型。"
      : `已为 ${suburb} ${state} 生成 ${sources.length} 个公开市场来源检查。核心门户证据权重高于第二层来源。`
  };
}

function renderMarketCrosscheck(data = currentValuation) {
  const crosscheck = buildMarketCrosscheck(data);
  currentValuation.marketCrosscheck = crosscheck;
  const title = byId("market-crosscheck-title");
  const summary = byId("market-crosscheck-summary");
  const score = byId("market-crosscheck-score");
  const note = byId("market-crosscheck-note");
  const grid = byId("market-source-grid");
  if (!title || !summary || !score || !note || !grid) return;

  title.textContent = language === "zh" ? "市场来源交叉比对" : "Market source cross-check";
  summary.textContent = language === "zh" ? crosscheck.summaryZh : crosscheck.summary;
  score.textContent =
    crosscheck.score === null
      ? localizeValue(crosscheck.band)
      : `${crosscheck.score}/100 · ${localizeValue(crosscheck.band)}`;
  note.textContent = language === "zh"
    ? "公开门户数据属于第二层证据，需要和产权、council、政府规划资料交叉比对，不能直接当成权威来源。"
    : "Public portal data is secondary evidence and must be cross-checked against title, council and government records where available.";

  grid.innerHTML = "";
  crosscheck.sources.forEach((source) => {
    const card = document.createElement("article");
    card.className = "market-source-card";

    const name = document.createElement("strong");
    name.textContent = source.name;
    card.appendChild(name);

    const meta = document.createElement("span");
    meta.textContent = `${language === "zh" ? "权重" : "Weight"} ${source.weight} · ${language === "zh" ? source.roleZh : source.role}`;
    card.appendChild(meta);

    const status = document.createElement("span");
    status.textContent = `${language === "zh" ? "状态" : "Status"}: ${language === "zh" ? source.statusZh : source.status}`;
    card.appendChild(status);

    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = language === "zh" ? "打开公开检查链接" : "Open public check";
    card.appendChild(link);

    grid.appendChild(card);
  });
}

const uiText = {
  en: {
    toggle: "简体中文",
    selectors: {
      ".topbar .eyebrow": "Currently expanding across Melbourne and Victoria",
      ".topbar h1": "AusHomeValue",
      'nav a[href="#valuation"]': "Valuation",
      'nav a[href="#about"]': "About Us",
      'nav a[href="#contact"]': "Contact",
      'nav a[href="#opportunities"]': "Top Opportunities",
      'nav a[href="#research"]': "Research",
      'nav a[href="#home"]': "Home",

      ".search-copy .eyebrow": "Property Opportunity Intelligence",
      ".search-copy h2": "Estimate, evidence and insight — all in one place.",
      ".hero-note": "This estimate is based on publicly available market information, property characteristics and statistical analysis. For general information and research purposes only. Not a formal valuation, credit decision, legal, taxation or financial advice.",
      '[data-i18n="hero-banner"]': "Currently expanding across Melbourne and Victoria",
      '[data-i18n="hero-eyebrow"]': "Property Opportunity Intelligence",
      '[data-i18n="hero-heading"]': "Know what a property is worth — and why it matters.",
      '[data-i18n="hero-estimate-eyebrow"]': "Free first-layer estimate",
      '[data-i18n="hero-sub"]': "Free estimates backed by comparable sales, school data and census insights across Melbourne and Victoria.",
      '[data-i18n="stat-sales"]': "comparable sales",
      '[data-i18n="stat-schools"]': "schools mapped",
      '[data-i18n="stat-suburbs"]': "suburbs covered",
      '[data-i18n="footer-brand"]': "AusHomeValue – Property Opportunity Intelligence.",
      '[data-i18n="footer-disclaimer-en"]': "This website provides general property information and research for educational purposes. Not financial advice, not a credit assessment, not a formal valuation. Always consult licensed professionals for legal, tax and lending decisions.",
      '[data-i18n="footer-disclaimer-zh"]': "本网站提供一般房产信息和研究，仅供教育参考。不构成财务建议、信贷评估或正式估值。法律、税务和贷款决策请咨询持牌专业人士。",
      '.search-box label[for="property-state"]': "Property location",
      '.search-box label[for="address"]': "Street address",
      "#start-valuation": "Get free estimate",
      ".mobile-value-card .eyebrow": "Estimated value",
      ".mobile-value-label": "Estimated value",
      ".mobile-midpoint-label": "Midpoint",
      ".mobile-confidence-label": "Confidence",
      "#mobile-report-cta": "Unlock full report details",
      ".lead-panel .eyebrow": "Full report",
      ".lead-panel h2": "Leave details to unlock",
      ".lead-panel > p:not(.eyebrow)": "Basic estimate is free. Register to view comparable adjustments, planning notes and report download options.",
      'label[for="lead-email"]': "Email",
      'label[for="lead-name"]': "Name",
      'label[for="lead-phone"]': "Phone optional",
      ".form-provider-note": "Submission details are securely stored for report delivery and customer follow-up. We may record an approximate visitor region, but do not display your full IP address.",
      ".consent span": "You may contact me about this property report.",
      "#unlock-report": "Register and unlock",
      ".side-panel .panel:nth-of-type(2) h2": "Check Status",
      ".summary-main .eyebrow": "First-layer desktop valuation",
      ".value-band div:nth-child(1) span": "Estimated value",
      ".value-band div:nth-child(2) span": "Midpoint",
      ".value-band div:nth-child(3) span": "Confidence",
      ".summary-card h3": "Why this estimate?",
      ".grid-two .metric-card:nth-child(1) span": "Fast starting point",
      ".grid-two .metric-card:nth-child(1) strong": "Address in, estimate out",
      ".grid-two .metric-card:nth-child(1) p": "Start with a quick estimate, then unlock the detailed report when you are ready.",
      ".grid-two .metric-card:nth-child(2) span": "Clear next steps",
      ".grid-two .metric-card:nth-child(2) strong": "Know what to check",
      ".grid-two .metric-card:nth-child(2) p": "The report highlights useful follow-up items such as title, planning and condition evidence.",
      ".loan-panel .eyebrow": "Loan / LVR scenario",
      ".loan-panel h2": "How much could be borrowed against this value?",
      ".loan-grid div:nth-child(1) span": "Selected LVR",
      ".loan-grid div:nth-child(2) span": "Indicative max loan",
      ".loan-grid div:nth-child(3) span": "Required equity before costs",
      ".loan-disclaimer": "Indicative only. This is not a loan approval, credit assessment or personal financial advice. Actual borrowing capacity depends on lender policy, income, expenses and full application assessment.",
      "#comparables h2": "Key Comparables",
      ".detail-trigger.ghost": "View adjustments",
      "#locked-strip strong": "Full comparable adjustments are locked.",
      "#locked-strip span": "Create a free account to view all sales evidence and adjustment notes.",
      ".location-grid .detail-panel:nth-child(1) h2": "Micro-location",
      ".fundamentals-grid .detail-panel:nth-child(1) h2": "Suburb Fundamentals",
      ".fundamentals-grid .detail-panel:nth-child(2) h2": "Planning & Potential",
      "#uploads .eyebrow": "Improve accuracy",
      "#uploads h2": "Upload evidence to strengthen the report.",
      "#uploads p:not(.eyebrow):not(.pdf-note)": "Title, Section 32, current photos and inspection notes will be reviewed as part of the evidence assessment.",
      ".pdf-note": "PDF download requires phone number and contact consent.",
      "#upload-evidence": "Upload evidence",
      "#download-pdf": "Download PDF",
      "#evidence-review h3": "Evidence review applied",
      "#evidence-revision-note": "Evidence received and logged for review. Download the report to see the evidence summary.",
      "#investor .eyebrow": "Investor Hub",
      "#investor h2": "Explore property-backed investment themes.",
      "#investor p:not(.eyebrow)": "General information only. Specific private opportunities require investor profile, eligibility review and compliance approval.",
      "#investor-lock strong": "Investor Hub details are locked.",
      "#investor-lock span": "Register to view investor education, profile questions and gated opportunity workflow.",
      "#about .eyebrow": "About Us",
      "#about h2": "Property research, finance thinking and practical investor support.",
      "#about .about-copy p:nth-of-type(2)": "AusHomeValue is a property opportunity intelligence platform purpose-built for evidence-based property research. We combine public sales records, geospatial clues and structured valuation logic to help buyers, sellers and investors understand what a property is worth — and why.",
      "#about .about-copy p:nth-of-type(3)": "Our bilingual platform connects Australia and China, helping clients navigate Australian property opportunities through local market evidence combined with cross-border wealth management experience.",
      "#about .about-copy p:nth-of-type(4)": "The team is led by finance and property professionals with over 25 years of experience across banking, insurance, private equity, real estate funds, wealth management, risk control and asset allocation for institutional and high-net-worth clients.",
      "#about .about-card h3": "Professional background",
      "#about .about-card li:nth-child(1)": "Master's Degree in Accounting, Private Banker Certificate and intermediate accountant qualification.",
      "#about .about-card li:nth-child(2)": "Experience across banking, insurance, private funds, investment management, real estate funds and wealth management.",
      "#about .about-card li:nth-child(3)": "Specialised in customised financial products, real estate project investment and HNW asset allocation.",
      "#about .about-card li:nth-child(4)": "Track record includes work connected to approximately AUD 5 billion in assets under management.",
      "#contact .eyebrow": "Contact Us",
      "#contact h2": "Have a property, finance or investment question?",
      "#contact > div:first-child p:not(.eyebrow)": "Send the address and your question by email, or scan the QR code to connect with us. We can review the case and tell you what evidence is still missing.",
      "#contact .contact-email": "info@aushomevalue.com.au",
      "#contact .qr-card strong": "WeChat / QR code",
      "#contact .qr-card p": "Tap to enlarge, then long press the QR code to scan or save.",
      "#contact .qr-card .qr-open-link": "Open QR image",
      "#qr-modal .eyebrow": "WeChat QR code",
      "#qr-modal h2": "Long press the QR code to scan or save.",
      "#qr-modal .qr-open-link": "Open original image",
      "#qr-close": "Close",
      ".modal-content .eyebrow": "Full report locked",
      "#modal-register": "Register to unlock",
      "#modal-close": "Not now",
      ".modal-content p:not(.eyebrow)": "Register to unlock comparable adjustments, suburb fundamentals, micro-location evidence and planning checks. PDF download requires phone number and contact consent.",
      "#manual-data-modal .eyebrow": "Manual evidence",
      "#manual-data-modal h2": "Add extra property notes.",
      "#manual-data-modal p:not(.eyebrow)": "Add title, planning, condition, street, rental or inspection notes. These notes will be included in the evidence review and PDF report.",
      "#manual-data-save": "Apply notes",
      "#manual-data-close": "Cancel",
      "#report-guide .eyebrow": "Report unlocked",
      "#report-guide h3": "Your detail report is ready below.",
      "#report-guide > p:not(.eyebrow)": "Start with comparable sales, then check micro-location, suburb fundamentals and planning potential.",
      ".report-guide-links a:nth-child(1)": "Comparables",
      ".report-guide-links a:nth-child(2)": "Location",
      ".report-guide-links a:nth-child(3)": "PDF / evidence",
      "#report-guide-modal .eyebrow": "Report unlocked",
      "#report-guide-modal h2": "Your detailed report sections are ready.",
      "#report-guide-modal p:not(.eyebrow)": "On mobile, start with the comparable sales table, then micro-location, suburb fundamentals and planning potential.",
      "#guide-comparables": "View report details",
      "#guide-location": "View location checks",
      "#guide-close": "Stay here",
      "#pdf-requirements-modal .eyebrow": "PDF download requirement",
      "#pdf-requirements-modal h2": "Phone number and contact consent are required.",
      "#pdf-requirements-modal p:not(.eyebrow)": "Please add your phone number and tick the contact consent box before downloading the full report PDF.",
      "#pdf-fill-details": "Fill phone details",
      "#pdf-close": "Not now",
      '[data-i18n="research-eyebrow"]': "Research",
      '[data-i18n="research-heading"]': "Market intelligence for Melbourne property.",
      '[data-i18n="research-sub"]': "Curated market research from Australia's leading property data sources. Our own suburb reports coming soon.",
      '[data-i18n="research-card1-title"]': "Market Reports",
      '[data-i18n="research-card1-desc"]': "Melbourne Property Outlook, Housing Supply, Migration Impact and more.",
      '[data-i18n="research-card2-title"]': "Suburb Research",
      '[data-i18n="research-card2-desc"]': "Deep dives into individual suburbs — demographics, schools, growth drivers.",
      '[data-i18n="research-card3-title"]': "Investment Guides",
      '[data-i18n="research-card3-desc"]': "House vs Apartment, Growth vs Cashflow, SMSF, First Investment Property.",
      '[data-i18n="research-card4-title"]': "Rankings",
      '[data-i18n="research-card4-desc"]': "Top Growth Suburbs, Top School Zones, Top Yield Suburbs, Best Value.",
      '[data-i18n="investor-card-title"]': "Explore Investment Themes",
      '[data-i18n="investor-card-desc"]': "Private credit, development finance and income property — learn how property-backed investing works.",
      '[data-i18n="investor-eyebrow"]': "Explore Investment Themes",
      '[data-i18n="investor-heading"]': "Property-backed investment directions.",
      '[data-i18n="investor-sub"]': "General information only. Specific private opportunities require investor profile, eligibility review and compliance approval.",
      '[data-i18n="coming-soon"]': "Coming soon",
      '[data-i18n="opp-eyebrow"]': "Top Opportunities BETA",
      '[data-i18n="opp-heading"]': "Investment opportunities ranked by data.",
      '[data-i18n="opp-sub"]': "Beta tool — scored across undervaluation, school quality, growth potential and cash flow. Refine by strategy, budget and property type.",
      '[data-i18n="opp-placeholder"]': "Adjust filters and click \"Search opportunities\" to see ranked results.",
      '[data-i18n="opp-filter-strategy"]': "Strategy",
      '[data-i18n="opp-filter-type"]': "Property type",
      '[data-i18n="opp-filter-min"]': "Min price",
      '[data-i18n="opp-filter-max"]': "Max price",
      '[data-i18n="opp-search-btn"]': "Search opportunities"
    }
  },
  zh: {
    toggle: "English",
    selectors: {
      ".topbar .eyebrow": "当前覆盖墨尔本和维多利亚州",
      ".topbar h1": "AusHomeValue",
      'nav a[href="#valuation"]': "估值",
      'nav a[href="#about"]': "关于我们",
      'nav a[href="#contact"]': "联系",
      'nav a[href="#opportunities"]': "机会",
      'nav a[href="#research"]': "研究",
      'nav a[href="#home"]': "首页",

      ".search-copy .eyebrow": "澳洲房产机会情报",
      ".search-copy h2": "估值、证据、洞见 — 一站集成。",
      ".hero-note": "初步估值仅供参考。结果基于公开资料、可比市场证据和客户补充资料，不构成正式估值、贷款批准或个人金融建议。",
      '[data-i18n="hero-banner"]': "当前覆盖墨尔本和维多利亚州",
      '[data-i18n="hero-eyebrow"]': "澳洲房产机会情报",
      '[data-i18n="hero-heading"]': "知道一个房产值多少钱 — 以及为什么值这个价。",
      '[data-i18n="hero-estimate-eyebrow"]': "免费估值（首层）",
      '[data-i18n="hero-sub"]': "基于可比成交、学校数据和人口普查数据，提供墨尔本和维多利亚房产的免费估值。",
      '[data-i18n="stat-sales"]': "条可比成交",
      '[data-i18n="stat-schools"]': "所学校已标注",
      '[data-i18n="stat-suburbs"]': "个区域已覆盖",
      '[data-i18n="footer-brand"]': "AusHomeValue – 房产机会情报。",
      '[data-i18n="footer-disclaimer-en"]': "This website provides general property information and research for educational purposes. Not financial advice, not a credit assessment, not a formal valuation. Always consult licensed professionals for legal, tax and lending decisions.",
      '[data-i18n="footer-disclaimer-zh"]': "本网站提供一般房产信息和研究，仅供教育参考。不构成财务建议、信贷评估或正式估值。法律、税务和贷款决策请咨询持牌专业人士。",
      '.search-box label[for="property-state"]': "房产所在地区",
      '.search-box label[for="address"]': "街道地址",
      "#start-valuation": "获取免费估值",
      ".mobile-value-card .eyebrow": "估值结果",
      ".mobile-value-label": "估值区间",
      ".mobile-midpoint-label": "估值中点",
      ".mobile-confidence-label": "置信度",
      "#mobile-report-cta": "解锁完整报告详情",
      ".lead-panel .eyebrow": "完整报告",
      ".lead-panel h2": "留下资料解锁",
      ".lead-panel > p:not(.eyebrow)": "基础估值免费。注册后可查看可比成交调整、规划说明和报告下载选项。",
      'label[for="lead-email"]': "邮箱",
      'label[for="lead-name"]': "姓名",
      'label[for="lead-phone"]': "电话 选填",
      ".form-provider-note": "提交资料将安全保存，用于发送报告和客户跟进。系统可能记录大致访问地区，但不会在后台显示你的完整 IP 地址。",
      ".consent span": "我同意你可以就这份房产报告联系我。",
      "#unlock-report": "注册并解锁",
      ".side-panel .panel:nth-of-type(2) h2": "检查状态",
      ".side-panel .panel:nth-of-type(3) h2": "手工上传",
      ".summary-main .eyebrow": "第一层桌面估值",
      ".value-band div:nth-child(1) span": "估值区间",
      ".value-band div:nth-child(2) span": "估值中点",
      ".value-band div:nth-child(3) span": "置信度",
      ".summary-card h3": "为什么是这个估值？",
      ".grid-two .metric-card:nth-child(1) span": "快速起点",
      ".grid-two .metric-card:nth-child(1) strong": "输入地址，获得估值",
      ".grid-two .metric-card:nth-child(1) p": "先获得一个快速估值，需要时再解锁详细报告。",
      ".grid-two .metric-card:nth-child(2) span": "清晰下一步",
      ".grid-two .metric-card:nth-child(2) strong": "知道还要检查什么",
      ".grid-two .metric-card:nth-child(2) p": "报告会提示产权、规划、房况等有助于进一步确认的资料。",
      ".loan-panel .eyebrow": "贷款 / LVR 情景",
      ".loan-panel h2": "按这个估值大概可以借多少？",
      ".loan-grid div:nth-child(1) span": "选择 LVR",
      ".loan-grid div:nth-child(2) span": "指示性最高贷款额",
      ".loan-grid div:nth-child(3) span": "不含费用所需自有资金",
      ".loan-disclaimer": "仅为指示性 LVR 情景，不是贷款批准、信贷评估或个人金融建议。实际借款能力取决于贷款机构政策、收入、支出、信用记录和完整申请评估。",
      "#comparables h2": "关键可比成交",
      ".detail-trigger.ghost": "查看调整项",
      "#locked-strip strong": "完整可比成交调整已锁定。",
      "#locked-strip span": "创建免费账户后可查看所有成交证据和调整说明。",
      ".location-grid .detail-panel:nth-child(1) h2": "微位置",
      ".fundamentals-grid .detail-panel:nth-child(1) h2": "区域基本面",
      ".fundamentals-grid .detail-panel:nth-child(2) h2": "规划与潜力",
      "#uploads .eyebrow": "提高准确度",
      "#uploads h2": "上传资料以增强报告完整性。",
      "#uploads p:not(.eyebrow):not(.pdf-note)": "产权文件、Section 32、当前照片和检查记录会进入报告的证据审查部分。",
      ".pdf-note": "下载 PDF 需要填写电话并授权联系。",
      "#upload-evidence": "上传资料",
      "#download-pdf": "下载 PDF",
      "#evidence-review h3": "已应用资料复核",
      "#evidence-revision-note": "系统已根据上传资料修正估值。下载报告可查看资料复核摘要。",
      "#investor .eyebrow": "投资中心",
      "#investor h2": "探索地产支持型投资主题。",
      "#investor p:not(.eyebrow)": "仅提供一般信息。具体私募机会需要投资人画像、资格审核和合规批准。",
      "#investor-lock strong": "投资中心详情已锁定。",
      "#investor-lock span": "注册后可查看投资教育、投资人画像问题和机会访问流程。",
      "#about .eyebrow": "关于我们",
      "#about h2": "让房产研究、投资理财和金融判断更清楚、更结构、更有帮助。",
      "#about .about-copy p:nth-of-type(2)": "AusHomeValue 是一个数据驱动的房产机会情报平台。我们基于公开成交记录、地理空间线索和结构化估值逻辑，帮助买家、卖家和投资人理解一处房产的价值 — 以及为什么值这个价。",
      "#about .about-copy p:nth-of-type(3)": "我们的双语平台连接中澳两地，结合本地市场证据与跨境财富管理经验，帮助客户更清晰地把握澳洲房产机会。",
      "#about .about-copy p:nth-of-type(4)": "团队由具备金融和地产背景的专业人士带领，拥有超过 25 年银行、保险、私募股权、地产基金、财富管理、风险控制和高净值客户资产配置经验。",
      "#about .about-card h3": "专业背景",
      "#about .about-card li:nth-child(1)": "会计硕士，持有私人银行相关证书及中级会计师资质。",
      "#about .about-card li:nth-child(2)": "曾在银行、保险、私募基金、投资管理、地产基金和财富管理领域积累实践经验。",
      "#about .about-card li:nth-child(3)": "专长包括机构及高净值客户定制化金融产品、地产项目投资和资产配置。",
      "#about .about-card li:nth-child(4)": "过往工作涉及的资产管理规模约 50 亿澳元。",
      "#contact .eyebrow": "联系我们",
      "#contact h2": "有房产、贷款或投资问题？",
      "#contact > div:first-child p:not(.eyebrow)": "把地址和你的问题发到邮箱，或扫描二维码联系我们。我们可以先看这个案例，并告诉你还缺哪些资料。",
      "#contact .contact-email": "info@aushomevalue.com.au",
      "#contact .qr-card strong": "微信 / 二维码",
      "#contact .qr-card p": "点击放大后，长按二维码识别或保存。",
      "#contact .qr-card .qr-open-link": "打开二维码原图",
      "#qr-modal .eyebrow": "微信二维码",
      "#qr-modal h2": "长按二维码识别或保存。",
      "#qr-modal .qr-open-link": "打开原图",
      "#qr-close": "关闭",
      ".modal-content .eyebrow": "完整报告已锁定",
      "#modal-register": "注册解锁",
      "#modal-close": "暂不",
      ".modal-content p:not(.eyebrow)": "注册后可查看可比成交调整、区域基本面、微位置证据和规划检查。下载 PDF 需要填写电话并授权联系。",
      "#manual-data-modal .eyebrow": "手工资料",
      "#manual-data-modal h2": "补充物业资料。",
      "#manual-data-modal p:not(.eyebrow)": "可以填写产权、规划、房况、街道、租金或检查记录。这些内容会进入资料复核和 PDF 报告。",
      "#manual-data-save": "应用资料",
      "#manual-data-close": "取消",
      "#report-guide .eyebrow": "报告已解锁",
      "#report-guide h3": "详细报告已经在下面开放。",
      "#report-guide > p:not(.eyebrow)": "建议先看可比成交，再看微位置、区域基本面和规划潜力。",
      ".report-guide-links a:nth-child(1)": "可比成交",
      ".report-guide-links a:nth-child(2)": "位置分析",
      ".report-guide-links a:nth-child(3)": "PDF / 补充资料",
      "#report-guide-modal .eyebrow": "报告已解锁",
      "#report-guide-modal h2": "详细报告板块已经开放。",
      "#report-guide-modal p:not(.eyebrow)": "手机端建议先看可比成交表，再看微位置、区域基本面和规划潜力。",
      "#guide-comparables": "查看报告详情",
      "#guide-location": "查看位置检查",
      "#guide-close": "留在这里",
      "#pdf-requirements-modal .eyebrow": "PDF 下载要求",
      "#pdf-requirements-modal h2": "下载 PDF 需要填写电话并勾选联系授权。",
      "#pdf-requirements-modal p:not(.eyebrow)": "请先补充电话号码，并勾选同意联系，再下载完整报告 PDF。",
      "#pdf-fill-details": "去填写电话",
      "#pdf-close": "暂不",
      '[data-i18n="research-eyebrow"]': "研究",
      '[data-i18n="research-heading"]': "墨尔本房产市场情报。",
      '[data-i18n="research-sub"]': "精选自澳洲领先房地产数据源的市场研究。我们的自有区域报告即将上线。",
      '[data-i18n="research-card1-title"]': "市场报告",
      '[data-i18n="research-card1-desc"]': "墨尔本房市展望、住房供应、移民影响等。",
      '[data-i18n="research-card2-title"]': "区域研究",
      '[data-i18n="research-card2-desc"]': "深入单个区域分析 — 人口、学校、增长动力。",
      '[data-i18n="research-card3-title"]': "投资指南",
      '[data-i18n="research-card3-desc"]': "独立屋 vs 公寓、增长 vs 现金流、SMSF、首套投资房。",
      '[data-i18n="research-card4-title"]': "排行榜",
      '[data-i18n="research-card4-desc"]': "增长最快区域、优质学区、最高收益率、最佳价值。",
      '[data-i18n="investor-card-title"]': "探索投资主题",
      '[data-i18n="investor-card-desc"]': "私域信用、开发融资、收益型地产 — 了解房产抵押投资如何运作。",
      '[data-i18n="investor-eyebrow"]': "探索投资主题",
      '[data-i18n="investor-heading"]': "房产抵押投资方向。",
      '[data-i18n="investor-sub"]': "仅供参考。具体私人投资机会需要投资者简介、资格审查和合规审批。",
      '[data-i18n="coming-soon"]': "即将推出",
      '[data-i18n="opp-eyebrow"]': "最佳机会 BETA",
      '[data-i18n="opp-heading"]': "数据驱动的投资机会排名。",
      '[data-i18n="opp-sub"]': "Beta 工具 — 基于低估程度、学区质量、增长潜力和现金流评分。可按策略、预算和房产类型筛选。",
      '[data-i18n="opp-placeholder"]': '调整筛选条件后点击“搜索机会”查看排名结果。',
      '[data-i18n="opp-filter-strategy"]': "策略",
      '[data-i18n="opp-filter-type"]': "房产类型",
      '[data-i18n="opp-filter-min"]': "最低价格",
      '[data-i18n="opp-filter-max"]': "最高价格",
      '[data-i18n="opp-search-btn"]': "搜索机会"
    }
  }
};

const labelSets = {
  en: {
    checkItems: ["Portal cross-check", "Recent sales scan", "Suburb fundamentals", "Micro-location review", "Title confirmation", "Current condition"],
    tableHeaders: ["Address", "Sale", "Date", "Land", "Config", "Similarity"],
    factLabels: ["Street rank", "Street type", "Amenity access", "Parking pressure", "Land source", "Granny flat potential", "Approval certainty"],
    chips: ["House", "Vacant land", "Townhouse", "Villa", "Unit", "Apartment", "Commercial"],
    investorButtons: ["Private credit", "Development finance", "Income property"],
    investorDetail: {
      headings: ["Investor profile", "Gated access"],
      lists: [
        ["Investment purpose and preferred strategy", "Budget / intended allocation range", "Risk tolerance and investment horizon", "Wholesale or sophisticated investor status"],
        ["Registered users see education and market themes", "Profile completed users can request opportunity summaries", "Eligible investors may access IM / DD materials after review"]
      ]
    }
  },
  zh: {
    checkItems: ["门户数据交叉检查", "近期成交扫描", "区域基本面", "微位置检查", "产权确认", "当前房况"],
    tableHeaders: ["地址", "成交价", "日期", "土地", "房型", "相似度"],
    factLabels: ["街道排名", "街道类型", "便利性", "停车压力", "土地来源", "奶奶房潜力", "批准确定性"],
    chips: ["独立屋", "空地", "联排", "别墅", "单元房", "公寓", "商业地产"],
    investorButtons: ["地产私募债", "开发融资", "收益型地产"],
    investorDetail: {
      headings: ["投资人画像", "权限访问"],
      lists: [
        ["投资目的和偏好策略", "预算 / 计划配置金额", "风险偏好和投资期限", "Wholesale 或 Sophisticated investor 状态"],
        ["注册用户可看投资教育和市场主题", "完成画像后可申请机会摘要", "通过资格审核后可查看 IM / DD 材料"]
      ]
    }
  }
};

const investorThemes = {
  en: {
    privateCredit: {
      title: "Private credit",
      copy: "Property-backed private credit focuses on short-term lending secured by real estate. The first review usually looks at valuation buffer, LVR, borrower exit strategy and security position.",
      points: [
        "Indicative LVR, valuation range and downside buffer",
        "Security ranking, repayment source and loan term",
        "Borrower background, project status and documents still required"
      ],
      consult: "For a specific case, scan the QR code below or email info@aushomevalue.com.au."
    },
    developmentFinance: {
      title: "Development finance",
      copy: "Development finance is assessed through land value, planning status, build cost, presales or exit evidence, and the practical timing risk of the project.",
      points: [
        "Site value, planning pathway and approval uncertainty",
        "Build budget, contingency and delivery timeline",
        "Exit plan through sale, refinance or retained income"
      ],
      consult: "For a project review, scan the QR code below or email info@aushomevalue.com.au."
    },
    incomeProperty: {
      title: "Income property",
      copy: "Income property review connects valuation with rent, occupancy, yield, debt capacity and tenant quality, so the investor can compare return against risk.",
      points: [
        "Current rent, likely rent and vacancy risk",
        "Yield, operating costs and interest-rate sensitivity",
        "Tenant profile, lease terms and refinance options"
      ],
      consult: "For an income-property discussion, scan the QR code below or email info@aushomevalue.com.au."
    }
  },
  zh: {
    privateCredit: {
      title: "地产私募债",
      copy: "地产私募债主要看是否有房产作为抵押、估值安全边际、LVR、借款人的退出方式，以及抵押权顺位是否清楚。",
      points: ["指示性 LVR、估值区间和下行缓冲", "抵押顺位、还款来源和借款期限", "借款人背景、项目状态和仍需补充的文件"],
      consult: "具体项目可以扫描下方二维码咨询，或发邮件到 info@aushomevalue.com.au。"
    },
    developmentFinance: {
      title: "开发融资",
      copy: "开发融资会结合土地价值、规划状态、建筑成本、预售或退出证据，以及项目时间风险一起判断。",
      points: ["地块价值、规划路径和审批不确定性", "建筑预算、预备金和交付时间", "通过出售、再融资或持有出租退出"],
      consult: "开发项目可以扫描下方二维码咨询，或发邮件到 info@aushomevalue.com.au。"
    },
    incomeProperty: {
      title: "收益型地产",
      copy: "收益型地产会把估值和租金、空置率、收益率、贷款能力、租客质量连接起来，帮助投资人比较收益和风险。",
      points: ["当前租金、潜在租金和空置风险", "收益率、运营成本和利率敏感度", "租客情况、租约条款和再融资选项"],
      consult: "收益型地产可以扫描下方二维码咨询，或发邮件到 info@aushomevalue.com.au。"
    }
  }
};

const evidenceTypes = {
  section32: {
    label: "Section 32 / vendor statement",
    labelZh: "Section 32 / 售房声明",
    pattern: /section\s*32|vendor statement|s32|disclosure/i
  },
  title: {
    label: "Title and title plan",
    labelZh: "产权和产权图",
    pattern: /title|certificate of title|title plan|lot plan|plan of subdivision/i
  },
  planning: {
    label: "Planning / zoning / overlays",
    labelZh: "规划 / 分区 / 覆盖层",
    pattern: /planning|zoning|zone|overlay|council|neighbourhood residential|general residential/i
  },
  photos: {
    label: "Current photos / condition evidence",
    labelZh: "当前照片 / 房况证据",
    pattern: /photo|photos|image|facade|kitchen|bathroom|condition|renovated|jpg|jpeg|png|heic/i
  },
  street: {
    label: "Street, access and parking review",
    labelZh: "街道、进出和停车复核",
    pattern: /street|road|access|parking|traffic|quiet|wide|narrow|tree/i
  }
};

function normalizeAddress(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\boakley\b|\boaklrigh\b/g, "oakleigh")
    .replace(/\bmelnourne\b|\bmelbourn\b/g, "melbourne")
    .replace(/\bspencer\d+\b/g, "spencer")
    .replace(/\bapt(\d+)\b/g, "apt $1")
    .replace(/\bapartment(\d+)\b/g, "apartment $1")
    .replace(/\bu\s*(\d+)\b/g, "unit $1")
    .replace(/\bunit(\d+)\b/g, "unit $1")
    .replace(/\b(\d+)\s*-\s*(\d+)\b/g, "$1/$2")
    .replace(/\b(no|num|number|#)\s*(\d+)\b/g, "$2")
    .replace(/[,.-]/g, " ")
    .replace(/\bvic\b/g, "")
    .replace(/\b3\d{3}\b/g, "")
    .replace(/\bst\b/g, "street")
    .replace(/\bav\b|\bave\b/g, "avenue")
    .replace(/\brd\b/g, "road")
    .replace(/\bgr\b/g, "grove")
    .replace(/\s+/g, " ")
    .trim();
}

function getAddressSignature(value) {
  const normalized = normalizeAddress(value);
  const slashMatch = normalized.match(/\b(\d+)\s*\/\s*(\d+)\b/);
  const unitMatch = normalized.match(/\bunit\s+(\d+)\b/);
  const apartmentMatch = normalized.match(/\b(?:apartment|apt|flat)\s+([a-z]?\d+[a-z]?)\b/);
  const streetMatch = normalized.match(/\b(\d+)\s+([a-z]+(?:\s+[a-z]+)*)\s+(street|avenue|road|grove|drive|court|crescent|parade|place|lane)\b/);
  const streetNumber = slashMatch?.[2] || streetMatch?.[1] || "";
  const streetName = streetMatch ? `${streetMatch[2]} ${streetMatch[3]}` : "";
  const unitNumber = slashMatch?.[1] || apartmentMatch?.[1] || unitMatch?.[1] || "";
  const unitWordStartsAddress = Boolean(normalized.match(/^unit\s+\d+\s+[a-z]+/));
  const ambiguousUnitAsStreetNumber = unitWordStartsAddress && unitNumber === streetNumber;
  const hasApartmentSignal = /\bapartment\b|\bapt\b|\bflat\b|\blevel\s+\d+\b|^\s*\d{3,5}\s*\//.test(normalized);
  const hasUnitSignal = /\bunit\b|\b\d+\s*\/\s*\d+\b|\bapartment\b|\bapt\b|\bflat\b/.test(normalized);

  return {
    normalized,
    unitNumber,
    streetNumber,
    streetName,
    hasUnitSignal,
    hasApartmentSignal,
    ambiguousUnitAsStreetNumber
  };
}

function getValuationMatchScore(item, inputSignature, selectedType = "") {
  const selectedTypeMatches = selectedType ? item.type === selectedType : true;
  if (selectedType && !selectedTypeMatches) return -1;
  const itemRequiresUnitSignal = isAttachedOrStrataType(item.type) || item.aliases.some((alias) => getAddressSignature(alias).hasUnitSignal);

  return item.aliases.reduce((bestScore, alias) => {
    const aliasSignature = getAddressSignature(alias);
    let score = -1;

    if (aliasSignature.normalized === inputSignature.normalized) {
      score = 100;
    } else if (
      aliasSignature.streetName &&
      inputSignature.streetName &&
      aliasSignature.streetName === inputSignature.streetName &&
      aliasSignature.streetNumber &&
      inputSignature.streetNumber &&
      aliasSignature.streetNumber === inputSignature.streetNumber
    ) {
      if (itemRequiresUnitSignal && !inputSignature.hasUnitSignal) return bestScore;
      score = 60;

      if (aliasSignature.unitNumber && inputSignature.unitNumber) {
        if (aliasSignature.unitNumber === inputSignature.unitNumber) {
          score += 30;
        } else if (!inputSignature.ambiguousUnitAsStreetNumber) {
          score = -1;
        }
      } else if (inputSignature.unitNumber && !aliasSignature.unitNumber && !inputSignature.ambiguousUnitAsStreetNumber) {
        score = -1;
      } else if (inputSignature.hasUnitSignal && item.type === "House") {
        score = -1;
      }
    }

    if (score >= 0 && selectedTypeMatches) score += 10;
    return Math.max(bestScore, score);
  }, -1);
}

// findValuation removed — API-only, no static data
// createInferredSameComplexValuation removed — API-only
// createInferredSameStreetValuation removed — API-only
// createInferredSuburbValuation removed — API-only
function createInferredNearbyTypeValuation(address, selectedType = "", selectedState = "", enteredSuburb = "") {
  const inferredAddress = String(address || "").trim();
  const suburbLabel = enteredSuburb || suburbFromAddress(inferredAddress);
  if (!inferredAddress || selectedType === "Commercial") return null;

  const candidates = valuations
    .map((item) => {
      if (selectedType === "Vacant land" && item.type !== "Vacant land") return null;
      if (selectedType !== "Vacant land" && item.type === "Vacant land") return null;
      const compatibleBuiltForm = isAttachedOrStrataType(item.type) === isAttachedOrStrataType(selectedType);
      if (item.type !== selectedType && !compatibleBuiltForm) return null;
      return {
        item,
        score: item.type === selectedType ? 3 : 1
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;

  const base = candidates[0].item;
  const propertyType = selectedType || base.type;

  return {
    ...base,
    ...buildComparableDrivenEstimate(base.comparables, "Low"),
    address: inferredAddress,
    addressZh: inferredAddress,
    propertyState: selectedState || stateFromAddress(inferredAddress),
    propertySuburb: suburbLabel,
    type: propertyType,
    confidence: "Low",
    status: "Low",
    reasons: [
      `${inferredAddress} does not yet have direct same-address or same-suburb evidence attached, so the model expands to the nearest available same-type comparable pool.`,
      `The estimate is calculated from nearby ${propertyType.toLowerCase()} evidence as a preliminary valuation, with lower confidence until closer sales are collected.`,
      "Google Maps, current title, building form, photos and recent same-type sales inside the closest practical radius should be checked to tighten the result.",
      ...base.reasons.slice(0, 2)
    ],
    reasonsZh: [
      `${inferredAddress} 目前还没有同地址或同 suburb 的直接证据，因此模型会扩大到最近可用的同类型 comparable 池。`,
      `本估值根据附近 ${propertyType} 证据计算初步估值；在收集到更近成交前，置信度会降低。`,
      "应继续核对 Google Maps、当前 title、建筑形态、照片，以及最近可行半径内的同类型成交，以收窄结果。",
      ...base.reasonsZh.slice(0, 2)
    ],
    builtFormVerification: {
      status: "nearby-type-inferred",
      summary: `${inferredAddress} is valued from the nearest available same-type comparable pool until closer evidence is collected.`,
      summaryZh: `${inferredAddress} 在收集到更近证据前，先用最近可用的同类型 comparable 池估值。`,
      currentForm: propertyType,
      currentFormZh: propertyType,
      legacyRisk: "Nearby same-type evidence can differ materially from the subject address by suburb, school zone, street quality, building age, strata plan and condition.",
      legacyRiskZh: "附近同类型证据可能因 suburb、校区、街道质量、楼龄、strata plan 和房况与目标地址明显不同。",
      action: "Verify the address on Google Maps, then keep expanding or tightening the comparable radius until enough same-type sales support the estimate.",
      actionZh: "先用 Google Maps 核验地址，再按半径扩大或收紧 comparable 搜索，直到有足够同类型成交支撑估值。"
    },
    map: {
      ...base.map,
      target: getAddressSignature(inferredAddress).streetNumber || "Subject"
    }
  };
}

function formatMoney(amount) {
  if (!Number.isFinite(amount)) return "Manual review";
  if (amount >= 1000000) {
    const value = amount / 1000000;
    return `$${value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, "")}m`;
  }
  return `$${Math.round(amount / 1000)}k`;
}

function buildComparableDrivenEstimate(comparables = [], confidence = "Low") {
  const prices = comparables.map((row) => parseComparablePrice(row[1])).filter(Boolean).sort((a, b) => a - b);
  if (!prices.length) {
    return {
      value: "Manual review required",
      midpoint: "Manual review",
      midpointValue: NaN
    };
  }
  const middle = Math.floor(prices.length / 2);
  const midpointValue = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  const confidenceBuffer = confidence === "Low-Medium" ? 0.08 : confidence === "Medium" ? 0.06 : 0.12;
  const low = Math.min(prices[0], midpointValue * (1 - confidenceBuffer));
  const high = Math.max(prices[prices.length - 1], midpointValue * (1 + confidenceBuffer));
  return {
    value: `${formatMoney(low)} - ${formatMoney(high)}`,
    midpoint: formatMoney(midpointValue),
    midpointValue
  };
}

function applyComparableSalesModel(data, confidence = data.confidence || "Low") {
  return {
    ...data,
    ...buildComparableDrivenEstimate(data.comparables, confidence)
  };
}

function inferPropertyTypeFromAddress(address, directAddressMatch = null, selectedType = "") {
  if (directAddressMatch) return directAddressMatch.type;
  if (selectedType === "Commercial") return "Commercial";
  const normalized = normalizeAddress(address);
  const signature = getAddressSignature(address);

  if (/\b(vacant land|development site|land only|land)\b/.test(normalized)) return "Vacant land";
  if (/\b(shop|retail|office|warehouse|commercial|factory)\b/.test(normalized)) return "Commercial";
  if (signature.hasApartmentSignal) return "Apartment";

  if (signature.hasUnitSignal) {
    const sameComplexType = valuations
      .map((item) => {
        if (!isAttachedOrStrataType(item.type)) return null;
        const hasSameComplexAlias = item.aliases.some((alias) => {
          const aliasSignature = getAddressSignature(alias);
          return (
            aliasSignature.streetName === signature.streetName &&
            aliasSignature.streetNumber === signature.streetNumber
          );
        });
        if (!hasSameComplexAlias) return null;
        return item.type;
      })
      .filter(Boolean)[0];
    return sameComplexType || "Unit";
  }

  const sameStreetType = valuations
    .map((item) => {
      const hasSameStreetAlias = item.aliases.some((alias) => {
        const aliasSignature = getAddressSignature(alias);
        return aliasSignature.streetName === signature.streetName;
      });
      if (!hasSameStreetAlias) return null;
      return item.type;
    })
    .filter((type) => type && !isAttachedOrStrataType(type))[0];

  if (sameStreetType) return sameStreetType;
  if (selectedType && selectedType !== "House") return selectedType;
  return "House";
}
function createUnavailableValuation(address, inferredType = "House", selectedState = "", enteredSuburb = "") {
  return {
    ...valuations[0],
    address: address || "Unknown address",
    propertyState: selectedState,
    propertySuburb: enteredSuburb,
    type: inferredType,
    value: "Manual review required",
    midpoint: "Manual review",
    midpointValue: NaN,
    confidence: "Low",
    status: "Low",
    reasons: [
      "The address could not be parsed into a usable residential valuation intake.",
      selectedState === "VIC"
        ? "A real deployment would call the valuation API, title data and comparable-sales sources."
        : `${selectedState} intake is ready, but valuation data for this state will be connected in a later release.`,
      "Please check the street number, street name, suburb and state, then try again."
    ],
    reasonsZh: [
      "该地址暂时无法解析成可用的住宅估值入口。",
      selectedState === "VIC"
        ? "真实部署时会调用估值 API、产权资料和可比成交数据源。"
        : `${selectedState} 的地址入口已经准备好，但该州估值数据会在后续版本接入。`,
      "请检查门牌号、街名、suburb 和州后再试。"
    ],
    comparables: [],
    location: {
      rank: "Unknown",
      type: "Unknown",
      amenity: "Unknown",
      parking: "Unknown",
      rankZh: "未知",
      typeZh: "未知",
      amenityZh: "未知",
      parkingZh: "未知"
    },
    suburb: ["No suburb fundamentals available for this intake."],
    suburbZh: ["该入口暂无区域基本面。"],
    planning: {
      landSource: "Unknown",
      granny: "Unknown",
      approval: "Not assessed",
      landSourceZh: "未知",
      grannyZh: "未知",
      approvalZh: "未评估"
    },
    map: {}
  };
}

async function runAddressValuation(address, selectedType = "", selectedState = "", effectiveSuburb = "") {
  const normalizedSuburb = normalizeSuburbName(effectiveSuburb);
  const resolvedState = explicitStateFromAddress(address) || selectedState;
  const inferredType = inferPropertyTypeFromAddress(address, null, selectedType);

  if (inferredType === "Commercial") {
    return {
      ...commercialPendingValuation,
      address: address || commercialPendingValuation.address,
      addressZh: address || commercialPendingValuation.addressZh,
      propertyState: resolvedState,
      propertySuburb: normalizedSuburb || effectiveSuburb
    };
  }

  try {
    const response = await fetch("/api/valuation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        suburb: normalizedSuburb,
        state: resolvedState,
        propertyType: inferredType,
        useDatabaseFallback: true
      })
    });
    var result = await response.json();

    // ── 地址核验冲突：先读 JSON 再判断状态码 ──
    if (result.status === "address-mismatch") {
      var mm = result.mismatch || {};
      return {
        ...createUnavailableValuation(address, inferredType, resolvedState, normalizedSuburb),
        addressMismatch: true,
        mismatchType: mm.type || "suburb",
        mismatchInput: mm.inputSuburb || "",
        mismatchVerified: mm.verifiedSuburb || "",
        mismatchFailures: mm.failures || [],
        mismatchMessage: mm.message || result.error || "地址信息核验不一致",
        addressZh: mm.message || result.error || "地址信息核验不一致"
      };
    }

    if (!response.ok) throw new Error(result.error || `Valuation API returned ${response.status}`);

    if (!result.valuation?.ok || !result.valuation.estimate) {
      // API 返回了明确但无法估值的结果
      throw new Error(result.message || "Valuation engine returned no estimate");
    }
    const acc = result.valuation.acceptedComparables || [];
    const est = result.valuation.estimate;
    const conf = result.valuation.confidence || {};

    // 确定证据模式展示文案
    const customerDataStatus = result.customerDataStatus || "unavailable";

    return {
      address,
      addressZh: address,
      propertyState: result.subject?.state || resolvedState,
      propertySuburb: result.subject?.suburb || normalizedSuburb,
      type: result.subject?.propertyType || inferredType,
      value: `$${(est.low / 1000000).toFixed(3)}m - $${(est.high / 1000000).toFixed(3)}m`,
      midpoint: `$${(est.midpoint / 1000000).toFixed(3)}m`,
      midpointValue: est.midpoint,
      confidence: conf.label || "Low",
      confidenceZh: conf.label || "低",
      status: conf.label || "Low",
      statusZh: conf.label || "低",
      customerDataStatus: customerDataStatus,
      modelVersion: result.modelVersion || "",
      comparables: acc.map(c => [
        c.address || "",
        c.salePrice ? `$${c.salePrice.toLocaleString()}` : "",
        c.saleDate || "",
        c.distanceMeters ? `${c.distanceMeters}m` : "",
        c.bedrooms != null ? `${c.bedrooms} 房` : "",
        c.bathrooms != null ? `${c.bathrooms} 卫` : "",
        c.carSpaces != null ? `${c.carSpaces} 车位` : "",
        c.landSize ? `${c.landSize}m²` : ""
      ]),
      reasons: [language === "zh" ? "估值已生成" : "Valuation generated"],
      reasonsZh: [language === "zh" ? "估值已生成" : "Valuation generated"],
      location: emptyValuation.location,
      planning: emptyValuation.planning,
      suburb: [],
      modelNotes: [],
      map: {},
      mapZh: {},
      evidenceSummary: "",
      evidenceSummaryZh: ""
    };

  } catch (error) {
    console.warn("Live valuation unavailable:", error.message);
    return createUnavailableValuation(address, inferredType, resolvedState, normalizedSuburb);
  }
}
function setList(id, items) {
  const element = byId(id);
  element.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    element.appendChild(li);
  });
}

function getLocalizedArray(data, key) {
  return language === "zh" && data[`${key}Zh`] ? data[`${key}Zh`] : data[key];
}

function getLocalizedPlanning(data, key) {
  return language === "zh" && data.planning[`${key}Zh`] ? data.planning[`${key}Zh`] : data.planning[key];
}

function getLocalizedLocation(data, key) {
  return language === "zh" && data.location[`${key}Zh`] ? data.location[`${key}Zh`] : data.location[key];
}

function getLocalizedModelNotes(data) {
  return language === "zh" && data.modelNotesZh ? data.modelNotesZh : data.modelNotes || [];
}

function getPlanningLabels(data) {
  if (data.planningLabels?.[language]) return data.planningLabels[language];
  return labelSets[language].factLabels.slice(4, 7);
}

const dynamicText = {
  zh: {
    "Low": "低",
    "Low-Medium": "低至中等",
    "Medium": "中等",
    "Medium-High": "中高",
    "High": "高",
    "Good": "良好",
    "Strong": "强",
    "Unknown": "未知",
    "Not assessed": "未评估",
    "Manual review": "人工复核",
    "Manual review required": "需要人工复核",
    "Pending": "待输入"
  }
};

function localizeValue(value) {
  if (language !== "zh") return value;
  if (dynamicText.zh[value]) return dynamicText.zh[value];
  if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/.test(value)) {
    const [month, year] = value.split(" ");
    const monthNumber = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(month) + 1;
    return `${year}年${monthNumber}月`;
  }
  if (/^\d+ sqm$/.test(value)) return value.replace(" sqm", " 平方米");
  if (/^\d+ bed$/.test(value)) return value.replace(" bed", "房");
  if (value === "Guide") return "指导价";
  return value;
}

function readFileText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

function detectEvidenceTypes(fileName, content) {
  const haystack = `${fileName}\n${content}`.toLowerCase();
  return Object.entries(evidenceTypes)
    .filter(([, config]) => config.pattern.test(haystack))
    .map(([key]) => key);
}

function getEvidenceLabel(type) {
  const config = evidenceTypes[type];
  return language === "zh" ? config.labelZh : config.label;
}

function formatEvidenceRange(midpointValue, rangePercent) {
  if (!Number.isFinite(midpointValue)) {
    return { value: "Manual review", midpoint: "Manual review" };
  }
  const low = midpointValue * (1 - rangePercent);
  const high = midpointValue * (1 + rangePercent);
  return {
    value: `${formatMoney(low)} - ${formatMoney(high)}`,
    midpoint: formatMoney(midpointValue)
  };
}

function renderEvidenceReview(summary) {
  uploadedEvidenceSummary = summary || [];
  const panel = byId("evidence-review");
  if (!uploadedEvidenceSummary.length) {
    panel.classList.add("hidden");
    byId("evidence-review-list").innerHTML = "";
    return;
  }
  setList("evidence-review-list", uploadedEvidenceSummary);
  panel.classList.remove("hidden");
}

function buildEvidenceSummary(files, detectedTypes, _adjustedMidpoint, _rangePercent, lang = language) {
  const detectedLabels = detectedTypes.map((type) => {
    const config = evidenceTypes[type];
    return lang === "zh" ? config.labelZh : config.label;
  });
  if (lang === "zh") {
    return [
      "已读取 " + files.length + " 个文件：" + files.map((f) => f.name).join("、"),
      "识别资料：" + (detectedLabels.join("、") || "未识别，需要人工复核"),
      "资料已收到，待进一步复核。当前估值未因此调整。",
      "这些资料会进入报告的 evidence review 部分。"
    ];
  }
  return [
    "Read " + files.length + " file" + (files.length === 1 ? "" : "s") + ": " + files.map((f) => f.name).join(", "),
    "Recognised evidence: " + (detectedLabels.join(", ") || "unclassified, manual review required"),
    "Evidence received and logged for review. The current estimate has not been adjusted.",
    "These items will be included in the evidence review section of the report."
  ];
}

function applyEvidenceSources(sources, sourceLabel) {
  if (!Number.isFinite(currentValuation.midpointValue)) {
    byId("upload-message").textContent =
      language === "zh"
        ? "请先输入地址并生成估值，再上传资料。"
        : "Please enter an address and generate an estimate before uploading evidence.";
    return;
  }
  if (!sources.length) return;
  const fileList = sources.map((source) => ({ name: source.name }));
  const fileTexts = sources.map((source) => source.text || "");
  const detectedTypes = [
    ...new Set(sources.flatMap((source) => detectEvidenceTypes(source.name, source.text)))
  ];
  const evidenceSummary = buildEvidenceSummary(fileList, detectedTypes, null, null, "en");
  const evidenceSummaryZh = buildEvidenceSummary(fileList, detectedTypes, null, null, "zh");
  const revisedValuation = {
    ...currentValuation,
    evidenceSummary,
    evidenceSummaryZh
  };
  renderValuation(revisedValuation);
  renderEvidenceReview(evidenceSummary);
  byId("upload-message").textContent =
    language === "zh"
      ? fileList.length + " 项资料已收到，待进一步复核。"
      : fileList.length + " " + (sourceLabel || "uploaded") + " item" + (fileList.length === 1 ? "" : "s") + " received and logged for review.";
}

async function applyEvidenceFiles(files) {
  const fileList = Array.from(files);
  if (!fileList.length) return;
  const fileTexts = await Promise.all(fileList.map((file) => readFileText(file)));
  applyEvidenceSources(
    fileList.map((file, index) => ({ name: file.name, text: fileTexts[index] })),
    "uploaded"
  );
}

function applyManualDataNotes() {
  const notes = byId("manual-data-notes").value.trim();
  if (!notes) {
    byId("upload-message").textContent =
      language === "zh" ? "请先填写手工资料内容。" : "Please enter manual property notes first.";
    return;
  }
  byId("manual-data-modal").close();
  applyEvidenceSources([{ name: "manual-property-notes.txt", text: notes }], "manual");
  byId("manual-data-notes").value = "";
  scrollToSection("#uploads");
}

function addressSeed(address) {
  return [...address].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function renderMap(data) {
  const map = data.map || {};
  // 旧版 DOM 元素（map-target/map-station/map-shops）已被移除；见 UI 升级
  const mapContainer = document.getElementById("map-container");
  if (mapContainer) {
    // 容器保留，后续 Leaflet 使用
    mapContainer.innerHTML = "<p style='color:#888;padding:1rem;text-align:center'>" +
      (language === "zh" ? "地图加载中…" : "Map loading…") + "</p>";
  }

  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  const lat = data.lat || (data.coordinates?.lat);
  const lon = data.lon || (data.coordinates?.lon);
  if (!lat || !lon) {
    const suburb = data.propertySuburb || "";
    const state = data.propertyState || "VIC";
    if (suburb) fetchNominatimSuburb(suburb, state, data);
    return;
  }
  renderLeafletMap(lat, lon, data);
}

async function fetchNominatimSuburb(suburb, state, data) {
  try {
    const q = encodeURIComponent(`${suburb} ${state}, Australia`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
    if (!res.ok) throw new Error("Nominatim fetch failed");
    const json = await res.json();
    if (json?.length) renderLeafletMap(parseFloat(json[0].lat), parseFloat(json[0].lon), data);
  } catch (err) {
    console.warn("Nominatim lookup:", err.message);
  }
}

function renderLeafletMap(lat, lon, data) {
  if (typeof L === "undefined") return;
  const container = byId("map-container");
  if (!container) return;
  const zoom = data.zoom || 16;
  mapInstance = L.map(container, { center: [lat, lon], zoom, zoomControl: true, attributionControl: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapInstance);
  L.marker([lat, lon]).addTo(mapInstance).bindPopup(data.address || "Property");
  if (data.comparables?.length) {
    data.comparables.slice(0, 5).forEach(comp => {
      if (comp.lat && comp.lon) {
        L.circleMarker([comp.lat, comp.lon], { radius: 6, color: "#c0392b", fillColor: "#e74c3c", fillOpacity: 0.7 })
          .addTo(mapInstance).bindPopup(`$${comp.salePrice?.toLocaleString() || ""}: ${comp.address}`);
      }
    });
  }
  setTimeout(() => mapInstance.invalidateSize(), 300);
}

function renderComparables(rows) {
  const body = byId("comparables-body");
  body.innerHTML = "";
  const visibleRows = unlocked ? rows : rows.slice(0, 2);
  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell, index) => {
      const td = document.createElement("td");
      if (index === 3) {
        // 距离列 — pill 样式
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = localizeValue(cell);
        td.appendChild(pill);
      } else {
        td.textContent = localizeValue(cell);
      }
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function renderValuation(data) {
  currentValuation = {
    ...data,
    propertyState: data.propertyState || stateFromAddress(data.address),
    propertySuburb: data.propertySuburb || suburbFromAddress(data.address)
  };
  currentValuation.builtFormVerification = buildBuiltFormVerification(currentValuation);
  data = currentValuation;
  const planningLabels = getPlanningLabels(data);
  // 地址核验冲突：显示警告消息而非地址
  if (data.addressMismatch) {
    const warnMsg = data.mismatchMessage || (language === "zh" ? "地址核验不一致，请确认" : "Address verification failed");
    byId("property-address").textContent = "⚠ " + warnMsg;
    byId("estimated-value").textContent = "—";
    byId("midpoint").textContent = "—";
    byId("confidence").textContent = "—";
    byId("mobile-property-address").textContent = "⚠ " + warnMsg;
    return;
  }
  byId("property-address").textContent = language === "zh" && data.addressZh ? data.addressZh : data.address;
  byId("estimated-value").textContent = localizeValue(data.value);
  byId("midpoint").textContent = localizeValue(data.midpoint);
  byId("confidence").textContent = localizeValue(data.confidence);
  byId("mobile-property-address").textContent = language === "zh" && data.addressZh ? data.addressZh : data.address;
  byId("mobile-estimated-value").textContent = localizeValue(data.value);
  byId("mobile-midpoint").textContent = localizeValue(data.midpoint);
  byId("mobile-confidence").textContent = localizeValue(data.confidence);
  byId("check-status").textContent = localizeValue(data.status);
  byId("street-rank").textContent = getLocalizedLocation(data, "rank");
  byId("street-type").textContent = getLocalizedLocation(data, "type");
  byId("amenity-access").textContent = getLocalizedLocation(data, "amenity");
  byId("parking-pressure").textContent = getLocalizedLocation(data, "parking");
  document.querySelectorAll(".fundamentals-grid .detail-panel:nth-child(2) dt").forEach((dt, index) => {
    dt.textContent = planningLabels[index] || dt.textContent;
  });
  byId("land-source").textContent = getLocalizedPlanning(data, "landSource");
  byId("granny-potential").textContent = getLocalizedPlanning(data, "granny");
  byId("approval-certainty").textContent = getLocalizedPlanning(data, "approval");
  setList("reasons", getLocalizedArray(data, "reasons"));
  setList("suburb-list", getLocalizedArray(data, "suburb"));
  renderComparables(data.comparables);
  renderMap(data);
  // 显式展示证据来源标记
  const evidenceBadge = byId("evidence-badge-val");
  if (evidenceBadge) {
    const dataStatus = data.customerDataStatus || "unavailable";
    const hasValuation = data.valuation?.value && data.valuation.value !== "Manual review required";
    evidenceBadge.className = "evidence-badge";
    evidenceBadge.style.display = "flex";
    const labels = {
      sufficient: language === "zh" ? "✓ 基于近期市场证据" : "✓ Based on recent market evidence",
      limited: language === "zh" ? "📊 基于有限市场证据的初步估值" : "📊 Preliminary estimate, limited data",
      unavailable: language === "zh" ? "⏳ 该区域公开成交参考数据覆盖有限，地址已记录，后续补充数据后可复核" : "⏳ Comparable sales coverage for this suburb is currently limited. Address recorded for further review."
    };
    evidenceBadge.textContent = labels[dataStatus] || (language === "zh" ? "✗ 暂时无法生成估值" : "✗ Unable to generate valuation");
  }
    renderLoanScenario();
  renderMarketCrosscheck(data);
  renderLockState();
  renderEvidenceReview(language === "zh" && data.evidenceSummaryZh ? data.evidenceSummaryZh : data.evidenceSummary);
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.type === data.type);
  });
}

function setTexts(items) {
  Object.entries(items).forEach(([selector, text]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
  });
}

function setCollectionText(selector, values) {
  document.querySelectorAll(selector).forEach((element, index) => {
    if (values[index]) element.textContent = values[index];
  });
}

function setInvestorDetail(labels) {
  document.querySelectorAll("#investor-detail h3").forEach((heading, index) => {
    heading.textContent = labels.headings[index] || heading.textContent;
  });
  document.querySelectorAll("#investor-detail article").forEach((article, articleIndex) => {
    article.querySelectorAll("li").forEach((li, liIndex) => {
      li.textContent = labels.lists[articleIndex]?.[liIndex] || li.textContent;
    });
  });
}

function applyLanguage() {
  const text = uiText[language];
  const labels = labelSets[language];
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.body.classList.toggle("zh-mode", language === "zh");
  byId("language-toggle").textContent = text.toggle;
  setTexts(text.selectors);
  setCollectionText(".checklist li", labels.checkItems);
  setCollectionText(".chip", labels.chips);
  setCollectionText("th", labels.tableHeaders);
  setCollectionText(".facts dt", labels.factLabels);
  setCollectionText(".theme-card", labels.investorButtons);
  setInvestorDetail(labels.investorDetail);
  byId("suburb").placeholder = language === "zh" ? "例如 Oakleigh" : "Oakleigh";
  byId("address").placeholder = language === "zh" ? "例如 1 Main Street, Oakleigh" : "e.g. 1 Main Street, Oakleigh";
  byId("lead-email").placeholder = language === "zh" ? "you@example.com" : "you@example.com";
  byId("lead-name").placeholder = language === "zh" ? "你的姓名" : "Your name";
  byId("lead-phone").placeholder = language === "zh" ? "下载 PDF 时需要" : "For PDF download";
  byId("manual-data-notes").placeholder =
    language === "zh"
      ? "例如：产权确认土地面积，厨房翻新，街道安静较宽，没有明显地役权。"
      : "Example: title confirms land size, renovated kitchen, quiet wide street, no visible easement.";
  // 免责声明语言切换
  document.querySelectorAll('.footer-disclaimer').forEach(el => {
    el.style.display = el.getAttribute('lang') === (language === 'zh' ? 'zh' : 'en') ? '' : 'none';
  });
  renderValuation(currentValuation);
  if (activeInvestorTheme) renderInvestorTheme(activeInvestorTheme);
}

function renderLoanScenario() {
  const value = currentValuation.midpointValue;
  const maxLoan = value * selectedLvr;
  const equity = value - maxLoan;
  byId("selected-lvr").textContent = `${Math.round(selectedLvr * 100)}%`;
  byId("max-loan").textContent = formatMoney(maxLoan);
  byId("required-equity").textContent = formatMoney(equity);
  document.querySelectorAll(".lvr").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.lvr) === selectedLvr);
  });
}

function renderLockState() {
  const locked = !unlocked;
  byId("locked-strip").classList.toggle("hidden", !locked);
  byId("investor-lock").classList.toggle("hidden", !locked);
  byId("investor-detail").classList.toggle("hidden", locked);
  byId("report-guide").classList.toggle("hidden", locked);
  document.querySelectorAll(".detail-panel").forEach((panel) => {
    panel.classList.toggle("unlocked", !locked);
  });
}

function scrollToSection(selector) {
  const target = document.querySelector(selector);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showReportGuideModal() {
  const modal = byId("report-guide-modal");
  if (typeof modal.showModal === "function" && !modal.open) modal.showModal();
}

function showPdfRequirementsModal() {
  const modal = byId("pdf-requirements-modal");
  if (typeof modal.showModal === "function" && !modal.open) modal.showModal();
}

function renderInvestorTheme(themeKey) {
  const theme = investorThemes[language][themeKey];
  if (!theme) return;
  activeInvestorTheme = themeKey;
  byId("investor-theme-title").textContent = theme.title;
  byId("investor-theme-copy").textContent = theme.copy;
  setList("investor-theme-list", [...theme.points, theme.consult]);
  const listItems = byId("investor-theme-list").querySelectorAll("li");
  listItems[listItems.length - 1]?.classList.add("consult-line");
  byId("investor-theme-detail").classList.remove("hidden");
  document.querySelectorAll(".theme-card").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === themeKey);
  });
}

function leadNotificationKey(lead) {
  return `${lead.email.toLowerCase()}::${lead.address.toLowerCase()}::${lead.eventType}`;
}

function hasLeadNotificationBeenSent(lead) {
  const key = leadNotificationKey(lead);
  if (sentLeadNotificationKeys.has(key)) return true;
  try {
    return localStorage.getItem(`aushomevalue-notified::${key}`) === "1";
  } catch {
    return false;
  }
}

function markLeadNotificationSent(lead) {
  const key = leadNotificationKey(lead);
  sentLeadNotificationKeys.add(key);
  try {
    localStorage.setItem(`aushomevalue-notified::${key}`, "1");
  } catch {
    // Ignore localStorage failures; in-memory tracking still prevents repeats in the same session.
  }
}

function formatVisitorRegion(leadRecord = {}) {
  return [leadRecord.ip_city, leadRecord.ip_region, leadRecord.ip_country].filter(Boolean).join(", ") || "Unavailable";
}

function sanitizePdfText(value) {
  return String(value ?? "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value) {
  return sanitizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapPdfLine(text, maxChars = 88) {
  const words = sanitizePdfText(text).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function addReportSection(lines, title, items = []) {
  lines.push({ text: title, size: 14, bold: true, gapBefore: 12, gapAfter: 4 });
  items.forEach((item) => {
    if (Array.isArray(item)) {
      const [label, value] = item;
      lines.push({ text: `${label}: ${value}`, size: 10.5 });
    } else {
      lines.push({ text: item, size: 10.5 });
    }
  });
}

function buildDetailedReportLines() {
  const evidence = currentValuation.evidenceSummary || uploadedEvidenceSummary;
  const builtForm = currentValuation.builtFormVerification || buildBuiltFormVerification(currentValuation);
  const generatedAt = new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" });
  const recipientName = byId("lead-name").value.trim() || "Not supplied";
  const selectedPropertyType = document.querySelector(".chip.active")?.dataset.type || currentValuation.type;
  const loanValue = Number.isFinite(currentValuation.midpointValue)
    ? formatMoney(currentValuation.midpointValue * selectedLvr)
    : "Manual review";
  const equityValue = Number.isFinite(currentValuation.midpointValue)
    ? formatMoney(currentValuation.midpointValue * (1 - selectedLvr))
    : "Manual review";
  const comparableLines = currentValuation.comparables.length
    ? currentValuation.comparables.map((row) => `${row[0]} | ${row[1]} | ${row[2]} | ${row[3]}`)
    : ["No relevant comparable evidence has been attached yet. The estimate should wait for public-data collection or manual review."];
  const welcomeName = recipientName === "Not supplied" ? "there" : recipientName;

  const investorThemeLines = Object.values(investorThemes.en).flatMap((theme) => [
    `${theme.title}: ${theme.copy}`,
    ...theme.points.map((point) => `- ${point}`),
    `- ${theme.consult}`
  ]);
  const lines = [
    { text: "AusHomeValue Property Valuation Report", size: 20, bold: true, gapAfter: 4 },
    { text: "A practical property note prepared from your website search, uploaded evidence and valuation model checks.", size: 10.5, gapAfter: 12 }
  ];

  addReportSection(lines, "Welcome", [
    `Dear ${welcomeName},`,
    "Thank you for visiting AusHomeValue and taking the time to explore this property with us. Our purpose is simple: to make property research, investment and finance feel clearer, more structured and more useful before you make a decision.",
    "A property is never just one number. It is a combination of recent sales evidence, street quality, land and title details, planning potential, local fundamentals, lending context and the information you can provide from the ground. This report brings those items together in one place so you can see what supports the estimate, what still needs checking and what may change the result.",
    "If anything in this report looks incomplete, unclear or different from what you know about the property, we welcome your feedback. Extra documents, photos, planning notes, agent feedback or local observations can all help us improve the analysis."
  ]);

  addReportSection(lines, "1. Executive valuation summary", [
    ["Generated at", `${generatedAt} Melbourne time`],
    ["Property address", currentValuation.address],
    ["State / territory", currentValuation.propertyState || "Not supplied"],
    ["Suburb", currentValuation.propertySuburb || "Not supplied"],
    ["Property type", selectedPropertyType],
    ["Estimated value range", currentValuation.value],
    ["Estimated midpoint", currentValuation.midpoint],
    ["Confidence", currentValuation.confidence],
    ["Selected LVR scenario", `${Math.round(selectedLvr * 100)}%`],
    ["Indicative maximum loan", loanValue],
    ["Required equity before costs", equityValue]
  ]);

  addReportSection(lines, "2. How to read this estimate", [
    "- Treat this report as a practical starting point for property research, not a formal valuation.",
    "- The estimate is easier to rely on when recent comparable sales, property condition, title information and planning context all point in the same direction.",
    "- Where information is missing or uncertain, the report highlights what should be checked next instead of overstating certainty.",
    "- Additional title documents, photos, floorplans, leases or inspection notes can help refine the review."
  ]);

  addReportSection(lines, "3. Valuation rationale", currentValuation.reasons.map((reason) => `- ${reason}`));
  addReportSection(
    lines,
    "4. Uploaded evidence review",
    evidence.length
      ? evidence.map((item) => `- ${item}`)
      : ["- No uploaded evidence has been applied. Title, Section 32, planning notes, current photos and street checks would improve confidence."]
  );

  addReportSection(lines, "5. Comparable sales and adjustment notes", [
    ...comparableLines.map((item) => `- ${item}`),
    "- Adjustment note: recent same-type sales are compared against land size, building profile, condition, street quality, location convenience and settlement recency.",
    "- If the subject property has stronger evidence than a comparable, the model may support an uplift. If title, planning or condition remains unclear, confidence is held back."
  ]);

  addReportSection(lines, "6. Current property form check", [
    ["Current form used", builtForm.currentForm],
    ["Important note", builtForm.summary],
    ["Older record risk", builtForm.legacyRisk],
    ["Recommended confirmation", builtForm.action]
  ]);

  addReportSection(lines, "7. Micro-location and street checks", [
    ["Street rank", currentValuation.location.rank],
    ["Street type", currentValuation.location.type],
    ["Amenity access", currentValuation.location.amenity],
    ["Parking pressure", currentValuation.location.parking],
    ["Street length / access logic", "Review access to connecting roads, turning direction, local traffic flow and whether the street feels like a quiet residential pocket or a through-road."],
    ["Street trees / presentation", "Tree canopy, frontage rhythm and neighbouring presentation are treated as qualitative micro-location signals."]
  ]);

  addReportSection(lines, "8. Suburb fundamentals", [
    ...currentValuation.suburb.map((item) => `- ${item}`),
    "- Suburb review considers household demand, access to employment, schools, transport, retail, medical and comparison suburbs.",
    "- ABS Census, QuickStats, DataPacks and SEIFA should be used for structured public suburb research, including income, employment, occupation, household mix, dwelling mix, owner/renter ratio and socio-economic indexes.",
    "- ABS data explains suburb fundamentals and demand quality; it should support, not replace, recent comparable sales as the price anchor."
  ]);

  const planningLabels = currentValuation.planningLabels?.en || ["Land source", "Granny flat potential", "Approval certainty"];
  addReportSection(lines, "9. Planning, title and property-specific potential", [
    [planningLabels[0], currentValuation.planning.landSource],
    [planningLabels[1], currentValuation.planning.granny],
    [planningLabels[2], currentValuation.planning.approval],
    ["Council planning check", "A production workflow should cross-check zoning, overlays, covenants, easements, neighbourhood character controls and nearby built form."],
    ["Neighbouring height / built form", "Nearby property height and development pattern can support or constrain planning potential assumptions."],
    ["Manual title requirement", "Title search and title plan remain authoritative where portal land size or property configuration is inconsistent."]
  ]);

  addReportSection(lines, "10. Loan / LVR scenario", [
    ["Selected LVR", `${Math.round(selectedLvr * 100)}%`],
    ["Indicative maximum loan", loanValue],
    ["Required equity before costs", equityValue],
    "This is not a loan approval or borrowing capacity assessment. Actual lending depends on lender policy, income, expenses, credit history and full application review."
  ]);

  addReportSection(lines, "11. Investor Hub themes", investorThemeLines);

  addReportSection(lines, "12. How to use this report", [
    "- Start with the executive valuation summary, then read the comparable sales and uploaded evidence review to understand what supports the range.",
    "- Treat the current property form, micro-location and planning sections as a checklist for what should be confirmed before making a decision.",
    "- If you have additional documents, photos, agent feedback, lease details or planning correspondence, send them through and the case can be reviewed again.",
    "- If you want to discuss lending, investment finance, private credit or next steps, contact AusHomeValue by WeChat QR code or email."
  ]);

  addReportSection(lines, "13. Missing checks and next actions", [
    "- Confirm title search, title plan and Section 32 with authoritative documents.",
    "- Review current property condition, renovation quality and visible defects.",
    "- Confirm planning overlays, easements, covenants and council constraints.",
    "- Use recent settled sales within the suburb and same property type to update the comparable anchor.",
    "- Contact AusHomeValue by WeChat QR code or email info@aushomevalue.com.au for a case review."
  ]);

  addReportSection(lines, "Conclusion", [
    "Thank you again for using AusHomeValue. We hope this report gives you a clearer starting point, not just a price range, but a map of the evidence behind it.",
    "If you have questions, corrections or extra information, please contact us. Property analysis improves when the public data, professional judgement and client-supplied evidence are brought together carefully.",
    "Contact email: info@aushomevalue.com.au",
    "WeChat / QR code: please scan the AusHomeValue WeChat QR code shown in the contact section or marketing material.",
    "For property, lending, investment finance or private credit questions, please send the address and any supporting material so we can review the case properly."
  ]);

  addReportSection(lines, "Important disclaimer", [
    "This preliminary report is based on public information, available comparable evidence and client-supplied material where provided.",
    "It is not a formal valuation, credit assessment, financial product advice or legal/planning advice.",
    "Any investment, lending or acquisition decision should be reviewed with appropriately licensed professionals."
  ]);

  return lines;
}

function createPdfDocument(lineItems) {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 48;
  const marginTop = 58;
  const marginBottom = 52;
  const contentWidthChars = 92;
  const pages = [];
  let page = [];
  let y = marginTop;

  function newPage() {
    if (page.length) pages.push(page);
    page = [];
    y = marginTop;
  }

  lineItems.forEach((item) => {
    const size = item.size || 10.5;
    const lineHeight = size + 4;
    const gapBefore = item.gapBefore || 0;
    const gapAfter = item.gapAfter || 0;
    const wrapped = wrapPdfLine(item.text, item.size >= 14 ? 62 : contentWidthChars);
    const needed = gapBefore + wrapped.length * lineHeight + gapAfter;
    if (y + needed > pageHeight - marginBottom) newPage();
    y += gapBefore;
    wrapped.forEach((text) => {
      page.push({ text, x: marginX, y, size, bold: item.bold });
      y += lineHeight;
    });
    y += gapAfter;
  });
  if (page.length) pages.push(page);

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const fontRegular = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageRefs = [];

  pages.forEach((items, pageIndex) => {
    const commands = [
      "BT",
      `/F2 9 Tf 48 ${pageHeight - 34} Td (${escapePdfText("AusHomeValue | Property Valuation Report")}) Tj`,
      `/F1 8 Tf 410 ${pageHeight - 34} Td (${escapePdfText(`Page ${pageIndex + 1} of ${pages.length}`)}) Tj`,
      "ET"
    ];
    items.forEach((item) => {
      commands.push("BT");
      commands.push(`/${item.bold ? "F2" : "F1"} ${item.size} Tf`);
      commands.push(`${item.x} ${pageHeight - item.y} Td`);
      commands.push(`(${escapePdfText(item.text)}) Tj`);
      commands.push("ET");
    });
    commands.push("BT");
    commands.push(`/F1 8 Tf 48 28 Td (${escapePdfText("Generated by AusHomeValue. For general research only.")}) Tj`);
    commands.push("ET");
    const stream = commands.join("\n");
    const contentRef = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageRef = addObject(`<< /Type /Page /Parent __PAGES__ /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentRef} 0 R >>`);
    pageRefs.push(pageRef);
  });

  const pagesRef = addObject(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`);
  const catalogRef = addObject(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  pageRefs.forEach((ref) => {
    objects[ref - 1] = objects[ref - 1].replace("__PAGES__", `${pagesRef} 0 R`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

async function sendLeadNotification(lead) {
  const response = await fetch("https://formsubmit.co/ajax/info@aushomevalue.com.au", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      _subject: `New AusHomeValue lead: ${lead.address}`,
      _template: "table",
      name: lead.name,
      email: lead.email,
      phone: lead.phone || "Not supplied",
      property_address: lead.address,
      property_suburb: lead.suburb || "Not supplied",
      property_state: lead.propertyState || "Not supplied",
      estimated_value: lead.value,
      confidence: lead.confidence,
      activity: lead.eventType === "pdf_download" ? "PDF download" : "Report unlock",
      visitor_region: lead.visitorRegion || "Unavailable",
      lead_score: lead.leadScore || "Pending",
      priority: lead.priority || "Pending",
      contact_consent: lead.consent ? "Yes" : "No",
      pdf_download: lead.pdfDownload ? "Yes" : "No",
      submitted_at: lead.createdAt
    })
  });

  if (!response.ok) throw new Error("Lead notification failed");
}

async function saveLeadToDatabase(lead) {
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      contactConsent: lead.consent,
      pdfDownload: lead.pdfDownload,
      propertyAddress: lead.address,
      propertySuburb: lead.suburb,
      propertyState: lead.propertyState,
      propertyType: lead.propertyType,
      estimatedValue: lead.value,
      midpointValue: lead.midpointValue,
      confidence: lead.confidence,
      selectedLvr: lead.selectedLvr,
      language: lead.language,
      eventType: lead.eventType,
      analysis: lead.analysis
    })
  });

  if (!response.ok) throw new Error("Lead database save failed");
  return response.json();
}

async function saveLead({ pdfDownload = false } = {}) {
  const email = byId("lead-email").value.trim();
  const name = byId("lead-name").value.trim();
  const phone = byId("lead-phone").value.trim();
  const consent = byId("lead-consent").checked;
  const message = byId("lead-message");

  if (!email || !name) {
    message.textContent =
      language === "zh" ? "解锁完整报告需要填写邮箱和姓名。" : "Email and name are required to unlock the full report.";
    return false;
  }

  if (pdfDownload && (!phone || !consent)) {
    message.textContent =
      language === "zh"
        ? "下载 PDF 前需要填写电话并勾选联系授权。"
        : "Phone number and contact consent are required before PDF download.";
    return false;
  }

  const lead = {
    email,
    name,
    phone,
    consent,
    pdfDownload,
    address: currentValuation.address,
    suburb: currentValuation.propertySuburb || getEnteredSuburb(),
    propertyState: currentValuation.propertyState || getSelectedState(),
    value: currentValuation.value,
    midpointValue: currentValuation.midpointValue,
    confidence: currentValuation.confidence,
    propertyType: document.querySelector(".chip.active")?.dataset.type || currentValuation.type,
    selectedLvr: Math.round(selectedLvr * 100),
    language,
    eventType: pdfDownload ? "pdf_download" : "report_unlock",
    analysis: {
      reasons: currentValuation.reasons,
      comparables: currentValuation.comparables,
      location: currentValuation.location,
      suburb: currentValuation.suburb,
      propertySuburb: currentValuation.propertySuburb || getEnteredSuburb(),
      propertyState: currentValuation.propertyState || getSelectedState(),
      planning: currentValuation.planning,
      builtFormVerification: currentValuation.builtFormVerification || buildBuiltFormVerification(currentValuation),
      evidenceSummary: currentValuation.evidenceSummary || uploadedEvidenceSummary
    },
    createdAt: new Date().toISOString()
  };

  let stored = false;
  let notified = false;
  let savedLead = null;
  try {
    const databaseResult = await saveLeadToDatabase(lead);
    savedLead = databaseResult.lead || null;
    lead.visitorRegion = formatVisitorRegion(savedLead);
    lead.leadScore = savedLead?.lead_score;
    lead.priority = savedLead?.priority;
    lead.shouldSendNotification = databaseResult.notification?.should_send !== false;
    stored = true;
  } catch (error) {
    console.error(error);
  }

  try {
    if (stored && lead.shouldSendNotification && !hasLeadNotificationBeenSent(lead)) {
      await sendLeadNotification(lead);
      markLeadNotificationSent(lead);
      notified = true;
    }
  } catch (error) {
    console.error(error);
  }

  // Grant opportunity access on any successful lead submission
  if (stored) oppGrantConsent();

  message.textContent = stored
    ? pdfDownload
      ? language === "zh"
        ? "PDF 信息已记录，客户资料已保存。"
        : "PDF details captured. Customer record saved."
      : language === "zh"
        ? "完整报告已解锁，客户资料已保存。"
        : "Full report unlocked. Customer record saved."
    : language === "zh"
      ? "暂时无法保存客户资料，请稍后再试。"
      : "Customer details could not be saved. Please try again later.";

  if (stored && lead.shouldSendNotification && !notified && !hasLeadNotificationBeenSent(lead)) {
    console.warn("Customer record saved, but lead notification email failed.");
  }
  return stored;
}

async function downloadDemoReport() {
  const phone = byId("lead-phone").value.trim();
  const consent = byId("lead-consent").checked;
  if (!phone || !consent) {
    const message = byId("lead-message");
    message.textContent =
      language === "zh"
        ? "下载 PDF 前需要填写电话并勾选联系授权。"
        : "Phone number and contact consent are required before PDF download.";
    showPdfRequirementsModal();
    return;
  }
  if (!(await saveLead({ pdfDownload: true }))) return;
  const blob = createPdfDocument(buildDetailedReportLines());
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "aushomevalue-property-valuation-report.pdf";
  link.click();
  URL.revokeObjectURL(url);
}

byId("start-valuation").addEventListener("click", async () => {
  const button = byId("start-valuation");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = language === "zh" ? "正在核验公开数据…" : "Checking public evidence…";

  const selectedType = document.querySelector(".chip.active")?.dataset.type || "House";
  const { canonicalAddress, effectiveSuburb } = buildEnteredAddress();
  const selectedState = getSelectedState();

  const valuation = await runAddressValuation(
    canonicalAddress || byId("address").value,
    selectedType,
    selectedState,
    effectiveSuburb
  );
  renderValuation(valuation);

  button.disabled = false;
  button.textContent = originalText;

  // Navigate to valuation section on desktop
  window.location.hash = "valuation";
  // Mobile: scroll to results
  if (window.matchMedia("(max-width: 680px)").matches) {
    setTimeout(() => scrollToSection(".mobile-value-card"), 100);
  }
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((item) => item.classList.remove("active"));
    chip.classList.add("active");
  });
});

document.querySelectorAll(".lvr").forEach((button) => {
  button.addEventListener("click", () => {
    selectedLvr = Number(button.dataset.lvr);
    renderLoanScenario();
  });
});



byId("language-toggle").addEventListener("click", () => {
  language = language === "en" ? "zh" : "en";
  applyLanguage();
});

const unlockBtn = byId("unlock-report");
if (unlockBtn) {
  unlockBtn.addEventListener("click", async () => {
    if (!(await saveLead())) return;
    unlocked = true;
    renderLockState();
    renderComparables(currentValuation.comparables);
    showReportGuideModal();
  });
}

const mobileBtn = byId("mobile-report-cta");
if (mobileBtn) {
  mobileBtn.addEventListener("click", () => {
    if (unlocked) {
      scrollToSection("#comparables");
      return;
    }
    scrollToSection(".lead-panel");
    const leadEl = byId("lead-email");
    if (leadEl) leadEl.focus({ preventScroll: true });
  });
}

byId("upload-evidence").addEventListener("click", () => {
  byId("evidence-files").click();
});

byId("evidence-files").addEventListener("change", async (event) => {
  await applyEvidenceFiles(event.target.files);
});

byId("download-pdf").addEventListener("click", downloadDemoReport);

byId("enter-manual-data").addEventListener("click", () => {
  const modal = byId("manual-data-modal");
  if (typeof modal.showModal === "function" && !modal.open) modal.showModal();
  byId("manual-data-notes").focus();
});

byId("manual-data-save").addEventListener("click", applyManualDataNotes);

byId("manual-data-close").addEventListener("click", () => {
  byId("manual-data-modal").close();
});

document.querySelectorAll(".theme-card").forEach((button) => {
  button.addEventListener("click", () => {
    if (!unlocked) return;
    renderInvestorTheme(button.dataset.theme);
  });
});

// Research card theme buttons — no registration gate
const themeData = {
  privateCredit: {
    title: { en: "Private credit", zh: "私域信用" },
    copy: { en: "Short-term property-backed lending can be assessed through loan-to-value, exit strategy, borrower strength and security position.", zh: "短期房产抵押贷款的风险评估主要依据贷款价值比、退出策略、借款人资质和担保结构。" },
    points: { en: ["Indicative LVR and valuation buffer", "Security ranking and repayment source", "Documentation required before any opportunity review"], zh: ["指示性LVR和估值缓冲", "担保优先级和还款来源", "机会审核前需提交材料"] }
  },
  developmentFinance: {
    title: { en: "Development finance", zh: "开发融资" },
    copy: { en: "Staged property development funding requires assessment of feasibility, pre-sales, builder track record and exit yield.", zh: "阶段性房地产开发融资需评估可行性、预售情况、建筑商资质和退出收益率。" },
    points: { en: ["Feasibility study and financial modelling", "Pre-sales percentage and buyer quality", "Builder experience and delivery track record"], zh: ["可行性研究和财务模型", "预售比例和买家质量", "建筑商经验和交付记录"] }
  },
  incomeProperty: {
    title: { en: "Income property", zh: "收益型地产" },
    copy: { en: "Yield-focused property investment evaluated through rental income, expense ratios, tenant quality and hold period.", zh: "以租金收益为核心的房产投资，评估租金收入、费用比率、租户质量和持有周期。" },
    points: { en: ["Net rental yield and gross rent multiplier", "Tenant quality and lease terms", "Capital expenditure reserve and hold period"], zh: ["净租金收益率和总租金倍数", "租户质量和租约条款", "资本支出预留和持有周期"] }
  }
};
function renderResearchTheme(themeKey) {
  const data = themeData[themeKey];
  if (!data) return;
  const lang = language === "zh" ? "zh" : "en";
  byId("research-investor-title").textContent = data.title[lang];
  byId("research-investor-copy").textContent = data.copy[lang];
  const list = byId("research-investor-list");
  list.innerHTML = "";
  data.points[lang].forEach(p => { const li = document.createElement("li"); li.textContent = p; list.appendChild(li); });
  byId("research-investor-detail").classList.remove("hidden");
}
document.querySelectorAll(".research-link-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    renderResearchTheme(btn.dataset.theme);
  });
});

document.querySelectorAll(".detail-panel, .detail-trigger").forEach((element) => {
  element.addEventListener("click", () => {
    if (unlocked) return;
    const detail = element.dataset.detail || "full report detail";
    byId("unlock-title").textContent =
      language === "zh" ? "注册后可查看该详细内容。" : `Register to view ${detail}.`;
    byId("unlock-modal").showModal();
  });
});

byId("modal-close").addEventListener("click", () => {
  byId("unlock-modal").close();
});

byId("modal-register").addEventListener("click", () => {
  byId("unlock-modal").close();
  byId("lead-email").focus();
  document.querySelector(".lead-panel").scrollIntoView({ behavior: "smooth", block: "start" });
});

byId("guide-comparables").addEventListener("click", () => {
  byId("report-guide-modal").close();
  scrollToSection("#comparables");
});

byId("guide-location").addEventListener("click", () => {
  byId("report-guide-modal").close();
  scrollToSection("#location");
});

byId("guide-close").addEventListener("click", () => {
  byId("report-guide-modal").close();
});

byId("pdf-fill-details").addEventListener("click", () => {
  byId("pdf-requirements-modal").close();
  scrollToSection(".lead-panel");
  byId("lead-phone").focus({ preventScroll: true });
});

byId("pdf-close").addEventListener("click", () => {
  byId("pdf-requirements-modal").close();
});

byId("open-qr-modal").addEventListener("click", () => {
  const modal = byId("qr-modal");
  if (typeof modal.showModal === "function" && !modal.open) modal.showModal();
});

byId("qr-close").addEventListener("click", () => {
  byId("qr-modal").close();
});

// 确保初始地址输入栏为空（防止浏览器 autofill/storage 污染）
document.addEventListener("DOMContentLoaded", () => {
  byId("address").value = "";
});

applyLanguage();

/* ── Home Page Top Opportunities Snippet (live from API) ── */
async function loadHomeOpportunities() {
  const el = document.getElementById('home-snippet');
  if (!el) return;
  try {
    const res = await fetch('/api/opportunity?maxResults=50');
    const data = await res.json();
    if (!data.ok || !data.opportunities || data.opportunities.length === 0) return;

    const all = data.opportunities;

    // Sort into categories by opportunityType
    const byType = {};
    all.forEach(o => {
      const t = o.opportunityType || 'Balanced';
      if (!byType[t]) byType[t] = [];
      byType[t].push(o);
    });

    // Pick best 3 from each category
    const categories = {
      'Smart Buy':    { label: 'Top Value',     color: '#0d6b57', desc: o => `${o.opportunityType} · Improving fundamentals` },
      'Growth':       { label: 'Top Growth',    color: '#065f46', desc: o => `Strong growth indicators` },
      'School Zone':  { label: 'Top School',    color: '#1e40af', desc: o => `School score ${(o.schoolScore || 0).toFixed(0)}/100` },
      'Balanced':     { label: 'Top Balanced',  color: '#0d6b57', desc: o => `${o.opportunityType} · ${(o.growth3y||0) > 20 ? 'High Growth' : 'Developing'}` }
    };

    let html = `<div id="top-opportunities" style="max-width:960px;margin:40px auto;padding:0 20px;">
  <h2>Top Opportunities</h2>
  <p style="color:#66736d;margin-bottom:20px;">Data-driven rankings refreshed nightly. Scores based on growth, school quality, rental yield, vacancy and undervaluation.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;">`;

    for (const [type, cfg] of Object.entries(categories)) {
      const items = (byType[type] || []).slice(0, 3);
      if (items.length === 0) continue;
      html += `<div><h3 style="color:${cfg.color};">${cfg.label}</h3>`;
      items.forEach(o => {
        const slug = o.suburb.toLowerCase().replace(/\s+/g, '-') + '-' + (o.state||'vic').toLowerCase();
        html += `<div><a href="/suburb/${slug}.html">${o.suburb}</a> <span style="background:${cfg.color};color:white;border-radius:20px;padding:2px 8px;font-size:0.8rem;">${o.opportunityScore}</span> <span style="color:#66736d;font-size:0.8rem;">${cfg.desc(o)}</span></div>`;
      });
      html += `</div>`;
    }

    html += `
  </div>
  <div style="text-align:center;margin-top:24px;"><a href="/opportunities/" style="background:#0d6b57;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View all opportunities →</a></div>
</div>`;

    el.innerHTML = html;
  } catch(e) {
    // Non-critical — fallback silently
  }
}

// Load on page ready
setTimeout(loadHomeOpportunities, 100);

/* ── Opportunity Scan (Top Opportunities page) — gate behind registration ── */
const oppSearchBtn = document.getElementById("opp-search-btn");
const oppResults = document.getElementById("opp-results");
const oppLoading = document.getElementById("opp-loading");

/** Check whether this device has registered for opportunity results */
function oppHasConsent() {
  if (window.opportunityGate && typeof window.opportunityGate.isUnlocked === "function") {
    return window.opportunityGate.isUnlocked();
  }
  try { return localStorage.getItem("lead.opportunity_unlocked") === "true"; } catch(e) { return false; }
}

async function runOpportunityScan() {
  // Use the new opportunity gate: full name+email+phone+consent registration
  if (window.opportunityGate && !oppHasConsent()) {
    oppLoading.classList.add("hidden");
    const strategy = document.getElementById("opp-strategy").value;
    const ptype = document.getElementById("opp-type").value;
    const minP = document.getElementById("opp-min-price").value;
    const maxP = document.getElementById("opp-max-price").value;
    const stateEl = document.getElementById("opp-state");
    const state = stateEl ? stateEl.value : "vic";
    const waitForGate = await window.opportunityGate.run({
      language: language,
      strategy: strategy,
      propertyType: ptype || null,
      budgetMin: minP && Number(minP) > 0 ? Number(minP) : null,
      budgetMax: maxP && Number(maxP) < 99999999 ? Number(maxP) : null,
      state: state
    }, async function () {
      await runOpportunityScan();
    });
    if (waitForGate) return; // gate was shown
  }

  const strategy = document.getElementById("opp-strategy").value;
  const ptype = document.getElementById("opp-type").value;
  const minP = document.getElementById("opp-min-price").value;
  const maxP = document.getElementById("opp-max-price").value;
  const params = new URLSearchParams({ strategy, maxResults: "50" });
  if (ptype) params.set("propertyType", ptype);
  if (minP && Number(minP) > 0) params.set("minPrice", minP);
  if (maxP && Number(maxP) < 99999999) params.set("maxPrice", maxP);
  oppLoading.classList.remove("hidden");
  oppLoading.textContent = "Ranking suburbs...";
  oppSearchBtn.disabled = true;
  oppResults.innerHTML = "";
  const snippetEl = document.getElementById('home-snippet');
  if (snippetEl) snippetEl.style.display = 'none';
  const coldTimer = setTimeout(() => {
    oppLoading.textContent = "Still scanning — this may take a moment on first run.";
  }, 15000);
  try {
    const res = await fetch("/api/opportunity?" + params.toString());
    const data = await res.json();
    clearTimeout(coldTimer);
    oppLoading.classList.add("hidden");
    oppSearchBtn.disabled = false;
    if (!data.ok || !data.opportunities || data.opportunities.length === 0) {
      oppResults.innerHTML = '<div class="opp-placeholder"><p>No opportunities found. Try adjusting the filters.</p></div>';
      return;
    }
    let html = `<p class="opp-meta">Found ${data.meta.totalFound} suburbs &middot; Strategy: ${data.meta.strategy}</p>`;
    data.opportunities.forEach(o => {
      const score = o.opportunityScore;
      const hp = o.medianHousePrice ? `$${(o.medianHousePrice / 1000).toFixed(0)}K` : 'N/A';
      const g3 = o.growth3y != null ? `${o.growth3y.toFixed(1)}%` : '-';
      const sch = o.schoolScore != null ? o.schoolScore.toFixed(1) : '-';
      const vac = o.vacancyRate != null ? `${o.vacancyRate.toFixed(1)}%` : '-';
      const otype = o.opportunityType || 'Balanced';
      const suburbSlug = o.suburb.toLowerCase().replace(/\s+/g, '-') + '-' + (o.state||'vic').toLowerCase();
      html += `
        <div class="opp-result-card">
          <div class="opp-result-main">
            <div class="address"><a href="/suburb/${suburbSlug}.html">${o.suburb}</a></div>
            <div class="detail">${otype} &middot; Median $${hp}</div>
            <div class="opp-scores">
              <span>Growth: ${g3}</span>
              <span>School: ${sch}</span>
              <span>Vacancy: ${vac}</span>
            </div>
          </div>
          <div class="opp-score-badge">${score}</div>
        </div>`;
    });
    oppResults.innerHTML = html;
  } catch (err) {
    clearTimeout(coldTimer);
    oppLoading.classList.add("hidden");
    oppSearchBtn.disabled = false;
    oppResults.innerHTML = `<div class="opp-error">Failed to load opportunities: ${err.message}</div>`;
  }
}

if (oppSearchBtn) {
  oppSearchBtn.addEventListener("click", runOpportunityScan);
}

document.addEventListener("hashchange", () => {
  if (window.location.hash === "#opportunities" && oppResults && oppResults.querySelector(".opp-placeholder")) {
    setTimeout(runOpportunityScan, 300);
  }
});
