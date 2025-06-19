<script lang="ts">
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// TYPES
import type { FacetType } from '$lib/types';

// STATE : CONTEXT
const adminCtx = getAdminCtx();

let {
  facet,
  isActive = false
}: {
  facet: { label: string; ref: FacetType };
  isActive?: boolean;
} = $props();

// UTILS
const onclick = (e: MouseEvent) => {
  e.preventDefault();
  adminCtx.setFacet(facet.ref);
};
</script>

<li>
  <a
    href="#{facet.ref}"
    class="btn btn-sm {isActive
      ? 'btn-primary'
      : 'btn-ghost'} text-white hover:btn-primary"
    {onclick}>
    {facet.label}
  </a>
</li>
