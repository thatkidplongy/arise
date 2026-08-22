import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import type { Rank, StatKey } from '@/types';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Arise v2 — the "Organic" language: a cream-and-sand ground, one clay accent and
 * a sage second voice, Caprasimo over Figtree, over-rounded containers and pill
 * controls. Everything visual comes from this file; nothing downstream hard-codes
 * a hex, a radius or a font name.
 *
 * The three ramps below are the design system's, generated in OKLCH on one shared
 * lightness scale — so step 200 of any ramp carries the same visual weight as step
 * 200 of the others. Reach for a ramp step rather than mixing your own tint.
 */
export const neutral = {
  100: '#F9F4ED',
  200: '#EEE7DB',
  300: '#DCD3C4',
  400: '#C0B6A5',
  500: '#A19786',
  600: '#82796A',
  700: '#645C50',
  800: '#474238',
  900: '#2E2B25',
} as const;

/** The clay ramp — the accent's tonal family. */
export const clay = {
  100: '#FFF2EB',
  200: '#FFE1D0',
  300: '#FFC6A5',
  400: '#F6A06B',
  500: '#D67F48',
  600: '#B2622D',
  700: '#8C491A',
  800: '#643312',
  900: '#402310',
} as const;

/** The sage ramp — the second voice: cleared, rested, safe. Never a warning. */
export const sage = {
  100: '#F0FAE1',
  200: '#E1EECC',
  300: '#CCDBB2',
  400: '#AEBF92',
  500: '#8FA073',
  600: '#728157',
  700: '#56633F',
  800: '#3D472B',
  900: '#272E1B',
} as const;

export const surface = {
  base: '#F5EAD8', // warm sand page
  card: neutral[100], // ivory card — the default surface
  muted: neutral[200], // inset fields, chips, quiet fills
  raised: 'rgba(46, 43, 37, 0.03)',
  hairline: neutral[300], // rules and card edges
  edge: neutral[400], // a border that needs to be seen
  overlay: 'rgba(32, 30, 29, 0.5)', // scrim
  system: neutral[900], // the System speaks from ink
  clayPatch: clay[100], // the North Star, and what's happening now
  clayFill: clay[200],
  sagePatch: sage[100],
  sageFill: sage[200],
};

/**
 * The System's side of the palette. Nothing new is invented here — the same clay
 * and sage, inverted onto espresso, where the accent reads as a screen rather than
 * a page. Clay on ink does the job the manhwa's electric blue does, without neon.
 *
 * Ink is rationed: at most two windows per screen, so dark keeps meaning *the
 * System is talking*.
 */
export const ink = {
  bg: neutral[900],
  /** A window lifted off the window behind it. */
  raised: 'rgba(249, 244, 237, 0.09)',
  fill: 'rgba(249, 244, 237, 0.11)',
  track: 'rgba(249, 244, 237, 0.13)',
  rule: 'rgba(249, 244, 237, 0.13)',
  /** The corner brackets and the tracked label between the rules. */
  bracket: clay[400],
  bracketRule: 'rgba(246, 160, 107, 0.32)',
  /** Sage says cleared, on ink as on sand. */
  bracketSage: sage[400],
  bracketSageRule: 'rgba(174, 191, 146, 0.34)',
  text: neutral[100],
  textDim: 'rgba(249, 244, 237, 0.72)',
  textFaint: 'rgba(249, 244, 237, 0.62)',
  accent: clay[300],
  accentDim: clay[400],
  sage: sage[300],
  sageFill: 'rgba(174, 191, 146, 0.18)',
  clayFill: 'rgba(246, 160, 107, 0.13)',
};

export const text = {
  primary: '#201E1D', // ink
  secondary: neutral[700],
  faint: neutral[600],
  onClay: clay[700], // accent-coloured body copy, at a contrast that passes
  onSage: sage[800],
  onSystem: neutral[100],
  onSystemDim: neutral[300],
};

/** The single accent, used sparingly. */
export const accent = '#C67139'; // clay
/** The accent, lifted so it still reads on the ink surfaces. */
export const accentOnDark = clay[400];
/** Ivory text/icon that sits on a filled-accent button. */
export const onAccent = neutral[100];
/** The second accent — a genuine voice, not a highlight. */
export const accent2 = '#7A8A5E'; // sage

export const feedback = {
  success: sage[600],
  danger: '#B0503F', // brick
  gold: '#BE9A57', // warm ochre
};

/** 8 / 16 / 28 for containers; anything tappable goes fully round. */
export const radius = {
  sm: 8,
  md: 16,
  lg: 28,
  pill: 999,
} as const;

/** The spacing scale — density 1.10x, same as the design system's --space-*. */
export const space = {
  xs: 4,
  sm: 9,
  md: 13,
  lg: 18,
  xl: 26,
  xxl: 35,
} as const;

/** Nothing interactive is smaller than this, ever. */
export const TAP_MIN = 44;

