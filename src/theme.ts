import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { Rank, StatKey } from '@/types';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const colors = {
  bg: '#070B14',
  bgElevated: '#0A101D',
  card: '#0C1526',
  border: '#1C3557',
  primary: '#4DA6FF',
  primaryBright: '#7CC4FF',
  text: '#E6F1FF',
  textDim: '#7E93B3',
  gold: '#FFD166',
  success: '#3DDC97',
  danger: '#FF5C7A',
};

export const RANK_COLORS: Record<Rank, string> = {
  E: '#8A97A8',
  D: '#3DDC97',
  C: '#4DA6FF',
  B: '#9B6DFF',
  A: '#FF9F43',
  S: '#FFD166',
};

export const STAT_KEYS: StatKey[] = ['STR', 'CRE', 'SPI', 'CHA', 'INT'];

export const STAT_META: Record<StatKey, { label: string; sub: string; color: string; icon: IconName }> = {
  STR: { label: 'Strength', sub: 'Badminton & conditioning', color: '#FF5C7A', icon: 'barbell' },
  CRE: { label: 'Creativity', sub: 'Drawing', color: '#FF9F43', icon: 'brush' },
  SPI: { label: 'Spirit', sub: 'Meditation', color: '#3DDC97', icon: 'leaf' },
  CHA: { label: 'Charisma', sub: 'Connection', color: '#9B6DFF', icon: 'people' },
  INT: { label: 'Intelligence', sub: 'Reading & learning', color: '#4DA6FF', icon: 'book' },
};

/** '#RRGGBB' + alpha -> 'rgba(...)', for glows and translucent fills. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
