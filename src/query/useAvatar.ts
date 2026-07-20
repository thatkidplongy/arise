import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useSystem } from '@/store/useSystem';

import { authed } from './authed';
import { qk } from './keys';

/**
 * The profile picture — kept out of the frequent /state payload so a base64
 * image never bloats it, so it's its own query. Reference migration to React
 * Query: the image is server state (a query); the upload's `progress`/`busy`
 * are client state (local to the mutation), which is why they stay here rather
 * than in the cache. `enabled` gates the fetch so we don't ask when there's
 * nothing to load. `uri`: null = not loaded, '' = none set, else a data URI.
 */
export function useAvatar(enabled: boolean) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState(0);

  const query = useQuery({
    queryKey: qk.avatar,
    queryFn: () => authed(async (c) => (await c.getAvatar()).avatar),
    enabled,
    staleTime: Infinity, // changes only via save() below, which writes the cache
  });

  const save = useMutation({
    mutationFn: (uri: string) => {
      setProgress(0);
      return authed(async (c) => (await c.setAvatar(uri, setProgress)).avatar);
    },
    onSuccess: (avatar) => {
      qc.setQueryData(qk.avatar, avatar);
      setProgress(1);
      void useSystem.getState().refresh(); // keep player.has_avatar current
    },
  });

  return {
    uri: query.data ?? null,
    busy: save.isPending,
    progress,
    save: (uri: string) => save.mutate(uri),
  };
}
