// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/ImagePresentationFixture.svelte'
// STYLES
import '#lib/styles/app.css'

mount(Fixture, { target: document.getElementById('app')! })
