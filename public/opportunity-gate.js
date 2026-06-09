/* opportunity-gate.js - Registration gate for static opportunity pages.
   Loaded by /opportunities/*.html. Hides results until user registers. */
(function(){
  var STORAGE_KEY = "lead.opportunity_unlocked";
  function isUnlocked(){
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch(e){ return false; }
  }
  function registerUnlock(){
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch(e){}
  }
  function submitLead(name, email){
    var btn = document.getElementById("opp-gate-btn");
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = "Submitting...";
    var errEl = document.getElementById("opp-gate-err");
    if (errEl) errEl.style.display = "none";
    fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        email: email,
        propertyAddress: "Opportunity page access",
        source: "opportunities",
        shouldSendNotification: false
      })
    }).then(function(r){ return r.json(); }).then(function(d){
      if (d && d.ok){
        registerUnlock();
        var overlay = document.getElementById("opp-gate-overlay");
        if (overlay) overlay.style.display = "none";
        var cards = document.querySelectorAll(".card");
        for (var i = 0; i < cards.length; i++) cards[i].classList.remove("opp-hidden");
      } else {
        if (errEl) errEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Unlock Results";
      }
    }).catch(function(){
      if (errEl) errEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Unlock Results";
    });
  }
  function buildGate(){
    if (document.getElementById("opp-gate-overlay")) return;
    var overlay = document.createElement("div");
    overlay.id = "opp-gate-overlay";
    overlay.className = "opp-gate-overlay";
    overlay.innerHTML =
      '<div class="opp-gate-box">' +
      '<h2>Unlock Opportunity Rankings</h2>' +
      '<p>Enter your name and email to access the full ranked list of property opportunities.</p>' +
      '<div><input type="text" id="opp-gate-name" placeholder="Your name" required style="width:100%;padding:12px 14px;margin-bottom:10px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" /></div>' +
      '<div><input type="email" id="opp-gate-email" placeholder="Your email" required style="width:100%;padding:12px 14px;margin-bottom:10px;border:1px solid #dbe2de;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" /></div>' +
      '<div class="opp-gate-err" id="opp-gate-err" style="color:#dc2626;font-size:0.8rem;margin-bottom:8px;display:none;">Submission failed. Please try again.</div>' +
      '<button id="opp-gate-btn" style="width:100%;padding:12px;background:#0d6b57;color:white;border:none;border-radius:8px;font-weight:600;font-size:1rem;cursor:pointer;">Unlock Results</button>' +
      '<small style="display:block;margin-top:12px;color:#889996;font-size:0.75rem;text-align:center;">We respect your privacy. Unsubscribe anytime.</small>' +
      '</div>';
    document.body.appendChild(overlay);
    var btn = document.getElementById("opp-gate-btn");
    if (btn){
      btn.onclick = function(){
        var n = document.getElementById("opp-gate-name");
        var e = document.getElementById("opp-gate-email");
        if (n && e && n.value.trim() && e.value.trim()){
          submitLead(n.value.trim(), e.value.trim());
        } else {
          var errEl2 = document.getElementById("opp-gate-err");
          if (errEl2){ errEl2.textContent = "Please fill in both name and email."; errEl2.style.display = "block"; }
        }
      };
    }
  }
  if (!isUnlocked()){
    var style = document.createElement("style");
    style.textContent = '.opp-hidden{display:none!important}.opp-gate-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;}.opp-gate-box{background:white;border-radius:16px;padding:32px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);}.opp-gate-box h2{margin-bottom:8px;}.opp-gate-box p{color:#66736d;font-size:0.9rem;margin-bottom:20px;}';
    document.head.appendChild(style);
    var cards = document.querySelectorAll(".card");
    for (var i = 0; i < cards.length; i++) cards[i].classList.add("opp-hidden");
    if (document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", buildGate);
    } else {
      buildGate();
    }
  }
})();
