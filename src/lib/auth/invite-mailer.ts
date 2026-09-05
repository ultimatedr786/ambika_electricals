import "server-only";

import { createHash } from "node:crypto";

/**
 * Staff-invitation email delivery (Stage F) — Resend API, server-only.
 *
 * Boundary rule: Supabase Auth owns every *authentication* email (signup
 * confirmation, OTP, password reset) via custom SMTP. These business
 * invitations are application emails: the app generates the single-use token
 * (through the audited `create_invitation` RPC), stores only its SHA-256 hash,
 * and delivers the branded invitation itself. Nothing here can mint or verify
 * auth sessions.
 *
 * Uses the same Resend credential as SMTP (`RESEND_SMTP_PASSWORD` holds the
 * Resend API key) and the verified sender `AUTH_EMAIL_FROM`. When email isn't
 * configured yet the caller receives `{sent:false}` and shows the owner a
 * copyable invite link instead — invitations never silently fail.
 */

/** Must match extensions.digest(token, 'sha256') used by the migrations. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface InvitationEmailInput {
  to: string;
  businessName: string;
  roleLabel: string;
  storeName: string | null;
  inviterName: string | null;
  expiresText: string;
  acceptUrl: string;
}

export interface InvitationEmailResult {
  sent: boolean;
  reason?: "email_unconfigured" | "provider_error";
  detail?: string;
}

export async function sendInvitationEmail(
  input: InvitationEmailInput
): Promise<InvitationEmailResult> {
  const apiKey = process.env.RESEND_SMTP_PASSWORD?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim() || "no-reply@ambikaelectricals.in";
  if (!apiKey) return { sent: false, reason: "email_unconfigured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from.includes("<") ? from : `Ambika Electricals Rewards <${from}>`,
        to: [input.to],
        subject: `You're invited to join ${input.businessName} on Rewardly`,
        html: renderInvitationEmail(input),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, reason: "provider_error", detail: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: "provider_error", detail: String(err).slice(0, 200) };
  }
}

/** Branded HTML consistent with supabase/templates/*.html. */
export function renderInvitationEmail(input: InvitationEmailInput): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const storeLine = input.storeName
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#415270;">Primary store: <strong>${esc(input.storeName)}</strong></p>`
    : "";
  const inviterLine = input.inviterName
    ? ` <strong>${esc(input.inviterName)}</strong> invited you.`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>You're invited</title></head>
  <body style="margin:0;padding:0;background:#f2f5fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#12203a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5fa;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #dde5f1;border-radius:16px;overflow:hidden;">
          <tr><td style="background:#0b1526;padding:22px 28px;">
            <span style="color:#ffffff;font-size:16px;font-weight:700;">&#9889; ${esc(input.businessName)}</span>
            <span style="color:#7dd3fc;font-size:16px;font-weight:600;"> Rewards</span><br />
            <span style="color:#93a7c7;font-size:11px;">Powered by Rewardly</span>
          </td></tr>
          <tr><td style="padding:28px;">
            <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0b1526;">You're invited to join the team</p>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#415270;">${inviterLine}
              Sign in (or create your free account) as <strong>${esc(input.to)}</strong> to help run the
              loyalty program as <strong>${esc(input.roleLabel)}</strong>.</p>
            ${storeLine}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
              <tr><td align="center">
                <a href="${esc(input.acceptUrl)}" style="display:inline-block;background:#0b1526;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 28px;border-radius:10px;">Accept invitation</a>
              </td></tr>
            </table>
            <p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:#7a8aa5;">
              This invitation is single-use and ${esc(input.expiresText)}. It only works for the email address above —
              if that wasn't you, ignore this email.
            </p>
          </td></tr>
          <tr><td style="background:#f7f9fd;border-top:1px solid #e5ebf5;padding:18px 28px;">
            <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#415270;">
              Need help? Email <a href="mailto:care@ambikaelectricals.in" style="color:#0369a1;">care@ambikaelectricals.in</a>
              or call <a href="tel:+919825041200" style="color:#0369a1;">+91 98250 41200</a>.
            </p>
            <p style="margin:0;font-size:11px;line-height:1.6;color:#93a3bd;">Ambika Electricals &middot; Shop 14, Sardar Complex, Ring Road, Surat, Gujarat 395002</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
