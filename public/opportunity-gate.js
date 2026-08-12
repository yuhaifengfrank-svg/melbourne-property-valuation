/* opportunity-gate.js - Phase 2: Three-tier opportunity gate.
   Tiers:
     1) Free (no cookie)     → preview 3 opportunities, CTA to register
     2) Registered (cookie)  → personalised Top 10, CTA to subscribe
     3) Subscribed (cookie)  → full access (Coming Soon)
   Uses HttpOnly cookies set by server — never localStorage.
   No token stored client-side. Server-verified on each check. */

(function () {
  "use strict";

  function getEl(id) {
    return document.getElementById(id);
  }

  /** Check token validity with server (cookies sent automatically) */
  function checkTokenOnServer() {
    return fetch("/api/unlock-opportunity")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d.ok && d.status === "active") {
          return { status: "active", email: d.email, gateLevel: d.gateLevel || "opportunity_registered" };
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  /** Get or create anonymous session ID for funnel tracking */
  function getFunnelSessionId() {
    var sid = sessionStorage.getItem("aushomevalue_sid");
    if (!sid) {
      sid = "anon_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem("aushomevalue_sid", sid);
    }
    return sid;
  }

  /** Submit registration form to server */
  function submitRegistration(formData) {
    var sid = getFunnelSessionId();
    return fetch("/api/unlock-opportunity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sid,
      },
      body: JSON.stringify(formData),
    }).then(function (r) {
      return r.json();
    });
  }

  /** Show registration overlay (tier 2 — free → registered) */
  function showRegistrationGate(options, onSuccess) {
    var lang = (options && options.language) || "en";
    var isZh = lang === "zh";

    removeOverlay();
    var previouslyFocused = document.activeElement;

    var overlay = document.createElement("div");
    overlay.id = "opp-gate-overlay";
    overlay.className = "opp-gate-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "opp-gate-title");

    var formTitle = isZh
      ? "解锁个性化机会排名"
      : "Unlock Personalised Opportunity Rankings";
    var formDesc = isZh
      ? "免费获取个性化 Top 10 排名，根据您的偏好量身定制。完整订阅即将推出。"
      : "Get a personalised Top 10 ranking tailored to your preferences — free. Full subscription coming soon.";
    var submitBtn = isZh
      ? "提交并获取个性化排名"
      : "Submit & Get Personalised Rankings";
    var footerTxt = isZh
      ? "提交后即表示您同意上述条款。您将收到免费个性化 Top 10 排名。"
      : "By submitting you agree to the above terms. You'll receive your free personalised Top 10.";

    var html =
      '<div class="opp-gate-box" style="max-width:480px;">' +
      '<button id="opp-gate-close" style="position:absolute;top:12px;right:12px;width:32px;height:32px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#889994;display:flex;align-items:center;justify-content:center;border-radius:50%;" aria-label="' +
      (isZh ? "关闭" : "Close") +
      '">×</button>' +
      '<h2 id="opp-gate-title" style="margin-top:0;">' +
      formTitle +
      "</h2>" +
      '<p style="color:#66736d;font-size:0.9rem;margin-bottom:20px;line-height:1.5;">' +
      formDesc +
      "</p>" +
      /* Email */
      '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">Email <span style="color:#dc2626;">*</span></label>' +
      '<input type="email" id="opp-gate-email" placeholder="you@example.com" required ' +
      'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
      "</div>" +
      /* Name (optional) */
      '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' +
      (isZh ? "姓名" : "Name") +
      ' <span style="color:#889994;">' +
      (isZh ? "选填" : "optional") +
      "</span></label>" +
      '<input type="text" id="opp-gate-name" placeholder="' +
      (isZh ? "你的姓名" : "Your name") +
      '" ' +
      'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
      "</div>" +
      /* Phone (optional) */
      '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' +
      (isZh ? "电话" : "Phone") +
      ' <span style="color:#889994;">' +
      (isZh ? "选填" : "optional") +
      "</span></label>" +
      '<input type="tel" id="opp-gate-phone" placeholder="0412 345 678" ' +
      'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
      "</div>" +
      /* Budget range */
      '<div style="margin-bottom:12px;display:flex;gap:8px;">' +
      '<div style="flex:1;">' +
      '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' +
      (isZh ? "预算最低" : "Budget min") +
      "</label>" +
      '<input type="number" id="opp-gate-budget-min" placeholder="$" ' +
      'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
      "</div>" +
      '<div style="flex:1;">' +
      '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' +
      (isZh ? "预算最高" : "Budget max") +
      "</label>" +
      '<input type="number" id="opp-gate-budget-max" placeholder="$" ' +
      'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
      "</div>" +
      "</div>" +
      /* State dropdown */
      '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' +
      (isZh ? "州" : "State") +
      ' <span style="color:#dc2626;">*</span></label>' +
      '<select id="opp-gate-state" ' +
      'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;background:white;">' +
      '<option value="vic" selected>VIC</option>' +
      '<option value="nsw" disabled>NSW — Coming Soon</option>' +
      '<option value="qld" disabled>QLD — Coming Soon</option>' +
      '<option value="wa" disabled>WA — Coming Soon</option>' +
      '<option value="sa" disabled>SA — Coming Soon</option>' +
      '<option value="act" disabled>ACT — Coming Soon</option>' +
      '<option value="tas" disabled>TAS — Coming Soon</option>' +
      '<option value="nt" disabled>NT — Coming Soon</option>' +
      "</select>" +
      "</div>" +
      /* Investment goal dropdown */
      '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' +
      (isZh ? "投资目标" : "Investment goal") +
      ' <span style="color:#dc2626;">*</span></label>' +
      '<select id="opp-gate-goal" ' +
      'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;background:white;">' +
      '<option value="growth">' +
      (isZh ? "增长型" : "Growth") +
      "</option>" +
      '<option value="cashflow">' +
      (isZh ? "现金流" : "Cashflow") +
      "</option>" +
      '<option value="balanced">' +
      (isZh ? "均衡型" : "Balanced") +
      "</option>" +
      '<option value="school">' +
      (isZh ? "学区" : "School Zone") +
      "</option>" +
      '<option value="value">' +
      (isZh ? "价值型" : "Value") +
      "</option>" +
      "</select>" +
      "</div>" +
      /* Property type dropdown */
      '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' +
      (isZh ? "房产类型" : "Property type") +
      "</label>" +
      '<select id="opp-gate-property-type" ' +
      'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;background:white;">' +
      '<option value="house">' +
      (isZh ? "独立屋" : "House") +
      "</option>" +
      '<option value="unit">' +
      (isZh ? "公寓" : "Unit / Apartment") +
      "</option>" +
      '<option value="townhouse">' +
      (isZh ? "联排别墅" : "Townhouse") +
      "</option>" +
      "</select>" +
      "</div>" +
      /* Service consent (required, NOT pre-checked) */
      '<div style="margin-bottom:10px;">' +
      '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.85rem;color:#66736d;line-height:1.4;">' +
      '<input type="checkbox" id="opp-gate-service-consent" style="margin-top:2px;flex-shrink:0;" />' +
      '<span style="font-weight:500;">' +
      (isZh
        ? "我同意 AusHomeValue 处理我的信息以提供个性化房产机会排名。"
        : "I consent to AusHomeValue processing my information to provide personalised property opportunity rankings.") +
      ' <span style="color:#dc2626;">*</span></span>' +
      "</label>" +
      "</div>" +
      /* Marketing consent (optional, NOT pre-checked) */
      '<div style="margin-bottom:16px;">' +
      '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.85rem;color:#889994;line-height:1.4;">' +
      '<input type="checkbox" id="opp-gate-marketing-consent" style="margin-top:2px;flex-shrink:0;" />' +
      "<span>" +
      (isZh
        ? "我同意接收 AusHomeValue 的市场营销和优惠信息。"
        : "I agree to receive marketing and promotional information from AusHomeValue.") +
      "</span>" +
      "</label>" +
      "</div>" +
      '<div class="opp-gate-err" id="opp-gate-err" style="color:#dc2626;font-size:0.8rem;margin-bottom:8px;display:none;"></div>' +
      '<button id="opp-gate-btn" style="width:100%;padding:12px;background:#0d6b57;color:white;border:none;border-radius:8px;font-weight:600;font-size:1rem;cursor:pointer;">' +
      submitBtn +
      "</button>" +
      '<p style="font-size:0.75rem;color:#66736d;margin-top:12px;line-height:1.5;">' +
      footerTxt +
      "</p>" +
      /* Subscription upgrade CTA (shown after registration on next view) */
      '<div style="margin-top:16px;padding:16px;background:#f0f7f4;border-radius:8px;border:1px solid #dbe2de;">' +
      '<p style="font-size:0.85rem;font-weight:600;color:#17211d;margin:0 0 8px 0;">' +
      (isZh
        ? "🏗 完整 Opportunity Intelligence"
        : "🏗 Full Opportunity Intelligence") +
      "</p>" +
      '<p style="font-size:0.9rem;font-weight:700;color:#0d6b57;margin:0 0 4px 0;">' +
      (isZh
        ? '7天免费试用<br/>之后 AUD $9.99/月'
        : 'Start Your 7-Day Free Trial<br/>Then AUD $9.99/month') +
      "</p>" +
      '<p style="font-size:0.75rem;color:#66736d;margin:0 0 4px 0;line-height:1.4;">' +
      (isZh
        ? "免费试用结束前取消不产生费用。"
        : "Cancel before your trial ends and you won't be charged.") +
      "</p>" +
      '<p style="font-size:0.7rem;color:#889994;margin:0;line-height:1.4;">' +
      (isZh
        ? "免费试用期开始订阅后生效。除非在试用期结束前取消，否则将以 AUD $9.99/月自动续费，直至取消。可随时取消。Marketing consent 与订阅条款为独立授权。"
        : "Your 7-day free trial starts when you subscribe. Unless cancelled before the trial ends, you'll be charged AUD $9.99/month until cancelled. Cancel anytime.") +
      "</p>" +
      '<p style="font-size:0.7rem;color:#889994;margin:4px 0 0 0;font-style:italic;">' +
      (isZh ? "Coming Soon — 支付集成即将推出" : "Coming Soon — payment integration pending") +
      "</p>" +
      "</div>" +
      "</div>";

    overlay.innerHTML = html;

    var style = document.createElement("style");
    style.textContent =
      ".opp-hidden{display:none!important}.opp-gate-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;cursor:pointer;}.opp-gate-box{background:white;border-radius:16px;padding:32px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);cursor:default;}";
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    var firstField = document.getElementById("opp-gate-email");
    if (firstField) {
      window.requestAnimationFrame(function () {
        firstField.focus();
      });
    }

    function closeGate() {
      removeOverlay();
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    }

    var closeBtn = document.getElementById("opp-gate-close");
    if (closeBtn) closeBtn.addEventListener("click", closeGate);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeGate();
    });
    var escHandler = function (e) {
      if (e.key === "Escape") closeGate();
    };
    document.addEventListener("keydown", escHandler);
    var origRemove = overlay.remove.bind(overlay);
    overlay.remove = function () {
      document.removeEventListener("keydown", escHandler);
      origRemove();
    };

    /* Wire up submit */
    var btn = document.getElementById("opp-gate-btn");
    btn.addEventListener("click", function () {
      var emailEl = getEl("opp-gate-email");
      var nameEl = getEl("opp-gate-name");
      var phoneEl = getEl("opp-gate-phone");
      var budgetMinEl = getEl("opp-gate-budget-min");
      var budgetMaxEl = getEl("opp-gate-budget-max");
      var stateEl = getEl("opp-gate-state");
      var goalEl = getEl("opp-gate-goal");
      var propTypeEl = getEl("opp-gate-property-type");
      var serviceConsentEl = getEl("opp-gate-service-consent");
      var marketingConsentEl = getEl("opp-gate-marketing-consent");
      var errEl = getEl("opp-gate-err");

      var errors = [];
      var email = emailEl ? emailEl.value.trim() : "";
      var name = nameEl ? nameEl.value.trim() : "";
      var phone = phoneEl ? phoneEl.value.trim() : "";
      var budgetMin = budgetMinEl ? budgetMinEl.value.trim() : "";
      var budgetMax = budgetMaxEl ? budgetMaxEl.value.trim() : "";
      var state = stateEl ? stateEl.value : "vic";
      var goal = goalEl ? goalEl.value : "balanced";
      var propType = propTypeEl ? propTypeEl.value : "house";
      var serviceConsent = serviceConsentEl
        ? serviceConsentEl.checked
        : false;
      var marketingConsent = marketingConsentEl
        ? marketingConsentEl.checked
        : false;

      if (!email || !email.includes("@"))
        errors.push(isZh ? "请输入有效邮箱" : "Valid email is required");
      if (!state)
        errors.push(isZh ? "请选择州" : "State is required");
      if (!goal)
        errors.push(
          isZh ? "请选择投资目标" : "Investment goal is required"
        );
      if (!serviceConsent)
        errors.push(
          isZh ? "请勾选服务处理授权" : "Service processing consent is required"
        );

      if (errors.length) {
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = errors.join(". ") + ".";
        }
        return;
      }
      if (errEl) errEl.style.display = "none";

      btn.disabled = true;
      btn.textContent = isZh ? "提交中..." : "Submitting...";

      submitRegistration({
        email: email,
        name: name || undefined,
        phone: phone || undefined,
        budgetMin: budgetMin ? Number(budgetMin) : undefined,
        budgetMax: budgetMax ? Number(budgetMax) : undefined,
        state: state,
        goal: goal,
        propertyType: propType,
        serviceConsent: serviceConsent,
        marketingConsent: marketingConsent,
        language: lang,
      })
        .then(function (d) {
          if (d.ok && d.status === "active") {
            // Cookie set by server — nothing to store client-side
            removeOverlay();
            if (typeof onSuccess === "function") onSuccess(d);
          } else if (d.status === "data_unavailable") {
            btn.disabled = false;
            btn.textContent = submitBtn;
            if (errEl) {
              errEl.style.display = "block";
              errEl.textContent =
                d.dataError ||
                (isZh
                  ? "数据暂时不可用，请稍后重试。"
                  : "Data temporarily unavailable. Please try again later.");
            }
          } else {
            btn.disabled = false;
            btn.textContent = submitBtn;
            if (errEl) {
              errEl.style.display = "block";
              errEl.textContent =
                d.error ||
                (isZh ? "提交失败，请重试。" : "Submission failed.");
            }
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = submitBtn;
          if (errEl) {
            errEl.style.display = "block";
            errEl.textContent = isZh
              ? "服务器错误，请稍后重试。"
              : "Server error. Please try again later.";
          }
        });
    });

    /* Pre-fill known values from URL params or options */
    if (options && options.strategy && getEl("opp-gate-goal")) {
      getEl("opp-gate-goal").value = options.strategy;
    }
    if (options && options.propertyType && getEl("opp-gate-property-type")) {
      getEl("opp-gate-property-type").value = options.propertyType;
    }
    if (options && options.state && getEl("opp-gate-state")) {
      getEl("opp-gate-state").value = options.state;
    }
    if (options && options.budgetMin && getEl("opp-gate-budget-min")) {
      getEl("opp-gate-budget-min").value = options.budgetMin;
    }
    if (options && options.budgetMax && getEl("opp-gate-budget-max")) {
      getEl("opp-gate-budget-max").value = options.budgetMax;
    }
  }

  /** Show subscription upgrade overlay (tier 2 → tier 3) */
  function showSubscriptionUpgrade(options) {
    var lang = (options && options.language) || "en";
    var isZh = lang === "zh";

    removeOverlay();

    var overlay = document.createElement("div");
    overlay.id = "opp-gate-overlay";
    overlay.className = "opp-gate-overlay";

    var html =
      '<div class="opp-gate-box" style="max-width:400px;text-align:center;">' +
      '<button id="opp-gate-close" style="position:absolute;top:12px;right:12px;width:32px;height:32px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#889994;display:flex;align-items:center;justify-content:center;border-radius:50%;" aria-label="' +
      (isZh ? "关闭" : "Close") +
      '">×</button>' +
      '<h3 style="margin:0 0 12px 0;">' +
      (isZh ? "解锁全量机会数据" : "Unlock Full Opportunity Data") +
      "</h3>" +
      '<p style="color:#66736d;font-size:0.9rem;margin-bottom:20px;line-height:1.5;">' +
      (isZh
        ? "当前您正在查看个性化 Top 10。订阅后获取所有 200+ 郊区机会排名、历史趋势、完整筛选器。"
        : "You're viewing personalised Top 10. Subscribe for all 200+ suburbs, historical trends, and full filters.") +
      "</p>" +
      '<div style="padding:20px;background:#f0f7f4;border-radius:8px;border:1px solid #dbe2de;margin-bottom:16px;">' +
      '<p style="font-size:0.9rem;font-weight:700;color:#0d6b57;margin:0 0 4px 0;">' +
      (isZh ? "7天免费试用，之后 AUD $9.99/月" : "7-Day Free Trial, then AUD $9.99/month") +
      "</p>" +
      '<p style="font-size:0.75rem;color:#66736d;margin:0;line-height:1.4;">' +
      (isZh
        ? "免费试用结束前取消不产生费用。可随时取消。"
        : "Cancel before your trial ends and you won't be charged. Cancel anytime.") +
      "</p>" +
      "</div>" +
      '<p style="font-size:0.7rem;color:#889994;font-style:italic;">' +
      (isZh ? "Coming Soon — 支付集成即将推出" : "Coming Soon — payment integration pending") +
      "</p>" +
      "<br/>" +
      '<button class="opp-gate-close-btn" style="background:#66736d;color:white;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:0.85rem;">' +
      (isZh ? "返回我的 Top 10" : "Back to My Top 10") +
      "</button>" +
      "</div>";

    overlay.innerHTML = html;

    var style = document.createElement("style");
    style.textContent =
      ".opp-hidden{display:none!important}.opp-gate-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;cursor:pointer;}.opp-gate-box{background:white;border-radius:16px;padding:32px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);cursor:default;}";
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    function closeGate() {
      removeOverlay();
    }

    var closeBtn = document.getElementById("opp-gate-close");
    if (closeBtn) closeBtn.addEventListener("click", closeGate);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeGate();
    });
    var escHandler = function (e) {
      if (e.key === "Escape") closeGate();
    };
    document.addEventListener("keydown", escHandler);
    var origRemove = overlay.remove.bind(overlay);
    overlay.remove = function () {
      document.removeEventListener("keydown", escHandler);
      origRemove();
    };

    var closeButton = overlay.querySelector(".opp-gate-close-btn");
    if (closeButton) closeButton.addEventListener("click", closeGate);
  }

  function removeOverlay() {
    var existing = document.getElementById("opp-gate-overlay");
    if (existing) existing.remove();
  }

  /** Main gate: check token, return current tier, show gate if needed */
  function runGate(options, onSuccess) {
    var gateDefaults = {
      language: document.documentElement.lang || "en",
    };
    var gateOptions = Object.assign({}, gateDefaults, options || {});

    return new Promise(function (resolve) {
      checkTokenOnServer().then(function (status) {
        if (status && status.status === "active") {
          // Already authenticated — resolve with gate level
          resolve({
            authenticated: true,
            gateLevel: status.gateLevel || "opportunity_registered",
          });
          return;
        }
        // Not authenticated — show registration overlay
        showRegistrationGate(gateOptions, function (d) {
          if (typeof onSuccess === "function") onSuccess(d);
        });
        // Resolve as soon as the gate is visible. Waiting until registration
        // completes leaves the search button looking unresponsive during a
        // cold server-side access check.
        resolve({ authenticated: false, gateShown: true });
      });
    });
  }

  /** Check if user has at least registered access */
  function checkTier() {
    return checkTokenOnServer().then(function (status) {
      if (status && status.status === "active") {
        return {
          tier: status.gateLevel === "opportunity_subscribed" ? "subscribed" : "registered",
          email: status.email,
        };
      }
      return { tier: "free", email: null };
    });
  }

  /* Export globally — no localStorage methods exposed */
  window.opportunityGate = {
    run: runGate,
    checkTier: checkTier,
    isUnlocked: function () {
      return checkTokenOnServer().then(function (status) {
        return !!(status && status.status === "active");
      });
    },
    check: checkTokenOnServer,
    showSubscriptionUpgrade: showSubscriptionUpgrade,
    showRegistrationGate: showRegistrationGate,
    protectPage: function () {
      checkTokenOnServer().then(function (status) {
        if (status && status.status === "active") return;
        var path = window.location.pathname;
        if (
          path === "/opportunities/" ||
          path === "/opportunities/index.html"
        ) {
          try {
            document.head.innerHTML =
              '<meta http-equiv="refresh" content="0;url=/#opportunities">';
            document.documentElement.innerHTML = "";
          } catch (e) {}
          window.location.href = "/#opportunities";
        }
      });
    },
  };

  /* Auto-protect only pages that explicitly opt in.
     The public opportunities page is now the top of the funnel, so it must
     show a free preview before registration. */
  if (
    typeof window !== "undefined" &&
    document.documentElement &&
    document.documentElement.dataset.opportunityProtect === "true"
  ) {
    window.opportunityGate.protectPage();
  }
})();
