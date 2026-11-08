// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import FeatureIdentityDialog from '#lib/bits/patterns/revisionHistory/FeatureIdentityDialog.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture target')
const query = new URLSearchParams(location.search)
mount(FeatureIdentityDialog, {
  target,
  props: {
    open: true,
    kind: query.has('merge') ? 'merge' : 'split',
    creationProposal: query.has('creation'),
    duplicateTaskId: query.has('creation') ? 'creation-task' : undefined,
    featureId: '-CPB8EQMld2x',
    layerId: 'layer',
    onApplied: async () => {},
  },
})
