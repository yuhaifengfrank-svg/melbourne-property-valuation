(function () {
  "use strict";

  var storageKey = "aushomevalue.language";
  var language = "en";
  try {
    language = localStorage.getItem(storageKey) === "zh" ? "zh" : "en";
  } catch (e) {}

  var indexPage = document.querySelector(".blog-list");
  var articlePage = document.querySelector(".blog-container");
  var originalText = new Map();

  function remember(element) {
    if (element && !originalText.has(element)) originalText.set(element, element.textContent);
    return element;
  }

  function setText(element, en, zh) {
    if (!element) return;
    remember(element);
    element.textContent = language === "zh" ? zh : en;
  }

  function translateIndex() {
    var breadcrumb = document.querySelector(".topbar .inner > span");
    setText(breadcrumb, "/ Suburb Research", "/ 区域研究");
    setText(document.querySelector(".container > h1"), "🏡 Suburb Research", "🏡 维州区域研究");
    setText(
      document.querySelector(".page-desc"),
      "Data-driven analysis of Victorian suburbs, generated weekly from our property intelligence model. Each article covers median prices, opportunity scores, school zones, supply constraints and rental dynamics.",
      "基于 AusHomeValue 房产数据模型的维州区域研究，每周更新，涵盖中位房价、机会评分、学区、供应约束和租赁市场。"
    );

    var update = document.querySelector(".container > p[style*='margin-bottom']");
    if (update) {
      remember(update);
      var source = originalText.get(update);
      var match = source.match(/Updated\s+([^·]+)·\s*(\d+)\s+articles/i);
      update.textContent = language === "zh" && match
        ? "更新于 " + match[1].trim() + " · " + match[2] + " 篇研究"
        : source;
    }

    document.querySelectorAll(".blog-card").forEach(function (card) {
      var link = card.querySelector("h2 a");
      if (link) {
        remember(link);
        var title = originalText.get(link);
        var suburb = title.replace(/\s+[—-]\s+Market Analysis$/i, "");
        link.textContent = language === "zh" ? suburb + " — 房产市场分析" : title;
      }
      var meta = card.querySelector(".meta");
      if (meta) {
        remember(meta);
        var metaSource = originalText.get(meta);
        var week = metaSource.match(/(\d+)\s*·\s*(\d{4})/);
        meta.textContent = language === "zh" && week
          ? week[2] + " 年第 " + week[1] + " 周"
          : metaSource;
      }
      setText(
        card.querySelector("p"),
        "Data-driven suburb analysis covering median price, opportunity score, school zone quality, rental yield, supply constraints and comparable suburbs.",
        "数据驱动的区域分析，涵盖中位房价、机会评分、学区质量、租金回报、供应约束和相似区域对比。"
      );
    });

    var footerLines = document.querySelectorAll(".footer p");
    setText(footerLines[0], "⚠️ All data for research reference only. Not investment advice.", "⚠️ 所有数据仅供研究参考，不构成投资建议。");
    setText(footerLines[1], "© 2026 AusHomeValue — Australian Property Intelligence", "© 2026 AusHomeValue — 澳洲房产研究平台");
  }

  var replacements = [
    ["Budget fit using either lowest median", "价格符合预算范围（采用可用的较低中位价）"],
    ["Elevated vacancy may indicate softer rental demand", "空置率偏高，可能反映租赁需求较弱"],
    ["Infrastructure access signal", "基础设施可达性信号"],
    ["Low vacancy demand signal", "低空置率需求信号"],
    ["Lower rental yield may reduce income appeal", "租金回报偏低，可能降低收益吸引力"],
    ["New supply may compete with resale demand", "新增供应可能与二手房需求形成竞争"],
    ["Rental income signal", "租金收益信号"],
    ["School catchment demand signal", "学区需求信号"],
    ["Standard market risk; validate property condition and micro-location", "常规市场风险；需进一步核实房屋状况和微观区位"],
    ["Supply constraint support", "供应约束支撑"],
    ["Very strong", "非常强"],
    ["Smart Buy", "智选型"],
    ["High", "高"],
    ["Medium", "中"],
    ["Low", "低"]
  ];

  function translateTextTree(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
      var value = originalText.get(node);
      if (language === "zh") {
        replacements.forEach(function (pair) { value = value.split(pair[0]).join(pair[1]); });
      }
      node.nodeValue = value;
    });
  }

  function translateArticle() {
    if (!articlePage) return;
    translateTextTree(articlePage);
  }

  function ensureControls() {
    var host = document.querySelector(".topbar .inner");
    if (!host && articlePage) {
      host = document.createElement("div");
      host.className = "blog-article-tools";
      host.innerHTML = '<a href="/blog/">← Suburb Research</a>';
      document.body.insertBefore(host, document.body.firstChild);
    }
    if (!host) return null;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "blog-language-toggle";
    button.addEventListener("click", function () {
      language = language === "zh" ? "en" : "zh";
      try { localStorage.setItem(storageKey, language); } catch (e) {}
      applyLanguage();
    });
    host.appendChild(button);
    return button;
  }

  var toggle = ensureControls();
  function applyLanguage() {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    if (toggle) toggle.textContent = language === "zh" ? "English" : "简体中文";
    if (indexPage) {
      translateIndex();
      document.querySelectorAll(".blog-card .tag").forEach(translateTextTree);
    }
    if (articlePage) translateArticle();
    var articleBackLink = document.querySelector(".blog-article-tools a");
    setText(articleBackLink, "← Suburb Research", "← 区域研究");
  }

  applyLanguage();
})();
