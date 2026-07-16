const byId = (id) => document.getElementById(id);
let leads = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function regionOf(lead) {
  return [lead.ip_city, lead.ip_region, lead.ip_country].filter(Boolean).join(", ") || "Unavailable";
}

function propertyLocationOf(lead) {
  return [lead.property_suburb, lead.property_state].filter(Boolean).join(", ") || "Location not supplied";
}

function activityOf(lead) {
  const items = [];
  if (lead.event_type === "report_unlock") items.push("Unlocked");
  if (lead.pdf_download) items.push("PDF");
  if (lead.contact_consent) items.push("Consent");
  if (lead.selected_lvr) items.push(`${lead.selected_lvr}% LVR`);
  return items.join(" · ") || "Registered";
}

function renderMetrics(summary) {
  const metrics = [
    ["Total records", summary.total || 0],
    ["Hot leads", summary.hot || 0],
    ["Contact consent", summary.consented || 0],
    ["PDF requests", summary.pdf_requests || 0]
  ];
  byId("admin-metrics").innerHTML = metrics
    .map(([label, value]) => `<article class="panel"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderLeads() {
  const query = byId("lead-search").value.trim().toLowerCase();
  const priority = byId("priority-filter").value;
  const filtered = leads.filter((lead) => {
    const haystack = `${lead.name} ${lead.email} ${lead.phone || ""} ${lead.property_address} ${propertyLocationOf(lead)} ${regionOf(lead)}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!priority || lead.priority === priority);
  });

  byId("leads-body").innerHTML = filtered.length
    ? filtered
        .map(
          (lead) => `
            <tr data-id="${lead.id}">
              <td><span class="priority priority-${lead.priority.toLowerCase()}">${escapeHtml(lead.priority)} ${lead.lead_score}</span></td>
              <td><strong>${escapeHtml(lead.name)}</strong><small>${escapeHtml(lead.email)}<br />${escapeHtml(lead.phone || "No phone")}</small></td>
              <td><strong>${escapeHtml(lead.property_address)}</strong><small>${escapeHtml(propertyLocationOf(lead))}<br />${escapeHtml(lead.property_type || "Property")}</small></td>
              <td>${escapeHtml(lead.estimated_value || "Manual review")}<small>${escapeHtml(lead.confidence || "Unknown confidence")}</small></td>
              <td>${escapeHtml(activityOf(lead))}</td>
              <td>${escapeHtml(regionOf(lead))}</td>
              <td>${new Date(lead.created_at).toLocaleString("en-AU")}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="7">No matching customer records.</td></tr>`;

  document.querySelectorAll("#leads-body tr[data-id]").forEach((row) => {
    row.addEventListener("click", () => renderDetail(leads.find((lead) => String(lead.id) === row.dataset.id)));
  });
}

function renderDetail(lead) {
  if (!lead) return;
  const analysis = lead.analysis || {};
  const reasons = Array.isArray(analysis.reasons) ? analysis.reasons : [];
  const comparables = Array.isArray(analysis.comparables) ? analysis.comparables : [];
  byId("lead-detail").innerHTML = `
    <div class="lead-detail-header">
      <div>
        <p class="eyebrow">Customer analysis report</p>
        <h2>${escapeHtml(lead.name)} · ${escapeHtml(lead.property_address)}</h2>
        <p>${escapeHtml(propertyLocationOf(lead))}</p>
      </div>
      <span class="priority priority-${lead.priority.toLowerCase()}">${escapeHtml(lead.priority)} ${lead.lead_score}</span>
    </div>
    <div class="detail-grid">
      <article><span>Contact</span><strong>${escapeHtml(lead.phone || "No phone")}</strong><p>${escapeHtml(lead.email)}</p></article>
      <article><span>Engagement</span><strong>${escapeHtml(activityOf(lead))}</strong><p>${lead.contact_consent ? "Contact is authorised" : "No contact consent"}</p></article>
      <article><span>Valuation</span><strong>${escapeHtml(lead.estimated_value || "Manual review")}</strong><p>${escapeHtml(lead.confidence || "Unknown confidence")}</p></article>
      <article><span>Approx. visitor region</span><strong>${escapeHtml(regionOf(lead))}</strong><p>Coarse location only. Full IP is not displayed.</p></article>
    </div>
    <div class="analysis-columns">
      <article>
        <h3>Estimate reasons</h3>
        <ul>${reasons.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>No reason snapshot recorded.</li>"}</ul>
      </article>
      <article>
        <h3>Comparable snapshot</h3>
        <ul>${comparables.map((item) => `<li>${escapeHtml(Array.isArray(item) ? item.slice(0, 3).join(" · ") : item)}</li>`).join("") || "<li>No comparable snapshot recorded.</li>"}</ul>
      </article>
    </div>
  `;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function exportLeads() {
  const headers = [
    "Priority", "Lead Score", "Name", "Email", "Phone", "Contact Consent", "PDF Download",
    "Property Address", "Suburb", "State", "Property Type", "Estimated Value", "Confidence", "Selected LVR",
    "Event Type", "Approximate Region", "Submitted At"
  ];
  const rows = leads.map((lead) => [
    lead.priority, lead.lead_score, lead.name, lead.email, lead.phone || "", lead.contact_consent ? "Yes" : "No",
    lead.pdf_download ? "Yes" : "No", lead.property_address, lead.property_suburb || "", lead.property_state || "", lead.property_type || "", lead.estimated_value || "",
    lead.confidence || "", lead.selected_lvr || "", lead.event_type, regionOf(lead), lead.created_at
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aushomevalue-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadLeads() {
  const key = sessionStorage.getItem("aushomevalueAdminKey") || byId("admin-key").value;
  byId("admin-message").textContent = "Loading customer records...";
  const response = await fetch("/api/leads", { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(response.status === 401 ? "The administrator key is not correct." : "Could not load customer records.");
  const data = await response.json();
  sessionStorage.setItem("aushomevalueAdminKey", key);
  leads = data.leads || [];
  renderMetrics(data.summary || {});
  renderLeads();
  byId("admin-login").classList.add("hidden");
  byId("admin-dashboard").classList.remove("hidden");
}

byId("admin-key-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await loadLeads();
  } catch (error) {
    byId("admin-message").textContent = error.message;
  }
});

byId("lead-search").addEventListener("input", renderLeads);
byId("priority-filter").addEventListener("change", renderLeads);
byId("export-leads").addEventListener("click", exportLeads);
byId("refresh-leads").addEventListener("click", () => loadLeads().catch((error) => alert(error.message)));

if (sessionStorage.getItem("aushomevalueAdminKey")) loadLeads().catch(() => sessionStorage.removeItem("aushomevalueAdminKey"));
