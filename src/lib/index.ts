// place files you want to import through the `$lib` alias in this folder.
import type { RequestEvent } from '@sveltejs/kit';
import { derived } from 'svelte/store';
import { page } from '$app/stores';
import { browser } from '$app/environment';
import deepEquals from 'fast-deep-equal';
import type { ResourceTypes, SectionTypes } from './types';
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

// Utils
export const getActiveFromPath = (path: string) => {
  const parts = path
    .replace(/^\/admin\//, '')
    .split('/')
    .filter(Boolean);

    const urlToResourceMap = {
      'organisations': 'organisation',
      'projects': 'project',
      'layers': 'layer',
      'features': 'feature'
    } as { [key: string]: ResourceTypes };

  return {
    resourceType: urlToResourceMap[parts[0]] as ResourceTypes || false,
    ref: parts[1] as string || false,
    section: parts[2] as SectionTypes || false
  };
};


export const redirectToCore = () => {
  const currentPath = window.location.pathname;
  const queryParams = window.location.search;

  redirect(307, `${currentPath}core${queryParams}`);
}
