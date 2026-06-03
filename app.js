const valuations = [
  {
    aliases: ["46 bishop st oakleigh", "46 bishop street oakleigh"],
    address: "46 Bishop Street, Oakleigh VIC 3166",
    type: "House",
    value: "$1.90m - $2.09m",
    midpoint: "$1.995m",
    midpointValue: 1995000,
    confidence: "Medium",
    status: "Medium",
    reasons: [
      "Premium Oakleigh family house profile.",
      "687 sqm land, pending title confirmation.",
      "Strong access to Oakleigh Station and Eaton Mall.",
      "Current condition and easements need confirmation."
    ],
    reasonsZh: [
      "Oakleigh 优质家庭型独立屋。",
      "约 687 平方米土地，仍需 title 确认。",
      "靠近 Oakleigh Station 和 Eaton Mall，生活便利性强。",
      "当前房况和 easement 仍需确认。"
    ],
    comparables: [
      ["33 Tamar Grove", "$1.80m", "Apr 2026", "539 sqm", "3 / 2 / 1", "Good"],
      ["16 Lincoln Avenue", "$1.56m", "Mar 2026", "Unknown", "4 / 2 / 2", "Medium"],
      ["140 Atherton Road", "$1.571m", "Dec 2025", "628 sqm", "4 / 3 / 2", "Medium"]
    ],
    location: {
      rank: "Top 25%, estimated",
      type: "Quiet residential street",
      amenity: "Strong",
      parking: "To be checked",
      rankZh: "区内前 25%，估算",
      typeZh: "安静住宅街",
      amenityZh: "强",
      parkingZh: "待检查"
    },
    suburb: [
      "Strong transport and retail access.",
      "Demand support from Chadstone, Monash University and Monash Medical.",
      "Comparison set: Hughesdale, Huntingdale, Clayton, Murrumbeena."
    ],
    suburbZh: [
      "交通和零售配套强。",
      "Chadstone、Monash University 和 Monash Medical 带来需求支撑。",
      "对比区域包括 Hughesdale、Huntingdale、Clayton、Murrumbeena。"
    ],
    planning: {
      landSource: "Portal, not title-confirmed",
      granny: "Medium, subject to controls",
      approval: "Not approved",
      landSourceZh: "门户网站来源，未由 title 确认",
      grannyZh: "中等，受规划限制影响",
      approvalZh: "未获批准"
    }
  },
  {
    aliases: ["9 mcintosh st oakleigh", "9 mcintosh street oakleigh"],
    address: "9 McIntosh Street, Oakleigh VIC 3166",
    type: "House",
    value: "$1.14m - $1.36m",
    midpoint: "$1.25m",
    midpointValue: 1250000,
    confidence: "Low-Medium",
    status: "Low-Medium",
    reasons: [
      "3 / 2 / 2 house with strong rental support.",
      "530 sqm land is portal-provided, not title-confirmed.",
      "Related addresses 1/9 and 2/9 require title review.",
      "Quiet and convenient Oakleigh street."
    ],
    reasonsZh: [
      "3房2卫2车位，租金支撑较强。",
      "530 平方米土地来自门户网站，未由 title 确认。",
      "相关地址 1/9 和 2/9 需要 title 审查。",
      "Oakleigh 安静且便利的街道。"
    ],
    comparables: [
      ["170 Atherton Road", "$1.1555m", "Mar 2026", "466 sqm", "3 / 2 / 2", "Good"],
      ["191 Huntingdale Road", "$1.245m", "Mar 2026", "544 sqm", "3 / 2 / 3", "Good"],
      ["2 Norfolk Avenue", "$1.2925m", "Mar 2026", "352 sqm", "3 / 2 / 3", "Medium"]
    ],
    location: {
      rank: "Top 25% to Middle 50%, estimated",
      type: "Quiet mixed house / villa street",
      amenity: "Strong",
      parking: "Low to moderate",
      rankZh: "区内前 25% 到中间 50%，估算",
      typeZh: "安静的 house / villa 混合街道",
      amenityZh: "强",
      parkingZh: "低到中等"
    },
    suburb: [
      "Oakleigh has strong transport, retail and rental demand.",
      "McIntosh Street has mixed house, villa and townhouse stock.",
      "Land/title ambiguity keeps confidence lower."
    ],
    suburbZh: [
      "Oakleigh 交通、零售和租赁需求较强。",
      "McIntosh Street 有 house、villa 和 townhouse 混合存量。",
      "土地/title 不确定性使 confidence 降低。"
    ],
    planning: {
      landSource: "Portal only, conflict risk",
      granny: "Low to Medium",
      approval: "Not approved",
      landSourceZh: "仅门户网站来源，有冲突风险",
      grannyZh: "低到中等",
      approvalZh: "未获批准"
    }
  },
  {
    aliases: ["18 moresby st oakleigh south", "18 moresby street oakleigh south"],
    address: "18 Moresby Street, Oakleigh South VIC 3167",
    type: "House",
    value: "$1.34m - $1.48m",
    midpoint: "$1.41m",
    midpointValue: 1410000,
    confidence: "Medium",
    status: "Medium",
    reasons: [
      "4 / 2 / 2 family house profile.",
      "530 sqm user-confirmed land size.",
      "Same-street guide evidence supports mid-$1.3m to $1.4m.",
      "Title, overlays and current condition still need confirmation."
    ],
    reasonsZh: [
      "4房2卫2车位的家庭型独立屋。",
      "530 平方米土地由用户确认。",
      "同街指导价证据支持 $1.3m 中段到 $1.4m 区间。",
      "Title、overlay 和当前房况仍需确认。"
    ],
    comparables: [
      ["4 Moresby Street", "$1.35m-$1.40m", "Guide", "530 sqm", "4 / 3 / 2", "Strong"],
      ["1 Loreen Street", "$1.505m", "Feb 2026", "Unknown", "4 bed", "Good"],
      ["23 Olinda Grove", "$1.533m", "Feb 2026", "Unknown", "4 bed", "Good"]
    ],
    location: {
      rank: "Middle 50% to Top 25%, estimated",
      type: "Residential street",
      amenity: "Good",
      parking: "To be checked",
      rankZh: "中间 50% 到前 25%，估算",
      typeZh: "住宅街",
      amenityZh: "好",
      parkingZh: "待检查"
    },
    suburb: [
      "Oakleigh South has family-house demand and school access.",
      "Recent 4-bedroom sales support low-to-mid $1.5m ceiling.",
      "Condition and site layout remain important."
    ],
    suburbZh: [
      "Oakleigh South 有家庭型住房需求和学校便利性。",
      "近期 4 房成交支持低到中位 $1.5m 的价格上限。",
      "房况和地块布局仍然重要。"
    ],
    planning: {
      landSource: "User-confirmed, title still required",
      granny: "Low to Medium",
      approval: "Not approved",
      landSourceZh: "用户确认，仍需 title",
      grannyZh: "低到中等",
      approvalZh: "未获批准"
    }
  }
];

