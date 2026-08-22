import { useWindowDimensions } from 'react-native';

/**
 * The backend serves the web build itself, so there is a desktop Arise whether it
 * was asked for or not. Past this width the five destinations become a left rail
 * that's always visible, and the single phone column unstacks into two.
 *
 * One breakpoint, not a scale: below it the app is exactly the phone.
 */
export const WIDE_AT = 900;

/** How much room the rail takes out of the page when it's showing. */
export const RAIL_WIDTH = 236;

export function useWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_AT;
}
