// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import FeatureIdentityWorkspace from '#lib/bits/patterns/revisionHistory/FeatureIdentityWorkspace.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('Missing identity editor fixture target')
mount(FeatureIdentityWorkspace, { target, props: { featureId: '-CPB8EQMld2x', onPublished: async () => {} } })
