import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import * as schema from '$lib/db/schema';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from '$lib/db/test';
import { sql } from 'drizzle-orm';
// import { unlink } from 'fs/promises';

vi.mock('$page', () => ({
  /**
   * The URL of the current page
   */
  url: new URL('http://localhost:5173/'),
  /**
   * The parameters of the current page - e.g. for a route like `/blog/[slug]`, a `{ slug: string }` object
   */
  params: {},
  /**
   * Info about the current route
   */
  route: {
    /**
     * The ID of the current route - e.g. for `src/routes/blog/[slug]`, it would be `/blog/[slug]`
     */
    id: 'test'
  },
  /**
   * Http status code of the current page
   */
  status: 200,
  /**
   * The error object of the current page, if any. Filled from the `handleError` hooks.
   */
  error: null,
  /**
   * The merged result of all data from all `load` functions on the current page. You can type a common denominator through `App.PageData`.
   */
  data: {},
  /**
   * The page state, which can be manipulated using the [`pushState`](https://svelte.dev/docs/kit/$app-navigation#pushState) and [`replaceState`](https://svelte.dev/docs/kit/$app-navigation#replaceState) functions from `$app/navigation`.
   */
  state: {},
  /**
   * Filled only after a form submission. See [form actions](https://svelte.dev/docs/kit/form-actions) for more info.
   */
  form: {}
}));

// beforeEach(async () => {
//     // Start transaction before each test
//     console.log('Starting transaction');
//     await db.run(sql`BEGIN TRANSACTION`);
// });

// afterEach(async () => {
//     // Rollback transaction after each test
//     console.log('Rolling back transaction');
//     await db.run(sql`ROLLBACK TRANSACTION`);
// });
