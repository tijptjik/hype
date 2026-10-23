<script lang="ts">
import { cx } from '#lib/bits/utils.js'
import * as FormFacetNavPrimitive from './components'
import type { FormFacetNavProps } from './formFacetNav.types'

let {
  previousAction = null,
  nextAction = null,
  centerAction = null,
  class: className = '',
}: FormFacetNavProps = $props()

const rootClass = $derived(
  cx(
    centerAction
      ? 'grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-2xl'
      : 'flex w-full items-center justify-between gap-3 rounded-2xl',
    className,
  ),
)
</script>

<FormFacetNavPrimitive.Root class={rootClass}>
  {#if centerAction}
    <div class="flex min-w-0 justify-start">
      {#if previousAction}
        <FormFacetNavPrimitive.Button direction="previous" action={previousAction} />
      {/if}
    </div>
    <button
      type="button"
      id={centerAction.id}
      class="rounded-lg border border-border bg-panel px-4 py-3 text-sm text-foreground transition-transform duration-300 ease-out hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
      style:transform={centerAction.centerInContent
        ? 'translateY(var(--facet-center-action-offset, 0px))'
        : 'translateY(0)'}
      onclick={centerAction.onClick}
      disabled={centerAction.disabled}
    >
      {centerAction.text}
    </button>
    <div class="flex min-w-0 justify-end">
      {#if nextAction}
        <FormFacetNavPrimitive.Button direction="next" action={nextAction} />
      {/if}
    </div>
  {:else}
    {#if previousAction}
      <FormFacetNavPrimitive.Button direction="previous" action={previousAction} />
    {/if}
    {#if nextAction}
      <FormFacetNavPrimitive.Button direction="next" action={nextAction} />
    {/if}
  {/if}
</FormFacetNavPrimitive.Root>
