// SHARED AUTH CONFIGURATION
// This config is used by both development and runtime auth files
import type { BetterAuthOptions } from 'better-auth'

export const authConfig = {
  // ID
  appName: 'HYPE',

  // SESSION
  session: {
    expiresIn: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // update session age every 24 hours
    cookieCache: {
      // signed cookie
      enabled: true,
      // Cache the session payload to avoid repeated session-table reads. Account
      // availability is still checked on every authenticated auth request. Sensitive
      // operations can opt out with Better Auth's `disableCookieCache` option.
      maxAge: 5 * 60, // 5 min
    },
  },

  // EMBEDDED HYPE SESSIONS
  // Guest bootstrap runs inside partner iframes, where modern browsers reject
  // Better Auth's default `SameSite=Lax` cookies. Authentication endpoints
  // retain their trusted-origin checks; these attributes only allow the secure
  // session credential to be stored and sent from that embedded context. The
  // partition also keeps each embedding site in an isolated guest session.
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'none' as const,
      secure: true,
      partitioned: true,
    },
  },

  // RATE LIMITS
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/anonymous': { window: 60, max: 10 },
      // The app password route delegates through the HTTP router at this path.
      // Server-only auth.api.setPassword calls do not execute the rate limiter.
      '/account-password': { window: 60, max: 5 },
    },
  },

  // ACCOUNT LINKING
  account: {
    accountLinking: {
      // A person may use a provider identity with a different email address.
      // Better Auth still prevents that identity from being linked to another HYPE user.
      allowDifferentEmails: true,
      // Facebook does not provide Better Auth with an `email_verified` claim.
      // A locally verified HYPE email is still required before an implicit link,
      // preventing an unverified local account from claiming a Facebook identity.
      trustedProviders: ['facebook'],
    },
  },

  // SECURITY
  // Which origins can make auth requests?
  trustedOrigins: [
    // CORE :: PRODUCTION
    'https://hype.hk',
    // CORE :: PREVIEW
    'https://preview.hype.hk',
    // HUBS :: SUBDOMAINS
    'https://hkghostsigns.hype.hk',
    'https://breadline.hype.hk',
    // HUBS :: DOMAINS
    'https://hkghostsigns.com',
    'https://breadline.hk',
    // HUBS :: PREVIEW
    'https://hkghostsigns.preview.hype.hk',
    'https://breadline.preview.hype.hk',
    // DEV
    'http://localhost:5173',
    'https://dove-main-tapir.ngrok-free.app',
    'http://192.168.1.100.traefik.me:5173',
  ],

  user: {
    changeEmail: {
      enabled: true,
      // A passkey can authenticate a new account before its optional email is
      // verified. Save that email immediately, while Better Auth keeps its
      // `emailVerified` flag false and sends the normal verification message.
      updateEmailWithoutVerification: true,
    },
    additionalFields: {
      locale: {
        type: 'string' as const,
        required: true,
        defaultValue: 'en',
      },
      attribution: {
        type: 'string' as const,
        required: false,
      },
      isArchived: {
        type: 'boolean' as const,
        // Account lifecycle state is changed only by trusted server workflows.
        input: false as const,
        required: true,
        defaultValue: false,
      },
      preferences: {
        type: 'string' as const,
        required: true,
        defaultValue:
          '{"fallbackLocales":[], "allowMachineTranslation":false, "preferFallbackInCurrentLocale":false, "isTranslateButtonVisible":true}',
      },
      experimental: {
        type: 'string' as const,
        required: true,
        defaultValue: '{"contributorMode":false, "noLabelsMode":false}',
      },
      username: {
        type: 'string' as const,
        required: false,
      },
      isAnonymous: {
        type: 'boolean' as const,
        // Promotion requires a verified credential, never a client profile update.
        input: false as const,
        required: true,
        defaultValue: false,
      },
      // Note: roles are added dynamically via customSession in auth.ts.
      // Layer defaults are loaded separately from the session bootstrap path.
    },
  },
} satisfies BetterAuthOptions
