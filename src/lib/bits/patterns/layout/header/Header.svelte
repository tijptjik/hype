<script lang="ts">
import { fly } from 'svelte/transition'
import { tick } from 'svelte'
// COMPONENTS
import * as HeaderPrimitive from './components'
// TYPES
import type { HeaderProps } from './header.types'

const DEFAULT_CLASS =
  'bg-black py-4 pl-6 navbar flex h-18 w-full justify-between caret-transparent transition-all duration-300'
const CONTROL_BAR_TRANSITION_MS = 180

let {
  query = $bindable(''),
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

const facetItems = $derived(facets.items ?? [])
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
const showControlBar = $derived(
  Boolean(controlBar?.component) && (controlBar?.isVisible ?? true),
)

let renderedControlBar = $state<HeaderProps['controlBar'] | null>(controlBar)
let isControlBarExpanded = $state(false)
let wasControlBarVisible = $state(false)
const controlBarHeight = $derived(
  renderedControlBar?.height ?? controlBar?.height ?? '4rem',
)
const wrapperClass = $derived(
  ['bits-theme bits-pattern-header-stack', className].filter(Boolean).join(' '),
)

function handleControlBarTransitionEnd(event: TransitionEvent): void {
  if (
    event.target !== event.currentTarget ||
    event.propertyName !== 'max-height' ||
    showControlBar
  )
    return

  renderedControlBar = null
}

$effect(() => {
  if (showControlBar && !wasControlBarVisible) {
    renderedControlBar = controlBar
    isControlBarExpanded = false
    void tick().then(() => {
      if (showControlBar && renderedControlBar === controlBar) {
        isControlBarExpanded = true
      }
    })
  } else {
    if (controlBar?.component) {
      renderedControlBar = controlBar
    }
    isControlBarExpanded = showControlBar
  }

  wasControlBarVisible = showControlBar

  if (!controlBar?.component) {
    isControlBarExpanded = false
  }
})

const rootClass = $derived(
  [DEFAULT_CLASS, showAvatar ? 'pr-6' : 'pr-0'].filter(Boolean).join(' '),
)
</script>

<HeaderPrimitive.Wrapper class={wrapperClass} {...restProps}>
  <HeaderPrimitive.Root class={rootClass}>
    {#snippet left({ showButtonText, isMeasuring })}
      <HeaderPrimitive.Title
        text={title.text}
        description={title.description}
        icon={title.icon}
        href={title.href}
        crumbs={title.crumbs}
        menuAction={title.menuAction}
        {isMeasuring}
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
        {#if showFacets || showTaskActions || showFormActions}
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

            {#if showTaskActions}
              <HeaderPrimitive.TaskActions
                actions={taskActionItems}
                content={taskActionContent}
                hideLabel={!showButtonText}
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
                extraActions={viewActions.extraActions}
                content={viewActions.content}
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

  {#if renderedControlBar?.component}
    {@const ControlBar = renderedControlBar.component}
    {@const controlBarProps = renderedControlBar?.props ?? {}}
    <HeaderPrimitive.BarRoot
      height={controlBarHeight}
      isExpanded={isControlBarExpanded}
      transitionDurationMs={CONTROL_BAR_TRANSITION_MS}
      ontransitionend={handleControlBarTransitionEnd}
    >
      {#snippet children()}
        <ControlBar {...controlBarProps} />
      {/snippet}
    </HeaderPrimitive.BarRoot>
  {/if}
</HeaderPrimitive.Wrapper>
