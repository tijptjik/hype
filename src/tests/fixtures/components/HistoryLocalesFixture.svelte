<script lang="ts">
// COMPONENTS
import FeaturePublicationHistory from '#lib/bits/patterns/revisionHistory/FeaturePublicationHistory.svelte'
import ResourceHistory from '#lib/bits/patterns/revisionHistory/ResourceHistory.svelte'
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// TYPES
import type { RevisionDifference } from '#lib/revisions/diff.js'
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'
setResponsiveCtx()
const locales = ['en', 'zh-Hans', 'zh-Hant']
const changes: RevisionDifference[] = ['alt', 'caption'].flatMap(field =>
  locales.map(locale => ({
    path: ['gallery', 'entries', 'photo', field, locale],
    before: { present: false },
    after: {
      present: true,
      value:
        locale === 'en'
          ? 'A long descriptive photograph caption that should wrap naturally inside the comparison column.'
          : '一段較長的照片說明，應該在比較欄中自然換行。',
    },
  })),
)
const entry = {
  generation: 2,
  revisionId: 'revision',
  actorId: 'editor',
  actorName: 'History Editor',
  actorUsername: 'history.editor',
  origin: 'user',
  reason: 'Gallery edited',
  createdAt: '2026-11-07T04:00:00Z',
}
/** Supplies translated resource evidence without authentication or writes.
 * @returns Isolated profile history for the rendered layout check.
 */
async function loadPage(): Promise<OrganisationHistoryPage> {
  return {
    available: true,
    nextCursor: null,
    entries: [
      {
        id: 'profile',
        actor: null,
        actorId: 'editor',
        origin: 'user',
        reason: 'Names edited',
        createdAt: entry.createdAt,
        initial: false,
        changes: locales.map(locale => ({
          path: ['i18n', locale, 'name'],
          before: { present: true, value: 'Old name' },
          after: {
            present: true,
            value: locale === 'en' ? 'New multilingual name' : '多語言名稱',
          },
        })),
      },
    ],
  }
}
</script>
<main class="bg-panel text-foreground @container mx-auto min-h-screen max-w-6xl py-6">
  <FeaturePublicationHistory
    entries={[
      entry,
      {
        ...entry,
        generation: 1,
        reason: 'Publish requested development split example',
        actorUsername: 'local_agent_admin',
      },
      {
        ...entry,
        generation: 0,
        reason:
          'User-requested development-only Ghost Signs UI demo; copies preserve originals',
        actorUsername: 'local_agent_admin',
      },
    ]}
    canReview
    loadReview={async () => ({ changes, redacted: false })}
  />
  <ResourceHistory resourceId="org" resourceLabel="organisation" {loadPage} />
</main>
