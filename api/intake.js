// Vercel serverless function — handles The Ghostwriter's Desk Discovery Intake at /intake.
//
// Accepts a JSON POST from the intake page. Upserts the existing applicant record in
// MailerLite (keyed on email) with the seven intake custom fields, and adds the
// subscriber to the Intake Completed group.
//
// Required environment variables (set in Vercel project settings):
//   MAILERLITE_API_TOKEN              — Bearer token from MailerLite v3 (reused from /api/apply)
//   MAILERLITE_INTAKE_GROUP_ID        — numeric group ID for Intake Completed
//
// MailerLite custom fields expected on the account:
//   firm_context, voice_samples, ideal_client, myth, war_story,
//   unique_process, stewardship_offer
//   (Plus the built-in "name" attribute, optionally re-captured here.)

const MAILERLITE_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";

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

  // 4. Email validation (this email must match the original application's email)
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

  // 6. Env-var check (detail to logs only)
  const token = process.env.MAILERLITE_API_TOKEN;
  const groupId = process.env.MAILERLITE_INTAKE_GROUP_ID;
  if (!token || !groupId) {
    const missing = [];
    if (!token) missing.push("MAILERLITE_API_TOKEN");
    if (!groupId) missing.push("MAILERLITE_INTAKE_GROUP_ID");
    console.error("Missing env vars:", missing.join(", "));
    return res.status(500).json({ ok: false, error: "Server misconfigured" });
  }

  // 7. Upsert subscriber to MailerLite v3 with intake fields + Intake Completed group.
  // POST /api/subscribers performs an upsert: if the email already exists (which it
  // should, since the applicant came through /api/apply first), the existing fields
  // are updated and the subscriber is added to the new group while remaining in
  // the Applications group.
  try {
    const payload = {
      email: email,
      fields: {
        firm_context: String(body.firm_context).trim(),
        voice_samples: String(body.voice_samples).trim(),
        ideal_client: String(body.ideal_client).trim(),
        myth: String(body.myth).trim(),
        war_story: String(body.war_story).trim(),
        unique_process: String(body.unique_process).trim(),
        stewardship_offer: String(body.stewardship_offer).trim(),
      },
      groups: [String(groupId)],
    };

    const mlResponse = await fetch(MAILERLITE_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!mlResponse.ok) {
      const errBody = await mlResponse.text();
      console.error("MailerLite error:", mlResponse.status, errBody);
      return res.status(502).json({ ok: false, error: "Intake service unavailable" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Intake handler exception:", err);
    return res.status(500).json({ ok: false, error: "Intake submission failed" });
  }
};
