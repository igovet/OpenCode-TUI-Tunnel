import { writable } from 'svelte/store';

export const workspacePage = writable<number>(0);
export const workspaceTotalPages = writable<number>(1);
export const workspaceMaxPanes = writable<number>(1);
