<script lang="ts">
import { page } from '$app/state'
import { createAdminIndexCardModel } from '$lib/adapters/cards/createAdminIndexCardModel'
import IndexCard from '$lib/bits/patterns/cards/indexCard/IndexCard.svelte'
import { getAdminCtx } from '$lib/context/admin.svelte'
import type { KeyMap } from '$lib/types'
import type { Feature } from '$lib/db/zod/schema/feature.types'

let { entity }: { entity: Feature } = $props()

const adminCtx = getAdminCtx()

const keyMap: KeyMap = {
  id: 'id',
  title: 'i18n.title',
  subtitle: 'i18n.addressProperties.neighbourhood',
  description: 'i18n.displayAddress',
  image: 'image',
  badges: [],
}
</script>

<IndexCard
  {...createAdminIndexCardModel({
    adminCtx,
    entity,
    keyMap,
    search: page.url.search,
  })}
/>
