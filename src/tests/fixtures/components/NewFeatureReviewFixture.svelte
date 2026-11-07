<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// CONTEXT
import { setAdminCtx } from '#lib/context/admin.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx, setSurfaceCtx } from '#lib/context/resourceView.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setRootCTX } from '#lib/context/root.svelte.js'
import { setThemeModel } from '#lib/themes/theme.svelte.js'
import { setImageCtx } from '#lib/context/image.svelte.js'
// COMPONENTS
import TaskEditor from '#lib/bits/patterns/tasks/TaskEditor.svelte'
// TYPES
import type { Task, TaskEditorLayerOption } from '#lib/db/zod/schema/task.types.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'

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

// Keep review interactions local while exercising the production image context.
const imageIds = new URLSearchParams(window.location.search).has('single')
  ? ['first']
  : ['first', 'second']
const images = imageIds.map(id => ({
  ctxType: 'feature',
  ctxId: 'review-fixture',
  imageId: id,
  image: {
    id,
    publicId: `review-fixture/${id}`,
    cdn: 'cloudflareR2',
    env: 'local',
    version: 1,
    width: 900,
    height: 600,
    presentationMode: 'contain',
  },
})) as unknown as ImageCtxEnvelope[]
const imageCtx = setImageCtx({ isAdminMode: true, images })
const layers = ['Current', 'Other'].map(name => ({
  id: name.toLowerCase(),
  code: name,
  projectId: 'project',
  i18n: { en: { name } },
})) as TaskEditorLayerOption[]
let layerId = $state('current')
const task = $derived({
  id: 'review-fixture',
  featureId: 'review-fixture',
  type: 'newFeature',
  revisionReviewRequired: true,
  contributorId: null,
  createdAt: '2026-11-07',
  images,
  feature: {
    id: 'review-fixture',
    layerId,
    contributorId: null,
    geometry: { type: 'Point', coordinates: [114.124, 22.266] },
    i18n: {
      zhHant: { title: '兒童復康中心', description: '支援兒童及家庭。' },
      en: {
        title: 'Rotary ReHabAid Centre for Children',
        description:
          '<p>A community centre supporting children and their families.</p><p>Review the <strong>submitted photos</strong> and contributed location below.</p>',
        displayAddress: '5–7 Sha Wan Drive, Sandy Bay',
      },
    },
    properties: [],
  },
} as unknown as Task)
onDestroy(() => {
  imageCtx.dispose()
  view.dispose()
})
</script>

<div class="bits-theme bg-panel h-screen">
  <TaskEditor
    {task}
    canReassignLayer
    assignableLayers={layers}
    onReassignLayer={id => {
      layerId = id
    }}
  />
</div>
