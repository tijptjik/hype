<script lang="ts" generics="T extends Exclude<Resource, Task>">
// SVELTE
import { getContext } from 'svelte'
import { goto } from '$app/navigation'
import { page } from '$app/state'
// I18N
import { getI18n, getLocaleKey } from '$lib/i18n'
// BITS
import * as EntityCardPrimitive from './components'
import { ENTITY_CARD_WIDTH_CONTEXT } from './entityCard.context'
// SERVICES
import { getHashiconUrl, getURLfromImage } from '$lib/client/services/image'
import { getUrlForResource } from '$lib/navigation'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { Resource, Task } from '$lib/types'
import type { ImageContextEnvelope } from '$lib/db/zod/schema/image.types'
import type { EntityCardFooterBreadcrumb, EntityCardProps } from './entityCard.types'
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
const cardLayout = getContext<{ width: number } | undefined>(ENTITY_CARD_WIDTH_CONTEXT)

let localeKey = $derived(getLocaleKey())
const cardWidth = $derived(cardLayout?.width ?? 0)

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
const resourceType = $derived(adminCtx.activeResourceType)
const shortLabel = $derived.by(() => {
  const appCtx = adminCtx.appCtx
  const preferences = appCtx.getUserPreferences()

  switch (resourceType) {
    case FirstClassResource.hub:
      return (
        ('code' in entity && typeof entity.code === 'string' && entity.code) ||
        getI18n(entity, 'nameShort', preferences, '', false) ||
        title
      )
    case FirstClassResource.organisation:
      return (
        appCtx.getContextualOrganisationName(entity as never, false, false) ||
        ('code' in entity && typeof entity.code === 'string' && entity.code) ||
        title
      )
    case FirstClassResource.project:
      return (
        appCtx.getContextualProjectName(entity as never, false, false) ||
        ('code' in entity && typeof entity.code === 'string' && entity.code) ||
        title
      )
    case FirstClassResource.layer:
      return (
        appCtx.getContextualLayerName(entity as never, false, false) ||
        ('id' in entity && typeof entity.id === 'string' && entity.id) ||
        title
      )
    case FirstClassResource.feature:
      return ''
    default:
      return title
  }
})
const breadcrumbs = $derived.by((): EntityCardFooterBreadcrumb[] => {
  if (!resourceType) return []

  const appCtx = adminCtx.appCtx
  const hierarchy = appCtx.getHierarchySync(entity as never)
  const items: EntityCardFooterBreadcrumb[] = []

  if (resourceType !== FirstClassResource.layer && hierarchy.layer) {
    const layerLabel =
      appCtx.getContextualLayerName(hierarchy.layer, false, false) ?? hierarchy.layer.id
    if (layerLabel) {
      items.push({ kind: 'layer', label: layerLabel })
    }
  }

  if (resourceType !== FirstClassResource.project && hierarchy.project) {
    const projectLabel =
      appCtx.getContextualProjectName(hierarchy.project, false, false) ??
      hierarchy.project.code
    if (projectLabel) {
      items.push({ kind: 'project', label: projectLabel })
    }
  }

  if (resourceType !== FirstClassResource.organisation && hierarchy.organisation) {
    const organisationLabel =
      appCtx.getContextualOrganisationName(hierarchy.organisation, false, false) ??
      hierarchy.organisation.code
    if (organisationLabel) {
      items.push({ kind: 'organisation', label: organisationLabel })
    }
  }

  return items
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
    <EntityCardPrimitive.Body {title} {description} {actions} />
  {/if}

  {#if footer}
    <footer class="bits-entity-card__footer">{@render footer()}</footer>
  {:else}
    <EntityCardPrimitive.Footer
      {publicationState}
      {shortLabel}
      {breadcrumbs}
      {cardWidth}
    />
  {/if}
</EntityCardPrimitive.Root>
