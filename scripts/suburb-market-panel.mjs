const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export function marketSnapshotPanel(suburb) {
  const safeSuburb = escapeHtml(suburb);
  return `<section class="market-snapshot" data-suburb-market data-suburb="${safeSuburb}" aria-busy="true">
    <div class="section-kicker">LIVE MARKET SNAPSHOT · 实时市场快照</div>
    <h2>房价、投资信号与估值入口</h2>
    <p class="section-intro" data-market-status>正在读取AusHomeValue当前数据库 / Loading current market data…</p>
    <div class="metric-grid">
      <article class="metric-card"><div class="metric-label">Median house price / 独立屋中位价</div><div class="metric-value" data-market-field="house-price">Loading…</div><div class="metric-meta" data-market-meta="house-price">Current database snapshot</div></article>
      <article class="metric-card"><div class="metric-label">Median unit price / Unit中位价</div><div class="metric-value" data-market-field="unit-price">Loading…</div><div class="metric-meta" data-market-meta="unit-price">Current database snapshot</div></article>
      <article class="metric-card"><div class="metric-label">Future Opportunity Index</div><div class="metric-value" data-market-field="opportunity-score">Loading…</div><div class="metric-meta" data-market-meta="opportunity-score">3–5 year relative screening signal; not a price forecast</div></article>
      <article class="metric-card"><div class="metric-label">School signal / 学校信号</div><div class="metric-value" data-market-field="school-score">Loading…</div><div class="metric-meta">Relative research signal, not a school guarantee</div></article>
      <article class="metric-card"><div class="metric-label">Supply constraint / 供应约束</div><div class="metric-value" data-market-field="supply-score">Loading…</div><div class="metric-meta">Relative model signal; read with the planning evidence below</div></article>
      <article class="metric-card"><div class="metric-label">Rental market / 租赁市场</div><div class="metric-value market-rent-value" data-market-field="rent">Checking…</div><div class="metric-meta" data-market-meta="rent">Only publishable 3/4-bedroom house rent, yield or vacancy data will be shown.</div></article>
    </div>
    <div class="valuation-cta"><div><strong>需要具体物业估值？</strong><br><span>Suburb中位价不是某套房产的估值。输入地址后，系统会结合可比成交、物业类型和位置生成估值区间。</span></div><a href="/#valuation">输入地址获取估值 / Get property estimate</a></div>
  </section>`;
}
