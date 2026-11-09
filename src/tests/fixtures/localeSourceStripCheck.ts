import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/LocaleSourceStripFixture.svelte'
mount(Fixture, { target: document.getElementById('app')! })
