import type { AvailableLanguageTag } from '../../lib/paraglide/runtime'
import type { ParaglideLocals } from '@inlang/paraglide-sveltekit'
import type { Auth, SessionSession, SessionUser } from '$lib/auth'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { MiniflareD1Database } from 'miniflare'
import type { HubOptsExtended } from '$lib/db/zod/schema/hub.types'
import 'unplugin-icons/types/svelte'
import type {
  LngLatLike,
  CameraOptions,
  AnimationOptions,
  FitBoundsOptions,
} from 'maplibre-gl'
// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces

// ENHANCEMENT: Add Logging - https://jeffmcmorris.medium.com/awesome-logging-in-sveltekit-6afa29c5892c

// Custom options for cached navigation methods
interface CachedMapOptions {
  run?: boolean
  debug?: boolean
  offset?: [number, number]
  curve?: number
  minZoom?: number
  type?: 'pan' | 'zoom' | 'jump' | 'ease' | 'fly' | 'fitBounds'
  [key: string]: unknown
}

// Extend Map interface with cached navigation methods
declare module 'maplibre-gl' {
  interface Map {
    cachedPanTo(
      lnglat: LngLatLike,
      options?: CameraOptions & AnimationOptions & CachedMapOptions,
    ): void
    cachedZoomTo(
      zoom: number,
      options?: CameraOptions & AnimationOptions & CachedMapOptions,
    ): void
    cachedJumpTo(options?: CameraOptions & AnimationOptions & CachedMapOptions): void
    cachedEaseTo(options?: CameraOptions & AnimationOptions & CachedMapOptions): void
    cachedFlyTo(options?: CameraOptions & AnimationOptions & CachedMapOptions): void
    cachedFitBounds(
      bounds: [[number, number], [number, number]],
      options?: FitBoundsOptions & AnimationOptions & CachedMapOptions,
    ): void
  }
}

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      paraglide: ParaglideLocals<AvailableLanguageTag>
      db: DrizzleD1Database<typeof import('$lib/db/schema/index')>
      hub: HubOptsExtended
      auth: Auth
      session?: SessionSession
      user?: SessionUser
    }
    // interface PageState {}
    interface Platform {
      env: {
        ENVIRONMENT: string
        NODE_ENV: string
        // Cloudflare Bindings
        DB: MiniflareD1Database
        ASSETS: Fetcher
        // AUTH
        AUTH_SECRET: string
        AUTH_GOOGLE_ID: string
        AUTH_GOOGLE_SECRET: string
        // CLOUDINARY
        CLOUDINARY_API_KEY: string
        CLOUDINARY_API_SECRET: string
        PUBLIC_CLOUDINARY_CLOUD_NAME: string
        PUBLIC_CLOUDINARY_UPLOAD_PRESET: string
        // AZURE
        AZURE_TRANSLATION_KEY: string
        PUBLIC_AZURE_TRANSLATION_REGION: string
        // PUBLIC VARS
        PUBLIC_SVELTE_QUERY_DEVTOOLS: string
        PUBLIC_DRIZZLE_LOGGER: string
        PUBLIC_HUB_CODE: string
        PUBLIC_GIPHY_KEY: string
      }
      context: ExecutionContext
      caches: CacheStorage & { default: Cache }
    }
  }
}
