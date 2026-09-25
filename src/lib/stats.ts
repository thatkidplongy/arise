import type { StatKey } from '@/types';

/** Whether an attribute is shown. Craft steps out everywhere while the server has it
 * parked (`state.craft_parked`): none of its quests are dealt, so its level, focuses
 * and a priority for it would all be about nothing. Hidden, not dropped — its data
 * stays, and it comes back the moment Craft is dealt again. */
export function isStatShown(key: StatKey, craftParked: boolean): boolean {
  return !(key === 'CFT' && craftParked);
}
