<script lang="ts">
// COMPONENTS
import ChangelogCoordinateMap from '#lib/bits/patterns/revisionHistory/components/ChangelogCoordinateMap.svelte'
// THEME
import { setThemeModel } from '#lib/themes/theme.svelte.js'
// TYPES
import type { RevisionDifference } from '#lib/revisions/diff.js'
const theme = setThemeModel()
theme.mapSelected = 'hyperAdmin'
const before: [number, number] = [114.17268795589794, 22.299860199999998]
const after: [number, number] = [114.17321553153181, 22.299890502759055]
const change: RevisionDifference = {
  path: ['placement', 'geometry', 'coordinates'],
  before: { present: true, value: before },
  after: { present: true, value: after },
}
</script>

<div class="bg-background text-foreground grid gap-4 p-4 sm:grid-cols-2">
  <div>
    <p>Before</p>
    <ChangelogCoordinateMap {change} coordinates={before} side="before" />
  </div>
  <div>
    <p>After</p>
    <ChangelogCoordinateMap {change} coordinates={after} side="after" />
  </div>
</div>
