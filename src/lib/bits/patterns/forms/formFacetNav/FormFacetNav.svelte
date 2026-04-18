<script lang="ts">
import { cx } from '$lib/bits/utils'
import * as FormFacetNavPrimitive from './components'
import type { FormFacetNavProps } from './formFacetNav.types'

let {
  previousAction = null,
  nextAction = null,
  class: className = '',
}: FormFacetNavProps = $props()

const rootClass = $derived(
  cx('flex w-full items-center justify-between gap-3 rounded-2xl', className),
)
</script>

<FormFacetNavPrimitive.Root class={rootClass}>
  {#if previousAction}
    <FormFacetNavPrimitive.Button direction="previous" action={previousAction} />
  {/if}

  {#if nextAction}
    <FormFacetNavPrimitive.Button direction="next" action={nextAction} />
  {/if}
</FormFacetNavPrimitive.Root>
