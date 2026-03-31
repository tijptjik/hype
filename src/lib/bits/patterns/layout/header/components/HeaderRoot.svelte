<script lang="ts">
// BITS COMPONENTS
import { AdaptiveToolbar } from '$lib/bits/patterns/layout/adaptiveToolbar'
// TYPES
import type { HeaderRootProps } from './headerPrimitives.types'

let { class: className = '', left, right, ...restProps }: HeaderRootProps = $props()
</script>

<AdaptiveToolbar class={className} {left} {right} {...restProps} />
