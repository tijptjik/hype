<script lang="ts">
// COMPONENTS
import ScrollableText from '$lib/components/common/ScrollableText.svelte'
// TYPES
import type { IndexCardBodyProps } from '../indexCard.types'

let { title, description, actions }: IndexCardBodyProps = $props()
</script>

<div class="bits-index-card__body">
  <h2 class="bits-index-card__title"><ScrollableText text={title} /></h2>

  <p class="bits-index-card__description"><ScrollableText text={description} /></p>

  {#if actions}
    <div class="bits-index-card__actions">{@render actions()}</div>
  {/if}
</div>
