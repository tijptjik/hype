// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/PanelMotionFixture.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('Missing panel motion fixture target')
mount(Fixture, { target })
