// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/FeatureTransferHistoryFixture.svelte'
// STYLES
import '#lib/styles/app.css'
const target = document.getElementById('app')
if (!target) throw new Error('Missing history fixture target')
mount(Fixture, { target })
