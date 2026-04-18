<script lang="ts">
// TYPES
import type { HeaderBreadcrumbsProps } from '../headerPrimitive.types.js'

let { crumbs = [] }: HeaderBreadcrumbsProps = $props()
</script>

{#if crumbs.length > 0}
  <nav class="bits-header__breadcrumbs" aria-label="Breadcrumb">
    {#each crumbs as crumb, index (`${crumb.href ?? 'nolink'}-${crumb.name}-${index}`)}
      <span class="bits-header__breadcrumb-item">
        {#if crumb.href}
          <a href={crumb.href} draggable="false" class="bits-header__breadcrumb-link">
            {crumb.name}
          </a>
        {:else}
          <span class="bits-header__breadcrumb-link" aria-current="page"
            >{crumb.name}</span
          >
        {/if}
        <span aria-hidden="true" class="bits-header__breadcrumb-separator"
          >{index < crumbs.length - 1 ? '/' : ''}</span
        >
      </span>
    {/each}
  </nav>
{/if}
