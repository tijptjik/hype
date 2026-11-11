import { mount } from 'svelte'
import Fixture from './components/FieldEditorFixture.svelte'
import '#lib/styles/app.css'
const target = document.getElementById('app')
if (!target) throw new Error('Missing field fixture mount')
mount(Fixture, { target })
