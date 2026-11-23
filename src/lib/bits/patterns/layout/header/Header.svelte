<script lang="ts">
import { fade } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// COMPONENTS
import * as HeaderPrimitive from './components'
import HeaderControlBar from './HeaderControlBar.svelte'
// STYLES
import { HEADER_ALIGNED_NAVIGATION_CLASSES } from './components/headerPrimitives.styles'
// TYPES
import type { HeaderProps } from './header.types'

const DEFAULT_CLASS =
  'bg-panel py-4 navbar flex h-18 w-full justify-between caret-transparent transition-all duration-300'

let {
  contentStart,
  shareAction = null,
  query = $bindable(''),
  brand,
  title = {},
  newAction = {},
  filter = {},
  facets = {},
  viewActions = {},
  taskActions = {},
  formActions = {},
  avatar = {},
  controlBar = null,
  footer = null,
  class: className = '',
  ...restProps
}: HeaderProps = $props()

// Dedicated navigation actions own their destinations without duplicating tabs.
const facetItems = $derived(
  (facets.items ?? []).filter(
    item =>
      (item.ref !== 'share' || !shareAction) &&
      (item.ref !== 'features' || !formActions.featuresAction) &&
      (item.ref !== 'users' || !formActions.usersAction) &&
      (item.ref !== 'updates' || !formActions.historyAction) &&
      item.ref !== 'changelog',
  ),
)
const showFilter = $derived(filter.isFilterable ?? false)
const showNew = $derived(newAction.isCreatable ?? false)
const showAvatar = $derived(avatar.isVisible ?? true)
const showFacets = $derived(facetItems.length > 0)
const showViewActions = $derived(viewActions.isVisible ?? false)
const taskActionItems = $derived(taskActions.actions ?? [])
const taskActionContent = $derived(taskActions.content ?? null)
const showTaskActions = $derived(
  (taskActionItems.length > 0 || Boolean(taskActionContent?.component)) &&
    (taskActions.isVisible ?? true),
)
const showFormActions = $derived(formActions.isVisible ?? false)
// Labelled controls reserve crossfade space; compact forms use only their actual action width.
// Share-capable resources retain the search/control slot across their destinations.
// Custom form controls size to their contents so they cannot overflow into the avatar.
const reserveFormActionWidth = $derived(
  !formActions.content &&
    showFacets &&
    Boolean(
      formActions.primaryAction ||
        formActions.saveAction ||
        formActions.publishAction ||
        formActions.previewAction,
    ),
)
const wrapperClass = $derived(
  ['bits-theme bits-pattern-header-stack', className].filter(Boolean).join(' '),
)

