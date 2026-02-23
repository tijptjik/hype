<script lang="ts">
import type { Snippet } from 'svelte'
import { Card } from '$lib/bits/patterns/cardPrimitives'
import type { OrganisationCardRootProps } from '../organisationCard.types'

type Props = OrganisationCardRootProps & { children?: Snippet }

let { class: className = '', children }: Props = $props()
</script>

<Card.Root class={`bits-form__hub-orgs-item ${className}`}>
  {@render children?.()}
</Card.Root>
