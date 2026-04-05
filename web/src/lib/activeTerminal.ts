import { writable } from 'svelte/store';

// Function to write to the currently active terminal
export const activeTerminalWrite = writable<((data: string) => void) | null>(null);
