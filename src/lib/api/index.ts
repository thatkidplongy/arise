/**
 * The API surface, in one import.
 *
 * A barrel on purpose: `@/lib/api` is what sixty-odd files already import, and
 * which of the three files a given type lives in is an organising detail they
 * shouldn't have to track. Splitting the module cost zero call sites because of
 * this file.
 */

export * from './types';
export * from './body';
export * from './client';
