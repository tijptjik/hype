<script lang="ts">
// COMPONENTS
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// ICONS
import Icon from 'virtual:icons/lucide/clock'
setResponsiveCtx()
let pending = $state(false)
let related = $state(false)
</script>

<Header
  title={{ text: 'History handoff' }}
  filter={{ isFilterable: true }}
  formActions={{ historyAction: { text: 'History', icon: Icon } }}
  viewActions={{
    isVisible: true,
    controlsAction: { text: 'Filters', icon: Icon, disabled: pending },
    extraActions: [
      { id: 'history-refresh', text: 'Refresh', icon: Icon, disabled: pending },
      {
        id: 'history-expand',
        text: related ? 'Collapse all' : 'Expand all',
        icon: Icon,
        disabled: pending,
      },
    ],
  }}
/>
<button type="button" onclick={() => (pending = true)}>Begin handoff</button>
<button
  type="button"
  onclick={() => {
    related = !related
    pending = false
  }}
>
  Finish handoff
</button>
