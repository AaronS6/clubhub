/**
 * Email sending — server-side only.
 *
 * Four transports, auto-selected by environment (first configured wins):
 *
 *   1. SendGrid HTTPS API — set SENDGRID_API_KEY. Plain HTTPS (port 443),
 *      so it works on hosts that block outbound SMTP (Render's FREE plan
 *      blocks 25/465/587 since Sept 26, 2025). Free tier: 100 emails/day.
 *      No custom domain needed — verify a single sender address (your
 *      Gmail, via the confirmation email SendGrid sends) and you can
 *      deliver to ANY recipient.
 *
 *   2. Brevo HTTPS API — set BREVO_API_KEY. Also plain HTTPS, so also
 *      Render-free-plan safe. Free tier: 300 emails/day. Same zero-domain
 *      story: verify one sender address, deliver anywhere.
 *
 *   3. SMTP (nodemailer) — set SMTP_HOST + SMTP_USER + SMTP_PASS. Works
 *      with any SMTP provider (e.g. Gmail App Password). NOTE: unusable on
 *      Render's free plan (blocked ports) — use there only on paid plans /
 *      other hosts.
 *
 *   4. Resend API (https://resend.com) — set RESEND_API_KEY. HTTPS, works
 *      on any host, but WITHOUT a verified custom domain its sandbox
 *      sender only delivers to your own Resend account email.
 *
 * API transports are checked BEFORE SMTP deliberately: on SMTP-blocked
 * hosts (Render free) both may linger in the env, and the API key is the
 * one that can actually connect. If NOTHING is configured, `sendEmail`
 * logs a warning and returns gracefully (no throw) — the app stays fully
 * functional without an email provider.
 *
 * Environment variables:
 *   - SENDGRID_API_KEY (optional) — SendGrid API key (SG.*). The verified
 *                                sender address goes in EMAIL_FROM.
 *   - BREVO_API_KEY   (optional) — Brevo API key (xkeysib-*).
 *   - SMTP_HOST      (optional) — SMTP server hostname, e.g. smtp.gmail.com
 *   - SMTP_PORT      (optional) — Defaults to 465 (implicit TLS). Use 587 for
 *                                STARTTLS. Any other port also uses STARTTLS.
 *   - SMTP_USER      (optional) — SMTP username (for Gmail: the full address)
 *   - SMTP_PASS      (optional) — SMTP password (for Gmail: an App Password,
 *                                NOT the account password)
 *   - RESEND_API_KEY  (optional) — Resend API key. Without it, Resend is a no-op.
 *   - EMAIL_FROM      (optional) — From address, e.g.
 *                                 `ClubHub <clubhub.notifies@gmail.com>`.
 *                                 REQUIRED for SendGrid/Brevo (their APIs need
 *                                 an explicit verified sender). Defaults for
 *                                 the others: SMTP → `ClubHub <SMTP_USER>`;
 *                                 Resend → `ClubHub <onboarding@resend.dev>`.
 */

import { Resend } from "resend"
import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

/** Parse `"Name <a@b.c>"` / `"a@b.c"` into { name, email }. */
function parseFromAddress(raw: string): { name: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>\s]+)>\s*$/.exec(raw)
  if (m) return { name: m[1] || "ClubHub", email: m[2] }
  return { name: "ClubHub", email: raw.trim() }
}

let _client: Resend | null | undefined
let _transporter: Transporter | null | undefined

function sendgridConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY)
}
function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY)
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

function getSmtpTransporter(): Transporter | null {
  if (!smtpConfigured()) return null
  if (_transporter === undefined) {
    const port = Number(process.env.SMTP_PORT || 465)
    // Port 465 = implicit TLS (secure: true); 587 and friends negotiate
    // STARTTLS after connecting (secure: false).
    const secure = port === 465 || process.env.SMTP_SECURE === "true"
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return _transporter
}

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
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM
  if (sendgridConfigured() || brevoConfigured()) {
    // No sane default for API transports — the sender MUST be a verified
    // address on the provider. This placeholder fails loudly at send time
    // (the provider rejects it) instead of silently sending from nowhere.
    return "ClubHub <clubhub@example.com>"
  }
  if (smtpConfigured()) return `ClubHub <${process.env.SMTP_USER}>`
  return "ClubHub <onboarding@resend.dev>"
}

