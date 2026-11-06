<script lang="ts">
// COMPONENTS
import ResourceHistory from '#lib/bits/patterns/revisionHistory/ResourceHistory.svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// TYPES
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'

setResponsiveCtx()
const narrow = new URLSearchParams(window.location.search).has('narrow')
const now = Date.now()
const actor = {
  name: 'History Editor',
  username: 'history.editor',
  displayUsername: 'History.Editor',
  image: null,
}
const latest = {
  id: 'logo-change',
  actorId: 'editor',
  actor,
  origin: 'user',
  reason: 'Resource image updated',
  initial: false,
  createdAt: new Date(now - 40 * 60_000).toISOString(),
  previousCreatedAt: new Date(now - 90 * 60_000).toISOString(),
  logo: {
    before: { imageId: 'old-logo', imageRevisionId: null },
    after: { imageId: 'new-logo', imageRevisionId: 'new-logo-version' },
  },
  changes: [
    {
      path: ['record', 'imageId'],
      before: { present: true as const, value: 'OPs-NIUaUO62' },
      after: {
        present: true as const,
        value: `upload-${'6a454a08c239229fd9ef14462d9fa1447'.repeat(3)}`,
      },
    },
  ],
}

/** Supplies representative immutable history for layout and interaction checks.
 * @param before Optional continuation cursor.
 * @param kind Selected profile or catalogue category.
 * @returns Synthetic entries without reading or changing application data.
 */
async function loadPage(
  before?: number,
  kind?: 'profile' | 'fields',
): Promise<OrganisationHistoryPage> {
  if (kind === 'fields')
    return {
      available: true,
      nextCursor: null,
      entries: [
        {
          ...latest,
          id: 'catalogue',
          reason: 'Contact options updated',
          logo: undefined,
          fieldLabels: { contact: 'Preferred contact method' },
          changes: [
            {
              path: ['contact', 'values', 'option-id'],
              before: { present: false },
              after: {
                present: true,
                value: { record: { rank: 2 }, i18n: { en: { value: 'Telegram' } } },
              },
            },
          ],
        },
      ],
    }
  if (before)
    return {
      available: true,
      nextCursor: null,
      entries: [
        {
          ...latest,
          id: 'baseline',
          actorId: 'system:baseline',
          actor: null,
          origin: 'migration',
          reason: 'State captured before revision tracking',
          initial: true,
          createdAt: new Date(now - 90 * 60_000).toISOString(),
          logo: { before: null, after: { imageId: 'old-logo', imageRevisionId: null } },
          changes: [],
        },
      ],
    }
  return {
    available: true,
    nextCursor: 1,
    entries: [
      latest,
      {
        ...latest,
        id: 'profile',
        reason: 'Organisation form save',
        createdAt: new Date(now - 90 * 60_000).toISOString(),
        changes: [
          {
            path: ['i18n', 'en', 'name'],
            before: { present: true, value: 'Neighbourhood Food' },
            after: { present: true, value: 'Neighbourhood Food Collective' },
          },
          {
            path: ['i18n', 'en', 'description'],
            before: { present: false },
            after: {
              present: true,
              value:
                'Collecting surplus food and connecting volunteers with neighbourhood partners.',
            },
          },
          {
            path: ['i18n', 'zh-Hant', 'name'],
            before: { present: true, value: '社區食物' },
            after: { present: true, value: '社區食物共享' },
          },
          {
            path: ['record', 'isPublished'],
            before: { present: true, value: false },
            after: { present: true, value: true },
          },
        ],
      },
    ],
  }
}
</script>

<div class="bits-theme bg-panel text-foreground min-h-screen p-2 sm:p-6">
  <div class={narrow ? 'mx-auto max-w-[430px]' : 'mx-auto max-w-5xl'}>
    <ResourceHistory
      resourceId="layout-fixture"
      resourceLabel="organisation"
      {loadPage}
      showFields
    />
  </div>
</div>
