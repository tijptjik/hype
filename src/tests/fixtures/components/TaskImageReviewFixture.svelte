<script lang="ts">
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx, setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setRootCTX } from '#lib/context/root.svelte.js'
import { setThemeModel } from '#lib/themes/theme.svelte.js'
import TaskImageReview from '#lib/bits/patterns/tasks/components/TaskImageReview.svelte'
const responsive = setResponsiveCtx()
setRootCTX(responsive)
setSurfaceCtx(new ResourceViewCtx(new DivisionCtx(), new AccountState(), responsive, undefined, 'admin'))
setThemeModel()
</script>
<div class="flex h-dvh min-h-0 flex-col px-4 py-12"><TaskImageReview taskId="task" initialReport={true} /></div>
