<script lang="ts">
import { fly } from 'svelte/transition'
// COMPONENTS
import * as HeaderPrimitive from './components'
// TYPES
import type { HeaderProps, HeaderLayoutMode } from './header.types'

const DEFAULT_CLASS =
  'bits-theme bg-black py-4 pl-6 navbar sticky left-0 top-0 z-20 flex h-18 w-full shrink-0 justify-between caret-transparent shadow-lg transition-all duration-300'

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

const facetItems = $derived(facets.items ?? [])
const layoutMode = $derived((viewActions.layoutMode ?? 'card') as HeaderLayoutMode)
const controlMode = $derived(viewActions.controlMode ?? false)
const showFilter = $derived(filter.isFilterable ?? false)
const showNew = $derived(newAction.isCreatable ?? false)
const showAvatar = $derived(avatar.visible ?? true)
const showFacets = $derived(facetItems.length > 0)
const showViewActions = $derived(viewActions.visible ?? false)
const showFormActions = $derived(formActions.visible ?? false)

const rootClass = $derived(
  [DEFAULT_CLASS, showAvatar ? 'pr-6' : 'pr-0', className].filter(Boolean).join(' '),
)
const rightRevealKey = $derived(
  JSON.stringify({
    showFilter,
    showViewActions,
    showFacets,
    showFormActions,
  }),
)

const measurementKey = $derived(
  JSON.stringify({
    title: title.text ?? '',
    description: title.description ?? '',
    crumbs: title.crumbs?.map(crumb => `${crumb.name}:${crumb.href}`) ?? [],
    facets: facetItems.map(
      facet => `${facet.ref}:${facet.label}:${facet.hasIssues ? '1' : '0'}`,
    ),
    controlMode,
    isCreatable: showNew,
    isFilterable: showFilter,
    showFacets,
    showViewActions,
    showFormActions,
    showAvatar,
    editing: formActions.isEditing ?? false,
    deleted: formActions.isDeleted ?? false,
  }),
)
</script>

<HeaderPrimitive.Root
  class={rootClass}
  {measurementKey}
  {rightRevealKey}
  {...restProps}
>
  {#snippet left({ showDescription, showTitle, showButtonText })}
    <HeaderPrimitive.Title
      text={title.text}
      description={title.description}
      icon={title.icon}
      href={title.href}
      crumbs={title.crumbs}
      menuAction={title.menuAction}
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
    <div class="bits-pattern-header__right-slot">
      {#if showFilter || showViewActions}
        <div
          class="bits-pattern-header__right-slot-item bits-pattern-header__right-cluster"
          in:fly={{ x: -12, delay: 180, duration: 180, opacity: 0.15 }}
          out:fly={{ x: 12, duration: 180, opacity: 0.15 }}
        >
          <HeaderPrimitive.Search
            bind:query
            isFilterable={showFilter}
            placeholder={filter.placeholder}
            onFilter={filter.onFilter}
          />

          {#if showViewActions}
            <HeaderPrimitive.ViewActions
              showLayoutToggle={viewActions.showLayoutToggle ?? true}
              showControlsToggle={viewActions.showControlsToggle ?? true}
              layoutModes={viewActions.layoutModes ?? ['card', 'list']}
              {layoutMode}
              {controlMode}
              hideLabel={!showButtonText}
              onLayoutToggle={viewActions.onLayoutToggle}
              onControlsToggle={viewActions.onControlsToggle}
            />
          {/if}
        </div>
      {/if}

      {#if showFacets || showFormActions}
        <div
          class="bits-pattern-header__right-slot-item bits-pattern-header__right-cluster"
          in:fly={{ x: -12, delay: 180, duration: 180, opacity: 0.15 }}
          out:fly={{ x: 12, duration: 180, opacity: 0.15 }}
        >
          {#if showFacets}
            <HeaderPrimitive.Facets
              items={facetItems}
              active={facets.active}
              hideLabel={!showButtonText}
              onFacetChange={facets.onFacetChange}
            />
          {/if}

          {#if showFormActions}
            <HeaderPrimitive.FormActions
              isTainted={formActions.isTainted}
              isSubmitting={formActions.isSubmitting}
              hasIssues={formActions.hasIssues}
              isPublishing={formActions.isPublishing}
              isDeleting={formActions.isDeleting}
              isEditing={formActions.isEditing}
              isDeleted={formActions.isDeleted}
              isPublished={formActions.isPublished}
              canEdit={formActions.canEdit}
              disableEdit={formActions.disableEdit}
              canPublish={formActions.canPublish}
              showDeleteAction={formActions.showDeleteAction}
              showPublishAction={formActions.showPublishAction}
              hideLabel={!showButtonText}
              onEditingToggle={formActions.onEditingToggle}
              onReset={formActions.onReset}
              onSave={formActions.onSave}
              onDeleteToggle={formActions.onDeleteToggle}
              onPublishToggle={formActions.onPublishToggle}
            />
          {/if}
        </div>
      {/if}
    </div>

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
