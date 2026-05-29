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

  // 6. Env-var check — verbose for diagnostic, revert to generic after wiring confirmed
  const token = process.env.MAILERLITE_API_TOKEN;
  const groupId = process.env.MAILERLITE_INTAKE_GROUP_ID;
  if (!token || !groupId) {
    const missing = [];
    if (!token) missing.push("MAILERLITE_API_TOKEN");
    if (!groupId) missing.push("MAILERLITE_INTAKE_GROUP_ID");
    console.error("Missing env vars:", missing.join(", "));
    return res.status(500).json({
      ok: false,
      error: `Server misconfigured: missing ${missing.join(", ")}`
    });
  }

  // 7. Upsert subscriber to MailerLite v3 with intake fields + Intake Completed group.
  // POST /api/subscribers performs an upsert: if the email already exists (which it
  // should, since the applicant came through /api/apply first), the existing fields
  // are updated and the subscriber is added to the new group while remaining in
  // the Applications group.
  // MailerLite v3 caps each custom text field at 1024 characters. Real intake
  // answers (voice samples, war stories) routinely exceed that, so we build one
  // concatenated intake-content string with section headers and chunk it across
  // the 7 existing field names. The MailerLite email template just concatenates
  // these 7 fields in order to reassemble the full intake content.
  //
  // Total capacity: 7 × 1023 chars = ~7,161 chars. Sufficient for any realistic
  // intake. If content exceeds capacity, the last chunk is marked as truncated.
  try {
    const intakeContent = [
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
    ].join("\n");

    const CHUNK_SIZE = 1023;
    const CHUNK_NAMES = [
      "firm_context",
      "voice_samples",
      "ideal_client",
      "myth",
      "war_story",
      "unique_process",
      "stewardship_offer",
    ];
    const TRUNCATION_MARKER = " [...content truncated]";

    const chunks = {};
    for (let i = 0; i < CHUNK_NAMES.length; i++) {
      chunks[CHUNK_NAMES[i]] = intakeContent.substring(
        i * CHUNK_SIZE,
        (i + 1) * CHUNK_SIZE
      ) || "";
    }
    // Mark truncation if content exceeds total capacity
    if (intakeContent.length > CHUNK_NAMES.length * CHUNK_SIZE) {
      const last = CHUNK_NAMES[CHUNK_NAMES.length - 1];
      chunks[last] = chunks[last].substring(0, CHUNK_SIZE - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
      console.warn(`[intake] Content (${intakeContent.length} chars) exceeded capacity (${CHUNK_NAMES.length * CHUNK_SIZE}) for ${email}`);
    }

    const payload = {
      email: email,
      fields: chunks,
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
      // Temporary verbose response so wiring failures self-diagnose.
      return res.status(502).json({
        ok: false,
        error: "Intake service unavailable",
        debug: { status: mlResponse.status, mlError: String(errBody).substring(0, 800) }
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Intake handler exception:", err);
    return res.status(500).json({ ok: false, error: "Intake submission failed" });
  }
};
