<script lang="ts">
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
import type { SVGAttributes } from 'svelte/elements'

let props: SVGAttributes<SVGSVGElement> = $props()
</script>

<LocationIcon kind="premises" {...props} />
