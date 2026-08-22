#!/usr/bin/env bash
# Build the static web app and make it installable to an iOS/Android home screen.
# Run from the repo root:  ./scripts/build-web.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Where the build lands. Defaults to dist/ — the directory the backend serves —
# so running this by hand behaves exactly as it always has. scripts/deploy.sh
# overrides it to build somewhere else and swap the finished build into place,
# rather than overwriting dist/ file-by-file while the phone is being served it.
OUT="${ARISE_WEB_OUT:-dist}"

echo "▸ Exporting web build…"
npx expo export --platform web --output-dir "$OUT"

echo "▸ Generating home-screen icon…"
# 180x180 is the size iOS uses for apple-touch-icon.
sips -z 180 180 assets/images/icon.png --out "$OUT/apple-touch-icon.png" >/dev/null

echo "▸ Injecting PWA meta tags…"
OUT="$OUT" python3 - <<'PY'
import os, pathlib, re

# No focus ring at all. The browser's own is a skyblue box belonging to no part of
# this palette, and a tinted replacement was no better — a second rectangle outside
# the field's own border reads as a rendering fault rather than a state.
#
# This does drop the visible focus indicator a keyboard user relies on (WCAG 2.4.7).
# Deliberate, and defensible for this app specifically: it's a phone PWA, driven by
# touch, with no keyboard path anyone uses. If a desktop layout ever matters, the
# honest fix is styling the field's *own* border on focus rather than restoring a
# ring outside it.
FOCUS_CSS = """
<style>
input,textarea,select,[contenteditable]{outline:none}
input:focus,textarea:focus,select:focus,[contenteditable]:focus,
input:focus-visible,textarea:focus-visible,select:focus-visible,[contenteditable]:focus-visible{
outline:none;box-shadow:none}
</style>
"""

META = """
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="default"/>
<meta name="apple-mobile-web-app-title" content="Arise"/>
<meta name="theme-color" content="#F5EAD8"/>
<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
"""

# maximum-scale=1 + user-scalable=no stop iOS Safari from auto-zooming into any
# input/button whose font is under 16px (our compact fields). We deliberately do
# NOT set viewport-fit=cover — it extends the page under the home indicator and
# exposes the white document background below the tab bar.
VIEWPORT = ('<meta name="viewport" content="width=device-width, initial-scale=1, '
            'maximum-scale=1, user-scalable=no"/>')

for html in pathlib.Path(os.environ["OUT"]).glob("**/*.html"):
    text = html.read_text()
    if re.search(r'<meta[^>]*name="viewport"[^>]*/?>', text):
        text = re.sub(r'<meta[^>]*name="viewport"[^>]*/?>', VIEWPORT, text, count=1)
    elif re.search(r"<head[^>]*>", text):
        text = re.sub(r"(<head[^>]*>)", r"\1" + VIEWPORT, text, count=1)
    if "apple-mobile-web-app-capable" not in text:
        text = re.sub(r"(<head[^>]*>)", r"\1" + META, text, count=1)
    if "focus-visible" not in text:  # our block names it; Expo's shell never does
        text = re.sub(r"(<head[^>]*>)", r"\1" + FOCUS_CSS, text, count=1)
    html.write_text(text)
PY

echo "✔ Web app built to $OUT/ (installable). The always-on backend serves it."
