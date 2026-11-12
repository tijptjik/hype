import '#lib/styles/app.css'
import { mount } from 'svelte'
import Fixture from './components/NameEditorSearchFixture.svelte'
mount(Fixture, { target: document.getElementById('app')! })
