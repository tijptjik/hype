<script lang="ts">
import type { FormFacetNavRootProps } from '../formFacetNav.types'

let { class: className = '', children }: FormFacetNavRootProps = $props()
</script>

<div class={className}>{@render children?.()}</div>
