# `scripts/` — Server-side automations attached to ghostwritersdesk.com

This folder holds source code that runs **outside** the static site itself — primarily Google Apps Script attached to the application form, and any future Apps Script utilities for analytics, notifications, or routing.

These files are **version-controlled here** but **deployed manually** by pasting them into the Google Apps Script editor attached to the relevant Google Form. They do not deploy through Vercel.

---

## `google-form-auto-confirmation.gs`

**What it does:** Sends a branded auto-confirmation email to anyone who submits the application form. Trigger fires within seconds of submission. Reply-to set to `randy@randykopplin.com` so any reply lands in Randy's inbox.

### One-time setup

1. **Open the Google Form** in edit mode.
2. **Click the three-dot menu** (top right of the form editor) → **Script editor**.
3. **Delete any default code**. Paste the entire contents of `google-form-auto-confirmation.gs`. Save (Ctrl+S).
4. **Configure the trigger:**
   - Left sidebar → **Triggers** (clock icon)
   - Click **+ Add Trigger** (bottom right)
   - Settings:
     - Choose function: `onFormSubmit`
     - Event source: `From form`
     - Event type: `On form submit`
   - Save. Apps Script will request permissions to read form responses and send mail. Grant them.
5. **Enable email collection on the form:**
   - In the form editor → **Settings** (gear icon) → **Responses** section
   - Toggle on **Collect email addresses**
   - Choose **Responder input** (lets non-Google-account applicants apply) or **Verified** (requires a signed-in Google account; stricter)
6. **Test by submitting the form yourself.** The confirmation email should arrive within ~30 seconds. Check spam if it doesn't appear.

### Quotas

- Free Gmail account: 100 emails/day
- Google Workspace account: 1500 emails/day

Both far exceed any plausible application volume.

### Updating the script

When you change `google-form-auto-confirmation.gs` in this repo, the Apps Script editor in Google does **not** auto-sync. You must:

1. Open the form's Script editor again
2. Replace the contents with the updated file from this repo
3. Save

The trigger persists across saves — you don't need to re-create it.

### Failure modes

The script logs to the Apps Script execution log on every run. To check:

1. Form's Script editor → **Executions** (left sidebar, clock-style icon)
2. Look for recent runs of `onFormSubmit`
3. Each run shows logs and timing

Common failure: missing email address. The script tries two paths to find one (form's built-in email collection, then a scan of item responses for a question titled like "email"). If both fail, it logs an error and exits without sending.

---

## Why this folder exists in the website repo

Three reasons:

1. **Version history.** The current Apps Script lives only inside the Google Form editor. If someone (or you) breaks it, there's no git-style history. Storing it here gives you a recoverable copy.
2. **Discoverability.** The funnel infrastructure (sales pages, form, confirmation email) is one system. Keeping the server-side bit in the same repo as the front-end makes that one-system framing visible.
3. **Code review.** Edits to the Apps Script go through the same diff/review pattern as edits to the sales pages — useful when changes touch the funnel flow.
