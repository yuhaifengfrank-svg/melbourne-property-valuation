// ── Report Viewer — Phase 1E3C-3B-2 ──
// Renders full valuation report from /api/valuation-full.
// Security: textContent only, no innerHTML/eval, no cookie/localStorage reads.

(function () {
  "use strict";

  // ══════════════════════════════════════════════════════════════
  //  Constants
  // ══════════════════════════════════════════════════════════════

  var NA = "Data unavailable";

  // Keys to strip from normalized payload (sensitive fields)
  var FILTERED_KEYS = {
    email: true,
    phone: true,
    lead_contact_id: true,
    stripe_payment_intent: true,
    token: true,
    session_id: true,
    purchase_intent_key: true,
    snapshot_hash: true
  };

  // Error code mapping from API
  var ERROR_MAP = {
    REPORT_SESSION_EXPIRED: "session_expired",
    REPORT_SESSION_MISMATCH: "session_mismatch",
    REPORT_NOT_ENTITLED: "not_entitled",
    PAYMENT_NOT_CONFIRMED: "payment_not_confirmed",
    REPORT_REFUNDED: "refunded",
    REPORT_REVOKED: "revoked",
    REPORT_DATA_UNAVAILABLE: "data_unavailable",
    REPORT_NOT_FOUND: "not_found",
    REPORT_OWNER_CONFLICT: "session_mismatch",
    BAD_REQUEST: "generic_error",
    INTERNAL_ERROR: "generic_error"
  };

  // ── State ──

  var state = {
    reportId: null,
    rawPayload: null,
    currentState: null
  };
  var language = "en";

  // ── AbortController helpers ──
  var currentAbort = null;
  var requestGeneration = 0;
  var isFetching = false;
  var retryBtn = null;

  // ── DOM refs ──

  var root, pages, ariaLive;

  var I18N = {
    en: {
      toggle: "简体中文",
      na: "Data unavailable",
      loading: "Loading your property report.",
      navHome: "Home",
      navValuation: "Valuation",
      navResearch: "Research",
      navAbout: "About",
      reportTitle: "Property Report",
      returnHome: "Return to Home",
      returnValuation: "Return to Valuation",
      printComing: "Print / Save as PDF — Coming soon",
      welcome: "Welcome",
      welcomeDear: "Dear {name},",
      welcomeLine1: "Welcome to your AusHomeValue Full Valuation Report for {address}.",
      welcomeLine2: "This report brings together our first-layer valuation estimate, comparable sales evidence, confidence checks, future opportunity signals, key risks and practical next steps in one structured research pack.",
      welcomeLine3: "The goal is to help you understand not only what the property may be worth today, but why the model reached that view and what needs to be checked before you make a purchase, sale, finance or investment decision.",
      welcomeLine4: "Please treat this as decision-support information, not formal valuation advice. You should still verify title, condition, planning, finance and legal matters with appropriately licensed professionals.",
      executiveSummary: "Executive Summary",
      valuationType: "Valuation Type",
      estimatedValue: "Estimated Value",
      valueRange: "Value Range",
      confidence: "Confidence",
      confidenceScore: "Confidence Score",
      confidenceFactors: "Confidence Factors",
      futureOpportunityScore: "Future Opportunity Score",
      futureScoreConfidence: "Future Score Confidence",
      scorePosition: "Score position",
      scorePositionIntro: "This places the score into a broad opportunity band so you can interpret {score}/100 as a relative signal, not a guaranteed outcome.",
      scoreBands: ["Lower 25%", "25-50%", "50-75%", "Top 25%"],
      scoreBandTop: "Top 25% opportunity band",
      scoreBandUpperMid: "50-75% opportunity band",
      scoreBandLowerMid: "25-50% opportunity band",
      scoreBandLower: "Lower 25% opportunity band",
      mainValuationSignals: "Main valuation signals:",
      keyFutureOpportunitySignals: "Key future opportunity signals:",
      keyFutureRisks: "Key future risks to check:",
      propertyDetails: "Property Details",
      address: "Address",
      suburb: "Suburb",
      state: "State",
      propertyType: "Property Type",
      bedrooms: "Bedrooms",
      bathrooms: "Bathrooms",
      carSpaces: "Car Spaces",
      landSize: "Land Size",
      buildingArea: "Building Area",
      zoning: "Zoning",
      comparableSales: "Comparable Sales",
      comparableIntro: "The comparable set below is the market evidence used to support the estimate. Sales may differ in land size, dwelling condition, exact location and title type, so the estimate should be read as a range rather than a single precise value.",
      compsNone: "None available",
      headers: ["Address", "Sale Price", "Sale Date", "Distance", "Land", "Type", "Adjust.", "Status"],
      futureOutlook: "Future Opportunity Outlook",
      propertyFutureScore: "Property Future Score",
      suburbFutureOutlook: "Suburb Future Outlook",
      propertySpecificFit: "Property-Specific Fit",
      horizon: "Horizon",
      keyOpportunitySignals: "Key opportunity signals:",
      keyRisksToCheck: "Key risks to check:",
      futureUnavailable: "Future Opportunity Outlook was not included in this report snapshot. Run a fresh valuation after the Future Opportunity model update to include this section.",
      suburbOnlyFuture: "A suburb-level future opportunity signal was available, but this report snapshot did not include enough property-specific data to calculate a property-level score.",
      futureDisclaimer: "This is a relative opportunity index, not a predicted price growth percentage or promise of return.",
      methodology: "Valuation Methodology",
      methodLabel: "Methodology",
      largeLotMode: "Large Lot Mode",
      detected: "Detected",
      localP90: "Local P90",
      landRatio: "Land Ratio",
      combinedMidpoint: "Combined Midpoint",
      channelAWeight: "Channel A Weight",
      channelBWeight: "Channel B Weight",
      anchorValue: "Anchor Value",
      weightedMedian: "Weighted Median",
      weightedMean: "Weighted Mean",
      factorAdjustments: "Factor Adjustments",
      factorTotal: "Factor Total",
      halfRange: "Half Range",
      sigma: "Sigma",
      multiSourceNote: "Multi-source analysis was considered where available. Differences between sources may reflect listing corrections, timing, title differences or incomplete public records.",
      marketContext: "Market Context",
      suburbMedian: "Suburb Median",
      rentEstimate: "Rent Estimate",
      grossYield: "Gross Yield",
      nearbySchool: "Nearby School",
      vacancyRate: "Vacancy Rate",
      risks: "Risks and Limitations",
      noLimitations: "No additional data limitations were reported by the valuation engine. You should still verify title, condition, overlays, renovations and recent off-market information before relying on the estimate.",
      standardDisclaimer: "This report is for informational purposes only and does not constitute formal professional property valuation advice. Market conditions may change after the as-of date. All values are estimates based on available data and statistical models.",
      nextSteps: "Recommended Next Steps",
      nextStepItems: [
        "Compare the estimate range with at least two independent market opinions before transacting.",
        "Check title, planning overlays, easements, building condition and strata information where relevant.",
        "For finance, lending or tax decisions, speak with appropriately licensed professionals.",
        "Re-run the report when new comparable sales become available or if the property's attributes change."
      ],
      glossaryTitle: "How to Read These Metrics",
      glossaryIntro: "These notes explain the model terms in plain language. They are included to make the report easier to interpret, not to replace professional advice.",
      glossaryDefinitions: [
        { term: "Future Opportunity Outlook", desc: "A relative 0-100 signal combining suburb-level outlook and property-specific fit. It is useful for comparing opportunities, not for promising price growth." },
        { term: "Anchor Value", desc: "The first central value generated from comparable sales before the final range checks and weighting are applied." },
        { term: "Weighted Median", desc: "The middle comparable value after higher-quality or more relevant evidence receives more influence. It is less affected by extreme sales than an average." },
        { term: "Weighted Mean", desc: "The weighted average of accepted comparable evidence. It can move more than the median when high or low sales are influential." },
        { term: "Factor Adjustments", desc: "The model's directional adjustment for differences such as land size, recency, property type and evidence quality where those fields are available." },
        { term: "Factor Total", desc: "The combined effect of model adjustments. Treat it as an explanation signal, not a separate valuation." },
        { term: "Half Range", desc: "Half of the customer-facing value range. Wider ranges usually mean more uncertainty or more variation in comparable evidence." },
        { term: "Sigma", desc: "A statistical spread measure used internally to understand how tightly the evidence clusters around the estimate." },
        { term: "Planning & Zoning Signals", desc: "Indicative signals from available planning data. They do not confirm approval, subdivision potential, or the absence of heritage controls." }
      ],
      metadata: "Report Metadata",
      reportId: "Report ID",
      asOfDate: "As of Date",
      purchased: "Purchased",
      valuationEngine: "Valuation Engine",
      thankYou: "Thank You",
      thankLine1: "Dear {name}, thank you again for choosing AusHomeValue.",
      thankLine2: "We hope this report gives you a clearer view of {address} and helps you compare the property with more confidence.",
      thankLine3: "If you are reviewing multiple properties, keep this report as a reference point and re-check the estimate when fresh comparable sales, planning information or property details become available.",
      investorWatchTitle: "Investor Watch — AUD $9.99/month",
      investorWatchSub: "Track better buying opportunities beyond one valuation. For buyers and investors who want to monitor opportunities beyond one property.",
      investorWatchPrice: "Full Valuation Report: AUD $3.99 one-time | Investor Watch: AUD $9.99/month",
      investorWatchFeatures: [
        "Opportunity Watchlist",
        "Future Outlook Scores by suburb",
        "Saved property tracking",
        "New suburb opportunity alerts",
        "Market signal updates when new data is available",
        "Compare multiple properties before buying"
      ],
      investorWatchCta: "Join Investor Watch — Coming Soon",
      formula: "property_future_score = suburb_future_outlook_score * 0.70 + property_specific_score * 0.30",

      // ── Planning & Zoning Signals ──
      planningTitle: "Planning & Zoning Signals",
      planningIntro: "Planning and zoning signals are based on available VicPlan zone and overlay data. They are indicative only and do not confirm development approval, subdivision potential, or the absence of heritage controls.",
      planningZone: "Zone",
      planningCategory: "Category",
      planningInterpretation: "Interpretation",
      planningOverlays: "Overlays",
      planningConstraintLevel: "Planning Constraint Level",
      planningFlexibility: "Redevelopment Flexibility",
      planningManualReview: "Manual Review Recommended",
      planningLimitations: "Data Limitations",
      planningNone: "No overlay record was returned in the current dataset. This does not confirm the absence of overlays or heritage controls.",
      planningUnavailable: "Planning signal data was not available for this address.",
      planningSignals: [
        "Zoning and overlay signal monitoring",
        "Development constraint alerts when new data is available",
        "Planning signal updates for saved suburbs and properties"
      ]
    },
    zh: {
      toggle: "English",
      na: "数据暂不可用",
      loading: "正在加载你的房产报告。",
      navHome: "首页",
      navValuation: "估值",
      navResearch: "研究",
      navAbout: "关于",
      reportTitle: "房产报告",
      returnHome: "返回首页",
      returnValuation: "返回估值页",
      printComing: "打印 / 保存 PDF — 即将推出",
      welcome: "欢迎",
      welcomeDear: "尊敬的{name}，",
      welcomeLine1: "欢迎查看你购买的 AusHomeValue 完整估值报告：{address}。",
      welcomeLine2: "这份报告把首层估值、可比成交证据、置信度检查、未来机会信号、关键风险和下一步建议整理在一起，帮助你更系统地理解这套房产。",
      welcomeLine3: "我们的目标不只是告诉你一个估值区间，而是解释模型为什么得到这个结果，以及在买入、出售、贷款或投资决策前还需要重点核查什么。",
      welcomeLine4: "请注意，本报告属于决策辅助信息，不构成正式估值、财务建议或法律建议。产权、房屋状况、规划、贷款和法律事项仍应由相应持牌专业人士核实。",
      executiveSummary: "核心摘要",
      valuationType: "估值类型",
      estimatedValue: "估计价值",
      valueRange: "估值区间",
      confidence: "置信度",
      confidenceScore: "置信度分数",
      confidenceFactors: "置信度依据",
      futureOpportunityScore: "未来机会分数",
      futureScoreConfidence: "未来分数置信度",
      scorePosition: "分数位置",
      scorePositionIntro: "这里把分数放入大致机会分位，让你理解 {score}/100 在相对机会中的位置；它不是确定收益承诺。",
      scoreBands: ["后 25%", "25-50%", "50-75%", "前 25%"],
      scoreBandTop: "前 25% 机会区间",
      scoreBandUpperMid: "50-75% 机会区间",
      scoreBandLowerMid: "25-50% 机会区间",
      scoreBandLower: "后 25% 机会区间",
      mainValuationSignals: "主要估值信号：",
      keyFutureOpportunitySignals: "关键未来机会信号：",
      keyFutureRisks: "需要核查的未来风险：",
      propertyDetails: "房产信息",
      address: "地址",
      suburb: "区域",
      state: "州",
      propertyType: "房产类型",
      bedrooms: "卧室",
      bathrooms: "浴室",
      carSpaces: "车位",
      landSize: "土地面积",
      buildingArea: "建筑面积",
      zoning: "规划分区",
      comparableSales: "可比成交",
      comparableIntro: "下方可比成交是本估值的主要市场证据。不同房屋在土地面积、房屋状况、具体位置和产权类型上可能存在差异，因此本估值应作为区间理解，而不是单一精确价格。",
      compsNone: "暂无可比成交",
      headers: ["地址", "成交价", "成交日期", "距离", "土地", "类型", "调整", "状态"],
      futureOutlook: "未来机会展望",
      propertyFutureScore: "房产未来分数",
      suburbFutureOutlook: "区域未来展望",
      propertySpecificFit: "房产匹配度",
      horizon: "观察周期",
      keyOpportunitySignals: "关键机会信号：",
      keyRisksToCheck: "需要核查的风险：",
      futureUnavailable: "这份报告快照尚未包含未来机会模型。请重新生成估值，以纳入最新 Future Opportunity 分析。",
      suburbOnlyFuture: "当前仅有区域层面的未来机会信号，但本报告快照缺少足够的房产层面数据，因此没有生成房产级分数。",
      futureDisclaimer: "这是相对机会指数，不是价格涨幅预测，也不代表确定收益。",
      methodology: "估值方法",
      methodLabel: "方法说明",
      largeLotMode: "大地块模式",
      detected: "已识别",
      localP90: "本地 P90 土地面积",
      landRatio: "土地比例",
      combinedMidpoint: "综合中位估值",
      channelAWeight: "通道 A 权重",
      channelBWeight: "通道 B 权重",
      anchorValue: "锚定价值",
      weightedMedian: "加权中位数",
      weightedMean: "加权平均数",
      factorAdjustments: "因素调整",
      factorTotal: "总调整",
      halfRange: "半区间",
      sigma: "Sigma",
      multiSourceNote: "如数据可用，模型会参考多来源信息。不同来源之间的差异可能来自挂牌修正、时间差、产权差异或公开记录不完整。",
      marketContext: "市场背景",
      suburbMedian: "区域中位价",
      rentEstimate: "租金估计",
      grossYield: "毛租金收益率",
      nearbySchool: "附近学校",
      vacancyRate: "空置率",
      risks: "风险与限制",
      noLimitations: "估值引擎未报告额外数据限制。但在依赖本估值前，仍应核查产权、房屋状况、规划限制、翻新情况和近期非公开市场信息。",
      standardDisclaimer: "本报告仅供一般信息和研究参考，不构成正式专业房产估值建议。市场情况可能在报告日期后变化。所有价值均基于可得数据和统计模型估算。",
      nextSteps: "建议下一步",
      nextStepItems: [
        "在交易前，将本估值区间与至少两份独立市场意见进行比较。",
        "核查产权、规划覆盖、地役权、房屋状况以及相关 strata 信息。",
        "涉及贷款、税务或法律决策时，请咨询相应持牌专业人士。",
        "当新的可比成交出现，或房产属性发生变化时，建议重新生成报告。"
      ],
      glossaryTitle: "如何理解这些指标",
      glossaryIntro: "以下说明用通俗语言解释模型指标，帮助你读懂报告。它们不替代正式估值、法律、贷款或税务建议。",
      glossaryDefinitions: [
        { term: "Future Opportunity Outlook", desc: "一个 0-100 的相对机会信号，结合区域前景和房产自身匹配度。适合用来比较机会，不代表承诺涨幅。" },
        { term: "Anchor Value", desc: "模型从可比成交中生成的初始中心值，之后还会经过区间检查和权重处理。" },
        { term: "Weighted Median", desc: "加权后的中位数。质量更高或更相关的证据影响更大，相比平均数不容易被极端成交拉偏。" },
        { term: "Weighted Mean", desc: "加权平均数。如果高价或低价成交权重较大，它会比中位数更容易移动。" },
        { term: "Factor Adjustments", desc: "模型对土地面积、成交时间、房产类型和证据质量等差异做出的方向性调整。" },
        { term: "Factor Total", desc: "各项模型调整合计后的解释信号。它不是单独的估值，只帮助理解估值为什么这样变化。" },
        { term: "Half Range", desc: "估值区间的一半。区间越宽，通常代表不确定性更高或可比成交差异更大。" },
        { term: "Sigma", desc: "一种统计分散度指标，用来观察证据围绕估值中心的集中程度。" },
        { term: "规划与分区信号", desc: "基于当前可用规划数据的参考信号，不确认开发许可、分割潜力，也不确认没有 Heritage 控制。" }
      ],
      metadata: "报告信息",
      reportId: "报告编号",
      asOfDate: "报告日期",
      purchased: "购买日期",
      valuationEngine: "估值引擎",
      thankYou: "感谢",
      thankLine1: "尊敬的{name}，再次感谢你选择 AusHomeValue。",
      thankLine2: "希望这份报告能帮助你更清楚地理解 {address}，并更有信心地比较不同房产。",
      thankLine3: "如果你正在比较多套房产，可以把这份报告作为参考点；当新的可比成交、规划信息或房产细节出现时，再重新检查估值。",
      investorWatchTitle: "Investor Watch — AUD $9.99/月",
      investorWatchSub: "不只看一套房，持续追踪更好的买入机会。适合想持续观察市场机会、比较多个区域和多套房产的买家与投资者。",
      investorWatchPrice: "完整估值报告：AUD $3.99 一次性 | Investor Watch：AUD $9.99/月",
      investorWatchFeatures: [
        "机会观察清单",
        "区域 Future Outlook Score",
        "分区与 Overlay 信号追踪",
        "有新数据时提示潜在规划限制",
        "对收藏区域和房产更新规划信号",
        "买房前对比多套房产"
      ],
      investorWatchCta: "加入 Investor Watch — 即将开放",
      formula: "房产未来分数 = 区域未来展望分数 × 70% + 房产自身匹配分数 × 30%",

      // ── 规划与分区信号 ──
      planningTitle: "规划与分区信号",
      planningIntro: "规划和分区信号基于当前可用的 VicPlan Zone 与 Overlay 数据，仅供参考。它们不代表开发许可、分割潜力，也不确认不存在 Heritage 控制。",
      planningZone: "分区",
      planningCategory: "分类",
      planningInterpretation: "解读",
      planningOverlays: "叠加区",
      planningConstraintLevel: "规划约束级别",
      planningFlexibility: "开发灵活性",
      planningManualReview: "建议人工复核",
      planningLimitations: "数据局限性",
      planningNone: "当前数据集未返回 Overlay 记录。这不等于不存在 Overlay 或 Heritage 控制。",
      planningUnavailable: "该地址暂无规划信号数据。",
      planningSignals: [
        "分区与 Overlay 信号追踪",
        "有新数据时提示潜在规划限制",
        "对收藏区域和房产更新规划信号"
      ]
    }
  };

  // ══════════════════════════════════════════════════════════════
  //  Helpers
  // ══════════════════════════════════════════════════════════════

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return (ctx || document).querySelectorAll(sel); }

  function text(key) {
    var dict = I18N[language] || I18N.en;
    return dict[key] != null ? dict[key] : I18N.en[key];
  }

  function interpolate(template, vars) {
    return String(template || "").replace(/\{(\w+)\}/g, function (_, key) {
      return vars && vars[key] != null ? String(vars[key]) : "";
    });
  }

  function detectLanguage() {
    var search = window.location.search || "";
    if (/[?&]lang=zh\b/i.test(search)) return "zh";
    if (/[?&]lang=en\b/i.test(search)) return "en";
    var navLangs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < navLangs.length; i++) {
      if (/^zh/i.test(navLangs[i] || "")) return "zh";
    }
    var docLang = document.documentElement && document.documentElement.lang;
    if (docLang && /^zh/i.test(docLang)) return "zh";
    return "en";
  }

  function setLanguage(nextLang) {
    language = nextLang === "zh" ? "zh" : "en";
    NA = text("na");
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.body.className = document.body.className.replace(/\bzh-mode\b/g, "").trim();
    if (language === "zh") {
      document.body.className = (document.body.className ? document.body.className + " " : "") + "zh-mode";
    }
    applyStaticLanguage();
  }

  function setText(selector, value) {
    var el = qs(selector);
    if (el) el.textContent = value;
  }

  function applyStaticLanguage() {
    setText(".topbar-nav a[href='/']", text("navHome"));
    setText(".topbar-nav a[href='/#valuation']", text("navValuation"));
    setText(".topbar-nav a[href='/#research']", text("navResearch"));
    setText(".topbar-nav a[href='/#about']", text("navAbout"));
    setText("#rv-language-toggle", text("toggle"));
    setText(".rv-report-header h1", text("reportTitle"));
    setText(".rv-report-actions a[href='/']", text("returnHome"));
    setText(".rv-report-actions a[href='/#valuation']", text("returnValuation"));
    setText("#rv-btn-print", text("printComing"));
    setText(".rv-loading p", text("loading"));
  }

  function escapeHTML(str) {
    if (str == null) return NA;
    var s = String(str);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fmtCurrency(n) {
    if (n == null || isNaN(n)) return NA;
    return "$" + Number(n).toLocaleString("en-AU");
  }

  function fmtDate(d) {
    if (!d) return NA;
    var date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString(language === "zh" ? "zh-CN" : "en-AU", {
      year: "numeric", month: "short", day: "numeric"
    });
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return NA;
    return (Number(n) * 100).toFixed(1) + "%";
  }

  function fmtArea(n) {
    if (n == null || isNaN(n)) return NA;
    return Number(n).toLocaleString("en-AU") + " m\u00B2";
  }

  function isEmptyObj(v) {
    return v == null || typeof v !== "object" || Array.isArray(v);
  }

  // ══════════════════════════════════════════════════════════════
  //  Normalizer
  // ══════════════════════════════════════════════════════════════

  function normalizePayload(input) {
    if (!input || typeof input !== "object") return null;

    var p = {};

    // ── Estimate ──
    var est = input.estimate || input.valuation || {};
    if (est.estimate) est = est.estimate;

    p.midpoint = est.midpoint;
    p.low = est.low || est.rangeLow || (est.range && est.range.low);
    p.high = est.high || est.rangeHigh || (est.range && est.range.high);
    p.anchor = est.anchor || input.anchor || null;
    p.weightedMedian = est.weightedMedian || input.weightedMedian || null;
    p.weightedMean = est.weightedMean || input.weightedMean || null;
    p.factorAdjustments = est.factorAdjustments || input.factorAdjustments || null;
    p.factorTotal = est.factorTotal || input.factorTotal || null;
    p.customerHalfRange = est.customerHalfRange || input.customerHalfRange || null;
    p.sigma = est.sigma || input.sigma || null;

    // ── Confidence ──
    var conf = input.confidence || {};
    p.confidenceLabel = conf.label || null;
    p.confidenceScore = conf.score || null;
    p.confidenceDataScore = conf.dataScore || null;
    p.confidenceReasons = conf.reasons || null;

    // ── Subject ──
    // Precedence (highest first):
    //   1. New format input.subject (from buildReportSnapshot)
    //   2. Legacy format input.addressVerification / input.customerData
    //   3. Top-level fallback fields
    var sub = input.subject || {};
    var av = input.addressVerification || {};
    var cd = input.customerData || {};

    // Use != null to preserve legitimate 0 values (bedrooms, carSpaces)
    function firstDefined(/* ...args */) {
      for (var i = 0; i < arguments.length; i++) {
        if (arguments[i] != null) return arguments[i];
      }
      return null;
    }

    p.address = firstDefined(sub.address, av.address, input.address);
    p.suburb = firstDefined(sub.suburb, av.suburb);
    p.state = firstDefined(sub.state, av.state);
    p.propertyType = firstDefined(sub.propertyType, av.propertyType, input.propertyType);
    p.bedrooms = firstDefined(sub.bedrooms, cd.bedrooms, input.bedrooms);
    p.bathrooms = firstDefined(sub.bathrooms, cd.bathrooms, input.bathrooms);
    p.carSpaces = firstDefined(sub.carSpaces, cd.carSpaces, input.carSpaces);
    p.landSize = firstDefined(sub.landSize, av.landSize, input.landSize);
    p.buildingArea = firstDefined(sub.buildingArea, input.buildingArea);
    p.zoning = firstDefined(sub.zoning, input.zoning);
    p.customerName = firstDefined(
      input.customerName,
      input.customer_name,
      input.customer && input.customer.name,
      input.name
    );

    // ── Valuation mode ──
    p.valuationMode = input.valuationMode || null;
    p.largeLotDetect = input.largeLotDetect || null;
    p.largeLotResult = input.largeLotResult || null;

    // ── Comparables ──
    p.acceptedComparables = input.acceptedComparables || input.comparables || [];
    p.rejectedComparables = input.rejectedComparables || [];
    p.methodology = input.methodology || input.evidenceMode || "Comparable-sales evidence model using recent public market transactions, confidence scoring and statistical range checks.";
    p.multiSourceAnalysis = input.multiSourceAnalysis || null;
    p.keyFactors = Array.isArray(input.keyFactors) ? input.keyFactors : [];
    p.dataLimitations = Array.isArray(input.dataLimitations) ? input.dataLimitations : [];
    p.propertyFutureOutlook = input.propertyFutureOutlook || null;
    p.suburbFutureOutlook = input.suburbFutureOutlook || null;
    p.planningSignals = input.planningSignals || null;

    // ── Market context ──
    var mc = input.marketContext || {};
    if (mc && typeof mc === "object") {
      p.suburbMedian = mc.suburbMedian || null;
      p.rent = mc.rent || null;
      p["yield"] = mc["yield"] || null;
      p.school = mc.school || null;
      p.vacancy = mc.vacancy || null;
    }

    // ── Meta ──
    p.reportId = input.reportId || input.report_id || null;
    p.valuationVersion = input.valuationVersion || null;
    p.purchasedAt = input.purchasedAt || input.purchased_at || null;
    p.asOfDate = input.asOfDate || input.as_of_date || null;
    p.coverageIssue = input.coverageIssue || input.coverage_issue || null;

    // ── Sensitive field stripping ──
    for (var sk in p) {
      if (Object.prototype.hasOwnProperty.call(p, sk) && FILTERED_KEYS[sk]) {
        p[sk] = null;
      }
    }

    return p;
  }

  function buildDemoReportPayload() {
    return normalizePayload({
      reportId: "rp_20260620_aaaaaaaaaaaaaaaaaaaaaaaa",
      valuationVersion: "demo-1.0",
      purchasedAt: "2026-06-20T09:30:00+10:00",
      asOfDate: "2026-06-20T09:30:00+10:00",
      customerName: language === "zh" ? "小鱼" : "Sample Buyer",
      subject: {
        address: "8 Melrose Ct, Scoresby, VIC",
        suburb: "Scoresby",
        state: "VIC",
        postcode: "3179",
        propertyType: "House",
        bedrooms: 4,
        bathrooms: 2,
        carSpaces: 2,
        landSize: 409,
        buildingArea: 178,
        zoning: "Neighbourhood Residential Zone"
      },
      estimate: {
        midpoint: 1065340,
        low: 905539,
        high: 1225141,
        anchor: 1065340,
        weightedMedian: 1059000,
        weightedMean: 1074200,
        factorAdjustments: 0.031,
        factorTotal: 0.044,
        customerHalfRange: 159801,
        sigma: 0.096
      },
      valuationMode: "standard_house",
      confidence: {
        label: "Medium",
        score: 74,
        dataScore: 74,
        reasons: [
          "12 accepted comparable sales",
          "Recent comparable sales within six months",
          "Dispersion 9.9%",
          "17% single-source"
        ]
      },
      keyFactors: [
        "Recent nearby house sales support the current estimate range.",
        "The property sits in an established residential pocket with family-house demand.",
        "The estimate is supported by multiple comparable sales, but title and condition still need manual checks."
      ],
      dataLimitations: [
        "The model does not verify building condition, renovations, structural issues or unrecorded improvements.",
        "Heritage controls, easements, covenants and current planning applications should be checked independently.",
        "The range may move as fresh comparable sales or off-market information becomes available."
      ],
      acceptedComparables: [
        {
          address: "23 Gertonia Avenue, Scoresby",
          salePrice: 1045000,
          saleDate: "2026-05-22",
          distanceMeters: 430,
          landSize: 405,
          propertyType: "House",
          adjustment: 0.018,
          verificationStatus: "Included"
        },
        {
          address: "14 Berrabri Drive, Scoresby",
          salePrice: 1112000,
          saleDate: "2026-04-18",
          distanceMeters: 760,
          landSize: 536,
          propertyType: "House",
          adjustment: -0.022,
          verificationStatus: "Included"
        },
        {
          address: "7 Michele Drive, Scoresby",
          salePrice: 985000,
          saleDate: "2026-03-29",
          distanceMeters: 950,
          landSize: 395,
          propertyType: "House",
          adjustment: 0.041,
          verificationStatus: "Included"
        },
        {
          address: "5 Melrose Court, Scoresby",
          salePrice: 1098000,
          saleDate: "2026-02-14",
          distanceMeters: 120,
          landSize: 421,
          propertyType: "House",
          adjustment: -0.006,
          verificationStatus: "Included"
        },
        {
          address: "31 Darryl Street, Scoresby",
          salePrice: 1160000,
          saleDate: "2026-01-31",
          distanceMeters: 890,
          landSize: 612,
          propertyType: "House",
          adjustment: -0.048,
          verificationStatus: "Included"
        }
      ],
      propertyFutureOutlook: {
        futureOpportunityIndex: 72,
        suburbFutureOutlookScore: 70,
        propertySpecificScore: 76,
        forecastHorizon: "3-5 years",
        confidence: "Medium",
        formula: "property_future_score = suburb_future_outlook_score * 0.70 + property_specific_score * 0.30",
        why: [
          "Established suburb with limited immediate replacement supply.",
          "Family-house format remains aligned with local buyer demand.",
          "Planning signals suggest the area should be monitored for constraints and future changes.",
          "Comparable evidence indicates the property is within a liquid local price band."
        ],
        risks: [
          "Condition, renovation quality and building defects are not verified by the model.",
          "Higher rates or weaker buyer confidence could compress demand in the next cycle.",
          "Planning and overlay data is indicative only and should be checked before relying on redevelopment assumptions."
        ]
      },
      suburbFutureOutlook: {
        futureOpportunityIndex: 70
      },
      planningSignals: {
        ok: true,
        zone: {
          code: "NRZ3",
          name: "Neighbourhood Residential Zone — Schedule 3",
          category: "residential",
          interpretation: "Residential zoning is generally aligned with established housing use. Manual planning review is still required before relying on any development assumption."
        },
        overlays: [
          {
            code: "DDO",
            name: "Design and Development Overlay",
            interpretation: "A design control applies. Built form, neighbourhood character and local policy should be reviewed."
          }
        ],
        planningConstraintLevel: "moderate",
        redevelopmentFlexibilityHint: "mixed",
        manualReviewRequired: true,
        limitations: [
          "Heritage Overlay coverage is not confirmed in this demo dataset.",
          "Council applications, title restrictions and site-specific controls require separate review."
        ]
      },
      marketContext: {
        suburbMedian: 1048000,
        rent: 650,
        yield: 0.0317,
        school: "Scoresby Primary School",
        vacancy: 0.018
      },
      multiSourceAnalysis: {
        used: true
      },
      methodology: "Comparable-sales evidence model using recent public market transactions, range checks, confidence scoring, planning signals and future opportunity indicators."
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  State machine
  // ══════════════════════════════════════════════════════════════

  function showPage(stateName) {
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].getAttribute("data-state") === stateName) {
        pages[i].className = "rv-page rv-active";
      } else {
        pages[i].className = "rv-page";
      }
    }
    state.currentState = stateName;
  }

  function setAriaLive(text) {
    if (ariaLive) ariaLive.textContent = text;
  }

  function showLoading() {
    applyStaticLanguage();
    showPage("loading");
    setAriaLive(text("loading"));
  }

  function showError(stateName) {
    showPage(stateName);
    var label = stateName.replace(/_/g, " ");
    setAriaLive("Report error: " + label + ".");
  }

  function showReport(payload) {
    state.rawPayload = payload;
    renderReport(payload);
    showPage("report");
    setAriaLive("Your property report is ready.");
  }

  // ══════════════════════════════════════════════════════════════
  //  API fetch
  // ══════════════════════════════════════════════════════════════

  function cancelCurrentRequest() {
    requestGeneration += 1;
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
    isFetching = false;
    if (retryBtn) retryBtn.disabled = false;
  }

  function fetchReport() {
    var rid = state.reportId;
    if (!rid) {
      showError("generic_error");
      return;
    }

    // Prevent concurrent / duplicate
    if (isFetching) return;
    isFetching = true;
    if (retryBtn) retryBtn.disabled = true;

    // Bump generation so old callbacks are ignored
    var gen = ++requestGeneration;
    var ac = new AbortController();
    currentAbort = ac;

    showLoading();
    setAriaLive(text("loading"));

    fetch("/api/valuation-full", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ reportId: rid }),
      signal: ac.signal
    }).then(function (res) {
      if (gen !== requestGeneration) return;

      if (!res.ok) {
        return res.text().then(function (text) {
          if (gen !== requestGeneration) return;
          var parsed;
          try { parsed = JSON.parse(text); } catch (_) {}
          var code = parsed && parsed.error;
          var mapped = ERROR_MAP[code] || "generic_error";
          showError(mapped);
        }).catch(function () {
          if (gen !== requestGeneration) return;
          showError("generic_error");
        });
      }

      return res.json().then(function (data) {
        if (gen !== requestGeneration) return;

        // Validate response structure
        if (!data || data.ok !== true || data.status !== "completed" ||
            data.entitlementStatus !== "active" ||
            data.paymentStatus !== "paid" ||
            String(data.reportId) !== String(rid) ||
            isEmptyObj(data.report)) {
          showError("generic_error");
          return;
        }

        // Merge outer meta into a shallow copy — never mutate the original
        var reportData = Object.assign({}, data.report, {
          reportId: data.reportId,
          valuationVersion: data.valuationVersion || data.report.valuationVersion,
          purchasedAt: data.purchasedAt || data.report.purchasedAt
        });

        var p = normalizePayload(reportData);
        if (!p) {
          showError("generic_error");
          return;
        }

        showReport(p);
      });
    }).catch(function (err) {
      if (gen !== requestGeneration) return;

      // Ignore abort errors
      if (err && err.name === "AbortError") return;

      showError("generic_error");
    }).finally(function () {
      if (gen !== requestGeneration) return;
      isFetching = false;
      if (retryBtn) retryBtn.disabled = false;
      if (currentAbort === ac) currentAbort = null;
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════════════════════════

  function renderReport(p) {
    if (!p) return;

    var sections = document.getElementById("rv-sections");
    if (!sections) return;

    // Clear sections with textContent-safe child removal
    while (sections.firstChild) {
      sections.removeChild(sections.firstChild);
    }

    function appendSection(title, contentFn) {
      var div = document.createElement("div");
      div.className = "rv-section";

      var h2 = document.createElement("h2");
      h2.textContent = title;
      div.appendChild(h2);

      var body = document.createElement("div");
      body.className = "rv-section-body";
      contentFn(body);
      div.appendChild(body);

      sections.appendChild(div);
    }

    function appendParagraph(el, text, className) {
      var pEl = document.createElement("p");
      if (className) pEl.className = className;
      pEl.textContent = text;
      el.appendChild(pEl);
      return pEl;
    }

    function appendBulletList(el, items) {
      var valid = Array.isArray(items) ? items.filter(function (x) { return x != null && String(x).trim() !== ""; }) : [];
      if (!valid.length) return false;
      var ul = document.createElement("ul");
      ul.className = "rv-bullet-list";
      for (var i = 0; i < valid.length; i++) {
        var li = document.createElement("li");
        li.textContent = String(valid[i]);
        ul.appendChild(li);
      }
      el.appendChild(ul);
      return true;
    }

    function publicConfidenceReasons(items) {
      if (!Array.isArray(items)) return [];
      return items.filter(function (item) {
        if (item == null) return false;
        var text = String(item).trim();
        if (!text) return false;
        // Internal data-provenance detail; useful for QA, not helpful for customers.
        return !/single[-\s]?source/i.test(text);
      });
    }

    function displayText(value, fallback) {
      if (value == null) return fallback;
      var text = String(value).trim();
      return text ? text : fallback;
    }

    function opportunityBandLabel(score) {
      var n = Number(score);
      if (!Number.isFinite(n)) return null;
      if (n >= 75) return text("scoreBandTop");
      if (n >= 50) return text("scoreBandUpperMid");
      if (n >= 25) return text("scoreBandLowerMid");
      return text("scoreBandLower");
    }

    function appendScoreDistribution(el, score) {
      var n = Number(score);
      if (!Number.isFinite(n)) return false;
      var safeScore = Math.max(0, Math.min(100, n));
      var bands = text("scoreBands");
      var bandLabel = opportunityBandLabel(safeScore);
      if (!Array.isArray(bands) || !bandLabel) return false;

      var card = document.createElement("div");
      card.className = "rv-score-card";

      var title = document.createElement("div");
      title.className = "rv-score-card-title";
      title.textContent = text("scorePosition");
      card.appendChild(title);

      var desc = document.createElement("p");
      desc.className = "rv-score-card-desc";
      desc.textContent = String(text("scorePositionIntro")).replace("{score}", String(Math.round(safeScore)));
      card.appendChild(desc);

      var track = document.createElement("div");
      track.className = "rv-score-track";
      for (var i = 0; i < 4; i++) {
        var segment = document.createElement("span");
        segment.className = "rv-score-segment";
        track.appendChild(segment);
      }
      var marker = document.createElement("span");
      marker.className = "rv-score-marker";
      marker.style.left = safeScore + "%";
      track.appendChild(marker);
      card.appendChild(track);

      var labels = document.createElement("div");
      labels.className = "rv-score-labels";
      for (var bi = 0; bi < bands.length; bi++) {
        var label = document.createElement("span");
        label.textContent = bands[bi];
        labels.appendChild(label);
      }
      card.appendChild(labels);

      var summary = document.createElement("div");
      summary.className = "rv-score-band-summary";
      summary.textContent = Math.round(safeScore) + "/100 · " + bandLabel;
      card.appendChild(summary);

      el.appendChild(card);
      return true;
    }

    function appendOptionalInfoRow(el, label, value) {
      if (value == null || value === NA) return false;
      var s = String(value).trim();
      if (!s || s === NA) return false;
      el.appendChild(makeInfoRow(label, value));
      return true;
    }

    function appendDefinitionList(el, items) {
      var valid = Array.isArray(items) ? items.filter(function (item) {
        return item && item.term && item.desc;
      }) : [];
      if (!valid.length) return false;

      var list = document.createElement("div");
      list.className = "rv-definition-list";
      for (var i = 0; i < valid.length; i++) {
        var row = document.createElement("div");
        row.className = "rv-definition-item";

        var term = document.createElement("div");
        term.className = "rv-definition-term";
        term.textContent = valid[i].term;
        row.appendChild(term);

        var desc = document.createElement("div");
        desc.className = "rv-definition-desc";
        desc.textContent = valid[i].desc;
        row.appendChild(desc);

        list.appendChild(row);
      }
      el.appendChild(list);
      return true;
    }

    var customerName = displayText(p.customerName, "Customer");
    var reportAddress = displayText(p.address, "the selected property");
    var futureOutlook = p.propertyFutureOutlook || null;
    var confidenceReasons = publicConfidenceReasons(p.confidenceReasons);

    // ── 1. Welcome / report guide ──
    appendSection(text("welcome"), function (el) {
      appendParagraph(el, interpolate(text("welcomeDear"), { name: customerName }));
      appendParagraph(el, interpolate(text("welcomeLine1"), { address: reportAddress }));
      appendParagraph(el, text("welcomeLine2"));
      appendParagraph(el, text("welcomeLine3"));
      appendParagraph(el, text("welcomeLine4"));
    });

    // ── 2. Executive Summary ──
    appendSection(text("executiveSummary"), function (el) {
      var val = p.valuationMode || "Standard";
      var modeLabel = val.replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      el.appendChild(makeInfoRow(text("valuationType"), modeLabel));
      el.appendChild(makeInfoRow(text("estimatedValue"), fmtCurrency(p.midpoint)));
      el.appendChild(makeInfoRow(text("valueRange"), fmtCurrency(p.low) + " \u2013 " + fmtCurrency(p.high)));
      if (p.confidenceLabel) {
        el.appendChild(makeInfoRow(text("confidence"), p.confidenceLabel));
      }
      if (p.confidenceScore != null) {
        el.appendChild(makeInfoRow(text("confidenceScore"), p.confidenceScore + "%"));
      }
      if (confidenceReasons.length) {
        el.appendChild(makeInfoRow(text("confidenceFactors"), confidenceReasons.join("; ")));
      }
      if (futureOutlook && futureOutlook.futureOpportunityIndex != null) {
        el.appendChild(makeInfoRow(text("futureOpportunityScore"), String(futureOutlook.futureOpportunityIndex) + "/100"));
        appendScoreDistribution(el, futureOutlook.futureOpportunityIndex);
      }
      if (futureOutlook && futureOutlook.confidence) {
        el.appendChild(makeInfoRow(text("futureScoreConfidence"), futureOutlook.confidence));
      }
      if (p.keyFactors && p.keyFactors.length) {
        appendParagraph(el, text("mainValuationSignals"));
        appendBulletList(el, p.keyFactors.slice(0, 5));
      }
      if (futureOutlook && Array.isArray(futureOutlook.why) && futureOutlook.why.length) {
        appendParagraph(el, text("keyFutureOpportunitySignals"));
        appendBulletList(el, futureOutlook.why.slice(0, 4));
      }
      if (futureOutlook && Array.isArray(futureOutlook.risks) && futureOutlook.risks.length) {
        appendParagraph(el, text("keyFutureRisks"));
        appendBulletList(el, futureOutlook.risks.slice(0, 4));
      }
    });

    // ── 3. Property Details ──
    appendSection(text("propertyDetails"), function (el) {
      el.appendChild(makeInfoRow(text("address"), p.address));
      el.appendChild(makeInfoRow(text("suburb"), p.suburb));
      el.appendChild(makeInfoRow(text("state"), p.state));
      el.appendChild(makeInfoRow(text("propertyType"), p.propertyType));
      el.appendChild(makeInfoRow(text("bedrooms"), p.bedrooms != null ? String(p.bedrooms) : NA));
      el.appendChild(makeInfoRow(text("bathrooms"), p.bathrooms != null ? String(p.bathrooms) : NA));
      el.appendChild(makeInfoRow(text("carSpaces"), p.carSpaces != null ? String(p.carSpaces) : NA));
      el.appendChild(makeInfoRow(text("landSize"), fmtArea(p.landSize)));
      el.appendChild(makeInfoRow(text("buildingArea"), fmtArea(p.buildingArea)));
      el.appendChild(makeInfoRow(text("zoning"), p.zoning));
    });

    // ── 4. Comparable Sales ──
    appendSection(text("comparableSales"), function (el) {
      var comps = p.acceptedComparables || [];
      var count = comps.length;
      if (count === 0) {
        el.appendChild(makeInfoRow(text("comparableSales"), text("compsNone")));
        return;
      }
      appendParagraph(el, text("comparableIntro"));

      // Table for desktop
      var table = document.createElement("table");
      table.className = "rv-comparables-table";
      var thead = document.createElement("thead");
      // Build table header with createElement/textContent
      var headerRow = document.createElement("tr");
      var headerLabels = text("headers");
      for (var hi = 0; hi < headerLabels.length; hi++) {
        var th = document.createElement("th");
        th.textContent = headerLabels[hi];
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      var limit = Math.min(count, 20);
      for (var ci = 0; ci < limit; ci++) {
        var c = comps[ci];
        var tr = document.createElement("tr");
        tr.appendChild(makeCell(c.address));
        tr.appendChild(makeCell(fmtCurrency(c.salePrice)));
        tr.appendChild(makeCell(fmtDate(c.saleDate)));
        var dist = c.distanceMeters != null ? Math.round(c.distanceMeters) + " m"
          : c.distanceKm != null ? Number(c.distanceKm).toFixed(2) + " km"
          : c.distance != null ? String(c.distance)
          : NA;
        tr.appendChild(makeCell(dist));
        tr.appendChild(makeCell(fmtArea(c.landSize)));
        tr.appendChild(makeCell(c.propertyType));
        tr.appendChild(makeCell(c.adjustment != null ? fmtPct(c.adjustment) : c.adjustmentPercent != null ? fmtPct(c.adjustmentPercent) : "Included in model"));
        tr.appendChild(makeCell(c.verificationStatus));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      el.appendChild(table);

      // Cards for mobile
      var cards = document.createElement("div");
      cards.className = "rv-comparable-cards";
      for (var cj = 0; cj < limit; cj++) {
        var comp = comps[cj];
        if (comp) {
          var card = document.createElement("div");
          card.className = "rv-comparable-card";
          card.textContent = comp.address + " \u2014 " + fmtCurrency(comp.salePrice) + " (" + fmtDate(comp.saleDate) + ")";
          cards.appendChild(card);
        }
      }
      el.appendChild(cards);
    });

    // ── 5. Future Opportunity Outlook ──
    appendSection(text("futureOutlook"), function (el) {
      var outlook = p.propertyFutureOutlook || null;
      var suburbOutlook = p.suburbFutureOutlook || null;
      if (outlook && outlook.futureOpportunityIndex != null) {
        el.appendChild(makeInfoRow(text("propertyFutureScore"), String(outlook.futureOpportunityIndex) + "/100"));
        if (outlook.suburbFutureOutlookScore != null) {
          el.appendChild(makeInfoRow(text("suburbFutureOutlook"), String(outlook.suburbFutureOutlookScore) + "/100"));
        }
        if (outlook.propertySpecificScore != null) {
          el.appendChild(makeInfoRow(text("propertySpecificFit"), String(outlook.propertySpecificScore) + "/100"));
        }
        el.appendChild(makeInfoRow(text("horizon"), outlook.forecastHorizon || "3-5 years"));
        el.appendChild(makeInfoRow(text("confidence"), outlook.confidence || (language === "zh" ? "低" : "Low")));
        appendParagraph(el, outlook.formula && language === "en" ? outlook.formula : text("formula"));
        if (Array.isArray(outlook.why) && outlook.why.length) {
          appendParagraph(el, text("keyOpportunitySignals"));
          appendBulletList(el, outlook.why.slice(0, 5));
        }
        if (Array.isArray(outlook.risks) && outlook.risks.length) {
          appendParagraph(el, text("keyRisksToCheck"));
          appendBulletList(el, outlook.risks.slice(0, 5));
        }
      } else if (suburbOutlook && suburbOutlook.futureOpportunityIndex != null) {
        el.appendChild(makeInfoRow(text("suburbFutureOutlook"), String(suburbOutlook.futureOpportunityIndex) + "/100"));
        appendParagraph(el, text("suburbOnlyFuture"));
      } else {
        appendParagraph(el, text("futureUnavailable"));
      }
      appendParagraph(el, text("futureDisclaimer"));
    });

    // ── 6. Planning & Zoning Signals ──
    appendSection(text("planningTitle"), function (el) {
      var planSignal = p.planningSignals || null;
      if (!planSignal || !planSignal.ok) {
        appendParagraph(el, text("planningUnavailable"));
        appendParagraph(el, text("planningIntro"));
        return;
      }
      if (planSignal.zone) {
        el.appendChild(makeInfoRow(text("planningZone"), planSignal.zone.code + " — " + planSignal.zone.name));
        el.appendChild(makeInfoRow(text("planningCategory"), planSignal.zone.category));
        appendParagraph(el, planSignal.zone.interpretation);
      } else {
        el.appendChild(makeInfoRow(text("planningZone"), NA));
      }
      if (planSignal.overlays && planSignal.overlays.length > 0) {
        appendParagraph(el, text("planningOverlays"));
        appendBulletList(el, planSignal.overlays.map(function (o) {
          return o.code + " — " + o.name + ": " + o.interpretation;
        }));
      } else {
        appendParagraph(el, text("planningNone"));
      }
      el.appendChild(makeInfoRow(text("planningConstraintLevel"), planSignal.planningConstraintLevel));
      el.appendChild(makeInfoRow(text("planningFlexibility"), planSignal.redevelopmentFlexibilityHint));
      if (planSignal.manualReviewRequired) {
        el.appendChild(makeInfoRow(text("planningManualReview"), text("yes")));
      }
      if (planSignal.limitations && planSignal.limitations.length > 0) {
        appendParagraph(el, text("planningLimitations"));
        appendBulletList(el, planSignal.limitations);
      }
    });

    // ── 7. Valuation Methodology ──
    appendSection(text("methodology"), function (el) {
      el.appendChild(makeInfoRow(text("methodLabel"), p.methodology));
      if (p.valuationMode === "large_lot_house" && p.largeLotDetect) {
        el.appendChild(makeInfoRow(text("largeLotMode"), text("detected")));
        el.appendChild(makeInfoRow(text("landSize"), fmtArea(p.largeLotDetect.landSize)));
        el.appendChild(makeInfoRow(text("localP90"), fmtArea(p.largeLotDetect.localP90)));
        el.appendChild(makeInfoRow(text("landRatio"), p.largeLotDetect.ratio != null ? p.largeLotDetect.ratio.toFixed(1) + "x" : NA));
      }
      if (p.largeLotResult) {
        el.appendChild(makeInfoRow(text("combinedMidpoint"), fmtCurrency(p.largeLotResult.combinedMidpoint)));
        el.appendChild(makeInfoRow(text("channelAWeight"), p.largeLotResult.channelAWeight != null ? fmtPct(p.largeLotResult.channelAWeight) : NA));
        el.appendChild(makeInfoRow(text("channelBWeight"), p.largeLotResult.channelBWeight != null ? fmtPct(p.largeLotResult.channelBWeight) : NA));
      }
      appendOptionalInfoRow(el, text("anchorValue"), fmtCurrency(p.anchor));
      appendOptionalInfoRow(el, text("weightedMedian"), fmtCurrency(p.weightedMedian));
      appendOptionalInfoRow(el, text("weightedMean"), fmtCurrency(p.weightedMean));
      appendOptionalInfoRow(el, text("factorAdjustments"), p.factorAdjustments != null ? fmtPct(p.factorAdjustments) : null);
      appendOptionalInfoRow(el, text("factorTotal"), p.factorTotal != null ? fmtPct(p.factorTotal) : null);
      appendOptionalInfoRow(el, text("halfRange"), fmtCurrency(p.customerHalfRange));
      appendOptionalInfoRow(el, text("sigma"), p.sigma != null ? String(Number(p.sigma).toFixed(4)) : null);
      if (p.multiSourceAnalysis) {
        appendParagraph(el, text("multiSourceNote"));
      }
    });

    // ── 7. Market Context ──
    appendSection(text("marketContext"), function (el) {
      var rows = 0;
      rows += appendOptionalInfoRow(el, text("suburbMedian"), fmtCurrency(p.suburbMedian)) ? 1 : 0;
      rows += appendOptionalInfoRow(el, text("rentEstimate"), fmtCurrency(p.rent)) ? 1 : 0;
      rows += appendOptionalInfoRow(el, text("grossYield"), p["yield"] != null ? fmtPct(p["yield"]) : null) ? 1 : 0;
      rows += appendOptionalInfoRow(el, text("nearbySchool"), p.school) ? 1 : 0;
      rows += appendOptionalInfoRow(el, text("vacancyRate"), p.vacancy != null ? fmtPct(p.vacancy) : null) ? 1 : 0;
      if (!rows) {
        appendParagraph(el, language === "zh"
          ? "这份报告快照未包含可展示的区域市场背景指标。估值仍基于可比成交证据生成。"
          : "This report snapshot does not include display-ready suburb market context metrics. The valuation is still generated from comparable-sales evidence.");
      }
    });

    // ── 8. Risks and Limitations ──
    appendSection(text("risks"), function (el) {
      if (p.coverageIssue) {
        var note = document.createElement("p");
        note.className = "rv-risk-note";
        note.textContent = p.coverageIssue;
        el.appendChild(note);
      } else if (p.dataLimitations && p.dataLimitations.length) {
        appendBulletList(el, p.dataLimitations);
      } else {
        var note2 = document.createElement("p");
        note2.textContent = text("noLimitations");
        el.appendChild(note2);
      }
      var stdNote = document.createElement("p");
      stdNote.textContent = text("standardDisclaimer");
      el.appendChild(stdNote);
    });

    // ── 9. Next Steps ──
    appendSection(text("nextSteps"), function (el) {
      appendBulletList(el, text("nextStepItems"));
    });

    // ── 10. Metric glossary ──
    appendSection(text("glossaryTitle"), function (el) {
      appendParagraph(el, text("glossaryIntro"));
      appendDefinitionList(el, text("glossaryDefinitions"));
    });

    // ── 11. Report Metadata ──
    appendSection(text("metadata"), function (el) {
      el.appendChild(makeInfoRow(text("reportId"), p.reportId));
      el.appendChild(makeInfoRow(text("asOfDate"), fmtDate(p.asOfDate)));
      el.appendChild(makeInfoRow(text("purchased"), fmtDate(p.purchasedAt)));
      if (p.valuationVersion) {
        el.appendChild(makeInfoRow(text("valuationEngine"), p.valuationVersion));
      }
    });

    // ── 12. Thank You ──
    appendSection(text("thankYou"), function (el) {
      appendParagraph(el, interpolate(text("thankLine1"), { name: customerName }));
      appendParagraph(el, interpolate(text("thankLine2"), { address: reportAddress }));
      appendParagraph(el, text("thankLine3"));
      appendParagraph(el, "AusHomeValue");
    });

    // ── 13. Investor Watch upsell ──
    appendSection(text("investorWatchTitle"), function (el) {
      appendParagraph(el, text("investorWatchSub"));
      appendParagraph(el, text("investorWatchPrice"));
      appendBulletList(el, text("investorWatchFeatures"));
      appendParagraph(el, text("investorWatchCta"));
    });
  }

  // ── Render helpers ──

  function makeInfoRow(label, value) {
    var row = document.createElement("div");
    row.className = "rv-info-row";
    var lbl = document.createElement("span");
    lbl.className = "rv-info-label";
    lbl.textContent = label;
    var val = document.createElement("span");
    val.className = "rv-info-value";
    val.textContent = (value != null && value !== "" ? String(value) : NA);
    row.appendChild(lbl);
    row.appendChild(val);
    return row;
  }

  function makeCell(text) {
    var td = document.createElement("td");
    td.textContent = text != null ? String(text) : NA;
    return td;
  }

  // ══════════════════════════════════════════════════════════════
  //  Init
  // ══════════════════════════════════════════════════════════════

  function init() {
    root = document.getElementById("rv-root");
    if (!root) return;

    pages = qsa(".rv-page", root);
    ariaLive = document.getElementById("rv-aria-live");
    retryBtn = document.getElementById("rv-btn-retry");
    setLanguage(detectLanguage());

    var langToggle = document.getElementById("rv-language-toggle");
    if (langToggle) {
      langToggle.addEventListener("click", function () {
        setLanguage(language === "zh" ? "en" : "zh");
        if (state.rawPayload) {
          renderReport(state.rawPayload);
        } else if (state.currentState === "loading") {
          showLoading();
        }
      });
    }

    // Parse report_id/demo mode from URL
    var search = window.location.search;
    var rid = null;
    var demoMode = null;
    if (search && search.length > 1) {
      var qsStr = search.substring(1);
      var pairs = qsStr.split("&");
      for (var pi = 0; pi < pairs.length; pi++) {
        var pair = pairs[pi].split("=");
        var key = pair[0];
        if (key === "report_id" && pair.length > 1) {
          rid = decodeURIComponent(pair[1]);
        }
        if (key === "demo" && pair.length > 1) {
          demoMode = decodeURIComponent(pair[1]);
        }
      }
    }

    if (demoMode === "paid-report") {
      state.reportId = "rp_20260620_aaaaaaaaaaaaaaaaaaaaaaaa";
      showReport(buildDemoReportPayload());
      return;
    }

    // Validate report_id format: rp_<digits>_<16+ hex chars>
    var formatOk = rid && /^rp_\d+_[0-9a-f]{16,}$/i.test(rid);
    if (!formatOk) {
      showError("generic_error");
      return;
    }

    state.reportId = rid;
    showLoading();

    // Retry button handler
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        fetchReport();
      });
    }

    // Cancel on visibility change / beforeunload
    window.addEventListener("beforeunload", function () {
      cancelCurrentRequest();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        cancelCurrentRequest();
      }
    });

    // Fetch report
    fetchReport();
  }

  // ══════════════════════════════════════════════════════════════
  //  Public API
  // ══════════════════════════════════════════════════════════════

  window.__REPORT_VIEWER__ = {
    renderReport: renderReport,
    showLoading: showLoading,
    showError: showError,
    showPage: showPage,
    fetchReport: fetchReport,
    cancelCurrentRequest: cancelCurrentRequest,
    getState: function () { return state; },
    getRequestGeneration: function () { return requestGeneration; },
    getIsFetching: function () { return isFetching; }
  };

  // Script is at end of <body>; DOM is ready. Run init immediately.
  init();
})();
