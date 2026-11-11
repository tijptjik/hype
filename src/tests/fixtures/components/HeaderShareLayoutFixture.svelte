<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
// ICONS
import Icon from 'virtual:icons/proicons/location'

setResponsiveCtx()
let sharing = $state(false)
</script>

<Header
  title={{ text: 'Hong Kong Ghost Signs' }}
  facets={{ items: [{ ref: 'core', label: 'Profile', icon: Icon }] }}
  avatar={{ isVisible: true, name: 'Reviewer' }}
  shareAction={{
    text: 'Share map',
    icon: Icon,
    onClick: () => (sharing = true),
  }}
  filter={{ isFilterable: !sharing }}
  viewActions={{
    isVisible: !sharing,
    controlsAction: { text: 'Controls', icon: Icon },
    layoutAction: { text: 'Layout', icon: Icon },
  }}
  formActions={{
    isVisible: false,
    featuresAction: { text: 'Features', icon: Icon },
    usersAction: { text: 'Users', icon: Icon },
  }}
/>
<button type="button" onclick={() => (sharing = false)}>Return to resources</button>
