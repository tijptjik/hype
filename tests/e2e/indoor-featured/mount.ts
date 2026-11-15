// SVELTE
import { mount } from 'svelte'
// FIXTURE
import Harness from './ShopFilterHarness.svelte'
/** Mount the production scene and state in an isolated browser fixture. @returns Mounted component. */
export function mountHarness(): ReturnType<typeof mount> {
  return mount(Harness, { target: document.body })
}
