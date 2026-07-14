const RESEND_ENDPOINT = "https://api.resend.com/emails";

const EXPOSED_PROVIDER_STATUSES = new Set([400, 401, 403, 404, 409, 422, 429]);

export class EmailDeliveryError extends Error {
  constructor(code) {
    super("Email delivery failed");
    this.name = "EmailDeliveryError";
    this.code = code;
  }
}

function providerErrorCode(status) {
  if (EXPOSED_PROVIDER_STATUSES.has(status)) return `EMAIL_PROVIDER_${status}`;
  if (status >= 500 && status <= 599) return "EMAIL_PROVIDER_5XX";
  return "EMAIL_PROVIDER_OTHER";
}

export async function sendResendEmail(message, options = {}) {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!apiKey) throw new EmailDeliveryError("EMAIL_NOT_CONFIGURED");
  if (typeof fetchImpl !== "function") {
    throw new EmailDeliveryError("EMAIL_TRANSPORT_UNAVAILABLE");
  }

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
    throw new EmailDeliveryError(providerErrorCode(response.status));
  }
  return true;
}
