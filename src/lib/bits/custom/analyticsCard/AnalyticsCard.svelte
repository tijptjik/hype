<script lang="ts">
import * as AnalyticsCardPrimitive from './components'
import type { AnalyticsCardProps } from './analyticsCard.types'

let { class: className = '', children }: AnalyticsCardProps = $props()
</script>

<AnalyticsCardPrimitive.Root class={className}>
  {@render children?.()}
</AnalyticsCardPrimitive.Root>
