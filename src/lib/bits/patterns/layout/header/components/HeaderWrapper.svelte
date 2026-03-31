<script lang="ts">
// TYPES
import type { HeaderWrapperProps } from './headerPrimitives.types'

let { class: className = '', children, ...restProps }: HeaderWrapperProps = $props()
</script>

<div class={className} {...restProps}>{@render children?.()}</div>
