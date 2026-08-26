import { StyleSheet, View } from 'react-native';

import type { ApiPlate } from '@/lib/api';
import { PORTION, portionDots, type PortionKey } from '@/lib/plate';
import { clay, radius, sage, surface } from '@/theme';

/** Sage is what the day is asking for; clay is what it's only counting. Kept here
 * rather than in lib/plate so the vocabulary stays free of the theme. */
export const PORTION_COLOR: Record<PortionKey, string> = {
  protein: sage[600],
  veg: sage[600],
  carb: clay[500],
  extra: clay[500],
};

/**
 * One row's portions as filled and hollow discs — filled for what's on the plate,
 * hollow for what the day is still asking for.
 *
 * Past a ceiling (starch, extras) the surplus discs deepen rather than turning red:
 * the log is meant to inform, and a red dot on a plate of rice is a verdict.
 */
export function PortionRow({ unit, count, target }: { unit: PortionKey; count: number; target: number }) {
  const ceiling = PORTION[unit].ceiling;
  // Hollow discs stand for what's still being asked; a ceiling asks for nothing, so
  // it shows one spare only while there's still room under the mark.
  const shown = Math.max(count, ceiling ? Math.min(target, count + 1) : target);
  return (
    <View style={styles.dots}>
      {Array.from({ length: shown }, (_, i) => {
        if (i >= count) return <View key={i} style={[styles.dot, styles.empty]} />;
        const over = ceiling && i >= target;
        return (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: over ? clay[700] : PORTION_COLOR[unit] }]}
          />
        );
      })}
    </View>
  );
}

/** The same portions, shrunk to sit beside a meal on the timeline or inside a chip. */
export function PlateDots({ plate, size = 9 }: { plate: ApiPlate; size?: number }) {
  const dots = portionDots(plate);
  return (
    <View style={styles.mini}>
      {dots.map((unit, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: radius.pill,
            backgroundColor: PORTION_COLOR[unit],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 22 rather than the sheet's 26: a protein target of five or six palms has to
  // fit beside its label on a 375pt phone without pushing the label into a wrap.
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 22, height: 22, borderRadius: radius.pill },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: surface.edge },
  mini: { flexDirection: 'row', gap: 4, alignItems: 'center' },
});
