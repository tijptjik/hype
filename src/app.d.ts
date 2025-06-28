import type { AvailableLanguageTag } from '../../lib/paraglide/runtime';
import type { ParaglideLocals } from '@inlang/paraglide-sveltekit';
import type { Auth, SessionSession, SessionUser } from '$lib/auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { MiniflareD1Database } from 'miniflare';
import type { Hub, HubOpts } from '$lib/types';
import type { Flash } from '$lib/types';
// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces

// ENHANCEMENT: Add Logging - https://jeffmcmorris.medium.com/awesome-logging-in-sveltekit-6afa29c5892c

declare global {
  let maplibregl: {
    Map: {
      prototype: {
        cachedPanTo: (lnglat: maplibregl.LngLatLike, options?: any) => void;
        cachedZoomTo: (zoom: number, options?: any) => void;
        cachedJumpTo: (options?: any) => void;
        cachedEaseTo: (options?: any) => void;
        cachedFlyTo: (options?: any) => void;
        cachedFitBounds: (
          bounds: [[number, number], [number, number]],
          options?: any
        ) => void;
      };
    };
  };
  namespace App {
    // interface Error {}
    interface Locals {
      paraglide: ParaglideLocals<AvailableLanguageTag>;
      db: DrizzleD1Database<typeof import('$lib/db/schema/index')>;
      hub: HubOpts | Hub;
      auth: Auth;
      session?: SessionSession;
      user?: SessionUser;
    }
    interface PageData {
      flash?: Flash;
    }
    // interface PageState {}
    interface Platform {
      env: {
        ENVIRONMENT: string;
        NODE_ENV: string;
        // Cloudflare Bindings
        DB: MiniflareD1Database;
        ASSETS: any;
        // AUTH
        AUTH_SECRET: string;
        AUTH_GOOGLE_ID: string;
        AUTH_GOOGLE_SECRET: string;
        SUPERADMIN_USERID: string;
        // CLOUDINARY
        CLOUDINARY_API_KEY: string;
        CLOUDINARY_API_SECRET: string;
        PUBLIC_CLOUDINARY_CLOUD_NAME: string;
        PUBLIC_CLOUDINARY_UPLOAD_PRESET: string;
        // AZURE
        AZURE_TRANSLATION_KEY: string;
        PUBLIC_AZURE_TRANSLATION_REGION: string;
        // PUBLIC VARS
        PUBLIC_SVELTE_QUERY_DEVTOOLS: string;
        PUBLIC_DRIZZLE_LOGGER: string;
        PUBLIC_HUB_CODE: string;
        PUBLIC_GIPHY_KEY: string;
      };
      context: {
        waitUntil(promise: Promise<any>): void;
      };
      caches: CacheStorage & { default: Cache };
    }
  }
}

export {};
