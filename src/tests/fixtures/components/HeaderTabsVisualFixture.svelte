<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte'
// COMPONENTS
import HeaderFacets from '#lib/bits/patterns/layout/header/components/HeaderFacets.svelte'
// ICONS
import Profile from 'virtual:icons/proicons/person'
import Shield from 'virtual:icons/proicons/shield-checkmark'
import Tag from 'virtual:icons/proicons/tag'
import Photo from 'virtual:icons/proicons/photo'
let { compact = false }: { compact?: boolean } = $props()
setResponsiveCtx()
let active = $state('capabilities')
const items = [
  { ref: 'core', label: 'Profile', icon: Profile },
  { ref: 'capabilities', label: 'Capabilities', icon: Shield },
  { ref: 'fields', label: 'Fields', icon: Tag },
  { ref: 'image', label: 'Image', icon: Photo },
]
</script>
<div class="bits-theme flex h-[72px] items-center justify-center bg-surface">
  <HeaderFacets
    {items}
    {active}
    hideLabel={compact}
    onFacetChange={value => (active = value)}
  />
</div>
