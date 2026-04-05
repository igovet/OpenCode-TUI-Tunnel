import { writable } from 'svelte/store';
import type { TerminalManager } from './terminal';

export const activeTerminalWrite = writable<((data: string) => void) | null>(null);
export const activeTerminalRef = writable<TerminalManager | null>(null);
