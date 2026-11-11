// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/ChangelogCoordinateFixture.svelte'
// STYLES
import '#lib/styles/app.css'
const target = document.getElementById('app')
if (target) mount(Fixture, { target })
