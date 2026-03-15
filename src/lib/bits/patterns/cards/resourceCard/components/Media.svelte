<script lang="ts">
import { Card } from '$lib/bits/custom'
import type { ResourceCardMediaProps } from '../resourceCard.types'

let {
  image = null,
  alt = null,
  class: className = '',
}: ResourceCardMediaProps = $props()
</script>

<Card.Avatar
  name={alt}
  {image}
  class={`bits-form__parent-resource-item-media ${className}`}
  imageClass="bits-form__parent-resource-item-image"
  fallbackClass="bits-form__parent-resource-item-image bits-form__parent-resource-item-image--empty"
/>
