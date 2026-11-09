import '#lib/styles/app.css'
import { mount } from 'svelte'
import Fixture from './components/LocationSharedEditorFixture.svelte'
mount(Fixture, { target: document.getElementById('app')! })
