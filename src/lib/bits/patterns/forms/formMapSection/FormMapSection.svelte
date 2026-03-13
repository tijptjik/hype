<script lang="ts">
import MapPrimitive from './components/MapPrimitive.svelte'
import type { FormMapSectionProps } from './formMapSection.types'

let { class: className = '', ...restProps }: FormMapSectionProps = $props()
</script>

<section class={className}><MapPrimitive {...restProps} /></section>
