<script lang="ts">
import { fade } from 'svelte/transition'
import type { HeaderTitleProps } from '../headerPrimitive.types.js'

let { text, class: className = '', children, ...restProps }: HeaderTitleProps = $props()
</script>

<p class={className} {...restProps}>{text}</p>
