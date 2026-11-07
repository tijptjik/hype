// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/FeatureHistoryFixture.svelte'
// STYLES
import '#lib/styles/app.css'
const target = document.getElementById('app')
if (!target) throw new Error('Missing feature history fixture target')
mount(Fixture, { target })
