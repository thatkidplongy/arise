import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ApiBody, type ApiBodyProfile } from '@/lib/api';
import { dateKey } from '@/lib/dates';
import { link } from '@/store/link';

import { qk } from './keys';

type FoodEntry = { name: string; grams: number; kcal: number; protein_g: number; fibre_g: number };

/**
 * The Body tab's data (nutrition + skincare for the day) as a React Query. Reads
 * are one cached query keyed by the day; every mutation returns the fresh BodyOut
 * and writes it straight into the cache — server-authoritative, like the rest of
 * the app. One-shot lookups (food/product search, photo analysis) don't change
 * server state, so they stay plain calls rather than queries.
 */
export function useBody() {
  const qc = useQueryClient();
  const day = dateKey();

  const query = useQuery({
    queryKey: qk.body(day),
    queryFn: () => {
      const { serverUrl, apiToken } = link();
      return api.getBody(serverUrl, apiToken, day);
    },
  });

  const writeCache = (body: ApiBody) => qc.setQueryData(qk.body(day), body);

  const saveProfileMut = useMutation({
    mutationFn: (profile: ApiBodyProfile) => {
      const { serverUrl, apiToken } = link();
      return api.setBodyProfile(serverUrl, apiToken, profile, day);
    },
    onSuccess: writeCache,
  });
  const logFoodMut = useMutation({
    mutationFn: (entry: FoodEntry) => {
      const { serverUrl, apiToken } = link();
      return api.logFood(serverUrl, apiToken, entry, day);
    },
    onSuccess: writeCache,
  });
  const removeFoodMut = useMutation({
    mutationFn: (id: string) => {
      const { serverUrl, apiToken } = link();
      return api.removeFood(serverUrl, apiToken, id, day);
    },
    onSuccess: writeCache,
  });
  const addStepMut = useMutation({
    mutationFn: (v: { routine: 'AM' | 'PM'; text: string }) => {
      const { serverUrl, apiToken } = link();
      return api.addSkincareStep(serverUrl, apiToken, v.routine, v.text, day);
    },
    onSuccess: writeCache,
  });
  const removeStepMut = useMutation({
    mutationFn: (id: string) => {
      const { serverUrl, apiToken } = link();
      return api.removeSkincareStep(serverUrl, apiToken, id, day);
    },
    onSuccess: writeCache,
  });
  const toggleStepMut = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => {
      const { serverUrl, apiToken } = link();
      return api.checkSkincare(serverUrl, apiToken, v.id, v.done, day);
    },
    onSuccess: writeCache,
  });

  return {
    body: query.data ?? null,
    refetch: query.refetch,
    saveProfile: (profile: ApiBodyProfile) => saveProfileMut.mutateAsync(profile),
    logFood: (entry: FoodEntry) => logFoodMut.mutateAsync(entry),
    removeFood: (id: string) => removeFoodMut.mutateAsync(id),
    addStep: (routine: 'AM' | 'PM', text: string) => addStepMut.mutateAsync({ routine, text }),
    removeStep: (id: string) => removeStepMut.mutateAsync(id),
    toggleStep: (id: string, done: boolean) => toggleStepMut.mutateAsync({ id, done }),
    search: (q: string) => {
      const { serverUrl, apiToken } = link();
      return api.searchFood(serverUrl, apiToken, q);
    },
    searchProducts: (q: string) => {
      const { serverUrl, apiToken } = link();
      return api.searchSkincare(serverUrl, apiToken, q);
    },
    analyzePhoto: (image: string, mime: string) => {
      const { serverUrl, apiToken } = link();
      return api.analyzeFood(serverUrl, apiToken, image, mime);
    },
  };
}
