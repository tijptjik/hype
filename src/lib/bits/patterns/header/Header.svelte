<script lang="ts">
import { fly } from 'svelte/transition'
// COMPONENTS
import * as HeaderPrimitive from './components'
// TYPES
import type { HeaderProps, HeaderLayoutMode } from './header.types'

const DEFAULT_CLASS =
  'bits-theme bg-black px-6 py-4 navbar sticky left-0 top-0 z-20 flex h-[72px] w-full shrink-0 justify-between caret-transparent shadow-lg transition-all duration-300'

let {
  query = $bindable(''),
  title = {},
  newAction = {},
  filter = {},
  facets = {},
  viewActions = {},
  formActions = {},
  avatar = {},
  class: className = '',
  ...restProps
}: HeaderProps = $props()

const rootClass = $derived([DEFAULT_CLASS, className].filter(Boolean).join(' '))

const facetItems = $derived(facets.items ?? [])
const layoutMode = $derived((viewActions.layoutMode ?? 'card') as HeaderLayoutMode)
const controlMode = $derived(viewActions.controlMode ?? false)
const showFilter = $derived(filter.isFilterable ?? false)
const showNew = $derived(newAction.isCreatable ?? false)
const showAvatar = $derived(avatar.visible ?? true)
const showFacets = $derived(facetItems.length > 0)
const showViewActions = $derived(viewActions.visible ?? false)
const showFormActions = $derived(formActions.visible ?? false)

const measurementKey = $derived(
  JSON.stringify({
    title: title.text ?? '',
    description: title.description ?? '',
    crumbs: title.crumbs?.map(crumb => `${crumb.name}:${crumb.href}`) ?? [],
    facets: facetItems.map(facet => `${facet.ref}:${facet.label}`),
    controlMode,
    isCreatable: showNew,
    isFilterable: showFilter,
    showAvatar,
    tainted: formActions.isTainted ?? false,
    editing: formActions.isEditing ?? false,
    deleted: formActions.isDeleted ?? false,
    published: formActions.isPublished ?? false,
  }),
)
</script>

<HeaderPrimitive.Root class={rootClass} {measurementKey} {...restProps}>
  {#snippet left({ showDescription, showTitle, showButtonText })}
    <HeaderPrimitive.Title
      text={title.text}
      description={title.description}
      icon={title.icon}
      href={title.href}
      crumbs={title.crumbs}
      hideDescription={!showDescription}
      hideTitle={!showTitle}
    />
    <HeaderPrimitive.New
      isCreatable={showNew}
      label={newAction.label}
      hideLabel={!showButtonText}
      onCreate={newAction.onCreate}
    />
  {/snippet}

  {#snippet right({ showButtonText })}
    <HeaderPrimitive.Search
      bind:query
      isFilterable={showFilter}
      placeholder={filter.placeholder}
      onFilter={filter.onFilter}
    />

    {#if showFacets}
      <div
        in:fly={{ x: -12, delay: 180, duration: 180, opacity: 0.15 }}
        out:fly={{ x: 12, duration: 180, opacity: 0.15 }}
      >
        <HeaderPrimitive.Facets
          items={facetItems}
          active={facets.active}
          hideLabel={!showButtonText}
          onFacetChange={facets.onFacetChange}
        />
      </div>
    {/if}

    {#if showViewActions}
      <div
        in:fly={{ x: -12, delay: 180, duration: 180, opacity: 0.15 }}
        out:fly={{ x: 12, duration: 180, opacity: 0.15 }}
      >
        <HeaderPrimitive.ViewActions
          showLayoutToggle={viewActions.showLayoutToggle ?? true}
          showControlsToggle={viewActions.showControlsToggle ?? true}
          layoutModes={viewActions.layoutModes ?? ['card', 'list']}
          {layoutMode}
          {controlMode}
          hideLabel={true}
          onLayoutToggle={viewActions.onLayoutToggle}
          onControlsToggle={viewActions.onControlsToggle}
        />
      </div>
    {/if}

    {#if showFormActions}
      <div
        in:fly={{ x: -12, delay: 180, duration: 180, opacity: 0.15 }}
        out:fly={{ x: 12, duration: 180, opacity: 0.15 }}
      >
        <HeaderPrimitive.FormActions
          isTainted={formActions.isTainted}
          isEditing={formActions.isEditing}
          isDeleted={formActions.isDeleted}
          isPublished={formActions.isPublished}
          hideLabel={!showButtonText}
          onEditingToggle={formActions.onEditingToggle}
          onReset={formActions.onReset}
          onSave={formActions.onSave}
          onDeleteToggle={formActions.onDeleteToggle}
          onPublishToggle={formActions.onPublishToggle}
        />
      </div>
    {/if}

    <HeaderPrimitive.Avatar
      visible={showAvatar}
      name={avatar.name}
      src={avatar.src}
      alt={avatar.alt}
      fallback={avatar.fallback}
      transitionDirection={avatar.transitionDirection}
      onClick={avatar.onClick}
    />
  {/snippet}
</HeaderPrimitive.Root>
