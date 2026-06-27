const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendResendEmail(message, options = {}) {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!apiKey) throw new Error("EMAIL_NOT_CONFIGURED");
  if (typeof fetchImpl !== "function") throw new Error("EMAIL_TRANSPORT_UNAVAILABLE");

  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: message.from,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`EMAIL_PROVIDER_ERROR_${response.status}`);
  }
  return true;
}
