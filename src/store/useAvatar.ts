import { create } from 'zustand';

import { api } from '@/lib/api';

import { link } from './link';
import { useSystem } from './useSystem';

/**
 * The profile picture lives in its own tiny store, fetched on demand from
 * /player/avatar — it's deliberately kept out of the frequent /state payload so
 * a base64 image never bloats it. After a save we refresh useSystem so
 * player.has_avatar stays in sync. Connection settings borrowed from useSystem.
 */
interface AvatarStore {
  uri: string | null; // null = not loaded yet; '' = none set; else a data URI
  busy: boolean;
  load: () => Promise<void>;
  save: (uri: string) => Promise<void>; // '' clears it
}

export const useAvatar = create<AvatarStore>((set) => ({
  uri: null,
  busy: false,

  load: async () => {
    const { serverUrl, apiToken } = link();
    try {
      const { avatar } = await api.getAvatar(serverUrl, apiToken);
      set({ uri: avatar });
    } catch {
      set({ uri: '' }); // treat an unreachable avatar as "none" rather than looping
    }
  },

  save: async (uri) => {
    const { serverUrl, apiToken } = link();
    set({ busy: true });
    try {
      const res = await api.setAvatar(serverUrl, apiToken, uri);
      set({ uri: res.avatar, busy: false });
      void useSystem.getState().refresh(); // keep player.has_avatar current
    } catch {
      set({ busy: false });
    }
  },
}));
