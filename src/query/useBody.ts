import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ApiBody, type ApiBodyProfile } from '@/lib/api';
import { dateKey } from '@/lib/dates';

import { authed } from './authed';
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
    queryFn: () => authed((b, t) => api.getBody(b, t, day)),
  });

  const onSuccess = (body: ApiBody) => qc.setQueryData(qk.body(day), body);

  const saveProfileMut = useMutation({
    mutationFn: (p: ApiBodyProfile) => authed((b, t) => api.setBodyProfile(b, t, p, day)),
    onSuccess,
  });
  const logFoodMut = useMutation({
    mutationFn: (e: FoodEntry) => authed((b, t) => api.logFood(b, t, e, day)),
    onSuccess,
  });
  const removeFoodMut = useMutation({
    mutationFn: (id: string) => authed((b, t) => api.removeFood(b, t, id, day)),
    onSuccess,
  });
  const addStepMut = useMutation({
    mutationFn: (v: { routine: 'AM' | 'PM'; text: string }) =>
      authed((b, t) => api.addSkincareStep(b, t, v.routine, v.text, day)),
    onSuccess,
  });
  const removeStepMut = useMutation({
    mutationFn: (id: string) => authed((b, t) => api.removeSkincareStep(b, t, id, day)),
    onSuccess,
  });
  const toggleStepMut = useMutation({
    mutationFn: (v: { id: string; done: boolean }) =>
      authed((b, t) => api.checkSkincare(b, t, v.id, v.done, day)),
    onSuccess,
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
    search: (q: string) => authed((b, t) => api.searchFood(b, t, q)),
    searchProducts: (q: string) => authed((b, t) => api.searchSkincare(b, t, q)),
    analyzePhoto: (image: string, mime: string) => authed((b, t) => api.analyzeFood(b, t, image, mime)),
  };
}