let unlocked = false;
let currentValuation = valuations[0];
let selectedLvr = 0.6;
let language = "en";

const byId = (id) => document.getElementById(id);

const uiText = {
  en: {
    toggle: "简体中文",
    selectors: {
      ".topbar .eyebrow": "Metropolitan Melbourne",
      ".topbar h1": "AusHomeValue",
      'nav a[href="#valuation"]': "Valuation",
      'nav a[href="#comparables"]': "Comparables",
      'nav a[href="#location"]': "Location",
      'nav a[href="#data-sources"]': "Data",
      'nav a[href="#loan"]': "Loan",
      'nav a[href="#uploads"]': "Uploads",
      'nav a[href="#investor"]': "Investor Hub",
      'nav a[href="#contact"]': "Contact",
      ".search-copy .eyebrow": "Free first-layer estimate",
      ".search-copy h2": "Enter a Melbourne address. Get a quick estimate. Leave details for the full report.",
      ".hero-note": "Built for early-stage lead capture using public data, manually curated samples and client-supplied evidence.",
      '.search-box label[for="address"]': "Property address",
      "#start-valuation": "Get free estimate",
      ".lead-panel .eyebrow": "Full report",
      ".lead-panel h2": "Leave details to unlock",
      ".lead-panel > p:not(.eyebrow)": "Basic estimate is free. Register to view comparable adjustments, planning notes and report download options.",
      'label[for="lead-email"]': "Email",
      'label[for="lead-name"]': "Name",
      'label[for="lead-phone"]': "Phone optional",
      ".consent span": "You may contact me about this property report.",
      "#unlock-report": "Register and unlock",
      ".side-panel .panel:nth-of-type(2) h2": "Check Status",
      ".side-panel .panel:nth-of-type(3) h2": "Manual Uploads",
      ".summary-main .eyebrow": "First-layer desktop valuation",
      ".value-band div:nth-child(1) span": "Estimated value",
      ".value-band div:nth-child(2) span": "Midpoint",
      ".value-band div:nth-child(3) span": "Confidence",
      ".summary-card h3": "Why this estimate?",
      "#data-sources .eyebrow": "Free public data first",
      "#data-sources h2": "What this first version checks before asking the client for more.",
      "#data-sources .status": "MVP",
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
      "#uploads h2": "Upload missing evidence to revise the estimate.",
      "#uploads p:not(.eyebrow):not(.pdf-note)": "Title, Section 32, current photos and inspection notes can upgrade confidence and narrow the valuation range.",
      ".pdf-note": "PDF download requires phone number and contact consent.",
      "#download-pdf": "Download PDF",
      "#investor .eyebrow": "Investor Hub",
      "#investor h2": "Explore property-backed investment themes.",
      "#investor p:not(.eyebrow)": "General information only. Specific private opportunities require investor profile, eligibility review and compliance approval.",
      "#investor-lock strong": "Investor Hub details are locked.",
      "#investor-lock span": "Register to view investor education, profile questions and gated opportunity workflow.",
      "#contact .eyebrow": "Contact Us",
      "#contact h2": "Have a property, finance or investment question?",
      "#contact > div:first-child p:not(.eyebrow)": "Send the address and your question by email, or scan the QR code to connect with us. We can review the case and tell you what evidence is still missing.",
      "#contact .contact-email": "info@aushomevalue.com.au",
      "#contact .qr-card strong": "WeChat / QR code",
      "#contact .qr-card p": "Replace this placeholder with your real QR image before launch.",
      "#modal-register": "Register to unlock",
      "#modal-close": "Not now",
      ".modal-content p:not(.eyebrow)": "Register to unlock comparable adjustments, suburb fundamentals, micro-location evidence and planning checks. PDF download requires phone number and contact consent."
    }
  },
  zh: {
    toggle: "English",
    selectors: {
      ".topbar .eyebrow": "墨尔本都会区",
      ".topbar h1": "AusHomeValue",
      'nav a[href="#valuation"]': "估值",
      'nav a[href="#comparables"]': "可比成交",
      'nav a[href="#location"]': "位置",
      'nav a[href="#data-sources"]': "数据",
      'nav a[href="#loan"]': "贷款",
      'nav a[href="#uploads"]': "上传",
      'nav a[href="#investor"]': "投资中心",
      'nav a[href="#contact"]': "联系",
      ".search-copy .eyebrow": "免费第一层估值",
      ".search-copy h2": "输入墨尔本地址，先看快速估值；留下资料后查看完整报告。",
      ".hero-note": "第一版用于低成本获客：公开数据、手工样本和客户补充资料结合使用。",
      '.search-box label[for="address"]': "房产地址",
      "#start-valuation": "获取免费估值",
      ".lead-panel .eyebrow": "完整报告",
      ".lead-panel h2": "留下资料解锁",
      ".lead-panel > p:not(.eyebrow)": "基础估值免费。注册后可查看可比成交调整、规划说明和报告下载选项。",
      'label[for="lead-email"]': "邮箱",
      'label[for="lead-name"]': "姓名",
      'label[for="lead-phone"]': "电话 选填",
      ".consent span": "我同意你可以就这份房产报告联系我。",
      "#unlock-report": "注册并解锁",
      ".side-panel .panel:nth-of-type(2) h2": "检查状态",
      ".side-panel .panel:nth-of-type(3) h2": "手工上传",
      ".summary-main .eyebrow": "第一层桌面估值",
      ".value-band div:nth-child(1) span": "估值区间",
      ".value-band div:nth-child(2) span": "估值中点",
      ".value-band div:nth-child(3) span": "置信度",
      ".summary-card h3": "为什么是这个估值？",
      "#data-sources .eyebrow": "先用免费公开数据",
      "#data-sources h2": "第一版会先自动检查这些内容，再向客户索取补充资料。",
      "#data-sources .status": "MVP",
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
      "#uploads h2": "上传缺失资料以修正估值。",
      "#uploads p:not(.eyebrow):not(.pdf-note)": "Title、Section 32、当前照片和检查记录可以提升置信度并收窄估值区间。",
      ".pdf-note": "下载 PDF 需要填写电话并授权联系。",
      "#download-pdf": "下载 PDF",
      "#investor .eyebrow": "投资中心",
      "#investor h2": "探索地产支持型投资主题。",
      "#investor p:not(.eyebrow)": "仅提供一般信息。具体私募机会需要投资人画像、资格审核和合规批准。",
      "#investor-lock strong": "投资中心详情已锁定。",
      "#investor-lock span": "注册后可查看投资教育、投资人画像问题和机会访问流程。",
      "#contact .eyebrow": "联系我们",
      "#contact h2": "有房产、贷款或投资问题？",
      "#contact > div:first-child p:not(.eyebrow)": "把地址和你的问题发到邮箱，或扫描二维码联系我们。我们可以先看这个案例，并告诉你还缺哪些资料。",
      "#contact .contact-email": "info@aushomevalue.com.au",
      "#contact .qr-card strong": "微信 / 二维码",
      "#contact .qr-card p": "上线前把这个占位二维码替换成你的真实二维码图片。",
      "#modal-register": "注册解锁",
      "#modal-close": "暂不",
      ".modal-content p:not(.eyebrow)": "注册后可查看可比成交调整、区域基本面、微位置证据和规划检查。下载 PDF 需要填写电话并授权联系。"
    }
  }
};

