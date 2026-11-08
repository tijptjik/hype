import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/AdvancedLayoutFixture.svelte'
mount(Fixture, { target: document.getElementById('app')! })
