// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/FieldOptionsPanelFixture.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('Missing field options panel fixture target')
mount(Fixture, { target })
