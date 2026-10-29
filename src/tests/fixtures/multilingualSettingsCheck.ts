import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/MultilingualSettingsFixture.svelte'
mount(Fixture, { target: document.getElementById('app')! })
