import { defineEnvVars } from '@sveltejs/kit/env'

// Optional asset origins retain empty defaults; callers resolve their stage-specific fallback.
export const variables = defineEnvVars({
  PUBLIC_ASSET_BASE_URL: { public: true, schema: input => input ?? '' },
  PUBLIC_PREVIEW_ASSET_BASE_URL: { public: true, schema: input => input ?? '' },
  PUBLIC_RAW_ASSET_BASE_URL: { public: true, schema: input => input ?? '' },
})
