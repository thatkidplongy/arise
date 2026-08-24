import { Redirect, useLocalSearchParams } from 'expo-router';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { RecallSession } from '@/components/Recall/RecallSession';
import { Screen } from '@/components/Screen';
import { useRecallCards } from '@/hooks/useRecallCards';
import { useSystem } from '@/store/useSystem';

/**
 * One sitting with one stack — the standalone room the Learn shelf opens into.
 * `pile` names the stack (a material, or ALL_PILE for the deliberate mix); the
 * session owns the whole screen, so a card is faced without a feed around it.
 */
export default function RecallScreen() {
  const state = useSystem((s) => s.state);
  const { items, dueIds, state: deck } = useRecallCards();
  const params = useLocalSearchParams<{ pile?: string }>();

  // A bare /recall names no stack — that choice belongs to the shelf on Learn.
  if (!params.pile) return <Redirect href="/learn" />;

  if (!state) {
    return (
      <Screen>
        <ConnectionPanel />
      </Screen>
    );
  }

  return (
    <Screen>
      <RecallSession items={items} state={deck} pile={params.pile} dueIds={dueIds} />
    </Screen>
  );
}
