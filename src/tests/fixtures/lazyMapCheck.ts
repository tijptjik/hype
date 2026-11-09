// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/LazyMapFixture.svelte'

mount(Fixture, { target: document.getElementById('app')! })
