import { writable } from 'svelte/store';
// When set to a number, TerminalGrid should switch to that page.
// Set back to null after consumption.
export const requestedWorkspacePage = writable<number | null>(null);
