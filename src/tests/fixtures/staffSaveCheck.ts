// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import LocationCorrectionWorkspace from '#lib/bits/patterns/revisionHistory/LocationCorrectionWorkspace.svelte'
// STYLES
import '#lib/styles/app.css'
mount(LocationCorrectionWorkspace, {
  target: document.getElementById('app')!,
  props: { featureId: 'fixture' },
})
