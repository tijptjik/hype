<script lang="ts">
import * as FormFacetNavPrimitive from './components'
import type { FormFacetNavProps } from './formFacetNav.types'

let {
  previousAction = null,
  nextAction = null,
  class: className = '',
}: FormFacetNavProps = $props()

const rootClass = $derived(
  [
    'bits-feature-editor__facet-nav',
    'bits-feature-editor__facet-nav--facet-end',
    className,
  ]
    .filter(Boolean)
    .join(' '),
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
