// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/MapIntroFixture.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('Map intro fixture target is missing')
mount(Fixture, { target })
