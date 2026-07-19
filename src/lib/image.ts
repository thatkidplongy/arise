import { Platform } from 'react-native';

/**
 * Turn a picked image into a bounded JPEG data URI.
 *
 * On web the picker ignores `quality`/`allowsEditing` and hands back the full-
 * resolution photo (often several MB) as a blob/data URL — which overruns upload
 * limits and sometimes never yields a base64 field at all. So on web we draw it
 * to a canvas at a capped size and re-encode. On native we trust the picker's own
 * base64 + quality. Returns null if the image can't be read.
 */
export async function toBoundedDataUri(
  asset: { uri: string; base64?: string | null; mimeType?: string | null },
  max = 512,
  quality = 0.8,
): Promise<string | null> {
  if (Platform.OS === 'web') return webDownscale(asset.uri, max, quality);

  let b64 = asset.base64 ?? null;
  let mime = asset.mimeType ?? 'image/jpeg';
  if (!b64 && asset.uri?.startsWith('data:')) {
    const m = asset.uri.match(/^data:(.*?);base64,(.*)$/);
    if (m) {
      mime = m[1];
      b64 = m[2];
    }
  }
  return b64 ? `data:${mime};base64,${b64}` : null;
}

/** Split a data URI into { base64, mime } for APIs that take them separately. */
export function splitDataUri(dataUri: string): { base64: string; mime: string } {
  const m = dataUri.match(/^data:(.*?);base64,(.*)$/);
  return m ? { mime: m[1], base64: m[2] } : { mime: 'image/jpeg', base64: '' };
}

function webDownscale(src: string, max: number, quality: number): Promise<string | null> {
  return new Promise((resolve) => {
    const g: any = globalThis;
    if (!g.document?.createElement) {
      resolve(null);
      return;
    }
    const img = new g.Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height, 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = g.document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(null); // tainted canvas / unsupported — fail soft
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
