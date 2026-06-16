// ── lib/notify-registration.js ──
// Sends an email notification via Resend API when a new lead registers.
//
// Called by api/lead-consent.js after successful lead_contact upsert.
// If RESEND_API_KEY is not configured, the notification is silently skipped.
//
// Uses fetch() directly — no additional npm dependencies required.
// Resend free tier: 100 emails/day.

/**
 * Attempt to send a registration notification email to the admin.
 *
 * @param {string} email  - The registrant's email address
 * @param {string} name   - The registrant's name (may be empty)
 * @param {string} phone  - The registrant's phone number (may be empty)
 * @returns {Promise<void>} Resolves when the email is sent (or silently skipped)
 */
export async function sendRegistrationNotification(email, name, phone) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    // No API key configured — skip notification silently
    return;
  }

  const now = new Date().toISOString();
  const displayName = name || "(not provided)";
  const displayPhone = phone || "(not provided)";

  const html = `
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; max-width: 560px;">
        <h2 style="color: #1a1a2e;">New Valuation Lead Registration</h2>
        <hr style="border: 1px solid #e0e0e0;" />
        <table style="margin-top: 16px; width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 12px; font-weight: 600; color: #555; width: 100px;">Email</td>
            <td style="padding: 8px 12px;">${escapeHtml(email)}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="padding: 8px 12px; font-weight: 600; color: #555;">Name</td>
            <td style="padding: 8px 12px;">${escapeHtml(displayName)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: 600; color: #555;">Phone</td>
            <td style="padding: 8px 12px;">${escapeHtml(displayPhone)}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="padding: 8px 12px; font-weight: 600; color: #555;">Time</td>
            <td style="padding: 8px 12px;">${escapeHtml(now)}</td>
          </tr>
        </table>
        <hr style="border: 1px solid #e0e0e0; margin-top: 16px;" />
        <p style="color: #888; font-size: 12px; margin-top: 8px;">
          Sent by AusHomeValue lead contact registration system
        </p>
      </body>
    </html>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AusHomeValue <notifications@aushomevalue.com.au>",
      to: ["info@aushomevalue.com.au"],
      subject: "New valuation lead registration",
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "(no response body)");
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
