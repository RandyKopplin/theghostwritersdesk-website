// Vercel serverless function — handles The Ghostwriter's Desk application form at /apply.
//
// Accepts a JSON POST from the application page, validates a honeypot and required fields,
// then creates a MailerLite subscriber in the Applications group with custom fields populated.
//
// Required environment variables (set in Vercel project settings):
//   MAILERLITE_API_TOKEN                    — Bearer token from MailerLite v3
//   MAILERLITE_APPLICATIONS_GROUP_ID        — numeric group ID for Applications
//
// MailerLite custom fields expected on the account:
//   firm, firm_url, service_interest, niche_icp, problem, phone, source_page
//   (plus the built-in "name" attribute)

const MAILERLITE_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";

module.exports = async function handler(req, res) {
  // 1. Method check
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  // 2. Parse body
  const body = req.body || {};

  // 3. Honeypot — `website_url` is a hidden input bots typically fill in
  if (body.website_url && String(body.website_url).trim() !== "") {
    // Silently succeed
    return res.status(200).json({ ok: true });
  }

  // 4. Email validation
  const email = body.email && String(body.email).trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "Valid email required" });
  }

  // 5. Required-field validation
  const required = ["name", "firm", "service_interest", "niche_icp", "problem"];
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === "") {
      return res.status(400).json({ ok: false, error: `Missing required field: ${field}` });
    }
  }

  // 6. Env-var check (detail goes to logs only, response stays generic)
  const token = process.env.MAILERLITE_API_TOKEN;
  const groupId = process.env.MAILERLITE_APPLICATIONS_GROUP_ID;
  if (!token || !groupId) {
    const missing = [];
    if (!token) missing.push("MAILERLITE_API_TOKEN");
    if (!groupId) missing.push("MAILERLITE_APPLICATIONS_GROUP_ID");
    console.error("Missing env vars:", missing.join(", "));
    return res.status(500).json({ ok: false, error: "Server misconfigured" });
  }

  // 7. Compose problem field — if "Other" picked, append the free-text detail
  let problemValue = String(body.problem).trim();
  const problemOther = body.problem_other && String(body.problem_other).trim();
  if (problemValue.toLowerCase() === "other" && problemOther) {
    problemValue = `Other: ${problemOther}`;
  }

  // 8. Submit to MailerLite v3
  try {
    const mlResponse = await fetch(MAILERLITE_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        email: email,
        fields: {
          name: String(body.name).trim(),
          firm: String(body.firm).trim(),
          firm_url: body.firm_url ? String(body.firm_url).trim() : "",
          service_interest: String(body.service_interest).trim(),
          niche_icp: String(body.niche_icp).trim(),
          problem: problemValue,
          phone: body.phone ? String(body.phone).trim() : "",
          source_page: body.source_page ? String(body.source_page).trim() : "",
        },
        groups: [String(groupId)],
      }),
    });

    if (!mlResponse.ok) {
      const errBody = await mlResponse.text();
      console.error("MailerLite error:", mlResponse.status, errBody);
      // Temporary verbose response so wiring failures self-diagnose.
      // Revert to generic message after the funnel is confirmed working.
      return res.status(502).json({
        ok: false,
        error: "Application service unavailable",
        debug: { status: mlResponse.status, mlError: String(errBody).substring(0, 800) }
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Apply handler exception:", err);
    return res.status(500).json({ ok: false, error: "Application submission failed" });
  }
};
