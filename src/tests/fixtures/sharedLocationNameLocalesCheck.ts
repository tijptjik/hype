import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/SharedLocationNameLocalesFixture.svelte'
mount(Fixture, { target: document.getElementById('app')! })
