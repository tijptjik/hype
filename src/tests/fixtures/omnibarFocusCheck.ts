import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/OmnibarFocusFixture.svelte'

mount(Fixture, { target: document.getElementById('app')! })
