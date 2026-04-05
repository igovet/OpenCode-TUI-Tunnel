import './styles/theme.css';
import { mount } from 'svelte';
import { registerServiceWorker } from './lib/pwa';

import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

registerServiceWorker();

export default app;
