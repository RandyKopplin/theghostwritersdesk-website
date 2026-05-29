/**
 * Google Apps Script — Auto-confirmation email for The Ghostwriter's Desk application form.
 *
 * Fires on every form submission. Sends a styled confirmation email to the
 * applicant within seconds, with reply-to set so any response comes directly
 * to Randy.
 *
 * Setup:
 *   1. Open the Google Form in edit mode.
 *   2. Click the three-dot menu (top right) → Script editor.
 *   3. Delete any default code, paste this entire file, save (Ctrl+S).
 *   4. Sidebar → Triggers (clock icon) → "+ Add Trigger" (bottom right).
 *        - Choose function: onFormSubmit
 *        - Event source:    From form
 *        - Event type:      On form submit
 *      Save. Apps Script will request permissions; grant them.
 *   5. Test by submitting the form yourself. The confirmation email
 *      should arrive within ~30 seconds.
 *
 * Requirements:
 *   - Form's Settings → Responses → "Collect email addresses" enabled
 *     (set to "Responder input" if you want to accept non-Google-account
 *     applicants, or "Verified" if you want them signed in).
 *
 * Quota:
 *   - 100 emails/day on a free Gmail account, 1500/day on Workspace.
 *     Comfortable for any plausible Ghostwriter's Desk application volume.
 */

function onFormSubmit(e) {
  try {
    var email = getRespondentEmail(e);
    if (!email) {
      console.error('[onFormSubmit] No respondent email found. Confirmation not sent.');
      return;
    }

    var subject = "Got your Ghostwriter's Desk application";
    var plainBody = getPlainBody();
    var htmlBody = getHtmlBody();

    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: 'Randy Kopplin',
      replyTo: 'randy@randykopplin.com'
    });

    console.log('[onFormSubmit] Confirmation sent to ' + email);
  } catch (err) {
    console.error('[onFormSubmit] Exception: ' + err);
  }
}

/**
 * Resolves the respondent's email address.
 * Primary path: Forms' built-in email collection (requires the form setting).
 * Fallback: scan item responses for a question whose title contains "email".
 */
function getRespondentEmail(e) {
  if (e && e.response && typeof e.response.getRespondentEmail === 'function') {
    var fromCollect = e.response.getRespondentEmail();
    if (fromCollect && fromCollect.indexOf('@') !== -1) {
      return fromCollect;
    }
  }

  // Fallback: search item responses
  if (e && e.response && typeof e.response.getItemResponses === 'function') {
    var itemResponses = e.response.getItemResponses();
    for (var i = 0; i < itemResponses.length; i++) {
      var title = String(itemResponses[i].getItem().getTitle() || '').toLowerCase();
      if (title.indexOf('email') === -1) continue;
      var value = itemResponses[i].getResponse();
      if (typeof value === 'string' && value.indexOf('@') !== -1) {
        return value;
      }
    }
  }
  return null;
}

function getPlainBody() {
  return [
    "Thanks for applying. I have everything I need to give you a straight yes-or-no on fit within 48 hours.",
    "",
    "Here's what happens next:",
    "",
    "- I review what you sent.",
    "- If we're a fit, I reply with the next step (usually a calendar link for a 60-minute discovery call, no payment yet).",
    "- If we're not a fit, I tell you why and point you at whatever I can think of that would actually help.",
    "",
    "Either way, you'll have an answer inside two business days.",
    "",
    "If anything changes on your end before I respond, just reply to this email. It comes directly to me.",
    "",
    "Randy",
    "",
    "Randy Kopplin · The Ghostwriter's Desk",
    "randy@randykopplin.com",
    "https://theghostwritersdesk.com"
  ].join('\n');
}

function getHtmlBody() {
  return [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0; padding: 24px; color: #1a1a1a; line-height: 1.6; font-size: 16px;">',
    '  <p style="margin: 0 0 16px 0;">Thanks for applying. I have everything I need to give you a straight yes-or-no on fit within 48 hours.</p>',
    '  <p style="margin: 0 0 16px 0;">Here\'s what happens next:</p>',
    '  <ul style="margin: 0 0 16px 0; padding-left: 22px;">',
    '    <li style="margin-bottom: 8px;">I review what you sent.</li>',
    '    <li style="margin-bottom: 8px;">If we\'re a fit, I reply with the next step (usually a calendar link for a 60-minute discovery call, no payment yet).</li>',
    '    <li style="margin-bottom: 8px;">If we\'re not a fit, I tell you why and point you at whatever I can think of that would actually help.</li>',
    '  </ul>',
    '  <p style="margin: 0 0 16px 0;">Either way, you\'ll have an answer inside two business days.</p>',
    '  <p style="margin: 0 0 16px 0;">If anything changes on your end before I respond, just reply to this email. It comes directly to me.</p>',
    '  <p style="margin: 0 0 32px 0;">Randy</p>',
    '  <p style="margin: 0; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 14px; color: #666;">',
    '    <strong style="color: #f79546;">Randy Kopplin</strong> &middot; The Ghostwriter\'s Desk<br>',
    '    <a href="mailto:randy@randykopplin.com" style="color: #f79546; text-decoration: none;">randy@randykopplin.com</a><br>',
    '    <a href="https://theghostwritersdesk.com" style="color: #f79546; text-decoration: none;">theghostwritersdesk.com</a>',
    '  </p>',
    '</div>'
  ].join('\n');
}
