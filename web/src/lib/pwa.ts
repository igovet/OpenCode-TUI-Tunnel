// Shim: re-export from .svelte.ts so Svelte 5 transpiles the $state rune.
// Direct importers of '$lib/pwa' still resolve via this shim.
export * from './pwa.svelte';
