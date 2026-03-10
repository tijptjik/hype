<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// BITS
import { EntityCard } from '$lib/bits'
// TYPES
import type { KeyMap } from '$lib/types'
import type { Feature } from '$lib/db/zod/schema/feature.types'

let { entity }: { entity: Feature } = $props()

const keyMap: KeyMap = {
  id: 'id',
  title: 'i18n.title',
  subtitle: 'i18n.addressProperties.neighbourhood',
  description: 'i18n.displayAddress',
  image: 'image',
  badges: [],
}
</script>

<EntityCard {entity} {keyMap} />
