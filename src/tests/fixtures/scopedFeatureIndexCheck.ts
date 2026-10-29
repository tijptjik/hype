// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/ScopedFeatureIndexFixture.svelte'
// STYLES
import '#lib/styles/app.css'

const target = document.getElementById('app')
if (!target) throw new Error('Fixture mount target is missing')
mount(Fixture, { target })
