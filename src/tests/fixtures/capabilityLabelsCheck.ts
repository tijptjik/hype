// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/CapabilityLabelsFixture.svelte'
// STYLES
import '#lib/styles/app.css'

const target = document.getElementById('app')
if (!target) throw new Error('Missing capability labels fixture target')
mount(Fixture, { target })