const labelSets = {
  en: {
    checkItems: ["Portal cross-check", "Recent sales scan", "Suburb fundamentals", "Micro-location review", "Title confirmation", "Current condition"],
    uploadButtons: ["Upload Section 32", "Upload title plan", "Upload photos", "Enter manual data"],
    tableHeaders: ["Address", "Sale", "Date", "Land", "Config", "Similarity"],
    factLabels: ["Street rank", "Street type", "Amenity access", "Parking pressure", "Land source", "Granny flat potential", "Approval certainty"],
    chips: ["House", "Vacant land", "Townhouse", "Villa", "Apartment", "Other"],
    investorButtons: ["Private credit", "Development finance", "Income property"],
    sourceHeadings: ["Automatic / free checks", "Client supplied evidence"],
    sourceLists: [
      ["Public sale evidence and manually curated comparable samples", "Address normalization and property type selection", "Suburb fundamentals from public statistics and market notes", "Basic map, street and access review where public tools allow it"],
      ["Title search, title plan and Section 32", "Current photos, renovation notes and condition details", "Known easements, overlays, leases or body corporate documents", "Phone and contact consent required before PDF download"]
    ],
    investorDetail: {
      headings: ["Investor profile", "Gated access"],
      lists: [
        ["Investment purpose and preferred strategy", "Budget / intended allocation range", "Risk tolerance and investment horizon", "Wholesale or sophisticated investor status"],
        ["Registered users see education and market themes", "Profile completed users can request opportunity summaries", "Eligible investors may access IM / DD materials after review"]
      ]
    }
  },
  zh: {
    checkItems: ["门户数据交叉检查", "近期成交扫描", "区域基本面", "微位置检查", "Title 确认", "当前房况"],
    uploadButtons: ["上传 Section 32", "上传 Title Plan", "上传照片", "手工填写资料"],
    tableHeaders: ["地址", "成交价", "日期", "土地", "房型", "相似度"],
    factLabels: ["街道排名", "街道类型", "便利性", "停车压力", "土地来源", "奶奶房潜力", "批准确定性"],
    chips: ["独立屋", "空地", "联排", "Villa", "公寓", "其他"],
    investorButtons: ["地产私募债", "开发融资", "收益型地产"],
    sourceHeadings: ["自动 / 免费检查", "客户补充资料"],
    sourceLists: [
      ["公开成交证据和手工整理的可比样本", "地址标准化和房产类型选择", "公开统计和市场笔记里的区域基本面", "在公开工具允许范围内检查地图、街道和进出便利性"],
      ["Title search、title plan 和 Section 32", "当前照片、装修记录和房况说明", "已知 easement、overlay、租约或 body corporate 文件", "下载 PDF 前需要电话和联系授权"]
    ],
    investorDetail: {
      headings: ["投资人画像", "权限访问"],
      lists: [
        ["投资目的和偏好策略", "预算 / 计划配置金额", "风险偏好和投资期限", "Wholesale 或 Sophisticated investor 状态"],
        ["注册用户可看投资教育和市场主题", "完成画像后可申请机会摘要", "通过资格审核后可查看 IM / DD 材料"]
      ]
    }
  }
};

