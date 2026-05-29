// Vercel serverless function — handles The Ghostwriter's Desk Discovery Intake at /intake.
//
// Two-step flow:
//   1. POST subscriber upsert to MailerLite (keyed on email). Fields are truncated to 1023
//      chars to fit MailerLite's hard limit; the full content goes via email below. The
//      subscriber is also added to the Intake Completed group.
//   2. POST a transactional email to Randy via Resend with the FULL intake content. This
//      is the load-bearing notification — MailerLite's automation emails can only go to
//      the subscriber, never to the workspace owner, so the notification cannot live in
//      MailerLite. Resend handles it.
//
// Required environment variables (set in Vercel project settings):
//   MAILERLITE_API_TOKEN              — Bearer token from MailerLite v3
//   MAILERLITE_INTAKE_GROUP_ID        — numeric group ID for Intake Completed
//   RESEND_API_KEY                    — Bearer token from Resend
//
// MailerLite custom fields expected on the account:
//   firm_context, voice_samples, ideal_client, myth, war_story,
//   unique_process, stewardship_offer

const MAILERLITE_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const NOTIFICATION_FROM = "Ghostwriter's Desk Intake <intake@aeclogix.com>";
const NOTIFICATION_TO = "randy@randykopplin.com";

module.exports = async function handler(req, res) {
  // 1. Method check
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // 2. Parse body
  const body = req.body || {};

  // 3. Honeypot
  if (body.website_url && String(body.website_url).trim() !== "") {
    return res.status(200).json({ ok: true });
  }

  // 4. Email validation
  const email = body.email && String(body.email).trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "Valid email required" });
  }

  // 5. Required-field validation
  const required = [
    "firm_context",
    "voice_samples",
    "ideal_client",
    "myth",
    "war_story",
    "unique_process",
    "stewardship_offer",
  ];
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === "") {
      return res.status(400).json({ ok: false, error: `Missing required field: ${field}` });
    }
  }

  // 6. Env-var check
  const mlToken = process.env.MAILERLITE_API_TOKEN;
  const mlGroupId = process.env.MAILERLITE_INTAKE_GROUP_ID;
  const resendKey = process.env.RESEND_API_KEY;
  if (!mlToken || !mlGroupId || !resendKey) {
    const missing = [];
    if (!mlToken) missing.push("MAILERLITE_API_TOKEN");
    if (!mlGroupId) missing.push("MAILERLITE_INTAKE_GROUP_ID");
    if (!resendKey) missing.push("RESEND_API_KEY");
    console.error("Missing env vars:", missing.join(", "));
    return res.status(500).json({ ok: false, error: "Server misconfigured" });
  }

  // 7. Helper — truncate for MailerLite's 1024-char field cap.
  // Full content goes via email; MailerLite is the truncated record for dashboard
  // visibility and future segmentation.
  const truncateForMailerLite = (s) => {
    const trimmed = String(s || "").trim();
    if (trimmed.length <= 1023) return trimmed;
    return trimmed.substring(0, 1007) + " [...see email]";
  };

  // 8. Build the full intake content for the email body
  const fullIntakeBody = [
    "NEW DISCOVERY INTAKE COMPLETED",
    "",
    `Email:  ${email}`,
    "",
    "INTAKE RESPONSES:",
    "",
    "--- FIRM CONTEXT ---",
    String(body.firm_context).trim(),
    "",
    "--- VOICE SAMPLES ---",
    String(body.voice_samples).trim(),
    "",
    "--- IDEAL CLIENT ---",
    String(body.ideal_client).trim(),
    "",
    "--- MYTH ---",
    String(body.myth).trim(),
    "",
    "--- WAR STORY ---",
    String(body.war_story).trim(),
    "",
    "--- UNIQUE PROCESS ---",
    String(body.unique_process).trim(),
    "",
    "--- STEWARDSHIP + PAID OFFER ---",
    String(body.stewardship_offer).trim(),
    "",
  ].join("\n");

  // 9. Upsert to MailerLite (truncated fields, group membership)
  try {
    const mlPayload = {
      email: email,
      fields: {
        firm_context: truncateForMailerLite(body.firm_context),
        voice_samples: truncateForMailerLite(body.voice_samples),
        ideal_client: truncateForMailerLite(body.ideal_client),
        myth: truncateForMailerLite(body.myth),
        war_story: truncateForMailerLite(body.war_story),
        unique_process: truncateForMailerLite(body.unique_process),
        stewardship_offer: truncateForMailerLite(body.stewardship_offer),
      },
      groups: [String(mlGroupId)],
    };

    const mlResponse = await fetch(MAILERLITE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mlToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(mlPayload),
    });

    if (!mlResponse.ok) {
      const errBody = await mlResponse.text();
      console.error("MailerLite error:", mlResponse.status, errBody);
      return res.status(502).json({ ok: false, error: "Intake service unavailable" });
    }
  } catch (err) {
    console.error("MailerLite handler exception:", err);
    return res.status(500).json({ ok: false, error: "Intake submission failed (mailerlite)" });
  }

  // 10. Send notification email to Randy via Resend with the FULL content
  try {
    const resendPayload = {
      from: NOTIFICATION_FROM,
      to: [NOTIFICATION_TO],
      reply_to: email,
      subject: `New Intake — ${email}`,
      text: fullIntakeBody,
    };

    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    if (!resendResponse.ok) {
      const errBody = await resendResponse.text();
      console.error("Resend error:", resendResponse.status, errBody);
      // MailerLite already succeeded; report a soft failure but still 200 so the
      // user doesn't see an error on the form. The MailerLite record is the
      // recoverable source of truth.
      return res.status(200).json({
        ok: true,
        warning: "Subscriber recorded, but notification email delivery failed. See server logs.",
      });
    }
  } catch (err) {
    console.error("Resend handler exception:", err);
    return res.status(200).json({
      ok: true,
      warning: "Subscriber recorded, but notification email delivery threw. See server logs.",
    });
  }

  return res.status(200).json({ ok: true });
};
