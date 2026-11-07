<script lang="ts">
import { onDestroy } from 'svelte'
import { setAdminCtx } from '#lib/context/admin.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx, setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setRootCTX } from '#lib/context/root.svelte.js'
import { setHeaderCtrl } from '#lib/context/header.svelte.js'
import { setThemeModel } from '#lib/themes/theme.svelte.js'
import TaskPage from '../../../routes/admin/tasks/[task]/+page.svelte'
import { route, fail, finish } from '../taskNavigationQuery.svelte.js'
import type { Task } from '#lib/db/zod/schema/task.types.js'
const responsive = setResponsiveCtx()
setRootCTX(responsive)
setThemeModel()
const view = setSurfaceCtx(
  new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    responsive,
    undefined,
    'admin',
  ),
)
setAdminCtx(view)
const header = setHeaderCtrl()
view.cache.task.set('photo', { id: 'photo', type: 'newPhoto' } as Task)
view.cache.task.set('missing', { id: 'missing', type: 'reportedMissing' } as Task)
let opened = $state(false)
onDestroy(() => view.dispose())
</script>
<div class="bits-theme bg-panel flex h-dvh flex-col">
  <nav>
    <button
      type="button"
      onclick={() => {
        opened = true
      }}
    >
      Open task
    </button>
    <button
      type="button"
      onclick={() => {
        route.params.task = 'missing'
      }}
    >
      Next task
    </button>
    <button type="button" onclick={fail}>Fail query</button>
    <button type="button" onclick={() => finish('photo')}>Finish old query</button>
    <button type="button" onclick={() => finish('missing')}>
      Finish current query
    </button>
  </nav>
  <h1>{header.state.meta.title}</h1>
  {#if opened}
    <TaskPage />
  {:else}
    <p>Task queue</p>
  {/if}
</div>
