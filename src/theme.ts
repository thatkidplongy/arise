import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { Rank, StatKey } from '@/types';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * One warm, sandy design system. Flat surfaces, generous whitespace, a single
 * clay accent, earthy stat tones. No gradients, glows, or neon — restraint is
 * the aesthetic.
 */
export const surface = {
  base: '#F0E8D8', // warm sand page
  card: '#FAF5EB', // warm ivory card
  raised: 'rgba(44, 39, 32, 0.03)',
  hairline: '#E4D9C2', // warm tan border
  overlay: 'rgba(44, 39, 32, 0.38)', // scrim
};

export const text = {
  primary: '#2C2720', // espresso
  secondary: '#7E7361', // taupe
  faint: '#A99D85', // light taupe
};

/** The single accent, used sparingly. */
export const accent = '#B0603A'; // clay
export const accentBright = '#C67C4E';

export const feedback = {
  success: '#6F8A57', // sage
  danger: '#B0503F', // brick
  gold: '#BE9A57', // warm ochre
};

export const RANK_COLORS: Record<Rank, string> = {
  E: '#9A8F79',
  D: '#7C8A5A',
  C: '#5E8085',
  B: '#977A8C',
  A: '#C0863E',
  S: '#BE9A57',
};

export const STAT_KEYS: StatKey[] = ['STR', 'CRE', 'SPI', 'CHA', 'INT'];

export const STAT_META: Record<
  StatKey,
  { label: string; sub: string; color: string; icon: IconName }
> = {
  STR: { label: 'Strength', sub: 'Badminton, strength & conditioning', color: '#B0603A', icon: 'barbell' },
  CRE: { label: 'Creativity', sub: 'Drawing, music & video', color: '#C0863E', icon: 'brush' },
  SPI: { label: 'Spirit', sub: 'Meditation & reflection', color: '#6F8A57', icon: 'leaf' },
  CHA: { label: 'Charisma', sub: 'Connection', color: '#977A8C', icon: 'people' },
  INT: { label: 'Intelligence', sub: 'Reading, coding, science & languages', color: '#5E8085', icon: 'book' },
};

/** '#RRGGBB' + alpha -> 'rgba(...)', for soft tint fills. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
