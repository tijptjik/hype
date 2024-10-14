import { redirect } from '@sveltejs/kit';

export function load() {
  const currentPath = window.location.pathname;
  const queryParams = window.location.search;

  redirect(307, `${currentPath}core${queryParams}`);
}
