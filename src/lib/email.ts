/**
 * Email sending — server-side only.
 *
 * Uses Resend (https://resend.com). The Resend API key is OPTIONAL — if
 * `RESEND_API_KEY` is unset/empty, `sendEmail` logs a warning and returns
 * gracefully (no throw). This keeps the app fully functional in dev without
 * an email provider configured.
 *
 * Environment variables:
 *   - RESEND_API_KEY  (optional) — Resend API key. Without it, email is a no-op.
 *   - EMAIL_FROM      (optional) — From address override. Defaults to
 *                                 `ClubHub <onboarding@resend.dev>` (Resend's
 *                                 sandbox sender, which only sends to the
 *                                 account owner's own verified email). Set
 *                                 this to `ClubHub <noreply@yourdomain.com>`
 *                                 once you verify your domain in Resend.
 */

import { Resend } from "resend"

let _client: Resend | null | undefined

function getClient(): Resend | null {
  if (_client === undefined) {
    const key = process.env.RESEND_API_KEY
    if (!key) {
      _client = null
    } else {
      _client = new Resend(key)
    }
  }
  return _client
}

export function getFromAddress(): string {
  return process.env.EMAIL_FROM || "ClubHub <onboarding@resend.dev>"
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
}

/**
 * Send a transactional email via Resend. Best-effort: logs a warning and
 * returns gracefully if Resend is not configured or if the API call fails.
 * Never throws to the caller.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const client = getClient()
  if (!client) {
    console.error("[email] RESEND_API_KEY is not set — email NOT sent to:", input.to)
    return { ok: false, reason: "RESEND_API_KEY not configured" }
  }
  try {
    const { data, error } = await client.emails.send({
      from: getFromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
    })
    if (error) {
      console.error("[email] Resend API error:", JSON.stringify(error))
      return { ok: false, reason: String(error.message ?? error.name ?? JSON.stringify(error)) }
    }
    console.log("[email] Sent successfully to:", input.to, "ID:", data?.id)
    return { ok: true, id: data?.id }
  } catch (e) {
    console.error("[email] sendEmail exception:", e instanceof Error ? e.message : String(e))
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Render a clean, responsive HTML email. Inline CSS for max email-client
 * compatibility. Max width 560px. Accent-colored header. Club name in footer.
 *
 *   renderEmailHtml({
 *     title: "Service hours approved",
 *     preheader: "Your 4.0 hours were approved.",
 *     bodyLines: ["Great news — your submission was approved."],
 *     ctaText: "View hours",
 *     ctaUrl: "https://clubhub.app/?view=hours",
 *     clubName: "Robotics Club",
 *   })
 */
export function renderEmailHtml(input: {
  title: string
  preheader?: string
  bodyLines: string[]
  ctaText?: string
  ctaUrl?: string
  clubName?: string
}): string {
  const { title, preheader, bodyLines, ctaText, ctaUrl, clubName } = input

  // Accent = warm emerald (matches app default). Hex must be inline.
  const ACCENT = "#10b981"
  const ACCENT_DARK = "#047857"
  const TEXT = "#18181b"
  const MUTED = "#71717a"
  const BORDER = "#e4e4e7"
  const BG = "#f4f4f5"
  const CARD = "#ffffff"

  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : ""

  const bodyParagraphs = bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:${TEXT};">${escapeHtml(line)}</p>`,
    )
    .join("")

  const ctaHtml =
    ctaText && ctaUrl
      ? `<a href="${escapeAttr(ctaUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;border:1px solid ${ACCENT_DARK};">${escapeHtml(ctaText)}</a>`
      : ""

  const footerClub = clubName ? ` &middot; ${escapeHtml(clubName)}` : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
  ${preheaderHtml}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${CARD};border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:${ACCENT};padding:20px 28px;">
              <div style="font-size:16px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">ClubHub</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:${TEXT};line-height:1.3;">${escapeHtml(title)}</h1>
              ${bodyParagraphs}
              ${ctaHtml ? `<div style="margin-top:20px;">${ctaHtml}</div>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid ${BORDER};background:#fafafa;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">
                You received this email because of your ClubHub notification preferences${footerClub}.<br/>
                Manage your settings from the Account Settings dialog.
              </p>
            </td>
          </tr>
        </table>
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding:16px 8px 0 8px;text-align:center;">
              <p style="margin:0;font-size:11px;color:${MUTED};">&copy; ${new Date().getFullYear()} ClubHub &middot; Multi-club management platform</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
