<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getImageCtx } from '$lib/context/image.svelte'
// LOCAL
import FeatureCardActionLabel from '../FeatureCardActionLabel.svelte'

const imageCtx = getImageCtx()
const stagedCount = $derived(imageCtx.state.stagingQueue.length)
const label = $derived(stagedCount > 0 ? m.photo({ n: stagedCount }) : 'Add Photos')
</script>

<FeatureCardActionLabel text={label} count={stagedCount > 0 ? stagedCount : null} />
