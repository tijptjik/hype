<script lang="ts">
import { fly } from 'svelte/transition'
// COMPONENTS
import * as HeaderPrimitive from './components'
// TYPES
import type { HeaderProps } from './header.types'

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
const showFilter = $derived(filter.isFilterable ?? false)
const showNew = $derived(newAction.isCreatable ?? false)
const showAvatar = $derived(avatar.isVisible ?? true)
const showFacets = $derived(facetItems.length > 0)
const showViewActions = $derived(viewActions.isVisible ?? false)
const showFormActions = $derived(formActions.isVisible ?? false)

const rootClass = $derived(
  [DEFAULT_CLASS, showAvatar ? 'pr-6' : 'pr-0', className].filter(Boolean).join(' '),
)
</script>

<HeaderPrimitive.Root class={rootClass} {...restProps}>
  {#snippet left({ showButtonText })}
    <HeaderPrimitive.Title
      text={title.text}
      description={title.description}
      icon={title.icon}
      href={title.href}
      crumbs={title.crumbs}
      menuAction={title.menuAction}
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
            onAdvanceFromSearch={filter.onAdvanceFromSearch}
          />

          {#if showViewActions}
            <HeaderPrimitive.ViewActions
              controlsAction={viewActions.controlsAction}
              layoutAction={viewActions.layoutAction}
              hideLabel={!showButtonText}
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
              primaryAction={formActions.primaryAction}
              saveAction={formActions.saveAction}
              deleteAction={formActions.deleteAction}
              publishAction={formActions.publishAction}
              hideLabel={!showButtonText}
            />
          {/if}
        </div>
      {/if}
    </div>

    <HeaderPrimitive.Avatar
      isVisible={showAvatar}
      name={avatar.name}
      src={avatar.src}
      alt={avatar.alt}
      fallback={avatar.fallback}
      transitionDirection={avatar.transitionDirection}
      onClick={avatar.onClick}
    />
  {/snippet}
</HeaderPrimitive.Root>
