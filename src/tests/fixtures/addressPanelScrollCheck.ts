import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/AddressPanelScrollFixture.svelte'
mount(Fixture, { target: document.getElementById('app')! })
