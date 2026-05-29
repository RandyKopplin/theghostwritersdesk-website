// Temporary diagnostic endpoint. Reports which MailerLite env vars the function
// runtime can see — without revealing the values. Delete after wiring confirmed.
//
// Hit: https://theghostwritersdesk.com/api/debug-env

module.exports = async function handler(req, res) {
  const target = [
    "MAILERLITE_API_TOKEN",
    "MAILERLITE_APPLICATIONS_GROUP_ID",
    "MAILERLITE_INTAKE_GROUP_ID",
    "MAILERLITE_NEWSLETTER_GROUP_ID",
  ];
  const status = {};
  for (const name of target) {
    const val = process.env[name];
    if (typeof val === "undefined") {
      status[name] = "MISSING";
    } else if (val === "") {
      status[name] = "EMPTY STRING";
    } else {
      status[name] = `SET (length ${val.length})`;
    }
  }
  // Also list all env var names starting with MAILERLITE to catch typos
  const allMailerLiteKeys = Object.keys(process.env).filter(k => k.toUpperCase().includes("MAILERLITE")).sort();

  return res.status(200).json({
    runtime: "vercel-node",
    expectedVars: status,
    allMailerLiteRelatedKeys: allMailerLiteKeys,
  });
};
