<script lang="ts">
import { Card } from '$lib/bits/custom'
import type { ResourceCardMediaProps } from '../resourceCard.types'
let {
  image = null,
  size = 'md',
  alt = null,
  class: className = '',
}: ResourceCardMediaProps = $props()
</script>

<Card.Media
  name={alt}
  {image}
  {size}
  class={`bits-form__parent-resource-item-media ${className}`}
  imageClass="bits-form__parent-resource-item-image"
  fallbackClass="bits-form__parent-resource-item-image bits-form__parent-resource-item-image--empty"
/>
