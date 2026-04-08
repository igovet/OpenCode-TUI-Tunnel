import { writable } from 'svelte/store';

export type AppView = 'home' | 'workspace';

export const appView = writable<AppView>('home');
