import type { AvailableLanguageTag } from '../../lib/paraglide/runtime';
import type { ParaglideLocals } from '@inlang/paraglide-sveltekit';
import type { Auth, Session } from '$lib/auth';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { HubOpts } from '$lib/types';
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
      db: DrizzleD1Database<typeof import('$lib/db/schema')>;
      hub: HubOpts;
      auth: Auth;
      session: Session['session'];
      user: Session['user'];
    }
    // interface PageData {}
    // interface PageState {}
    interface Platform {
      env: {
        DB: D1Database;
        CF_PAGES: string;
      };
      context: {
        waitUntil(promise: Promise<any>): void;
      };
      caches: CacheStorage & { default: Cache };
    }
  }
}

export {};
