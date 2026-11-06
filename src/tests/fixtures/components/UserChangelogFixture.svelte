<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import UserChangelog from '#lib/bits/patterns/userDirectory/UserChangelog.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import TooltipProvider from '#lib/bits/core/tooltip/TooltipProvider.svelte'
setResponsiveCtx()
</script>
<div class="bits-theme bg-background text-foreground flex h-screen min-h-0 flex-col">
  <FormSurface class="mb-0! flex h-full min-h-0 flex-col">
    <UserChangelog userId="editor" />
  </FormSurface>
  <TooltipProvider />
</div>
