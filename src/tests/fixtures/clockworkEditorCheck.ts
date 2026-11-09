import '#lib/styles/app.css'
import { mount } from 'svelte'
import Fixture from './components/ClockworkEditorFixture.svelte'
mount(Fixture, { target: document.getElementById('app')! })
