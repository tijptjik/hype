// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/AddressCorrectionsFixture.svelte'

mount(Fixture, { target: document.getElementById('app')! })
