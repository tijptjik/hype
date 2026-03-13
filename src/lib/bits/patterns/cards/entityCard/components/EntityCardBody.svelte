<script lang="ts">
// COMPONENTS
import ScrollableText from '$lib/components/common/ScrollableText.svelte'
// TYPES
import type { EntityCardBodyProps } from '../entityCard.types'

let { title, description, actions }: EntityCardBodyProps = $props()
</script>

<div class="bits-entity-card__body">
  <h2 class="bits-entity-card__title"><ScrollableText text={title} /></h2>

  <p class="bits-entity-card__description"><ScrollableText text={description} /></p>

  {#if actions}
    <div class="bits-entity-card__actions">{@render actions()}</div>
  {/if}
</div>
