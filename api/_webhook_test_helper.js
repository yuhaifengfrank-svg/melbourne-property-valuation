// Temporary: expose DB state for a report
export default async function handler(req, res) {
  // Only allow this in test mode
  if (process.env.STRIPE_WEBHOOK_TEST_MODE_BYPASS !== "1") {
    return res.status(403).json({ ok: false });
  }
  
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  const reportId = req.query.report_id;
  
  if (!reportId) return res.status(400).json({error:"report_id required"});
  
  const [payments, ents, snapshots, drafts] = await Promise.all([
    sql`SELECT id, status, lead_contact_id, stripe_payment_intent_id, stripe_customer_id, stripe_checkout_session_id, purchase_intent_key, amount_cents, currency FROM report_payments WHERE report_id=${reportId}`,
    sql`SELECT id, status, lead_contact_id FROM report_entitlements WHERE report_id=${reportId}`,
    sql`SELECT id, lead_contact_id, draft_id FROM report_snapshots WHERE report_id=${reportId}`,
    sql`SELECT draft_id, property_key, lead_contact_id, consumed_at FROM report_drafts WHERE draft_id=(SELECT draft_id FROM report_snapshots WHERE report_id=${reportId} LIMIT 1)`
  ]);
  
  res.json({
    reportId,
    payments: payments.map(p => ({...p, lead_contact_id: Number(p.lead_contact_id)})),
    entitlements: ents.map(e => ({...e, lead_contact_id: Number(e.lead_contact_id)})),
    snapshots: snapshots.map(s => ({...s, lead_contact_id: s.lead_contact_id ? Number(s.lead_contact_id) : null})),
    drafts: drafts.map(d => ({...d, lead_contact_id: d.lead_contact_id ? Number(d.lead_contact_id) : null}))
  });
}
