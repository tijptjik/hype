<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import StarsPanel from '#lib/bits/patterns/starsPanel/StarsPanel.svelte'
// STYLES
import '#lib/styles/app.css'
// TYPES
import type { useSavedFeatureListModel } from '#lib/adapters/panels/useSavedFeatureListModel.svelte.js'
import type { usePanelShellModel } from '#lib/adapters/panels/usePanelShellModel.svelte.js'

setResponsiveCtx()
let search = $state({ wishlist: '', visited: '' })
let opened = $state('')
const titles = [
  'Evangel Bookstore',
  'Li Chiu Bonesetter',
  'Jumbo',
  'Chan Kam Shek Five Loong Oil',
  'Chinese Doctor 4th Floor Kan Man Ying',
  'Kowloon Walled City South Gate',
  'Dandelion, Wah Cheong Co.',
  'Sing Lee Refrigerator (Trading) Co.',
  'Illegible sign in red paint',
  'Ah Yuen Tailor Factory',
]
/** Creates a local list for visual and interaction checks.
 * @param kind - Collection to display.
 * @returns Reactive saved-list fixture.
 */
function list(
  kind: 'wishlist' | 'visited',
): ReturnType<typeof useSavedFeatureListModel> {
  const count = kind === 'wishlist' ? 5 : 10
  return {
    title: `${kind === 'wishlist' ? 'Want to visit' : 'Visited'} (${count})`,
    totalCount: count,
    get rows() {
      return titles
        .slice(0, count)
        .filter(title => title.toLowerCase().includes(search[kind].toLowerCase()))
        .map((title, index) => ({
          id: `${kind}-${index}`,
          title,
          organisation: 'HKGhostSigns',
          ...(kind === 'visited' ? { dateLabel: '5 months ago' } : {}),
          sortTimestamp: 0,
        }))
    },
    get rowCount() {
      return this.rows.length
    },
    loading: false,
    error: null,
    hasMore: false,
    get search() {
      return search[kind]
    },
    setSearch(value: string) {
      search[kind] = value
    },
    async loadMore() {},
    retry() {},
    onOpen(id: string) {
      opened = id
    },
  } as ReturnType<typeof useSavedFeatureListModel>
}
const model = {
  isGuestAccount: false,
  wishlist: list('wishlist'),
  visited: list('visited'),
}
const shell = {
  open: true,
  onClose() {},
  panel: {
    panelType: 'stars',
    position: 'right',
    inline: false,
    scrollable: true,
    isNarrow: false,
    isAdmin: false,
  },
} as ReturnType<typeof usePanelShellModel>
</script>
<div class="relative h-screen bg-surface"><StarsPanel {model} {shell} /></div>
<output class="sr-only" data-opened>{opened}</output>
