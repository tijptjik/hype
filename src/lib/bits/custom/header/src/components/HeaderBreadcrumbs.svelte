<script lang="ts">
import { fly } from 'svelte/transition'
// TYPES
import type { HeaderCrumb } from '../../header.types'

let { crumbs = [] }: { crumbs?: HeaderCrumb[] } = $props()
</script>

{#if crumbs.length > 0}
  <nav
    class="bits-header__breadcrumbs"
    aria-label="Breadcrumb"
    in:fly={{ x: 10, delay: 180, duration: 180, opacity: 0.15 }}
    out:fly={{ x: -10, duration: 180, opacity: 0.15 }}>
    {#each crumbs as crumb, index (crumb.href)}
      <a
        href={crumb.href}
        draggable="false"
        class="bits-header__breadcrumb-link">
        {crumb.name}
      </a>
      {#if index < crumbs.length - 1}
        <span aria-hidden="true" class="bits-header__breadcrumb-separator">/</span>
      {/if}
    {/each}
  </nav>
{/if}
