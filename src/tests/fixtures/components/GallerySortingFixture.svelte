<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setRootCTX } from '#lib/context/root.svelte.js'
import { setThemeModel } from '#lib/themes/theme.svelte.js'
// COMPONENTS
import ImageEditor from '#lib/bits/patterns/images/ImageEditor.svelte'
// API / ADAPTER
import { getFeatureGalleryRevisionEditor } from '#lib/api/featureRevisions.remote.js'
import { useGalleryOrdering } from '#lib/adapters/image/useGalleryOrdering.svelte.js'
import { orderGallery, type GallerySortMode } from '#lib/images/galleryOrder.js'
setRootCTX(setResponsiveCtx())
setThemeModel()
let gallery = $state<{ order: string[]; sortMode?: GallerySortMode; entries: Record<string, { intent: string }> }>({ order: [], entries: {} })
let activeId = $state<string | null>('a')
const items = $derived(orderGallery(gallery.order.map((id, position) => ({ id,
  src: '/__sorting-image.svg', thumbnailSrc: '/__sorting-image.svg', intent: gallery.entries[id].intent,
  galleryPosition: position, gallerySortMode: gallery.sortMode ?? 'automatic', createdAt: '2026-01-01',
  alt: id, status: { kind: 'persisted' as const },
})), gallery.sortMode))
/** Refreshes the accepted fixture projection after the real ordering adapter saves.
 * @returns Completion after the current gallery has loaded.
 */
async function refresh(): Promise<void> {
  const result = await getFeatureGalleryRevisionEditor({ featureId: 'feature', meta: { isAdminRequest: true } })
  if (result.enabled) gallery = result.gallery
}
const ordering = useGalleryOrdering(() => 'feature', () => items, refresh)
onMount(() => { void refresh() })
</script>
<div class="h-dvh" data-active-image={activeId}>
  <ImageEditor {items} {activeId} onActiveIdChange={id => activeId = id} disableHoverPreview
    sortMode={ordering.mode} canSort={ordering.enabled} onSortChange={ordering.save} />
</div>
