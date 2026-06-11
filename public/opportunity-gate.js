/* opportunity-gate.js - Phase 1B: Registration gate for Top Opportunities.
   Uses short-lived signed tokens from /api/unlock-opportunity.
   No localStorage v2 key. Server-verified tokens. */

(function () {
  var TOKEN_KEY = "aushomevalue.opportunity.token";

  function getEl(id) { return document.getElementById(id); }

  function getStoredToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }

  function storeToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
  }

  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  /** Check token validity with server */
  function checkTokenOnServer() {
    var token = getStoredToken();
    if (!token) return Promise.resolve(null);

    return fetch("/api/unlock-opportunity", {
      headers: { "Authorization": "Bearer " + token }
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok && d.status === "active") {
          return { status: "active", email: d.email };
        }
        clearToken();
        return null;
      })
      .catch(function () {
        // Network error — assume token still valid
        return { status: "active" };
      });
  }

  /** Submit registration form to server and get a token */
  function submitRegistration(formData) {
    return fetch("/api/unlock-opportunity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    }).then(function (r) { return r.json(); });
  }

  /** Show the registration overlay */
  function showGate(options, onSuccess) {
    var lang = (options && options.language) || "en";
    var isZh = lang === "zh";

    removeOverlay();

    var overlay = document.createElement("div");
    overlay.id = "opp-gate-overlay";
    overlay.className = "opp-gate-overlay";

    var html =
      '<div class="opp-gate-box" style="max-width:480px;">' +
        '<button id="opp-gate-close" style="position:absolute;top:12px;right:12px;width:32px;height:32px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#889994;display:flex;align-items:center;justify-content:center;border-radius:50%;" aria-label="' + (isZh ? '关闭' : 'Close') + '">×</button>' +
        '<h2 style="margin-top:0;">' + (isZh ? '解锁个性化机会排名' : 'Unlock Personalised Opportunity Rankings') + '</h2>' +
        '<p style="color:#66736d;font-size:0.9rem;margin-bottom:20px;line-height:1.5;">' +
          (isZh
            ? '提交偏好后获取个性化 Top 10 机会排名，免费。'
            : 'Get a personalised Top 10 opportunity ranking tailored to your preferences — free.') +
        '</p>' +

        /* Email */
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">Email <span style="color:#dc2626;">*</span></label>' +
          '<input type="email" id="opp-gate-email" placeholder="you@example.com" required ' +
            'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
        '</div>' +

        /* Name (optional) */
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' + (isZh ? '姓名' : 'Name') + ' <span style="color:#889994;">' + (isZh ? '选填' : 'optional') + '</span></label>' +
          '<input type="text" id="opp-gate-name" placeholder="' + (isZh ? '你的姓名' : 'Your name') + '" ' +
            'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
        '</div>' +

        /* Phone (optional) */
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' + (isZh ? '电话' : 'Phone') + ' <span style="color:#889994;">' + (isZh ? '选填' : 'optional') + '</span></label>' +
          '<input type="tel" id="opp-gate-phone" placeholder="0412 345 678" ' +
            'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
        '</div>' +

        /* Budget range */
        '<div style="margin-bottom:12px;display:flex;gap:8px;">' +
          '<div style="flex:1;">' +
            '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' + (isZh ? '预算最低' : 'Budget min') + '</label>' +
            '<input type="number" id="opp-gate-budget-min" placeholder="$" ' +
              'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
          '</div>' +
          '<div style="flex:1;">' +
            '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' + (isZh ? '预算最高' : 'Budget max') + '</label>' +
            '<input type="number" id="opp-gate-budget-max" placeholder="$" ' +
              'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
          '</div>' +
        '</div>' +

        /* State dropdown */
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' + (isZh ? '州' : 'State') + ' <span style="color:#dc2626;">*</span></label>' +
          '<select id="opp-gate-state" ' +
            'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;background:white;">' +
            '<option value="vic">VIC</option>' +
            '<option value="nsw">NSW</option>' +
            '<option value="qld">QLD</option>' +
            '<option value="wa">WA</option>' +
            '<option value="sa">SA</option>' +
            '<option value="act">ACT</option>' +
            '<option value="tas">TAS</option>' +
            '<option value="nt">NT</option>' +
          '</select>' +
        '</div>' +

        /* Investment goal dropdown */
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' + (isZh ? '投资目标' : 'Investment goal') + ' <span style="color:#dc2626;">*</span></label>' +
          '<select id="opp-gate-goal" ' +
            'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;background:white;">' +
            '<option value="growth">' + (isZh ? '增长型' : 'Growth') + '</option>' +
            '<option value="cashflow">' + (isZh ? '现金流' : 'Cashflow') + '</option>' +
            '<option value="balanced">' + (isZh ? '均衡型' : 'Balanced') + '</option>' +
            '<option value="school">' + (isZh ? '学区' : 'School Zone') + '</option>' +
            '<option value="value">' + (isZh ? '价值型' : 'Value') + '</option>' +
          '</select>' +
        '</div>' +

        /* Property type dropdown */
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' + (isZh ? '房产类型' : 'Property type') + '</label>' +
          '<select id="opp-gate-property-type" ' +
            'style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;background:white;">' +
            '<option value="house">' + (isZh ? '独立屋' : 'House') + '</option>' +
            '<option value="unit">' + (isZh ? '公寓' : 'Unit / Apartment') + '</option>' +
            '<option value="townhouse">' + (isZh ? '联排别墅' : 'Townhouse') + '</option>' +
          '</select>' +
        '</div>' +

        /* Service consent (required, NOT pre-checked) */
        '<div style="margin-bottom:10px;">' +
          '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.85rem;color:#66736d;line-height:1.4;">' +
            '<input type="checkbox" id="opp-gate-service-consent" style="margin-top:2px;flex-shrink:0;" />' +
            '<span style="font-weight:500;">' +
              (isZh
                ? '我同意 AusHomeValue 处理我的信息以提供个性化房产机会排名。'
                : 'I consent to AusHomeValue processing my information to provide personalised property opportunity rankings.') +
            ' <span style="color:#dc2626;">*</span></span>' +
          '</label>' +
        '</div>' +

        /* Marketing consent (optional, NOT pre-checked) */
        '<div style="margin-bottom:16px;">' +
          '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.85rem;color:#889994;line-height:1.4;">' +
            '<input type="checkbox" id="opp-gate-marketing-consent" style="margin-top:2px;flex-shrink:0;" />' +
            '<span>' +
              (isZh
                ? '我同意接收 AusHomeValue 的市场营销和优惠信息。'
                : 'I agree to receive marketing and promotional information from AusHomeValue.') +
            '</span>' +
          '</label>' +
        '</div>' +

        '<div class="opp-gate-err" id="opp-gate-err" style="color:#dc2626;font-size:0.8rem;margin-bottom:8px;display:none;"></div>' +

        '<button id="opp-gate-btn" style="width:100%;padding:12px;background:#0d6b57;color:white;border:none;border-radius:8px;font-weight:600;font-size:1rem;cursor:pointer;">' +
          (isZh ? '提交并获取个性化排名' : 'Submit & Get Personalised Rankings') +
        '</button>' +

        '<p style="font-size:0.75rem;color:#889994;margin-top:12px;line-height:1.4;">' +
          (isZh
            ? '提交后即表示您同意上述条款。您将收到免费个性化 Top 10 排名。以后可选择升级到完整智能报告。'
            : 'By submitting you agree to the above terms. You\'ll receive your free personalised Top 10. Full intelligence available for $3.99/month.') +
        '</p>' +
      '</div>';

    overlay.innerHTML = html;

    var style = document.createElement("style");
    style.textContent = '.opp-hidden{display:none!important}.opp-gate-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;cursor:pointer;}.opp-gate-box{background:white;border-radius:16px;padding:32px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);cursor:default;}';
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    function closeGate() { removeOverlay(); }

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
      var serviceConsent = serviceConsentEl ? serviceConsentEl.checked : false;
      var marketingConsent = marketingConsentEl ? marketingConsentEl.checked : false;

      if (!email || !email.includes("@")) errors.push(isZh ? '请输入有效邮箱' : 'Valid email is required');
      if (!state) errors.push(isZh ? '请选择州' : 'State is required');
      if (!goal) errors.push(isZh ? '请选择投资目标' : 'Investment goal is required');
      if (!serviceConsent) errors.push(isZh ? '请勾选服务处理授权' : 'Service processing consent is required');

      if (errors.length) {
        if (errEl) { errEl.style.display = "block"; errEl.textContent = errors.join(". ") + "."; }
        return;
      }
      if (errEl) errEl.style.display = "none";

      btn.disabled = true;
      btn.textContent = isZh ? '提交中...' : 'Submitting...';

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
        language: lang
      }).then(function (d) {
        if (d.ok && d.token) {
          storeToken(d.token);
          try { localStorage.setItem("aushomevalue.reg.email", JSON.stringify(email)); } catch(e) {}
          removeOverlay();
          if (typeof onSuccess === "function") onSuccess(d);
        } else {
          btn.disabled = false;
          btn.textContent = isZh ? '提交并获取个性化排名' : 'Submit & Get Personalised Rankings';
          if (errEl) { errEl.style.display = "block"; errEl.textContent = d.error || (isZh ? '提交失败，请重试。' : 'Submission failed.'); }
        }
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = isZh ? '提交并获取个性化排名' : 'Submit & Get Personalised Rankings';
        if (errEl) { errEl.style.display = "block"; errEl.textContent = isZh ? '服务器错误，请稍后重试。' : 'Server error. Please try again.'; }
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

  function removeOverlay() {
    var existing = document.getElementById("opp-gate-overlay");
    if (existing) existing.remove();
  }

  /** Main gate: check token, show gate or proceed */
  function runGate(options, onSuccess) {
    var gateDefaults = { language: document.documentElement.lang || "en" };
    var gateOptions = Object.assign({}, gateDefaults, options || {});

    return new Promise(function (resolve) {
      checkTokenOnServer().then(function (status) {
        if (status && status.status === "active") {
          resolve(false);
          return;
        }
        showGate(gateOptions, function (d) {
          if (typeof onSuccess === "function") onSuccess(d);
          resolve(false);
        });
        resolve(true);
      });
    });
  }

  /** Check if token exists locally (fast path, not server-verified) */
  function isTokenStored() {
    return !!getStoredToken();
  }

  /* Export globally */
  window.opportunityGate = {
    run: runGate,
    check: checkTokenOnServer,
    isUnlocked: isTokenStored,
    getToken: getStoredToken,
    reset: clearToken,
    protectPage: function () {
      if (isTokenStored()) return;
      var path = window.location.pathname;
      if (path === "/opportunities/" || path === "/opportunities/index.html") {
        try {
          document.head.innerHTML = '<meta http-equiv="refresh" content="0;url=/#opportunities">';
          document.documentElement.innerHTML = '';
        } catch(e) {}
        window.location.href = "/#opportunities";
      }
    }
  };

  /* Auto-protect stand-alone opportunity pages */
  if (typeof window !== "undefined") {
    window.opportunityGate.protectPage();
  }
})();
