import { Platform, Share } from 'react-native';

/** How handing text off went, so the button can say so. */
export type CopyResult = 'copied' | 'shared' | 'dismissed' | 'failed';

/**
 * Put text where the hunter can paste it. On the web (the home-screen app) that's
 * the clipboard; natively there's no clipboard module installed, so it's the share
 * sheet — which offers Copy itself, and can send straight to a chat app.
 *
 * The web falls back to the share sheet too when the clipboard refuses (it needs a
 * secure origin and a recent tap), rather than failing a tap that could still work.
 */
export async function copyOut(text: string, title?: string): Promise<CopyResult> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      // fall through to the share sheet
    }
  }
  try {
    const r = await Share.share({ message: text, title });
    return r.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch {
    return 'failed';
  }
}
