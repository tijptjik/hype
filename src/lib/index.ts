// place files you want to import through the `$lib` alias in this folder.
import type { RequestEvent } from '@sveltejs/kit';
import { derived } from 'svelte/store';
import { page } from '$app/stores';
import { browser } from '$app/environment';
import deepEquals from 'fast-deep-equal';
import { redirect } from '@sveltejs/kit';

/**
 * Check whether the code is being run by a Cloudflare worker
 */
export const on_cloudflare = (event: RequestEvent) => {
  return event.platform?.env.CF_PAGES === 'true';
};

let oldState: App.PageState = {};

export const pageState = derived<typeof page, App.PageState>(
  page,
  (_, set) => {
    if (!browser) return;
    setTimeout(() => {
      const newState = history.state['sveltekit:states'] ?? {};
      if (!deepEquals(oldState, newState)) {
        oldState = newState;
        set(newState);
      }
    });
  },
  {}
);


export function toTitleCase(str: string) {
  return str.replace(
    /\w\S*/g,
    (text) => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
  );
}
