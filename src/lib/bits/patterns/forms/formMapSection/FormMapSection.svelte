<script lang="ts">
import { cx } from '$lib/bits/utils'
import MapPrimitive from './components/MapPrimitive.svelte'
import type { FormMapSectionProps } from './formMapSection.types'

let { class: className = '', ...restProps }: FormMapSectionProps = $props()
</script>

<section class={cx('h-full w-full', className)}>
  <MapPrimitive {...restProps} />
</section>