const rootClass = $derived(
  [
    DEFAULT_CLASS,
    // Keep route-owned selectors reachable within the top bar on narrow screens.
    viewActions.content?.component ? 'max-w-full overflow-x-auto' : '',
    brand ? 'pl-3' : 'pl-6',
    showAvatar ? 'pr-6' : 'pr-0',
    showFacets && contentStart !== undefined ? HEADER_ALIGNED_NAVIGATION_CLASSES : '',
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<HeaderPrimitive.Wrapper class={wrapperClass} {...restProps}>
  <HeaderPrimitive.Root
    class={rootClass}
    style={contentStart !== undefined
      ? `--header-identity-width: ${contentStart + 12}px`
      : undefined}
  >
    {#snippet left({ showButtonText, isMeasuring })}
      {#if brand}
        <svelte:element
          this={brand.href ? 'a' : 'div'}
          href={brand.href}
          data-sveltekit-reload={brand.reload || undefined}
          aria-label={brand.href ? (brand.label ?? brand.alt) : undefined}
          tabindex={isMeasuring && brand.href ? -1 : undefined}
          class="focus-visible:outline-focus flex size-10 shrink-0 items-center justify-center p-0.5 focus-visible:outline-2"
        >
          {#if brand.monochrome}
            <span
              role="img"
              aria-label={isMeasuring ? undefined : brand.alt}
              aria-hidden={isMeasuring}
              class="bg-panel text-base-content size-full"
            >
              <span
                class="block size-full bg-current"
                style:mask-image={`url('${brand.src}')`}
                style:mask-size="contain"
                style:mask-repeat="no-repeat"
                style:mask-position="center"
              ></span>
            </span>
          {:else}
            <img
              src={brand.src}
              alt={isMeasuring ? '' : brand.alt}
              width="36"
              height="36"
              class="size-full object-cover"
            >
          {/if}
        </svelte:element>
      {/if}
      <HeaderPrimitive.Title
        text={title.text}
        description={title.description}
        href={title.href}
        crumbs={title.crumbs}
        menuAction={title.menuAction}
        {isMeasuring}
      />
      <HeaderPrimitive.New
        isCreatable={showNew}
        label={newAction.label}
        disabled={newAction.disabled}
        hideLabel={!showButtonText}
        onCreate={newAction.onCreate}
      />
    {/snippet}

    {#snippet right({ showButtonText, isMeasuring })}
      <div class="mr-4 flex min-w-0 flex-1 items-center justify-end gap-0">
        {#if showFacets || showTaskActions}
          <div
            class="flex min-w-max flex-1 items-center gap-4"
            in:fade={{ duration: 140 }}
            out:fade={{ duration: 140 }}
          >
            {#if showFacets}
              <HeaderPrimitive.Facets
                {isMeasuring}
                items={facetItems}
                active={facets.active}
                hideLabel={!showButtonText}
                onFacetChange={facets.onFacetChange}
              />
            {/if}

            {#if showTaskActions}
              <HeaderPrimitive.TaskActions
                actions={taskActionItems}
                content={taskActionContent}
                hideLabel={!showButtonText}
              />
            {/if}
          </div>
        {/if}

        <div class="ml-auto flex shrink-0 items-center">
          {#if formActions.locationsAction ||
            formActions.featuresAction ||
            formActions.usersAction ||
            formActions.historyAction ||
            formActions.changelogAction ||
            shareAction}
            <div class="mr-2 shrink-0">
              <HeaderPrimitive.FormActions
                locationsAction={formActions.locationsAction}
                featuresAction={formActions.featuresAction}
                usersAction={formActions.usersAction}
                historyAction={formActions.historyAction}
                changelogAction={formActions.changelogAction}
                {shareAction}
                hideLabel={!showButtonText}
              />
            </div>
          {/if}
          <div
            class="grid shrink-0 items-center {viewActions.content?.component
              ? ''
              : shareAction
                ? 'w-[408px]'
                : showFilter || (reserveFormActionWidth && showButtonText)
                  ? 'w-[min(408px,calc(100vw-48px))] min-w-0'
                  : ''}"
          >
            {#if showFormActions || (reserveFormActionWidth && showButtonText)}
              <div
                class="col-start-1 row-start-1 justify-self-end transition-opacity duration-180 motion-reduce:transition-none {showFormActions
                  ? 'opacity-100'
                  : 'pointer-events-none opacity-0'}"
                inert={!showFormActions}
                aria-hidden={!showFormActions}
              >
                <HeaderPrimitive.FormActions
                  content={formActions.content}
                  primaryAction={formActions.primaryAction}
                  saveAction={formActions.saveAction}
                  deleteAction={formActions.deleteAction}
                  publishAction={formActions.publishAction}
                  publishPrompt={formActions.publishPrompt}
                  previewAction={formActions.previewAction}
                  hideLabel={!showButtonText}
                />
              </div>
            {/if}
            {#if showFilter || showViewActions}
              <div
                class="col-start-1 row-start-1 flex w-full min-w-0 items-center justify-end gap-0 [&>label]:min-w-0 [&>label]:flex-1 [&>label>input]:min-w-0"
                transition:fade={{ duration: prefersReducedMotion.current ? 0 : 180 }}
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
                    trailingContent={viewActions.trailingContent}
                    extraActions={viewActions.extraActions}
                    content={viewActions.content}
                    hideLabel={!showButtonText}
                  />
                {/if}
              </div>
            {/if}
          </div>
        </div>
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

  <HeaderControlBar {controlBar} />
</HeaderPrimitive.Wrapper>
