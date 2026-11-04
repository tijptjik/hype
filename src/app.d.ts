import type { AvailableLanguageTag } from '../../lib/paraglide/runtime'
import type { ParaglideLocals } from '@inlang/paraglide-sveltekit'
import type { Auth, SessionSession, SessionUser } from '#lib/auth.js'
import type { AssetRenderJob, MapRenderJob } from '#lib/map/renders/render.types.js'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type {
  D1Database,
  Fetcher,
  RateLimit,
  Queue,
  R2Bucket,
  SendEmail,
  ExecutionContext,
  CacheStorage,
  Cache,
} from '@cloudflare/workers-types'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import 'unplugin-icons/types/svelte'
// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces

// ENHANCEMENT: Add Logging - https://jeffmcmorris.medium.com/awesome-logging-in-sveltekit-6afa29c5892c

declare global {
  interface ImportMetaEnv {
    readonly HYPE_LOCATION_SOURCE_URL: string
    readonly HYPE_DEV_PERSONA: 'admin' | 'user' | null
  }
  namespace App {
    // interface Error {}
    interface Locals {
      /** Cloudflare bindings and lifetime API resolved by the server hook. */
      platform: Platform
      paraglide: ParaglideLocals<AvailableLanguageTag>
      db: DrizzleD1Database<typeof import('#lib/db/schema/index.js')>
      hub: HubOptsExtended
      auth: Auth
      devPersona?: 'admin' | 'user'
      session?: SessionSession
      user?: SessionUser
    }
    interface PageState {
      draftLocationResult?: string
    }
    interface Platform {
      env: {
        ENVIRONMENT: string
        NODE_ENV: string
        // CLOUDFLARE BINDINGS
        DB: D1Database
        ASSETS: Fetcher
        ROUTING_SERVICE?: Fetcher
      MESSAGING_NOTIFICATIONS?: {
        publicKey():Promise<string>
        subscribe(userId:string,organisationId:string,subscription:{endpoint:string;keys:{p256dh:string;auth:string};expirationTime?:number|null},origin:string):Promise<void>
        unsubscribe(userId:string,organisationId:string,endpoint:string):Promise<void>
        focus(userId:string,organisationId:string,endpoint:string,focused?:boolean):Promise<void>
        status(userId:string,organisationId:string,endpoint:string):Promise<boolean>
      }
        WHATSOVER?: import('#lib/api/services/whatsover.types.js').WhatsoverBinding
        WHATSOVER_VOICE_URL?: string
        TELEGRAM_CALLS_URL?: string
        TELEGRAM?: import('#lib/messaging/binding.js').TelegramBinding
        ROUTING_LIMITER?: RateLimit
        ROUTING_TOKEN?: string
        MAP_RENDER_QUEUE: Queue<MapRenderJob>
        ASSET_RENDER_QUEUE: Queue<AssetRenderJob>
        ASSET_RAW_DEV: R2Bucket
        ASSET_RAW_PREVIEW: R2Bucket
        ASSET_RAW_PRODUCTION: R2Bucket
        ASSET_PUBLIC_DEV: R2Bucket
        ASSET_PUBLIC_PREVIEW: R2Bucket
        ASSET_PUBLIC_PRODUCTION: R2Bucket
        // CLOUDFLARE
        HUB_DOMAINS_API_TOKEN?: string
        HUB_DOMAINS_ZONE_ID?: string
        CLOUDFLARE_ACCOUNT_ID: string
        CLOUDFLARE_ANALYTICS_API_TOKEN?: string
        ANALYTICS_DATABASE_ID?: string
        ANALYTICS_QUEUE_IDS?: string
        R2_S3_ACCESS_KEY_ID: string
        R2_S3_SECRET_ACCESS_KEY: string
        MAP_REFRESH_TOKEN: string
        MAP_RENDER_TOKEN: string
        ASSET_ANALYTICS_READ_TOKEN: string
        IMAGE_ANALYTICS_READ_TOKEN?: string
        // AUTH
        AUTH_SECRET: string
        AUTH_GOOGLE_ID: string
        AUTH_GOOGLE_SECRET: string
        AUTH_FACEBOOK_ID: string
        AUTH_FACEBOOK_SECRET: string
        AUTH_EMAIL_FROM?: string
        ANONYMOUS_CLEANUP_TOKEN?: string
        EMAIL?: SendEmail
        // AZURE
        AZURE_TRANSLATION_KEY: string
        PUBLIC_AZURE_TRANSLATION_REGION: string
        // PUBLIC VARS
        PUBLIC_DRIZZLE_LOGGER: string
        PUBLIC_HUB_CODE: string
        PUBLIC_GIPHY_KEY: string
        PUBLIC_SAANSEOI_API_KEY?: string
        SAANSEOI_API_KEY?: string
        VITE_SAANSEOI_API_KEY?: string
        PUBLIC_ORIGIN: string
        PUBLIC_ASSET_BASE_URL: string
        PUBLIC_PREVIEW_ASSET_BASE_URL: string
      }
      context: Pick<ExecutionContext, 'waitUntil'>
      caches: CacheStorage & { default: Cache }
    }
  }
}

// Cloudflare exposes bindings through its native module in SvelteKit 3.
declare namespace Cloudflare {
  type Env = App.Platform['env']
}
