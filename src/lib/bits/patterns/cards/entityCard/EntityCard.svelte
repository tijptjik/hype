<script lang="ts" generics="T extends Exclude<Resource, Task>">
// SVELTE
import { goto } from '$app/navigation'
import { page } from '$app/state'
// I18N
import { getLocaleKey, m } from '$lib/i18n'
// BITS
import * as EntityCardPrimitive from './components'
// SERVICES
import { getHashiconUrl, getURLfromImage } from '$lib/client/services/image'
import { getUrlForResource } from '$lib/navigation'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// TYPES
import type { Resource, Task } from '$lib/types'
import type { ImageContextEnvelope } from '$lib/db/zod/schema/image.types'
import type { EntityCardProps } from './entityCard.types'
// UTILS
import {
  getEntityCardPropertyValue,
  getNestedValue,
  toDescriptionFallback,
} from './entityCard.utils'

let {
  entity,
  keyMap,
  header,
  content,
  actions,
  footer,
  onImageClick,
}: EntityCardProps<T> = $props()

const adminCtx = getAdminCtx()

let localeKey = $derived(getLocaleKey())

const cardImageEnvelope = $derived.by(() => {
  const raw = getNestedValue(entity, keyMap.image)
  if (!raw) return null
  return raw as ImageContextEnvelope
})
const imageSrc = $derived(
  cardImageEnvelope
    ? getURLfromImage({
        image: cardImageEnvelope,
      })
    : getHashiconUrl(entity.id),
)
const imageLayout = $derived.by(() => {
  const image = cardImageEnvelope?.image as
    | ({ presentationMode?: 'cover' | 'contain' } & Record<string, unknown>)
    | undefined
  return image?.presentationMode === 'contain' ? 'contain' : 'cover'
})
const title = $derived(
  String(getEntityCardPropertyValue(entity, keyMap, localeKey, keyMap.title) ?? ''),
)
const subtitle = $derived.by(() => {
  if (!keyMap.subtitle) return ''
  return String(
    getEntityCardPropertyValue(entity, keyMap, localeKey, keyMap.subtitle) ?? '',
  )
})
const description = $derived(
  toDescriptionFallback(
    getEntityCardPropertyValue(entity, keyMap, localeKey, keyMap.description ?? ''),
  ),
)
const publicationState = $derived.by(() =>
  'isPublished' in entity && entity.isPublished !== undefined
    ? Boolean(entity.isPublished)
    : null,
)
const publicationLabel = $derived.by(() => {
  if (publicationState === null) return ''
  return publicationState ? m.published() : m.weak_super_guppy_nail()
})
const hubCodes = $derived.by(() => {
  if (!('domain' in entity) || !entity.organisations) {
    return ''
  }

  return entity.organisations
    .map(organisation => organisation.code)
    .filter(Boolean)
    .join(', ')
})
const visitableLabel = $derived.by(() => {
  if (!('isVisitable' in entity) || entity.isVisitable === undefined) {
    return ''
  }

  return entity.isVisitable ? 'Visitable' : 'Not Visitable'
})
const href = $derived(
  adminCtx.activeResourceType
    ? `${getUrlForResource(
        adminCtx,
        adminCtx.activeResourceType,
        entity.id,
      )}${page.url.search}`
    : null,
)

function handleNavigate(event: MouseEvent | KeyboardEvent): void {
  event.preventDefault()

  if (!href) return

  adminCtx.setFacet('core')
  goto(href)
}

function handleCardKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    handleNavigate(event)
    return
  }

  if (event.key !== ' ') return

  event.preventDefault()

  if (onImageClick && entity.image) {
    onImageClick(entity)
    return
  }

  handleNavigate(event)
}

function handleHeaderImageClick(event: MouseEvent): void {
  if (!onImageClick || !entity.image) {
    return
  }

  event.stopPropagation()
  onImageClick(entity)
}
</script>

<EntityCardPrimitive.Root onclick={handleNavigate} onkeydown={handleCardKeyDown}>
  {#if header}
    {@render header()}
  {:else}
    <EntityCardPrimitive.Header
      {imageSrc}
      imageAlt={title}
      {imageLayout}
      onImageClick={handleHeaderImageClick}
    />
  {/if}

  {#if content}
    <div class="bits-entity-card__body">
      {@render content()}
      {#if actions}
        <div class="bits-entity-card__actions">{@render actions()}</div>
      {/if}
    </div>
  {:else}
    <EntityCardPrimitive.Body {subtitle} {title} {description} {actions} />
  {/if}

  {#if footer}
    <footer class="bits-entity-card__footer">{@render footer()}</footer>
  {:else}
    <EntityCardPrimitive.Footer
      {publicationState}
      {publicationLabel}
      {hubCodes}
      {visitableLabel}
    />
  {/if}
</EntityCardPrimitive.Root>
