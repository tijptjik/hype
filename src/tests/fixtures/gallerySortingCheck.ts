import { mount } from 'svelte'
import Fixture from './components/GallerySortingFixture.svelte'
import '#lib/styles/app.css'
mount(Fixture, { target: document.getElementById('app')! })
