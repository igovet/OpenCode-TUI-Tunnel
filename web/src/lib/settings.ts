// Shim: re-export from .svelte.ts so Svelte 5 transpiles the $state rune.
// Direct importers of '$lib/settings' still resolve via this shim.
export * from './settings.svelte';
