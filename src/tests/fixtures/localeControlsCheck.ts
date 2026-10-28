// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// FIXTURE
import Fixture from './components/LocaleControlsFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing locale controls fixture target')
mount(Fixture, { target })
