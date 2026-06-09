/* opportunity-gate.js - v2 Registration gate for Top Opportunities.
   Phone + contact consent required. Reads from /api/opportunity-unlock.
   Loaded by /opportunities/*.html. */

(function () {
  var REG_KEY = "lead.unlocked.v2";

  function getEl(id) { return document.getElementById(id); }

  function hasLocalStorageToken() {
    try {
      // Invalidate old v1 key
      if (localStorage.getItem("lead.opportunity_unlocked") === "true") {
        localStorage.removeItem("lead.opportunity_unlocked");
      }
      return localStorage.getItem(REG_KEY) === "true";
    } catch (e) { return false; }
  }

  function setLocalStorageToken() {
    try { localStorage.setItem(REG_KEY, "true"); } catch (e) {}
  }

  /** Check if the user has full registration on the server */
  function checkRegistration() {
    var email = getStoredEmail();
    if (!email) return Promise.resolve(null);

    return fetch("/api/opportunity-unlock?email=" + encodeURIComponent(email))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok && d.status === "full") {
          setLocalStorageToken();
          return { status: "full", lead: d.lead };
        }
        if (d.ok && d.status === "partial") {
          return { status: "partial", lead: d.lead };
        }
        return null;
      })
      .catch(function () { return null; });
  }

  function getStoredEmail() {
    try { return localStorage.getItem("lead.email") || ""; } catch (e) { return ""; }
  }

  function storeEmail(email) {
    try { localStorage.setItem("lead.email", email); } catch (e) {}
  }

  function storeUnlockData(name, email, phone) {
    try {
      localStorage.setItem("lead.name", name);
      localStorage.setItem("lead.email", email);
      localStorage.setItem("lead.phone", phone);
    } catch (e) {}
  }

  /**
   * Submit registration to server, return promise.
   * extraData: { strategy, budgetMin, budgetMax, propertyType, state, language }
   */
  function submitRegistration(name, email, phone, consent, extraData) {
    var body = {
      name: name,
      email: email,
      phone: phone,
      contactConsent: consent,
      language: (extraData && extraData.language) || "en",
      strategy: (extraData && extraData.strategy) || null,
      budgetMin: (extraData && extraData.budgetMin) || null,
      budgetMax: (extraData && extraData.budgetMax) || null,
      propertyType: (extraData && extraData.propertyType) || null,
      state: (extraData && extraData.state) || null
    };

    return fetch("/api/opportunity-unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  /** Show the registration overlay for full reg (name+email+phone+consent) */
  function showFullGate(options, onSuccess) {
    var lang = (options && options.language) || "en";
    var isZh = lang === "zh";

    removeOverlay();

    var overlay = document.createElement("div");
    overlay.id = "opp-gate-overlay";

    var errorStyle = 'color:#dc2626;font-size:0.8rem;margin-bottom:8px;display:none;';

    var html =
      '<div class="opp-gate-box">' +
        '<h2 style="margin-top:0;">' + (isZh ? '注册后查看完整机会排名' : 'Unlock Full Opportunity Rankings') + '</h2>' +
        '<p style="color:#66736d;font-size:0.9rem;margin-bottom:20px;line-height:1.5;">' +
          (isZh
            ? '注册后解锁完整区域机会排名、评分及详细市场分析。'
            : 'Register to unlock the full suburb opportunity rankings, scores and detailed market insights.') +
        '</p>' +
        '<div style="margin-bottom:10px;">' +
          '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' + (isZh ? '姓名' : 'Name') + ' <span style="color:#dc2626;">*</span></label>' +
          '<input type="text" id="opp-gate-name" placeholder="' + (isZh ? '你的姓名' : 'Your name') + '" required style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
          '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">Email <span style="color:#dc2626;">*</span></label>' +
          '<input type="email" id="opp-gate-email" placeholder="you@example.com" required style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
          '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' + (isZh ? '电话' : 'Phone') + ' <span style="color:#dc2626;">*</span></label>' +
          '<input type="tel" id="opp-gate-phone" placeholder="' + (isZh ? '0412 345 678' : '0412 345 678') + '" required style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
        '</div>' +
        '<div style="margin-bottom:16px;">' +
          '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.85rem;color:#66736d;line-height:1.4;">' +
            '<input type="checkbox" id="opp-gate-consent" style="margin-top:2px;flex-shrink:0;" />' +
            '<span>' +
              (isZh
                ? '我同意 AusHomeValue 可以就本平台提供的房产机会信息联系我。'
                : 'I consent to AusHomeValue contacting me about property opportunities from this platform.') +
            '</span>' +
          '</label>' +
        '</div>' +
        '<div class="opp-gate-err" id="opp-gate-err" style="' + errorStyle + '"></div>' +
        '<button id="opp-gate-btn" style="width:100%;padding:12px;background:#0d6b57;color:white;border:none;border-radius:8px;font-weight:600;font-size:1rem;cursor:pointer;">' +
          (isZh ? '注册并解锁' : 'Register & Unlock') +
        '</button>' +
        '<p style="font-size:0.75rem;color:#889994;margin-top:12px;line-height:1.4;">' +
          (isZh
            ? '提交的信息将安全保存，用于报告递送和客户跟进。我们可能记录大致访问地区。'
            : 'Submission details are securely stored for opportunity delivery and follow-up. We may record an approximate region.') +
        '</p>' +
      '</div>';

    overlay.innerHTML = html;

    var style = document.createElement("style");
    style.textContent = '.opp-hidden{display:none!important}.opp-gate-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;}.opp-gate-box{background:white;border-radius:16px;padding:32px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);}';
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    /* Wire up submit */
    var btn = document.getElementById("opp-gate-btn");
    btn.addEventListener("click", function () {
      var n = getEl("opp-gate-name");
      var e = getEl("opp-gate-email");
      var p = getEl("opp-gate-phone");
      var c = getEl("opp-gate-consent");
      var err = getEl("opp-gate-err");
      var extra = options || {};

      /* Validate */
      var errors = [];
      if (!n || !n.value.trim()) errors.push(isZh ? '请输入姓名' : 'Name is required');
      if (!e || !e.value.trim() || !e.value.includes('@')) errors.push(isZh ? '请输入有效邮箱' : 'Valid email is required');
      if (!p || !p.value.trim()) errors.push(isZh ? '请输入电话号码' : 'Phone number is required');
      if (c && !c.checked) errors.push(isZh ? '请勾选联系授权' : 'Contact consent is required');

      if (errors.length) {
        if (err) {
          err.style.display = "block";
          err.textContent = errors.join(". ") + ".";
        }
        return;
      }

      btn.disabled = true;
      btn.textContent = isZh ? '提交中...' : 'Submitting...';
      if (err) err.style.display = "none";

      submitRegistration(n.value.trim(), e.value.trim(), p.value.trim(), c.checked, extra)
        .then(function (d) {
          if (d.ok && d.status === "full") {
            storeUnlockData(n.value.trim(), e.value.trim(), p.value.trim());
            setLocalStorageToken();
            removeOverlay();
            if (typeof onSuccess === "function") onSuccess(d);
          } else {
            btn.disabled = false;
            btn.textContent = isZh ? '注册并解锁' : 'Register & Unlock';
            if (err) {
              err.style.display = "block";
              err.textContent = d.error || (isZh ? '提交失败，请重试。' : 'Submission failed. Please try again.');
            }
          }
        })
        .catch(function (err2) {
          btn.disabled = false;
          btn.textContent = isZh ? '注册并解锁' : 'Register & Unlock';
          if (err) {
            err.style.display = "block";
            err.textContent = isZh ? '服务器错误，请稍后重试。' : 'Server error. Please try again later.';
          }
        });
    });
  }

  /** Show concise modal to prompt for phone + consent (for partial reg users) */
  function showPartialGate(options, onSuccess) {
    var lang = (options && options.language) || "en";
    var isZh = lang === "zh";
    var storedEmail = getStoredEmail();
    var storedName = "";
    try { storedName = localStorage.getItem("lead.name") || ""; } catch(e) {}

    removeOverlay();

    var overlay = document.createElement("div");
    overlay.id = "opp-gate-overlay";

    var html =
      '<div class="opp-gate-box">' +
        '<h2 style="margin-top:0;">' + (isZh ? '补充信息以解锁排名' : 'Complete Your Details') + '</h2>' +
        '<p style="color:#66736d;font-size:0.9rem;margin-bottom:20px;line-height:1.5;">' +
          (isZh
            ? '您之前已注册。请补充电话号码并勾选联系授权后即可查看完整排名。'
            : 'You previously registered. Please add your phone number and tick contact consent to unlock full rankings.') +
        '</p>' +
        '<div style="margin-bottom:10px;">' +
          '<label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:4px;color:#17211d;">' + (isZh ? '电话' : 'Phone') + ' <span style="color:#dc2626;">*</span></label>' +
          '<input type="tel" id="opp-gate-phone" placeholder="0412 345 678" required style="width:100%;padding:12px 14px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" />' +
        '</div>' +
        '<div style="margin-bottom:16px;">' +
          '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.85rem;color:#66736d;line-height:1.4;">' +
            '<input type="checkbox" id="opp-gate-consent" style="margin-top:2px;flex-shrink:0;" />' +
            '<span>' +
              (isZh
                ? '我同意 AusHomeValue 可以就本平台提供的房产机会信息联系我。'
                : 'I consent to AusHomeValue contacting me about property opportunities from this platform.') +
            '</span>' +
          '</label>' +
        '</div>' +
        '<div class="opp-gate-err" id="opp-gate-err" style="color:#dc2626;font-size:0.8rem;margin-bottom:8px;display:none;"></div>' +
        '<button id="opp-gate-btn" style="width:100%;padding:12px;background:#0d6b57;color:white;border:none;border-radius:8px;font-weight:600;font-size:1rem;cursor:pointer;">' +
          (isZh ? '提交并解锁' : 'Submit & Unlock') +
        '</button>' +
        '<p style="font-size:0.75rem;color:#889994;margin-top:12px;line-height:1.4;">' +
          (isZh
            ? '提交的信息将安全保存，用于机会递送和客户跟进。'
            : 'Details securely stored for opportunity delivery and follow-up.') +
        '</p>' +
      '</div>';

    overlay.innerHTML = html;

    var style = document.createElement("style");
    style.textContent = '.opp-hidden{display:none!important}.opp-gate-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;}.opp-gate-box{background:white;border-radius:16px;padding:32px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);}';
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    var btn = document.getElementById("opp-gate-btn");
    btn.addEventListener("click", function () {
      var p = getEl("opp-gate-phone");
      var c = getEl("opp-gate-consent");
      var err = getEl("opp-gate-err");

      var errors = [];
      if (!p || !p.value.trim()) errors.push(isZh ? '请输入电话号码' : 'Phone number is required');
      if (c && !c.checked) errors.push(isZh ? '请勾选联系授权' : 'Contact consent is required');

      if (errors.length) {
        if (err) { err.style.display = "block"; err.textContent = errors.join(". ") + "."; }
        return;
      }

      btn.disabled = true;
      btn.textContent = isZh ? '提交中...' : 'Submitting...';
      if (err) err.style.display = "none";

      submitRegistration(storedName, storedEmail, p.value.trim(), c.checked, options)
        .then(function (d) {
          if (d.ok && d.status === "full") {
            try { localStorage.setItem("lead.phone", p.value.trim()); } catch(e) {}
            setLocalStorageToken();
            removeOverlay();
            if (typeof onSuccess === "function") onSuccess(d);
          } else {
            btn.disabled = false;
            btn.textContent = isZh ? '提交并解锁' : 'Submit & Unlock';
            if (err) { err.style.display = "block"; err.textContent = d.error || (isZh ? '提交失败，请重试。' : 'Submission failed.'); }
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = isZh ? '提交并解锁' : 'Submit & Unlock';
          if (err) { err.style.display = "block"; err.textContent = isZh ? '服务器错误。' : 'Server error.'; }
        });
    });
  }

  function removeOverlay() {
    var existing = document.getElementById("opp-gate-overlay");
    if (existing) existing.remove();
  }

  /** Main gate: check server status, show appropriate gate or proceed */
  function runGate(options, onSuccess) {
    var gateDefaults = { language: document.documentElement.lang || "en" };
    var gateOptions = Object.assign({}, gateDefaults, options || {});

    /* This is async: returns a promise that resolves to true if gate was shown */
    return new Promise(function (resolve) {
      if (hasLocalStorageToken()) {
        resolve(false);
        return;
      }

      checkRegistration().then(function (status) {
        if (status && status.status === "full") {
          resolve(false);
          return;
        }

        if (status && status.status === "partial") {
          showPartialGate(gateOptions, function () {
            setLocalStorageToken();
            if (typeof onSuccess === "function") onSuccess();
            resolve(false);
          });
          resolve(true);
          return;
        }

        /* None or failed check — show full gate */
        showFullGate(gateOptions, function () {
          setLocalStorageToken();
          if (typeof onSuccess === "function") onSuccess();
          resolve(false);
        });
        resolve(true);
      });
    });
  }

  /* Export globally so app.js can call it */
  window.opportunityGate = {
    run: runGate,
    check: checkRegistration,
    isUnlocked: hasLocalStorageToken,
    reset: function () {
      try { localStorage.removeItem(REG_KEY); } catch(e) {}
    },
    /** Redirect unregistered users from stand-alone opp pages back to home */
    protectPage: function () {
      if (hasLocalStorageToken()) return;
      var path = window.location.pathname;
      if (path === "/opportunities/" || path === "/opportunities/index.html" || path.startsWith("/opportunities/")) {
        try { document.documentElement.style.visibility = "hidden"; } catch(e) {}
        window.setTimeout(function() {
          window.location.href = "/#opportunities";
        }, 30);
      }
    }
  };

  /* Auto-protect stand-alone opportunity pages */
  if (typeof window !== "undefined") {
    window.opportunityGate.protectPage();
  }
})();
