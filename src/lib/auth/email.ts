// IMAGE
import { toCloudflareImageWorkerPath } from '$lib/images/delivery'
// TYPES
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'

type AuthEmailKind = 'password-reset' | 'verification'

/**
 * Escapes a string for safe inclusion in transactional email HTML.
 *
 * @param value - Untrusted text or URL value to render.
 * @returns HTML-safe text.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[character]
  })
}

/**
 * Chooses a human-readable hub name for communications sent from the active domain.
 *
 * @param hub - Hub context resolved for the incoming request.
 * @returns A display name with a stable HYPE fallback.
 */
function getHubName(hub: HubOptsExtended | undefined): string {
  const translations = (hub?.i18n ?? {}) as Record<string, { name?: string | null }>
  const english = translations.en
  const fallback = Object.values(translations)[0]

  return english?.name?.trim() || fallback?.name?.trim() || 'HYPE'
}

/**
 * Produces an absolute hub-logo URL when the active hub has a Cloudflare R2 image.
 *
 * @param hub - Hub context resolved for the incoming request.
 * @param baseURL - Public origin for the active hub.
 * @returns A logo URL suitable for email clients, or `null` when no logo is configured.
 */
function getHubLogoUrl(
  hub: HubOptsExtended | undefined,
  baseURL: string,
): string | null {
  const image = hub?.image?.image
  if (image?.cdn !== 'cloudflareR2' || !image.publicId) return null

  return new URL(
    toCloudflareImageWorkerPath({
      publicId: image.publicId,
      version: image.version,
      transformation: 'c_fill,h_160,w_160',
      format: 'png',
    }),
    baseURL,
  ).toString()
}

/**
 * Builds a complete transactional email for Better Auth account actions.
 *
 * @param params - Email content and active-hub context.
 * @param params.kind - Whether the email verifies an address or resets a password.
 * @param params.actionUrl - One-time Better Auth action URL.
 * @param params.baseURL - Public origin for the hub that issued the email.
 * @param params.hub - Hub context resolved for the incoming request.
 * @param params.recipientName - Optional account display name for the greeting.
 * @returns Sender name, subject, plain-text body, and responsive HTML body.
 */
export function buildAuthEmail(params: {
  kind: AuthEmailKind
  actionUrl: string
  baseURL: string
  hub?: HubOptsExtended
  recipientName?: string | null
}): { fromName: string; subject: string; text: string; html: string } {
  const hubName = getHubName(params.hub)
  const hubUrl = new URL('/', params.baseURL).toString()
  const privacyUrl = new URL('/policy/privacy', params.baseURL).toString()
  const termsUrl = new URL('/policy/terms', params.baseURL).toString()
  const logoUrl = getHubLogoUrl(params.hub, params.baseURL)
  const isVerification = params.kind === 'verification'
  const subject = isVerification
    ? `Verify your ${hubName} email address`
    : `Reset your ${hubName} password`
  const heading = isVerification ? 'Verify your email address' : 'Reset your password'
  const actionLabel = isVerification ? 'Verify email address' : 'Reset password'
  const intro = isVerification
    ? `Thanks for creating an account with ${hubName}. Please confirm your email address to finish setting up your account.`
    : `We received a request to reset the password for your ${hubName} account.`
  const reassurance = isVerification
    ? `If you did not create an account with ${hubName}, you can safely ignore this email.`
    : `If you did not request a password reset, you can safely ignore this email. Your password will not change.`
  const greeting = params.recipientName?.trim()
    ? `Hi ${params.recipientName.trim()},`
    : 'Hello,'
  const expiryNote = isVerification
    ? 'For your security, this verification link can only be used once.'
    : 'For your security, this reset link will expire soon and can only be used once.'
  const text = [
    greeting,
    '',
    intro,
    '',
    `${actionLabel}: ${params.actionUrl}`,
    '',
    expiryNote,
    reassurance,
    '',
    `Visit ${hubName}: ${hubUrl}`,
    `Privacy policy: ${privacyUrl}`,
    `Terms of service: ${termsUrl}`,
  ].join('\n')
  const safeHubName = escapeHtml(hubName)
  const safeGreeting = escapeHtml(greeting)
  const safeIntro = escapeHtml(intro)
  const safeReassurance = escapeHtml(reassurance)
  const safeExpiryNote = escapeHtml(expiryNote)
  const safeActionLabel = escapeHtml(actionLabel)
  const safeActionUrl = escapeHtml(params.actionUrl)
  const safeHubUrl = escapeHtml(hubUrl)
  const safePrivacyUrl = escapeHtml(privacyUrl)
  const safeTermsUrl = escapeHtml(termsUrl)
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safeHubName}" width="64" height="64" style="display:block;width:64px;height:64px;border:0;border-radius:12px;object-fit:cover;" />`
    : ''

  return {
    fromName: hubName,
    subject,
    text,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f4f5;color:#18181b;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:32px 32px 16px;">
            ${logo}
            <p style="margin:16px 0 0;font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">${safeHubName}</p>
            <h1 style="margin:8px 0 0;font-size:28px;line-height:1.2;color:#18181b;">${escapeHtml(heading)}</h1>
          </td></tr>
          <tr><td style="padding:16px 32px 32px;font-size:16px;line-height:1.55;color:#3f3f46;">
            <p style="margin:0 0 16px;">${safeGreeting}</p>
            <p style="margin:0 0 24px;">${safeIntro}</p>
            <p style="margin:0 0 24px;"><a href="${safeActionUrl}" style="display:inline-block;background:#18181b;color:#ffffff;padding:12px 20px;border-radius:8px;font-weight:700;text-decoration:none;">${safeActionLabel}</a></p>
            <p style="margin:0 0 4px;font-size:13px;color:#71717a;">If the button does not work, copy and paste this link into your browser:</p>
            <p style="margin:0 0 24px;font-size:13px;line-height:1.45;word-break:break-all;"><a href="${safeActionUrl}" style="color:#52525b;">${safeActionUrl}</a></p>
            <p style="margin:0 0 12px;font-size:14px;color:#71717a;">${safeExpiryNote}</p>
            <p style="margin:0;font-size:14px;color:#71717a;">${safeReassurance}</p>
          </td></tr>
          <tr><td style="padding:24px 32px;background:#fafafa;font-size:13px;line-height:1.6;color:#71717a;">
            <p style="margin:0 0 8px;"><a href="${safeHubUrl}" style="color:#52525b;">Visit ${safeHubName}</a></p>
            <p style="margin:0;"><a href="${safePrivacyUrl}" style="color:#52525b;">Privacy policy</a> &nbsp;·&nbsp; <a href="${safeTermsUrl}" style="color:#52525b;">Terms of service</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  }
}
