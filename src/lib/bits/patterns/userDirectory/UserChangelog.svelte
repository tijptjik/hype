<script lang="ts">
// API
import { getUserChangelog } from '#lib/api/userChangelog.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// I18N
import { getLocaleKey } from '#lib/i18n.js'
// COMPONENTS
import ResourceChangelog from '#lib/bits/patterns/revisionHistory/ResourceChangelog.svelte'
// TYPES
import type {
  ChangelogCursor,
  ChangelogFilters,
  ChangelogPage,
} from '#lib/revisions/changelog.js'

let { userId }: { userId: string } = $props()
const locale = $derived(getLocaleKey())

/** Load a freshly authorized page on entry, refresh or continuation.
 * @param before Stable continuation cursor.
 * @param filters User-selected display filters; they cannot broaden authorization.
 * @param includeFilterOptions Whether to include authorized filter metadata.
 * @returns The subject's changes within the viewer's current resource scope.
 */
async function loadPage(
  before?: ChangelogCursor,
  filters?: ChangelogFilters,
  includeFilterOptions?: boolean,
): Promise<ChangelogPage> {
  return await refreshRemoteQuery(
    getUserChangelog({
      userId,
      locale,
      before,
      filters,
      includeFilterOptions,
      meta: { isAdminRequest: true },
    }),
  )
}
</script>

<section
  aria-label="User change log"
  class="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
>
  <ResourceChangelog
    identity={`user:${userId}`}
    description="This user's recorded changes to resources you manage · newest first"
    {locale}
    {loadPage}
  />
  <p class="text-muted-foreground shrink-0 px-4 pb-3 text-xs">
    Unrecorded legacy edits and unaccepted drafts are not included.
  </p>
</section>