/** Elevation, tuned to the sand ground. */
export const shadow: Record<'sm' | 'md' | 'lg', ViewStyle> = {
  sm: {
    shadowColor: neutral[900],
    shadowOpacity: 0.14,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: neutral[900],
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  lg: {
    shadowColor: neutral[900],
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
};

/**
 * Font families. Bricolage Grotesque is the only display voice — headings and every
 * number that matters. It's a contemporary app voice that keeps some character in
 * the letterforms without the slab weight. Figtree carries everything else, and
 * monospace is reserved for counters, ranks and totals.
 *
 * These are the family names the loader in `_layout.tsx` registers; on native a
 * custom family and a `fontWeight` must not be combined (Android synthesises a
 * fake bold), so pick the family that already carries the weight.
 */
export const font = {
  display: 'BricolageGrotesque_700Bold',
  regular: 'Figtree_400Regular',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace' }) as string,
} as const;

/** Weight -> the Figtree cut that carries it. Three cuts ship, matching the design
 * system's own set, so 500 rounds up to SemiBold rather than pointing at nothing. */
export const FIGTREE_BY_WEIGHT: Record<string, string> = {
  '100': font.regular,
  '200': font.regular,
  '300': font.regular,
  '400': font.regular,
  normal: font.regular,
  '500': font.semibold,
  '600': font.semibold,
  '700': font.bold,
  '800': font.bold,
  '900': font.bold,
  bold: font.bold,
};

/** The type scale. Presets, so no screen invents its own size/weight pairing. */
export const typography = {
  /** The wordmark on Status. */
  wordmark: { fontFamily: font.display, fontSize: 34, lineHeight: 36, letterSpacing: -0.6 } as TextStyle,
  /** A screen's own name. */
  screenTitle: { fontFamily: font.display, fontSize: 32, lineHeight: 35, letterSpacing: -0.7 } as TextStyle,
  /** A heading inside a card. */
  section: { fontFamily: font.display, fontSize: 21, lineHeight: 25, letterSpacing: -0.35 } as TextStyle,
  /** A smaller heading, or a card that is itself the heading. */
  heading: { fontFamily: font.display, fontSize: 18, lineHeight: 23, letterSpacing: -0.25 } as TextStyle,
  /** A number that matters — size it at the call site. */
  numeral: { fontFamily: font.display, letterSpacing: -0.4 } as TextStyle,
  /** Card titles and controls. */
  cardTitle: { fontFamily: font.semibold, fontSize: 14, lineHeight: 19 } as TextStyle,
  label: { fontFamily: font.semibold, fontSize: 12.5, lineHeight: 17 } as TextStyle,
  /** Body copy — the voice of the app: invite, never command. */
  body: { fontFamily: font.regular, fontSize: 13, lineHeight: 21 } as TextStyle,
  small: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 17 } as TextStyle,
  tiny: { fontFamily: font.regular, fontSize: 10.5, lineHeight: 15 } as TextStyle,
  /** Tracked, uppercase, above the thing it names. */
  kicker: {
    fontFamily: font.semibold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  } as TextStyle,
  button: { fontFamily: font.semibold, fontSize: 13.5, lineHeight: 18 } as TextStyle,
  mono: { fontFamily: font.mono, fontSize: 11.5, lineHeight: 16 } as TextStyle,
};

/** Rank tiles: a tinted disc, its letter in the deep step of the same family. */
export const RANK_COLORS: Record<Rank, string> = {
  E: '#9A8F79',
  D: '#7C8A5A',
  C: '#5E8085',
  B: '#977A8C',
  A: '#C0863E',
  S: '#BE9A57',
};

/** S is the one rank that inverts — ink disc, clay letter. */
export const RANK_FILL: Record<Rank, { bg: string; fg: string }> = {
  E: { bg: 'rgba(154, 143, 121, 0.22)', fg: neutral[700] },
  D: { bg: sage[200], fg: sage[800] },
  C: { bg: 'rgba(94, 128, 133, 0.22)', fg: '#3F5C60' },
  B: { bg: 'rgba(151, 122, 140, 0.22)', fg: '#6B5464' },
  A: { bg: clay[200], fg: clay[800] },
  S: { bg: neutral[900], fg: clay[300] },
};

export const STAT_META: Record<
  StatKey,
  { label: string; sub: string; color: string; icon: IconName }
> = {
  STR: { label: 'Strength', sub: 'Badminton, strength & conditioning', color: '#B0603A', icon: 'barbell' },
  CRE: { label: 'Creativity', sub: 'Drawing, dance, music & video', color: '#C0863E', icon: 'brush' },
  SPI: { label: 'Spirit', sub: 'Meditation & reflection', color: '#6F8A57', icon: 'leaf' },
  CHA: { label: 'Charisma', sub: 'Connection', color: '#977A8C', icon: 'people' },
  INT: { label: 'Intelligence', sub: 'Reading, math, languages & the world', color: '#5E8085', icon: 'book' },
  WLT: { label: 'Wealth', sub: 'Earning, business & money skills', color: '#4E7D6E', icon: 'cash' },
  CFT: { label: 'Craft', sub: 'Coding, system design & architecture', color: '#5B6C8F', icon: 'code-slash' },
};

/** The tint a stat's own colour makes when it fills a chip or a bar's track. */
export const STAT_TINT = 0.14;

/** '#RRGGBB' + alpha -> 'rgba(...)', for soft tint fills. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Motion, from the handoff sheet. Nothing bounces, nothing pulses to demand
 * attention, and nothing animates on a schedule you didn't start.
 */
export const motion = {
  /** XP and stat bars. */
  bar: 500,
  /** A completion circle filling. */
  fill: 350,
  /** A toast arriving. */
  toastIn: 280,
  /** How long an undo stays offered. */
  undoWindow: 4500,
  /** A burst of poppers, start to gone. */
  poppers: 1300,
  /** Bottom sheets and System notices. */
  sheet: 300,
  notice: 340,
  /** The tab pill. */
  pill: { stiffness: 280, damping: 26, mass: 1 },
  /** The one shared easing curve. */
  easing: [0.2, 0.8, 0.2, 1] as const,
};
