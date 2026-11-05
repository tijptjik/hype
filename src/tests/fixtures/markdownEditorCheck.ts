// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/MarkdownEditorFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing Markdown editor fixture target')
mount(Fixture, { target })