function normalizeAddress(value) {
  return value
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\bvic\b/g, "")
    .replace(/\b3\d{3}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findValuation(address) {
  const normalized = normalizeAddress(address);
  return (
    valuations.find((item) =>
      item.aliases.some((alias) => {
        const normalizedAlias = normalizeAddress(alias);
        return normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized);
      })
    ) || null
  );
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

function renderComparables(rows) {
  const body = byId("comparables-body");
  body.innerHTML = "";
  const visibleRows = unlocked ? rows : rows.slice(0, 2);
  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell, index) => {
      const td = document.createElement("td");
      if (index === 5) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = cell;
        td.appendChild(pill);
      } else {
        td.textContent = cell;
      }
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function renderValuation(data) {
  currentValuation = data;
  byId("property-address").textContent = data.address;
  byId("estimated-value").textContent = data.value;
  byId("midpoint").textContent = data.midpoint;
  byId("confidence").textContent = data.confidence;
  byId("check-status").textContent = data.status;
  byId("street-rank").textContent = getLocalizedLocation(data, "rank");
  byId("street-type").textContent = getLocalizedLocation(data, "type");
  byId("amenity-access").textContent = getLocalizedLocation(data, "amenity");
  byId("parking-pressure").textContent = getLocalizedLocation(data, "parking");
  byId("land-source").textContent = getLocalizedPlanning(data, "landSource");
  byId("granny-potential").textContent = getLocalizedPlanning(data, "granny");
  byId("approval-certainty").textContent = getLocalizedPlanning(data, "approval");
  setList("reasons", getLocalizedArray(data, "reasons"));
  setList("suburb-list", getLocalizedArray(data, "suburb"));
  renderComparables(data.comparables);
  renderLoanScenario();
  renderLockState();
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

function setSourcePanel(labels) {
  document.querySelectorAll("#data-sources h3").forEach((heading, index) => {
    heading.textContent = labels.sourceHeadings[index] || heading.textContent;
  });
  document.querySelectorAll("#data-sources article").forEach((article, articleIndex) => {
    article.querySelectorAll("li").forEach((li, liIndex) => {
      li.textContent = labels.sourceLists[articleIndex]?.[liIndex] || li.textContent;
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
  setCollectionText(".upload-list button", labels.uploadButtons);
  setCollectionText(".chip", labels.chips);
  setCollectionText("th", labels.tableHeaders);
  setCollectionText(".facts dt", labels.factLabels);
  setCollectionText(".theme-card", labels.investorButtons);
  setSourcePanel(labels);
  setInvestorDetail(labels.investorDetail);
  byId("lead-email").placeholder = language === "zh" ? "you@example.com" : "you@example.com";
  byId("lead-name").placeholder = language === "zh" ? "你的姓名" : "Your name";
  byId("lead-phone").placeholder = language === "zh" ? "下载 PDF 时需要" : "For PDF download";
  renderValuation(currentValuation);
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return "Manual review";
  if (value >= 1000000) return `$${(value / 1000000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}m`;
  return `$${Math.round(value / 1000)}k`;
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
  document.querySelectorAll(".detail-panel").forEach((panel) => {
    panel.classList.toggle("unlocked", !locked);
  });
}

function saveLead({ pdfDownload = false } = {}) {
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
    value: currentValuation.value,
    createdAt: new Date().toISOString()
  };

  const existing = JSON.parse(localStorage.getItem("valuationLeads") || "[]");
  existing.push(lead);
  localStorage.setItem("valuationLeads", JSON.stringify(existing));
  message.textContent = pdfDownload
    ? language === "zh"
      ? "PDF 信息已记录，演示报告已下载。"
      : "PDF details captured. Demo report downloaded."
    : language === "zh"
      ? "完整报告已解锁，线索已保存到演示存储。"
      : "Full report unlocked. Lead saved in demo storage.";
  return true;
}

function downloadDemoReport() {
  if (!saveLead({ pdfDownload: true })) return;
  const report = [
    `Property report: ${currentValuation.address}`,
    `Estimated value: ${currentValuation.value}`,
    `Midpoint: ${currentValuation.midpoint}`,
    `Confidence: ${currentValuation.confidence}`,
    "",
    "Main reasons:",
    ...currentValuation.reasons.map((reason) => `- ${reason}`),
    "",
    "Demo note: this is a prototype text download, not a formal valuation PDF."
  ].join("\n");
  const blob = new Blob([report], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "property-valuation-demo-report.txt";
  link.click();
  URL.revokeObjectURL(url);
}

byId("start-valuation").addEventListener("click", () => {
  const match = findValuation(byId("address").value);
  if (match) {
    renderValuation(match);
    return;
  }
  renderValuation({
    ...valuations[0],
    address: byId("address").value || "Unknown address",
    value: "Sample unavailable",
    midpoint: "Manual review",
    midpointValue: NaN,
    confidence: "Low",
    status: "Low",
    reasons: [
      language === "zh" ? "当前演示只支持部分样本地址。" : "This demo currently supports selected sample addresses.",
      language === "zh" ? "真实部署时会调用估值 API 和数据源。" : "A real deployment would call the valuation API and data sources.",
      language === "zh" ? "请尝试 46 Bishop Street、9 McIntosh Street 或 18 Moresby Street。" : "Please try 46 Bishop Street, 9 McIntosh Street or 18 Moresby Street."
    ],
    comparables: [],
    location: {
      rank: "Unknown",
      type: "Unknown",
      amenity: "Unknown",
      parking: "Unknown"
    },
    suburb: [language === "zh" ? "演示模式下没有可用的区域基本面。" : "No suburb fundamentals available in demo mode."],
    planning: {
      landSource: "Unknown",
      granny: "Unknown",
      approval: "Not assessed"
    }
  });
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

byId("unlock-report").addEventListener("click", () => {
  if (!saveLead()) return;
  unlocked = true;
  renderLockState();
  renderComparables(currentValuation.comparables);
});

byId("download-pdf").addEventListener("click", downloadDemoReport);

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

applyLanguage();
