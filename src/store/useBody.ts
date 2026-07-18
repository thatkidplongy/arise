import { create } from 'zustand';

import {
  api,
  type ApiBody,
  type ApiBodyProfile,
  type ApiFoodEstimate,
  type ApiFoodSearchItem,
  type ApiSkincareProduct,
} from '@/lib/api';
import { dateKey } from '@/lib/dates';

import { link } from './link';

/**
 * The standalone Body tools (nutrition + skincare) live in their own store,
 * fetched from `/body` on demand — they don't touch the game state in useSystem.
 * Connection settings (server URL + token) come from `link`, so there's one
 * source of truth for the link.
 */
interface BodyStore {
  body: ApiBody | null;
  loading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  saveProfile: (profile: ApiBodyProfile) => Promise<void>;
  search: (q: string) => Promise<ApiFoodSearchItem[]>;
  searchProducts: (q: string) => Promise<ApiSkincareProduct[]>;
  analyzePhoto: (image: string, mime: string) => Promise<ApiFoodEstimate>;
  logFood: (entry: { name: string; grams: number; kcal: number; protein_g: number; fibre_g: number }) => Promise<void>;
  removeFood: (id: string) => Promise<void>;
  addStep: (routine: 'AM' | 'PM', text: string) => Promise<void>;
  removeStep: (id: string) => Promise<void>;
  toggleStep: (id: string, done: boolean) => Promise<void>;
}


export const useBody = create<BodyStore>((set) => ({
  body: null,
  loading: false,
  error: null,

  fetch: async () => {
    const { serverUrl, apiToken } = link();
    set({ loading: true });
    try {
      const body = await api.getBody(serverUrl, apiToken, dateKey());
      set({ body, loading: false, error: null });
    } catch {
      set({ loading: false, error: 'Could not reach the System server.' });
    }
  },

  saveProfile: async (profile) => {
    const { serverUrl, apiToken } = link();
    const body = await api.setBodyProfile(serverUrl, apiToken, profile, dateKey());
    set({ body });
  },

  search: async (q) => {
    const { serverUrl, apiToken } = link();
    return api.searchFood(serverUrl, apiToken, q);
  },

  searchProducts: async (q) => {
    const { serverUrl, apiToken } = link();
    return api.searchSkincare(serverUrl, apiToken, q);
  },

  analyzePhoto: async (image, mime) => {
    const { serverUrl, apiToken } = link();
    return api.analyzeFood(serverUrl, apiToken, image, mime);
  },

  logFood: async (entry) => {
    const { serverUrl, apiToken } = link();
    const body = await api.logFood(serverUrl, apiToken, entry, dateKey());
    set({ body });
  },

  removeFood: async (id) => {
    const { serverUrl, apiToken } = link();
    const body = await api.removeFood(serverUrl, apiToken, id, dateKey());
    set({ body });
  },

  addStep: async (routine, text) => {
    const { serverUrl, apiToken } = link();
    const body = await api.addSkincareStep(serverUrl, apiToken, routine, text, dateKey());
    set({ body });
  },

  removeStep: async (id) => {
    const { serverUrl, apiToken } = link();
    const body = await api.removeSkincareStep(serverUrl, apiToken, id, dateKey());
    set({ body });
  },

  toggleStep: async (id, done) => {
    const { serverUrl, apiToken } = link();
    const body = await api.checkSkincare(serverUrl, apiToken, id, done, dateKey());
    set({ body });
  },
}));
