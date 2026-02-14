<script lang="ts">
// TYPES
import type { HeaderCrumb } from '../../header.types'

let { crumbs = [] }: { crumbs?: HeaderCrumb[] } = $props()
</script>

{#if crumbs.length > 0}
  <nav class="bits-header__breadcrumbs" aria-label="Breadcrumb">
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
