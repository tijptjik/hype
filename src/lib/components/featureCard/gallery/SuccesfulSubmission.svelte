<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import UserCircle from 'virtual:icons/lucide/circle-user'
// ENUMS
import { Panel, FirstClassResource } from '$lib/enums'

// CONTEXT
const appCtx = getAppCtx()

let handleClick = () => {
  // Open profile panel with current user's username
  const user = appCtx.getUser()
  appCtx.setPanelCtx(Panel.profile, 'username', user?.username)
  appCtx.togglePanel(Panel.profile)
}
</script>

<div
  class="z-5 absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-4 bg-base-200/70 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0"
>
  <h1 class="text-center text-2xl font-bold text-primary">
    {m.user_contributions__received_title()}
  </h1>
  <p class="-white/70 [text-shadow:_0_1px_2px_rgba(0,0,0,0.5) max-w-[60%] text-center">
    {m.user_contributions__received_body()}
  </p>
  <button class="btn mt-4 bg-base-300 text-white" onclick={handleClick}>
    <Icon src={UserCircle} class="h-6 w-6 stroke-[2px] text-primary" />
    {m.user_contributions__received_button()}
  </button>
</div>
