// SHARED AUTH CONFIGURATION
// This config is used by both development and runtime auth files

export const authConfig = {
  // ID
  appName: 'HYPE',

  // SESSION
  session: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // update session age every 24 hours
    cookieCache: {
      // signed cookie
      enabled: true,
      maxAge: 60 // 1 min
    }
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
    // HUBS :: DOMAINS
    'https://hkghostsigns.com',
    // HUBS :: PREVIEW
    'https://preview.hkghostsigns.com',
    // DEV
    'http://localhost:5173',
    'https://dove-main-tapir.ngrok-free.app',
  ],

  user: {
    additionalFields: {
      locale: {
        type: 'string' as const,
        required: true,
        defaultValue: 'en'
      },
      attribution: {
        type: 'string' as const,
        required: false
      },
      isArchived: {
        type: 'boolean' as const,
        required: true,
        defaultValue: false
      },
      preferences: {
        type: 'string' as const,
        required: true,
        defaultValue:
          '{"fallbackLocales":[], "allowMachineTranslation":false, "preferFallbackInCurrentLocale":false, "isTranslateButtonVisible":true}'
      },
      experimental: {
        type: 'string' as const,
        required: true,
        defaultValue: '{"contributorMode":false, "noLabelsMode":false}'
      },
      superAdmin: {
        type: 'boolean' as const,
        required: true,
        defaultValue: false
      }
      // Note: roles and userLayers are added dynamically via customSession plugin
      // in auth.ts since Better Auth doesn't support array types in additionalFields
    }
  }
};