export function isEmailConfigured(): boolean {
  return (
    sendgridConfigured() ||
    brevoConfigured() ||
    smtpConfigured() ||
    Boolean(process.env.RESEND_API_KEY)
  )
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
}

/**
 * Send a transactional email. Best-effort: logs a warning and returns
 * gracefully if no transport is configured or if the send fails. Never
 * throws to the caller. Transport order: SendGrid → Brevo → SMTP → Resend.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string; reason?: string }> {
  // ── Transport 1: SendGrid HTTPS API ─────────────────────────────────
  if (sendgridConfigured()) {
    if (!process.env.EMAIL_FROM) {
      const msg =
        "SENDGRID_API_KEY is set but EMAIL_FROM is missing — set EMAIL_FROM to your verified SendGrid sender address, e.g. 'ClubHub <you@gmail.com>'"
      console.error("[email]", msg)
      return { ok: false, reason: msg }
    }
    try {
      const from = parseFromAddress(getFromAddress())
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: input.to }] }],
          from: { email: from.email, name: from.name },
          subject: input.subject,
          content: [{ type: "text/html", value: input.html }],
        }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => "")
        console.error("[email] SendGrid send failed:", res.status, errText.slice(0, 300))
        return { ok: false, reason: `SendGrid error ${res.status}` }
      }
      // 202 Accepted; the message id lives in the X-Message-Id header.
      const id = res.headers.get("x-message-id") ?? undefined
      console.log("[email] Sent successfully via SendGrid to:", input.to)
      return { ok: true, id }
    } catch (e) {
      console.error("[email] SendGrid send failed:", e)
      return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  // ── Transport 2: Brevo HTTPS API ────────────────────────────────────
  if (brevoConfigured()) {
    if (!process.env.EMAIL_FROM) {
      const msg =
        "BREVO_API_KEY is set but EMAIL_FROM is missing — set EMAIL_FROM to your verified Brevo sender address, e.g. 'ClubHub <you@gmail.com>'"
      console.error("[email]", msg)
      return { ok: false, reason: msg }
    }
    try {
      const from = parseFromAddress(getFromAddress())
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": process.env.BREVO_API_KEY as string,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: from.email, name: from.name },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: input.html,
        }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => "")
        console.error("[email] Brevo send failed:", res.status, errText.slice(0, 300))
        return { ok: false, reason: `Brevo error ${res.status}` }
      }
      const data = (await res.json().catch(() => null)) as { messageId?: string } | null
      console.log("[email] Sent successfully via Brevo to:", input.to)
      return { ok: true, id: data?.messageId }
    } catch (e) {
      console.error("[email] Brevo send failed:", e)
      return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  // ── Transport 3: SMTP (nodemailer) ──────────────────────────────
  const transporter = getSmtpTransporter()
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: getFromAddress(),
        to: input.to,
        subject: input.subject,
        html: input.html,
      })
      console.log("[email] Sent successfully via SMTP to:", input.to, "response:", info.response)
      return { ok: true, id: info.messageId }
    } catch (e) {
      console.error("[email] SMTP send failed:", e)
      return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  // ── Transport 4: Resend API ─────────────────────────────────────────────
  const client = getClient()
  if (!client) {
    // Always log — in production this signals a missing RESEND_API_KEY /
    // SMTP_* config that needs attention; in dev it's a reminder that email
    // is a no-op.
    console.error(
      "[email] No transport configured (set SENDGRID_API_KEY / BREVO_API_KEY / SMTP_HOST+USER+PASS / RESEND_API_KEY) — skipping email send to",
      input.to,
      "(subject:",
      input.subject,
      ")",
    )
    return { ok: false, reason: "No email transport configured" }
  }
  try {
    const { data, error } = await client.emails.send({
      from: getFromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
    })
    if (error) {
      console.error("[email] Resend returned error:", error)
      return { ok: false, reason: String(error.message ?? error.name ?? error) }
    }
    console.log("[email] Sent successfully to:", input.to, "ID:", data?.id)
    return { ok: true, id: data?.id }
  } catch (e) {
    console.error("[email] sendEmail failed:", e)
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
