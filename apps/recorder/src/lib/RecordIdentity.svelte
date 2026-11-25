<script lang="ts">
// I18N
import { t } from './i18n'
// TYPES
import type { SpatialRealm } from '../../../../src/lib/fieldResearch/recorder'

let {
  address,
  tags,
  title,
  realm,
  heading = false,
}: {
  address: string
  tags: string[]
  title: string
  realm?: SpatialRealm | null
  heading?: boolean
} = $props()
</script>

<svelte:element this={heading ? 'div' : 'span'} class="grid min-w-0 flex-1 gap-1.5">
  {#if heading}
    <h2 class="text-xl leading-tight font-semibold break-words">{address}</h2>
  {:else}
    <strong class="break-words whitespace-normal">{address}</strong>
  {/if}
  <span class="flex flex-wrap items-center gap-1.5">
    {#each tags as tag}
      <span class="bg-surface rounded-md px-2 py-0.5 font-mono text-xs">{tag}</span>
    {:else}
      <span class="text-sm">{title}</span>
    {/each}
    {#if realm}
      <span class="text-muted text-sm">{t(realm)}</span>
    {/if}
  </span>
</svelte:element>
